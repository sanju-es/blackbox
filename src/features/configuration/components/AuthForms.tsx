import { isMappingValue } from '@shared/document/index.ts'
import type { Mapping } from '@shared/document/index.ts'
import type { ReactNode } from 'react'

import { useI18n } from '../../../lib/i18n/index.tsx'
import { asList, asText, isEmpty, isSet } from '../values.ts'
import { ExclusiveField } from './ExclusiveField.tsx'
import { ChoiceField, StringListField, TextField } from './fields.tsx'
import { Group, GroupProvider } from './Group.tsx'
import { StringMapEditor } from './StringMapEditor.tsx'
import { TlsConfigForm } from './TlsConfigForm.tsx'

interface AuthFormsProps {
  readonly block: Mapping
  readonly disabled: boolean
  readonly onChange: (key: string, value: unknown) => void
}

const GRANT_TYPES = [
  { value: 'client_credentials', label: 'client_credentials' },
  { value: 'urn:ietf:params:oauth:grant-type:jwt-bearer', label: 'urn:ietf:params:oauth:grant-type:jwt-bearer' },
]
const SIGNATURES = [
  { value: 'RS256', label: 'RS256' },
  { value: 'RS384', label: 'RS384' },
  { value: 'RS512', label: 'RS512' },
]

const labelOf = (
  root: string,
  t: (key: 'http.basicAuth' | 'http.authorization' | 'http.oauth2' | 'http.ntlm') => string,
): string =>
  t(
    root === 'basic_auth'
      ? 'http.basicAuth'
      : root === 'authorization'
        ? 'http.authorization'
        : root === 'oauth2'
          ? 'http.oauth2'
          : 'http.ntlm',
  )

function AuthGroup({
  id,
  title,
  active,
  onRemove,
  children,
}: {
  readonly id: string
  readonly title: string
  readonly active: string | undefined
  readonly onRemove: () => void
  readonly children: ReactNode
}) {
  const { t } = useI18n()
  const blocked = active !== undefined && active !== id

  return (
    <Group id={id} title={title}>
      {blocked ? (
        <div className="flex flex-wrap items-center gap-2 rounded border border-border bg-surface-raised p-2 text-xs text-text">
          <span>{t('conflict.auth').replace('{field}', labelOf(active, t))}</span>
          <button type="button" className="rounded border border-border px-2 py-0.5" onClick={onRemove}>
            {t('http.remove')}
          </button>
        </div>
      ) : (
        children
      )}
    </Group>
  )
}

/**
 * `basic_auth`, `authorization` and `oauth2`. The exporter accepts one of the
 * three, so the other two are disabled while one carries a value.
 */
export function AuthForms({ block, disabled, onChange }: AuthFormsProps) {
  const { t } = useI18n()

  const basic = isMappingValue(block['basic_auth']) ? block['basic_auth'] : {}
  const authorization = isMappingValue(block['authorization']) ? block['authorization'] : {}
  const oauth2 = isMappingValue(block['oauth2']) ? block['oauth2'] : {}
  const ntlm = isMappingValue(block['ntlm']) ? block['ntlm'] : {}

  const active = [
    ['basic_auth', basic],
    ['authorization', authorization],
    ['oauth2', oauth2],
    ['ntlm', ntlm],
  ].find(([, current]) => !isEmpty(current as Mapping))?.[0] as string | undefined

  const blocked = (root: string) => disabled || (active !== undefined && active !== root)

  const set = (root: string, current: Mapping, key: string, value: unknown) => {
    const next: Mapping = { ...current }
    if (value === undefined) delete next[key]
    else next[key] = value
    onChange(root, isEmpty(next) ? undefined : next)
  }

  return (
    <GroupProvider>
      <AuthGroup
        id="basic_auth"
        title={t('http.basicAuth')}
        active={active}
        onRemove={() => onChange('basic_auth', undefined)}
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <ExclusiveField
            label={t('http.username')}
            value={asText(basic['username'])}
            disabled={blocked('basic_auth')}
            conflict={isSet(basic, 'username_file')}
            conflictLabel={t('http.usernameFile')}
            onClearConflict={() => set('basic_auth', basic, 'username_file', undefined)}
            onChange={(value) => set('basic_auth', basic, 'username', value)}
          />
          <ExclusiveField
            label={t('http.password')}
            type="password"
            value={asText(basic['password'])}
            disabled={blocked('basic_auth')}
            conflict={isSet(basic, 'password_file')}
            conflictLabel={t('http.passwordFile')}
            onClearConflict={() => set('basic_auth', basic, 'password_file', undefined)}
            onChange={(value) => set('basic_auth', basic, 'password', value)}
          />
          <ExclusiveField
            label={t('http.usernameFile')}
            value={asText(basic['username_file'])}
            disabled={blocked('basic_auth')}
            conflict={isSet(basic, 'username')}
            conflictLabel={t('http.username')}
            onClearConflict={() => set('basic_auth', basic, 'username', undefined)}
            onChange={(value) => set('basic_auth', basic, 'username_file', value)}
          />
          <ExclusiveField
            label={t('http.passwordFile')}
            value={asText(basic['password_file'])}
            disabled={blocked('basic_auth')}
            conflict={isSet(basic, 'password')}
            conflictLabel={t('http.password')}
            onClearConflict={() => set('basic_auth', basic, 'password', undefined)}
            onChange={(value) => set('basic_auth', basic, 'password_file', value)}
          />
        </div>
        {active === 'basic_auth' ? (
          <button
            type="button"
            className="self-start rounded border border-border px-2 py-1 text-xs text-text-muted hover:text-text"
            onClick={() => onChange('basic_auth', undefined)}
          >
            {t('http.remove')}
          </button>
        ) : null}
      </AuthGroup>

      <AuthGroup
        id="authorization"
        title={t('http.authorization')}
        active={active}
        onRemove={() => onChange('authorization', undefined)}
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextField
            label={t('http.authType')}
            value={asText(authorization['type'])}
            disabled={blocked('authorization')}
            onChange={(value) => set('authorization', authorization, 'type', value)}
          />
          <ExclusiveField
            label={t('http.credentials')}
            type="password"
            value={asText(authorization['credentials'])}
            disabled={blocked('authorization')}
            conflict={isSet(authorization, 'credentials_file')}
            conflictLabel={t('http.credentialsFile')}
            onClearConflict={() => set('authorization', authorization, 'credentials_file', undefined)}
            onChange={(value) => set('authorization', authorization, 'credentials', value)}
          />
          <ExclusiveField
            label={t('http.credentialsFile')}
            value={asText(authorization['credentials_file'])}
            disabled={blocked('authorization')}
            conflict={isSet(authorization, 'credentials')}
            conflictLabel={t('http.credentials')}
            onClearConflict={() => set('authorization', authorization, 'credentials', undefined)}
            onChange={(value) => set('authorization', authorization, 'credentials_file', value)}
          />
        </div>
        {active === 'authorization' ? (
          <button
            type="button"
            className="self-start rounded border border-border px-2 py-1 text-xs text-text-muted hover:text-text"
            onClick={() => onChange('authorization', undefined)}
          >
            {t('http.remove')}
          </button>
        ) : null}
      </AuthGroup>

      <AuthGroup id="oauth2" title={t('http.oauth2')} active={active} onRemove={() => onChange('oauth2', undefined)}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextField
            label={t('http.clientId')}
            value={asText(oauth2['client_id'])}
            disabled={blocked('oauth2')}
            onChange={(value) => set('oauth2', oauth2, 'client_id', value)}
          />
          <ChoiceField
            label={t('http.grantType')}
            value={asText(oauth2['grant_type'])}
            options={GRANT_TYPES}
            disabled={blocked('oauth2')}
            onChange={(value) => set('oauth2', oauth2, 'grant_type', value)}
          />
          <ExclusiveField
            label={t('http.clientSecret')}
            type="password"
            value={asText(oauth2['client_secret'])}
            disabled={blocked('oauth2')}
            conflict={isSet(oauth2, 'client_secret_file')}
            conflictLabel={t('http.clientSecretFile')}
            onClearConflict={() => set('oauth2', oauth2, 'client_secret_file', undefined)}
            onChange={(value) => set('oauth2', oauth2, 'client_secret', value)}
          />
          <ExclusiveField
            label={t('http.clientSecretFile')}
            value={asText(oauth2['client_secret_file'])}
            disabled={blocked('oauth2')}
            conflict={isSet(oauth2, 'client_secret')}
            conflictLabel={t('http.clientSecret')}
            onClearConflict={() => set('oauth2', oauth2, 'client_secret', undefined)}
            onChange={(value) => set('oauth2', oauth2, 'client_secret_file', value)}
          />
          <ExclusiveField
            label={t('http.clientCertificateKey')}
            type="password"
            value={asText(oauth2['client_certificate_key'])}
            disabled={blocked('oauth2')}
            conflict={isSet(oauth2, 'client_certificate_key_file')}
            conflictLabel={t('http.clientCertificateKeyFile')}
            onClearConflict={() => set('oauth2', oauth2, 'client_certificate_key_file', undefined)}
            onChange={(value) => set('oauth2', oauth2, 'client_certificate_key', value)}
          />
          <ExclusiveField
            label={t('http.clientCertificateKeyFile')}
            value={asText(oauth2['client_certificate_key_file'])}
            disabled={blocked('oauth2')}
            conflict={isSet(oauth2, 'client_certificate_key')}
            conflictLabel={t('http.clientCertificateKey')}
            onClearConflict={() => set('oauth2', oauth2, 'client_certificate_key', undefined)}
            onChange={(value) => set('oauth2', oauth2, 'client_certificate_key_file', value)}
          />
          <TextField
            label={t('http.clientCertificateKeyId')}
            value={asText(oauth2['client_certificate_key_id'])}
            disabled={blocked('oauth2')}
            onChange={(value) => set('oauth2', oauth2, 'client_certificate_key_id', value)}
          />
          <ChoiceField
            label={t('http.signatureAlgorithm')}
            value={asText(oauth2['signature_algorithm'])}
            options={SIGNATURES}
            disabled={blocked('oauth2')}
            onChange={(value) => set('oauth2', oauth2, 'signature_algorithm', value)}
          />
          <TextField
            label={t('http.issuer')}
            value={asText(oauth2['iss'])}
            disabled={blocked('oauth2')}
            onChange={(value) => set('oauth2', oauth2, 'iss', value)}
          />
          <TextField
            label={t('http.audience')}
            value={asText(oauth2['audience'])}
            disabled={blocked('oauth2')}
            onChange={(value) => set('oauth2', oauth2, 'audience', value)}
          />
          <TextField
            label={t('http.tokenUrl')}
            value={asText(oauth2['token_url'])}
            disabled={blocked('oauth2')}
            onChange={(value) => set('oauth2', oauth2, 'token_url', value)}
          />
        </div>

        <StringListField
          label={t('http.scopes')}
          values={asList(oauth2['scopes'])}
          disabled={blocked('oauth2')}
          addLabel={t('http.add')}
          removeLabel={t('http.remove')}
          onChange={(values) => set('oauth2', oauth2, 'scopes', values)}
        />

        <StringMapEditor
          label={t('http.claims')}
          value={oauth2['claims']}
          disabled={blocked('oauth2')}
          onChange={(value) => set('oauth2', oauth2, 'claims', value)}
          keyLabel={t('grpc.metadataKey')}
          valueLabel={t('grpc.metadataValues')}
          addLabel={t('http.add')}
          removeLabel={t('http.remove')}
        />

        <StringMapEditor
          label={t('http.endpointParams')}
          value={oauth2['endpoint_params']}
          disabled={blocked('oauth2')}
          onChange={(value) => set('oauth2', oauth2, 'endpoint_params', value)}
          keyLabel={t('grpc.metadataKey')}
          valueLabel={t('grpc.metadataValues')}
          addLabel={t('http.add')}
          removeLabel={t('http.remove')}
          single
        />

        <TlsConfigForm
          block={oauth2}
          disabled={blocked('oauth2')}
          onChange={(key, value) => set('oauth2', oauth2, key, value)}
          showCheckRevoked={false}
        />

        {active === 'oauth2' ? (
          <button
            type="button"
            className="self-start rounded border border-border px-2 py-1 text-xs text-text-muted hover:text-text"
            onClick={() => onChange('oauth2', undefined)}
          >
            {t('http.remove')}
          </button>
        ) : null}
      </AuthGroup>

      <AuthGroup id="ntlm" title={t('http.ntlm')} active={active} onRemove={() => onChange('ntlm', undefined)}>
        <p className="text-[11px] text-text-muted">{t('http.ntlmHint')}</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextField
            label={t('http.ntlmUser')}
            value={asText(ntlm['username'])}
            disabled={blocked('ntlm')}
            onChange={(value) => set('ntlm', ntlm, 'username', value)}
          />
          <TextField
            label={t('http.ntlmPassword')}
            type="password"
            value={asText(ntlm['password'])}
            disabled={blocked('ntlm')}
            onChange={(value) => set('ntlm', ntlm, 'password', value)}
          />
          <TextField
            label={t('http.domain')}
            value={asText(ntlm['domain'])}
            disabled={blocked('ntlm')}
            onChange={(value) => set('ntlm', ntlm, 'domain', value)}
          />
          <TextField
            label={t('http.workstation')}
            value={asText(ntlm['workstation'])}
            disabled={blocked('ntlm')}
            onChange={(value) => set('ntlm', ntlm, 'workstation', value)}
          />
          <ChoiceField
            label={t('http.authScheme')}
            value={asText(ntlm['auth_scheme'])}
            options={[
              { value: 'NTLM', label: 'NTLM' },
              { value: 'Negotiate', label: 'Negotiate' },
            ]}
            disabled={blocked('ntlm')}
            onChange={(value) => set('ntlm', ntlm, 'auth_scheme', value)}
          />
        </div>
        {active === 'ntlm' ? (
          <button
            type="button"
            className="self-start rounded border border-border px-2 py-1 text-xs text-text-muted hover:text-text"
            onClick={() => onChange('ntlm', undefined)}
          >
            {t('http.remove')}
          </button>
        ) : null}
      </AuthGroup>
    </GroupProvider>
  )
}
