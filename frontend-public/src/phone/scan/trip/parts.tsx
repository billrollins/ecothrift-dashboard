/**
 * Small pieces the slot, the answers and the trip's lines share: the 3-day returns / AS IS badge (the live tripUi.tsx
 * `ReturnsBadge`), the − N + control (`QtyStepper`, always shown: no tap-to-open), and two inline icons.
 */
import type { ReactNode } from 'react'
import { Tag } from '../../shell/Tag'
import { money } from '../core'
import { IconMinus, IconPlus, IconTrash } from '../ui'

/** The printed tag block (shell/Tag.tsx), read out as "$60.00" (the block itself draws the cents raised, no point). */
export function PriceTag({ price, className = '' }: { price: number; className?: string }) {
  return (
    <span className="tr-pt">
      <span className="tr-sr">{money(Math.round(price * 100))}</span>
      <span aria-hidden="true">
        <Tag price={price} className={className} />
      </span>
    </span>
  )
}

function Svg({ children }: { children: ReactNode }) {
  return (
    <svg className="i" viewBox="0 0 24 24" aria-hidden="true">
      {children}
    </svg>
  )
}
export const IconReturn = () => (
  <Svg>
    <path d="M9 14l-4-4 4-4" />
    <path d="M5 10h9a5 5 0 0 1 0 10h-3" />
  </Svg>
)
export const IconNo = () => (
  <Svg>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M6 18L18 6" />
  </Svg>
)

/**
 * 3-day returns or AS IS, big enough to notice (owner 2026-10-13: "that's pretty important"; A3: the scanner says
 * which). Tap it for what it means (a sheet).
 */
export function ReturnsBadge({ ok, onClick }: { ok: boolean; onClick?: () => void }) {
  return (
    <button
      type="button"
      className={`tr-badge${ok ? ' tr-ok' : ' tr-asis'}`}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={onClick}
      data-testid={ok ? 'badge-returns' : 'badge-as-is'}
    >
      {ok ? <IconReturn /> : <IconNo />}
      {ok ? '3-day returns' : 'AS IS · no returns'}
    </button>
  )
}

/** − 1 +; at 1 the minus is a bin (takes the line out). Its taps are its own (never the line's). */
export function QtyStepper({ qty, onChange }: { qty: number; onChange: (qty: number) => void }) {
  const stop = (e: { stopPropagation: () => void }) => e.stopPropagation()
  return (
    <div className="tr-step" data-testid="qty-stepper" onPointerDown={stop} onClick={stop}>
      <button type="button" aria-label={qty === 1 ? 'Remove' : 'One less'} className={qty === 1 ? 'tr-bin' : undefined} onClick={() => onChange(qty - 1)}>
        {qty === 1 ? <IconTrash /> : <IconMinus />}
      </button>
      <span className="tn" data-testid="qty">{qty}</span>
      <button type="button" aria-label="One more" onClick={() => onChange(qty + 1)}>
        <IconPlus />
      </button>
    </div>
  )
}
