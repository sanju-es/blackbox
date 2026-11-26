import { useState } from 'react'
import type { FormEvent } from 'react'

import { useI18n } from '../lib/i18n/index.tsx'

interface TokenDialogProps {
  readonly invalid: boolean
  readonly onSubmit: (token: string) => void
}

/** The modal that asks for `service.token` before the configuration is read. */
export function TokenDialog({ invalid, onSubmit }: TokenDialogProps) {
  const { t } = useI18n()
  const [value, setValue] = useState('')
  const [empty, setEmpty] = useState(false)

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const token = value.trim()
    if (token === '') {
      setEmpty(true)
      return
    }
    setEmpty(false)
    onSubmit(token)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-surface/80 px-4">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="token-title"
        className="w-full max-w-md rounded border border-border bg-surface-raised p-5 shadow-xl"
      >
        <h2 id="token-title" className="text-lg font-semibold text-text">
          {t('token.title')}
        </h2>
        <p className="mt-2 text-sm text-text-muted">{t('token.body')}</p>

        <form className="mt-4 flex flex-col gap-3" onSubmit={submit}>
          <label className="flex flex-col gap-1 text-xs text-text-muted">
            {t('token.label')}
            <input
              autoFocus
              type="password"
              autoComplete="off"
              value={value}
              onChange={(event) => {
                setValue(event.target.value)
                setEmpty(false)
              }}
              className="h-9 rounded border border-border bg-surface px-2 text-sm text-text"
              aria-invalid={empty || invalid}
            />
          </label>

          {empty || invalid ? (
            <p role="alert" className="text-xs text-red-400">
              {empty ? t('token.required') : t('token.invalid')}
            </p>
          ) : null}

          <button
            type="submit"
            className="self-start rounded border border-accent px-3 py-1.5 text-sm text-accent hover:bg-accent/10"
          >
            {t('token.submit')}
          </button>
        </form>
      </section>
    </div>
  )
}
