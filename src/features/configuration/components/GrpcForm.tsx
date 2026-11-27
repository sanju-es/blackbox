import type { Mapping } from '@shared/document/index.ts'

import { useI18n } from '../../../lib/i18n/index.tsx'
import { asText } from '../values.ts'
import { Group, GroupProvider } from './Group.tsx'
import { IpFields } from './IpFields.tsx'
import { StringMapEditor } from './StringMapEditor.tsx'
import { TlsConfigForm } from './TlsConfigForm.tsx'
import { Section, TextField, TriStateField } from './fields.tsx'

interface GrpcFormProps {
  readonly block: Mapping
  readonly disabled: boolean
  readonly onChange: (key: string, value: unknown) => void
}

export function GrpcForm({ block, disabled, onChange }: GrpcFormProps) {
  const { t } = useI18n()

  return (
    <Section title={t('grpc.legend')}>
      <GroupProvider defaultOpen="basic" allowClose={false}>
        <Group id="basic" title={t('group.basic')}>
          <TextField
            label={t('grpc.service')}
            value={asText(block['service'])}
            disabled={disabled}
            onChange={(value) => onChange('service', value)}
          />
          <TriStateField
            label={t('grpc.tls')}
            value={block['tls']}
            disabled={disabled}
            onChange={(value) => onChange('tls', value)}
          />
        </Group>

        <Group id="medium" title={t('group.medium')}>
          <IpFields block={block} disabled={disabled} onChange={onChange} />
          <StringMapEditor
            label={t('grpc.metadata')}
            value={block['metadata']}
            disabled={disabled}
            onChange={(value) => onChange('metadata', value)}
            keyLabel={t('grpc.metadataKey')}
            valueLabel={t('grpc.metadataValues')}
            addLabel={t('http.add')}
            removeLabel={t('http.remove')}
          />
        </Group>

        <Group id="advanced" title={t('group.advanced')}>
          <TlsConfigForm block={block} disabled={disabled} onChange={onChange} />
        </Group>
      </GroupProvider>
    </Section>
  )
}
