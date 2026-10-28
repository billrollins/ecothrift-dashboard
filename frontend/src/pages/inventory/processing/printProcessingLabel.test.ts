import { beforeEach, describe, expect, it, vi } from 'vitest';

const print = vi.hoisted(() => ({
  printLabelBatch: vi.fn(),
  printLabel: vi.fn(),
  printImageCopies: vi.fn(),
  getSettings: vi.fn(),
}));
vi.mock('../../../services/localPrintService', () => ({ localPrintService: print }));
vi.mock('../../../api/inventory.api', () => ({ markItemsLabelsPrinted: vi.fn() }));
vi.mock('../../restoration/tag/restorationTag', () => ({
  renderRestorationTagPng: vi.fn((input: { sku: string }) => `png:${input.sku}`),
  tagDpiForStock: (preset: string) => (preset === '1.5x1' ? 406 : 203),
}));

import { printProcessingLabelsStaggered, printRestorationTags } from './printProcessingLabel';

const FACTS = { needs: ['Test'], holdout: false, sent_on: '2026-10-28', sent_by: 'Ashley' };

describe('restoration items print the restoration tag (owner, 2026-10-28)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    print.getSettings.mockResolvedValue({ label_size_preset: '1.5x1' });
    print.printImageCopies.mockResolvedValue({ success: true });
    print.printLabelBatch.mockResolvedValue({ printed: 1, failed: 0 });
  });

  it('sends restoration items as tags and the rest as price tags', async () => {
    const result = await printProcessingLabelsStaggered([
      { id: 1, sku: 'ITM1', price: '10', product_title: 'Mixer', restoration_tag: FACTS },
      { id: 2, sku: 'ITM2', price: '12', product_title: 'Lamp' },
    ]);
    expect(print.printImageCopies).toHaveBeenCalledTimes(1);
    expect(print.printImageCopies).toHaveBeenCalledWith({ image_base64: 'png:ITM1', copies: 1, dpi: 406, doc_name: 'Restoration ITM1' });
    expect(print.printLabelBatch).toHaveBeenCalledTimes(1);
    expect(print.printLabelBatch.mock.calls[0][0].map((l: { qr_data: string }) => l.qr_data)).toEqual(['ITM2']);
    expect(result).toEqual({ succeeded: 2, failed: 0, succeededItemIds: [1, 2] });
  });

  it('a check-in that is all Restoration never prints a price tag', async () => {
    await printProcessingLabelsStaggered([{ id: 1, sku: 'ITM1', price: '10', restoration_tag: FACTS }]);
    expect(print.printLabelBatch).not.toHaveBeenCalled();
    expect(print.printLabel).not.toHaveBeenCalled();
  });

  it('stops at the first failure and says how many did not print', async () => {
    print.printImageCopies.mockRejectedValueOnce(new Error('update the print server'));
    const result = await printRestorationTags([
      { id: 1, sku: 'ITM1', restoration_tag: FACTS },
      { id: 2, sku: 'ITM2', restoration_tag: FACTS },
    ]);
    expect(result).toEqual({ succeeded: 0, failed: 2, succeededItemIds: [] });
    expect(print.printImageCopies).toHaveBeenCalledTimes(1);
  });

  it('prints on 3x2 when the print server cannot say its stock', async () => {
    print.getSettings.mockRejectedValue(new Error('V2'));
    await printRestorationTags([{ id: 1, sku: 'ITM1', restoration_tag: FACTS }]);
    expect(print.printImageCopies.mock.calls[0][0].dpi).toBe(203);
  });
});
