import { parse as parseYaml } from 'yaml'

import type { ExporterDocument, Mapping, ParseResult, ProbeSummary } from './types.ts'

const isMapping = (value: unknown): value is Mapping =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * Reads the file text into a document. It never repairs anything: a document
 * that is not a mapping with a `modules` mapping is refused (FR-04).
 */
export function parseDocument(text: string): ParseResult {
  let parsed: unknown

  try {
    parsed = parseYaml(text)
  } catch {
    return { ok: false, issues: [{ path: '', key: 'document.parse', severity: 'blocking' }] }
  }

  if (!isMapping(parsed)) {
    return { ok: false, issues: [{ path: '', key: 'document.shape', severity: 'blocking' }] }
  }

  if (!isMapping(parsed['modules'])) {
    return { ok: false, issues: [{ path: 'modules', key: 'document.modules', severity: 'blocking' }] }
  }

  return { ok: true, document: { raw: parsed } }
}

/** The entries of `modules` in the order of the file, with their prober when it is a string. */
export function listProbeConfigurations(document: ExporterDocument): ProbeSummary[] {
  const modules = document.raw['modules']
  if (!isMapping(modules)) return []

  return Object.entries(modules).map(([name, value]) => {
    const prober = isMapping(value) ? value['prober'] : undefined
    return { name, prober: typeof prober === 'string' ? prober : undefined }
  })
}

export function getProbeConfiguration(document: ExporterDocument, name: string): Mapping | undefined {
  const modules = document.raw['modules']
  if (!isMapping(modules)) return undefined
  const value = modules[name]
  return isMapping(value) ? value : undefined
}

export function isMappingValue(value: unknown): value is Mapping {
  return isMapping(value)
}
