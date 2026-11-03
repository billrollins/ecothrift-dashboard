import { beforeEach, describe, expect, it, vi } from 'vitest';

const print = vi.hoisted(() => ({
  printLabelBatch: vi.fn(),
  printLabel: vi.fn(),
  printImageCopies: vi.fn(),
  printTags: vi.fn(),
  getSettings: vi.fn(),
}));
vi.mock('../../../services/localPrintService', () => ({ localPrintService: print }));
vi.mock('../../../api/inventory.api', () => ({ markItemsLabelsPrinted: vi.fn() }));
const store = vi.hoisted(() => ({ priceTagInDash: true }));
vi.mock('../../../api/core.api', () => ({
  getLabelSizeSetting: vi.fn(async () => ({ value: { w_in: 1.5, h_in: 1, dpi: 203 }, price_tag_in_dash: store.priceTagInDash })),
}));
vi.mock('../../../printing/tagCanvas', async (orig) => ({
  ...(await orig<typeof import('../../../printing/tagCanvas')>()),
  renderTagPng: vi.fn(async (design: { name: string }, data: { sku?: string; qr_data?: string }) =>
    `png:${design.name}:${data.sku ?? data.qr_data}`),
}));

import { printProcessingLabel, printProcessingLabelsStaggered, printRestorationTags } from './printProcessingLabel';
import { forgetStoreLabelSize, printTestLabel, reprintLastTag } from '../../../printing/printTags';

const FACTS = { needs: ['Test'], holdout: false, sent_on: '2026-10-28', sent_by: 'Ashley' };
// Since print server 1.9.10 restoration tags and the test label go to it as data (`printTags`); price tags with the
// switch on are still drawn here and sent as a picture (`printImageCopies`).
const sentTags = () => print.printTags.mock.calls.map((c) => c[0]);

describe('tags print at the label-size setting (2026-10-28)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    store.priceTagInDash = true;
    forgetStoreLabelSize();
    print.printImageCopies.mockResolvedValue({ success: true });
    print.printTags.mockResolvedValue({ success: true });
    print.printLabelBatch.mockResolvedValue({ printed: 1, failed: 0, errors: [] });
  });

  it('sends the restoration tag as data and draws the price tag here, each at the printer size', async () => {
    const result = await printProcessingLabelsStaggered([
      { id: 1, sku: 'ITM1', price: '10', product_title: 'Mixer', restoration_tag: FACTS },
      { id: 2, sku: 'ITM2', price: '12', product_title: 'Lamp' },
    ]);
    expect(sentTags().map((c) => [c.tags[0].kind, c.tags[0].doc_name, c.w_in, c.h_in, c.dpi]))
      .toEqual([['restoration', 'Restoration ITM1', 1.5, 1, 203]]);
    expect(print.printImageCopies.mock.calls.map((c) => c[0])).toEqual([
      { image_base64: 'png:Price tag:ITM2', copies: 1, dpi: 203, doc_name: 'Label-ITM2' },
    ]);
    expect(print.printLabelBatch).not.toHaveBeenCalled();
    expect(result).toEqual({ succeeded: 2, failed: 0, succeededItemIds: [1, 2] });
  });

  it('a check-in that is all Restoration never prints a price tag', async () => {
    await printProcessingLabelsStaggered([{ id: 1, sku: 'ITM1', price: '10', restoration_tag: FACTS }]);
    expect(sentTags().map((c) => c.tags[0].kind)).toEqual(['restoration']);
    expect(print.printImageCopies).not.toHaveBeenCalled();
    expect(print.printLabel).not.toHaveBeenCalled();
  });

  it('stops at the first failure and says how many did not print', async () => {
    print.printTags.mockRejectedValueOnce(new Error('printer jammed'));
    const result = await printRestorationTags([
      { id: 1, sku: 'ITM1', restoration_tag: FACTS },
      { id: 2, sku: 'ITM2', restoration_tag: FACTS },
    ]);
    expect(result).toEqual({ succeeded: 0, failed: 2, succeededItemIds: [] });
    expect(print.printTags).toHaveBeenCalledTimes(1);
  });

  it('a station override changes the dpi it sends', async () => {
    localStorage.setItem('label_size_station', JSON.stringify({ w_in: 2.25, h_in: 1.25, dpi: 300 }));
    await printRestorationTags([{ id: 1, sku: 'ITM1', restoration_tag: FACTS }]);
    expect(sentTags()[0].dpi).toBe(300);
  });

  it('a print server without image printing gets the old price tag call', async () => {
    print.printImageCopies.mockRejectedValue(
      new Error('This print server does not support custom labels yet - update it from Admin → Settings.'));
    const result = await printProcessingLabelsStaggered([{ id: 2, sku: 'ITM2', price: '12' }]);
    expect(print.printLabelBatch).toHaveBeenCalledTimes(1);
    expect(result.succeeded).toBe(1);
  });
});

describe('price tag switch off (the default): price tags print exactly as before', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    store.priceTagInDash = false;
    forgetStoreLabelSize();
    print.printImageCopies.mockResolvedValue({ success: true });
    print.printTags.mockResolvedValue({ success: true });
    print.printLabelBatch.mockResolvedValue({ printed: 2, failed: 0, errors: [] });
    print.printLabel.mockResolvedValue({ success: true });
  });

  it('a batch goes to /print/labels; restoration tags go to the print server as data', async () => {
    const result = await printProcessingLabelsStaggered([
      { id: 1, sku: 'ITM1', price: '10', restoration_tag: FACTS },
      { id: 2, sku: 'ITM2', price: '12' },
      { id: 3, sku: 'ITM3', price: '14' },
    ]);
    expect(print.printLabelBatch.mock.calls[0][0].map((l: { qr_data: string }) => l.qr_data)).toEqual(['ITM2', 'ITM3']);
    expect(sentTags().map((c) => c.tags[0].kind)).toEqual(['restoration']);
    expect(print.printImageCopies).not.toHaveBeenCalled();
    expect(result).toEqual({ succeeded: 3, failed: 0, succeededItemIds: [1, 2, 3] });
  });

  it('one label goes to /print/label', async () => {
    expect(await printProcessingLabel({ id: 2, sku: 'ITM2', price: '12' })).toBe(true);
    expect(print.printLabel).toHaveBeenCalledTimes(1);
    expect(print.printImageCopies).not.toHaveBeenCalled();
  });

  it('an older print server without /print/labels still gets one label at a time', async () => {
    print.printLabelBatch.mockRejectedValue(new Error('Batch label endpoint unavailable (404)'));
    const result = await printProcessingLabelsStaggered([{ id: 2, sku: 'ITM2', price: '12' }, { id: 3, sku: 'ITM3', price: '14' }]);
    await new Promise((r) => setTimeout(r, 300));
    expect(print.printLabel).toHaveBeenCalledTimes(2);
    expect(result.succeeded).toBe(2);
  });

  it('the test label goes to the print server as data, and reprint keeps the old path', async () => {
    await printTestLabel({ w_in: 1.5, h_in: 1, dpi: 203 });
    expect(sentTags().map((c) => c.tags[0].kind)).toEqual(['test']);
    await printProcessingLabel({ id: 2, sku: 'ITM2', price: '12' });
    print.printLabel.mockClear();
    await reprintLastTag();
    expect(print.printLabel.mock.calls[0][0].qr_data).toBe('ITM2');
  });
});
