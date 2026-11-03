import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  getLabelSizeSetting: vi.fn(),
  getTagMarks: vi.fn(),
}));
vi.mock('../api/core.api', () => api);

const printer = vi.hoisted(() => ({ printTags: vi.fn(), printLabel: vi.fn(), printLabelBatch: vi.fn() }));
vi.mock('../services/localPrintService', () => ({ localPrintService: printer }));

import { asPerksTags, printPriceTags } from './printTags';
import { writePrintPrefs } from './printPrefs';

const LABELS = [
  { text: '$12.00', qr_data: 'ITM0000001', product_title: 'Toaster', include_text: true },
  { text: '$8.00', qr_data: 'ITM0000002', product_title: 'Mug', include_text: true },
];

function store(design: 'classic' | 'perks') {
  writePrintPrefs({ size: '2.25x1.25', priceTag: design === 'perks' ? 'perks' : 'old' });
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  printer.printTags.mockResolvedValue({ success: true });
});

describe('price tags in the Thrift+ Perks design (2026-10-28)', () => {
  it('asks Dash which items are AS IS at the printed price, then draws Perks tags with their strip', async () => {
    store('perks');
    api.getTagMarks.mockResolvedValue({ ITM0000001: { as_is: false, why: '' }, ITM0000002: { as_is: true, why: '$10' } });
    const result = await printPriceTags(LABELS);
    expect(result).toEqual({ printed: 2, failed: 0 });
    expect(api.getTagMarks).toHaveBeenCalledWith([{ sku: 'ITM0000001', price: '12' }, { sku: 'ITM0000002', price: '8' }]);
    // Data goes to the print server (kind perks + as_is), never a picture.
    const sent = printer.printTags.mock.calls.map((c) => c[0]);
    expect(sent.map((c) => [c.tags[0].kind, c.tags[0].data.qr_data, c.tags[0].data.as_is, c.tags[0].doc_name])).toEqual([
      ['perks', 'ITM0000001', false, 'Label-ITM0000001'],
      ['perks', 'ITM0000002', true, 'Label-ITM0000002'],
    ]);
    expect(sent.every((c) => c.w_in === 2.25 && c.h_in === 1.25 && c.dpi === 203)).toBe(true);
    expect(JSON.stringify(sent)).not.toContain('image_base64');
  });

  it('prints AS IS when Dash cannot say (never a returns promise the register would refuse)', async () => {
    api.getTagMarks.mockRejectedValue(new Error('offline'));
    expect((await asPerksTags(LABELS)).map((t) => t.as_is)).toEqual([true, true]);
  });

  it('Old goes to the print server as the price kind', async () => {
    store('classic');
    await printPriceTags(LABELS);
    expect(api.getTagMarks).not.toHaveBeenCalled();
    expect(printer.printTags.mock.calls.map((c) => [c[0].tags[0].kind, c[0].tags[0].data.text])).toEqual([
      ['price', '$12.00'],
      ['price', '$8.00'],
    ]);

  });
});

describe('the print server cannot draw the tag yet', () => {
  it('an old server (404 or Unknown tag kind) sends the batch through /print/labels', async () => {
    store('perks');
    api.getTagMarks.mockResolvedValue({});
    printer.printTags.mockResolvedValue({ success: false, message: 'Unknown tag kind: perks' });
    printer.printLabelBatch.mockResolvedValue({ printed: 2, failed: 0, errors: [] });
    const result = await printPriceTags(LABELS);
    expect(printer.printLabelBatch).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ printed: 2, failed: 0, error: undefined });
  });
});
