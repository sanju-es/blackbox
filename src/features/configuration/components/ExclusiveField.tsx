import { useState } from 'react'

import { useI18n } from '../../../lib/i18n/index.tsx'
import { Confirmation } from './Confirmation.tsx'
import { TextAreaField, TextField } from './fields.tsx'

interface ExclusiveFieldProps {
  readonly label: string
  readonly value: string
  readonly disabled: boolean
  readonly type?: 'text' | 'password'
  readonly multiline?: boolean
  /** Whether the other half of the pair carries a value. */
  readonly conflict: boolean
  /** Label of that other half, named in the message. */
  readonly conflictLabel: string
  readonly onClearConflict: () => void
  readonly onChange: (value: string | undefined) => void
}

/**
 * A field that cannot live with another one. While the other carries a value
 * this is read-only; on focus it offers to remove that value, and the removal
 * happens only when the owner confirms.
 */
export function ExclusiveField({
  label,
  value,
  disabled,
  type,
  multiline = false,
  conflict,
  conflictLabel,
  onClearConflict,
  onChange,
}: ExclusiveFieldProps) {
  const { t } = useI18n()
  const [asking, setAsking] = useState(false)

  const message = t('conflict.message').replace('{field}', conflictLabel)
  const focus = () => {
    if (conflict) setAsking(true)
  }
  const common = { label, value, disabled, readOnly: conflict, onFocus: focus, onChange }

  return (
    <div className="flex flex-col gap-1">
      {multiline ? <TextAreaField {...common} /> : <TextField {...common} type={type} />}
      {asking && conflict ? (
        <Confirmation
          message={message}
          onConfirm={() => {
            onClearConflict()
            setAsking(false)
          }}
          onCancel={() => setAsking(false)}
        />
      ) : null}
    </div>
  )
}
