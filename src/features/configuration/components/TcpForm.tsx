import type { Mapping } from '@shared/document/index.ts'

import { useI18n } from '../../../lib/i18n/index.tsx'
import { asText } from '../values.ts'
import { Group, GroupProvider } from './Group.tsx'
import { IpFields } from './IpFields.tsx'
import { QueryResponseForm } from './QueryResponseForm.tsx'
import { TlsConfigForm } from './TlsConfigForm.tsx'
import { Section, TextField, TriStateField } from './fields.tsx'

interface TcpFormProps {
  readonly variant: 'tcp' | 'unix'
  readonly block: Mapping
  readonly disabled: boolean
  readonly onChange: (key: string, value: unknown) => void
}

export function TcpForm({ variant, block, disabled, onChange }: TcpFormProps) {
  const { t } = useI18n()

  return (
    <Section title={t('tcp.legend')}>
      <GroupProvider defaultOpen="basic" allowClose={false}>
        <Group id="basic" title={t('group.basic')}>
          {variant === 'tcp' ? <IpFields block={block} disabled={disabled} onChange={onChange} /> : null}

          <TriStateField
            label={t('tcp.tls')}
            value={block['tls']}
            disabled={disabled}
            onChange={(value) => onChange('tls', value)}
          />

          <QueryResponseForm
            value={block['query_response']}
            disabled={disabled}
            full
            onChange={(value) => onChange('query_response', value)}
          />
        </Group>

        <Group id="medium" title={t('group.medium')}>
          <TextField
            label={t('ip.source')}
            value={asText(block['source_ip_address'])}
            disabled={disabled}
            onChange={(value) => onChange('source_ip_address', value)}
          />
        </Group>

        <Group id="advanced" title={t('group.advanced')}>
          <TlsConfigForm block={block} disabled={disabled} onChange={onChange} />
        </Group>
      </GroupProvider>
    </Section>
  )
}
