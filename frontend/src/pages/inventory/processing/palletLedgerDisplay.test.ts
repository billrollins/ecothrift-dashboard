import { describe, expect, it } from 'vitest';
import type { PalletAccountingDTO, TruckPalletLedgerDTO } from '../../../api/truckPallets.api';
import { fmtPct, missingHeadline, missingTone, palletHeadline } from './palletLedgerDisplay';

const acct = (over: Partial<PalletAccountingDTO> = {}): PalletAccountingDTO => ({
  manifest_lines: 2,
  manifest_units: 6,
  manifest_retail: '140.00',
  lines_without_retail: 0,
  received_units: 5,
  received_retail: '130.00',
  missing_units: 1,
  missing_retail: '10.00',
  missing_pct_units: 16.7,
  missing_pct_retail: 7.1,
  over_units: 0,
  broken_units: 0,
  ...over,
});

const ledger = (over: Partial<TruckPalletLedgerDTO> = {}): TruckPalletLedgerDTO => ({
  order_id: 1,
  has_manifest_pallets: true,
  pallets_total: 2,
  pallets_arrived: 2,
  pallets_started: 1,
  pallets_done: 0,
  current_pallet_id: 11,
  pallets: [
    {
      ...acct(),
      id: 11,
      number: 1,
      code: 'LIQ:PAL-1',
      label: 'PAL-1',
      from_manifest: true,
      status: 'processing',
      arrived_at: null,
      started_at: null,
      started_by: '',
      done_at: null,
      done_by: '',
      checked_in_units: 5,
      added_units: 0,
      from_other_pallets_units: 0,
    },
  ],
  unassigned: null,
  truck: { ...acct(), added_units: 0, units_without_pallet: 0 },
  running: null,
  running_basis: 'finished_pallets',
  ...over,
});

describe('palletLedgerDisplay', () => {
  it('formats percents', () => {
    expect(fmtPct(null)).toBe('-');
    expect(fmtPct(7.14)).toBe('7.1%');
    expect(fmtPct(12.4)).toBe('12%');
  });

  it('tones missing against the 5% B-Stock keeps', () => {
    expect(missingTone(3)).toBe('good');
    expect(missingTone(7)).toBe('warning');
    expect(missingTone(11)).toBe('error');
  });

  it('shows the current pallet and its progress', () => {
    const h = palletHeadline(ledger());
    expect(h.value).toBe('PAL-1');
    expect(h.helper).toBe('5/6 units · 0/2 done');
    expect(palletHeadline(ledger({ current_pallet_id: null })).value).toBe('Start');
  });

  it('missing waits for a finished pallet and never guesses without pallet ids', () => {
    expect(missingHeadline(ledger()).helper).toBe('After a pallet is done');
    expect(missingHeadline(ledger({ has_manifest_pallets: false })).helper).toBe('Manifest has no pallet ids');
    const done = missingHeadline(ledger({ running: acct(), pallets_done: 1 }));
    expect(done.value).toBe('7.1%');
    expect(done.tone).toBe('warning');
    expect(done.helper).toBe('1 missing · 1 pallet done');
  });
});
