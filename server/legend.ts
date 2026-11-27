/**
 * The comment block every text answer starts with (`D-40`). One source, so a
 * copy change reaches `/probe`, `/metrics` and the history text.
 */
export const LEGEND = [
  '# Developed by sanju - https://github.com/sanju-es',
  '# Rework of the Prometheus blackbox exporter (https://github.com/prometheus/blackbox_exporter); the merit is theirs.',
  '# Metrics may have slight deviations.',
  '# No warranty: any code written with AI assistance must be reviewed before use.',
] as const

export function renderHistory(entries: readonly string[]): string {
  return [...LEGEND, ...(entries.length === 0 ? ['# No probe run yet in this service process.'] : entries), ''].join(
    '\n',
  )
}
