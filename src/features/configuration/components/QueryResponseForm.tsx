import { isMappingValue } from '@shared/document/index.ts'
import type { Mapping } from '@shared/document/index.ts'

import { useI18n } from '../../../lib/i18n/index.tsx'
import { asText } from '../values.ts'
import { ExclusiveField } from './ExclusiveField.tsx'
import { TextField, TriStateField } from './fields.tsx'

interface QueryResponseFormProps {
  readonly value: unknown
  readonly disabled: boolean
  /** The websocket prober documents neither `expect_bytes` nor `labels`. */
  readonly full: boolean
  readonly onChange: (value: unknown) => void
}

interface Step {
  readonly expect: string
  readonly expectBytes: string
  readonly send: string
  readonly starttls: boolean
  readonly labels: readonly { readonly name: string; readonly value: string }[]
}

function toSteps(value: unknown): Step[] {
  if (!Array.isArray(value)) return []
  return value.map((item) => {
    const step = isMappingValue(item) ? item : {}
    const labels = Array.isArray(step['labels']) ? step['labels'] : []
    return {
      expect: asText(step['expect']),
      expectBytes: asText(step['expect_bytes']),
      send: asText(step['send']),
      starttls: step['starttls'] === true,
      labels: labels.map((label) => {
        const record = isMappingValue(label) ? label : {}
        return { name: asText(record['name']), value: asText(record['value']) }
      }),
    }
  })
}

function fromSteps(steps: readonly Step[], full: boolean): Mapping[] | undefined {
  if (steps.length === 0) return undefined

  return steps.map((step) => {
    const entry: Mapping = {}
    if (step.expect !== '') entry['expect'] = step.expect
    if (full && step.expectBytes !== '') entry['expect_bytes'] = step.expectBytes
    if (step.send !== '') entry['send'] = step.send
    if (step.starttls) entry['starttls'] = true
    if (full && step.labels.length > 0) {
      entry['labels'] = step.labels
        .filter((label) => label.name !== '')
        .map((label) => ({ name: label.name, value: label.value }))
    }
    return entry
  })
}

/** The `query_response` steps of the `tcp`, `unix` and `websocket` probers. */
export function QueryResponseForm({ value, disabled, full, onChange }: QueryResponseFormProps) {
  const { t } = useI18n()
  const steps = toSteps(value)

  const commit = (next: Step[]) => onChange(fromSteps(next, full))
  const patch = (index: number, change: Partial<Step>) =>
    commit(steps.map((step, position) => (position === index ? { ...step, ...change } : step)))

  return (
    <div className="flex flex-col gap-3">
      <span className="text-xs text-text-muted">{t('tcp.queryResponse')}</span>

      {steps.map((step, index) => (
        <div key={`step-${index}`} className="flex flex-col gap-2 rounded border border-border p-2">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <ExclusiveField
              label={t('tcp.expect')}
              value={step.expect}
              disabled={disabled}
              conflict={step.expectBytes !== ''}
              conflictLabel={t('tcp.expectBytes')}
              onClearConflict={() => patch(index, { expectBytes: '' })}
              onChange={(next) => patch(index, { expect: next ?? '' })}
            />
            {full ? (
              <ExclusiveField
                label={t('tcp.expectBytes')}
                value={step.expectBytes}
                disabled={disabled}
                conflict={step.expect !== ''}
                conflictLabel={t('tcp.expect')}
                onClearConflict={() => patch(index, { expect: '' })}
                onChange={(next) => patch(index, { expectBytes: next ?? '' })}
              />
            ) : null}
            <TextField
              label={t('tcp.send')}
              value={step.send}
              disabled={disabled}
              onChange={(next) => patch(index, { send: next ?? '' })}
            />
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <TriStateField
              label={t('tcp.starttls')}
              value={step.starttls ? true : undefined}
              disabled={disabled}
              onChange={(next) => patch(index, { starttls: next === true })}
            />
            <button
              type="button"
              className="rounded border border-border px-2 py-1 text-xs text-text-muted hover:text-text"
              disabled={disabled}
              onClick={() => commit(steps.filter((_, position) => position !== index))}
            >
              {t('http.remove')}
            </button>
          </div>

          {full ? (
            <div className="flex flex-col gap-2">
              <span className="text-xs text-text-muted">{t('tcp.labels')}</span>
              {step.labels.map((label, labelIndex) => (
                <div key={`label-${index}-${labelIndex}`} className="flex flex-wrap items-end gap-2">
                  <TextField
                    label={t('tcp.labelName')}
                    value={label.name}
                    disabled={disabled}
                    onChange={(next) =>
                      patch(index, {
                        labels: step.labels.map((current, position) =>
                          position === labelIndex ? { ...current, name: next ?? '' } : current,
                        ),
                      })
                    }
                  />
                  <TextField
                    label={t('tcp.labelValue')}
                    value={label.value}
                    disabled={disabled}
                    onChange={(next) =>
                      patch(index, {
                        labels: step.labels.map((current, position) =>
                          position === labelIndex ? { ...current, value: next ?? '' } : current,
                        ),
                      })
                    }
                  />
                  <button
                    type="button"
                    className="rounded border border-border px-2 py-1 text-xs text-text-muted hover:text-text"
                    disabled={disabled}
                    onClick={() =>
                      patch(index, { labels: step.labels.filter((_, position) => position !== labelIndex) })
                    }
                  >
                    {t('http.remove')}
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="self-start rounded border border-border px-3 py-1 text-xs text-text-muted hover:text-text"
                disabled={disabled}
                onClick={() => patch(index, { labels: [...step.labels, { name: '', value: '' }] })}
              >
                {t('http.add')}
              </button>
            </div>
          ) : null}
        </div>
      ))}

      <button
        type="button"
        className="self-start rounded border border-border px-3 py-1 text-xs text-text-muted hover:text-text"
        disabled={disabled}
        onClick={() => commit([...steps, { expect: '', expectBytes: '', send: '', starttls: false, labels: [] }])}
      >
        {t('tcp.addStep')}
      </button>
    </div>
  )
}
