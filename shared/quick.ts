/** One check with inline settings, shared by the configuration page and the file service. */
export type QuickProber = 'http' | 'tcp' | 'dns'

interface QuickBase {
  readonly prober: QuickProber
  readonly target: string
  readonly timeoutMs: number
}

export interface QuickHttpCheck extends QuickBase {
  readonly prober: 'http'
  readonly method: string
  readonly expectedStatus: number
  readonly followRedirects: boolean
  readonly insecureSkipVerify: boolean
  readonly basic?: {
    readonly username: string
    readonly password: string
  }
  readonly ntlm?: {
    readonly username: string
    readonly password: string
    readonly domain?: string
    readonly workstation?: string
  }
}

export interface QuickTcpCheck extends QuickBase {
  readonly prober: 'tcp'
}

export interface QuickDnsCheck extends QuickBase {
  readonly prober: 'dns'
  readonly queryName: string
  readonly queryType: string
}

export type QuickCheckInput = QuickHttpCheck | QuickTcpCheck | QuickDnsCheck
