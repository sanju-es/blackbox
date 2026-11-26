import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'

import { IMPLEMENTED_PROBERS } from '@shared/document/index.ts'

import { useI18n } from '../../../lib/i18n/index.tsx'

/** Creates an empty probe from a name and an implemented prober (`FR-06`). */
export function NewProbeDialog({
  onClose,
  onCreate,
}: {
  readonly onClose: () => void
  readonly onCreate: (name: string, prober: string) => boolean
}) {
  const { t, translate } = useI18n()
  const [name, setName] = useState('')
  const [prober, setProber] = useState('http')
  const [issue, setIssue] = useState<string | null>(null)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const create = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const trimmed = name.trim()
    if (trimmed === '' || !onCreate(trimmed, prober)) {
      setIssue('form.module.duplicate')
      return
    }
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-text/40 p-4 sm:items-center">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-dialog-title"
        className="flex w-full max-w-xl flex-col gap-[10px] rounded border border-border bg-surface p-[14px] text-text shadow-lg"
      >
        <header className="flex flex-col gap-1">
          <h2 id="new-dialog-title" className="text-[15px] font-semibold">
            {t('new.title')}
          </h2>
          <p className="text-[10px] text-text-muted">{t('new.note')}</p>
        </header>

        <form className="flex flex-col gap-3" onSubmit={create}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-[10px] text-text-muted">
              <span>{t('list.name')}</span>
              <input
                autoFocus
                className="rounded border border-border bg-surface px-2 py-1 text-[11px] text-text"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </label>

            <label className="flex flex-col gap-1 text-[10px] text-text-muted">
              <span>{t('editor.prober')}</span>
              <select
                className="rounded border border-border bg-surface px-2 py-1 text-[11px] text-text"
                value={prober}
                onChange={(event) => setProber(event.target.value)}
              >
                {IMPLEMENTED_PROBERS.map((candidate) => (
                  <option key={candidate} value={candidate}>
                    {translate(`prober.${candidate}`)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {issue === null ? null : (
            <p role="alert" className="text-[11px] text-text">
              {translate(issue)}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="rounded border border-border px-3 py-1 text-[11px] text-text-muted hover:text-text"
              onClick={onClose}
            >
              {t('action.cancel')}
            </button>
            <button
              type="submit"
              className="rounded border border-border px-3 py-1 text-[11px] text-text disabled:opacity-40"
              disabled={name.trim() === ''}
            >
              {t('list.create')}
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}
