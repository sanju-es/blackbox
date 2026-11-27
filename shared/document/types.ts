/** The probers this project supports; an exporter prober outside the list is read but never edited. */
export const PROBERS = ['http', 'tcp', 'dns', 'grpc', 'unix', 'websocket'] as const

/** The probers with an engine in the service; the New dialog creates only these (`FR-06`). */
export const IMPLEMENTED_PROBERS = ['http', 'tcp', 'dns'] as const

export type ProberName = (typeof PROBERS)[number]

export function isProberName(value: unknown): value is ProberName {
  return typeof value === 'string' && (PROBERS as readonly string[]).includes(value)
}

/** A YAML mapping as the parser returns it, with the original key order. */
export type Mapping = Record<string, unknown>

/**
 * The whole configuration file. `raw` keeps the document as parsed so a write
 * can preserve every key the editor does not manage (FR-23).
 */
export interface ExporterDocument {
  readonly raw: Mapping
}

/** One entry of `modules`, read through its raw mapping. */
export interface ProbeSummary {
  readonly name: string
  readonly prober: string | undefined
}

export interface DocumentIssue {
  /** Dotted path of the offending value, empty for the document itself. */
  readonly path: string
  /** Interface message key, never a literal sentence. */
  readonly key: string
  /** `blocking` stops a save; `warning` is reported and the value is preserved. */
  readonly severity: 'blocking' | 'warning'
}

export type ParseResult =
  | { readonly ok: true; readonly document: ExporterDocument }
  | { readonly ok: false; readonly issues: readonly DocumentIssue[] }
