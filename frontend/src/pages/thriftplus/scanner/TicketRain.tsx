/**
 * Falling reward tickets (owner, 2026-10-09). Two moments, both on a swipe right:
 *  - **Bank it:** a few tickets fall onto the number that grows (the cover bar, then the Rewards Balance).
 *  - **Shower:** tickets rain over the whole screen when this trip pays the month's cover in full.
 * Each ticket starts hidden above the screen and shows only when its fall begins, so nothing sits in a corner
 * while it waits. Phones set to reduce motion get no animation; the numbers still change.
 */
import { art } from './scannerTheme';

function quiet(root: HTMLElement): boolean {
  if (typeof root.animate !== 'function') return true;
  return Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
}

function ticket(root: HTMLElement, size: number): HTMLImageElement {
  const img = document.createElement('img');
  img.src = art.ticket;
  img.alt = '';
  img.setAttribute('aria-hidden', 'true');
  img.dataset.tpTicket = '';
  Object.assign(img.style, {
    position: 'absolute', left: '0', top: '0', width: `${size}px`, pointerEvents: 'none', zIndex: '40', opacity: '0',
  });
  root.appendChild(img);
  return img;
}

/** "Bank it": tickets fall onto `target` and fade into it. */
export function bankInto(root: HTMLElement | null, target: Element | null, count = 10): void {
  if (!root || !target || quiet(root)) return;
  const box = root.getBoundingClientRect();
  const r = target.getBoundingClientRect();
  const size = Math.max(26, Math.round(box.width * 0.09));
  const tx = r.left - box.left + r.width / 2 - size / 2;
  const ty = r.top - box.top + r.height / 2 - size / 3;
  for (let i = 0; i < count; i++) {
    const img = ticket(root, size);
    const x0 = Math.max(0, Math.min(box.width - size, tx - size * 1.6 + Math.random() * size * 3.2));
    const r0 = Math.random() * 90 - 45;
    const fall = img.animate(
      [
        { transform: `translate(${x0}px, ${-size * 1.5}px) rotate(${r0}deg)`, opacity: 1 },
        { offset: 0.75, opacity: 1 },
        { transform: `translate(${tx}px, ${ty}px) rotate(${r0 / 3}deg) scale(0.45)`, opacity: 0 },
      ],
      { duration: 650 + Math.random() * 350, delay: i * 60, easing: 'cubic-bezier(.45,0,.8,.6)', fill: 'both' },
    );
    fall.onfinish = () => img.remove();
  }
}

/** "Shower": a gentle rain of tickets over the whole screen. */
export function shower(root: HTMLElement | null, count = 26): void {
  if (!root || quiet(root)) return;
  const w = root.clientWidth;
  const h = root.clientHeight;
  const size = Math.max(26, Math.round(w * 0.09));
  for (let i = 0; i < count; i++) {
    const img = ticket(root, size);
    const x0 = Math.random() * (w - size);
    const r0 = Math.random() * 120 - 60;
    const fall = img.animate(
      [
        { transform: `translate(${x0}px, ${-size * 1.6}px) rotate(${r0}deg)`, opacity: 1 },
        { transform: `translate(${x0 + Math.random() * 90 - 45}px, ${h + size}px) rotate(${r0 + Math.random() * 360 - 180}deg)`, opacity: 1 },
      ],
      { duration: 1700 + Math.random() * 900, delay: i * 70, easing: 'cubic-bezier(.3,.1,.6,1)', fill: 'both' },
    );
    fall.onfinish = () => img.remove();
  }
}

/** What a swipe right should play, from the cart before and after it (all cents). */
export function rainPlan(
  before: { fill: number; bank: number } | null,
  after: { fill: number; bank: number; cover: number },
): { cover: boolean; shower: boolean; balance: boolean } {
  if (!before) return { cover: false, shower: false, balance: false };
  const cover = after.fill > before.fill;
  return {
    cover,
    shower: cover && after.cover > 0 && after.fill >= after.cover && before.fill < after.cover,
    balance: after.bank > before.bank,
  };
}
