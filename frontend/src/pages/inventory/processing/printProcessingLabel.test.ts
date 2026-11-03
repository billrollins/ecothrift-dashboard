import { beforeEach, describe, expect, it, vi } from 'vitest';

const print = vi.hoisted(() => ({
  printLabelBatch: vi.fn(),
  printLabel: vi.fn(),
  printTags: vi.fn(),
  getSettings: vi.fn(),
}));
vi.mock('../../../services/localPrintService', () => ({ localPrintService: print }));
vi.mock('../../../api/inventory.api', () => ({ markItemsLabelsPrinted: vi.fn() }));
vi.mock('../../../api/core.api', () => ({ getTagMarks: vi.fn(async () => ({})) }));
import { printProcessingLabel, printProcessingLabelsStaggered, printRestorationTags } from './printProcessingLabel';
import { printTestLabel, reprintLastTag } from '../../../printing/printTags';
import { writePrintPrefs } from '../../../printing/printPrefs';

const FACTS = { needs: ['Test'], holdout: false, sent_on: '2026-10-28', sent_by: 'Ashley' };

describe("tags print at this computer's label size (Dash Updates #9)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    writePrintPrefs({ priceTag: 'old' });
    print.printTags.mockResolvedValue({ success: true });
    print.printLabelBatch.mockResolvedValue({ printed: 1, failed: 0, errors: [] });
  });

  it('sends restoration and price tags to the print server as data, each at the printer size', async () => {
    const result = await printProcessingLabelsStaggered([
      { id: 1, sku: 'ITM1', price: '10', product_title: 'Mixer', restoration_tag: FACTS },
      { id: 2, sku: 'ITM2', price: '12', product_title: 'Lamp' },
    ]);
    const calls = print.printTags.mock.calls.map((c) => c[0]);
    expect(calls.map((c) => [c.tags[0].kind, c.tags[0].data.sku ?? c.tags[0].data.qr_data, c.tags[0].doc_name, c.w_in, c.h_in, c.dpi]))
      .toEqual([
        ['restoration', 'ITM1', 'Restoration ITM1', 1.5, 1, 203],
        ['price', 'ITM2', 'Label-ITM2', 1.5, 1, 203],
      ]);
    expect(JSON.stringify(calls)).not.toContain('image_base64');
    expect(print.printLabelBatch).not.toHaveBeenCalled();
    expect(result).toEqual({ succeeded: 2, failed: 0, succeededItemIds: [1, 2] });
  });

  it('a check-in that is all Restoration never prints a price tag', async () => {
    await printProcessingLabelsStaggered([{ id: 1, sku: 'ITM1', price: '10', restoration_tag: FACTS }]);
    expect(print.printTags).toHaveBeenCalledTimes(1);
    expect(print.printTags.mock.calls[0][0].tags[0].kind).toBe('restoration');
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

  it("this computer's label size is what it sends, at 203 dpi", async () => {
    writePrintPrefs({ size: '2.25x1.25' });
    await printRestorationTags([{ id: 1, sku: 'ITM1', restoration_tag: FACTS }]);
    const sent = print.printTags.mock.calls[0][0];
    expect([sent.w_in, sent.h_in, sent.dpi]).toEqual([2.25, 1.25, 203]);
  });

  it('a print server too old to draw price tags gets the old price tag call', async () => {
    print.printTags.mockResolvedValue({ success: false, message: 'Unknown tag kind: price' });
    const result = await printProcessingLabelsStaggered([{ id: 2, sku: 'ITM2', price: '12' }]);
    expect(print.printLabelBatch).toHaveBeenCalledTimes(1);
    expect(result.succeeded).toBe(1);
  });
});

describe('what this computer prints', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    print.printTags.mockResolvedValue({ success: true });
  });

  it('by default: the Thrift+ Perks price tag at 1.5 x 1, and the Restoration tag for Restoration items', async () => {
    await printProcessingLabelsStaggered([
      { id: 1, sku: 'ITM1', price: '10', restoration_tag: FACTS },
      { id: 2, sku: 'ITM2', price: '12' },
    ]);
    expect(print.printTags.mock.calls.map((c) => [c[0].tags[0].kind, c[0].w_in, c[0].h_in])).toEqual([
      ['restoration', 1.5, 1],
      ['perks', 1.5, 1],
    ]);
  });

  it('Restoration items get a price tag when this computer says so', async () => {
    writePrintPrefs({ restorationTag: 'price', priceTag: 'old' });
    const result = await printProcessingLabelsStaggered([
      { id: 1, sku: 'ITM1', price: '10', restoration_tag: FACTS },
      { id: 2, sku: 'ITM2', price: '12' },
    ]);
    expect(print.printTags.mock.calls.map((c) => c[0].tags[0].kind)).toEqual(['price', 'price']);
    expect(result).toEqual({ succeeded: 2, failed: 0, succeededItemIds: [1, 2] });
  });

  it('the test label goes to the print server as data, and reprint prints the last tag again', async () => {
    writePrintPrefs({ priceTag: 'old' });
    await printTestLabel({ w_in: 1.5, h_in: 1, dpi: 203 });
    expect(print.printTags.mock.calls.map((c) => c[0].tags[0].kind)).toEqual(['test']);
    await printProcessingLabel({ id: 2, sku: 'ITM2', price: '12' });
    print.printTags.mockClear();
    await reprintLastTag();
    expect(print.printTags.mock.calls[0][0].tags[0].data.qr_data).toBe('ITM2');
  });
});
