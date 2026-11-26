import { isMappingValue } from '@shared/document/index.ts'
import type { Mapping } from '@shared/document/index.ts'

import { useI18n } from '../../../lib/i18n/index.tsx'
import { AuthForms } from './AuthForms.tsx'
import { Group, GroupProvider } from './Group.tsx'
import { HttpHeadersForm } from './HttpHeadersForm.tsx'
import { IpFields } from './IpFields.tsx'
import { ProxyFields } from './ProxyFields.tsx'
import { QueryResponseForm } from './QueryResponseForm.tsx'
import { TlsConfigForm } from './TlsConfigForm.tsx'
import { Section, TriStateField } from './fields.tsx'

interface WebsocketFormProps {
  readonly block: Mapping
  readonly disabled: boolean
  readonly onChange: (key: string, value: unknown) => void
}

export function WebsocketForm({ block, disabled, onChange }: WebsocketFormProps) {
  const { t } = useI18n()
  const httpConfig = isMappingValue(block['http_config']) ? block['http_config'] : {}

  const setHttpConfig = (key: string, value: unknown) => {
    const next: Mapping = { ...httpConfig }
    if (value === undefined) delete next[key]
    else next[key] = value
    onChange('http_config', Object.keys(next).length === 0 ? undefined : next)
  }

  return (
    <Section title={t('websocket.legend')}>
      <GroupProvider defaultOpen="basic" allowClose={false}>
        <Group id="basic" title={t('group.basic')}>
          <TriStateField
            label={t('websocket.followRedirects')}
            value={httpConfig['follow_redirects']}
            disabled={disabled}
            onChange={(value) => setHttpConfig('follow_redirects', value)}
          />

          <HttpHeadersForm
            block={block}
            disabled={disabled}
            onChange={onChange}
            field="headers"
            title={t('websocket.headers')}
          />

          <QueryResponseForm
            value={block['query_response']}
            disabled={disabled}
            full={false}
            onChange={(value) => onChange('query_response', value)}
          />
        </Group>

        <Group id="medium" title={t('group.medium')}>
          <IpFields block={block} disabled={disabled} onChange={onChange} />
          <TriStateField
            label={t('http.http2')}
            value={httpConfig['enable_http2']}
            disabled={disabled}
            onChange={(value) => setHttpConfig('enable_http2', value)}
          />
          <TlsConfigForm block={httpConfig} disabled={disabled} onChange={setHttpConfig} showCheckRevoked={false} />
        </Group>

        <Group id="advanced" title={t('group.advanced')}>
          <GroupProvider>
            <Group id="auth" title={t('group.authentication')}>
              <AuthForms block={httpConfig} disabled={disabled} onChange={setHttpConfig} />
            </Group>

            <Group id="proxy" title={t('http.proxy')}>
              <ProxyFields block={httpConfig} disabled={disabled} onChange={setHttpConfig} />
            </Group>
          </GroupProvider>
        </Group>
      </GroupProvider>
    </Section>
  )
}
