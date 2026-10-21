import { afterEach, describe, expect, it, vi } from 'vitest';
import { localPrintService, PrintFailedError, printErrorMessage } from './localPrintService';

function answer(body: unknown, ok = true) {
  return vi.fn().mockResolvedValue({ ok, status: ok ? 200 : 500, json: () => Promise.resolve(body) });
}

describe('localPrintService (2026-10-21, REG-03): a failed print is loud', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('a receipt the print server says failed throws with its reason', async () => {
    vi.stubGlobal('fetch', answer({ success: false, message: 'Receipt print failed', error: 'paper out' }));
    const run = localPrintService.printReceipt({ receipt_number: 'R-1' }, true);
    await expect(run).rejects.toBeInstanceOf(PrintFailedError);
    await expect(localPrintService.printReceipt({}, true)).rejects.toThrow(
      'The receipt did not print. Receipt print failed: paper out',
    );
  });

  it('a printed receipt answers as before', async () => {
    vi.stubGlobal('fetch', answer({ success: true, message: 'Receipt sent', drawer_opened: true }));
    await expect(localPrintService.printReceipt({}, true)).resolves.toMatchObject({ drawer_opened: true });
  });

  it('a drawer that did not open throws too', async () => {
    vi.stubGlobal('fetch', answer({ success: false, message: 'Drawer control failed', error: 'no printer' }));
    await expect(localPrintService.openCashDrawer()).rejects.toThrow('The cash drawer did not open.');
  });

  it('printErrorMessage says why, or that the print server did not answer', () => {
    expect(printErrorMessage(new PrintFailedError('The receipt did not print. Paper out'))).toBe(
      'The receipt did not print. Paper out',
    );
    expect(printErrorMessage(new TypeError('Failed to fetch'))).toMatch(/print server did not answer/);
    expect(printErrorMessage(new Error('Print server request timed out.'))).toBe('Print server request timed out.');
  });
});
