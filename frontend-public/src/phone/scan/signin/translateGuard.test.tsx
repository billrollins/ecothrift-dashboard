/**
 * Ported from frontend/src/utils/translateGuard.test.tsx (Dash Update #80: Chrome Translate crashed the add-phone code
 * step). The guard itself is the live file, unchanged (core/entry.ts); the third case now drives the phone scanner's
 * own "Send my code" button (ui.tsx Button with `pending`), which keeps its words and adds the spinner beside them.
 */
import { useState } from 'react'
import { act, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { installTranslateGuard } from '../core/entry'
import { Button } from '../ui'

/** What Chrome Translate does: each text node is replaced by a <font> holding the translated words. */
function translate(root: Node) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const texts: Text[] = []
  while (walker.nextNode()) texts.push(walker.currentNode as Text)
  for (const t of texts) {
    if (!t.nodeValue?.trim() || !t.parentNode) continue
    const font = document.createElement('font')
    font.textContent = `ES:${t.nodeValue}`
    t.parentNode.replaceChild(font, t)
  }
}

/** A bare text node beside a sibling swapping with an element: the shape that crashed /scan on 11-05. */
function Bare() {
  const [busy, setBusy] = useState(false)
  return (
    <div>
      <button type="button" onClick={() => setBusy(true)}>
        {busy ? <i data-testid="spin" /> : 'Send my code'}
        <span className="ripple" />
      </button>
    </div>
  )
}

/** The sign-in screens' "Send my code" (signin/index.tsx, Join.tsx, AddPhone.tsx): the same markup. */
function Busy() {
  const [busy, setBusy] = useState(false)
  return (
    <form onSubmit={(e) => { e.preventDefault(); setBusy(true) }} data-testid="f">
      <Button type="submit" kind="ink" wide pending={busy}>
        <span>Send my code</span>
      </Button>
    </form>
  )
}

describe('translateGuard (Dash Update #80)', () => {
  installTranslateGuard()

  it('a translated text node swapping for a spinner no longer throws', () => {
    const { container } = render(<Bare />)
    translate(container)
    expect(() => act(() => screen.getByRole('button').click())).not.toThrow()
    expect(screen.getByTestId('spin')).toBeTruthy()
  })

  it('a moved reference node still gets its sibling inserted', () => {
    const parent = document.createElement('div')
    const wrap = document.createElement('font')
    const ref = document.createTextNode('x')
    wrap.appendChild(ref)
    parent.appendChild(wrap)
    const added = document.createElement('b')
    parent.insertBefore(added, ref)
    expect(parent.firstChild).toBe(added)
    // Gone entirely: appended.
    const lone = document.createTextNode('y')
    const added2 = document.createElement('i')
    parent.insertBefore(added2, lone)
    expect(parent.lastChild).toBe(added2)
  })

  it("the member app's Send my code button shows its spinner over translated words, with no copy left behind", () => {
    const { container } = render(<Busy />)
    translate(container)
    expect(container.textContent).toContain('ES:Send my code')
    expect(() => act(() => screen.getByRole('button').click())).not.toThrow()
    expect(container.querySelector('[role="progressbar"]')).toBeTruthy()
    // The words stay (the button keeps its size), once: never an untranslated copy beside the translated one.
    expect(container.textContent?.match(/Send my code/g)).toHaveLength(1)
    expect(screen.getByRole('button')).toBeDisabled()
  })
})
