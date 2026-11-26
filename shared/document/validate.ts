import { isMappingValue } from './parse.ts'
import { isProberName, PROBERS } from './types.ts'
import type { DocumentIssue, ExporterDocument, Mapping } from './types.ts'

const DURATION = /^[0-9]+(ms|[smhdwy])$/
const BODY_SIZE = /^(?:-1|[0-9]+(?:\.[0-9]+)?\s?(?:B|KB|MB|GB|KiB|MiB|GiB)?)$/i
const HTTP_VERSIONS = new Set(['HTTP/1.0', 'HTTP/1.1', 'HTTP/2.0', 'HTTP/3.0'])
const IP_PROTOCOLS = new Set(['ip4', 'ip6'])
const TLS_VERSIONS = ['TLS10', 'TLS11', 'TLS12', 'TLS13'] as const
const DNS_TYPES = new Set(['A', 'AAAA', 'CNAME', 'MX', 'NS', 'PTR', 'SOA', 'SRV', 'TXT', 'CAA', 'ANY'])
const DNS_CLASSES = new Set(['IN', 'CH', 'HS', 'NONE', 'ANY'])
const DNS_RCODES = new Set([
  'NOERROR',
  'FORMERR',
  'SERVFAIL',
  'NXDOMAIN',
  'NOTIMP',
  'REFUSED',
  'NXRRSET',
  'NOTAUTH',
  'NOTZONE',
  'BADVERS',
])
const DNS_TRANSPORTS = new Set(['udp', 'tcp'])
const DNS_REGEX_GROUPS = ['validate_answer_rrs', 'validate_authority_rrs', 'validate_additional_rrs'] as const
const DNS_REGEX_KEYS = [
  'fail_if_matches_regexp',
  'fail_if_all_match_regexp',
  'fail_if_not_matches_regexp',
  'fail_if_none_matches_regexp',
] as const
const HTTP_REGEX_KEYS = ['fail_if_body_matches_regexp', 'fail_if_body_not_matches_regexp'] as const

/** Pairs the exporter declares mutually exclusive, checked wherever they appear. */
const EXCLUSIVE_PAIRS = [
  ['body', 'body_file'],
  ['ca', 'ca_file'],
  ['cert', 'cert_file'],
  ['key', 'key_file'],
  ['credentials', 'credentials_file'],
  ['client_secret', 'client_secret_file'],
  ['client_certificate_key', 'client_certificate_key_file'],
  ['username', 'username_file'],
  ['password', 'password_file'],
  ['expect', 'expect_bytes'],
] as const

const NESTED_BLOCKS = ['tls_config', 'basic_auth', 'authorization', 'oauth2', 'http_config'] as const

/** The document accepts one authentication block, never two; `ntlm` is the service extension. */
const AUTH_BLOCKS = ['basic_auth', 'authorization', 'oauth2', 'ntlm'] as const

/** A pair only conflicts when both halves carry a value; an empty YAML key reads as unset. */
const isPresent = (value: unknown): boolean => value !== undefined && value !== null

/**
 * Checks the whole document before a write (FR-20, D-16). A blocking issue
 * stops the save; a warning is shown and the value is preserved as it is.
 */
export function validateDocument(document: ExporterDocument): DocumentIssue[] {
  const issues: DocumentIssue[] = []
  const modules = document.raw['modules']

  if (!isMappingValue(modules)) {
    issues.push({ path: 'modules', key: 'document.modules', severity: 'blocking' })
    return issues
  }

  for (const [name, value] of Object.entries(modules)) {
    const path = `modules.${name}`

    if (name.trim() === '') {
      issues.push({ path, key: 'form.module.name', severity: 'blocking' })
    }

    if (!isMappingValue(value)) {
      issues.push({ path, key: 'form.module.shape', severity: 'blocking' })
      continue
    }

    validateModule(name, value, issues)
  }

  return issues
}

function validateModule(name: string, module: Mapping, issues: DocumentIssue[]): void {
  const path = `modules.${name}`
  const prober = module['prober']

  if (typeof prober !== 'string' || prober.trim() === '') {
    issues.push({ path: `${path}.prober`, key: 'form.prober.required', severity: 'blocking' })
  }

  const timeout = module['timeout']
  if (timeout !== undefined && (typeof timeout !== 'string' || !DURATION.test(timeout))) {
    issues.push({ path: `${path}.timeout`, key: 'form.timeout.format', severity: 'blocking' })
  }

  const blocks = PROBERS.filter((candidate) => module[candidate] !== undefined)

  if (blocks.length > 1) {
    issues.push({ path, key: 'form.block.multiple', severity: 'blocking' })
    return
  }

  if (isProberName(prober)) {
    const block = module[prober]
    if (block === undefined) {
      issues.push({ path: `${path}.${prober}`, key: 'form.block.required', severity: 'blocking' })
    } else if (!isMappingValue(block)) {
      issues.push({ path: `${path}.${prober}`, key: 'form.block.shape', severity: 'blocking' })
    } else {
      checkExclusive(`${path}.${prober}`, block, issues)
    }
  } else {
    for (const candidate of PROBERS) {
      const block = module[candidate]
      if (isMappingValue(block)) checkExclusive(`${path}.${candidate}`, block, issues)
    }
  }

  validateKnownBlocks(path, module, issues)
}

function validateKnownBlocks(path: string, module: Mapping, issues: DocumentIssue[]): void {
  const http = module['http']
  if (isMappingValue(http)) validateHttp(`${path}.http`, http, issues)

  const dns = module['dns']
  if (isMappingValue(dns)) validateDns(`${path}.dns`, dns, issues)

  const tcp = module['tcp']
  if (isMappingValue(tcp)) validateTcp(`${path}.tcp`, tcp, issues)

  for (const name of ['grpc', 'unix', 'websocket'] as const) {
    const block = module[name]
    if (isMappingValue(block)) validateIpProtocol(`${path}.${name}`, block, issues)
  }
}

function validateHttp(path: string, block: Mapping, issues: DocumentIssue[]): void {
  const statuses = block['valid_status_codes']
  if (statuses !== undefined) {
    if (!Array.isArray(statuses)) {
      issues.push({ path: `${path}.valid_status_codes`, key: 'form.list', severity: 'blocking' })
    } else {
      for (const [index, value] of statuses.entries()) {
        if (!(typeof value === 'number' && Number.isInteger(value) && value >= 100 && value <= 599)) {
          issues.push({
            path: `${path}.valid_status_codes.${index}`,
            key: 'form.status-code',
            severity: 'blocking',
          })
        }
      }
    }
  }

  const versions = block['valid_http_versions']
  if (versions !== undefined) {
    if (!Array.isArray(versions)) {
      issues.push({ path: `${path}.valid_http_versions`, key: 'form.list', severity: 'blocking' })
    } else {
      for (const [index, value] of versions.entries()) {
        if (typeof value !== 'string' || !HTTP_VERSIONS.has(value)) {
          issues.push({
            path: `${path}.valid_http_versions.${index}`,
            key: 'form.http-version',
            severity: 'blocking',
          })
        }
      }
    }
  }

  const size = block['body_size_limit']
  if (size !== undefined && !isBodySize(size)) {
    issues.push({ path: `${path}.body_size_limit`, key: 'form.body-size', severity: 'blocking' })
  }

  validateIpProtocol(path, block, issues)
  for (const key of HTTP_REGEX_KEYS) validateRegexpList(`${path}.${key}`, block[key], issues)
  for (const key of ['fail_if_header_matches', 'fail_if_header_not_matches'] as const) {
    validateHeaderRules(`${path}.${key}`, block[key], issues)
  }

  const tls = block['tls_config']
  if (isMappingValue(tls)) validateTls(`${path}.tls_config`, tls, issues)
}

function validateDns(path: string, block: Mapping, issues: DocumentIssue[]): void {
  const queryType = block['query_type']
  if (queryType !== undefined && (typeof queryType !== 'string' || !DNS_TYPES.has(queryType))) {
    issues.push({ path: `${path}.query_type`, key: 'form.dns-type', severity: 'blocking' })
  }

  const queryClass = block['query_class']
  if (queryClass !== undefined && (typeof queryClass !== 'string' || !DNS_CLASSES.has(queryClass))) {
    issues.push({ path: `${path}.query_class`, key: 'form.dns-class', severity: 'blocking' })
  }

  const rcodes = block['valid_rcodes']
  if (rcodes !== undefined) {
    if (!Array.isArray(rcodes)) {
      issues.push({ path: `${path}.valid_rcodes`, key: 'form.list', severity: 'blocking' })
    } else {
      for (const [index, value] of rcodes.entries()) {
        if (typeof value !== 'string' || !DNS_RCODES.has(value)) {
          issues.push({ path: `${path}.valid_rcodes.${index}`, key: 'form.dns-rcode', severity: 'blocking' })
        }
      }
    }
  }

  const transport = block['transport_protocol']
  if (transport !== undefined && (typeof transport !== 'string' || !DNS_TRANSPORTS.has(transport))) {
    issues.push({ path: `${path}.transport_protocol`, key: 'form.dns-transport', severity: 'blocking' })
  }

  const overTls = block['dns_over_tls']
  if (overTls !== undefined && typeof overTls !== 'boolean') {
    issues.push({ path: `${path}.dns_over_tls`, key: 'form.boolean', severity: 'blocking' })
  }

  validateIpProtocol(path, block, issues)
  for (const key of DNS_REGEX_KEYS) validateRegexpList(`${path}.${key}`, block[key], issues)
  for (const group of DNS_REGEX_GROUPS) {
    const value = block[group]
    if (!isMappingValue(value)) continue
    for (const key of DNS_REGEX_KEYS) validateRegexpList(`${path}.${group}.${key}`, value[key], issues)
  }

  const tls = block['tls_config']
  if (isMappingValue(tls)) validateTls(`${path}.tls_config`, tls, issues)
}

function validateTcp(path: string, block: Mapping, issues: DocumentIssue[]): void {
  validateIpProtocol(path, block, issues)
  validateQueryResponse(path, block, issues)
  const tls = block['tls_config']
  if (isMappingValue(tls)) validateTls(`${path}.tls_config`, tls, issues)
}

function validateQueryResponse(path: string, block: Mapping, issues: DocumentIssue[]): void {
  const steps = block['query_response']
  if (steps === undefined) return
  if (!Array.isArray(steps)) {
    issues.push({ path: `${path}.query_response`, key: 'form.list', severity: 'blocking' })
    return
  }
  for (const [index, item] of steps.entries()) {
    const step = isMappingValue(item) ? item : {}
    const bytes = step['expect_bytes']
    if (
      bytes !== undefined &&
      (typeof bytes !== 'string' || bytes.length === 0 || bytes.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(bytes))
    ) {
      issues.push({
        path: `${path}.query_response.${index}.expect_bytes`,
        key: 'form.expect-bytes',
        severity: 'blocking',
      })
    }
    if (step['starttls'] === true && block['tls'] === true) {
      issues.push({ path: `${path}.query_response.${index}.starttls`, key: 'form.starttls-tls', severity: 'warning' })
    }
    if (step['send'] === undefined && step['expect'] === undefined && step['expect_bytes'] === undefined) {
      issues.push({ path: `${path}.query_response.${index}`, key: 'form.step-empty', severity: 'warning' })
    }
  }
}

function validateIpProtocol(path: string, block: Mapping, issues: DocumentIssue[]): void {
  const value = block['preferred_ip_protocol']
  if (value !== undefined && (typeof value !== 'string' || !IP_PROTOCOLS.has(value))) {
    issues.push({ path: `${path}.preferred_ip_protocol`, key: 'form.ip-protocol', severity: 'blocking' })
  }
}

function validateTls(path: string, tls: Mapping, issues: DocumentIssue[]): void {
  const versions = ['min_version', 'max_version'] as const
  for (const key of versions) {
    const value = tls[key]
    if (value !== undefined && !TLS_VERSIONS.includes(value as (typeof TLS_VERSIONS)[number])) {
      issues.push({ path: `${path}.${key}`, key: 'form.tls-version', severity: 'blocking' })
    }
  }

  const min = tls['min_version']
  const max = tls['max_version']
  if (
    typeof min === 'string' &&
    typeof max === 'string' &&
    TLS_VERSIONS.includes(min as (typeof TLS_VERSIONS)[number]) &&
    TLS_VERSIONS.includes(max as (typeof TLS_VERSIONS)[number]) &&
    TLS_VERSIONS.indexOf(min as (typeof TLS_VERSIONS)[number]) >
      TLS_VERSIONS.indexOf(max as (typeof TLS_VERSIONS)[number])
  ) {
    issues.push({ path, key: 'form.tls-order', severity: 'blocking' })
  }
}

function validateRegexpList(path: string, value: unknown, issues: DocumentIssue[]): void {
  if (value === undefined) return
  if (!Array.isArray(value)) {
    issues.push({ path, key: 'form.list', severity: 'blocking' })
    return
  }

  for (const [index, pattern] of value.entries()) {
    if (typeof pattern !== 'string' || !isRegexp(pattern)) {
      issues.push({ path: `${path}.${index}`, key: 'form.regexp', severity: 'blocking' })
    }
  }
}

function validateHeaderRules(path: string, value: unknown, issues: DocumentIssue[]): void {
  if (value === undefined) return
  if (!Array.isArray(value)) {
    issues.push({ path, key: 'form.list', severity: 'blocking' })
    return
  }

  for (const [index, rule] of value.entries()) {
    if (!isMappingValue(rule)) {
      issues.push({ path: `${path}.${index}`, key: 'form.module.shape', severity: 'blocking' })
      continue
    }
    const header = rule['header']
    if (typeof header !== 'string' || header.trim() === '') {
      issues.push({ path: `${path}.${index}.header`, key: 'form.header', severity: 'blocking' })
    }
    const pattern = rule['regexp']
    if (typeof pattern !== 'string' || !isRegexp(pattern)) {
      issues.push({ path: `${path}.${index}.regexp`, key: 'form.regexp', severity: 'blocking' })
    }
    const allowMissing = rule['allow_missing']
    if (allowMissing !== undefined && typeof allowMissing !== 'boolean') {
      issues.push({ path: `${path}.${index}.allow_missing`, key: 'form.boolean', severity: 'blocking' })
    }
  }
}

function isBodySize(value: unknown): boolean {
  if (typeof value === 'number') return Number.isInteger(value) && value >= -1
  return typeof value === 'string' && BODY_SIZE.test(value)
}

function isRegexp(value: string): boolean {
  try {
    new RegExp(value)
    return true
  } catch {
    return false
  }
}

/** Reports a pair that cannot be set at the same time, at any depth of the known blocks. */
function checkExclusive(path: string, value: unknown, issues: DocumentIssue[]): void {
  if (!isMappingValue(value)) return

  for (const [first, second] of EXCLUSIVE_PAIRS) {
    if (isPresent(value[first]) && isPresent(value[second])) {
      issues.push({ path, key: 'form.exclusive', severity: 'blocking' })
    }
  }

  if (AUTH_BLOCKS.filter((block) => isPresent(value[block])).length > 1) {
    issues.push({ path, key: 'form.auth-exclusive', severity: 'blocking' })
  }

  for (const key of NESTED_BLOCKS) {
    checkExclusive(`${path}.${key}`, value[key], issues)
  }

  const steps = value['query_response']
  if (Array.isArray(steps)) {
    steps.forEach((step, index) => {
      checkExclusive(`${path}.query_response.${index}`, step, issues)
    })
  }
}
