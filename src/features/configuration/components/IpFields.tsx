import type { Mapping } from '@shared/document/index.ts'

import { useI18n } from '../../../lib/i18n/index.tsx'
import { asText } from '../values.ts'
import { ChoiceField, TextField, TriStateField } from './fields.tsx'

interface IpFieldsProps {
  readonly block: Mapping
  readonly disabled: boolean
  readonly onChange: (key: string, value: unknown) => void
  /** `tcp` and `dns` document `source_ip_address`; `http` and `grpc` do not. */
  readonly withSource?: boolean
}

const PROTOCOLS = [
  { value: 'ip4', label: 'ip4' },
  { value: 'ip6', label: 'ip6' },
]

export function IpFields({ block, disabled, onChange, withSource = false }: IpFieldsProps) {
  const { t } = useI18n()

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <ChoiceField
        label={t('ip.preferred')}
        value={asText(block['preferred_ip_protocol'])}
        options={PROTOCOLS}
        disabled={disabled}
        onChange={(value) => onChange('preferred_ip_protocol', value)}
      />
      <TriStateField
        label={t('ip.fallback')}
        value={block['ip_protocol_fallback']}
        disabled={disabled}
        onChange={(value) => onChange('ip_protocol_fallback', value)}
      />
      {withSource ? (
        <TextField
          label={t('ip.source')}
          value={asText(block['source_ip_address'])}
          disabled={disabled}
          onChange={(value) => onChange('source_ip_address', value)}
        />
      ) : null}
    </div>
  )
}
