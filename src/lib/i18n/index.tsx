import { createContext, useCallback, useContext, useMemo } from 'react'
import type { ReactNode } from 'react'

import { messages } from './dictionaries'
import type { MessageKey } from './dictionaries'

interface MessageDictionary {
  /** Literal key: a typo fails to compile. */
  readonly t: (key: MessageKey) => string
  /** Key that arrives at run time, such as a message key from the service. */
  readonly translate: (key: string) => string
}

const DictionaryContext = createContext<MessageDictionary | null>(null)

/** One message dictionary, shipped with the build; the interface has no second language. */
export function I18nProvider({ children }: { readonly children: ReactNode }) {
  const translate = useCallback((key: string) => (messages as Record<string, string>)[key] ?? key, [])
  const value = useMemo<MessageDictionary>(() => ({ t: (key: MessageKey) => translate(key), translate }), [translate])

  return <DictionaryContext.Provider value={value}>{children}</DictionaryContext.Provider>
}

export function useI18n(): MessageDictionary {
  const value = useContext(DictionaryContext)
  if (value === null) throw new Error('useI18n must be used inside I18nProvider')
  return value
}
