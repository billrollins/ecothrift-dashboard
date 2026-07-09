import api from './client';
import type { PaginatedResponse } from '../types';

// ── Types (mirror apps/labels/serializers.py · CustomLabelSerializer) ─────────

export type CustomLabelKind = 'pdf' | 'template';
export type LabelFont = 'arial' | 'consolas' | 'georgia';
export type LabelAlign = 'left' | 'center' | 'right';
export type LabelEcc = 'L' | 'M' | 'Q' | 'H';
export type LabelVarKind = 'text' | 'increment';
export type LabelIncrementFormat =
  | 'plain'
  | 'integer'
  | 'fixed_2'
  | 'currency'
  | 'pad_4'
  | 'pad_6';

export interface LabelTextVariable {
  key: string;
  name: string;
  kind: 'text';
  default: string;
}

export interface LabelIncrementVariable {
  key: string;
  name: string;
  kind: 'increment';
  default_start: string;
  default_step: string;
  format: LabelIncrementFormat;
}

export type LabelVariable = LabelTextVariable | LabelIncrementVariable;

export interface LabelTextElement {
  type: 'text';
  variable?: string;
  literal?: string;
  x_pct: number;
  y_pct: number;
  font: LabelFont;
  size_pt: number;
  align: LabelAlign;
  bold?: boolean;
}

export interface LabelQrElement {
  type: 'qr';
  variable?: string;
  literal?: string;
  x_pct: number;
  y_pct: number;
  w_pct: number;
  h_pct: number;
  ecc: LabelEcc;
}

export interface LabelBarcodeElement {
  type: 'barcode';
  variable?: string;
  literal?: string;
  x_pct: number;
  y_pct: number;
  w_pct: number;
  h_pct: number;
  show_text: boolean;
}

export type LabelElement = LabelTextElement | LabelQrElement | LabelBarcodeElement;

export interface LabelDefinition {
  variables: LabelVariable[];
  elements: LabelElement[];
}

export interface LabelMedia {
  id: number;
  filename: string;
  size: number;
  /** Staff proxy URL (302 → presigned S3). */
  url: string;
}

export interface CustomLabel {
  id: number;
  name: string;
  slug: string;
  kind: CustomLabelKind;
  width_in: string | null;
  height_in: string | null;
  definition: LabelDefinition | Record<string, never>;
  background_file: LabelMedia | null;
  pdf: LabelMedia | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

const stripMultipartContentType = [
  (body: unknown, headers: Record<string, unknown>) => {
    if (body instanceof FormData) delete headers['Content-Type'];
    return body;
  },
];

// ── CRUD ──────────────────────────────────────────────────────────────────────

export function getCustomLabels(params?: {
  search?: string;
  include_archived?: '1';
}): Promise<{ data: PaginatedResponse<CustomLabel> }> {
  return api.get('/labels/labels/', { params: { page_size: 200, ...params } });
}

export function getCustomLabel(id: number): Promise<{ data: CustomLabel }> {
  return api.get(`/labels/labels/${id}/`);
}

export function createCustomLabel(data: Record<string, unknown>): Promise<{ data: CustomLabel }> {
  return api.post('/labels/labels/', data);
}

export function updateCustomLabel(
  id: number,
  data: Record<string, unknown>,
): Promise<{ data: CustomLabel }> {
  return api.patch(`/labels/labels/${id}/`, data);
}

/** Soft archive (backend sets is_active=false). */
export function archiveCustomLabel(id: number): Promise<unknown> {
  return api.delete(`/labels/labels/${id}/`);
}

export function restoreCustomLabel(id: number): Promise<{ data: CustomLabel }> {
  return api.post(`/labels/labels/${id}/restore/`);
}

export function duplicateCustomLabel(id: number): Promise<{ data: CustomLabel }> {
  return api.post(`/labels/labels/${id}/duplicate/`);
}

// ── Media ─────────────────────────────────────────────────────────────────────

export function uploadLabelBackground(id: number, file: File): Promise<{ data: CustomLabel }> {
  const form = new FormData();
  form.append('file', file);
  return api.post(`/labels/labels/${id}/background/`, form, {
    transformRequest: stripMultipartContentType,
  });
}

export function clearLabelBackground(id: number): Promise<{ data: CustomLabel }> {
  return api.delete(`/labels/labels/${id}/background/clear/`);
}

export function uploadLabelPdf(id: number, file: File): Promise<{ data: CustomLabel }> {
  const form = new FormData();
  form.append('file', file);
  return api.post(`/labels/labels/${id}/pdf/`, form, {
    transformRequest: stripMultipartContentType,
  });
}

/** Fetch label media bytes through the authenticated proxy (for the print path). */
export async function fetchLabelMediaBytes(
  id: number,
  attr: 'background' | 'pdf_file',
): Promise<ArrayBuffer> {
  const resp = await api.get(`/labels/labels/${id}/media/${attr}/`, {
    responseType: 'arraybuffer',
  });
  return resp.data as ArrayBuffer;
}

// ── AI Create for me ──────────────────────────────────────────────────────────

export function proposeLabelStructure(
  id: number,
  brief: string,
): Promise<{ data: { definition: LabelDefinition } }> {
  return api.post(`/labels/labels/${id}/ai/propose-structure/`, { brief });
}

export function generateLabelBackground(
  id: number,
  brief: string,
): Promise<{
  data: {
    image_b64: string;
    content_type: string;
    prompt_used?: string;
    aspect_ratio?: string;
  };
}> {
  return api.post(`/labels/labels/${id}/ai/generate-background/`, { brief });
}
