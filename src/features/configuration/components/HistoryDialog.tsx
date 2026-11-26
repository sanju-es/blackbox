import { useEffect } from 'react'

import { ApiError } from '../../../lib/api/index.ts'
import { useI18n } from '../../../lib/i18n/index.tsx'
import { useHistory } from '../api.ts'

/** The recent runs, read from the route that answers in both modes (`D-69`). */
export function HistoryDialog({ onClose }: { readonly onClose: () => void }) {
  const { t, translate } = useI18n()
  const history = useHistory()

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-text/40 p-4 sm:items-center">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="history-dialog-title"
        className="flex w-[min(92vw,720px)] flex-col gap-[10px] rounded border border-border bg-surface p-[14px] text-text shadow-lg"
      >
        <header className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="history-dialog-title" className="text-[15px] font-semibold">
            {t('history.title')}
          </h2>
        </header>

        {history.isPending ? <p className="text-[11px] text-text-muted">{t('app.loading')}</p> : null}

        {history.isError ? (
          <p role="alert" className="text-[11px] text-text">
            {translate(history.error instanceof ApiError ? history.error.key : 'history.failed')}
          </p>
        ) : null}

        {history.data === undefined ? null : history.data.trim() === '' ? (
          <p className="text-[11px] text-text-muted">{t('history.empty')}</p>
        ) : (
          <pre className="max-h-[60vh] overflow-auto overscroll-contain rounded border border-border bg-surface-raised p-3 text-[11px] leading-relaxed text-text-muted">
            {history.data}
          </pre>
        )}

        <footer className="flex justify-end border-t border-border pt-3">
          <button
            type="button"
            className="rounded border border-border px-3 py-1 text-[11px] text-text-muted hover:text-text"
            onClick={onClose}
          >
            {t('history.close')}
          </button>
        </footer>
      </section>
    </div>
  )
}
