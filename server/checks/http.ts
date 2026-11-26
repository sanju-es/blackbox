import { readFile } from 'node:fs/promises'
import { request as httpRequest } from 'node:http'
import type { IncomingHttpHeaders } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { Agent } from 'node:https'
import { createRequire } from 'node:module'
import type { PeerCertificate } from 'node:tls'
import type { TLSSocket } from 'node:tls'

import type { Mapping } from '../../shared/document/index.ts'
import { LEGEND } from '../legend.ts'

interface NtlmResponse {
  readonly statusCode: number
  readonly headers: IncomingHttpHeaders
  readonly body: string | Buffer
}

interface NtlmOptions {
  readonly url: string
  readonly username?: string
  readonly password?: string
  readonly domain?: string
  readonly workstation?: string
  readonly auth_scheme?: string
  readonly headers?: Record<string, string>
  readonly body?: string
  readonly agent?: Agent
  readonly timeout?: number
}

type NtlmMethod = (options: NtlmOptions, callback: (error: Error | null, response: NtlmResponse) => void) => void

interface NtlmModule {
  readonly get: NtlmMethod
  readonly post: NtlmMethod
  readonly put: NtlmMethod
  readonly patch: NtlmMethod
  readonly delete: NtlmMethod
  readonly options: NtlmMethod
}

const require = createRequire(import.meta.url)
// Vendored from httpntlm 1.8.15 with a same-origin guard on the type-3 redirect (`SEC-04`).
const httpntlm = require('../vendor/httpntlm/httpntlm.js') as NtlmModule

const MAX_BODY_BYTES = 1024 * 1024
const MAX_REDIRECTS = 10
const DEFAULT_TIMEOUT_MS = 120_000
const NTLM_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'])
const SENSITIVE_HEADERS = new Set(['authorization', 'cookie', 'proxy-authorization'])

/** The phases blackbox records with `probe_http_duration_seconds`, in milliseconds. */
interface Phases {
  resolve: number
  connect: number
  tls: number
  processing: number
  transfer: number
}

interface Hop {
  readonly status: number
  readonly headers: IncomingHttpHeaders
  readonly body: string
  readonly url: string
  readonly bytes: number
  readonly httpVersion: string
  readonly phases: Phases
  readonly tls: { readonly version: string; readonly cipher: string; readonly earliestExpiry: number | null } | null
  readonly remote: { readonly address: string; readonly family: string } | null
}

export interface CheckReport {
  readonly text: string
  readonly success: boolean
  readonly status: number | null
  readonly durationMs: number
}

/**
 * One HTTP/S check run by this service, with the metrics of the exporter's HTTP
 * prober this engine can measure (`D-34`). `http.ntlm` is our extension.
 */
export async function runHttpCheck(module: Mapping, target: string, debug: boolean): Promise<CheckReport> {
  const started = performance.now()
  const http = mapping(module['http']) ?? {}
  const ntlm = mapping(http['ntlm'])
  const timeout = parseDuration(str(module['timeout']), DEFAULT_TIMEOUT_MS)
  const debugLines: string[] = []
  const configuredScheme = http['scheme'] === 'http' || http['scheme'] === 'https' ? http['scheme'] : undefined
  const defaultScheme = str(module['prober']) === 'https' ? 'https' : 'http'
  const requestTarget = withScheme(target, configuredScheme ?? defaultScheme)
  const url = safeUrl(requestTarget)

  let status: number | null = null
  let headers: IncomingHttpHeaders = {}
  let body = ''
  let bodyBytes = 0
  let httpVersion = ''
  let finalUrl = requestTarget
  let redirects = 0
  let failedRegex = false
  let error: string | null = null
  let phases: Phases | null = { resolve: 0, connect: 0, tls: 0, processing: 0, transfer: 0 }
  let remote: Hop['remote'] = null
  let tls: Hop['tls'] = null
  let agent: Agent | undefined

  try {
    if (url === null) throw new Error('The target is not an absolute URL')
    if (hasInvalidRegexp(http)) throw new Error('A regular expression in the module is not valid')
    const method = (str(http['method']) ?? 'GET').toUpperCase()
    const valid = numbers(http['valid_status_codes'])
    const follow = bool(http['follow_redirects'], true)
    const payload = str(http['body'])
    const requestAgent = await tlsAgent(http)
    agent = requestAgent

    if (ntlm !== undefined) {
      if (!NTLM_METHODS.has(method)) throw new Error(`The NTLM check does not support the ${method} method`)
      const answer = await ntlmRequest(ntlm, http, requestTarget, method, requestAgent, timeout)
      status = answer.status
      headers = answer.headers
      body = answer.body
      bodyBytes = Buffer.byteLength(body)
      phases = null
      debugLines.push(`# debug: NTLM ${method} ${requestTarget} -> ${answer.status} (phases hidden by the handshake)`)
    } else {
      let current = url
      let currentMethod = method
      let currentBody = payload
      let stripSensitive = false
      for (;;) {
        const answer = await requestOnce(
          current,
          currentMethod,
          buildHeaders(http, currentBody, stripSensitive),
          currentBody,
          requestAgent,
          timeout,
        )
        status = answer.status
        headers = answer.headers
        body = answer.body
        bodyBytes += answer.bytes
        httpVersion = answer.httpVersion
        finalUrl = answer.url
        remote = remote ?? answer.remote
        tls = answer.tls ?? tls
        addPhases(phases, answer.phases)
        debugLines.push(
          `# debug: hop ${redirects} ${answer.url} -> ${answer.status} in ${ms(answer.phases)} ms (resolve ${answer.phases.resolve}, connect ${answer.phases.connect}, tls ${answer.phases.tls}, processing ${answer.phases.processing}, transfer ${answer.phases.transfer})`,
        )

        const location = String(headers.location ?? '')
        if (follow && isRedirect(answer.status) && location !== '' && redirects < MAX_REDIRECTS) {
          const next = new URL(location, current)
          if (next.origin !== current.origin) stripSensitive = true
          redirects += 1
          current = next
          if (answer.status === 301 || answer.status === 302 || answer.status === 303) {
            currentMethod = 'GET'
            currentBody = undefined
          }
          continue
        }
        break
      }
      debugLines.push(`# debug: ${method} ${requestTarget} -> ${status} in ${redirects} redirect(s)`)
    }

    const challenge = header(headers, 'www-authenticate')
    if (challenge !== null) debugLines.push(`# debug: WWW-Authenticate: ${challenge}`)
    failedRegex = violatesRegex(http, headers, body)
    if (failedRegex) error = 'A condition of the module did not match'
    const ssl = finalUrl.startsWith('https:')
    if (bool(http['fail_if_ssl'], false) && ssl) error = 'The target uses SSL and the module rejects it'
    if (bool(http['fail_if_not_ssl'], false) && !ssl) error = 'The target does not use SSL and the module requires it'
    if (status !== null && valid !== null && !valid.includes(status)) {
      error = `The target answered ${status}, which the module does not accept`
    }
    if (ntlm !== undefined && status === 401) {
      const scheme = str(ntlm['auth_scheme'])
      error =
        scheme === undefined
          ? 'The target rejected the NTLM and Negotiate handshakes with 401: use the bare user, the domain in its own field, and an account the site authorizes'
          : `The target rejected the ${scheme} handshake with 401: use the bare user, the domain in its own field, and an account the site authorizes`
    }
  } catch (caught) {
    error = caught instanceof Error ? caught.message : String(caught)
  } finally {
    agent?.destroy()
  }

  const durationMs = Math.round(performance.now() - started)
  const success = error === null
  const text = render({
    success,
    durationMs,
    status,
    ssl: finalUrl.startsWith('https:'),
    redirects,
    failedRegex,
    headers,
    bytes: bodyBytes,
    httpVersion,
    phases,
    remote,
    tls,
    error,
    debug,
    debugLines,
  })

  return { text, success, status, durationMs }
}

async function requestOnce(
  url: URL,
  method: string,
  headers: Record<string, string>,
  body: string | undefined,
  agent: Agent,
  timeout: number,
): Promise<Hop> {
  return new Promise((resolve, reject) => {
    const started = performance.now()
    const send = url.protocol === 'https:' ? httpsRequest : httpRequest
    let lookupAt = 0
    let connectAt = 0
    let tlsAt = 0
    let firstByteAt = 0
    let remoteAddress = ''
    let remoteFamily = ''
    let tlsInfo: Hop['tls'] = null
    let bytes = 0

    const request = send(url, { method, headers, agent: url.protocol === 'https:' ? agent : undefined }, (response) => {
      firstByteAt = performance.now()
      const socket = response.socket
      remoteAddress = socket.remoteAddress ?? ''
      remoteFamily = socket.remoteFamily ?? ''
      if (url.protocol === 'https:') tlsInfo = tlsDetails(socket)
      const chunks: Buffer[] = []
      let stored = 0
      response.on('data', (chunk: Buffer) => {
        bytes += chunk.length
        if (stored < MAX_BODY_BYTES) {
          chunks.push(chunk)
          stored += chunk.length
        }
      })
      response.on('end', () => {
        const endAt = performance.now()
        const resolvePhase = lookupAt === 0 ? 0 : lookupAt - started
        const connectStart = lookupAt === 0 ? started : lookupAt
        const connectPhase = connectAt === 0 ? 0 : connectAt - connectStart
        const connectedAt = tlsAt !== 0 ? tlsAt : connectAt !== 0 ? connectAt : lookupAt !== 0 ? lookupAt : started
        const tlsPhase = tlsAt !== 0 && connectAt !== 0 ? tlsAt - connectAt : 0
        resolve({
          status: response.statusCode ?? 0,
          headers: response.headers,
          body: Buffer.concat(chunks).toString('utf8'),
          url: url.toString(),
          bytes,
          httpVersion: response.httpVersion,
          phases: {
            resolve: Math.max(0, resolvePhase),
            connect: Math.max(0, connectPhase),
            tls: Math.max(0, tlsPhase),
            processing: Math.max(0, firstByteAt - connectedAt),
            transfer: Math.max(0, endAt - firstByteAt),
          },
          tls: tlsInfo,
          remote: remoteAddress === '' ? null : { address: remoteAddress, family: remoteFamily },
        })
      })
      response.on('error', reject)
    })

    request.on('socket', (socket) => {
      socket.once('lookup', () => {
        lookupAt = performance.now()
      })
      socket.once('connect', () => {
        connectAt = performance.now()
      })
      if (url.protocol === 'https:') {
        socket.once('secureConnect', () => {
          tlsAt = performance.now()
        })
      }
    })
    request.setTimeout(timeout, () => request.destroy(new Error(`The check exceeded its ${timeout} ms limit`)))
    request.on('error', reject)
    if (body !== undefined) request.write(body)
    request.end()
  })
}

function tlsDetails(socket: unknown): Hop['tls'] {
  const tlsSocket = socket as TLSSocket
  if (typeof tlsSocket.getProtocol !== 'function') return null
  const cipher = tlsSocket.getCipher()
  const certificate = tlsSocket.getPeerCertificate(true)
  const earliestExpiry = earliestCertificateExpiry(certificate)
  return {
    version: tlsVersion(tlsSocket.getProtocol()),
    cipher: cipher?.name ?? 'unknown',
    earliestExpiry,
  }
}

function earliestCertificateExpiry(certificate: PeerCertificate | undefined): number | null {
  if (certificate === undefined) return null
  let earliest: number | null = null
  const seen = new Set<string>()
  let current: PeerCertificate | undefined = certificate
  while (current !== undefined && Object.keys(current).length > 0) {
    const fingerprint = String(current.fingerprint256 ?? '')
    if (fingerprint !== '' && seen.has(fingerprint)) break
    if (fingerprint !== '') seen.add(fingerprint)
    const expiry = Date.parse(String(current.valid_to ?? ''))
    if (!Number.isNaN(expiry) && (earliest === null || expiry < earliest)) earliest = expiry
    current = (current as PeerCertificate & { issuerCertificate?: PeerCertificate }).issuerCertificate
  }
  return earliest === null ? null : Math.round(earliest / 1000)
}

function tlsVersion(protocol: string | null): string {
  switch (protocol) {
    case 'TLSv1':
      return 'TLS 1.0'
    case 'TLSv1.1':
      return 'TLS 1.1'
    case 'TLSv1.2':
      return 'TLS 1.2'
    case 'TLSv1.3':
      return 'TLS 1.3'
    default:
      return 'unknown'
  }
}

async function ntlmRequest(
  ntlm: Mapping,
  http: Mapping,
  target: string,
  method: string,
  agent: Agent,
  timeout: number,
): Promise<{ status: number; headers: IncomingHttpHeaders; body: string }> {
  const explicit = str(ntlm['auth_scheme'])
  if (explicit !== undefined && explicit !== '') {
    return attemptNtlm(explicit, ntlm, http, target, method, agent, timeout)
  }

  // IIS often advertises `Negotiate` first and may reject a plain `NTLM`
  // header; retry with `Negotiate`, which carries the same NTLM tokens.
  try {
    const first = await attemptNtlm('NTLM', ntlm, http, target, method, agent, timeout)
    if (first.status !== 401) return first
    return await attemptNtlm('Negotiate', ntlm, http, target, method, agent, timeout)
  } catch {
    return attemptNtlm('Negotiate', ntlm, http, target, method, agent, timeout)
  }
}

function attemptNtlm(
  scheme: string,
  ntlm: Mapping,
  http: Mapping,
  target: string,
  method: string,
  agent: Agent,
  timeout: number,
): Promise<{ status: number; headers: IncomingHttpHeaders; body: string }> {
  const name = method.toLowerCase()
  const send = {
    get: httpntlm.get,
    post: httpntlm.post,
    put: httpntlm.put,
    patch: httpntlm.patch,
    delete: httpntlm.delete,
    options: httpntlm.options,
  }[name]
  if (send === undefined) throw new Error(`The NTLM check does not support the ${method} method`)

  return new Promise((resolve, reject) => {
    send(
      {
        url: target,
        username: str(ntlm['username']) ?? '',
        password: str(ntlm['password']) ?? '',
        domain: str(ntlm['domain']) ?? '',
        workstation: str(ntlm['workstation']) ?? '',
        auth_scheme: scheme,
        headers: buildHeaders(http, str(http['body'])),
        body: str(http['body']),
        ...(target.startsWith('https:') ? { agent } : {}),
        timeout,
      },
      (error, response) => {
        if (error !== null) {
          reject(error)
          return
        }
        resolve({ status: response.statusCode, headers: response.headers, body: String(response.body) })
      },
    )
  })
}

function buildHeaders(http: Mapping, body: string | undefined, stripSensitive = false): Record<string, string> {
  const headers: Record<string, string> = {}
  const configured = mapping(http['headers'])
  if (configured !== undefined) {
    for (const [name, value] of Object.entries(configured)) {
      if (typeof value === 'string') headers[name] = value
    }
  }
  if (headers['accept-encoding'] === undefined && headers['Accept-Encoding'] === undefined) {
    headers['accept-encoding'] = 'identity'
  }
  const basic = mapping(http['basic_auth'])
  const username = basic === undefined ? undefined : str(basic['username'])
  if (basic !== undefined && username !== undefined) {
    const password = str(basic['password']) ?? ''
    headers.authorization = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`
  }
  if (body !== undefined && headers['content-type'] === undefined && headers['Content-Type'] === undefined) {
    headers['content-type'] = 'text/plain; charset=utf-8'
  }
  if (stripSensitive) {
    for (const name of Object.keys(headers)) {
      if (SENSITIVE_HEADERS.has(name.toLowerCase())) delete headers[name]
    }
  }
  return headers
}

async function tlsAgent(http: Mapping): Promise<Agent> {
  const tls = mapping(http['tls_config']) ?? {}
  const ca = await certificate(str(tls['ca']), str(tls['ca_file']))
  const cert = await certificate(str(tls['cert']), str(tls['cert_file']))
  const key = await certificate(str(tls['key']), str(tls['key_file']))
  return new Agent({
    keepAlive: true,
    maxSockets: 1,
    ca,
    cert,
    key,
    rejectUnauthorized: !bool(tls['insecure_skip_verify'], false),
    servername: str(tls['server_name']),
    minVersion: version(str(tls['min_version'])),
    maxVersion: version(str(tls['max_version'])),
  })
}

async function certificate(inline: string | undefined, file: string | undefined): Promise<string | undefined> {
  if (inline !== undefined) return inline
  if (file === undefined) return undefined
  return readFile(file, 'utf8')
}

function version(value: string | undefined): 'TLSv1' | 'TLSv1.1' | 'TLSv1.2' | 'TLSv1.3' | undefined {
  switch (value) {
    case 'TLS10':
      return 'TLSv1'
    case 'TLS11':
      return 'TLSv1.1'
    case 'TLS12':
      return 'TLSv1.2'
    case 'TLS13':
      return 'TLSv1.3'
    default:
      return undefined
  }
}

function hasInvalidRegexp(http: Mapping): boolean {
  for (const key of ['fail_if_body_matches_regexp', 'fail_if_body_not_matches_regexp']) {
    for (const pattern of list(http[key])) {
      if (!isRegexp(pattern)) return true
    }
  }
  for (const key of ['fail_if_header_matches', 'fail_if_header_not_matches']) {
    for (const rule of mappings(http[key])) {
      const pattern = str(rule['regexp'])
      if (pattern !== undefined && !isRegexp(pattern)) return true
    }
  }
  return false
}

function isRegexp(pattern: string): boolean {
  try {
    new RegExp(pattern)
    return true
  } catch {
    return false
  }
}

function violatesRegex(http: Mapping, headers: IncomingHttpHeaders, body: string): boolean {
  const mustMatch = list(http['fail_if_body_matches_regexp'])
  const mustNotMatch = list(http['fail_if_body_not_matches_regexp'])
  if (mustMatch.some((pattern) => matches(pattern, body))) return true
  if (mustNotMatch.some((pattern) => !matches(pattern, body))) return true

  for (const rule of mappings(http['fail_if_header_matches'])) {
    const name = str(rule['header'])
    const pattern = str(rule['regexp'])
    if (name === undefined || pattern === undefined) continue
    const value = header(headers, name)
    if (value === null && bool(rule['allow_missing'], false)) continue
    if (matches(pattern, value ?? '')) return true
  }

  for (const rule of mappings(http['fail_if_header_not_matches'])) {
    const name = str(rule['header'])
    const pattern = str(rule['regexp'])
    if (name === undefined || pattern === undefined) continue
    const value = header(headers, name)
    if (value === null && bool(rule['allow_missing'], false)) continue
    if (!matches(pattern, value ?? '')) return true
  }

  return false
}

function matches(pattern: string, value: string): boolean {
  try {
    return new RegExp(pattern).test(value)
  } catch {
    return false
  }
}

function render(facts: {
  success: boolean
  durationMs: number
  status: number | null
  ssl: boolean
  redirects: number
  failedRegex: boolean
  headers: IncomingHttpHeaders
  bytes: number
  httpVersion: string
  phases: Phases | null
  remote: Hop['remote']
  tls: Hop['tls']
  error: string | null
  debug: boolean
  debugLines: string[]
}): string {
  const lines = [
    ...LEGEND,
    '# HELP probe_success Displays whether or not the probe was a success',
    '# TYPE probe_success gauge',
    `probe_success ${facts.success ? 1 : 0}`,
    '# HELP probe_duration_seconds Returns how long the probe took to complete in seconds',
    '# TYPE probe_duration_seconds gauge',
    `probe_duration_seconds ${seconds(facts.durationMs)}`,
    '# HELP probe_http_status_code Response HTTP status code',
    '# TYPE probe_http_status_code gauge',
    `probe_http_status_code ${facts.status ?? 0}`,
    '# HELP probe_http_ssl Indicates if SSL was used for the final redirect',
    '# TYPE probe_http_ssl gauge',
    `probe_http_ssl ${facts.ssl ? 1 : 0}`,
    '# HELP probe_http_redirects The number of redirects',
    '# TYPE probe_http_redirects gauge',
    `probe_http_redirects ${facts.redirects}`,
    '# HELP probe_failed_due_to_regex Indicates if probe failed due to regex',
    '# TYPE probe_failed_due_to_regex gauge',
    `probe_failed_due_to_regex ${facts.failedRegex ? 1 : 0}`,
  ]

  const length = header(facts.headers, 'content-length')
  const contentLength = length === null ? -1 : Number(length)
  lines.push(
    '# HELP probe_http_content_length Length of http content response',
    '# TYPE probe_http_content_length gauge',
    `probe_http_content_length ${Number.isFinite(contentLength) ? contentLength : -1}`,
    '# HELP probe_http_uncompressed_body_length Length of uncompressed response body',
    '# TYPE probe_http_uncompressed_body_length gauge',
    `probe_http_uncompressed_body_length ${facts.bytes}`,
  )

  const httpVersion = Number.parseFloat(facts.httpVersion)
  if (Number.isFinite(httpVersion)) {
    lines.push(
      '# HELP probe_http_version Returns the version of HTTP of the probe response',
      '# TYPE probe_http_version gauge',
      `probe_http_version ${httpVersion}`,
    )
  }

  const lastModified = header(facts.headers, 'last-modified')
  if (lastModified !== null) {
    const timestamp = Date.parse(lastModified)
    if (!Number.isNaN(timestamp)) {
      lines.push(
        '# HELP probe_http_last_modified_timestamp_seconds Returns the Last-Modified HTTP response header in unixtime',
        '# TYPE probe_http_last_modified_timestamp_seconds gauge',
        `probe_http_last_modified_timestamp_seconds ${Math.round(timestamp / 1000)}`,
      )
    }
  }

  if (facts.phases !== null) {
    lines.push(
      '# HELP probe_http_duration_seconds Duration of http request by phase, summed over all redirects',
      '# TYPE probe_http_duration_seconds gauge',
      `probe_http_duration_seconds{phase="resolve"} ${seconds(facts.phases.resolve)}`,
      `probe_http_duration_seconds{phase="connect"} ${seconds(facts.phases.connect)}`,
      `probe_http_duration_seconds{phase="tls"} ${seconds(facts.phases.tls)}`,
      `probe_http_duration_seconds{phase="processing"} ${seconds(facts.phases.processing)}`,
      `probe_http_duration_seconds{phase="transfer"} ${seconds(facts.phases.transfer)}`,
      '# HELP probe_dns_lookup_time_seconds Returns the time taken for probe dns lookup in seconds',
      '# TYPE probe_dns_lookup_time_seconds gauge',
      `probe_dns_lookup_time_seconds ${seconds(facts.phases.resolve)}`,
    )
  }

  const ip = facts.remote === null ? null : ipAddress(facts.remote.address)
  if (ip !== null) {
    lines.push(
      '# HELP probe_ip_protocol Specifies whether probe ip protocol is IP4 or IP6',
      '# TYPE probe_ip_protocol gauge',
      `probe_ip_protocol ${ip.version}`,
      '# HELP probe_ip_addr_hash Specifies the hash of IP address. It is useful to detect if the IP address changes.',
      '# TYPE probe_ip_addr_hash gauge',
      `probe_ip_addr_hash ${fnv1a(ip.bytes)}`,
    )
  }

  if (facts.tls !== null) {
    lines.push(
      '# HELP probe_tls_version_info Contains the TLS version used',
      '# TYPE probe_tls_version_info gauge',
      `probe_tls_version_info{version="${facts.tls.version}"} 1`,
      '# HELP probe_tls_cipher_info Contains the TLS cipher used',
      '# TYPE probe_tls_cipher_info gauge',
      `probe_tls_cipher_info{cipher="${facts.tls.cipher}"} 1`,
    )
    if (facts.tls.earliestExpiry !== null) {
      lines.push(
        '# HELP probe_ssl_earliest_cert_expiry Returns earliest SSL cert expiry in unixtime',
        '# TYPE probe_ssl_earliest_cert_expiry gauge',
        `probe_ssl_earliest_cert_expiry ${facts.tls.earliestExpiry}`,
        '# HELP probe_ssl_last_chain_expiry_timestamp_seconds Returns last SSL chain expiry in timestamp',
        '# TYPE probe_ssl_last_chain_expiry_timestamp_seconds gauge',
        `probe_ssl_last_chain_expiry_timestamp_seconds ${facts.tls.earliestExpiry}`,
      )
    }
  }

  if (facts.debug) lines.push(...facts.debugLines)
  if (facts.error !== null) lines.push(`# probe error: ${facts.error.replace(/\s+/g, ' ')}`)

  return `${lines.join('\n')}\n`
}

function addPhases(target: Phases, source: Phases): void {
  target.resolve += source.resolve
  target.connect += source.connect
  target.tls += source.tls
  target.processing += source.processing
  target.transfer += source.transfer
}

function ms(phases: Phases): number {
  return Math.round((phases.resolve + phases.connect + phases.tls + phases.processing + phases.transfer) * 100) / 100
}

function seconds(ms: number): string {
  return (ms / 1000).toFixed(6)
}

function ipAddress(address: string): { bytes: number[]; version: 4 | 6 } | null {
  let value = address
  if (value.startsWith('::ffff:')) value = value.slice(7)
  if (/^\d+\.\d+\.\d+\.\d+$/.test(value)) {
    const parts = value.split('.').map(Number)
    if (parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return null
    return { bytes: parts, version: 4 }
  }

  const zone = value.indexOf('%')
  if (zone !== -1) value = value.slice(0, zone)
  const halves = value.split('::')
  if (halves.length > 2) return null
  const first = halves[0] ?? ''
  const second = halves[1] ?? ''
  const head = first === '' ? [] : first.split(':')
  const tail = halves.length === 2 && second !== '' ? second.split(':') : []
  const missing = 8 - (head.length + tail.length)
  if (halves.length === 1 ? head.length !== 8 : missing < 0) return null
  const groups = [...head, ...Array<string>(halves.length === 1 ? 0 : missing).fill('0'), ...tail]
  const bytes: number[] = []
  for (const group of groups) {
    const parsed = Number.parseInt(group, 16)
    if (!Number.isInteger(parsed) || parsed < 0 || parsed > 0xffff) return null
    bytes.push((parsed >> 8) & 0xff, parsed & 0xff)
  }
  return bytes.length === 16 ? { bytes, version: 6 } : null
}

function fnv1a(bytes: readonly number[]): number {
  let hash = 0x811c9dc5
  for (const byte of bytes) {
    hash ^= byte
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash
}

export function withScheme(target: string, scheme: 'http' | 'https' | undefined): string {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(target) ? target : `${scheme ?? 'http'}://${target}`
}

function safeUrl(target: string): URL | null {
  try {
    return new URL(target)
  } catch {
    return null
  }
}

function isRedirect(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308
}

function header(headers: IncomingHttpHeaders, name: string): string | null {
  const value = headers[name.toLowerCase()]
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

function mapping(value: unknown): Mapping | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Mapping) : undefined
}

function mappings(value: unknown): Mapping[] {
  return Array.isArray(value) ? value.filter((item): item is Mapping => mapping(item) !== undefined) : []
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function list(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function numbers(value: unknown): number[] | null {
  if (!Array.isArray(value)) return null
  const items = value.filter((item): item is number => typeof item === 'number')
  return items.length === 0 ? null : items
}

const DURATION_FACTORS: Record<string, number> = {
  ms: 1,
  s: 1000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
  w: 604_800_000,
  y: 31_536_000_000,
}

export function parseDuration(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback
  const match = /^(\d+(?:\.\d+)?)(ms|s|m|h|d|w|y)$/.exec(value.trim())
  if (match === null) return fallback
  const amount = Number(match[1])
  const factor = DURATION_FACTORS[match[2] ?? '']
  if (factor === undefined) return fallback
  return amount * factor
}
