import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'

import { ApiError } from '../../../lib/api/index.ts'
import { useI18n } from '../../../lib/i18n/index.tsx'
import { useConfigurationProbe } from '../api.ts'
import { ProbeOutcome } from './ProbeOutcome.tsx'

interface ProbeDialogProps {
  readonly module: string
  readonly prober: string
  readonly onClose: () => void
}

/**
 * A one-off probe from the configuration page. It uses the probe configuration
 * selected in the editor and calls the internal route, so it works on a writable
 * mount and never enters the checker history. The target takes the shape of the
 * prober: a URL, a host and a port, or a resolver; a DNS check also asks for the
 * query name, which belongs to the request (`FR-28`, `D-72`).
 */
export function ProbeDialog({ module, prober, onClose }: ProbeDialogProps) {
  const { t, translate } = useI18n()
  const probe = useConfigurationProbe()

  const [target, setTarget] = useState('')
  const [queryName, setQueryName] = useState('')
  const [debug, setDebug] = useState(false)
  const [issue, setIssue] = useState<string | null>(null)

  const kind = prober === 'tcp' ? 'tcp' : prober === 'dns' ? 'dns' : 'http'
  const label = kind === 'tcp' ? t('probe.target.tcp') : kind === 'dns' ? t('probe.target.dns') : t('probe.target')
  const placeholder =
    kind === 'tcp' ? t('quick.target.hostPort') : kind === 'dns' ? t('quick.target.resolver') : t('target.placeholder')

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const value = target.trim()
    const name = queryName.trim()
    if (kind !== 'dns' && value === '') {
      setIssue('probe.target.required')
      return
    }
    if (kind === 'tcp' && !value.includes(':')) {
      setIssue('probe.port.required')
      return
    }
    if (kind === 'dns' && name === '') {
      setIssue('probe.query.missing')
      return
    }
    setIssue(null)
    probe.mutate({ target: value, module, debug, queryName: kind === 'dns' ? name : undefined })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-text/40 p-4 sm:items-center">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="probe-dialog-title"
        className="flex w-[min(92vw,640px)] flex-col gap-[10px] rounded border border-border bg-surface p-[14px] text-text shadow-lg"
      >
        <header className="flex flex-col gap-1">
          <h2 id="probe-dialog-title" className="text-[15px] font-semibold">
            {t('probe.title')}
          </h2>
          <p className="text-[10px] text-text-muted">{t('probe.note')}</p>
        </header>

        <form className="flex flex-wrap items-end gap-3" onSubmit={submit}>
          <label className="flex flex-1 flex-col gap-1 text-[10px] text-text-muted">
            <span>{label}</span>
            <input
              autoFocus
              className="min-w-48 rounded border border-border bg-surface px-2 py-1 text-[11px] text-text"
              value={target}
              placeholder={placeholder}
              onChange={(event) => setTarget(event.target.value)}
            />
          </label>

          {kind === 'dns' ? (
            <label className="flex flex-1 flex-col gap-1 text-[10px] text-text-muted">
              <span>{t('dns.queryName')}</span>
              <input
                className="min-w-40 rounded border border-border bg-surface px-2 py-1 text-[11px] text-text"
                value={queryName}
                placeholder="example.org"
                onChange={(event) => setQueryName(event.target.value)}
              />
            </label>
          ) : null}

          <div className="flex w-56 flex-col gap-1 text-[10px] text-text-muted">
            <span>{t('probe.module')}</span>
            <output className="rounded border border-border bg-surface-raised px-2 py-1 text-[11px] text-text">
              {module}
            </output>
          </div>

          <label className="flex items-center gap-2 pb-1 text-[10px] text-text-muted">
            <input type="checkbox" checked={debug} onChange={(event) => setDebug(event.target.checked)} />
            <span>{t('probe.debug')}</span>
          </label>

          <button
            type="submit"
            className="rounded border border-border px-3 py-1 text-[11px] text-text disabled:opacity-40"
            disabled={probe.isPending}
          >
            {probe.isPending ? t('probe.running') : t('probe.run')}
          </button>
        </form>

        {issue === null ? null : (
          <p role="alert" className="text-[11px] text-text">
            {translate(issue)}
          </p>
        )}

        {probe.isError ? (
          <p role="alert" className="text-[11px] text-text">
            {translate(probe.error instanceof ApiError ? probe.error.key : 'probe.failed')}
          </p>
        ) : null}

        {probe.data === undefined ? null : (
          <ProbeOutcome
            answer={probe.data}
            labels={{
              success: 'probe.success',
              failure: 'probe.failure',
              status: 'probe.status',
              httpStatus: 'result.httpStatus',
              duration: 'probe.duration',
              empty: 'probe.empty',
            }}
          />
        )}

        <footer className="flex justify-end border-t border-border pt-3">
          <button
            type="button"
            className="rounded border border-border px-3 py-1 text-[11px] text-text-muted hover:text-text"
            onClick={onClose}
          >
            {t('probe.close')}
          </button>
        </footer>
      </section>
    </div>
  )
}
