import { ConfigurationPage } from '../features/configuration/components/ConfigurationPage.tsx'
import { useConfigurationFile } from '../features/configuration/api.ts'
import { ApiError } from '../lib/api/index.ts'
import { useToken } from '../lib/api/token.tsx'
import { useI18n } from '../lib/i18n/index.tsx'
import { TokenDialog } from './TokenDialog.tsx'

/**
 * Resolves the mode from the mount and renders the configuration feature
 * (`D-11`, `D-17`). A read-only mount shows its notice inside the page in
 * development; production serves the plain-text surface and never loads the
 * client (`D-44`).
 */
export function ModeGate() {
  const { t } = useI18n()
  const { token, setToken } = useToken()
  const query = useConfigurationFile()
  const gated = window.location.pathname.startsWith('/app')

  if (gated && token === null) {
    window.location.replace('/')
    return null
  }

  if (query.isPending) {
    return <p className="text-sm text-text-muted">{t('app.loading')}</p>
  }

  if (query.isError) {
    const error = query.error
    if (error instanceof ApiError && error.status === 403 && error.key === 'service.token') {
      if (gated) {
        window.location.replace('/')
        return null
      }
      return (
        <TokenDialog
          invalid={token !== null}
          onSubmit={(value) => {
            if (value === token) void query.refetch()
            else setToken(value)
          }}
        />
      )
    }

    return (
      <div className="flex flex-col items-start gap-3">
        <p className="text-sm text-text">{t('app.loadFailed')}</p>
        <button
          type="button"
          className="rounded border border-border px-3 py-1 text-sm text-text"
          onClick={() => void query.refetch()}
        >
          {t('app.retry')}
        </button>
      </div>
    )
  }

  return <ConfigurationPage />
}
