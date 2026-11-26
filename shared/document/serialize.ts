import { stringify } from 'yaml'

import type { ExporterDocument } from './types.ts'

/**
 * Writes the document back as YAML. The `modules` key comes first and the other
 * top-level keys follow in their original order, so a file the editor does not
 * fully understand is never reordered by accident (FR-23).
 *
 * Comments are not preserved (D-13); the save flow warns the owner before the
 * first write.
 */
export function serializeDocument(document: ExporterDocument): string {
  const { modules, ...rest } = document.raw

  const ordered: Record<string, unknown> = {}
  if (modules !== undefined) ordered['modules'] = modules
  for (const [key, value] of Object.entries(rest)) ordered[key] = value

  return stringify(ordered, { lineWidth: 0 })
}
