/**
 * The trip scanner's pure parts (the live TripScanner.tsx): what is on screen, and which answer a code gets.
 */
import type { ScannedCode, TagLookup } from '../core'

/**
 * 'scan': the camera, the slot says "Point at a tag". 'card': a tag or a code in the slot (Pass / Add to trip, or Scan
 * again). 'trip': the trip's lines over the camera and the slot (Scan more). 'item': a trip line's tag seen again from
 * the trip (owner 2026-10-15, APP D12: Remove / Back to trip).
 */
export type Mode = 'scan' | 'card' | 'trip' | 'item'

/** A tag or code in the slot. */
export interface Top {
  key: number
  sku: string
  lookup: TagLookup | null
  /** What the camera read or someone typed (APP D14, D15); none for a trip line seen again (D12). */
  code?: ScannedCode
  /** The gate's name for this code, ignored for 3 s after [Scan again]. */
  gateKey?: string
  /** Opened from a Thrift+ Perks tag's QR (/scan?tag=<SKU>): a non-member sees Get Thrift+ on it. */
  fromLink?: boolean
}

/** The answer a code gets instead of a tag (owner 2026-10-15, APP D14a, D14b, D15), or null for a tag. */
export type Answer = 'not-ours' | 'not-found' | 'link'

export function answerFor(top: Top | null): Answer | null {
  const code = top?.code
  if (!code) return null
  if (code.kind === 'other') return 'not-ours'
  if (code.kind === 'link') return 'link'
  if (top.lookup?.status === 'not_found') return code.ours ? 'not-found' : 'not-ours'
  return null
}

/** [Scan again] ignores that same code this long, so it doesn't pop straight back up (APP D14). */
export const SCAN_AGAIN_IGNORE_MS = 3000
