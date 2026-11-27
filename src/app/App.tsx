import type { ReactNode } from 'react'

import { useI18n } from '../lib/i18n/index.tsx'
import { ModeGate } from './ModeGate.tsx'

export function App({ children }: { readonly children?: ReactNode }) {
  const { t } = useI18n()

  return (
    <main className="min-h-screen bg-surface px-6 py-10 text-text">
      <div className="mx-auto flex max-w-6xl flex-col gap-8">
        <header className="flex flex-wrap items-start justify-between gap-6 border-b border-border pb-5">
          <div className="flex shrink-0 flex-col gap-1">
            <h1 className="text-2xl font-semibold tracking-tight">{t('app.title')}</h1>
            <p className="text-sm text-text-muted">{t('app.subtitle')}</p>
          </div>

          <div className="min-w-48 flex-1 text-xs text-text-muted">
            <p className="rounded border border-border bg-surface-raised px-3 py-2">
              {t('config.rework')}{' '}
              <a
                className="underline hover:text-text"
                href="https://github.com/prometheus/blackbox_exporter"
                target="_blank"
                rel="noreferrer"
              >
                prometheus/blackbox_exporter
              </a>{' '}
              {t('config.deviation')} {t('config.disclaimer')}
            </p>
          </div>

          <div className="ml-auto flex max-w-xl flex-col gap-1 rounded border border-border bg-surface-raised px-3 py-2">
            <p className="flex flex-wrap items-center gap-2 text-sm text-text">
              <span>{t('config.developedBy')}</span>
              <a
                className="inline-flex items-center gap-1.5 font-semibold underline hover:text-accent"
                href="https://github.com/sanju-es"
                target="_blank"
                rel="noreferrer"
              >
                <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
                  <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.1.79-.25.79-.56v-2.17c-3.2.7-3.87-1.37-3.87-1.37-.52-1.33-1.28-1.68-1.28-1.68-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.23-1.27-5.23-5.66 0-1.25.45-2.27 1.19-3.07-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11 11 0 0 1 5.79 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.8 1.19 1.82 1.19 3.07 0 4.4-2.69 5.36-5.25 5.65.41.35.78 1.05.78 2.12v3.14c0 .31.21.67.8.56A11.5 11.5 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5z" />
                </svg>
                sanju
              </a>
            </p>
          </div>
        </header>

        {children ?? <ModeGate />}
      </div>
    </main>
  )
}
