import { describe, expect, it } from 'vitest';
import { ScanGate, classifyCode, money, monthName, parseTagCode, shortDate, wouldPayChoices } from './scannerLogic';

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
    expect(parseTagCode('0123456789012')).toBeNull();
    expect(parseTagCode('https://ecothrift.us/terms')).toBeNull();
  });
});

describe('classifyCode: every code gets an answer (owner 2026-10-15, APP D14, D15)', () => {
  it('our tag codes are looked up and, not found, say "We can\'t find that item"', () => {
    expect(classifyCode('ITM0051377')).toEqual({ kind: 'tag', sku: 'ITM0051377', ours: true });
    expect(classifyCode(' itm0051377 ', 'qr_code')).toEqual({ kind: 'tag', sku: 'ITM0051377', ours: true });
    expect(classifyCode('https://ecothrift.us/i?sku=abc123')).toEqual({ kind: 'tag', sku: 'ABC123', ours: true });
    expect(classifyCode('https://www.ecothrift.us/tag?sku=X-42')).toEqual({ kind: 'tag', sku: 'X-42', ours: true });
    expect(classifyCode('A7731', 'code_128')).toEqual({ kind: 'tag', sku: 'A7731', ours: true });
    // ITM needs 4+ digits.
    expect(classifyCode('ITM12')).toEqual({ kind: 'tag', sku: 'ITM12', ours: false });
  });

  it('a bare short code is looked up too, but not found it is "not our price tag"', () => {
    expect(classifyCode('TP0000001')).toEqual({ kind: 'tag', sku: 'TP0000001', ours: false });
    expect(classifyCode('abc123', 'qr_code')).toEqual({ kind: 'tag', sku: 'ABC123', ours: false });
    // A ?sku= link on someone else's site still looks up, as older tags did.
    expect(classifyCode('https://example.com/?sku=ITM')).toEqual({ kind: 'tag', sku: 'ITM', ours: false });
  });

  it('product barcodes, other text and other sites are not our tag, with no look-up', () => {
    for (const format of ['ean_13', 'ean_8', 'upc_a', 'upc_e']) {
      expect(classifyCode('0123456789012', format)).toEqual({ kind: 'other' });
    }
    // From a product format, any digits: a UPC-E's 8 or an EAN-8's.
    expect(classifyCode('04963406', 'upc_e')).toEqual({ kind: 'other' });
    expect(classifyCode('0123456789012')).toEqual({ kind: 'other' }); // typed EAN-13
    expect(classifyCode('012345678905')).toEqual({ kind: 'other' }); // typed UPC-A
    expect(classifyCode('96385074')).toEqual({ kind: 'other' }); // typed EAN-8
    expect(classifyCode('nope!')).toEqual({ kind: 'other' });
    expect(classifyCode('Hello there, this is a long sentence')).toEqual({ kind: 'other' });
    expect(classifyCode('https://example.com/menu')).toEqual({ kind: 'other' });
    expect(classifyCode('https://ecothrift.us.example.com/terms')).toEqual({ kind: 'other' });
    expect(classifyCode('WIFI:S:Store;T:WPA;P:secret;;')).toEqual({ kind: 'other' });
    expect(classifyCode('mailto:hello@ecothrift.us')).toEqual({ kind: 'other' });
    expect(classifyCode('')).toEqual({ kind: 'other' });
    expect(classifyCode(null)).toEqual({ kind: 'other' });
  });

  it('a link on ecothrift.us is "That QR code is a link", shown as host and path', () => {
    expect(classifyCode('https://ecothrift.us/terms')).toEqual({ kind: 'link', href: 'https://ecothrift.us/terms', shown: 'ecothrift.us/terms' });
    expect(classifyCode('https://ecothrift.us/terms/?lang=es#faq')).toMatchObject({ kind: 'link', shown: 'ecothrift.us/terms' });
    expect(classifyCode('http://www.ecothrift.us/')).toEqual({ kind: 'link', href: 'http://www.ecothrift.us/', shown: 'www.ecothrift.us' });
    expect(classifyCode('ecothrift.us/join')).toEqual({ kind: 'link', href: 'https://ecothrift.us/join', shown: 'ecothrift.us/join' });
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

  it('Scan again ignores that same code for exactly 3 s, even while it stays in view (APP D14)', () => {
    const g = new ScanGate(2000);
    g.accept('raw:0123456789012', 0);
    g.ignore('raw:0123456789012', 3000, 1000);
    expect(g.accept('raw:0123456789012', 1500)).toBe(false);
    expect(g.accept('raw:0123456789012', 3900)).toBe(false); // seen again: the 3 s don't stretch
    expect(g.accept('raw:0123456789012', 4000)).toBe(true);
    // Another code is taken at once.
    g.ignore('A', 3000, 5000);
    expect(g.accept('B', 5100)).toBe(true);
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
