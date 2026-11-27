import { useState } from 'react'

import { isMappingValue } from '@shared/document/index.ts'
import type { Mapping } from '@shared/document/index.ts'

import { useI18n } from '../../../lib/i18n/index.tsx'
import { asJoinedList, asText, isSet, parseNumberList, parseTextList } from '../values.ts'
import { AuthForms } from './AuthForms.tsx'
import { ComboField } from './ComboField.tsx'
import { ConditionsForm } from './ConditionsForm.tsx'
import { Group, GroupProvider } from './Group.tsx'
import { HttpHeadersForm } from './HttpHeadersForm.tsx'
import { ProxyFields } from './ProxyFields.tsx'
import { TlsConfigForm } from './TlsConfigForm.tsx'
import { ChoiceField, Section, TextField, TriStateField } from './fields.tsx'
import { ExclusiveField } from './ExclusiveField.tsx'

interface HttpFormProps {
  readonly block: Mapping
  readonly disabled: boolean
  readonly onChange: (key: string, value: unknown) => void
}

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']
const STATUS_CODES = ['200', '204', '301', '302', '400', '401', '403', '404', '500']
const VERSIONS = ['HTTP/1.0', 'HTTP/1.1', 'HTTP/2.0', 'HTTP/3.0']
const SIZES = ['0', '1MB', '10MB', '100MB']
const COMPRESSIONS = [
  { value: 'gzip', label: 'gzip' },
  { value: 'br', label: 'br' },
  { value: 'deflate', label: 'deflate' },
  { value: 'identity', label: 'identity' },
]
const PROTOCOLS = [
  { value: 'ip4', label: 'ip4' },
  { value: 'ip6', label: 'ip6' },
]

export function HttpForm({ block, disabled, onChange }: HttpFormProps) {
  const { t } = useI18n()
  const headers = isMappingValue(block['headers']) ? block['headers'] : {}
  const [pendingName, setPendingName] = useState('')
  const [pendingValue, setPendingValue] = useState('')

  const addHeader = () => {
    const name = pendingName.trim()
    if (name === '') return
    onChange('headers', { ...headers, [name]: pendingValue })
    setPendingName('')
    setPendingValue('')
  }

  const removeHeader = (name: string) => {
    const next: Mapping = { ...headers }
    delete next[name]
    onChange('headers', Object.keys(next).length === 0 ? undefined : next)
  }

  return (
    <Section title={t('http.legend')}>
      <GroupProvider defaultOpen="basic" allowClose={false}>
        <Group id="basic" title={t('group.basic')}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <ComboField
              label={t('http.method')}
              value={asText(block['method'])}
              options={METHODS}
              disabled={disabled}
              onChange={(value) => onChange('method', value)}
            />
            <ComboField
              label={t('http.statusCodes')}
              value={asJoinedList(block['valid_status_codes'])}
              options={STATUS_CODES}
              disabled={disabled}
              placeholder={t('http.statusCodesHint')}
              onChange={(value) =>
                onChange('valid_status_codes', value === undefined ? undefined : parseNumberList(value))
              }
            />
          </div>

          <TriStateField
            label={t('http.followRedirects')}
            value={block['follow_redirects']}
            disabled={disabled}
            onChange={(value) => onChange('follow_redirects', value)}
          />

          <ExclusiveField
            label={t('http.body')}
            value={asText(block['body'])}
            disabled={disabled}
            multiline
            conflict={isSet(block, 'body_file')}
            conflictLabel={t('http.bodyFile')}
            onClearConflict={() => onChange('body_file', undefined)}
            onChange={(value) => onChange('body', value)}
          />
        </Group>

        <Group id="medium" title={t('group.medium')}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <ComboField
              label={t('http.versions')}
              value={asJoinedList(block['valid_http_versions'])}
              options={VERSIONS}
              disabled={disabled}
              placeholder={t('http.versionsHint')}
              onChange={(value) =>
                onChange('valid_http_versions', value === undefined ? undefined : parseTextList(value))
              }
            />
            <ComboField
              label={t('http.bodySize')}
              value={asText(block['body_size_limit'])}
              options={SIZES}
              disabled={disabled}
              onChange={(value) => onChange('body_size_limit', value)}
            />
            <ChoiceField
              label={t('http.compression')}
              value={asText(block['compression'])}
              options={COMPRESSIONS}
              disabled={disabled}
              onChange={(value) => onChange('compression', value)}
            />
            <ExclusiveField
              label={t('http.bodyFile')}
              value={asText(block['body_file'])}
              disabled={disabled}
              conflict={isSet(block, 'body')}
              conflictLabel={t('http.body')}
              onClearConflict={() => onChange('body', undefined)}
              onChange={(value) => onChange('body_file', value)}
            />
            <ChoiceField
              label={t('http.preferredIp')}
              value={asText(block['preferred_ip_protocol'])}
              options={PROTOCOLS}
              disabled={disabled}
              onChange={(value) => onChange('preferred_ip_protocol', value)}
            />
          </div>

          <div className="flex flex-wrap gap-4">
            <TriStateField
              label={t('http.ipFallback')}
              value={block['ip_protocol_fallback']}
              disabled={disabled}
              onChange={(value) => onChange('ip_protocol_fallback', value)}
            />
            <TriStateField
              label={t('http.failIfSsl')}
              value={block['fail_if_ssl']}
              disabled={disabled}
              onChange={(value) => onChange('fail_if_ssl', value)}
            />
            <TriStateField
              label={t('http.failIfNotSsl')}
              value={block['fail_if_not_ssl']}
              disabled={disabled}
              onChange={(value) => onChange('fail_if_not_ssl', value)}
            />
            <TriStateField
              label={t('http.http2')}
              value={block['enable_http2']}
              disabled={disabled}
              onChange={(value) => onChange('enable_http2', value)}
            />
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-xs text-text-muted">{t('http.headers')}</span>
            {Object.entries(headers).map(([name, value]) => (
              <div key={name} className="flex items-center gap-2 text-xs text-text">
                <span className="font-mono">{name}</span>
                <span className="text-text-muted">{String(value)}</span>
                <button
                  type="button"
                  className="rounded border border-border px-2 py-1 text-xs text-text-muted hover:text-text"
                  disabled={disabled}
                  onClick={() => removeHeader(name)}
                >
                  {t('http.remove')}
                </button>
              </div>
            ))}
            <div className="flex flex-wrap items-end gap-2">
              <TextField
                label={t('http.headerName')}
                value={pendingName}
                disabled={disabled}
                onChange={(value) => setPendingName(value ?? '')}
              />
              <TextField
                label={t('http.headerValue')}
                value={pendingValue}
                disabled={disabled}
                onChange={(value) => setPendingValue(value ?? '')}
              />
              <button
                type="button"
                className="rounded border border-border px-3 py-1 text-xs text-text-muted hover:text-text"
                disabled={disabled || pendingName.trim() === ''}
                onClick={addHeader}
              >
                {t('http.addHeader')}
              </button>
            </div>
          </div>
        </Group>

        <Group id="advanced" title={t('group.advanced')}>
          <TriStateField
            label={t('http.http3')}
            value={block['enable_http3']}
            disabled={disabled}
            onChange={(value) => onChange('enable_http3', value)}
          />

          <GroupProvider>
            <Group id="checks" title={t('http.conditions')}>
              <ConditionsForm block={block} disabled={disabled} onChange={onChange} framed={false} />
            </Group>

            <Group id="extraHeaders" title={t('http.httpHeaders')}>
              <HttpHeadersForm block={block} disabled={disabled} onChange={onChange} framed={false} />
            </Group>

            <Group id="tls" title={t('http.tls')}>
              <TlsConfigForm block={block} disabled={disabled} onChange={onChange} framed={false} />
            </Group>

            <Group id="auth" title={t('group.authentication')}>
              <AuthForms block={block} disabled={disabled} onChange={onChange} />
            </Group>

            <Group id="proxy" title={t('http.proxy')}>
              <ProxyFields block={block} disabled={disabled} onChange={onChange} />
              <TriStateField
                label={t('http.skipResolve')}
                value={block['skip_resolve_phase_with_proxy']}
                disabled={disabled}
                onChange={(value) => onChange('skip_resolve_phase_with_proxy', value)}
              />
            </Group>
          </GroupProvider>
        </Group>
      </GroupProvider>
    </Section>
  )
}
