import { createServer } from 'node:http'
import type { ServerResponse } from 'node:http'
import { resolve } from 'node:path'

import { fileMode, handleApi, surfaceMode } from './api.ts'
import { generateToken, readToken, withToken } from './auth.ts'
import type { TokenState } from './auth.ts'
import { createChecker, parseSwitch } from './checker.ts'
import { createFileStore } from './config-file.ts'
import { serveDocument, serveStatic } from './static.ts'
import { renderRoot } from './surface.ts'

const port = Number(process.env['PORT'] ?? 9115)
const configFile = process.env['CONFIG_FILE'] ?? '/config/blackbox.yml'
const staticDir = resolve(process.env['STATIC_DIR'] ?? 'dist')

const metricsEnabled = readSwitch('CHECKER_METRICS_ENABLED', false)
const historyEnabled = readSwitch('CHECKER_HISTORY_ENABLED', false)

const store = createFileStore(configFile)
const checker = createChecker({ store, metricsEnabled, historyEnabled })

const initialToken = await readToken(store).catch(() => null)
if (initialToken?.kind === 'invalid') {
  console.error(`service.token: ${initialToken.reason}`)
  process.exit(1)
}

const generated = initialToken === null ? null : await ensureToken(initialToken)
if (generated !== null) {
  console.log('service.token: a token was generated in the configuration file; restart the service to use it')
  process.exit(0)
}

const STATIC_MODE_TTL_MS = 1000
let staticMode: { readonly at: number; readonly mode: Awaited<ReturnType<typeof surfaceMode>> } | null = null

async function modeForStatic(): Promise<Awaited<ReturnType<typeof surfaceMode>>> {
  const now = Date.now()
  if (staticMode !== null && now - staticMode.at < STATIC_MODE_TTL_MS) return staticMode.mode
  const mode = await surfaceMode(store)
  staticMode = { at: now, mode }
  return mode
}

const server = createServer((request, response) => {
  void (async () => {
    const handled = await handleApi(request, response, { store, checker })
    if (handled) return

    const pathname = new URL(request.url ?? '/', 'http://localhost').pathname
    const mode = await modeForStatic()
    if (!mode.ok) {
      response.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' })
      response.end('The configuration file could not be read\n')
      return
    }

    if (mode.readOnly) {
      if (pathname === '/') {
        response.writeHead(200, {
          'content-type': 'text/plain; charset=utf-8',
          'cache-control': 'no-store',
        })
        response.end(renderRoot())
        return
      }
      notFound(response)
      return
    }

    if (pathname === '/') {
      await serveDocument(staticDir, 'token.html', request, response)
      return
    }

    if (pathname === '/app' || pathname === '/app/') {
      await serveDocument(staticDir, 'index.html', request, response)
      return
    }

    if (pathname === '/history' || pathname === '/history/') {
      notFound(response)
      return
    }

    await serveStatic(staticDir, request, response, { fallback: null })
  })().catch(() => {
    if (!response.headersSent) {
      response.writeHead(500, { 'content-type': 'application/json; charset=utf-8' })
      response.end(JSON.stringify({ key: 'service.internal' }))
    } else {
      response.end()
    }
  })
})

function notFound(response: ServerResponse): void {
  response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
  response.end('Not found\n')
}

/**
 * A writable mount always carries `service.token` (`D-66`): the first start
 * generates one, writes it to the document and lets the process manager bring
 * the service back with it. The read-only mount keeps the token optional.
 */
async function ensureToken(state: TokenState): Promise<string | null> {
  if (state.kind !== 'none') return null
  const mode = await fileMode(store)
  if (mode !== 'read-write') return null
  const snapshot = await store.read()
  const token = generateToken()
  const text = withToken(snapshot.text.trim() === '' ? 'modules: {}\n' : snapshot.text, token)
  if (text === null) return null
  await store.write(text)
  return token
}

server.listen(port, () => {
  console.log(`file service listening on port ${port}`)
  console.log(`configuration file: ${configFile}`)
  console.log(`checker: metrics=${metricsEnabled} history=${historyEnabled}`)
})

/**
 * Both switches are read once, default to `false` and accept `true`/`false` in
 * any case; anything else stops the service and names the variable
 * (`D-26`, `D-29`, `D-38`).
 */
function readSwitch(name: string, fallback: boolean): boolean {
  const raw = process.env[name]
  const value = parseSwitch(raw, fallback)
  if (value === null) {
    console.error(`${name}: expected true or false, received "${raw ?? ''}"`)
    process.exit(1)
  }
  return value
}
