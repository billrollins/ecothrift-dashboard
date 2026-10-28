import { beforeEach, describe, expect, it, vi } from 'vitest';

const print = vi.hoisted(() => ({
  printLabelBatch: vi.fn(),
  printLabel: vi.fn(),
  printImageCopies: vi.fn(),
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

describe('tags print at the label-size setting (2026-10-28)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    store.priceTagInDash = true;
    forgetStoreLabelSize();
    print.printImageCopies.mockResolvedValue({ success: true });
    print.printLabelBatch.mockResolvedValue({ printed: 1, failed: 0, errors: [] });
  });

  it('draws restoration and price tags here and sends each at the printer dpi', async () => {
    const result = await printProcessingLabelsStaggered([
      { id: 1, sku: 'ITM1', price: '10', product_title: 'Mixer', restoration_tag: FACTS },
      { id: 2, sku: 'ITM2', price: '12', product_title: 'Lamp' },
    ]);
    expect(print.printImageCopies.mock.calls.map((c) => c[0])).toEqual([
      { image_base64: 'png:Restoration tag:ITM1', copies: 1, dpi: 203, doc_name: 'Restoration ITM1' },
      { image_base64: 'png:Price tag:ITM2', copies: 1, dpi: 203, doc_name: 'Label-ITM2' },
    ]);
    expect(print.printLabelBatch).not.toHaveBeenCalled();
    expect(result).toEqual({ succeeded: 2, failed: 0, succeededItemIds: [1, 2] });
  });

  it('a check-in that is all Restoration never prints a price tag', async () => {
    await printProcessingLabelsStaggered([{ id: 1, sku: 'ITM1', price: '10', restoration_tag: FACTS }]);
    expect(print.printImageCopies).toHaveBeenCalledTimes(1);
    expect(print.printImageCopies.mock.calls[0][0].image_base64).toContain('Restoration');
    expect(print.printLabel).not.toHaveBeenCalled();
  });

  it('stops at the first failure and says how many did not print', async () => {
    print.printImageCopies.mockRejectedValueOnce(new Error('printer jammed'));
    const result = await printRestorationTags([
      { id: 1, sku: 'ITM1', restoration_tag: FACTS },
      { id: 2, sku: 'ITM2', restoration_tag: FACTS },
    ]);
    expect(result).toEqual({ succeeded: 0, failed: 2, succeededItemIds: [] });
    expect(print.printImageCopies).toHaveBeenCalledTimes(1);
  });

  it('a station override changes the dpi it sends', async () => {
    localStorage.setItem('label_size_station', JSON.stringify({ w_in: 2.25, h_in: 1.25, dpi: 300 }));
    await printRestorationTags([{ id: 1, sku: 'ITM1', restoration_tag: FACTS }]);
    expect(print.printImageCopies.mock.calls[0][0].dpi).toBe(300);
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
    print.printLabelBatch.mockResolvedValue({ printed: 2, failed: 0, errors: [] });
    print.printLabel.mockResolvedValue({ success: true });
  });

  it('a batch goes to /print/labels; restoration tags still draw here', async () => {
    const result = await printProcessingLabelsStaggered([
      { id: 1, sku: 'ITM1', price: '10', restoration_tag: FACTS },
      { id: 2, sku: 'ITM2', price: '12' },
      { id: 3, sku: 'ITM3', price: '14' },
    ]);
    expect(print.printLabelBatch.mock.calls[0][0].map((l: { qr_data: string }) => l.qr_data)).toEqual(['ITM2', 'ITM3']);
    expect(print.printImageCopies).toHaveBeenCalledTimes(1);
    expect(print.printImageCopies.mock.calls[0][0].image_base64).toContain('Restoration');
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

  it('the test label still prints a sample price tag in the new drawing, and reprint keeps the old path', async () => {
    await printTestLabel({ w_in: 1.5, h_in: 1, dpi: 203 });
    expect(print.printImageCopies.mock.calls.map((c) => c[0].image_base64)).toEqual([
      'png:Test label:undefined', 'png:Price tag:ITM0000000']);
    await printProcessingLabel({ id: 2, sku: 'ITM2', price: '12' });
    print.printLabel.mockClear();
    await reprintLastTag();
    expect(print.printLabel.mock.calls[0][0].qr_data).toBe('ITM2');
  });
});
