import { createContext, useContext, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

interface TokenContextValue {
  readonly token: string | null
  readonly setToken: (token: string | null) => void
}

const TokenContext = createContext<TokenContextValue | null>(null)

const HASH_PREFIX = '#t='

/**
 * The gate hands the accepted token in the URL fragment (`D-65`). It is read
 * once, kept in memory and removed from the address, so a reload asks again
 * (`D-04`).
 */
function tokenFromHash(): string | null {
  const hash = window.location.hash
  if (!hash.startsWith(HASH_PREFIX)) return null
  let value = ''
  try {
    value = decodeURIComponent(hash.slice(HASH_PREFIX.length)).trim()
  } catch {
    value = ''
  }
  window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`)
  return value === '' ? null : value
}

/** The token lives in memory only; a reload asks for it again (`D-04`). */
export function TokenProvider({ children }: { readonly children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => tokenFromHash())
  const value = useMemo(() => ({ token, setToken }), [token])
  return <TokenContext.Provider value={value}>{children}</TokenContext.Provider>
}

export function useToken(): TokenContextValue {
  const value = useContext(TokenContext)
  if (value === null) throw new Error('useToken must be used inside TokenProvider')
  return value
}
