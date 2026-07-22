import { describe, expect, it } from 'vitest';
import type { ReceivingAttachmentDTO, ReceivingDetailDTO } from '../types/inventory.types';
import { buildReceivingPhotoGallery, galleryIndexForAttachment } from './receivingPhotoGallery';

function att(
  partial: Partial<ReceivingAttachmentDTO> & Pick<ReceivingAttachmentDTO, 'id' | 'kind'>,
): ReceivingAttachmentDTO {
  return {
    pallet_number: null,
    side: '',
    client_photo_id: null,
    created_at: '2026-07-22T00:00:00Z',
    s3_file: { id: partial.id, key: 'k', filename: 'f.jpg', url: `https://x/${partial.id}.jpg` } as any,
    thumbnail_file: null,
    ...partial,
  };
}

function receiving(attachments: ReceivingAttachmentDTO[], palletCount = 1): ReceivingDetailDTO {
  return {
    id: 1,
    purchase_order_id: 1,
    received_date: '2026-07-22',
    start_time: null,
    end_time: null,
    condition: 'good',
    issues: '',
    received_pallet_count: palletCount,
    completed_at: null,
    draft_version: 1,
    is_draft: true,
    pallets: [],
    attachments,
    created_by: null,
    created_at: '2026-07-22T00:00:00Z',
    updated_at: '2026-07-22T00:00:00Z',
  } as ReceivingDetailDTO;
}

describe('buildReceivingPhotoGallery', () => {
  it('orders BOL, truck, then each pallet Front→Right→Back→Left', () => {
    const gallery = buildReceivingPhotoGallery(
      receiving(
        [
          att({ id: 10, kind: 'pallet_side', pallet_number: 2, side: 'left' }),
          att({ id: 1, kind: 'truck' }),
          att({ id: 2, kind: 'bol' }),
          att({ id: 3, kind: 'pallet_side', pallet_number: 1, side: 'back' }),
          att({ id: 4, kind: 'pallet_side', pallet_number: 1, side: 'front' }),
          att({ id: 5, kind: 'pallet_side', pallet_number: 1, side: 'right' }),
          att({ id: 6, kind: 'pallet_side', pallet_number: 1, side: 'left' }),
          att({ id: 7, kind: 'pallet_side', pallet_number: 2, side: 'front' }),
        ],
        2,
      ),
    );
    expect(gallery.map((g) => g.attachment.id)).toEqual([2, 1, 4, 5, 3, 6, 7, 10]);
    expect(gallery.map((g) => g.title)).toEqual([
      'Bill of Lading',
      'Truck photo',
      'Pallet 1 · Front',
      'Pallet 1 · Right',
      'Pallet 1 · Back',
      'Pallet 1 · Left',
      'Pallet 2 · Front',
      'Pallet 2 · Left',
    ]);
  });

  it('skips missing slots', () => {
    const gallery = buildReceivingPhotoGallery(
      receiving([att({ id: 2, kind: 'bol' }), att({ id: 9, kind: 'pallet_side', pallet_number: 1, side: 'front' })], 1),
    );
    expect(gallery.map((g) => g.attachment.id)).toEqual([2, 9]);
    expect(galleryIndexForAttachment(gallery, 9)).toBe(1);
    expect(galleryIndexForAttachment(gallery, 99)).toBe(-1);
  });
});
