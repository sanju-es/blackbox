import { isMappingValue } from '@shared/document/index.ts'
import type { Mapping } from '@shared/document/index.ts'

import { useI18n } from '../../../lib/i18n/index.tsx'
import { asList, asText, parseTextList } from '../values.ts'
import { ComboField } from './ComboField.tsx'
import { Group, GroupProvider } from './Group.tsx'
import { IpFields } from './IpFields.tsx'
import { TlsConfigForm } from './TlsConfigForm.tsx'
import { ChoiceField, Section, StringListField, TriStateField } from './fields.tsx'

interface DnsFormProps {
  readonly block: Mapping
  readonly disabled: boolean
  readonly onChange: (key: string, value: unknown) => void
}

const QUERY_TYPES = ['A', 'AAAA', 'CNAME', 'MX', 'NS', 'PTR', 'SOA', 'SRV', 'TXT', 'CAA', 'ANY']
const QUERY_CLASSES = ['IN', 'CH', 'HS']
const RCODES = ['NOERROR', 'FORMERR', 'SERVFAIL', 'NXDOMAIN', 'NOTIMP', 'REFUSED']

const TRANSPORTS = [
  { value: 'udp', label: 'udp' },
  { value: 'tcp', label: 'tcp' },
]

const GROUPS = [
  ['validate_answer_rrs', 'dns.validateAnswer'],
  ['validate_authority_rrs', 'dns.validateAuthority'],
  ['validate_additional_rrs', 'dns.validateAdditional'],
] as const

const RULES = [
  ['fail_if_matches_regexp', 'dns.failIfMatches'],
  ['fail_if_all_match_regexp', 'dns.failIfAllMatch'],
  ['fail_if_not_matches_regexp', 'dns.failIfNotMatches'],
  ['fail_if_none_matches_regexp', 'dns.failIfNoneMatch'],
] as const

function RrGroup({
  block,
  groupKey,
  labelKey,
  disabled,
  onChange,
  framed = true,
}: {
  readonly block: Mapping
  readonly groupKey: string
  readonly labelKey: (typeof GROUPS)[number][1]
  readonly disabled: boolean
  readonly onChange: (key: string, value: unknown) => void
  readonly framed?: boolean
}) {
  const { t } = useI18n()
  const group = isMappingValue(block[groupKey]) ? block[groupKey] : {}

  const set = (key: string, value: unknown) => {
    const next: Mapping = { ...group }
    if (value === undefined) delete next[key]
    else next[key] = value
    onChange(groupKey, Object.keys(next).length === 0 ? undefined : next)
  }

  return (
    <div className="flex flex-col gap-2">
      {framed ? <span className="text-xs font-semibold text-text-muted">{t(labelKey)}</span> : null}
      {RULES.map(([rule, ruleLabel]) => (
        <StringListField
          key={rule}
          label={t(ruleLabel)}
          values={asList(group[rule])}
          disabled={disabled}
          addLabel={t('http.add')}
          removeLabel={t('http.remove')}
          onChange={(values) => set(rule, values)}
        />
      ))}
    </div>
  )
}

export function DnsForm({ block, disabled, onChange }: DnsFormProps) {
  const { t } = useI18n()

  return (
    <Section title={t('dns.legend')}>
      <GroupProvider defaultOpen="basic" allowClose={false}>
        <Group id="basic" title={t('group.basic')}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <ComboField
              label={t('dns.queryType')}
              value={asText(block['query_type'])}
              options={QUERY_TYPES}
              mode="strict"
              disabled={disabled}
              onChange={(value) => onChange('query_type', value)}
            />
            <ComboField
              label={t('dns.validRcodes')}
              value={asList(block['valid_rcodes']).join(', ')}
              options={RCODES}
              disabled={disabled}
              onChange={(value) => onChange('valid_rcodes', value === undefined ? undefined : parseTextList(value))}
            />
            <ChoiceField
              label={t('dns.transport')}
              value={asText(block['transport_protocol'])}
              options={TRANSPORTS}
              disabled={disabled}
              onChange={(value) => onChange('transport_protocol', value)}
            />
          </div>

          <TriStateField
            label={t('dns.dnsOverTls')}
            value={block['dns_over_tls']}
            disabled={disabled}
            onChange={(value) => onChange('dns_over_tls', value)}
          />
        </Group>

        <Group id="medium" title={t('group.medium')}>
          <IpFields block={block} disabled={disabled} onChange={onChange} withSource />

          <div className="flex flex-wrap items-end gap-4">
            <ComboField
              label={t('dns.queryClass')}
              value={asText(block['query_class'])}
              options={QUERY_CLASSES}
              disabled={disabled}
              onChange={(value) => onChange('query_class', value)}
            />
            <TriStateField
              label={t('dns.recursion')}
              value={block['recursion_desired']}
              disabled={disabled}
              onChange={(value) => onChange('recursion_desired', value)}
            />
          </div>

          <TlsConfigForm block={block} disabled={disabled} onChange={onChange} showCheckRevoked={false} />
        </Group>

        <Group id="advanced" title={t('group.advanced')}>
          <GroupProvider>
            {GROUPS.map(([groupKey, labelKey]) => (
              <Group key={groupKey} id={groupKey} title={t(labelKey)}>
                <RrGroup
                  block={block}
                  groupKey={groupKey}
                  labelKey={labelKey}
                  disabled={disabled}
                  onChange={onChange}
                  framed={false}
                />
              </Group>
            ))}
          </GroupProvider>
        </Group>
      </GroupProvider>
    </Section>
  )
}
