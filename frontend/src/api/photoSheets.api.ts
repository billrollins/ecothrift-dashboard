import api from './client';
import type { FactKey, SheetLayout, SheetOrientation, SheetPhoto } from '../components/photoSheets/sheetLayouts';

/** Photo sheets (Dash Update #95): a letter-size sheet of photos and the full title, for items in a box. */

export interface PhotoSheetItem {
  id: number;
  sku: string;
  /** The tag price, or null when it has none yet. */
  price: string | null;
  status: string;
  condition: string;
}

export interface PhotoSheetProduct {
  id: number;
  product_number: string;
  title: string;
}

/** What a sheet holds: what is saved, and what the editor sends. */
export interface PhotoSheetFields {
  title: string;
  /** A short plain name for a long title: it prints big, the full title smaller under it. */
  name: string;
  brand: string;
  facts: Record<FactKey, string>;
  layout: SheetLayout;
  orientation: SheetOrientation;
  photos: SheetPhoto[];
  show_price: boolean;
  show_item_number: boolean;
  /** What the pictures are, printed under them: a product picture (most are from the web) or a photo of this item. */
  caption: 'product' | 'item';
  /** In the box, not put together: printed bold with the condition. */
  not_assembled: boolean;
}

export interface PhotoSheetDTO extends PhotoSheetFields {
  id: number;
  item: PhotoSheetItem | null;
  product: PhotoSheetProduct | null;
  print_count: number;
  printed_at: string | null;
  updated_at: string | null;
  updated_by: string;
}

export interface PhotoSheetStart {
  /** The saved sheet of this item (or product), ready for Print again. */
  sheet: PhotoSheetDTO | null;
  /** Where a new sheet starts: the newest sheet of the same product, else what Dash knows. Layout '' = Dash picks. */
  draft: Omit<PhotoSheetFields, 'layout' | 'orientation'> & {
    layout: SheetLayout | '';
    orientation: SheetOrientation | '';
    from_sheet: { id: number; sku: string } | null;
  };
  item: PhotoSheetItem | null;
  product: PhotoSheetProduct | null;
}

const B = '/inventory/photo-sheets';

export async function listPhotoSheets(q = '') {
  return (await api.get<{ results: PhotoSheetDTO[] }>(`${B}/`, { params: { q: q || undefined } })).data.results;
}

export async function startPhotoSheet(target: { item?: number | null; product?: number | null; code?: string }) {
  return (await api.get<PhotoSheetStart>(`${B}/start/`, {
    params: { item: target.item ?? undefined, product: target.product ?? undefined, code: target.code || undefined },
  })).data;
}

export async function getPhotoSheet(id: number) {
  return (await api.get<PhotoSheetDTO>(`${B}/${id}/`)).data;
}

export async function createPhotoSheet(body: PhotoSheetFields & { item?: number | null; product?: number | null }) {
  return (await api.post<PhotoSheetDTO>(`${B}/`, body)).data;
}

export async function updatePhotoSheet(id: number, body: Partial<PhotoSheetFields>) {
  return (await api.patch<PhotoSheetDTO>(`${B}/${id}/`, body)).data;
}

export async function markPhotoSheetPrinted(id: number) {
  return (await api.post<PhotoSheetDTO>(`${B}/${id}/printed/`)).data;
}

export async function uploadSheetPhoto(photo: Blob, filename = 'photo.jpg') {
  const form = new FormData();
  form.append('photo', photo, filename);
  return (await api.post<{ file: number; width: number; height: number; plain?: boolean }>(`${B}/photos/`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })).data;
}

/** A picture link pasted or dragged in: the server fetches it (the other site will not let the browser) and saves it. */
export async function uploadSheetPhotoLink(url: string) {
  return (await api.post<{ file: number; width: number; height: number; plain?: boolean }>(`${B}/photos/link/`, { url })).data;
}

export async function getSheetPhoto(file: number) {
  return (await api.get<Blob>(`${B}/photos/${file}/`, { responseType: 'blob' })).data;
}

export async function draftSheetWithAi(body: {
  item?: number | null; product?: number | null; title: string; brand: string; facts: Record<FactKey, string>;
}) {
  return (await api.post<{ title: string; name: string; facts: Record<FactKey, string>; model: string }>(`${B}/ai/`, body)).data;
}
