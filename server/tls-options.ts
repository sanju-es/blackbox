import { readFile } from 'node:fs/promises'
import type { ConnectionOptions } from 'node:tls'

import type { Mapping } from '../shared/document/index.ts'

/** The `tls_config` of a module as the TLS client options, shared by the engines. */
export async function tlsOptionsFor(host: string, tls: Mapping): Promise<ConnectionOptions> {
  const ca = await textOrFile(tls['ca'], tls['ca_file'])
  const cert = await textOrFile(tls['cert'], tls['cert_file'])
  const key = await textOrFile(tls['key'], tls['key_file'])
  const min = tlsVersion(str(tls['min_version']))
  const max = tlsVersion(str(tls['max_version']))
  return {
    servername: str(tls['server_name']) ?? host,
    rejectUnauthorized: !bool(tls['insecure_skip_verify'], false),
    ...(ca === undefined ? {} : { ca }),
    ...(cert === undefined ? {} : { cert }),
    ...(key === undefined ? {} : { key }),
    ...(min === undefined ? {} : { minVersion: min }),
    ...(max === undefined ? {} : { maxVersion: max }),
  }
}

async function textOrFile(value: unknown, file: unknown): Promise<string | undefined> {
  const direct = str(value)
  if (direct !== undefined) return direct
  const path = str(file)
  return path === undefined ? undefined : readFile(path, 'utf8')
}

function tlsVersion(value: string | undefined): ConnectionOptions['minVersion'] {
  switch (value) {
    case 'TLS10':
      return 'TLSv1'
    case 'TLS11':
      return 'TLSv1.1'
    case 'TLS12':
      return 'TLSv1.2'
    case 'TLS13':
      return 'TLSv1.3'
    default:
      return undefined
  }
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}
