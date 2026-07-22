import { afterEach, describe, expect, it, vi } from 'vitest';
import { downloadBlob } from './downloadBlob';

describe('downloadBlob', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates an object URL and clicks an anchor with the filename', () => {
    const createObjectURL = vi.fn(() => 'blob:mock');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });

    const click = vi.fn();
    const appendChild = vi.spyOn(document.body, 'appendChild').mockImplementation((node) => node);
    const remove = vi.fn();
    vi.spyOn(document, 'createElement').mockImplementation(() => {
      return {
        href: '',
        download: '',
        click,
        remove,
      } as unknown as HTMLAnchorElement;
    });

    downloadBlob(new Blob(['a,b'], { type: 'text/csv' }), 'order.csv');
    expect(createObjectURL).toHaveBeenCalled();
    expect(click).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock');
    expect(appendChild).toHaveBeenCalled();
  });
});
