import { createContext, useContext, useState } from 'react'
import type { MouseEvent, ReactNode } from 'react'

interface GroupSet {
  readonly open: string | null
  readonly allowClose: boolean
  readonly openOnly: (id: string) => void
  readonly close: () => void
}

const GroupSetContext = createContext<GroupSet | null>(null)

/**
 * Keeps one group of a level open. Opening a group closes its siblings; with
 * `allowClose` the open one can be closed again, and without it a second click
 * leaves it open so a misclick never hides the form.
 */
export function GroupProvider({
  defaultOpen,
  allowClose = true,
  children,
}: {
  readonly defaultOpen?: string
  readonly allowClose?: boolean
  readonly children: ReactNode
}) {
  const [open, setOpen] = useState<string | null>(defaultOpen ?? null)

  return (
    <GroupSetContext.Provider value={{ open, allowClose, openOnly: (id) => setOpen(id), close: () => setOpen(null) }}>
      {children}
    </GroupSetContext.Provider>
  )
}

interface GroupProps {
  readonly id: string
  readonly title: string
  readonly defaultOpen?: boolean
  readonly children: ReactNode
}

/** One collapsible block; the open state belongs to the level, not to the browser. */
export function Group({ id, title, defaultOpen = false, children }: GroupProps) {
  const set = useContext(GroupSetContext)
  const [localOpen, setLocalOpen] = useState(defaultOpen)

  const open = set === null ? localOpen : set.open === id

  const toggle = (event: MouseEvent<HTMLElement>) => {
    event.preventDefault()
    if (set === null) {
      setLocalOpen((current) => !current)
      return
    }
    if (set.open === id) {
      if (set.allowClose) set.close()
      return
    }
    set.openOnly(id)
  }

  return (
    <details open={open} className="rounded border border-border bg-surface">
      <summary
        onClick={toggle}
        className={`flex cursor-pointer select-none items-center justify-between gap-2 rounded-t px-3 py-2 text-xs font-semibold uppercase tracking-wide ${
          open ? 'bg-surface-raised text-text' : 'text-text-muted hover:text-text'
        }`}
      >
        <span className="flex items-center gap-2">
          <span aria-hidden="true" className="text-accent">
            |
          </span>
          {title}
        </span>
        <span aria-hidden="true" className="text-text-muted">
          {open ? '–' : '+'}
        </span>
      </summary>
      <div className="flex flex-col gap-4 border-t border-border p-3">{children}</div>
    </details>
  )
}
