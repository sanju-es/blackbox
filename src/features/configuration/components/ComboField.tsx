import { useEffect, useId, useRef, useState } from 'react'

type ComboMode = 'sample' | 'strict'

interface ComboFieldProps {
  readonly label: string
  readonly value: string
  readonly options: readonly string[]
  readonly disabled: boolean
  readonly onChange: (value: string | undefined) => void
  readonly placeholder?: string
  /**
   * `sample` (default): the list is a sample and any text is accepted.
   * `strict`: the list holds every allowed value, so only those are committed.
   */
  readonly mode?: ComboMode
}

/**
 * A text field with a list of usual values. Opening the list shows all of them;
 * typing filters it. In `sample` mode a value outside the list is kept, and in
 * `strict` mode the field returns to the last valid value (`D-74`).
 */
export function ComboField({
  label,
  value,
  options,
  disabled,
  onChange,
  placeholder,
  mode = 'sample',
}: ComboFieldProps) {
  const id = useId()
  const listId = `${id}-list`
  const box = useRef<HTMLDivElement>(null)
  const [text, setText] = useState(value)
  const [open, setOpen] = useState(false)
  const [filtering, setFiltering] = useState(false)
  const [active, setActive] = useState(0)

  useEffect(() => {
    setText(value)
  }, [value])

  useEffect(() => {
    if (!open) return
    const onDown = (event: MouseEvent) => {
      if (box.current !== null && !box.current.contains(event.target as Node)) {
        setOpen(false)
        setFiltering(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const shown = filtering
    ? options.filter((option) => option.toLowerCase().includes(text.trim().toLowerCase()))
    : options

  const commit = (next: string) => {
    if (next === '') {
      onChange(undefined)
      return
    }
    if (mode === 'sample' || options.includes(next)) onChange(next)
  }

  const select = (option: string) => {
    setText(option)
    setOpen(false)
    setFiltering(false)
    onChange(option)
  }

  const restore = () => {
    setOpen(false)
    setFiltering(false)
    if (mode === 'strict' && text !== value && !options.includes(text)) setText(value)
  }

  return (
    <div ref={box} className="relative flex flex-col gap-1 text-xs text-text-muted">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        className="rounded border border-border bg-surface px-2 py-1 text-sm text-text"
        value={text}
        disabled={disabled}
        placeholder={placeholder}
        onClick={() => {
          if (!disabled) {
            setOpen(true)
            setFiltering(false)
          }
        }}
        onFocus={() => {
          setOpen(true)
          setFiltering(false)
        }}
        onBlur={restore}
        onChange={(event) => {
          const next = event.target.value
          setText(next)
          setOpen(true)
          setFiltering(true)
          setActive(0)
          commit(next)
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault()
            setOpen(true)
            setActive((current) => Math.min(current + 1, shown.length - 1))
          } else if (event.key === 'ArrowUp') {
            event.preventDefault()
            setActive((current) => Math.max(current - 1, 0))
          } else if (event.key === 'Enter' && open && shown[active] !== undefined) {
            event.preventDefault()
            select(shown[active])
          } else if (event.key === 'Escape') {
            setOpen(false)
            setFiltering(false)
          }
        }}
      />

      {open && shown.length > 0 ? (
        <div
          id={listId}
          role="listbox"
          className="absolute top-full z-50 mt-1 max-h-56 w-full overflow-y-auto rounded border border-border bg-surface py-1 shadow-lg"
        >
          {shown.map((option, index) => (
            <div
              key={option}
              role="option"
              tabIndex={-1}
              aria-selected={option === value}
              className={`cursor-pointer px-2 py-1 text-sm ${index === active ? 'bg-surface-raised text-text' : 'text-text-muted'}`}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActive(index)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  select(option)
                }
              }}
              onClick={() => select(option)}
            >
              {option}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}
