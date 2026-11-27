import { getProbeConfiguration, isMappingValue } from '@shared/document/index.ts'
import type { ExporterDocument, Mapping } from '@shared/document/index.ts'

function modulesOf(document: ExporterDocument): Mapping {
  const modules = document.raw['modules']
  return isMappingValue(modules) ? modules : {}
}

function withModules(document: ExporterDocument, modules: Mapping): ExporterDocument {
  return { raw: { ...document.raw, modules } }
}

/** Adds a probe configuration with the defaults of its prober; `null` when the name is taken. */
export function addProbeConfiguration(
  document: ExporterDocument,
  name: string,
  prober: string,
): ExporterDocument | null {
  const modules = modulesOf(document)
  const trimmed = name.trim()
  if (trimmed === '' || Object.hasOwn(modules, trimmed)) return null
  return withModules(document, { ...modules, [trimmed]: { prober, [prober]: {} } })
}

export type QuickConfiguration =
  | {
      readonly prober: 'http'
      readonly scheme: 'http' | 'https'
      readonly method: string
      readonly expectedStatus: number
      readonly timeoutMs: number
      readonly followRedirects: boolean
      readonly insecureSkipVerify: boolean
      readonly basic?: { readonly username: string; readonly password: string }
      readonly ntlm?: {
        readonly username: string
        readonly password: string
        readonly domain?: string
        readonly workstation?: string
      }
    }
  | { readonly prober: 'tcp'; readonly timeoutMs: number }
  | { readonly prober: 'dns'; readonly timeoutMs: number; readonly queryName: string; readonly queryType: string }

/** Adds a probe built from the quick panel; `null` when the name is taken. */
export function addQuickConfiguration(
  document: ExporterDocument,
  name: string,
  settings: QuickConfiguration,
): ExporterDocument | null {
  const modules = modulesOf(document)
  const trimmed = name.trim()
  if (trimmed === '' || Object.hasOwn(modules, trimmed)) return null
  const timeout = `${settings.timeoutMs}ms`

  if (settings.prober === 'tcp') {
    return withModules(document, { ...modules, [trimmed]: { prober: 'tcp', timeout, tcp: {} } })
  }

  if (settings.prober === 'dns') {
    return withModules(document, {
      ...modules,
      [trimmed]: {
        prober: 'dns',
        timeout,
        dns: { query_name: settings.queryName, query_type: settings.queryType },
      },
    })
  }

  const http: Mapping = {
    scheme: settings.scheme,
    ...(settings.method === 'GET' ? {} : { method: settings.method }),
    valid_status_codes: [settings.expectedStatus],
    follow_redirects: settings.followRedirects,
    ...(settings.insecureSkipVerify ? { tls_config: { insecure_skip_verify: true } } : {}),
    ...(settings.basic === undefined ? {} : { basic_auth: settings.basic }),
    ...(settings.ntlm === undefined ? {} : { ntlm: settings.ntlm }),
  }

  return withModules(document, {
    ...modules,
    [trimmed]: { prober: 'http', timeout, http },
  })
}

export function removeProbeConfiguration(document: ExporterDocument, name: string): ExporterDocument {
  const modules = { ...modulesOf(document) }
  delete modules[name]
  return withModules(document, modules)
}

/** Copies an entry under a free name, derived from the original, and returns the new name. */
export function duplicateProbeConfiguration(
  document: ExporterDocument,
  from: string,
): { document: ExporterDocument; name: string } | null {
  const modules = modulesOf(document)
  const source = modules[from]
  if (source === undefined) return null

  let name = `${from}_copy`
  let counter = 2
  while (Object.hasOwn(modules, name)) {
    name = `${from}_copy${counter}`
    counter += 1
  }

  return { document: withModules(document, { ...modules, [name]: structuredClone(source) }), name }
}

/** Renames an entry keeping its position; `null` when the new name is taken or empty. */
export function renameProbeConfiguration(
  document: ExporterDocument,
  from: string,
  to: string,
): ExporterDocument | null {
  const modules = modulesOf(document)
  const next = to.trim()
  if (next === '' || !Object.hasOwn(modules, from)) return null
  if (next !== from && Object.hasOwn(modules, next)) return null

  const entries = Object.entries(modules).map(([key, value]) => [key === from ? next : key, value] as const)
  return withModules(document, Object.fromEntries(entries))
}

/** Sets or removes one key of a probe configuration; `undefined` removes it. */
export function setProbeField(document: ExporterDocument, name: string, key: string, value: unknown): ExporterDocument {
  const modules = modulesOf(document)
  const current = modules[name]
  if (!isMappingValue(current)) return document

  const next: Mapping = { ...current }
  if (value === undefined) delete next[key]
  else next[key] = value

  return withModules(document, { ...modules, [name]: next })
}

/** Sets or removes one key inside the block of a probe configuration. */
export function setProberField(
  document: ExporterDocument,
  name: string,
  block: string,
  key: string,
  value: unknown,
): ExporterDocument {
  const module = getProbeConfiguration(document, name)
  const current = module !== undefined && isMappingValue(module[block]) ? module[block] : {}

  const next: Mapping = { ...current }
  if (value === undefined) delete next[key]
  else next[key] = value

  return setProbeField(document, name, block, next)
}

/** Sets or removes one key inside the `http` block of a probe configuration. */
export function setHttpField(document: ExporterDocument, name: string, key: string, value: unknown): ExporterDocument {
  return setProberField(document, name, 'http', key, value)
}
