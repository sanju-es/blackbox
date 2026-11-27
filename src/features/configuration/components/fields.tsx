import type { ReactNode } from 'react'

interface TextFieldProps {
  readonly label: string
  readonly value: string
  readonly disabled: boolean
  readonly onChange: (value: string | undefined) => void
  readonly placeholder?: string
  readonly type?: 'text' | 'password'
  readonly readOnly?: boolean
  readonly onFocus?: () => void
}

export function TextField({
  label,
  value,
  disabled,
  onChange,
  placeholder,
  type = 'text',
  readOnly = false,
  onFocus,
}: TextFieldProps) {
  return (
    <label className="flex flex-col gap-1 text-xs text-text-muted">
      <span>{label}</span>
      <input
        type={type}
        className="rounded border border-border bg-surface px-2 py-1 text-sm text-text read-only:bg-surface-raised"
        value={value}
        disabled={disabled}
        readOnly={readOnly}
        placeholder={placeholder}
        onFocus={onFocus}
        onChange={(event) => onChange(event.target.value === '' ? undefined : event.target.value)}
      />
    </label>
  )
}

export function TextAreaField({
  label,
  value,
  disabled,
  onChange,
  placeholder,
  readOnly = false,
  onFocus,
}: Omit<TextFieldProps, 'type'>) {
  return (
    <label className="flex flex-col gap-1 text-xs text-text-muted">
      <span>{label}</span>
      <textarea
        className="min-h-20 rounded border border-border bg-surface px-2 py-1 text-sm text-text read-only:bg-surface-raised"
        value={value}
        disabled={disabled}
        readOnly={readOnly}
        placeholder={placeholder}
        onFocus={onFocus}
        onChange={(event) => onChange(event.target.value === '' ? undefined : event.target.value)}
      />
    </label>
  )
}

interface ChoiceFieldProps {
  readonly label: string
  readonly value: string
  readonly options: readonly { readonly value: string; readonly label: string }[]
  readonly disabled: boolean
  readonly onChange: (value: string | undefined) => void
}

export function ChoiceField({ label, value, options, disabled, onChange }: ChoiceFieldProps) {
  return (
    <label className="flex flex-col gap-1 text-xs text-text-muted">
      <span>{label}</span>
      <select
        className="rounded border border-border bg-surface px-2 py-1 text-sm text-text"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value === '' ? undefined : event.target.value)}
      >
        <option value="">—</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}

interface TriStateFieldProps {
  readonly label: string
  readonly value: unknown
  readonly disabled: boolean
  readonly onChange: (value: boolean | undefined) => void
}

export function TriStateField({ label, value, disabled, onChange }: TriStateFieldProps) {
  return (
    <label className="flex items-center gap-2 text-xs text-text-muted">
      <span>{label}</span>
      <select
        className="rounded border border-border bg-surface px-2 py-1 text-text"
        value={value === true ? 'true' : value === false ? 'false' : ''}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value === '' ? undefined : event.target.value === 'true')}
      >
        <option value="">—</option>
        <option value="true">true</option>
        <option value="false">false</option>
      </select>
    </label>
  )
}

interface StringListFieldProps {
  readonly label: string
  readonly values: readonly string[]
  readonly disabled: boolean
  readonly onChange: (values: string[] | undefined) => void
  readonly addLabel: string
  readonly removeLabel: string
  readonly placeholder?: string
  readonly secret?: boolean
}

/** A list of plain strings; an entry left empty is dropped when the field loses focus. */
export function StringListField({
  label,
  values,
  disabled,
  onChange,
  addLabel,
  removeLabel,
  placeholder,
  secret = false,
}: StringListFieldProps) {
  const commit = (next: string[]) => onChange(next.length === 0 ? undefined : next)

  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs text-text-muted">{label}</span>
      {values.map((value, index) => (
        <div key={`${label}-${index}`} className="flex gap-2">
          <input
            type={secret ? 'password' : 'text'}
            aria-label={`${label} ${index + 1}`}
            className="flex-1 rounded border border-border bg-surface px-2 py-1 text-sm text-text"
            value={value}
            disabled={disabled}
            placeholder={placeholder}
            onChange={(event) =>
              commit(values.map((current, position) => (position === index ? event.target.value : current)))
            }
            onBlur={() => {
              const cleaned = values.filter((current) => current.trim() !== '')
              if (cleaned.length !== values.length) commit(cleaned)
            }}
          />
          <button
            type="button"
            className="rounded border border-border px-2 py-1 text-xs text-text-muted hover:text-text"
            disabled={disabled}
            onClick={() => commit(values.filter((_, position) => position !== index))}
          >
            {removeLabel}
          </button>
        </div>
      ))}
      <button
        type="button"
        className="self-start rounded border border-border px-3 py-1 text-xs text-text-muted hover:text-text"
        disabled={disabled}
        onClick={() => onChange([...values, ''])}
      >
        {addLabel}
      </button>
    </div>
  )
}

export function Section({
  title,
  children,
  bordered = true,
  heading = true,
}: {
  readonly title: string
  readonly children: ReactNode
  readonly bordered?: boolean
  readonly heading?: boolean
}) {
  return (
    <section className={`flex flex-col gap-3 rounded p-3 ${bordered ? 'border border-border' : ''}`}>
      {heading ? <h3 className="text-xs font-semibold uppercase tracking-wide text-text-muted">{title}</h3> : null}
      {children}
    </section>
  )
}
