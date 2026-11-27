import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { App } from './app/App'
import { TokenProvider } from './lib/api/token'
import { I18nProvider } from './lib/i18n'
import './styles/index.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false, refetchOnWindowFocus: false },
  },
})

const container = document.getElementById('root')
if (container === null) throw new Error('root element missing')

createRoot(container).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <TokenProvider>
          <App />
        </TokenProvider>
      </I18nProvider>
    </QueryClientProvider>
  </StrictMode>,
)
