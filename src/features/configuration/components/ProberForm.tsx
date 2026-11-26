import type { Mapping } from '@shared/document/index.ts'

import { DnsForm } from './DnsForm.tsx'
import { GrpcForm } from './GrpcForm.tsx'
import { HttpForm } from './HttpForm.tsx'
import { TcpForm } from './TcpForm.tsx'
import { WebsocketForm } from './WebsocketForm.tsx'

interface ProberFormProps {
  readonly prober: string
  readonly block: Mapping
  readonly disabled: boolean
  readonly onChange: (key: string, value: unknown) => void
}

/** The form of the chosen prober; an unknown one has no editor and is preserved. */
export function ProberForm({ prober, block, disabled, onChange }: ProberFormProps) {
  switch (prober) {
    case 'http':
      return <HttpForm block={block} disabled={disabled} onChange={onChange} />
    case 'tcp':
      return <TcpForm variant="tcp" block={block} disabled={disabled} onChange={onChange} />
    case 'unix':
      return <TcpForm variant="unix" block={block} disabled={disabled} onChange={onChange} />
    case 'dns':
      return <DnsForm block={block} disabled={disabled} onChange={onChange} />
    case 'grpc':
      return <GrpcForm block={block} disabled={disabled} onChange={onChange} />
    case 'websocket':
      return <WebsocketForm block={block} disabled={disabled} onChange={onChange} />
    default:
      return null
  }
}
