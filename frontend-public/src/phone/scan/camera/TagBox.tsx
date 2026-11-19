/**
 * Typing a tag number in the camera window (PLAN-SCANNER.md rows 15 and 16; live CameraCard.tsx): the "Type tag #"
 * button, the "Tag number" box with "Look up", and in type-only test mode (`/scan?type=1`, owner 2026-10-10) a short
 * list of test tags to pick (store `useTestTags`; if the list cannot load, the box instead). Each sits in the camera
 * window's bottom row, in the same place, so nothing around it moves.
 */
import { useEffect, useRef, useState } from 'react'
import type { TestTag } from '../api'
import { bucks } from '../../lib/format'
import { IconKeyboard } from './icons'

/** The quiet button on the camera that opens the box. */
export function TypeTagButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      className="cm-pill cm-type"
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
    >
      <IconKeyboard />
      Type tag #
    </button>
  )
}

/** The "Tag number" box. `focus`: the keyboard comes up at once (the box was asked for, or type-only mode). */
export function TagForm({ focus, onCode }: { focus: boolean; onCode: (code: string) => void }) {
  const [typed, setTyped] = useState('')
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => {
    // No scrolling the page to it (owner 11-19 night: nothing jumps).
    if (focus) input.current?.focus({ preventScroll: true })
  }, [focus])
  return (
    <form
      className="cm-form"
      onSubmit={(e) => {
        e.preventDefault()
        const code = typed.trim()
        if (!code) return
        setTyped('')
        onCode(code)
      }}
    >
      <input
        ref={input}
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        placeholder="Tag number"
        aria-label="Tag number"
        autoCapitalize="characters"
        autoCorrect="off"
        autoComplete="off"
        spellCheck={false}
        enterKeyHint="search"
        inputMode="text"
      />
      <button type="submit" className="cm-go">
        Look up
      </button>
    </form>
  )
}

/** The test tags, as the live list words them: name, tag price, and ThriftBucks (never a "$" on those). */
export function testTagText(t: TestTag): string {
  return `${t.title} · $${t.price} · ${Number(t.reward) > 0 ? `${bucks(Number(t.reward))} ThriftBucks` : 'no ThriftBucks yet'}`
}

/** Type-only test mode: pick a tag from the short list. */
export function TestTagPick({ tags, onCode }: { tags: TestTag[]; onCode: (code: string) => void }) {
  return (
    <select
      className="cm-pick"
      aria-label="Pick a test item"
      value=""
      onChange={(e) => {
        if (e.target.value) onCode(e.target.value)
      }}
    >
      <option value="">Pick a test item…</option>
      {tags.map((t) => (
        <option key={t.sku} value={t.sku}>
          {testTagText(t)}
        </option>
      ))}
    </select>
  )
}
