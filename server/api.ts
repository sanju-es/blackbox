import type { IncomingMessage, ServerResponse } from 'node:http'

import { parseDocument, validateDocument } from '../shared/document/index.ts'
import type { QuickCheckInput } from '../shared/quick.ts'
import { generateToken, presentedToken, readToken, tokenMatches, withToken } from './auth.ts'
import type { TokenState } from './auth.ts'
import type { FileStore, Snapshot } from './config-file.ts'
import type { CheckerDependencies } from './checker.ts'
import { renderHistory } from './legend.ts'
import { renderRoot } from './surface.ts'

export interface ApiDependencies {
  readonly store: FileStore
  readonly checker: CheckerDependencies
}

const MAX_BODY_BYTES = 1024 * 1024
const QUICK_METHODS = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'])

interface WriteBody {
  readonly text: string
  readonly revision: string
}

/**
 * The routes of `api-contract.md` §3 and §4. Every failure answers with a
 * message key, never with a sentence and never with an internal error (`AG-08`).
 *
 * The two text routes live at the root (`/probe`, `/metrics`) and answer
 * `text/plain`; the rest of the surface is JSON. Returns `false` when the
 * request belongs to neither, so the caller can serve the static build.
 */
export async function handleApi(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: ApiDependencies,
): Promise<boolean> {
  const url = new URL(request.url ?? '/', 'http://localhost')
  const method = request.method ?? 'GET'

  if (url.pathname === '/probe') {
    return handleProbeSurface(request, url, method, response, dependencies, {
      requireReadOnly: false,
      requireConfig: false,
      requireTokenOnWritable: true,
      record: true,
      notice: renderRoot(),
    })
  }

  if (url.pathname === '/api/token/regenerate') {
    return regenerateToken(request, response, dependencies)
  }
  if (url.pathname === '/metrics') return handleMetricsSurface(method, response, dependencies)
  if (url.pathname === '/history' || url.pathname === '/history/') {
    return handleHistorySurface(request, url, method, response, dependencies)
  }

  if (!url.pathname.startsWith('/api/')) return false

  if (url.pathname === '/api/probe') {
    return handleProbeSurface(request, url, method, response, dependencies, {
      requireReadOnly: false,
      requireConfig: true,
      record: false,
      allowEmptyTarget: true,
    })
  }

  if (url.pathname === '/api/quick') {
    const mode = await surfaceMode(dependencies.store)
    if (!mode.ok) {
      sendText(response, 500, 'The configuration file could not be read\n', 'service.read-failed')
      return true
    }
    if (mode.readOnly) {
      sendAbsent(response)
      return true
    }
    if (method !== 'POST') {
      sendText(response, 405, 'Method not allowed\n', 'api.method')
      return true
    }
    if (await tokenDenied(request, url, dependencies.store, response, 'text')) return true
    return quickCheck(request, response, dependencies.checker)
  }

  if (url.pathname === '/api/config') {
    if (method !== 'GET' && method !== 'PUT') {
      sendJson(response, 405, { key: 'api.method' })
      return true
    }
    if (await tokenDenied(request, url, dependencies.store, response, 'api')) return true
    if (method === 'GET') return readConfiguration(response, dependencies)
    return writeConfiguration(request, response, dependencies)
  }

  if (url.pathname === '/api/checker/history') {
    if (method !== 'GET') {
      sendText(response, 405, renderRoot(), 'api.method')
      return true
    }
    if (await tokenDenied(request, url, dependencies.store, response, 'text')) return true
    if (!dependencies.checker.historyEnabled) {
      sendText(response, 403, renderRoot(), 'service.history-disabled')
      return true
    }
    sendText(response, 200, renderHistory(dependencies.checker.history.list()), undefined, {
      'content-type': 'text/plain; charset=utf-8',
    })
    return true
  }

  sendJson(response, 404, { key: 'api.not-found' })
  return true
}

/** The read-only surface exists only while the mount holds a file it cannot write. */
export type SurfaceMode = { readonly ok: true; readonly readOnly: boolean } | { readonly ok: false }

export async function fileMode(store: FileStore): Promise<'read-write' | 'read-only' | null> {
  try {
    await store.read()
    return (await store.canWrite()) ? 'read-write' : 'read-only'
  } catch {
    return null
  }
}

export async function surfaceMode(store: FileStore): Promise<SurfaceMode> {
  const mode = await fileMode(store)
  return mode === null ? { ok: false } : { ok: true, readOnly: mode === 'read-only' }
}

/**
 * The optional `service.token` closes the data and check routes. A malformed
 * token fails closed; an absent token leaves the surface open for compatibility.
 */
async function tokenDenied(
  request: IncomingMessage,
  url: URL,
  store: FileStore,
  response: ServerResponse,
  kind: 'api' | 'text',
  deniedText = renderRoot(),
): Promise<boolean> {
  let state: TokenState
  try {
    state = await readToken(store)
  } catch {
    if (kind === 'api') sendJson(response, 500, { key: 'service.read-failed' })
    else sendText(response, 500, 'The configuration file could not be read\n', 'service.read-failed')
    return true
  }

  if (state.kind === 'none') return false
  if (state.kind === 'invalid') {
    if (kind === 'api') sendJson(response, 500, { key: 'service.token-invalid' })
    else sendText(response, 500, 'The service token is not valid\n', 'service.token-invalid')
    return true
  }

  const provided = presentedToken(url, request.headers.authorization, kind === 'text')
  if (provided !== null && tokenMatches(state.token, provided)) return false

  if (kind === 'api') sendJson(response, 403, { key: 'service.token' })
  else sendText(response, 403, deniedText, 'service.token')
  return true
}

async function handleMetricsSurface(
  method: string,
  response: ServerResponse,
  { store, checker }: ApiDependencies,
): Promise<boolean> {
  if (method !== 'GET') {
    sendText(response, 405, renderRoot(), 'api.method')
    return true
  }

  const mode = await surfaceMode(store)
  if (!mode.ok) {
    sendText(response, 500, renderRoot(), 'service.read-failed')
    return true
  }
  if (!checker.metricsEnabled) {
    sendText(response, 404, renderRoot())
    return true
  }

  sendText(response, 200, checker.readMetrics(), undefined, {
    'content-type': 'text/plain; version=0.0.4; charset=utf-8',
  })
  return true
}

async function handleHistorySurface(
  request: IncomingMessage,
  url: URL,
  method: string,
  response: ServerResponse,
  { store, checker }: ApiDependencies,
): Promise<boolean> {
  if (method !== 'GET') {
    sendText(response, 405, renderRoot(), 'api.method')
    return true
  }

  const mode = await surfaceMode(store)
  if (!mode.ok) {
    sendText(response, 500, renderRoot(), 'service.read-failed')
    return true
  }
  if (!mode.readOnly || !checker.historyEnabled) {
    sendText(response, 404, renderRoot())
    return true
  }
  if (await tokenDenied(request, url, store, response, 'text')) return true

  sendText(response, 200, renderHistory(checker.history.list()), undefined, {
    'content-type': 'text/plain; charset=utf-8',
    'cache-control': 'no-store',
  })
  return true
}

async function handleProbeSurface(
  request: IncomingMessage,
  url: URL,
  method: string,
  response: ServerResponse,
  { store, checker }: ApiDependencies,
  options: {
    readonly requireReadOnly: boolean
    readonly requireConfig?: boolean
    readonly requireTokenOnWritable?: boolean
    readonly record: boolean
    readonly allowEmptyTarget?: boolean
    readonly notice?: string
  },
): Promise<boolean> {
  const fail = (status: number, message: string, key?: string) =>
    sendText(response, status, options.notice ?? message, key)

  if (method !== 'GET') {
    fail(405, 'Method not allowed\n', 'api.method')
    return true
  }

  const mode = await surfaceMode(store)
  if (!mode.ok) {
    fail(500, 'The configuration file could not be read\n', 'service.read-failed')
    return true
  }
  if (options.requireReadOnly && !mode.readOnly) {
    if (options.notice === undefined) sendAbsent(response)
    else sendText(response, 404, options.notice)
    return true
  }
  if (options.requireConfig === true && mode.readOnly) {
    if (options.notice === undefined) sendAbsent(response)
    else sendText(response, 404, options.notice)
    return true
  }

  if (options.requireTokenOnWritable === true && !mode.readOnly) {
    const state = await readToken(store).catch(() => null)
    if (state === null) {
      fail(500, 'The configuration file could not be read\n', 'service.read-failed')
      return true
    }
    if (state.kind === 'none') {
      fail(403, 'The service token is required in configuration mode\n', 'service.token')
      return true
    }
    if (state.kind === 'invalid') {
      fail(500, 'The service token is not valid\n', 'service.token-invalid')
      return true
    }
  }

  if (await tokenDenied(request, url, store, response, 'text', options.notice)) return true

  const target = (url.searchParams.get('target') ?? '').trim()
  const module = (url.searchParams.get('module') ?? '').trim()
  const debug = url.searchParams.get('debug') === 'true'
  const queryName = (url.searchParams.get('query_name') ?? '').trim()
  if (module === '' || (target === '' && options.allowEmptyTarget !== true)) {
    fail(400, 'The target and the probe configuration are required\n', 'service.probe-invalid')
    return true
  }
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(target)) {
    fail(400, 'The target must not include a scheme\n', 'service.target-scheme')
    return true
  }

  const outcome = await checker.probe({
    target,
    module,
    debug,
    queryName: queryName === '' ? undefined : queryName,
  })
  if (!outcome.ok) {
    switch (outcome.failure) {
      case 'read-failed':
        fail(500, 'The configuration file could not be read\n', 'service.read-failed')
        return true
      case 'invalid':
        fail(500, 'The configuration document is not valid\n', 'service.config-invalid')
        return true
      case 'unknown-module':
        fail(400, 'That probe configuration does not exist\n', 'service.probe-unknown')
        return true
      case 'unsupported':
        fail(501, 'That prober is not implemented yet\n', 'service.probe-unsupported')
        return true
    }
  }

  if (options.record && checker.historyEnabled) {
    checker.history.add(`${outcome.answer.startedAt} · ${target} · ${module} · ${outcome.answer.outcome}`)
  }

  sendText(response, 200, outcome.answer.text, undefined, {
    'x-checker-outcome': outcome.answer.outcome,
    'x-checker-status': String(outcome.answer.status),
    'x-checker-duration-ms': String(outcome.answer.durationMs),
    'x-checker-started-at': outcome.answer.startedAt,
  })
  return true
}

/** Regenerates `service.token` on a writable mount and returns it once (`D-68`). */
async function regenerateToken(
  request: IncomingMessage,
  response: ServerResponse,
  { store }: ApiDependencies,
): Promise<boolean> {
  if (request.method !== 'POST') {
    sendJson(response, 405, { key: 'api.method' })
    return true
  }

  const mode = await fileMode(store)
  if (mode === null) {
    sendJson(response, 500, { key: 'service.read-failed' })
    return true
  }
  if (mode !== 'read-write') {
    sendJson(response, 404, { key: 'api.not-found' })
    return true
  }

  const url = new URL(request.url ?? '/', 'http://localhost')
  if (await tokenDenied(request, url, store, response, 'api')) return true

  try {
    const snapshot = await store.read()
    const token = generateToken()
    const text = withToken(snapshot.text.trim() === '' ? 'modules: {}\n' : snapshot.text, token)
    if (text === null) {
      sendJson(response, 500, { key: 'service.config-invalid' })
      return true
    }
    const next = await store.write(text)
    sendJson(response, 200, { token, revision: next.revision })
  } catch {
    sendJson(response, 500, { key: 'service.internal' })
  }
  return true
}

async function quickCheck(
  request: IncomingMessage,
  response: ServerResponse,
  checker: CheckerDependencies,
): Promise<boolean> {
  const raw = await readBody(request)
  if (!raw.ok) {
    sendText(response, 400, 'The quick check settings are not valid\n', 'service.quick-invalid')
    return true
  }

  const input = parseQuickInput(raw.text)
  if (input === null) {
    sendText(response, 400, 'The quick check settings are not valid\n', 'service.quick-invalid')
    return true
  }

  try {
    const answer = await checker.quickProbe(input)
    sendText(response, 200, answer.text, undefined, {
      'x-checker-outcome': answer.outcome,
      'x-checker-status': String(answer.status),
      'x-checker-duration-ms': String(answer.durationMs),
      'x-checker-started-at': answer.startedAt,
    })
  } catch {
    sendText(response, 500, 'The service failed\n', 'service.internal')
  }
  return true
}

function parseQuickInput(raw: string): QuickCheckInput | null {
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return null
  }
  if (typeof value !== 'object' || value === null) return null
  const record = value as Record<string, unknown>

  const prober = record['prober'] ?? 'http'
  const target = record['target']
  const timeoutMs = record['timeoutMs']

  if (prober !== 'http' && prober !== 'tcp' && prober !== 'dns') return null
  if (typeof target !== 'string') return null
  if (typeof timeoutMs !== 'number' || !Number.isInteger(timeoutMs)) return null
  if (timeoutMs < 100 || timeoutMs > 120_000) return null

  if (prober === 'tcp') {
    if (target.trim() === '') return null
    return { prober: 'tcp', target: target.trim(), timeoutMs }
  }

  if (prober === 'dns') {
    const queryName = record['queryName']
    const queryType = record['queryType']
    if (typeof queryName !== 'string' || queryName.trim() === '') return null
    if (typeof queryType !== 'string' || queryType.trim() === '') return null
    return {
      prober: 'dns',
      target: target.trim(),
      timeoutMs,
      queryName: queryName.trim(),
      queryType: queryType.trim().toUpperCase(),
    }
  }

  if (target.trim() === '') return null

  const expectedStatus = record['expectedStatus']
  const followRedirects = record['followRedirects']
  const insecureSkipVerify = record['insecureSkipVerify']

  const method = (record['method'] ?? 'GET') as unknown
  if (typeof method !== 'string' || !QUICK_METHODS.has(method.toUpperCase())) return null
  if (typeof expectedStatus !== 'number' || !Number.isInteger(expectedStatus)) return null
  if (expectedStatus < 100 || expectedStatus > 599) return null
  if (typeof followRedirects !== 'boolean' || typeof insecureSkipVerify !== 'boolean') return null

  const basic = record['basic']
  const ntlm = record['ntlm']

  let basicAuth: Credentials | undefined
  if (basic !== undefined && basic !== null) {
    const parsed = credentials(basic, false)
    if (parsed === null) return null
    basicAuth = parsed
  }

  let ntlmAuth: Credentials | undefined
  if (ntlm !== undefined && ntlm !== null) {
    const parsed = credentials(ntlm, true)
    if (parsed === null) return null
    ntlmAuth = parsed
  }

  return {
    prober: 'http',
    target: target.trim(),
    method: method.toUpperCase(),
    expectedStatus,
    timeoutMs,
    followRedirects,
    insecureSkipVerify,
    ...(basicAuth === undefined ? {} : { basic: basicAuth }),
    ...(ntlmAuth === undefined ? {} : { ntlm: ntlmAuth }),
  }
}

interface Credentials {
  readonly username: string
  readonly password: string
  readonly domain?: string
  readonly workstation?: string
}

function credentials(value: unknown, withDomain: boolean): Credentials | null {
  if (typeof value !== 'object' || value === null) return null
  const record = value as Record<string, unknown>
  const username = record['username']
  const password = record['password']
  if (typeof username !== 'string' || username.trim() === '' || typeof password !== 'string') return null
  if (!withDomain) return { username, password }

  const domain = record['domain']
  const workstation = record['workstation']
  if (domain !== undefined && typeof domain !== 'string') return null
  if (workstation !== undefined && typeof workstation !== 'string') return null
  return {
    username,
    password,
    ...(domain === undefined ? {} : { domain }),
    ...(workstation === undefined ? {} : { workstation }),
  }
}

async function readConfiguration(response: ServerResponse, { store }: ApiDependencies): Promise<boolean> {
  try {
    const snapshot = await store.read()
    const mode = (await fileMode(store)) ?? 'read-only'
    sendJson(response, 200, { ...snapshot, path: store.path, mode })
  } catch {
    sendJson(response, 500, { key: 'service.read-failed' })
  }
  return true
}

async function writeConfiguration(
  request: IncomingMessage,
  response: ServerResponse,
  { store }: ApiDependencies,
): Promise<boolean> {
  if (!(await store.canWrite())) {
    sendJson(response, 403, { key: 'service.read-only' })
    return true
  }

  const raw = await readBody(request)
  if (!raw.ok) {
    sendJson(response, 413, { key: 'service.body-too-large' })
    return true
  }

  const body = parseWriteBody(raw.text)
  if (body === null) {
    sendJson(response, 400, { key: 'service.body' })
    return true
  }

  let current: Snapshot
  try {
    current = await store.read()
  } catch {
    sendJson(response, 500, { key: 'service.read-failed' })
    return true
  }

  if (body.revision !== current.revision) {
    sendJson(response, 409, { key: 'service.drift', revision: current.revision, lastWrite: current.lastWrite })
    return true
  }

  const parsed = parseDocument(body.text)
  if (!parsed.ok) {
    sendJson(response, 422, { key: 'service.invalid', issues: parsed.issues })
    return true
  }

  const blocking = validateDocument(parsed.document).filter((issue) => issue.severity === 'blocking')
  if (blocking.length > 0) {
    sendJson(response, 422, { key: 'service.invalid', issues: blocking })
    return true
  }

  try {
    const snapshot = await store.write(body.text)
    sendJson(response, 200, { ...snapshot, path: store.path, mode: 'read-write' })
  } catch {
    sendJson(response, 500, { key: 'service.write-failed' })
  }
  return true
}

type BodyResult = { readonly ok: true; readonly text: string } | { readonly ok: false; readonly tooLarge: true }

/**
 * Reads the body up to the cap. Beyond it the rest is drained and discarded, so
 * the answer is a `413` the client can read instead of a reset connection.
 */
async function readBody(request: IncomingMessage): Promise<BodyResult> {
  const chunks: Buffer[] = []
  let size = 0
  let tooLarge = false

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk))
    if (tooLarge) continue
    size += buffer.length
    if (size > MAX_BODY_BYTES) {
      tooLarge = true
      chunks.length = 0
      continue
    }
    chunks.push(buffer)
  }

  return tooLarge ? { ok: false, tooLarge: true } : { ok: true, text: Buffer.concat(chunks).toString('utf8') }
}

function parseWriteBody(raw: string): WriteBody | null {
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return null
  }

  if (typeof value !== 'object' || value === null) return null
  const record = value as Record<string, unknown>
  const text = record['text']
  const revision = record['revision']
  if (typeof text !== 'string' || typeof revision !== 'string') return null
  return { text, revision }
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body)
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
    'cache-control': 'no-store',
  })
  response.end(payload)
}

/** A text answer: the body mirrors the exporter, the key travels in a header. */
function sendText(
  response: ServerResponse,
  status: number,
  body: string,
  key?: string,
  headers: Record<string, string> = {},
): void {
  response.writeHead(status, {
    'content-type': 'text/plain; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
    ...(key === undefined ? {} : { 'x-checker-key': key }),
    ...headers,
  })
  response.end(body)
}

/** Outside the read-only mount the two text routes answer nothing. */
function sendAbsent(response: ServerResponse): void {
  response.writeHead(404, { 'content-length': 0, 'cache-control': 'no-store' })
  response.end()
}
