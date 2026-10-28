import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  getLabelSizeSetting: vi.fn(),
  getTagMarks: vi.fn(),
}));
vi.mock('../api/core.api', () => api);

const printer = vi.hoisted(() => ({ printImageCopies: vi.fn(), printLabel: vi.fn(), printLabelBatch: vi.fn() }));
vi.mock('../services/localPrintService', () => ({ localPrintService: printer }));

const render = vi.hoisted(() => vi.fn(async (..._args: unknown[]) => 'png'));
vi.mock('./tagCanvas', async (orig) => ({ ...(await orig<typeof import('./tagCanvas')>()), renderTagPng: render }));

import { asPerksTags, forgetStoreLabelSize, printPriceTags } from './printTags';
import { perksTag } from './tags/perksTag';
import { priceTag } from './tags/priceTag';

const LABELS = [
  { text: '$12.00', qr_data: 'ITM0000001', product_title: 'Toaster', include_text: true },
  { text: '$8.00', qr_data: 'ITM0000002', product_title: 'Mug', include_text: true },
];

function store(design: 'classic' | 'perks', on = true) {
  forgetStoreLabelSize({ value: { w_in: 2.25, h_in: 1.25, dpi: 203 }, price_tag_in_dash: on, price_tag_design: design });
}

beforeEach(() => {
  vi.clearAllMocks();
  printer.printImageCopies.mockResolvedValue({ success: true });
});

describe('price tags in the Thrift+ Perks design (2026-10-28)', () => {
  it('asks Dash which items are AS IS at the printed price, then draws Perks tags with their strip', async () => {
    store('perks');
    api.getTagMarks.mockResolvedValue({ ITM0000001: { as_is: false, why: '' }, ITM0000002: { as_is: true, why: '$10' } });
    const result = await printPriceTags(LABELS);
    expect(result).toEqual({ printed: 2, failed: 0 });
    expect(api.getTagMarks).toHaveBeenCalledWith([{ sku: 'ITM0000001', price: '12' }, { sku: 'ITM0000002', price: '8' }]);
    expect(render.mock.calls.map((c) => [c[0], (c[1] as { as_is: boolean }).as_is])).toEqual([[perksTag, false], [perksTag, true]]);
  });

  it('prints AS IS when Dash cannot say (never a returns promise the register would refuse)', async () => {
    api.getTagMarks.mockRejectedValue(new Error('offline'));
    expect((await asPerksTags(LABELS)).map((t) => t.as_is)).toEqual([true, true]);
  });

  it('Classic stays the old drawing; with the switch off the print server draws as before', async () => {
    store('classic');
    await printPriceTags(LABELS);
    expect(api.getTagMarks).not.toHaveBeenCalled();
    expect(render.mock.calls.every((c) => c[0] === priceTag)).toBe(true);

    vi.clearAllMocks();
    store('perks', false);
    printer.printLabelBatch.mockResolvedValue({ printed: 2, failed: 0, errors: [] });
    await printPriceTags(LABELS);
    expect(render).not.toHaveBeenCalled();
    expect(api.getTagMarks).not.toHaveBeenCalled();
    expect(printer.printLabelBatch).toHaveBeenCalled();
  });
});
