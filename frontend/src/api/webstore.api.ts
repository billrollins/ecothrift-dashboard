import api from './client';
import type { PaginatedResponse } from '../types';

export interface WebListingImage {
  id: number;
  alt: string;
  position: number;
  url: string;
  created_at: string;
}

export interface ChannelPublication {
  id: number;
  channel: string;
  status: string;
  title: string;
  body: string;
  external_url: string;
  posted_at: string | null;
  created_at: string;
  updated_at: string;
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
  on_hand: number;
  reserved: number;
  available: number;
  stock: number;
  status: string;
  status_display: string;
  featured: boolean;
  return_policy: string;
  return_policy_display: string;
  fb_title: string;
  fb_body: string;
  fb_posted_url: string;
  fb_posted_at: string | null;
  images: WebListingImage[];
  image_count: number;
  channel_publications: ChannelPublication[];
  on_sale: boolean;
  is_available: boolean;
  readiness_errors: string[];
  created_by: number | null;
  published_at: string | null;
  archived_at: string | null;
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

export function publishWebListing(id: number): Promise<{ data: WebListing }> {
  return api.post(`/webstore/listings/${id}/publish/`);
}

export function pauseWebListing(id: number): Promise<{ data: WebListing }> {
  return api.post(`/webstore/listings/${id}/pause/`);
}

export function archiveWebListing(id: number): Promise<{ data: WebListing }> {
  return api.post(`/webstore/listings/${id}/archive/`);
}

export function restoreWebListing(id: number): Promise<{ data: WebListing }> {
  return api.post(`/webstore/listings/${id}/restore/`);
}

export function generateFbCopy(id: number): Promise<{ data: WebListing }> {
  return api.post(`/webstore/listings/${id}/generate-fb-copy/`);
}

export function markFbPosted(
  id: number,
  externalUrl?: string,
): Promise<{ data: WebListing }> {
  return api.post(`/webstore/listings/${id}/mark-fb-posted/`, {
    external_url: externalUrl || '',
  });
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

export interface Reservation {
  id: number;
  status_token: string;
  listing: number;
  listing_title: string;
  listing_slug: string;
  item: number | null;
  item_sku: string | null;
  customer_name: string;
  email: string;
  phone: string;
  quantity: number;
  customer_note: string;
  staff_note: string;
  status: string;
  status_display: string;
  expires_at: string | null;
  staged_at: string | null;
  confirmed_at: string | null;
  completed_at: string | null;
  unit_price_snapshot: string;
  cost_snapshot: string | null;
  fee_amount: string;
  direct_expense: string;
  line_total: string;
  contribution: string;
  pos_cart: number | null;
  created_at: string;
  updated_at: string;
}

export interface ReservationParams {
  search?: string;
  status?: string;
  listing?: number;
  ordering?: string;
  page?: number;
  [key: string]: unknown;
}

export function getReservations(
  params?: ReservationParams,
): Promise<{ data: PaginatedResponse<Reservation> }> {
  return api.get('/webstore/reservations/', { params });
}

export function reservationAction(
  id: number,
  action: 'confirm' | 'stage' | 'decline' | 'cancel' | 'expire' | 'complete' | 'extend',
): Promise<{ data: Reservation }> {
  return api.post(`/webstore/reservations/${id}/${action}/`);
}

export function updateReservation(
  id: number,
  data: Record<string, unknown>,
): Promise<{ data: Reservation }> {
  return api.patch(`/webstore/reservations/${id}/`, data);
}

export function getWorkQueue(): Promise<{
  data: {
    items: Array<{
      id: number;
      sku: string;
      title: string;
      status: string;
      location: string;
      price: string | null;
    }>;
    draft_listings: WebListing[];
  };
}> {
  return api.get('/webstore/work-queue/');
}

export function getSalesLog(): Promise<{ data: { results: Reservation[] } }> {
  return api.get('/webstore/sales-log/');
}

export interface WebMessage {
  id: number;
  author_kind: 'customer' | 'staff' | 'system';
  body: string;
  created_at: string;
}

export interface Conversation {
  id: number;
  public_token: string;
  state: 'needs_reply' | 'waiting_on_customer' | 'resolved' | string;
  listing: number | null;
  listing_title: string | null;
  reservation_id: number | null;
  guest_name: string;
  guest_email: string;
  guest_phone: string;
  customer: number | null;
  staff_owner: number | null;
  staff_owner_email: string | null;
  staff_unread: number;
  customer_unread: number;
  last_message_at: string | null;
  created_at: string;
  updated_at: string;
  messages: WebMessage[];
}

export interface ConversationParams {
  search?: string;
  state?: string;
  has_hold?: string;
  listing?: number;
  ordering?: string;
  page?: number;
  [key: string]: unknown;
}

export function getConversations(
  params?: ConversationParams,
): Promise<{ data: PaginatedResponse<Conversation> }> {
  return api.get('/webstore/conversations/', { params });
}

export function getConversation(id: number): Promise<{ data: Conversation }> {
  return api.get(`/webstore/conversations/${id}/`);
}

export function replyConversation(
  id: number,
  body: string,
): Promise<{ data: Conversation }> {
  return api.post(`/webstore/conversations/${id}/reply/`, { body });
}

export function assignConversation(id: number): Promise<{ data: Conversation }> {
  return api.post(`/webstore/conversations/${id}/assign/`);
}

export function resolveConversation(id: number): Promise<{ data: Conversation }> {
  return api.post(`/webstore/conversations/${id}/resolve/`);
}

export function reopenConversation(id: number): Promise<{ data: Conversation }> {
  return api.post(`/webstore/conversations/${id}/reopen/`);
}

// Legacy order types kept for any remaining references.
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
