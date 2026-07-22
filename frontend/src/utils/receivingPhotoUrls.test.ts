import { describe, expect, it } from 'vitest';
import type { ReceivingAttachmentDTO } from '../types/inventory.types';
import { attachmentFullUrl, attachmentThumbUrl } from './receivingPhotoUrls';

function att(partial: Partial<ReceivingAttachmentDTO> = {}): ReceivingAttachmentDTO {
  return {
    id: 1,
    kind: 'bol',
    pallet_number: null,
    side: '',
    client_photo_id: null,
    created_at: '2026-07-22T00:00:00Z',
    s3_file: { id: 1, key: 'h', filename: 'h.jpg', url: 'https://cdn/high.jpg' } as any,
    thumbnail_file: { id: 2, key: 't', filename: 't.jpg', url: 'https://cdn/thumb.jpg' } as any,
    ...partial,
  };
}

describe('receivingPhotoUrls', () => {
  it('prefers thumbnail for list/grid display', () => {
    expect(attachmentThumbUrl(att({}))).toBe('https://cdn/thumb.jpg');
  });

  it('falls back to high-res when thumbnail is missing (legacy rows)', () => {
    expect(attachmentThumbUrl(att({ thumbnail_file: null }))).toBe('https://cdn/high.jpg');
  });

  it('prefers high-res for the image viewer', () => {
    expect(attachmentFullUrl(att({}))).toBe('https://cdn/high.jpg');
  });

  it('falls back to thumbnail in the viewer if high-res url is empty', () => {
    expect(
      attachmentFullUrl(
        att({
          s3_file: { id: 1, key: 'h', filename: 'h.jpg', url: '' } as any,
        }),
      ),
    ).toBe('https://cdn/thumb.jpg');
  });

  it('returns null when both urls are missing', () => {
    expect(
      attachmentThumbUrl(
        att({
          s3_file: { id: 1, key: 'h', filename: 'h.jpg', url: '' } as any,
          thumbnail_file: null,
        }),
      ),
    ).toBeNull();
    expect(attachmentFullUrl(null)).toBeNull();
  });
});
