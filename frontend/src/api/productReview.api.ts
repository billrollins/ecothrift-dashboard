import api from './client';

/** One product waiting for a person to confirm its category, subcategory and short name. */
export interface ProductReviewRow {
  product_id: number;
  title: string;
  brand: string;
  dollars: string;
  confidence: string;
  source?: string;
  batch?: string;
  proposed: { category?: string; subcategory?: string; short_name?: string; flags?: string[] };
  second_opinion: { category?: string; source?: string };
  current: { category?: string; subcategory?: string; short_name?: string };
}

export interface ProductReviewPage {
  count: number;
  page: number;
  page_size: number;
  results: ProductReviewRow[];
  categories: string[];
  by_category: { category: string; dollars: string }[];
}

export type ProductReviewAction = 'accept' | 'fix' | 'reject';

export interface ProductReviewDecision {
  action: ProductReviewAction;
  category?: string;
  subcategory?: string;
  short_name?: string;
}

export async function fetchProductReview(params: { page?: number; category?: string }): Promise<ProductReviewPage> {
  const { data } = await api.get<ProductReviewPage>('/inventory/product-review/', { params });
  return data;
}

export async function decideProductReview(productId: number, body: ProductReviewDecision): Promise<void> {
  await api.post(`/inventory/product-review/${productId}/decide/`, body);
}
