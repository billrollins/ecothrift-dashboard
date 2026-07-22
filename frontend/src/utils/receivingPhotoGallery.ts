import type { ReceivingAttachmentDTO, ReceivingDetailDTO } from '../types/inventory.types';
import { PALLET_SIDES } from '../services/receiving/receivingClient';

const SIDE_LABEL: Record<(typeof PALLET_SIDES)[number], string> = {
  front: 'Front',
  right: 'Right',
  back: 'Back',
  left: 'Left',
};

export type ReceivingGalleryItem = {
  attachment: ReceivingAttachmentDTO;
  title: string;
};

/**
 * Existing Receiving photos in navigation order:
 * BOL → Truck → Pallet 1 Front/Right/Back/Left → Pallet 2 … 
 */
export function buildReceivingPhotoGallery(rec: ReceivingDetailDTO): ReceivingGalleryItem[] {
  const items: ReceivingGalleryItem[] = [];
  const bol = rec.attachments.find((a) => a.kind === 'bol');
  if (bol) items.push({ attachment: bol, title: 'Bill of Lading' });
  const truck = rec.attachments.find((a) => a.kind === 'truck');
  if (truck) items.push({ attachment: truck, title: 'Truck photo' });

  const palletCount = Math.max(0, rec.received_pallet_count || 0);
  for (let n = 1; n <= palletCount; n += 1) {
    for (const side of PALLET_SIDES) {
      const att = rec.attachments.find(
        (a) => a.kind === 'pallet_side' && a.pallet_number === n && a.side === side,
      );
      if (att) {
        items.push({
          attachment: att,
          title: `Pallet ${n} · ${SIDE_LABEL[side]}`,
        });
      }
    }
  }
  return items;
}

export function galleryIndexForAttachment(
  gallery: ReceivingGalleryItem[],
  attachmentId: number,
): number {
  return gallery.findIndex((g) => g.attachment.id === attachmentId);
}
