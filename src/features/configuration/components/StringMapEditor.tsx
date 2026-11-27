import { useState } from 'react'

import { isMappingValue } from '@shared/document/index.ts'
import type { Mapping } from '@shared/document/index.ts'

import { TextField } from './fields.tsx'

interface StringMapEditorProps {
  readonly label: string
  readonly value: unknown
  readonly disabled: boolean
  readonly onChange: (value: unknown) => void
  readonly keyLabel: string
  readonly valueLabel: string
  readonly addLabel: string
  readonly removeLabel: string
  /** `endpoint_params` is a map of single strings; the rest hold comma-separated lists. */
  readonly single?: boolean
}

/** A mapping of string to a comma-separated list, such as gRPC metadata or OAuth claims. */
export function StringMapEditor({
  label,
  value,
  disabled,
  onChange,
  keyLabel,
  valueLabel,
  addLabel,
  removeLabel,
  single = false,
}: StringMapEditorProps) {
  const mapping = isMappingValue(value) ? value : {}
  const [pendingKey, setPendingKey] = useState('')
  const [pendingValues, setPendingValues] = useState('')

  const commit = (next: Mapping) => onChange(Object.keys(next).length === 0 ? undefined : next)

  const toList = (raw: string) =>
    raw
      .split(',')
      .map((entry) => entry.trim())
      .filter((entry) => entry !== '')

  const write = (raw: string): unknown => (single ? raw : toList(raw))

  const read = (values: unknown): string =>
    Array.isArray(values) ? values.join(', ') : typeof values === 'string' ? values : ''

  const setEntry = (previous: string, name: string, raw: string) => {
    const next: Mapping = {}
    for (const [key, current] of Object.entries(mapping)) {
      next[key === previous ? name : key] = current
    }
    next[name] = write(raw)
    commit(next)
  }

  const add = () => {
    const name = pendingKey.trim()
    if (name === '' || Object.hasOwn(mapping, name)) return
    commit({ ...mapping, [name]: write(pendingValues) })
    setPendingKey('')
    setPendingValues('')
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs text-text-muted">{label}</span>

      {Object.entries(mapping).map(([name, values]) => (
        <div key={name} className="flex flex-wrap items-end gap-2">
          <TextField
            label={keyLabel}
            value={name}
            disabled={disabled}
            onChange={(next) => setEntry(name, next ?? '', read(values))}
          />
          <TextField
            label={valueLabel}
            value={read(values)}
            disabled={disabled}
            onChange={(next) => setEntry(name, name, next ?? '')}
          />
          <button
            type="button"
            className="rounded border border-border px-2 py-1 text-xs text-text-muted hover:text-text"
            disabled={disabled}
            onClick={() => {
              const next: Mapping = { ...mapping }
              delete next[name]
              commit(next)
            }}
          >
            {removeLabel}
          </button>
        </div>
      ))}

      <div className="flex flex-wrap items-end gap-2">
        <TextField
          label={keyLabel}
          value={pendingKey}
          disabled={disabled}
          onChange={(next) => setPendingKey(next ?? '')}
        />
        <TextField
          label={valueLabel}
          value={pendingValues}
          disabled={disabled}
          onChange={(next) => setPendingValues(next ?? '')}
        />
        <button
          type="button"
          className="rounded border border-border px-3 py-1 text-xs text-text-muted hover:text-text"
          disabled={disabled || pendingKey.trim() === ''}
          onClick={add}
        >
          {addLabel}
        </button>
      </div>
    </div>
  )
}
