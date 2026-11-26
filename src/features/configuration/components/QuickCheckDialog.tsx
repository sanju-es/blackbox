import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'

import type { QuickCheckInput } from '@shared/quick.ts'

import { ApiError } from '../../../lib/api/index.ts'
import { useI18n } from '../../../lib/i18n/index.tsx'
import { useQuickProbe } from '../api.ts'
import type { QuickConfiguration } from '../state/document.ts'
import { ProbeOutcome } from './ProbeOutcome.tsx'

type TypicalCheck = 'http' | 'https' | 'basic' | 'ntlm' | 'unauthorized' | 'tcp' | 'dns'
type CheckKind = 'http' | 'tcp' | 'dns'
type AuthKind = 'none' | 'basic' | 'ntlm'

interface CheckEntry {
  readonly id: TypicalCheck
  readonly kind: CheckKind
  readonly status: number
  readonly auth: AuthKind
}

const CHECKS: readonly CheckEntry[] = [
  { id: 'http', kind: 'http', status: 200, auth: 'none' },
  { id: 'https', kind: 'http', status: 200, auth: 'none' },
  { id: 'basic', kind: 'http', status: 200, auth: 'basic' },
  { id: 'ntlm', kind: 'http', status: 200, auth: 'ntlm' },
  { id: 'unauthorized', kind: 'http', status: 401, auth: 'none' },
  { id: 'tcp', kind: 'tcp', status: 0, auth: 'none' },
  { id: 'dns', kind: 'dns', status: 0, auth: 'none' },
]

const METHODS = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'] as const
const QUERY_TYPES = ['A', 'AAAA', 'CNAME', 'MX', 'NS', 'PTR', 'SOA', 'SRV', 'TXT', 'CAA', 'ANY'] as const

/** One HTTP/S, TCP or DNS check with inline settings; it writes nothing by itself (`D-36`). */
export function QuickCheckDialog({
  onClose,
  onCreate,
}: {
  readonly onClose: () => void
  readonly onCreate: (name: string, settings: QuickConfiguration) => boolean
}) {
  const { t, translate } = useI18n()
  const check = useQuickProbe()

  const [typical, setTypical] = useState<TypicalCheck>('http')
  const [authKind, setAuthKind] = useState<AuthKind>('none')
  const [name, setName] = useState('new')
  const [target, setTarget] = useState('')
  const [method, setMethod] = useState<string>('GET')
  const [expectedStatus, setExpectedStatus] = useState('200')
  const [timeoutMs, setTimeoutMs] = useState('5000')
  const [followRedirects, setFollowRedirects] = useState(true)
  const [insecureSkipVerify, setInsecureSkipVerify] = useState(false)
  const [user, setUser] = useState('')
  const [password, setPassword] = useState('')
  const [domain, setDomain] = useState('')
  const [queryName, setQueryName] = useState('example.org')
  const [queryType, setQueryType] = useState<string>('A')
  const [issue, setIssue] = useState<string | null>(null)

  const kind: CheckKind = CHECKS.find((entry) => entry.id === typical)?.kind ?? 'http'
  const isHttp = kind === 'http'
  const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(target.trim())
  const usesTls = hasScheme ? target.trim().toLowerCase().startsWith('https://') : typical === 'https'

  const resolvedTarget = (): string => {
    const value = target.trim()
    if (kind !== 'http') return value
    if (hasScheme) return value
    return `${typical === 'https' ? 'https' : 'http'}://${value}`
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const choose = (id: TypicalCheck) => {
    const chosen = CHECKS.find((candidate) => candidate.id === id)
    if (chosen === undefined) return
    const previous = CHECKS.find((candidate) => candidate.id === typical)
    if (previous !== undefined && previous.kind !== chosen.kind) setTarget('')
    setTypical(id)
    setAuthKind(chosen.auth)
    setExpectedStatus(chosen.status === 0 ? '' : String(chosen.status))
    setIssue(null)
  }

  interface Built {
    readonly input: QuickCheckInput
    readonly configuration: QuickConfiguration
  }

  const build = (requireTarget: boolean): Built | null => {
    if (requireTarget && kind !== 'dns' && target.trim() === '') {
      setIssue('quick.target.required')
      return null
    }
    const timeout = Number(timeoutMs)
    if (!Number.isInteger(timeout) || timeout < 100 || timeout > 120_000) {
      setIssue('quick.timeout.invalid')
      return null
    }

    if (kind === 'tcp') {
      if (!target.trim().includes(':')) {
        setIssue('quick.target.port')
        return null
      }
      return {
        input: { prober: 'tcp', target: resolvedTarget(), timeoutMs: timeout },
        configuration: { prober: 'tcp', timeoutMs: timeout },
      }
    }

    if (kind === 'dns') {
      if (queryName.trim() === '') {
        setIssue('quick.query.required')
        return null
      }
      return {
        input: {
          prober: 'dns',
          target: resolvedTarget(),
          timeoutMs: timeout,
          queryName: queryName.trim(),
          queryType,
        },
        configuration: { prober: 'dns', timeoutMs: timeout, queryName: queryName.trim(), queryType },
      }
    }

    const status = Number(expectedStatus)
    if (!Number.isInteger(status) || status < 100 || status > 599) {
      setIssue('quick.expected.invalid')
      return null
    }
    if (authKind !== 'none' && user.trim() === '') {
      setIssue('quick.user.required')
      return null
    }

    return {
      input: {
        prober: 'http',
        target: resolvedTarget(),
        method,
        expectedStatus: status,
        timeoutMs: timeout,
        followRedirects,
        insecureSkipVerify: usesTls ? insecureSkipVerify : false,
        ...(authKind === 'basic' ? { basic: { username: user, password } } : {}),
        ...(authKind === 'ntlm'
          ? { ntlm: { username: user, password, ...(domain.trim() === '' ? {} : { domain: domain.trim() }) } }
          : {}),
      },
      configuration: {
        prober: 'http',
        scheme: usesTls ? 'https' : 'http',
        method,
        expectedStatus: status,
        timeoutMs: timeout,
        followRedirects,
        insecureSkipVerify: usesTls ? insecureSkipVerify : false,
        ...(authKind === 'basic' ? { basic: { username: user, password } } : {}),
        ...(authKind === 'ntlm'
          ? { ntlm: { username: user, password, ...(domain.trim() === '' ? {} : { domain: domain.trim() }) } }
          : {}),
      },
    }
  }

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const built = build(true)
    if (built === null) return
    setIssue(null)
    check.mutate(built.input)
  }

  const create = () => {
    const built = build(false)
    if (built === null) return
    if (name.trim() === '') {
      setIssue('quick.name.required')
      return
    }
    if (!onCreate(name.trim(), built.configuration)) {
      setIssue('quick.name.duplicate')
      return
    }
    setIssue(null)
  }

  const targetLabel = isHttp ? t('quick.target') : kind === 'tcp' ? t('quick.target.tcp') : t('quick.target.dns')
  const targetPlaceholder = isHttp
    ? t('target.placeholder')
    : kind === 'tcp'
      ? t('quick.target.hostPort')
      : t('quick.target.resolver')

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-text/40 p-4 sm:items-center">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="quick-dialog-title"
        className="flex w-[min(92vw,640px)] flex-col gap-[10px] rounded border border-border bg-surface p-[14px] text-text shadow-lg"
      >
        <header className="flex flex-col gap-1">
          <h2 id="quick-dialog-title" className="text-[15px] font-semibold">
            {t('quick.title')}
          </h2>
          <p className="text-[10px] text-text-muted">{t('quick.note')}</p>
        </header>

        <form id="quick-check-form" className="flex flex-col gap-3" onSubmit={submit}>
          <label className="flex flex-col gap-1 text-[10px] text-text-muted">
            <span>{t('quick.name')}</span>
            <input
              autoFocus
              className="rounded border border-border bg-surface px-2 py-1 text-[11px] text-text"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <p className="text-[10px] text-text-muted">{t('quick.saveHint')}</p>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] text-text-muted">{t('quick.preset')}</span>
            {CHECKS.map((candidate) => (
              <button
                key={candidate.id}
                type="button"
                className={`rounded border px-3 py-1 text-[11px] ${
                  candidate.id === typical
                    ? 'border-text-muted bg-surface-raised text-text'
                    : 'border-border text-text-muted hover:text-text'
                }`}
                onClick={() => choose(candidate.id)}
              >
                {t(`quick.preset.${candidate.id}`)}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <div className="flex min-w-48 flex-1 flex-col gap-1 text-[10px] text-text-muted">
              <label className="flex flex-col gap-1">
                <span>{targetLabel}</span>
                <input
                  className="rounded border border-border bg-surface px-2 py-1 text-[11px] text-text"
                  value={target}
                  placeholder={targetPlaceholder}
                  onChange={(event) => setTarget(event.target.value)}
                />
              </label>
              {kind === 'dns' ? <span>{t('quick.target.empty')}</span> : null}
            </div>
            {isHttp ? (
              <label className="flex w-28 flex-col gap-1 text-[10px] text-text-muted">
                <span>{t('quick.method')}</span>
                <select
                  className="rounded border border-border bg-surface px-2 py-1 text-[11px] text-text"
                  value={method}
                  onChange={(event) => setMethod(event.target.value)}
                >
                  {METHODS.map((candidate) => (
                    <option key={candidate} value={candidate}>
                      {candidate}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>

          {kind === 'dns' ? (
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex min-w-48 flex-1 flex-col gap-1 text-[10px] text-text-muted">
                <span>{t('quick.queryName')}</span>
                <input
                  className="rounded border border-border bg-surface px-2 py-1 text-[11px] text-text"
                  value={queryName}
                  onChange={(event) => setQueryName(event.target.value)}
                />
              </label>
              <label className="flex w-32 flex-col gap-1 text-[10px] text-text-muted">
                <span>{t('quick.queryType')}</span>
                <select
                  className="rounded border border-border bg-surface px-2 py-1 text-[11px] text-text"
                  value={queryType}
                  onChange={(event) => setQueryType(event.target.value)}
                >
                  {QUERY_TYPES.map((candidate) => (
                    <option key={candidate} value={candidate}>
                      {candidate}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-3">
            {isHttp ? (
              <label className="flex items-center gap-2 text-[10px] text-text-muted">
                <span>{t('quick.expectedStatus')}</span>
                <input
                  className="w-20 rounded border border-border bg-surface px-2 py-1 text-[11px] text-text"
                  value={expectedStatus}
                  onChange={(event) => setExpectedStatus(event.target.value)}
                />
              </label>
            ) : null}
            <label className="flex items-center gap-2 text-[10px] text-text-muted">
              <span>{t('quick.timeout')}</span>
              <input
                className="w-24 rounded border border-border bg-surface px-2 py-1 text-[11px] text-text"
                value={timeoutMs}
                onChange={(event) => setTimeoutMs(event.target.value)}
              />
            </label>
            {isHttp ? (
              <label className="flex items-center gap-2 text-[10px] text-text-muted">
                <input
                  type="checkbox"
                  checked={followRedirects}
                  onChange={(event) => setFollowRedirects(event.target.checked)}
                />
                <span>{t('quick.follow')}</span>
              </label>
            ) : null}
            {isHttp && usesTls ? (
              <label className="flex items-center gap-2 text-[10px] text-text-muted">
                <input
                  type="checkbox"
                  checked={insecureSkipVerify}
                  onChange={(event) => setInsecureSkipVerify(event.target.checked)}
                />
                <span>{t('quick.insecure')}</span>
              </label>
            ) : null}
          </div>

          {isHttp && authKind !== 'none' ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <label className="flex flex-col gap-1 text-[10px] text-text-muted">
                <span>{t('quick.user')}</span>
                <input
                  className="rounded border border-border bg-surface px-2 py-1 text-[11px] text-text"
                  value={user}
                  onChange={(event) => setUser(event.target.value)}
                />
              </label>
              <label className="flex flex-col gap-1 text-[10px] text-text-muted">
                <span>{t('quick.password')}</span>
                <input
                  type="password"
                  className="rounded border border-border bg-surface px-2 py-1 text-[11px] text-text"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </label>
              {authKind === 'ntlm' ? (
                <label className="flex flex-col gap-1 text-[10px] text-text-muted">
                  <span>{t('quick.domain')}</span>
                  <input
                    className="rounded border border-border bg-surface px-2 py-1 text-[11px] text-text"
                    value={domain}
                    onChange={(event) => setDomain(event.target.value)}
                  />
                </label>
              ) : null}
            </div>
          ) : null}

          <div className="flex items-center justify-end gap-2 border-t border-border pt-3">
            <button
              type="submit"
              className="rounded border border-border px-3 py-1 text-[11px] text-text disabled:opacity-40"
              disabled={check.isPending}
            >
              {check.isPending ? t('quick.running') : t('quick.run')}
            </button>
            <button
              type="button"
              className="rounded border border-border px-3 py-1 text-[11px] text-text-muted hover:text-text"
              onClick={create}
            >
              {t('quick.create')}
            </button>
            <button
              type="button"
              className="rounded border border-border px-3 py-1 text-[11px] text-text-muted hover:text-text"
              onClick={onClose}
            >
              {t('quick.close')}
            </button>
          </div>
        </form>

        {issue === null ? null : (
          <p role="alert" className="text-[11px] text-text">
            {translate(issue)}
          </p>
        )}

        {check.isError ? (
          <p role="alert" className="text-[11px] text-text">
            {translate(check.error instanceof ApiError ? check.error.key : 'quick.failed')}
          </p>
        ) : null}

        {check.data === undefined ? null : (
          <ProbeOutcome
            answer={check.data}
            labels={{
              success: 'quick.success',
              failure: 'quick.failure',
              status: 'quick.serviceStatus',
              httpStatus: 'quick.targetStatus',
              duration: 'quick.duration',
              empty: 'quick.empty',
            }}
          />
        )}
      </section>
    </div>
  )
}
