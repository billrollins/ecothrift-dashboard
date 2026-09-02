import api from './client';

const stripMultipartContentType = [
  (body: unknown, headers: Record<string, unknown>) => {
    if (body instanceof FormData) delete headers['Content-Type'];
    return body;
  },
];

export type DocumentMode = 'sign' | 'acknowledge' | 'read';
export type DocumentFieldKind = 'signature' | 'initials' | 'date' | 'text' | 'checkbox';
export type DocumentRecipientStatus = 'pending' | 'viewed' | 'completed';

export interface DocumentField {
  id?: number;
  page: number;
  x_pct: number;
  y_pct: number;
  w_pct: number;
  h_pct: number;
  kind: DocumentFieldKind;
  label: string;
  required: boolean;
  order: number;
}

export interface StaffDocument {
  id: number;
  title: string;
  description: string;
  page_count: number;
  mode: DocumentMode;
  is_active: boolean;
  fields: DocumentField[];
  assigned_count: number;
  completed_count: number;
  has_file: boolean;
  created_at: string;
  updated_at: string;
}

export interface DocumentRecipient {
  id: number;
  document: number;
  title: string;
  description: string;
  mode: DocumentMode;
  status: DocumentRecipientStatus;
  due_at: string | null;
  message: string;
  user: number;
  user_name: string;
  opened_at: string | null;
  completed_at: string | null;
  page_count: number;
  fields: DocumentField[];
  href: string;
}

export function getDocuments() {
  return api.get<StaffDocument[] | { results: StaffDocument[] }>('/documents/documents/');
}

export function getDocument(id: number) {
  return api.get<StaffDocument>(`/documents/documents/${id}/`);
}

export function createDocument(data: Partial<StaffDocument>) {
  return api.post<StaffDocument>('/documents/documents/', data);
}

export function updateDocument(id: number, data: Partial<StaffDocument>) {
  return api.patch<StaffDocument>(`/documents/documents/${id}/`, data);
}

export function uploadDocumentPdf(id: number, file: File) {
  const form = new FormData();
  form.append('file', file);
  return api.post<StaffDocument>(`/documents/documents/${id}/upload/`, form, {
    transformRequest: stripMultipartContentType,
  });
}

export function replaceDocumentFields(id: number, fields: DocumentField[]) {
  return api.put<StaffDocument>(`/documents/documents/${id}/fields/`, fields);
}

export function assignDocument(
  id: number,
  data: {
    audience: 'person' | 'everyone' | 'role' | 'department';
    assigned_user?: number | null;
    assigned_role?: string;
    assigned_department?: number | null;
    due_at?: string | null;
    message?: string;
  },
) {
  return api.post(`/documents/documents/${id}/assign/`, data);
}

export function getDocumentFileUrl(id: number) {
  return `/api/documents/documents/${id}/file/`;
}

export function getMyDocumentRecipients() {
  return api.get<DocumentRecipient[]>('/documents/recipients/mine/');
}

export function getDocumentRecipient(id: number) {
  return api.get<DocumentRecipient>(`/documents/recipients/${id}/`);
}

export function viewDocumentRecipient(id: number) {
  return api.post<DocumentRecipient>(`/documents/recipients/${id}/view/`);
}

export function completeDocumentRecipient(
  id: number,
  values: Array<{ field: number; value_text?: string; value_file?: string }>,
) {
  return api.post<DocumentRecipient>(`/documents/recipients/${id}/complete/`, { values });
}

export function getSignedDocumentUrl(id: number) {
  return `/api/documents/recipients/${id}/signed/`;
}

export async function fetchDocumentPdfBlob(documentId: number): Promise<Blob> {
  const { data } = await api.get<Blob>(`/documents/documents/${documentId}/file/`, {
    responseType: 'blob',
  });
  return data;
}
