import { randomInt } from 'node:crypto'
import { lookup } from 'node:dns/promises'
import { createSocket } from 'node:dgram'
import { connect as netConnect, isIPv4, isIPv6 } from 'node:net'
import { connect as tlsConnect } from 'node:tls'
import { decode, encode, RECURSION_DESIRED } from 'dns-packet'
import type { Answer, DecodedPacket, RecordType } from 'dns-packet'

import type { Mapping } from '../../shared/document/index.ts'
import { LEGEND } from '../legend.ts'
import { tlsOptionsFor } from '../tls-options.ts'
import { parseDuration } from './http.ts'
import type { CheckReport } from './http.ts'

const DEFAULT_TIMEOUT_MS = 120_000
const TYPES = ['A', 'AAAA', 'CNAME', 'MX', 'NS', 'PTR', 'SOA', 'SRV', 'TXT', 'CAA', 'ANY'] as const
type QueryType = (typeof TYPES)[number]

type Transport = 'udp' | 'tcp' | 'dot'

interface Server {
  readonly host: string
  readonly port: number
}

/** One DNS query over UDP, TCP or TLS, with the answer summarised in the text (`D-54`, `D-55`). */
export async function runDnsCheck(
  module: Mapping,
  target: string,
  debug: boolean,
  queryName?: string,
): Promise<CheckReport> {
  const started = performance.now()
  const deadline = started + parseDuration(str(module['timeout']), DEFAULT_TIMEOUT_MS)
  const dns = mapping(module['dns']) ?? {}
  const name = (queryName?.trim() ?? '') || (str(dns['query_name'])?.trim() ?? '')
  const type = (str(dns['query_type']) ?? 'A').toUpperCase()
  const queryClass = (str(dns['query_class']) ?? 'IN').toUpperCase()
  const transport = (str(dns['transport_protocol']) ?? 'udp').toLowerCase()
  const overTls = bool(dns['dns_over_tls'], false)
  const recursion = bool(dns['recursion_desired'], true)
  const tlsConfig = mapping(dns['tls_config']) ?? {}
  const debugLines: string[] = []
  let answer: string[] = []
  let error: string | null = null

  try {
    if (name === '') throw new Error('The DNS query name is not defined')
    if (queryClass !== 'IN') throw new Error(`The DNS class ${queryClass} is not supported`)
    if (!isRecordType(type)) throw new Error(`The DNS query type ${type} is not supported`)
    if (transport !== 'udp' && transport !== 'tcp') throw new Error(`The DNS transport ${transport} is not supported`)

    const kind: Transport = overTls ? 'dot' : transport === 'tcp' ? 'tcp' : 'udp'
    const server = parseServer(target, overTls ? 853 : 53)
    const id = randomInt(0, 0x1_0000)
    const query = encodeQuery(name, type, recursion, id)
    debugLines.push(`# debug: DNS ${name} ${type} ${kind} @ ${server.host}:${server.port}`)

    let decoded = decodeReply(await exchange(kind, server, query, remaining(deadline), tlsConfig), id)
    if (kind === 'udp' && decoded.flag_tc) {
      debugLines.push('# debug: DNS truncated answer, retrying over TCP')
      decoded = decodeReply(await exchange('tcp', server, query, remaining(deadline), tlsConfig), id)
    }

    const rcode = decoded.rcode ?? 'UNKNOWN'
    const accepted = validRcodes(dns['valid_rcodes'])
    if (!accepted.includes(rcode)) {
      throw new Error(`The DNS response code ${rcode} is not accepted by the module`)
    }
    answer = renderAnswers(decoded.answers ?? [])
    debugLines.push(`# debug: DNS ${rcode} ${answer.length} answer(s)`)
  } catch (caught) {
    error = caught instanceof Error ? caught.message : String(caught)
  }

  const durationMs = Math.round(performance.now() - started)
  const success = error === null
  const lines = [
    ...LEGEND,
    `probe_success ${success ? 1 : 0}`,
    `probe_duration_seconds ${(durationMs / 1000).toFixed(6)}`,
    `probe_dns_lookup_time_seconds ${(durationMs / 1000).toFixed(6)}`,
    ...(error === null ? [`# answer ${type} ${answer.join(' ')}`] : [`# ${error}`]),
    ...(debug ? debugLines : []),
    '',
  ]

  return { text: lines.join('\n'), success, status: null, durationMs }
}

function remaining(deadline: number): number {
  return deadline - performance.now()
}

/**
 * The query on the wire. `ANY` is written as the type code 255 because
 * `dns-packet` exposes it as a class, not as a record type (`D-54`).
 */
function encodeQuery(name: string, type: string, recursion: boolean, id: number): Buffer {
  const encoded = encode({
    type: 'query',
    id,
    flags: recursion ? RECURSION_DESIRED : 0,
    questions: [{ type: (type === 'ANY' ? 'A' : type) as RecordType, name, class: 'IN' }],
  })
  if (type === 'ANY') encoded.writeUInt16BE(255, encoded.length - 4)
  return encoded
}

async function exchange(
  kind: Transport,
  server: Server,
  query: Buffer,
  budget: number,
  tlsConfig: Mapping,
): Promise<Buffer> {
  if (budget <= 0) throw new Error('The DNS query timed out')
  const address = await resolveServer(server.host)
  if (kind === 'udp') return await udpExchange(address, server.port, query, budget)
  return await streamExchange(kind, address.address, server.port, server.host, query, budget, tlsConfig)
}

async function resolveServer(host: string): Promise<{ readonly address: string; readonly family: 4 | 6 }> {
  if (isIPv6(host)) return { address: host, family: 6 }
  if (isIPv4(host)) return { address: host, family: 4 }
  const found = await lookup(host, { verbatim: true })
  return { address: found.address, family: found.family === 6 ? 6 : 4 }
}

function udpExchange(
  server: { readonly address: string; readonly family: 4 | 6 },
  port: number,
  query: Buffer,
  budget: number,
): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const socket = createSocket(server.family === 6 ? 'udp6' : 'udp4')
    let done = false
    const finish = (error: Error | null, data?: Buffer) => {
      if (done) return
      done = true
      clearTimeout(timer)
      try {
        socket.close()
      } catch {
        // The socket may have failed before it bound.
      }
      if (error === null && data !== undefined) resolve(data)
      else reject(error ?? new Error('The DNS query failed'))
    }
    const timer = setTimeout(() => finish(new Error('The DNS query timed out')), budget)
    socket.once('error', (caught) => finish(caught))
    socket.once('message', (message) => finish(null, message))
    socket.send(query, port, server.address, (caught) => {
      if (caught) finish(caught)
    })
  })
}

async function streamExchange(
  kind: 'tcp' | 'dot',
  address: string,
  port: number,
  host: string,
  query: Buffer,
  budget: number,
  tlsConfig: Mapping,
): Promise<Buffer> {
  const options = { host: address, port }
  const socket =
    kind === 'dot' ? tlsConnect({ ...options, ...(await tlsOptionsFor(host, tlsConfig)) }) : netConnect(options)
  return await new Promise<Buffer>((resolve, reject) => {
    let done = false
    let frame = Buffer.alloc(0)
    const finish = (error: Error | null, data?: Buffer) => {
      if (done) return
      done = true
      clearTimeout(timer)
      socket.destroy()
      if (error === null && data !== undefined) resolve(data)
      else reject(error ?? new Error('The DNS query failed'))
    }
    const timer = setTimeout(() => finish(new Error('The DNS query timed out')), budget)
    socket.once('error', (caught) => finish(caught))
    socket.once('close', () => finish(new Error('The connection closed before the answer arrived')))
    socket.once(kind === 'dot' ? 'secureConnect' : 'connect', () => {
      const length = Buffer.from([(query.length >> 8) & 0xff, query.length & 0xff])
      socket.write(Buffer.concat([length, query]))
    })
    socket.on('data', (chunk: Buffer) => {
      frame = Buffer.concat([frame, chunk])
      if (frame.length < 2) return
      const length = frame.readUInt16BE(0)
      if (length === 0) {
        finish(new Error('The DNS answer is empty'))
        return
      }
      if (frame.length < length + 2) return
      finish(null, frame.subarray(2, length + 2))
    })
  })
}

function decodeReply(buffer: Buffer, id: number): DecodedPacket & { readonly rcode?: string } {
  const decoded = decode(buffer) as DecodedPacket & { readonly rcode?: string }
  if (decoded.id !== id) throw new Error('The DNS response does not match the query')
  return decoded
}

function renderAnswers(answers: readonly Answer[]): string[] {
  const rendered: string[] = []
  for (const answer of answers) {
    const data: unknown = (answer as { readonly data?: unknown }).data
    switch (answer.type) {
      case 'A':
      case 'AAAA':
      case 'CNAME':
      case 'NS':
      case 'PTR':
        if (typeof data === 'string') rendered.push(data)
        break
      case 'MX': {
        const record = data as { readonly preference?: number; readonly exchange?: string }
        rendered.push(`${record.preference ?? 0} ${record.exchange ?? ''}`.trim())
        break
      }
      case 'SOA': {
        const record = data as {
          readonly mname?: string
          readonly rname?: string
          readonly serial?: number
          readonly refresh?: number
          readonly retry?: number
          readonly expire?: number
          readonly minimum?: number
        }
        rendered.push(
          [record.mname, record.rname, record.serial, record.refresh, record.retry, record.expire, record.minimum].join(
            ' ',
          ),
        )
        break
      }
      case 'SRV': {
        const record = data as {
          readonly priority?: number
          readonly weight?: number
          readonly port?: number
          readonly target?: string
        }
        rendered.push(`${record.priority ?? 0} ${record.weight ?? 0} ${record.port ?? 0} ${record.target ?? ''}`.trim())
        break
      }
      case 'TXT':
        if (Array.isArray(data)) {
          rendered.push(data.map((part) => (Buffer.isBuffer(part) ? part.toString('utf8') : String(part))).join(''))
        }
        break
      case 'CAA': {
        const record = data as { readonly flags?: number; readonly value?: string; readonly issue?: string }
        rendered.push(`${record.flags ?? 0} ${record.value ?? record.issue ?? ''}`.trim())
        break
      }
      default:
        rendered.push(typeof data === 'string' ? data : JSON.stringify(answer))
        break
    }
  }
  return rendered
}

function parseServer(target: string, defaultPort: number): Server {
  const value = target.trim()
  if (value === '') throw new Error('The target is empty')
  if (value.startsWith('[')) {
    const end = value.indexOf(']')
    if (end === -1) throw new Error('The target is not a valid address')
    const host = value.slice(1, end)
    const rest = value.slice(end + 1)
    const port = rest.startsWith(':') ? Number(rest.slice(1)) : defaultPort
    return checked(host, port)
  }
  const colons = value.split(':').length - 1
  if (colons === 1) {
    const [host, port] = value.split(':')
    return checked(host ?? '', Number(port))
  }
  return checked(value, defaultPort)
}

function checked(host: string, port: number): Server {
  if (host === '' || !Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('The target must be a resolver host and a port')
  }
  return { host, port }
}

function isRecordType(value: string): value is QueryType {
  return (TYPES as readonly string[]).includes(value)
}

function validRcodes(value: unknown): string[] {
  const list = strings(value).map((item) => item.toUpperCase())
  return list.length > 0 ? list : ['NOERROR']
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
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
