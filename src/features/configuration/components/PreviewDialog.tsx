import { useEffect } from 'react'

import { useI18n } from '../../../lib/i18n/index.tsx'

/** The exact document a save would write, opened from the left column. */
export function PreviewDialog({ text, onClose }: { readonly text: string; readonly onClose: () => void }) {
  const { t } = useI18n()

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
        aria-labelledby="preview-dialog-title"
        className="flex w-[min(92vw,900px)] flex-col gap-[10px] rounded border border-border bg-surface p-[14px] text-text shadow-lg"
      >
        <header>
          <h2 id="preview-dialog-title" className="text-[15px] font-semibold">
            {t('preview.title')}
          </h2>
        </header>

        <pre className="max-h-[70vh] overflow-auto overscroll-contain rounded border border-border bg-surface-raised p-3 text-[11px] leading-relaxed text-text-muted">
          {text}
        </pre>

        <footer className="flex justify-end border-t border-border pt-3">
          <button
            type="button"
            className="rounded border border-border px-3 py-1 text-[11px] text-text-muted hover:text-text"
            onClick={onClose}
          >
            {t('quick.close')}
          </button>
        </footer>
      </section>
    </div>
  )
}
