import { useEffect, useMemo, useState } from 'react'

import {
  getProbeConfiguration,
  isMappingValue,
  listProbeConfigurations,
  parseDocument,
  serializeDocument,
  validateDocument,
} from '@shared/document/index.ts'
import type { DocumentIssue, ExporterDocument } from '@shared/document/index.ts'

import { ApiError } from '../../../lib/api/index.ts'
import { useToken } from '../../../lib/api/token.tsx'
import { useI18n } from '../../../lib/i18n/index.tsx'
import { useConfigurationFile, useSaveConfiguration } from '../api.ts'
import {
  addProbeConfiguration,
  addQuickConfiguration,
  removeProbeConfiguration,
  renameProbeConfiguration,
  duplicateProbeConfiguration,
  setProbeField,
  setProberField,
} from '../state/document.ts'
import type { QuickConfiguration } from '../state/document.ts'
import { ProbeList } from './ProbeList.tsx'
import { ProbeDialog } from './ProbeDialog.tsx'
import { ProberForm } from './ProberForm.tsx'
import { QuickCheckDialog } from './QuickCheckDialog.tsx'
import { NewProbeDialog } from './NewProbeDialog.tsx'
import { HistoryDialog } from './HistoryDialog.tsx'
import { TokenGeneratorDialog } from './TokenGeneratorDialog.tsx'
import { PreviewDialog } from './PreviewDialog.tsx'

function firstModuleName(document: ExporterDocument): string | undefined {
  const modules = document.raw['modules']
  return isMappingValue(modules) ? Object.keys(modules)[0] : undefined
}

export function ConfigurationPage() {
  const { t, translate } = useI18n()
  const { setToken } = useToken()

  const query = useConfigurationFile()
  const save = useSaveConfiguration()

  const [draft, setDraft] = useState<ExporterDocument | null>(null)
  const [parseIssues, setParseIssues] = useState<readonly DocumentIssue[]>([])
  const [selected, setSelected] = useState<string | undefined>(undefined)
  const [dirty, setDirty] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [drift, setDrift] = useState<{ revision: string; lastWrite: string | null } | null>(null)
  const [renaming, setRenaming] = useState('')
  const [probeOpen, setProbeOpen] = useState(false)
  const [quickOpen, setQuickOpen] = useState(false)
  const [newOpen, setNewOpen] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [tokenOpen, setTokenOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)

  useEffect(() => {
    if (query.data === undefined) return
    const parsed = query.data.exists
      ? parseDocument(query.data.text)
      : { ok: true as const, document: { raw: { modules: {} } } }
    if (parsed.ok) {
      setDraft(parsed.document)
      setParseIssues([])
      setDrift(null)
      setSelected((current) => current ?? firstModuleName(parsed.document))
    } else {
      setDraft(null)
      setParseIssues(parsed.issues)
    }
  }, [query.data])

  useEffect(() => {
    setRenaming(selected ?? '')
  }, [selected])

  const issues = useMemo(() => (draft === null ? parseIssues : validateDocument(draft)), [draft, parseIssues])
  const blocking = issues.filter((issue) => issue.severity === 'blocking')
  const preview = useMemo(() => (draft === null ? '' : serializeDocument(draft)), [draft])

  const items = draft === null ? [] : listProbeConfigurations(draft)
  const module = draft === null || selected === undefined ? undefined : getProbeConfiguration(draft, selected)
  const prober = module === undefined ? undefined : module['prober']
  const readOnly = query.data?.exists === true && query.data.mode !== 'read-write'
  const disabled = readOnly || draft === null

  const update = (next: ExporterDocument | null) => {
    if (next === null) return
    setDraft(next)
    setDirty(true)
    setMessage(null)
  }

  const commitRename = () => {
    if (draft === null || selected === undefined || renaming.trim() === selected) return
    const renamed = renameProbeConfiguration(draft, selected, renaming)
    if (renamed === null) {
      setRenaming(selected)
      return
    }
    update(renamed)
    setSelected(renaming.trim())
  }

  const onSave = () => {
    if (query.data === undefined || draft === null) return
    setMessage(null)
    save.mutate(
      { text: serializeDocument(draft), revision: drift?.revision ?? query.data.revision },
      {
        onSuccess: () => {
          setDirty(false)
          setDrift(null)
          setMessage(t('save.saved'))
        },
        onError: (error) => {
          if (error instanceof ApiError && error.status === 409 && error.revision !== undefined) {
            setDrift({ revision: error.revision, lastWrite: error.lastWrite })
            return
          }
          const key = error instanceof ApiError ? error.key : 'save.failed'
          setMessage(translate(key))
        },
      },
    )
  }

  const onReload = () => {
    setDrift(null)
    setDirty(false)
    setMessage(null)
    void query.refetch()
  }

  const onDiscard = () => {
    if (query.data === undefined) return
    const parsed = query.data.exists
      ? parseDocument(query.data.text)
      : { ok: true as const, document: { raw: { modules: {} } } }
    if (parsed.ok) {
      setDraft(parsed.document)
      setParseIssues([])
      const first = firstModuleName(parsed.document)
      setSelected(first)
      setRenaming(first ?? '')
    } else {
      setDraft(null)
      setParseIssues(parsed.issues)
    }
    setDirty(false)
    setDrift(null)
    setMessage(null)
    setProbeOpen(false)
    setQuickOpen(false)
    setNewOpen(false)
    setPreviewOpen(false)
    setTokenOpen(false)
    setHistoryOpen(false)
    void query.refetch()
  }

  const saveQuick = (name: string, settings: QuickConfiguration): boolean => {
    if (draft === null) return false
    const next = addQuickConfiguration(draft, name, settings)
    if (next === null) return false
    update(next)
    setSelected(name.trim())
    setQuickOpen(false)
    return true
  }

  const createProbe = (name: string, prober: string): boolean => {
    if (draft === null) return false
    const created = addProbeConfiguration(draft, name, prober)
    if (created === null) return false
    update(created)
    setSelected(name.trim())
    return true
  }

  if (query.isPending) {
    return <p className="text-sm text-text-muted">{t('app.loading')}</p>
  }

  if (query.isError) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p className="text-sm text-text">{t('app.loadFailed')}</p>
        <button
          type="button"
          className="rounded border border-border px-3 py-1 text-sm text-text"
          onClick={() => void query.refetch()}
        >
          {t('app.retry')}
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {query.data.exists ? null : (
        <p role="status" className="text-xs text-text-muted">
          {t('file.missing')}
        </p>
      )}

      {readOnly ? (
        <section className="flex flex-col gap-2 rounded border border-border bg-surface-raised p-4">
          <h2 className="text-sm font-semibold text-text">{t('readOnly.title')}</h2>
          <p className="text-sm text-text-muted">{t('readOnly.body')}</p>
        </section>
      ) : (
        <>
          <p className="-mt-8 flex flex-wrap items-baseline gap-x-2 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            <span className="font-semibold text-red-700">{t('config.modeBadge')}</span>
            <span>{t('config.modeText')}</span>
          </p>

          {drift === null ? null : (
            <section
              role="alert"
              className="flex flex-wrap items-center gap-3 rounded border border-accent bg-accent/10 px-3 py-2 text-xs text-text"
            >
              <p className="flex-1">
                {t('service.drift')}
                {drift.lastWrite === null ? null : (
                  <span className="ml-2 font-mono text-text-muted">{drift.lastWrite}</span>
                )}
              </p>
              <button type="button" className="rounded border border-border px-3 py-1 text-text" onClick={onReload}>
                {t('drift.reload')}
              </button>
              <button
                type="button"
                className="rounded border border-accent px-3 py-1 text-accent disabled:opacity-40"
                disabled={save.isPending}
                onClick={onSave}
              >
                {t('drift.overwrite')}
              </button>
            </section>
          )}

          <div className="grid grid-cols-1 gap-8 lg:grid-cols-[21rem_1fr]">
            <div className="flex flex-col gap-3">
              {message === null ? null : <span className="text-xs text-text-muted">{message}</span>}

              <ProbeList
                items={items}
                selected={selected}
                disabled={disabled}
                testDisabled={dirty || save.isPending}
                onSelect={setSelected}
                onTest={(name) => {
                  setSelected(name)
                  setProbeOpen(true)
                }}
                onDuplicate={(name) => {
                  const copy = draft === null ? null : duplicateProbeConfiguration(draft, name)
                  if (copy === null) return
                  update(copy.document)
                  setSelected(copy.name)
                }}
                onDelete={(name) => {
                  if (draft === null) return
                  const remaining = removeProbeConfiguration(draft, name)
                  update(remaining)
                  if (selected === name) setSelected(firstModuleName(remaining))
                }}
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  className="h-9 flex-1 rounded border border-border px-3 text-sm text-text-muted hover:text-text disabled:opacity-40"
                  disabled={disabled}
                  onClick={() => setQuickOpen(true)}
                >
                  {t('quick.open')}
                </button>
                <button
                  type="button"
                  className="h-9 rounded border border-border px-3 text-sm text-text-muted hover:text-text disabled:opacity-40"
                  disabled={disabled}
                  onClick={() => setNewOpen(true)}
                >
                  {t('new.open')}
                </button>
              </div>
              <button
                type="button"
                className="h-9 w-full rounded border border-border px-3 text-sm text-text-muted hover:text-text disabled:opacity-40"
                disabled={draft === null}
                onClick={() => setPreviewOpen(true)}
              >
                {t('preview.title')}
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="h-9 flex-1 rounded border border-border px-3 text-sm text-text-muted hover:text-text disabled:opacity-40"
                  disabled={disabled || dirty}
                  title={dirty ? t('token.saveFirst') : undefined}
                  onClick={() => setTokenOpen(true)}
                >
                  {t('token.generate')}
                </button>
                <button
                  type="button"
                  className="h-9 flex-1 rounded border border-border px-3 text-sm text-text-muted hover:text-text disabled:opacity-40"
                  disabled={disabled}
                  onClick={() => setHistoryOpen(true)}
                >
                  {t('token.history')}
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-4">
              {dirty ? (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded border border-amber-300 bg-amber-50 px-3 py-2">
                  <p className="text-sm font-medium text-amber-800">{t('discard.line')}</p>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      className="text-xs text-text-muted underline-offset-2 hover:text-text hover:underline disabled:opacity-40"
                      disabled={save.isPending}
                      onClick={onDiscard}
                    >
                      {t('action.discard')}
                    </button>
                    <span aria-hidden="true" className="h-5 w-px bg-border" />
                    <button
                      type="button"
                      className="rounded border border-accent bg-accent px-3 py-1 text-xs font-medium text-surface disabled:opacity-40"
                      disabled={blocking.length > 0 || save.isPending}
                      onClick={onSave}
                    >
                      {save.isPending ? t('action.saving') : t('action.save')}
                    </button>
                  </div>
                </div>
              ) : null}

              {module === undefined ? null : (
                <section className="flex flex-col gap-4 rounded border border-border p-4">
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-text-muted">{t('editor.title')}</h2>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <label className="flex flex-col gap-1 text-xs text-text-muted">
                      <span>{t('list.name')}</span>
                      <input
                        className="rounded border border-border bg-surface px-2 py-1 text-sm text-text"
                        value={renaming}
                        disabled={disabled}
                        onChange={(event) => setRenaming(event.target.value)}
                        onBlur={commitRename}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') commitRename()
                        }}
                      />
                    </label>

                    <div className="flex flex-col gap-1 text-xs text-text-muted">
                      <span>{t('editor.prober')}</span>
                      <output className="rounded border border-border bg-surface-raised px-2 py-1 text-sm text-text">
                        {typeof prober === 'string' ? translate(`prober.${prober}`) : ''}
                      </output>
                      <span className="text-[11px]">{t('editor.proberFixed')}</span>
                    </div>

                    <label className="flex flex-col gap-1 text-xs text-text-muted">
                      <span>{t('editor.timeout')}</span>
                      <input
                        className="rounded border border-border bg-surface px-2 py-1 text-sm text-text"
                        placeholder="5s"
                        value={typeof module['timeout'] === 'string' ? module['timeout'] : ''}
                        disabled={disabled}
                        onChange={(event) =>
                          update(
                            draft === null || selected === undefined
                              ? null
                              : setProbeField(
                                  draft,
                                  selected,
                                  'timeout',
                                  event.target.value === '' ? undefined : event.target.value,
                                ),
                          )
                        }
                      />
                    </label>
                  </div>

                  {typeof prober === 'string' ? (
                    <ProberForm
                      prober={prober}
                      block={isMappingValue(module[prober]) ? module[prober] : {}}
                      disabled={disabled}
                      onChange={(key, value) =>
                        update(
                          draft === null || selected === undefined
                            ? null
                            : setProberField(draft, selected, prober, key, value),
                        )
                      }
                    />
                  ) : null}
                </section>
              )}

              {issues.length === 0 ? null : (
                <ul className="flex flex-col gap-1 text-xs text-text-muted">
                  {issues.map((issue) => (
                    <li key={`${issue.path}:${issue.key}`}>
                      <span className="font-mono">{issue.path || t('issue.document')}</span> — {translate(issue.key)}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </>
      )}

      {probeOpen && selected !== undefined ? (
        <ProbeDialog
          module={selected}
          prober={typeof prober === 'string' ? prober : ''}
          onClose={() => setProbeOpen(false)}
        />
      ) : null}

      {quickOpen ? <QuickCheckDialog onClose={() => setQuickOpen(false)} onCreate={saveQuick} /> : null}

      {newOpen ? <NewProbeDialog onClose={() => setNewOpen(false)} onCreate={createProbe} /> : null}

      {previewOpen ? <PreviewDialog text={preview} onClose={() => setPreviewOpen(false)} /> : null}

      {tokenOpen ? (
        <TokenGeneratorDialog onClose={() => setTokenOpen(false)} onGenerated={(value) => setToken(value)} />
      ) : null}

      {historyOpen ? <HistoryDialog onClose={() => setHistoryOpen(false)} /> : null}
    </div>
  )
}
