import api from './client';

/** A product's pack (Dash Update #224, `apps/inventory/api_product_packs.py`). */
export interface ProductPackDTO {
  id: number;
  title: string;
  unit_count: number | null;
  unit_name: string;
  pack_units: number | null;
  base_product: number | null;
  /** "3 boxes × 100", "100 ct", or "" */
  pack_label: string;
  is_pack: boolean;
  /** The product's own numbers, or a guess from its title (`from_title`). */
  guess: { unit_count: number | null; unit_name: string; pack_units: number; from_title: boolean };
}

export interface NewPackPayload {
  unit_count: number;
  unit_name: string;
  pack_units: number;
  title?: string;
  base_unit_count?: number;
  base_unit_name?: string;
  base_pack_units?: number;
  /** Save the corrected count on the base product too ("it was really 10"). */
  fix_base?: boolean;
  base_price?: string;
  base_retail?: string;
}

export interface NewPackResult {
  product: { id: number; product_number: string; title: string; brand: string } & Omit<ProductPackDTO, 'id' | 'title'>;
  base: { id: number; title: string; fixed: boolean } & Omit<ProductPackDTO, 'id' | 'title'>;
  label: string;
  base_pieces: number | null;
  new_pieces: number | null;
  /** Scaled from the base price and retail; free to edit at check-in. */
  price: string | null;
  retail: string | null;
}

/** The AI's draft of a product from a pasted vendor page (#224); nothing is saved. */
export interface ProductFromPageDTO {
  draft: {
    title: string;
    brand: string;
    model: string;
    category: string;
    subcategory: string;
    upc: string;
    retail: string | null;
    identifiers: Record<string, string>;
    specifications: Record<string, string>;
    tags: string[];
    unit_count: number | null;
    unit_name: string;
    pack_units: number | null;
    pack_label: string;
  };
  /** Field by field: from the page, or from the manifest row (the page said nothing). */
  source: Record<string, 'page' | 'row'>;
  confidence: 'high' | 'medium' | 'low';
  problems: string[];
  model: string;
  took_ms: number;
  cost_usd: string | null;
}

export function productFromPage(text: string, processingRowId?: number): Promise<{ data: ProductFromPageDTO }> {
  return api.post<ProductFromPageDTO>('/inventory/products/from-page/', { text, row: processingRowId });
}

export function getProductPack(productId: number): Promise<{ data: ProductPackDTO }> {
  return api.get<ProductPackDTO>(`/inventory/products/${productId}/pack/`);
}

export function makeNewPack(productId: number, payload: NewPackPayload): Promise<{ data: NewPackResult }> {
  return api.post<NewPackResult>(`/inventory/products/${productId}/new-pack/`, payload);
}
