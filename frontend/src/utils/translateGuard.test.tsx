import { useState } from 'react';
import { act, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { installTranslateGuard } from './translateGuard';
import { Primary } from '../pages/thriftplus/scanner/signInParts';

/** What Chrome Translate does: each text node is replaced by a <font> holding the translated words. */
function translate(root: Node) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const texts: Text[] = [];
  while (walker.nextNode()) texts.push(walker.currentNode as Text);
  for (const t of texts) {
    if (!t.nodeValue?.trim() || !t.parentNode) continue;
    const font = document.createElement('font');
    font.textContent = `ES:${t.nodeValue}`;
    t.parentNode.replaceChild(font, t);
  }
}

/**
 * A bare text node beside a sibling (MUI's ripple span) swapping with an element: the shape that crashed /scan on 11-05.
 * (A lone string child would be set as textContent and never crash.)
 */
function Bare() {
  const [busy, setBusy] = useState(false);
  return (
    <div>
      <button type="button" onClick={() => setBusy(true)}>
        {busy ? <i data-testid="spin" /> : 'Send my code'}
        <span className="ripple" />
      </button>
    </div>
  );
}

function Busy() {
  const [busy, setBusy] = useState(false);
  return (
    <form onSubmit={(e) => { e.preventDefault(); setBusy(true); }} data-testid="f">
      <Primary busy={busy} label="Send my code" />
    </form>
  );
}

describe('translateGuard (Dash Update #80)', () => {
  installTranslateGuard();

  it('a translated text node swapping for a spinner no longer throws', () => {
    const { container } = render(<Bare />);
    translate(container);
    expect(() => act(() => screen.getByRole('button').click())).not.toThrow();
    expect(screen.getByTestId('spin')).toBeTruthy();
  });

  it('a moved reference node still gets its sibling inserted', () => {
    const parent = document.createElement('div');
    const wrap = document.createElement('font');
    const ref = document.createTextNode('x');
    wrap.appendChild(ref);
    parent.appendChild(wrap);
    const added = document.createElement('b');
    parent.insertBefore(added, ref);
    expect(parent.firstChild).toBe(added);
    // Gone entirely: appended.
    const lone = document.createTextNode('y');
    const added2 = document.createElement('i');
    parent.insertBefore(added2, lone);
    expect(parent.lastChild).toBe(added2);
  });

  it("the member app's Send my code button leaves no translated words behind its spinner", () => {
    const { container } = render(<Busy />);
    translate(container);
    expect(container.textContent).toContain('ES:Send my code');
    act(() => screen.getByRole('button').click());
    expect(container.textContent).not.toContain('Send my code');
    expect(container.querySelector('[role="progressbar"]')).toBeTruthy();
  });
});
