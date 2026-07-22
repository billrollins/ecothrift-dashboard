import { describe, expect, it, vi, afterEach } from 'vitest';
import { getRotatedJpeg, scaleDisplayCropToNatural } from './imageEdit';

describe('imageEdit', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('exports a JPEG blob after rotation', async () => {
    const out = new Blob([new Uint8Array([0xff, 0xd8])], { type: 'image/jpeg' });
    vi.stubGlobal(
      'Image',
      class {
        naturalWidth = 20;
        naturalHeight = 10;
        onload: (() => void) | null = null;
        addEventListener(type: string, cb: () => void) {
          if (type === 'load') this.onload = cb;
        }
        set src(_v: string) {
          queueMicrotask(() => this.onload?.());
        }
      },
    );
    const ctx = {
      translate: vi.fn(),
      rotate: vi.fn(),
      drawImage: vi.fn(),
    };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
    HTMLCanvasElement.prototype.toBlob = function (cb: BlobCallback) {
      cb(out);
    };
    const blob = await getRotatedJpeg('blob:x', 90);
    expect(blob.type).toBe('image/jpeg');
    expect(ctx.rotate).toHaveBeenCalled();
  });

  it('scales display crop to natural image pixels', () => {
    const img = {
      naturalWidth: 1000,
      naturalHeight: 500,
      width: 200,
      height: 100,
    } as HTMLImageElement;
    expect(scaleDisplayCropToNatural(img, { x: 20, y: 10, width: 100, height: 50 })).toEqual({
      x: 100,
      y: 50,
      width: 500,
      height: 250,
    });
  });
});
