import { getProbeConfiguration, parseDocument } from '../shared/document/index.ts'
import type { QuickCheckInput } from '../shared/quick.ts'
import { getServers } from 'node:dns/promises'

import type { FileStore } from './config-file.ts'
import { runDnsCheck } from './checks/dns.ts'
import { runHttpCheck } from './checks/http.ts'
import type { CheckReport } from './checks/http.ts'
import { runTcpCheck } from './checks/tcp.ts'
import { LEGEND } from './legend.ts'

const HISTORY_CAP = 50

export interface ProbeInput {
  readonly target: string
  readonly module: string
  readonly debug: boolean
  /** Overrides the module's `dns.query_name`; the request owns the name (`D-72`). */
  readonly queryName?: string
}

export interface CheckAnswer {
  readonly text: string
  readonly outcome: 'success' | 'failure'
  readonly startedAt: string
  readonly durationMs: number
  /** The status of the service answer: a completed check is always a 200. */
  readonly status: number
}

export type ProbeResult =
  | { readonly ok: true; readonly answer: CheckAnswer }
  | { readonly ok: false; readonly failure: 'read-failed' | 'invalid' | 'unknown-module' | 'unsupported' }

export interface CheckerHistory {
  add(entry: string): void
  list(): readonly string[]
}

/** The dependencies the routes consume, injected so a test never runs a real check. */
export interface CheckerDependencies {
  readonly metricsEnabled: boolean
  readonly historyEnabled: boolean
  readonly readMetrics: () => string
  readonly probe: (input: ProbeInput) => Promise<ProbeResult>
  readonly quickProbe: (input: QuickCheckInput) => Promise<CheckAnswer>
  readonly history: CheckerHistory
}

/** The last 50 runs of the service process, newest last; a restart empties it (`D-25`, `D-28`). */
export function createHistory(cap = HISTORY_CAP): CheckerHistory {
  const runs: string[] = []

  return {
    add: (entry) => {
      runs.push(entry)
      if (runs.length > cap) runs.shift()
    },
    list: () => [...runs].reverse(),
  }
}

/**
 * The probe engine of this service (`D-34`). It reads the module from the
 * mounted document on every call, so a save is enough and no reload exists.
 */
export function createChecker(options: {
  readonly store: FileStore
  readonly metricsEnabled: boolean
  readonly historyEnabled: boolean
  readonly history?: CheckerHistory
}): CheckerDependencies {
  const history = options.history ?? createHistory()
  const counters = { success: 0, failure: 0 }
  let lastDuration = 0

  return {
    metricsEnabled: options.metricsEnabled,
    historyEnabled: options.historyEnabled,
    history,
    readMetrics: () => renderMetrics(counters, lastDuration),
    quickProbe: async (input): Promise<CheckAnswer> => {
      const timeout = `${input.timeoutMs}ms`
      const startedAt = timestamp()
      let report: CheckReport
      if (input.prober === 'tcp') {
        report = await runTcpCheck({ prober: 'tcp', timeout, tcp: {} }, input.target, false)
      } else if (input.prober === 'dns') {
        report = await runDnsCheck(
          { prober: 'dns', timeout, dns: { query_name: input.queryName, query_type: input.queryType } },
          resolverFor(input.target),
          false,
        )
      } else {
        const http: Record<string, unknown> = {
          method: input.method,
          valid_status_codes: [input.expectedStatus],
          follow_redirects: input.followRedirects,
          ...(input.insecureSkipVerify ? { tls_config: { insecure_skip_verify: true } } : {}),
          ...(input.basic === undefined ? {} : { basic_auth: input.basic }),
          ...(input.ntlm === undefined ? {} : { ntlm: input.ntlm }),
        }
        report = await runHttpCheck({ prober: 'http', timeout, http }, input.target, false)
      }
      if (report.success) counters.success += 1
      else counters.failure += 1
      lastDuration = report.durationMs
      return {
        text: report.text,
        outcome: report.success ? 'success' : 'failure',
        startedAt,
        durationMs: report.durationMs,
        status: 200,
      }
    },
    probe: async ({ target, module, debug, queryName }): Promise<ProbeResult> => {
      let text: string
      try {
        text = (await options.store.read()).text
      } catch {
        return { ok: false, failure: 'read-failed' }
      }

      const parsed = parseDocument(text)
      if (!parsed.ok) return { ok: false, failure: 'invalid' }

      const configuration = getProbeConfiguration(parsed.document, module)
      if (configuration === undefined) return { ok: false, failure: 'unknown-module' }
      const prober = configuration['prober']
      if (prober !== 'http' && prober !== 'https' && prober !== 'tcp' && prober !== 'dns') {
        return { ok: false, failure: 'unsupported' }
      }

      const startedAt = timestamp()
      const report =
        prober === 'tcp'
          ? await runTcpCheck(configuration, target, debug)
          : prober === 'dns'
            ? await runDnsCheck(configuration, resolverFor(target), debug, queryName)
            : await runHttpCheck(configuration, target, debug)
      if (report.success) counters.success += 1
      else counters.failure += 1
      lastDuration = report.durationMs

      return {
        ok: true,
        answer: {
          text: report.text,
          outcome: report.success ? 'success' : 'failure',
          startedAt,
          durationMs: report.durationMs,
          status: 200,
        },
      }
    },
  }
}

/** The resolver of a DNS check: the target, or the host resolver when the target is empty. */
function resolverFor(target: string): string {
  return target === '' ? (getServers()[0] ?? '') : target
}

/** `YYYY-MM-DDTHH:MM:SSZ`, the wire format of `ARCHITECTURE.md` §6. */
export function timestamp(date = new Date()): string {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z')
}

/**
 * `true`/`false` in any case; `null` for anything else, which stops the service
 * at startup and names the variable (`D-29`). An absent value keeps the default.
 */
export function parseSwitch(raw: string | undefined, fallback = true): boolean | null {
  if (raw === undefined) return fallback
  const value = raw.trim().toLowerCase()
  if (value === 'true') return true
  if (value === 'false') return false
  return null
}

function renderMetrics(counters: { success: number; failure: number }, lastDuration: number): string {
  const version = process.env['npm_package_version'] ?? '0.1.0'
  return [
    ...LEGEND,
    '# HELP app_info Build information of the service.',
    '# TYPE app_info gauge',
    `app_info{version="${version}"} 1`,
    '# HELP probe_runs_total Probe runs by outcome.',
    '# TYPE probe_runs_total counter',
    `probe_runs_total{outcome="success"} ${counters.success}`,
    `probe_runs_total{outcome="failure"} ${counters.failure}`,
    '# HELP probe_last_duration_seconds Duration of the last probe in seconds.',
    '# TYPE probe_last_duration_seconds gauge',
    `probe_last_duration_seconds ${(lastDuration / 1000).toFixed(6)}`,
    '',
  ].join('\n')
}
