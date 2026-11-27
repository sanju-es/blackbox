import { useEffect, useState } from 'react'

import { isMappingValue } from '@shared/document/index.ts'
import type { Mapping } from '@shared/document/index.ts'

import { useI18n } from '../../../lib/i18n/index.tsx'
import { asList } from '../values.ts'
import { Section, StringListField } from './fields.tsx'

interface HttpHeadersFormProps {
  readonly block: Mapping
  readonly disabled: boolean
  readonly onChange: (key: string, value: unknown) => void
  /** The key inside the probe block; `headers` for the websocket prober. */
  readonly field?: string
  readonly title?: string
  readonly framed?: boolean
}

interface HeaderEntry {
  readonly name: string
  readonly values: string[]
  readonly secrets: string[]
  readonly files: string[]
}

function toEntries(value: unknown): HeaderEntry[] {
  if (!isMappingValue(value)) return []
  return Object.entries(value).map(([name, entry]) => {
    const record = isMappingValue(entry) ? entry : {}
    return {
      name,
      values: asList(record['values']),
      secrets: asList(record['secrets']),
      files: asList(record['files']),
    }
  })
}

function toMapping(entries: readonly HeaderEntry[]): Mapping | undefined {
  if (entries.length === 0) return undefined

  const mapping: Mapping = {}
  for (const entry of entries) {
    const block: Mapping = {}
    if (entry.values.length > 0) block['values'] = entry.values
    if (entry.secrets.length > 0) block['secrets'] = entry.secrets
    if (entry.files.length > 0) block['files'] = entry.files
    mapping[entry.name] = block
  }
  return mapping
}

function HeaderEntryEditor({
  entry,
  taken,
  disabled,
  onChange,
  onRemove,
}: {
  readonly entry: HeaderEntry
  readonly taken: readonly string[]
  readonly disabled: boolean
  readonly onChange: (entry: HeaderEntry) => void
  readonly onRemove: () => void
}) {
  const { t } = useI18n()
  const [name, setName] = useState(entry.name)

  useEffect(() => {
    setName(entry.name)
  }, [entry.name])

  const commitName = () => {
    const next = name.trim()
    // `http_headers` is a mapping: two entries with one name would silently merge.
    if (next === '' || next === entry.name || taken.includes(next)) {
      setName(entry.name)
      return
    }
    onChange({ ...entry, name: next })
  }

  return (
    <div className="flex flex-col gap-2 rounded border border-border p-2">
      <div className="flex items-end gap-2">
        <label className="flex flex-1 flex-col gap-1 text-xs text-text-muted">
          <span>{t('http.headerName')}</span>
          <input
            className="rounded border border-border bg-surface px-2 py-1 text-sm text-text"
            value={name}
            disabled={disabled}
            onChange={(event) => setName(event.target.value)}
            onBlur={commitName}
            onKeyDown={(event) => {
              if (event.key === 'Enter') commitName()
            }}
          />
        </label>
        <button
          type="button"
          className="rounded border border-border px-2 py-1 text-xs text-text-muted hover:text-text"
          disabled={disabled}
          onClick={onRemove}
        >
          {t('http.remove')}
        </button>
      </div>

      <StringListField
        label={t('http.values')}
        values={entry.values}
        disabled={disabled}
        addLabel={t('http.add')}
        removeLabel={t('http.remove')}
        onChange={(values) => onChange({ ...entry, values: values ?? [] })}
      />
      <StringListField
        label={t('http.secrets')}
        values={entry.secrets}
        disabled={disabled}
        addLabel={t('http.add')}
        removeLabel={t('http.remove')}
        secret
        onChange={(secrets) => onChange({ ...entry, secrets: secrets ?? [] })}
      />
      <StringListField
        label={t('http.files')}
        values={entry.files}
        disabled={disabled}
        addLabel={t('http.add')}
        removeLabel={t('http.remove')}
        onChange={(files) => onChange({ ...entry, files: files ?? [] })}
      />
    </div>
  )
}

/** `http_headers`: a header name with its values, secrets and files lists. */
export function HttpHeadersForm({
  block,
  disabled,
  onChange,
  field = 'http_headers',
  title,
  framed = true,
}: HttpHeadersFormProps) {
  const { t } = useI18n()
  const entries = toEntries(block[field])
  const [pendingName, setPendingName] = useState('')

  const commit = (next: HeaderEntry[]) => onChange(field, toMapping(next))

  const add = () => {
    const name = pendingName.trim()
    if (name === '' || entries.some((entry) => entry.name === name)) return
    commit([...entries, { name, values: [], secrets: [], files: [] }])
    setPendingName('')
  }

  return (
    <Section title={title ?? t('http.httpHeaders')} bordered={framed} heading={framed}>
      {entries.map((entry, index) => (
        <HeaderEntryEditor
          key={`${entry.name}-${index}`}
          entry={entry}
          taken={entries.filter((_, position) => position !== index).map((current) => current.name)}
          disabled={disabled}
          onChange={(next) => commit(entries.map((current, position) => (position === index ? next : current)))}
          onRemove={() => commit(entries.filter((_, position) => position !== index))}
        />
      ))}

      <div className="flex items-end gap-2">
        <label className="flex flex-1 flex-col gap-1 text-xs text-text-muted">
          <span>{t('http.headerName')}</span>
          <input
            className="rounded border border-border bg-surface px-2 py-1 text-sm text-text"
            value={pendingName}
            disabled={disabled}
            onChange={(event) => setPendingName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') add()
            }}
          />
        </label>
        <button
          type="button"
          className="rounded border border-border px-3 py-1 text-xs text-text-muted hover:text-text"
          disabled={disabled || pendingName.trim() === ''}
          onClick={add}
        >
          {t('http.add')}
        </button>
      </div>
    </Section>
  )
}
