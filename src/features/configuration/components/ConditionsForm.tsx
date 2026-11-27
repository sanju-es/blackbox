import { isMappingValue } from '@shared/document/index.ts'
import type { Mapping } from '@shared/document/index.ts'

import { useI18n } from '../../../lib/i18n/index.tsx'
import { asList, asText } from '../values.ts'
import { Section, StringListField, TextField } from './fields.tsx'

interface HeaderMatch {
  readonly header: string
  readonly regexp: string
  readonly allowMissing: boolean
}

interface ConditionsFormProps {
  readonly block: Mapping
  readonly disabled: boolean
  readonly onChange: (key: string, value: unknown) => void
  readonly framed?: boolean
}

function toMatches(value: unknown): HeaderMatch[] {
  if (!Array.isArray(value)) return []
  return value.map((item) => {
    const record = isMappingValue(item) ? item : {}
    return {
      header: asText(record['header']),
      regexp: asText(record['regexp']),
      allowMissing: record['allow_missing'] === true,
    }
  })
}

function fromMatches(matches: readonly HeaderMatch[]): Mapping[] {
  return matches.map((match) => {
    const entry: Mapping = { header: match.header, regexp: match.regexp }
    if (match.allowMissing) entry['allow_missing'] = true
    return entry
  })
}

function HeaderMatchList({
  label,
  value,
  disabled,
  onChange,
}: {
  readonly label: string
  readonly value: unknown
  readonly disabled: boolean
  readonly onChange: (value: unknown) => void
}) {
  const { t } = useI18n()
  const matches = toMatches(value)

  const commit = (next: HeaderMatch[]) => onChange(next.length === 0 ? undefined : fromMatches(next))
  const patch = (index: number, change: Partial<HeaderMatch>) =>
    commit(matches.map((match, position) => (position === index ? { ...match, ...change } : match)))

  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs text-text-muted">{label}</span>
      {matches.map((match, index) => (
        <div key={`${label}-${index}`} className="flex flex-wrap items-end gap-2">
          <TextField
            label={t('http.headerName')}
            value={match.header}
            disabled={disabled}
            onChange={(next) => patch(index, { header: next ?? '' })}
          />
          <TextField
            label={t('http.matchRegexp')}
            value={match.regexp}
            disabled={disabled}
            onChange={(next) => patch(index, { regexp: next ?? '' })}
          />
          <label className="flex items-center gap-2 text-xs text-text-muted">
            <input
              type="checkbox"
              checked={match.allowMissing}
              disabled={disabled}
              onChange={(event) => patch(index, { allowMissing: event.target.checked })}
            />
            <span>{t('http.matchAllowMissing')}</span>
          </label>
          <button
            type="button"
            className="rounded border border-border px-2 py-1 text-xs text-text-muted hover:text-text"
            disabled={disabled}
            onClick={() => commit(matches.filter((_, position) => position !== index))}
          >
            {t('http.remove')}
          </button>
        </div>
      ))}
      <button
        type="button"
        className="self-start rounded border border-border px-3 py-1 text-xs text-text-muted hover:text-text"
        disabled={disabled}
        onClick={() => commit([...matches, { header: '', regexp: '', allowMissing: false }])}
      >
        {t('http.add')}
      </button>
    </div>
  )
}

export function ConditionsForm({ block, disabled, onChange, framed = true }: ConditionsFormProps) {
  const { t } = useI18n()

  return (
    <Section title={t('http.conditions')} bordered={framed} heading={framed}>
      <div className="grid grid-cols-1 gap-4">
        <StringListField
          label={t('http.failBodyMatches')}
          values={asList(block['fail_if_body_matches_regexp'])}
          disabled={disabled}
          addLabel={t('http.add')}
          removeLabel={t('http.remove')}
          onChange={(values) => onChange('fail_if_body_matches_regexp', values)}
        />
        <StringListField
          label={t('http.failBodyNotMatches')}
          values={asList(block['fail_if_body_not_matches_regexp'])}
          disabled={disabled}
          addLabel={t('http.add')}
          removeLabel={t('http.remove')}
          onChange={(values) => onChange('fail_if_body_not_matches_regexp', values)}
        />
        <TextField
          label={t('http.failBodyCel')}
          value={asText(block['fail_if_body_json_matches_cel'])}
          disabled={disabled}
          onChange={(value) => onChange('fail_if_body_json_matches_cel', value)}
        />
        <TextField
          label={t('http.failBodyNotCel')}
          value={asText(block['fail_if_body_json_not_matches_cel'])}
          disabled={disabled}
          onChange={(value) => onChange('fail_if_body_json_not_matches_cel', value)}
        />
        <HeaderMatchList
          label={t('http.failHeaders')}
          value={block['fail_if_header_matches']}
          disabled={disabled}
          onChange={(value) => onChange('fail_if_header_matches', value)}
        />
        <HeaderMatchList
          label={t('http.notMatches')}
          value={block['fail_if_header_not_matches']}
          disabled={disabled}
          onChange={(value) => onChange('fail_if_header_not_matches', value)}
        />
      </div>
    </Section>
  )
}
