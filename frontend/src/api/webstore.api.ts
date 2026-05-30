import api from './client';
import type { PaginatedResponse } from '../types';

export interface WebListingImage {
  id: number;
  alt: string;
  position: number;
  url: string;
  created_at: string;
}

export interface WebListing {
  id: number;
  title: string;
  slug: string;
  category: number | null;
  category_name: string | null;
  item: number | null;
  item_sku: string | null;
  sku: string;
  description: string;
  condition: string;
  condition_display: string;
  price: string;
  compare_at_price: string | null;
  stock: number;
  status: string;
  status_display: string;
  featured: boolean;
  images: WebListingImage[];
  image_count: number;
  on_sale: boolean;
  is_available: boolean;
  created_by: number | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface WebListingParams {
  search?: string;
  status?: string;
  category?: number;
  featured?: boolean;
  ordering?: string;
  page?: number;
  [key: string]: unknown;
}

const stripMultipartContentType = [
  (body: unknown, headers: Record<string, unknown>) => {
    if (body instanceof FormData) delete headers['Content-Type'];
    return body;
  },
];

export function getWebListings(
  params?: WebListingParams,
): Promise<{ data: PaginatedResponse<WebListing> }> {
  return api.get('/webstore/listings/', { params });
}

export function getWebListing(id: number): Promise<{ data: WebListing }> {
  return api.get(`/webstore/listings/${id}/`);
}

export function createWebListing(data: Record<string, unknown>): Promise<{ data: WebListing }> {
  return api.post('/webstore/listings/', data);
}

export function updateWebListing(
  id: number,
  data: Record<string, unknown>,
): Promise<{ data: WebListing }> {
  return api.patch(`/webstore/listings/${id}/`, data);
}

export function deleteWebListing(id: number): Promise<unknown> {
  return api.delete(`/webstore/listings/${id}/`);
}

export function uploadWebListingImage(
  id: number,
  file: File,
  alt?: string,
): Promise<{ data: WebListingImage }> {
  const form = new FormData();
  form.append('file', file);
  if (alt) form.append('alt', alt);
  return api.post(`/webstore/listings/${id}/images/`, form, {
    transformRequest: stripMultipartContentType,
  });
}

export function deleteWebListingImage(listingId: number, imageId: number): Promise<unknown> {
  return api.delete(`/webstore/listings/${listingId}/images/${imageId}/`);
}

// Category options for the listing form (web-shop taxonomy only).
export interface CategoryOption {
  id: number;
  name: string;
  slug: string;
}

export interface CategoriesResponse {
  total: number;
  categories: Array<CategoryOption & { id: number | null; count: number; description?: string }>;
}

export function getCategoryOptions(): Promise<{ data: CategoriesResponse }> {
  return api.get('/webstore/catalog/categories/');
}

// ── Orders (staff management) ────────────────────────────────────────────────

export interface OrderLine {
  id: number;
  listing: number | null;
  title: string;
  slug: string;
  sku: string;
  unit_price: string;
  quantity: number;
  line_total: string;
}

export interface WebOrder {
  id: number;
  order_number: string;
  status: string;
  status_display: string;
  payment_provider: string;
  payment_status: string;
  payment_status_display: string;
  payment_reference: string;
  fulfillment: string;
  fulfillment_display: string;
  customer_name: string;
  email: string;
  phone: string;
  ship_address1: string;
  ship_address2: string;
  ship_city: string;
  ship_state: string;
  ship_postal: string;
  subtotal: string;
  shipping: string;
  tax: string;
  total: string;
  item_count: number;
  customer_note: string;
  staff_note: string;
  lines: OrderLine[];
  created_at: string;
  updated_at: string;
}

export interface WebOrderParams {
  search?: string;
  status?: string;
  payment_status?: string;
  fulfillment?: string;
  ordering?: string;
  page?: number;
  [key: string]: unknown;
}

export function getWebOrders(
  params?: WebOrderParams,
): Promise<{ data: PaginatedResponse<WebOrder> }> {
  return api.get('/webstore/orders/', { params });
}

export function getWebOrder(id: number): Promise<{ data: WebOrder }> {
  return api.get(`/webstore/orders/${id}/`);
}

export function updateWebOrder(
  id: number,
  data: Record<string, unknown>,
): Promise<{ data: WebOrder }> {
  return api.patch(`/webstore/orders/${id}/`, data);
}

export function setWebOrderStatus(id: number, status: string): Promise<{ data: WebOrder }> {
  return api.post(`/webstore/orders/${id}/set-status/`, { status });
}
