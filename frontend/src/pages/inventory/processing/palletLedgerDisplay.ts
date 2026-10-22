import type { PalletAccountingDTO, TruckPalletDTO, TruckPalletLedgerDTO } from '../../../api/truckPallets.api';

export type PalletTone = 'default' | 'good' | 'warning' | 'error';

/** Missing above this share of manifest $ is worth a look (B-Stock does not refund the first 5%). */
export const MISSING_WARN_PCT = 5;

export function fmtPct(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '-';
  return `${value.toFixed(value >= 10 ? 0 : 1)}%`;
}

export function fmtUnits(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '-';
  return Number.isInteger(value) ? new Intl.NumberFormat().format(value) : value.toFixed(1);
}

/** Dollar share when the manifest has retail, else the unit share. */
export function missingPct(a: PalletAccountingDTO | null | undefined): number | null {
  if (!a) return null;
  return a.missing_pct_retail ?? a.missing_pct_units;
}

export function missingTone(pct: number | null): PalletTone {
  if (pct == null) return 'default';
  if (pct > MISSING_WARN_PCT * 2) return 'error';
  if (pct > MISSING_WARN_PCT) return 'warning';
  return 'good';
}

export function currentPallet(ledger: TruckPalletLedgerDTO | undefined): TruckPalletDTO | null {
  if (!ledger || ledger.current_pallet_id == null) return null;
  return ledger.pallets.find((p) => p.id === ledger.current_pallet_id) ?? null;
}

export interface PalletHeadline {
  value: string;
  helper: string;
  tone: PalletTone;
}

/** The header's "Pallet" block: the pallet being processed and how far it is. */
export function palletHeadline(ledger: TruckPalletLedgerDTO | undefined): PalletHeadline {
  if (!ledger) return { value: '-', helper: 'Pallets', tone: 'default' };
  const cur = currentPallet(ledger);
  const progress = `${ledger.pallets_done}/${ledger.pallets_total} done`;
  if (!cur) {
    return { value: 'Start', helper: progress, tone: ledger.pallets_total > 0 ? 'warning' : 'default' };
  }
  const detail = ledger.has_manifest_pallets
    ? `${fmtUnits(cur.received_units)}/${fmtUnits(cur.manifest_units)} units · ${progress}`
    : `${fmtUnits(cur.checked_in_units)} in · ${progress}`;
  return { value: cur.label, helper: detail, tone: 'default' };
}

/** The header's "Missing" block: running % over finished pallets (never guessed). */
export function missingHeadline(ledger: TruckPalletLedgerDTO | undefined): PalletHeadline {
  if (!ledger) return { value: '-', helper: 'Missing', tone: 'default' };
  if (!ledger.has_manifest_pallets) {
    return { value: '-', helper: 'Manifest has no pallet ids', tone: 'default' };
  }
  if (!ledger.running) {
    return { value: '-', helper: 'After a pallet is done', tone: 'default' };
  }
  const pct = missingPct(ledger.running);
  return {
    value: fmtPct(pct),
    helper: `${fmtUnits(ledger.running.missing_units)} missing · ${ledger.pallets_done} pallet${ledger.pallets_done === 1 ? '' : 's'} done`,
    tone: missingTone(pct),
  };
}
