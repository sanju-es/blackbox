import { isMappingValue } from '@shared/document/index.ts'
import type { Mapping } from '@shared/document/index.ts'

import { useI18n } from '../../../lib/i18n/index.tsx'
import { asText, isSet } from '../values.ts'
import { ChoiceField, Section, TextField, TriStateField } from './fields.tsx'
import { ExclusiveField } from './ExclusiveField.tsx'

interface TlsConfigFormProps {
  readonly block: Mapping
  readonly disabled: boolean
  readonly onChange: (key: string, value: unknown) => void
  /** The DNS block documents no `check_revoked`; every other prober does. */
  readonly showCheckRevoked?: boolean
  /** `false` renders the fields without their own frame, for a group that already has a title. */
  readonly framed?: boolean
}

const VERSIONS = ['TLS10', 'TLS11', 'TLS12', 'TLS13'].map((value) => ({ value, label: value }))

export function TlsConfigForm({
  block,
  disabled,
  onChange,
  showCheckRevoked = true,
  framed = true,
}: TlsConfigFormProps) {
  const { t } = useI18n()
  const tls = isMappingValue(block['tls_config']) ? block['tls_config'] : {}

  const set = (key: string, value: unknown) => {
    const next: Mapping = { ...tls }
    if (value === undefined) delete next[key]
    else next[key] = value
    onChange('tls_config', Object.keys(next).length === 0 ? undefined : next)
  }

  return (
    <Section title={t('http.tls')} bordered={framed} heading={framed}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <ExclusiveField
          label={t('http.caFile')}
          value={asText(tls['ca_file'])}
          disabled={disabled}
          conflict={isSet(tls, 'ca')}
          conflictLabel={t('http.ca')}
          onClearConflict={() => set('ca', undefined)}
          onChange={(value) => set('ca_file', value)}
        />
        <ExclusiveField
          label={t('http.certFile')}
          value={asText(tls['cert_file'])}
          disabled={disabled}
          conflict={isSet(tls, 'cert')}
          conflictLabel={t('http.cert')}
          onClearConflict={() => set('cert', undefined)}
          onChange={(value) => set('cert_file', value)}
        />
        <ExclusiveField
          label={t('http.keyFile')}
          value={asText(tls['key_file'])}
          disabled={disabled}
          conflict={isSet(tls, 'key')}
          conflictLabel={t('http.key')}
          onClearConflict={() => set('key', undefined)}
          onChange={(value) => set('key_file', value)}
        />
        <TextField
          label={t('http.serverName')}
          value={asText(tls['server_name'])}
          disabled={disabled}
          onChange={(value) => set('server_name', value)}
        />
        <ChoiceField
          label={t('http.minVersion')}
          value={asText(tls['min_version'])}
          options={VERSIONS}
          disabled={disabled}
          onChange={(value) => set('min_version', value)}
        />
        <ChoiceField
          label={t('http.maxVersion')}
          value={asText(tls['max_version'])}
          options={VERSIONS}
          disabled={disabled}
          onChange={(value) => set('max_version', value)}
        />
      </div>

      <ExclusiveField
        label={t('http.ca')}
        value={asText(tls['ca'])}
        disabled={disabled}
        multiline
        conflict={isSet(tls, 'ca_file')}
        conflictLabel={t('http.caFile')}
        onClearConflict={() => set('ca_file', undefined)}
        onChange={(value) => set('ca', value)}
      />
      <ExclusiveField
        label={t('http.cert')}
        value={asText(tls['cert'])}
        disabled={disabled}
        multiline
        conflict={isSet(tls, 'cert_file')}
        conflictLabel={t('http.certFile')}
        onClearConflict={() => set('cert_file', undefined)}
        onChange={(value) => set('cert', value)}
      />
      <ExclusiveField
        label={t('http.key')}
        value={asText(tls['key'])}
        disabled={disabled}
        type="password"
        conflict={isSet(tls, 'key_file')}
        conflictLabel={t('http.keyFile')}
        onClearConflict={() => set('key_file', undefined)}
        onChange={(value) => set('key', value)}
      />

      <div className="flex flex-wrap gap-4">
        <TriStateField
          label={t('http.insecureSkipVerify')}
          value={tls['insecure_skip_verify']}
          disabled={disabled}
          onChange={(value) => set('insecure_skip_verify', value)}
        />
        {showCheckRevoked ? (
          <TriStateField
            label={t('http.checkRevoked')}
            value={block['check_revoked']}
            disabled={disabled}
            onChange={(value) => onChange('check_revoked', value)}
          />
        ) : null}
      </div>
    </Section>
  )
}
