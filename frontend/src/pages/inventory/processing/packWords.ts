/**
 * The pack standard on screen (Dash Update #224; server: `apps/inventory/services/product_packs.py`, the same rules).
 * Count per unit x units in the pack, written "3 boxes × 100" (units first); a single unit is "100 ct".
 */

const IRREGULAR: Record<string, string> = {
  box: 'boxes', case: 'cases', pack: 'packs', roll: 'rolls', bag: 'bags', bottle: 'bottles', can: 'cans', jar: 'jars',
  tube: 'tubes', sleeve: 'sleeves', carton: 'cartons', pouch: 'pouches',
};

export function plural(name: string, n: number): string {
  const base = name.trim().toLowerCase();
  if (!base || n === 1) return base;
  if (IRREGULAR[base]) return IRREGULAR[base];
  return /(s|x|ch|sh)$/.test(base) ? `${base}es` : `${base}s`;
}

export function singular(name: string): string {
  const base = name.trim().toLowerCase();
  const hit = Object.entries(IRREGULAR).find(([, many]) => many === base);
  if (hit) return hit[0];
  if (/(s|x|ch|sh)es$/.test(base)) return base.slice(0, -2);
  if (base.endsWith('s') && !base.endsWith('ss')) return base.slice(0, -1);
  return base;
}

export function packLabel(unitCount: number | null | undefined, unitName = '', packUnits: number | null | undefined = 1): string {
  const units = packUnits || 1;
  const name = unitName.trim();
  if (units > 1) {
    const what = name ? plural(name, units) : 'units';
    return unitCount ? `${units} ${what} × ${unitCount}` : `${units} ${what}`;
  }
  return unitCount ? `${unitCount} ct` : '';
}

export function totalPieces(unitCount: number | null | undefined, packUnits: number | null | undefined): number | null {
  if (!unitCount) return null;
  return unitCount * (packUnits || 1);
}

/** amount x new pieces / base pieces, to the cent ("100 for $1, so 3 boxes of 200 is $6"). */
export function scaleAmount(amount: string | number | null | undefined, basePieces: number | null, newPieces: number | null): string {
  const n = typeof amount === 'number' ? amount : Number.parseFloat(String(amount ?? '').replace(/[$,\s]/g, ''));
  if (!Number.isFinite(n) || !basePieces || !newPieces) return '';
  return (Math.round((n * newPieces * 100) / basePieces) / 100).toFixed(2);
}

const RE_PACK_OF = /(\d{1,4})\s*(?:-\s*)?([a-z]+?)?\s*(?:×|x|\*|of)\s*(\d{1,6})\b(?!\s*(?:in|oz|ft|lb|mm|cm|"))/i;
const RE_OF = /\b(pack|box|case|bag|set|carton|roll)\s+of\s+(\d{1,6})\b/i;
const RE_CT = /\b(\d{1,6})\s*(?:-\s*)?(?:ct|count|pk|pack|pc|pcs|pieces?)\b/i;

/** The title without its pack words, then " - <label>" (the server names a new pack the same way). */
export function retitle(title: string, label: string): string {
  const t = title.trim();
  const m = t.match(RE_PACK_OF) ?? t.match(RE_OF) ?? t.match(RE_CT);
  let base = t;
  if (m && m.index != null) base = `${t.slice(0, m.index)}${t.slice(m.index + m[0].length)}`;
  base = base.replace(/\s{2,}/g, ' ').replace(/^[\s\-,·|()]+|[\s\-,·|()]+$/g, '');
  return label ? `${base} - ${label}`.slice(0, 300) : base.slice(0, 300);
}

/** A whole number above zero from a box, or null. */
export function wholeCount(raw: string): number | null {
  const n = Number.parseInt(raw.replace(/[^0-9]/g, ''), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}
