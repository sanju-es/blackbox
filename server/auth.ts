import { randomBytes, timingSafeEqual } from 'node:crypto'
import { parse } from 'yaml'

import { parseDocument, serializeDocument } from '../shared/document/index.ts'
import type { FileStore } from './config-file.ts'

export const TOKEN_MIN_LENGTH = 16
export const TOKEN_MAX_LENGTH = 64
const TOKEN_PATTERN = /^\S+$/

export type TokenState =
  | { readonly kind: 'none' }
  | { readonly kind: 'set'; readonly token: string }
  | { readonly kind: 'invalid'; readonly reason: string }

/** Reads the optional `service.token` from the mounted file. */
export async function readToken(store: FileStore): Promise<TokenState> {
  const snapshot = await store.read()
  return tokenFromText(snapshot.text)
}

/** A fresh `service.token`: 32 random bytes in lowercase hexadecimal (`D-66`). */
export function generateToken(): string {
  return randomBytes(32).toString('hex')
}

/** The document with `service.token` set; `null` when the document does not parse. */
export function withToken(text: string, token: string): string | null {
  const parsed = parseDocument(text)
  if (!parsed.ok) return null
  const raw = parsed.document.raw
  const service = isMapping(raw['service']) ? { ...raw['service'] } : {}
  service['token'] = token
  return serializeDocument({ raw: { ...raw, service } })
}

/**
 * `service.token` is optional. An absent or empty value means the public
 * surface stays open; a present but malformed value fails closed.
 */
export function tokenFromText(text: string): TokenState {
  if (text.trim() === '') return { kind: 'none' }

  let parsed: unknown
  try {
    parsed = parse(text)
  } catch {
    return { kind: 'none' }
  }

  if (!isMapping(parsed)) return { kind: 'none' }
  const service = parsed['service']
  if (service === undefined || service === null) return { kind: 'none' }
  if (!isMapping(service)) return { kind: 'invalid', reason: 'service must be a mapping' }

  const token = service['token']
  if (token === undefined || token === null || token === '') return { kind: 'none' }
  if (typeof token !== 'string') return { kind: 'invalid', reason: 'service.token must be a string' }
  if (!TOKEN_PATTERN.test(token)) {
    return { kind: 'invalid', reason: 'service.token must not contain whitespace' }
  }
  if (token.length < TOKEN_MIN_LENGTH || token.length > TOKEN_MAX_LENGTH) {
    return {
      kind: 'invalid',
      reason: `service.token must be between ${TOKEN_MIN_LENGTH} and ${TOKEN_MAX_LENGTH} characters`,
    }
  }

  return { kind: 'set', token }
}

export function bearerToken(header: string | undefined): string | null {
  if (header === undefined) return null
  const match = /^Bearer\s+(.+)$/i.exec(header.trim())
  return match?.[1]?.trim() ?? null
}

/** Every protected route accepts the bearer header; the text routes also accept `?token=`. */
export function presentedToken(requestUrl: URL, authorization: string | undefined, allowQuery: boolean): string | null {
  const header = bearerToken(authorization)
  if (header !== null) return header
  return allowQuery ? requestUrl.searchParams.get('token') : null
}

export function tokenMatches(expected: string, provided: string): boolean {
  const left = Buffer.from(expected, 'utf8')
  const right = Buffer.from(provided, 'utf8')
  return left.length === right.length && timingSafeEqual(left, right)
}

function isMapping(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
