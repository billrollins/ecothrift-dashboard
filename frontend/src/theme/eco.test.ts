import { describe, expect, it } from 'vitest';
import { eco, ecoTheme } from './eco';

function contrast(a: string, b: string) {
  const lum = (hex: string) => {
    const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe('Eco-Thrift theme: readability beats subtlety', () => {
  it('keeps secondary text about 8:1 or better on cards and the canvas', () => {
    expect(contrast(eco.inkSoft, eco.card)).toBeGreaterThanOrEqual(8);
    expect(contrast(eco.inkSoft, eco.canvas)).toBeGreaterThanOrEqual(7.9);
  });

  it('keeps hints, links and status colours readable as text (4.5:1)', () => {
    for (const c of [eco.inkFaint, eco.forest, eco.good, eco.wait, eco.problem, eco.info]) {
      expect(contrast(c, eco.card)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(c, eco.canvas)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('reads each status text shade on its own wash (4.5:1)', () => {
    for (const s of ['success', 'warning', 'error', 'info'] as const) {
      const p = ecoTheme.palette[s];
      expect(contrast(p.dark, p.light)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('sets no text under 12px', () => {
    const t = ecoTheme.typography;
    for (const v of ['caption', 'overline', 'body2', 'subtitle2'] as const) {
      expect(parseFloat(String(t[v].fontSize)) * 16).toBeGreaterThanOrEqual(12);
    }
  });
});
