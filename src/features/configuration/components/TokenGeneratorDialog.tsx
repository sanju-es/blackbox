import { useEffect, useRef, useState } from 'react'

import { ApiError } from '../../../lib/api/index.ts'
import { useI18n } from '../../../lib/i18n/index.tsx'
import { useRegenerateToken } from '../api.ts'

type Phase = 'confirm' | 'pending' | 'done' | 'failed'

/**
 * Rotates `service.token` after one confirmation (`D-68`): the value is written
 * at once, shown once so it can be copied, and OK restarts the application with
 * it.
 */
export function TokenGeneratorDialog({
  onClose,
  onGenerated,
}: {
  readonly onClose: () => void
  readonly onGenerated: (token: string) => void
}) {
  const { t, translate } = useI18n()
  const regenerate = useRegenerateToken()
  const [phase, setPhase] = useState<Phase>('confirm')
  const [token, setToken] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const started = useRef(false)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && (phase === 'confirm' || phase === 'failed')) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, phase])

  const confirm = () => {
    if (started.current) return
    started.current = true
    setPhase('pending')
    regenerate.mutate(undefined, {
      onSuccess: (data) => {
        // The page keeps the old token until OK: adopting it here would remount
        // the page and close this dialog before the value can be copied.
        setToken(data.token)
        setPhase('done')
      },
      onError: () => setPhase('failed'),
    })
  }

  const finish = () => {
    if (token === null) {
      onClose()
      return
    }
    if (window.location.pathname.startsWith('/app')) {
      // A hash-only change does not reload the document, so the interface would
      // keep the old token in memory. The hash is set and the page reloaded.
      window.location.hash = `t=${encodeURIComponent(token)}`
      window.location.reload()
      return
    }
    onGenerated(token)
    onClose()
  }

  const copy = async () => {
    if (token === null) return
    try {
      await navigator.clipboard.writeText(token)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-text/40 p-4 sm:items-center">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="token-dialog-title"
        className="flex w-full max-w-xl flex-col gap-[10px] rounded border border-border bg-surface p-[14px] text-text shadow-lg"
      >
        <h2 id="token-dialog-title" className="text-[15px] font-semibold">
          {phase === 'confirm' ? t('token.confirmTitle') : t('token.newTitle')}
        </h2>

        {phase === 'confirm' ? <p className="text-[11px] text-text-muted">{t('token.confirmBody')}</p> : null}

        {phase === 'pending' ? <p className="text-[11px] text-text-muted">{t('token.generating')}</p> : null}

        {phase === 'failed' ? (
          <p role="alert" className="text-[11px] text-text">
            {translate(regenerate.error instanceof ApiError ? regenerate.error.key : 'token.failed')}
          </p>
        ) : null}

        {phase === 'done' && token !== null ? (
          <>
            <p className="text-[11px] text-text-muted">{t('token.doneBody')}</p>
            <code className="break-all rounded border border-border bg-surface-raised px-3 py-2 font-mono text-[12px] text-text">
              {token}
            </code>
            <div className="flex items-center gap-3">
              <button
                type="button"
                className="rounded border border-border px-3 py-1 text-[11px] text-text-muted hover:text-text"
                onClick={() => void copy()}
              >
                {t('token.copy')}
              </button>
              {copied ? <span className="text-[10px] text-text-muted">{t('token.copied')}</span> : null}
            </div>
          </>
        ) : null}

        <footer className="flex justify-end gap-2 border-t border-border pt-3">
          {phase === 'confirm' ? (
            <>
              <button
                type="button"
                className="rounded border border-border px-3 py-1 text-[11px] text-text-muted hover:text-text"
                onClick={onClose}
              >
                {t('token.cancel')}
              </button>
              <button
                type="button"
                className="rounded border border-border bg-text px-3 py-1 text-[11px] text-surface hover:opacity-90"
                onClick={confirm}
              >
                {t('token.confirm')}
              </button>
            </>
          ) : null}

          {phase === 'done' ? (
            <button
              type="button"
              className="rounded border border-border bg-text px-3 py-1 text-[11px] text-surface hover:opacity-90"
              onClick={finish}
            >
              {t('token.restart')}
            </button>
          ) : null}

          {phase === 'failed' ? (
            <button
              type="button"
              className="rounded border border-border px-3 py-1 text-[11px] text-text-muted hover:text-text"
              onClick={onClose}
            >
              {t('token.close')}
            </button>
          ) : null}
        </footer>
      </section>
    </div>
  )
}
