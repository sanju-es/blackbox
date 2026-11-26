import type { QuickCheckInput } from '@shared/quick.ts'

export type Mode = 'read-write' | 'read-only'

export interface ConfigurationSnapshot {
  readonly text: string
  readonly revision: string
  readonly lastWrite: string | null
  readonly path: string
  readonly mode: Mode
  /** `false` when the mount holds no file yet; the first save creates it. */
  readonly exists: boolean
}

export interface FieldIssue {
  readonly path: string
  readonly key: string
  readonly severity: 'blocking' | 'warning'
}

/** The answer of the text probe surface: the body is the exporter text. */
export interface ProbeAnswer {
  readonly target: string
  readonly module: string
  readonly debug: boolean
  readonly startedAt: string
  readonly durationMs: number
  readonly outcome: 'success' | 'failure'
  readonly status: number
  readonly text: string
}

/** A failed call, carrying the message key the service answered (never a sentence). */
export class ApiError extends Error {
  readonly status: number
  readonly key: string
  readonly issues: readonly FieldIssue[]
  readonly revision: string | undefined
  readonly lastWrite: string | null

  constructor(
    status: number,
    key: string,
    issues: readonly FieldIssue[] = [],
    revision?: string,
    lastWrite: string | null = null,
  ) {
    super(key)
    this.name = 'ApiError'
    this.status = status
    this.key = key
    this.issues = issues
    this.revision = revision
    this.lastWrite = lastWrite
  }
}

async function request<T>(path: string, init?: RequestInit, token?: string): Promise<T> {
  const headers = new Headers(init?.headers)
  headers.set('content-type', 'application/json')
  if (token !== undefined) headers.set('authorization', `Bearer ${token}`)

  const response = await fetch(path, { ...init, headers })

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      key?: string
      issues?: FieldIssue[]
      revision?: string
      lastWrite?: string | null
    }
    throw new ApiError(
      response.status,
      body.key ?? 'service.unknown',
      body.issues ?? [],
      body.revision,
      body.lastWrite ?? null,
    )
  }

  return (await response.json()) as T
}

/** A text answer: the service sends the message key in `x-checker-key`. */
async function requestText(
  path: string,
  token?: string,
): Promise<{ readonly response: Response; readonly text: string }> {
  const headers: Record<string, string> = { accept: 'text/plain' }
  if (token !== undefined) headers.authorization = `Bearer ${token}`
  const response = await fetch(path, { headers })
  const text = await response.text()

  if (!response.ok) {
    throw new ApiError(response.status, response.headers.get('x-checker-key') ?? keyForStatus(response.status))
  }

  return { response, text }
}

function keyForStatus(status: number): string {
  switch (status) {
    case 400:
      return 'service.probe-invalid'
    case 404:
      return 'api.not-found'
    case 501:
      return 'service.probe-unsupported'
    case 500:
      return 'service.internal'
    default:
      return 'service.unknown'
  }
}

/** `YYYY-MM-DDTHH:MM:SSZ`, the wire format of `ARCHITECTURE.md` §6. */
function timestamp(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
}

/** The client copy of the rule that decides the outcome of a failed probe. */
function probeSucceeded(text: string): boolean {
  const match = /^\s*probe_success\s+(\S+)/m.exec(text)
  return match !== null && Number(match[1]) === 1
}

/** The status the target answered, when the probe text carries `probe_http_status_code`. */
export function probeHttpStatus(text: string): string | null {
  const match = /^\s*probe_http_status_code\s+(\S+)/m.exec(text)
  return match?.[1] ?? null
}

export interface ProbePhases {
  readonly resolve: number
  readonly connect: number
  readonly processing: number
  readonly transfer: number
}

/** The HTTP phase times, in seconds, when the text carries them. */
export function probePhases(text: string): ProbePhases | null {
  const read = (phase: string): number | null => {
    const match = new RegExp(`^probe_http_duration_seconds\\{phase="${phase}"\\}\\s+(\\S+)`, 'm').exec(text)
    if (match === null) return null
    const value = Number(match[1])
    return Number.isFinite(value) ? value : null
  }

  const resolve = read('resolve')
  const connect = read('connect')
  const processing = read('processing')
  const transfer = read('transfer')
  if (resolve === null && connect === null && processing === null && transfer === null) return null
  return { resolve: resolve ?? 0, connect: connect ?? 0, processing: processing ?? 0, transfer: transfer ?? 0 }
}

export function readConfiguration(token?: string): Promise<ConfigurationSnapshot> {
  return request<ConfigurationSnapshot>('/api/config', undefined, token)
}

export function writeConfiguration(text: string, revision: string, token?: string): Promise<ConfigurationSnapshot> {
  return request<ConfigurationSnapshot>(
    '/api/config',
    {
      method: 'PUT',
      body: JSON.stringify({ text, revision }),
    },
    token,
  )
}

/** The configuration page probes through the internal route; its runs are not stored. */
export function runConfigurationProbe(
  input: {
    readonly target: string
    readonly module: string
    readonly debug: boolean
    readonly queryName?: string
  },
  token?: string,
): Promise<ProbeAnswer> {
  return probeAnswer('/api/probe', input, token)
}

/** The plain-text history; the JSON route answers in both mounts. */
export async function readHistory(token?: string): Promise<string> {
  const headers = new Headers()
  if (token !== undefined) headers.set('authorization', `Bearer ${token}`)
  const response = await fetch('/api/checker/history', { headers })
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { key?: string }
    throw new ApiError(response.status, body.key ?? 'api.not-found')
  }
  return await response.text()
}

/** Rotates `service.token` on a writable mount; the answer carries it once. */
export function regenerateToken(token?: string): Promise<{ readonly token: string; readonly revision: string }> {
  return request('/api/token/regenerate', { method: 'POST' }, token)
}

/** The quick panel: one check with inline settings, nothing saved and nothing stored. */
export async function runQuickProbe(input: QuickCheckInput, token?: string): Promise<ProbeAnswer> {
  const started = performance.now()
  const clientStartedAt = timestamp()
  const headers: Record<string, string> = { 'content-type': 'application/json', accept: 'text/plain' }
  if (token !== undefined) headers.authorization = `Bearer ${token}`
  const response = await fetch('/api/quick', {
    method: 'POST',
    headers,
    body: JSON.stringify(input),
  })
  const text = await response.text()

  if (!response.ok) {
    throw new ApiError(response.status, response.headers.get('x-checker-key') ?? keyForStatus(response.status))
  }

  const outcome = response.headers.get('x-checker-outcome')
  const duration = Number(response.headers.get('x-checker-duration-ms'))
  return {
    target: input.target,
    module: 'quick',
    debug: false,
    startedAt: response.headers.get('x-checker-started-at') ?? clientStartedAt,
    durationMs: Number.isFinite(duration) ? duration : Math.round(performance.now() - started),
    outcome: outcome === 'success' || outcome === 'failure' ? outcome : probeSucceeded(text) ? 'success' : 'failure',
    status: Number(response.headers.get('x-checker-status') ?? response.status),
    text,
  }
}

async function probeAnswer(
  path: string,
  input: { readonly target: string; readonly module: string; readonly debug: boolean; readonly queryName?: string },
  token?: string,
): Promise<ProbeAnswer> {
  const query = new URLSearchParams({ target: input.target, module: input.module })
  if (input.debug) query.set('debug', 'true')
  if (input.queryName !== undefined && input.queryName !== '') query.set('query_name', input.queryName)

  const started = performance.now()
  const clientStartedAt = timestamp()
  const { response, text } = await requestText(`${path}?${query.toString()}`, token)

  const outcome = response.headers.get('x-checker-outcome')
  const duration = Number(response.headers.get('x-checker-duration-ms'))
  return {
    target: input.target,
    module: input.module,
    debug: input.debug,
    startedAt: response.headers.get('x-checker-started-at') ?? clientStartedAt,
    durationMs: Number.isFinite(duration) ? duration : Math.round(performance.now() - started),
    outcome: outcome === 'success' || outcome === 'failure' ? outcome : probeSucceeded(text) ? 'success' : 'failure',
    status: Number(response.headers.get('x-checker-status') ?? response.status),
    text,
  }
}
