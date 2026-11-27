import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  readConfiguration,
  readHistory,
  regenerateToken,
  runConfigurationProbe,
  runQuickProbe,
  writeConfiguration,
} from '../../lib/api/index.ts'
import type { ConfigurationSnapshot } from '../../lib/api/index.ts'
import { CONFIGURATION_QUERY_KEY } from '../../lib/api/index.ts'
import { useToken } from '../../lib/api/token.tsx'

const DOCUMENT_KEY = CONFIGURATION_QUERY_KEY
const HISTORY_KEY = ['checker-history'] as const

function configurationKey(token: string | null) {
  return [...DOCUMENT_KEY, token ?? 'none'] as const
}

export function useConfigurationFile() {
  const { token } = useToken()

  return useQuery({
    queryKey: configurationKey(token),
    queryFn: () => readConfiguration(token ?? undefined),
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
  })
}

export function useSaveConfiguration() {
  const client = useQueryClient()
  const { token } = useToken()

  return useMutation({
    mutationFn: ({ text, revision }: { text: string; revision: string }) =>
      writeConfiguration(text, revision, token ?? undefined),
    onSuccess: (snapshot: ConfigurationSnapshot) => {
      client.setQueryData(configurationKey(token), snapshot)
    },
  })
}

/** The probe test of the configuration page; it never enters the checker history. */
export function useConfigurationProbe() {
  const { token } = useToken()
  return useMutation({
    mutationFn: (input: {
      readonly target: string
      readonly module: string
      readonly debug: boolean
      readonly queryName?: string
    }) => runConfigurationProbe(input, token ?? undefined),
  })
}

/** The quick panel: one check with inline settings, nothing saved. */
export function useQuickProbe() {
  const { token } = useToken()
  return useMutation({
    mutationFn: (input: Parameters<typeof runQuickProbe>[0]) => runQuickProbe(input, token ?? undefined),
  })
}

/** The history modal reads the same plain text the read-only `/history` serves. */
export function useHistory() {
  const { token } = useToken()
  return useQuery({
    queryKey: [...HISTORY_KEY, token ?? 'none'],
    queryFn: () => readHistory(token ?? undefined),
    retry: false,
  })
}

/** Rotates the token; the file is written at once (`D-68`). */
export function useRegenerateToken() {
  const { token } = useToken()
  return useMutation({
    mutationFn: () => regenerateToken(token ?? undefined),
  })
}
