import { describe, expect, it } from 'vitest';
import type { MyDocument } from '@/esign/api';
import type { MyHrFiles } from '../../api/hiring.api';
import { fileRows } from './HrTab';

const t = (key: string) => key;
const day = (iso: string | null | undefined) => (iso ? iso.slice(0, 10) : '');

function doc(over: Partial<MyDocument>): MyDocument {
  return {
    party: 1, envelope: 10, title: 'W-4', status: 'out', status_label: '', my_status: 'waiting', my_turn: false,
    waiting_on: null, sent_at: '2026-11-01T15:00:00Z', signed_at: null, completed_at: null, has_pdf: false, ...over,
  } as MyDocument;
}

describe('Home > HR > Files rows', () => {
  it('puts what is mine to sign first, then the rest newest first, across time zones', () => {
    const hiring: MyHrFiles = {
      handbook: { version: 2, title: 'Staff handbook', signed: null },
      files: [
        { key: 'handbook-4', kind: 'handbook', title: 'Staff handbook (version 1)', signed_at: '2026-10-20T10:00:00-05:00', pdf: '/hiring/handbook/signatures/4/pdf/' },
        { key: 'offer-2', kind: 'offer', title: 'Offer letter: Retail Associate', signed_at: '2026-10-01T09:00:00-05:00', pdf: '/hiring/me/offers/2/pdf/' },
      ],
    };
    const esign = [
      doc({ party: 1, title: 'W-4', my_turn: true }),
      // 16:30 UTC on Oct 20 is after 10:00 Central (15:00 UTC): the signed W-9 comes before handbook version 1.
      doc({ party: 2, title: 'W-9', status: 'signed', completed_at: '2026-10-20T16:30:00Z', has_pdf: true }),
      doc({ party: 3, title: 'Policy', status: 'out', my_status: 'signed', signed_at: '2026-10-25T12:00:00Z', waiting_on: 'Bill' }),
    ];
    const rows = fileRows(esign, hiring, t, day);
    expect(rows.map((r) => r.key)).toEqual(['esign-1', 'handbook-v2', 'esign-3', 'esign-2', 'handbook-4', 'offer-2']);
    expect(rows[0]).toMatchObject({ toSign: true, signAt: '/hr/sign/1' });
    // Version 2 is out and version 1 was signed: it says so, and signing happens on My onboarding.
    expect(rows[1]).toMatchObject({ toSign: true, signAt: '/onboarding', line: 'newVersion', title: 'Staff handbook (version 2)' });
    expect(rows[2]).toMatchObject({ toSign: false, line: 'youSigned 2026-10-25 · waitingOn Bill' });
    expect(rows[2].pdf).toBeUndefined();
    expect(rows[3]).toMatchObject({ pdf: '/esign/envelopes/10/pdf/' });
  });

  it('is empty when nothing was sent or signed, and a signed current handbook is not asked again', () => {
    expect(fileRows([], undefined, t, day)).toEqual([]);
    const signed: MyHrFiles = { handbook: { version: 1, title: 'Staff handbook', signed: { id: 4, signed_at: '2026-10-20T10:00:00-05:00' } }, files: [] };
    expect(fileRows([], signed, t, day)).toEqual([]);
  });
});
