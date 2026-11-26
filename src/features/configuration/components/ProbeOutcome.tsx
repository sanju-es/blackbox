import { probeHttpStatus, probePhases } from '../../../lib/api/index.ts'
import type { ProbeAnswer } from '../../../lib/api/index.ts'
import { useI18n } from '../../../lib/i18n/index.tsx'

const millis = (seconds: number): string => (seconds * 1000).toFixed(1)

export interface ProbeOutcomeLabels {
  readonly success: string
  readonly failure: string
  readonly status: string
  readonly httpStatus: string
  readonly duration: string
  readonly empty: string
}

/** The result block shared by the editor probe and the quick-check modal. */
export function ProbeOutcome({
  answer,
  labels,
}: {
  readonly answer: ProbeAnswer
  readonly labels: ProbeOutcomeLabels
}) {
  const { translate } = useI18n()
  const httpStatus = probeHttpStatus(answer.text)
  const phases = probePhases(answer.text)

  return (
    <section className="flex flex-col gap-[10px] rounded border border-border bg-surface-raised p-3">
      <p className="text-[11px] text-text">
        {answer.outcome === 'success' ? translate(labels.success) : translate(labels.failure)}
      </p>
      <dl className="flex flex-wrap gap-x-6 gap-y-1 text-[10px] text-text-muted">
        <div className="flex gap-2">
          <dt className="font-semibold">{translate(labels.status)}</dt>
          <dd>{answer.status}</dd>
        </div>
        {httpStatus === null ? null : (
          <div className="flex gap-2">
            <dt className="font-semibold">{translate(labels.httpStatus)}</dt>
            <dd>{httpStatus}</dd>
          </div>
        )}
        <div className="flex gap-2">
          <dt className="font-semibold">{translate(labels.duration)}</dt>
          <dd>{answer.durationMs} ms</dd>
        </div>
        {phases === null ? null : (
          <>
            <div className="flex gap-2">
              <dt className="font-semibold">{translate('probe.phase.dns')}</dt>
              <dd>{millis(phases.resolve)} ms</dd>
            </div>
            <div className="flex gap-2">
              <dt className="font-semibold">{translate('probe.phase.connect')}</dt>
              <dd>{millis(phases.connect)} ms</dd>
            </div>
            <div className="flex gap-2">
              <dt className="font-semibold">{translate('probe.phase.waiting')}</dt>
              <dd>{millis(phases.processing)} ms</dd>
            </div>
            <div className="flex gap-2">
              <dt className="font-semibold">{translate('probe.phase.download')}</dt>
              <dd>{millis(phases.transfer)} ms</dd>
            </div>
          </>
        )}
      </dl>
      {answer.text.trim() === '' ? (
        <p className="text-[11px] text-text-muted">{translate(labels.empty)}</p>
      ) : (
        <pre className="max-h-[220px] overflow-auto overscroll-contain rounded bg-surface p-3 text-[10px] text-text">
          {answer.text}
        </pre>
      )}
    </section>
  )
}
