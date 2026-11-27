import { useState } from 'react'

import { isMappingValue } from '@shared/document/index.ts'
import type { Mapping } from '@shared/document/index.ts'

import { useI18n } from '../../../lib/i18n/index.tsx'
import { asText } from '../values.ts'
import { TextField, TriStateField } from './fields.tsx'

interface ProxyFieldsProps {
  readonly block: Mapping
  readonly disabled: boolean
  readonly onChange: (key: string, value: unknown) => void
}

/** The proxy block shared by the `http` probe and the `http_config` of the websocket probe. */
export function ProxyFields({ block, disabled, onChange }: ProxyFieldsProps) {
  const { t } = useI18n()

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextField
          label={t('http.proxyUrl')}
          value={asText(block['proxy_url'])}
          disabled={disabled}
          onChange={(value) => onChange('proxy_url', value)}
        />
        <TextField
          label={t('http.noProxy')}
          value={asText(block['no_proxy'])}
          disabled={disabled}
          onChange={(value) => onChange('no_proxy', value)}
        />
      </div>

      <TriStateField
        label={t('http.proxyFromEnvironment')}
        value={block['proxy_from_environment']}
        disabled={disabled}
        onChange={(value) => onChange('proxy_from_environment', value)}
      />

      <ProxyConnectHeaders block={block} disabled={disabled} onChange={onChange} />
    </div>
  )
}

function ProxyConnectHeaders({ block, disabled, onChange }: ProxyFieldsProps) {
  const { t } = useI18n()
  const headers = isMappingValue(block['proxy_connect_header']) ? block['proxy_connect_header'] : {}

  const commit = (next: Mapping) => onChange('proxy_connect_header', Object.keys(next).length === 0 ? undefined : next)

  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs text-text-muted">{t('http.proxyConnectHeader')}</span>

      {Object.entries(headers).map(([name, value]) => (
        <div key={name} className="flex items-center gap-2 text-xs text-text">
          <span className="font-mono">{name}</span>
          <span className="text-text-muted">{Array.isArray(value) ? value.join(', ') : String(value)}</span>
          <button
            type="button"
            className="rounded border border-border px-2 py-1 text-xs text-text-muted hover:text-text"
            disabled={disabled}
            onClick={() => {
              const next: Mapping = { ...headers }
              delete next[name]
              commit(next)
            }}
          >
            {t('http.remove')}
          </button>
        </div>
      ))}

      <ProxyConnectHeaderAdder headers={headers} disabled={disabled} onAdd={commit} />
    </div>
  )
}

function ProxyConnectHeaderAdder({
  headers,
  disabled,
  onAdd,
}: {
  readonly headers: Mapping
  readonly disabled: boolean
  readonly onAdd: (next: Mapping) => void
}) {
  const { t } = useI18n()
  const [name, setName] = useState('')
  const [values, setValues] = useState('')

  const add = () => {
    const trimmed = name.trim()
    if (trimmed === '' || Object.hasOwn(headers, trimmed)) return
    const list = values
      .split(',')
      .map((entry) => entry.trim())
      .filter((entry) => entry !== '')
    onAdd({ ...headers, [trimmed]: list })
    setName('')
    setValues('')
  }

  return (
    <div className="flex flex-wrap items-end gap-2">
      <TextField
        label={t('http.headerName')}
        value={name}
        disabled={disabled}
        onChange={(next) => setName(next ?? '')}
      />
      <TextField
        label={t('http.headerValue')}
        value={values}
        disabled={disabled}
        onChange={(next) => setValues(next ?? '')}
      />
      <button
        type="button"
        className="rounded border border-border px-3 py-1 text-xs text-text-muted hover:text-text"
        disabled={disabled || name.trim() === ''}
        onClick={add}
      >
        {t('http.add')}
      </button>
    </div>
  )
}
