import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { extname, normalize, resolve, sep } from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
}

export interface StaticOptions {
  /** File served when the path is not a file; `null` answers `404` instead. */
  readonly fallback?: string | null
}

/**
 * Serves the built interface from `dist/`. Any unknown path falls back to the
 * configured document (`index.html` by default), and a path that escapes the
 * directory is refused.
 */
export async function serveStatic(
  root: string,
  request: IncomingMessage,
  response: ServerResponse,
  options: StaticOptions = {},
): Promise<void> {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { 'content-type': 'text/plain; charset=utf-8' })
    response.end('Method not allowed')
    return
  }

  const rootDir = resolve(root)
  // `new URL` collapses `..` before it can be seen, so the raw request path is
  // read here; only an absolute-form request falls back to the parser.
  const rawUrl = request.url ?? '/'
  const rawPath = rawUrl.startsWith('/')
    ? rawUrl.slice(0, rawUrl.indexOf('?') === -1 ? undefined : rawUrl.indexOf('?'))
    : new URL(rawUrl, 'http://localhost').pathname

  let requested: string
  try {
    requested = decodeURIComponent(rawPath)
  } catch {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
    response.end('Not found')
    return
  }

  // A parent segment is refused instead of normalised away: the answer is the
  // same on every platform and a traversal attempt never reaches the disk.
  if (requested.split(/[\\/]+/).some((segment) => segment === '..')) {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
    response.end('Not found')
    return
  }

  const candidate = resolve(rootDir, normalize(requested).replace(/^[/\\]+/, ''))

  if (candidate !== rootDir && !candidate.startsWith(rootDir + sep)) {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
    response.end('Not found')
    return
  }

  const fallback = options.fallback === undefined ? 'index.html' : options.fallback
  if (await isFile(candidate)) {
    await sendFile(candidate, request, response, cacheFor(candidate, requested, rootDir))
    return
  }
  if (fallback === null) {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
    response.end('Not found')
    return
  }
  await sendFile(resolve(rootDir, fallback), request, response, 'no-cache')
}

/** One built document by name, served without a cache, as the gate requires. */
export async function serveDocument(
  root: string,
  name: string,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { 'content-type': 'text/plain; charset=utf-8' })
    response.end('Method not allowed')
    return
  }
  await sendFile(resolve(root, name), request, response, 'no-store')
}

function cacheFor(file: string, requested: string, rootDir: string): string {
  if (file === resolve(rootDir, 'index.html')) return 'no-cache'
  if (/\/assets\/[^/]+-[A-Za-z0-9_-]+\.(?:js|css)$/.test(requested)) return 'public, max-age=31536000, immutable'
  return 'public, max-age=3600'
}

async function sendFile(
  file: string,
  request: IncomingMessage,
  response: ServerResponse,
  cacheControl: string,
): Promise<void> {
  try {
    const info = await stat(file)
    response.writeHead(200, {
      'content-type': TYPES[extname(file)] ?? 'application/octet-stream',
      'content-length': info.size,
      'cache-control': cacheControl,
    })
    if (request.method === 'HEAD') {
      response.end()
      return
    }

    const stream = createReadStream(file)
    stream.on('error', () => {
      if (!response.headersSent) {
        response.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' })
        response.end('Internal error')
      } else {
        response.destroy()
      }
    })
    stream.pipe(response)
  } catch {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
    response.end('Not found')
  }
}

async function isFile(path: string): Promise<boolean> {
  try {
    const info = await stat(path)
    return info.isFile()
  } catch {
    return false
  }
}
