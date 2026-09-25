import { describe, expect, it } from 'vitest';
import { ScanGate, money, monthName, parseTagCode, shortDate, wouldPayChoices } from './scannerLogic';

describe('parseTagCode', () => {
  it('reads SKUs from tag QR payloads and barcodes', () => {
    expect(parseTagCode('ITM0048211')).toBe('ITM0048211');
    expect(parseTagCode('  itm0048211\n')).toBe('ITM0048211');
    expect(parseTagCode('sku=ITM0048211')).toBe('ITM0048211');
    expect(parseTagCode('https://ecothrift.us/i?sku=abc123')).toBe('ABC123');
    expect(parseTagCode('TP0000001')).toBe('TP0000001');
  });

  it('refuses codes that are not price tags', () => {
    expect(parseTagCode('')).toBeNull();
    expect(parseTagCode(null)).toBeNull();
    expect(parseTagCode('https://example.com/menu')).toBeNull();
    expect(parseTagCode('Hello there, this is a long sentence')).toBeNull();
  });
});

describe('wouldPayChoices', () => {
  it('offers 15%, 25% and 35% under, in whole dollars from $10', () => {
    expect(wouldPayChoices('60.00')).toEqual([
      { under_pct: 15, would_pay: '51.00' },
      { under_pct: 25, would_pay: '45.00' },
      { under_pct: 35, would_pay: '39.00' },
    ]);
  });

  it('uses quarters under $10 and never repeats or reaches the price', () => {
    expect(wouldPayChoices('4.00').map((c) => c.would_pay)).toEqual(['3.50', '3.00', '2.50']);
    const tiny = wouldPayChoices('0.50').map((c) => c.would_pay);
    expect(new Set(tiny).size).toBe(tiny.length);
    tiny.forEach((v) => expect(Number(v)).toBeLessThan(0.5));
  });
});

describe('ScanGate', () => {
  it('ignores the same tag while it stays in view, and takes a new one at once', () => {
    const g = new ScanGate(2000);
    expect(g.accept('A', 0)).toBe(true);
    expect(g.accept('A', 1500)).toBe(false);
    expect(g.accept('A', 3000)).toBe(false); // still in view: the window slides
    expect(g.accept('A', 5100)).toBe(true);
    expect(g.accept('B', 5200)).toBe(true);
  });

  it('restarts the window when the card closes', () => {
    const g = new ScanGate(2000);
    g.accept('A', 0);
    g.hold('A', 10_000);
    expect(g.accept('A', 11_000)).toBe(false);
    expect(g.accept('A', 13_100)).toBe(true);
  });
});

describe('text helpers', () => {
  it('formats money and dates', () => {
    expect(money('12.5')).toBe('$12.50');
    expect(money('10.00', true)).toBe('$10');
    expect(money(1999)).toBe('$19.99');
    expect(monthName('2026-09')).toBe('September');
    expect(shortDate('2026-10-01')).toBe('Oct 1');
  });
});
