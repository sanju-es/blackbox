import { lookup } from 'node:dns/promises'
import { connect as netConnect } from 'node:net'
import type { Socket } from 'node:net'
import { connect as tlsConnect } from 'node:tls'
import type { TLSSocket } from 'node:tls'

import type { Mapping } from '../../shared/document/index.ts'
import { LEGEND } from '../legend.ts'
import { tlsOptionsFor } from '../tls-options.ts'
import { parseDuration } from './http.ts'
import type { CheckReport } from './http.ts'

const DEFAULT_TIMEOUT_MS = 120_000
const MAX_BUFFER = 1024 * 1024

interface TlsFacts {
  readonly version: string
  readonly cipher: string
  readonly earliestExpiry: number | null
}

interface Step {
  readonly matcher: ((data: Buffer) => boolean) | null
  readonly send: Buffer | null
  readonly starttls: boolean
  readonly description: string
}

/** One TCP connection, optionally followed by `query_response` steps and TLS (`D-51`, `D-57`). */
export async function runTcpCheck(module: Mapping, target: string, debug: boolean): Promise<CheckReport> {
  const started = performance.now()
  const tcp = mapping(module['tcp']) ?? {}
  const timeout = parseDuration(str(module['timeout']), DEFAULT_TIMEOUT_MS)
  const deadline = started + timeout
  const debugLines: string[] = []
  let address: string | null = null
  let family: number | null = null
  let tls: TlsFacts | null = null
  let error: string | null = null
  let failedRegex = false
  let socket: Socket | TLSSocket | null = null
  let steps: Step[] = []

  try {
    const parsed = parseTarget(target)
    steps = parseSteps(tcp['query_response'])
    const resolved = await resolveHost(parsed.host, tcp)
    address = resolved.address
    family = resolved.family
    debugLines.push(`# debug: TCP ${parsed.host}:${parsed.port} -> ${address} (IPv${family})`)

    socket = await connectSocket(parsed.host, parsed.port, resolved.address, tcp, timeout)
    if (bool(tcp['tls'], false)) {
      tls = tlsFacts(socket as TLSSocket)
      debugLines.push(`# debug: TLS ${tls.version} ${tls.cipher}`)
    }

    if (steps.length > 0) {
      const outcome = await runSteps(socket, steps, parsed.host, tcp, deadline, debugLines)
      socket = outcome.socket
      if (outcome.upgraded) {
        tls = tlsFacts(socket as TLSSocket)
        debugLines.push(`# debug: TLS ${tls.version} ${tls.cipher} after starttls`)
      }
    }
  } catch (caught) {
    error = caught instanceof Error ? caught.message : String(caught)
    failedRegex = caught instanceof StepError
  } finally {
    socket?.destroy()
  }

  const durationMs = Math.round(performance.now() - started)
  const success = error === null
  const lines = [
    ...LEGEND,
    `probe_success ${success ? 1 : 0}`,
    `probe_duration_seconds ${(durationMs / 1000).toFixed(6)}`,
    ...(address === null || family === null
      ? []
      : [
          '# HELP probe_ip_protocol Specifies whether probe ip protocol is IP4 or IP6',
          '# TYPE probe_ip_protocol gauge',
          `probe_ip_protocol ${family}`,
          '# HELP probe_ip_addr_hash Specifies the hash of IP address.',
          '# TYPE probe_ip_addr_hash gauge',
          `probe_ip_addr_hash ${fnv1a(address)}`,
        ]),
    ...(tls === null
      ? []
      : [
          '# HELP probe_tls_version_info Contains the TLS version used',
          '# TYPE probe_tls_version_info gauge',
          `probe_tls_version_info{version="${tls.version}"} 1`,
          '# HELP probe_tls_cipher_info Contains the TLS cipher used',
          '# TYPE probe_tls_cipher_info gauge',
          `probe_tls_cipher_info{cipher="${tls.cipher}"} 1`,
          ...(tls.earliestExpiry === null
            ? []
            : [
                '# HELP probe_ssl_earliest_cert_expiry Returns earliest SSL cert expiry in unixtime',
                '# TYPE probe_ssl_earliest_cert_expiry gauge',
                `probe_ssl_earliest_cert_expiry ${tls.earliestExpiry}`,
                '# HELP probe_ssl_last_chain_expiry_timestamp_seconds Returns last SSL chain expiry in timestamp',
                '# TYPE probe_ssl_last_chain_expiry_timestamp_seconds gauge',
                `probe_ssl_last_chain_expiry_timestamp_seconds ${tls.earliestExpiry}`,
              ]),
        ]),
    ...(steps.length === 0
      ? []
      : [
          '# HELP probe_failed_due_to_regex Indicates if probe failed due to regex',
          '# TYPE probe_failed_due_to_regex gauge',
          `probe_failed_due_to_regex ${failedRegex ? 1 : 0}`,
        ]),
    ...(error === null ? [] : [`# ${error}`]),
    ...(debug ? debugLines : []),
    '',
  ]

  return { text: lines.join('\n'), success, status: null, durationMs }
}

class StepError extends Error {}

function parseSteps(value: unknown): Step[] {
  if (!Array.isArray(value)) return []
  return value.map((item, index) => {
    const step = mapping(item) ?? {}
    const pattern = str(step['expect'])
    const bytes = str(step['expect_bytes'])
    const send = str(step['send'])
    return {
      matcher: matcher(pattern, bytes, index),
      send: send === undefined || send === '' ? null : decodeSend(send),
      starttls: step['starttls'] === true,
      description:
        pattern !== undefined ? `expect ${pattern}` : bytes !== undefined ? `expect_bytes ${bytes}` : 'no matcher',
    }
  })
}

function matcher(
  pattern: string | undefined,
  bytes: string | undefined,
  index: number,
): ((data: Buffer) => boolean) | null {
  if (pattern !== undefined && pattern !== '') {
    let expression: RegExp
    try {
      expression = new RegExp(pattern)
    } catch {
      throw new Error(`The regular expression of step ${index + 1} is not valid`)
    }
    return (data) => expression.test(data.toString('utf8'))
  }
  if (bytes !== undefined && bytes !== '') {
    const expected = Buffer.from(bytes, 'hex')
    if (bytes.length % 2 !== 0 || expected.length * 2 !== bytes.length) {
      throw new Error(`expect_bytes of step ${index + 1} is not a hex string`)
    }
    return (data) => data.includes(expected)
  }
  return null
}

function decodeSend(value: string): Buffer {
  return Buffer.from(
    value.replace(/\\(r|n|t|\\)/g, (_match, letter: string) => {
      if (letter === 'r') return '\r'
      if (letter === 'n') return '\n'
      if (letter === 't') return '\t'
      return '\\'
    }),
  )
}

interface Reader {
  reset: () => void
  until: (matcher: (data: Buffer) => boolean, deadline: number) => Promise<Buffer>
  detach: () => void
}

function oneReader(socket: Socket | TLSSocket): Reader {
  let buffer = Buffer.alloc(0)
  let closed = false
  let overflow = false
  let wake: (() => void) | null = null

  const onData = (chunk: Buffer) => {
    if (buffer.length + chunk.length > MAX_BUFFER) {
      overflow = true
    } else {
      buffer = Buffer.concat([buffer, chunk])
    }
    wake?.()
  }
  const onClose = () => {
    closed = true
    wake?.()
  }

  socket.on('data', onData)
  socket.on('close', onClose)
  socket.on('error', onClose)

  const next = async (timeoutMs: number) => {
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        wake = null
        resolve()
      }, timeoutMs)
      wake = () => {
        clearTimeout(timer)
        wake = null
        resolve()
      }
    })
  }

  return {
    reset: () => {
      buffer = Buffer.alloc(0)
    },
    until: async (matches, deadline) => {
      for (;;) {
        if (matches(buffer)) return buffer
        if (overflow) throw new Error('The response exceeded 1 MiB')
        if (closed) throw new StepError('The connection closed before the expected data arrived')
        const left = deadline - performance.now()
        if (left <= 0) throw new StepError('The step timed out before the expected data arrived')
        await next(left)
      }
    },
    detach: () => {
      socket.removeListener('data', onData)
      socket.removeListener('close', onClose)
      socket.removeListener('error', onClose)
    },
  }
}

async function runSteps(
  initial: Socket | TLSSocket,
  steps: readonly Step[],
  host: string,
  tcp: Mapping,
  deadline: number,
  debugLines: string[],
): Promise<{ readonly socket: Socket | TLSSocket; readonly upgraded: boolean }> {
  let socket: Socket | TLSSocket = initial
  let reader = oneReader(socket)
  let upgraded = false

  for (const [index, step] of steps.entries()) {
    reader.reset()
    if (step.send !== null) socket.write(step.send)
    if (step.starttls && isTls(socket)) {
      debugLines.push(`# debug: step ${index + 1} skips starttls: tls is already on`)
    } else if (step.starttls) {
      reader.detach()
      socket = await upgrade(socket, host, tcp, deadline)
      reader = oneReader(socket)
      upgraded = true
    }
    if (step.matcher !== null) {
      const data = await settled(reader.until(step.matcher, deadline), index, step)
      debugLines.push(`# debug: step ${index + 1} matched ${step.description} (${data.length} bytes)`)
    } else {
      debugLines.push(`# debug: step ${index + 1} sent, no matcher`)
    }
  }

  return { socket, upgraded }
}

/** Names the step in the failure the caller reports (`D-57`). */
async function settled(pending: Promise<Buffer>, index: number, step: Step): Promise<Buffer> {
  try {
    return await pending
  } catch (caught) {
    if (caught instanceof StepError) {
      throw new StepError(`Step ${index + 1} (${step.description}) failed: ${caught.message}`)
    }
    throw caught
  }
}

function isTls(socket: Socket | TLSSocket): boolean {
  return typeof (socket as TLSSocket).getProtocol === 'function'
}

async function upgrade(socket: Socket | TLSSocket, host: string, tcp: Mapping, deadline: number): Promise<TLSSocket> {
  const tlsConfig = mapping(tcp['tls_config']) ?? {}
  const options = await tlsOptionsFor(host, tlsConfig)
  const secure = tlsConnect({ ...options, socket })
  return await new Promise<TLSSocket>((resolve, reject) => {
    const left = deadline - performance.now()
    const timer = setTimeout(
      () => {
        secure.destroy()
        reject(new StepError('The TLS upgrade timed out'))
      },
      Math.max(1, left),
    )
    secure.once('secureConnect', () => {
      clearTimeout(timer)
      resolve(secure)
    })
    secure.once('error', (caught) => {
      clearTimeout(timer)
      reject(caught)
    })
  })
}

function parseTarget(target: string): { readonly host: string; readonly port: number } {
  const value = target.trim()
  if (value === '') throw new Error('The target is empty')
  const url = new URL(`tcp://${value}`)
  const port = Number(url.port)
  if (url.hostname === '' || !Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('The target must be a host and a port')
  }
  return { host: url.hostname.replace(/^\[|\]$/g, ''), port }
}

async function resolveHost(host: string, tcp: Mapping): Promise<{ readonly address: string; readonly family: number }> {
  const preferred = str(tcp['preferred_ip_protocol'])
  const fallback = bool(tcp['ip_protocol_fallback'], true)
  const family = preferred === 'ip4' ? 4 : preferred === 'ip6' ? 6 : 0
  const addresses = await lookup(host, { all: true, verbatim: true, ...(family === 0 ? {} : { family }) })
  const selected = addresses[0]
  if (selected === undefined) throw new Error('The target did not resolve')
  if (preferred !== undefined && selected.family !== family && !fallback) {
    throw new Error(`The target has no IPv${family === 4 ? '4' : '6'} address`)
  }
  return { address: selected.address, family: selected.family }
}

async function connectSocket(
  host: string,
  port: number,
  address: string,
  tcp: Mapping,
  timeout: number,
): Promise<Socket | TLSSocket> {
  const options = {
    host: address,
    port,
    localAddress: str(tcp['source_ip_address']),
    timeout,
  }
  if (!bool(tcp['tls'], false)) {
    return await new Promise<Socket>((resolve, reject) => {
      const socket = netConnect(options)
      socket.once('connect', () => resolve(socket))
      socket.once('error', reject)
      socket.once('timeout', () => {
        socket.destroy()
        reject(new Error('The TCP connection timed out'))
      })
    })
  }

  const tlsConfig = mapping(tcp['tls_config']) ?? {}
  const tlsOptions = await tlsOptionsFor(host, tlsConfig)
  return await new Promise<TLSSocket>((resolve, reject) => {
    const socket = tlsConnect({ ...options, ...tlsOptions })
    socket.once('secureConnect', () => resolve(socket))
    socket.once('error', reject)
    socket.once('timeout', () => {
      socket.destroy()
      reject(new Error('The TLS handshake timed out'))
    })
  })
}

function tlsFacts(socket: TLSSocket): TlsFacts {
  const certificate = socket.getPeerCertificate()
  const expiry = certificate.valid_to === undefined ? null : Math.floor(Date.parse(certificate.valid_to) / 1000)
  return {
    version: socket.getProtocol() ?? 'unknown',
    cipher: socket.getCipher().name,
    earliestExpiry: expiry === null || Number.isNaN(expiry) ? null : expiry,
  }
}

function fnv1a(value: string): number {
  let hash = 0x811c9dc5
  for (const byte of Buffer.from(value)) {
    hash ^= byte
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

function mapping(value: unknown): Mapping | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Mapping) : undefined
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}
