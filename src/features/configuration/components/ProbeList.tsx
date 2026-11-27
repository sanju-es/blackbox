import { useState } from 'react'

import type { ProbeSummary } from '@shared/document/index.ts'

import { useI18n } from '../../../lib/i18n/index.tsx'

interface ProbeListProps {
  readonly items: readonly ProbeSummary[]
  readonly selected: string | undefined
  readonly disabled: boolean
  readonly testDisabled: boolean
  readonly onSelect: (name: string) => void
  readonly onTest: (name: string) => void
  readonly onDuplicate: (name: string) => void
  readonly onDelete: (name: string) => void
}

export function ProbeList({
  items,
  selected,
  disabled,
  testDisabled,
  onSelect,
  onTest,
  onDuplicate,
  onDelete,
}: ProbeListProps) {
  const { t } = useI18n()
  const [armed, setArmed] = useState<string | null>(null)

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-text-muted">{t('list.title')}</h2>

      {items.length === 0 ? (
        <p className="text-sm text-text-muted">{t('list.empty')}</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {items.map((item) => (
            <li key={item.name} className="flex items-center gap-2">
              <button
                type="button"
                title={item.name}
                className={`min-w-0 flex-1 rounded border px-3 py-2 text-left text-sm ${
                  item.name === selected
                    ? 'border-text-muted bg-surface-raised text-text'
                    : 'border-border text-text-muted hover:text-text'
                }`}
                onClick={() => onSelect(item.name)}
              >
                <span className="flex items-center gap-2">
                  <span className="truncate font-medium">{item.name}</span>
                  {item.prober === undefined ? null : (
                    <span className="shrink-0 text-xs text-text-muted">{item.prober}</span>
                  )}
                </span>
              </button>
              <button
                type="button"
                aria-label={t('list.duplicate')}
                title={t('list.duplicate')}
                className="rounded border border-border p-1.5 text-text-muted hover:text-text disabled:opacity-40"
                disabled={disabled}
                onClick={() => onDuplicate(item.name)}
              >
                <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4">
                  <path
                    d="M7 6V4h9v9h-2M4 7h9v9H4z"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.4"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
              <button
                type="button"
                aria-label={t('list.test')}
                title={t('list.test')}
                className="rounded border border-border p-1.5 text-text-muted hover:text-text disabled:opacity-40"
                disabled={testDisabled}
                onClick={() => onTest(item.name)}
              >
                <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4">
                  <path d="M6 4l10 6-10 6z" fill="currentColor" />
                </svg>
              </button>
              <button
                type="button"
                aria-label={armed === item.name ? t('list.confirmDelete') : t('list.delete')}
                title={armed === item.name ? t('list.confirmDelete') : t('list.delete')}
                className="rounded border border-border p-1.5 text-text-muted hover:text-text disabled:opacity-40"
                disabled={disabled}
                onClick={() => {
                  if (armed === item.name) {
                    onDelete(item.name)
                    setArmed(null)
                  } else {
                    setArmed(item.name)
                  }
                }}
              >
                <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4">
                  <path
                    d="M5 6h10M8 6V4h4v2M7 8v6M10 8v6M13 8v6M6 6l1 10h6l1-10"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
