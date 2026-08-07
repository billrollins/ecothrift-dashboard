import { useId, useRef, type ChangeEvent, type ClipboardEvent, type KeyboardEvent } from 'react'

type Props = {
  value: string
  onChange: (digits: string) => void
  onComplete?: (digits: string) => void
  disabled?: boolean
  label?: string
  id?: string
  autoFocus?: boolean
}

function digitsOnly(raw: string): string {
  return (raw || '').replace(/\D/g, '').slice(0, 6)
}

export default function CodeInput({
  value,
  onChange,
  onComplete,
  disabled = false,
  label = 'Confirmation code',
  id,
  autoFocus = false,
}: Props) {
  const autoId = useId()
  const inputId = id || autoId
  const inputRef = useRef<HTMLInputElement>(null)

  const emit = (next: string) => {
    onChange(next)
    if (next.length === 6) onComplete?.(next)
  }

  const onInput = (e: ChangeEvent<HTMLInputElement>) => {
    emit(digitsOnly(e.target.value))
  }

  const onPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault()
    emit(digitsOnly(e.clipboardData.getData('text')))
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && value.length === 6 && !disabled) {
      e.preventDefault()
      onComplete?.(value)
    }
  }

  return (
    <label className="codeinput" htmlFor={inputId}>
      <span className="sr-only">{label}</span>
      <input
        ref={inputRef}
        id={inputId}
        className="codeinput__field"
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]*"
        maxLength={6}
        value={value}
        onChange={onInput}
        onPaste={onPaste}
        onKeyDown={onKeyDown}
        disabled={disabled}
        autoFocus={autoFocus}
        aria-label={label}
      />
    </label>
  )
}
