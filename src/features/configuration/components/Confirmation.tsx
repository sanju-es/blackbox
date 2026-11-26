import { useI18n } from '../../../lib/i18n/index.tsx'

interface ConfirmationProps {
  readonly message: string
  readonly onConfirm: () => void
  readonly onCancel: () => void
}

/** Inline confirmation, shown before a field removes the content that conflicts with it. */
export function Confirmation({ message, onConfirm, onCancel }: ConfirmationProps) {
  const { t } = useI18n()

  return (
    <div
      role="alertdialog"
      className="flex flex-wrap items-center gap-2 rounded border border-accent/40 bg-surface-raised px-2 py-1 text-xs text-text"
    >
      <span>{message}</span>
      <button type="button" className="rounded border border-border px-2 py-0.5 text-text" onClick={onConfirm}>
        {t('action.confirm')}
      </button>
      <button type="button" className="rounded border border-border px-2 py-0.5 text-text-muted" onClick={onCancel}>
        {t('action.cancel')}
      </button>
    </div>
  )
}
