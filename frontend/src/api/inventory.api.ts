import type { PaginatedResponse } from '../types/index';
import type { Vendor, PurchaseOrder, Product, Item, CSVTemplate } from '../types/inventory.types';
import api, { apiPublic } from './client';

export type { Vendor, PurchaseOrder, Product, Item, CSVTemplate };

type Order = PurchaseOrder;
type Template = CSVTemplate;

// Vendors CRUD
export function getVendors(params?: Record<string, unknown>): Promise<{ data: PaginatedResponse<Vendor> }> {
  return api.get<PaginatedResponse<Vendor>>('/inventory/vendors/', { params });
}

export function getVendor(id: number): Promise<{ data: Vendor }> {
  return api.get<Vendor>(`/inventory/vendors/${id}/`);
}

export function createVendor(data: Record<string, unknown>): Promise<{ data: Vendor }> {
  return api.post<Vendor>('/inventory/vendors/', data);
}

export function updateVendor(id: number, data: Record<string, unknown>): Promise<{ data: Vendor }> {
  return api.patch<Vendor>(`/inventory/vendors/${id}/`, data);
}

export function deleteVendor(id: number): Promise<{ data: void }> {
  return api.delete(`/inventory/vendors/${id}/`);
}

// Orders CRUD
export function getOrders(params?: Record<string, unknown>): Promise<{ data: PaginatedResponse<Order> }> {
  return api.get<PaginatedResponse<Order>>('/inventory/orders/', { params });
}

export function getOrder(id: number): Promise<{ data: Order }> {
  return api.get<Order>(`/inventory/orders/${id}/`);
}

export function createOrder(data: Record<string, unknown>): Promise<{ data: Order }> {
  return api.post<Order>('/inventory/orders/', data);
}

export function updateOrder(id: number, data: Record<string, unknown>): Promise<{ data: Order }> {
  return api.patch<Order>(`/inventory/orders/${id}/`, data);
}

export function deleteOrder(id: number): Promise<{ data: void }> {
  return api.delete(`/inventory/orders/${id}/`);
}

export function markOrderPaid(id: number, date?: string): Promise<{ data: Order }> {
  return api.post<Order>(`/inventory/orders/${id}/mark-paid/`, date ? { paid_date: date } : undefined);
}

export function revertOrderPaid(id: number): Promise<{ data: Order }> {
  return api.post<Order>(`/inventory/orders/${id}/revert-paid/`);
}

export function markOrderShipped(
  id: number,
  data: { shipped_date?: string; expected_delivery?: string },
): Promise<{ data: Order }> {
  return api.post<Order>(`/inventory/orders/${id}/mark-shipped/`, data);
}

export function revertOrderShipped(id: number): Promise<{ data: Order }> {
  return api.post<Order>(`/inventory/orders/${id}/revert-shipped/`);
}

export function deliverOrder(id: number, date?: string): Promise<{ data: Order }> {
  return api.post<Order>(`/inventory/orders/${id}/deliver/`, date ? { delivered_date: date } : undefined);
}

export function revertOrderDelivered(id: number): Promise<{ data: Order }> {
  return api.post<Order>(`/inventory/orders/${id}/revert-delivered/`);
}

export function uploadManifest(orderId: number, file: File): Promise<{ data: unknown }> {
  const formData = new FormData();
  formData.append('file', file);
  return api.post(`/inventory/orders/${orderId}/upload-manifest/`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
}

export function processManifest(
  orderId: number,
  data: Record<string, unknown>
): Promise<{ data: unknown }> {
  return api.post(`/inventory/orders/${orderId}/process-manifest/`, data);
}

export function createItems(orderId: number): Promise<{ data: unknown }> {
  return api.post(`/inventory/orders/${orderId}/create-items/`);
}

// Templates CRUD
export function getTemplates(params?: Record<string, unknown>): Promise<{ data: PaginatedResponse<Template> }> {
  return api.get<PaginatedResponse<Template>>('/inventory/templates/', { params });
}

export function getTemplate(id: number): Promise<{ data: Template }> {
  return api.get<Template>(`/inventory/templates/${id}/`);
}

export function createTemplate(data: Record<string, unknown>): Promise<{ data: Template }> {
  return api.post<Template>('/inventory/templates/', data);
}

export function updateTemplate(id: number, data: Record<string, unknown>): Promise<{ data: Template }> {
  return api.patch<Template>(`/inventory/templates/${id}/`, data);
}

export function deleteTemplate(id: number): Promise<{ data: void }> {
  return api.delete(`/inventory/templates/${id}/`);
}

// Products CRUD
export function getProducts(params?: Record<string, unknown>): Promise<{ data: PaginatedResponse<Product> }> {
  return api.get<PaginatedResponse<Product>>('/inventory/products/', { params });
}

export function getProduct(id: number): Promise<{ data: Product }> {
  return api.get<Product>(`/inventory/products/${id}/`);
}

export function createProduct(data: Record<string, unknown>): Promise<{ data: Product }> {
  return api.post<Product>('/inventory/products/', data);
}

export function updateProduct(id: number, data: Record<string, unknown>): Promise<{ data: Product }> {
  return api.patch<Product>(`/inventory/products/${id}/`, data);
}

export function deleteProduct(id: number): Promise<{ data: void }> {
  return api.delete(`/inventory/products/${id}/`);
}

// Items CRUD
export function getItems(params?: Record<string, unknown>): Promise<{ data: PaginatedResponse<Item> }> {
  return api.get<PaginatedResponse<Item>>('/inventory/items/', { params });
}

export function getItem(id: number): Promise<{ data: Item }> {
  return api.get<Item>(`/inventory/items/${id}/`);
}

export function createItem(data: Record<string, unknown>): Promise<{ data: Item }> {
  return api.post<Item>('/inventory/items/', data);
}

export function updateItem(id: number, data: Record<string, unknown>): Promise<{ data: Item }> {
  return api.patch<Item>(`/inventory/items/${id}/`, data);
}

export function deleteItem(id: number): Promise<{ data: void }> {
  return api.delete(`/inventory/items/${id}/`);
}

export function markItemReady(id: number): Promise<{ data: Item }> {
  return api.post<Item>(`/inventory/items/${id}/ready/`);
}

/** Item lookup by SKU - no auth required */
export function itemLookup(sku: string) {
  return apiPublic.get<Item>(`/inventory/items/lookup/${encodeURIComponent(sku)}/`);
}
