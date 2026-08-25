import { describe, expect, it } from 'vitest';
import { shouldKeepHistoryDrawer } from './RestorationScanField';

describe('shouldKeepHistoryDrawer', () => {
  it('stays open when the click is the drawer or a row', () => {
    const drawer = document.createElement('div');
    drawer.setAttribute('data-overview-history', '');
    expect(shouldKeepHistoryDrawer(drawer)).toBe(true);

    const row = document.createElement('div');
    row.setAttribute('data-restoration-job', '11');
    const chrome = document.createElement('span');
    row.appendChild(chrome);
    expect(shouldKeepHistoryDrawer(chrome)).toBe(true);
  });

  it('closes when the click is outside the drawer', () => {
    expect(shouldKeepHistoryDrawer(document.createElement('h5'))).toBe(false);
    expect(shouldKeepHistoryDrawer(document.createElement('input'))).toBe(false);
  });
});
