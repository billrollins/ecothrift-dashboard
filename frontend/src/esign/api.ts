// vendored from master packages/esign 1.0.0; never edit in a project, changes go up to master
/**
 * Documents and e-sign client (`apps/esign`, house standard D22). The only seam to the host: its two axios clients
 * (signed-in and public). Everything else under src/esign is self-contained so it can be lifted into the shared package.
 */
import { isAxiosError } from 'axios';
import api, { publicApi } from '@/services/api';

export type FieldKind = 'text' | 'textarea' | 'date' | 'choice';
export interface EsignField {
  key: string;
  label: string;
  kind: FieldKind;
  required: boolean;
  options: string[];
  default: string;
}
export interface EsignSection {
  heading: string;
  body: string;
}
export interface TemplateVersion {
  id: number;
  number: number;
  title: string;
  note: string;
  frozen: boolean;
  created_at: string;
  template: number;
  sections?: EsignSection[];
  fields?: EsignField[];
  acknowledgments?: string[];
}
export interface EsignTemplate {
  id: number;
  name: string;
  kind: string;
  archived: boolean;
  created_at: string;
  latest: TemplateVersion | null;
  versions?: TemplateVersion[];
}
export interface EsignMeta {
  kinds: { key: string; label: string }[];
  consent_text: string;
  company: string;
  builtins: string[];
}

export type EnvelopeStatus = 'draft' | 'out' | 'signed' | 'void' | 'ended';
export type PartyStatus = 'waiting' | 'ready' | 'signed';
export interface AuditEvent {
  kind: string;
  at: string;
  actor: string;
  ip: string;
  user_agent: string;
  detail: string;
}
export interface Party {
  id: number;
  order: number;
  name: string;
  email: string;
  title: string;
  role_label: string;
  user_id: number | null;
  status: PartyStatus;
  ready_at: string | null;
  signed_at: string | null;
  /** For the party whose turn it is: is their latest link still good? */
  link_state: 'open' | 'expired' | null;
  link_expires_at: string | null;
}
export type BoxKind = 'signature' | 'initials' | 'name' | 'title' | 'date';
/** A box on an uploaded PDF for one signer (their order). Fractions of the page as shown, top-left origin. */
export interface PlacedBox {
  id?: number;
  signer: number;
  kind: BoxKind;
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface Envelope {
  id: number;
  title: string;
  status: EnvelopeStatus;
  status_label: string;
  /** 'text': written from a template; 'pdf': an uploaded PDF with boxes placed on it. */
  source: 'text' | 'pdf';
  template: number | null;
  template_name: string;
  kind: string;
  version: number | null;
  page_count: number;
  batch: number | null;
  batch_name: string;
  /** Brought in from MyDocs ("mydocs:17"). */
  imported_from: string;
  deleting: boolean;
  delete_reason: string;
  delete_requested_at: string | null;
  purge_after: string | null;
  parties: Party[];
  waiting_on: string | null;
  signed_count: number;
  party_count: number;
  requires_w9: boolean;
  has_w9: boolean;
  end_date: string | null;
  sent_at: string | null;
  completed_at: string | null;
  created_at: string;
  has_pdf: boolean;
  void_reason: string;
  attached_type: string;
  attached_id: string;
  attached_label: string;
  // detail only
  values?: Record<string, string>;
  fields?: EsignField[];
  body_text?: string;
  body_sha256?: string;
  /** What was signed: the SHA-256 of the frozen text, or of the uploaded PDF. */
  fingerprint?: string;
  boxes?: PlacedBox[];
  acknowledgments?: string[];
  final_pdf_sha256?: string;
  events?: AuditEvent[];
  /** Only on the response to Send: whether the current signer's link was emailed. */
  emailed?: boolean;
  /** Only on the response to Send: the current signer's link, to copy when it was not emailed. */
  link?: string;
}

/** One signer as sent to the server: a Dash user (name and email come from their record) or an outsider. */
export interface PartyInput {
  user_id?: number | null;
  name?: string;
  email?: string;
  title?: string;
  role_label?: string;
}
export interface TemplateInput {
  name?: string;
  kind?: string;
  title: string;
  note?: string;
  sections: EsignSection[];
  fields: EsignField[];
  acknowledgments: string[];
}

/** The first message in a server error (a detail, or the first field's message). */
export function errText(e: unknown, fallback = 'Something went wrong. Try again.'): string {
  if (isAxiosError(e)) {
    const data = e.response?.data as unknown;
    if (data && typeof data === 'object') {
      for (const value of Object.values(data as Record<string, unknown>)) {
        const text = Array.isArray(value) ? value.find((v) => typeof v === 'string') : value;
        if (typeof text === 'string' && text.trim()) return text.trim();
      }
    }
    return fallback;
  }
  return e instanceof Error && e.message ? e.message : fallback;
}

// -- Owner ------------------------------------------------------------------------------------

export const getMeta = async () => (await api.get<EsignMeta>('/esign/meta/')).data;
export const listTemplates = async () => (await api.get<EsignTemplate[]>('/esign/templates/')).data;
export const getTemplate = async (id: number) => (await api.get<EsignTemplate>(`/esign/templates/${id}/`)).data;
export const createTemplate = async (input: TemplateInput) => (await api.post<EsignTemplate>('/esign/templates/', input)).data;
export const saveTemplateVersion = async (id: number, input: TemplateInput) =>
  (await api.post<EsignTemplate>(`/esign/templates/${id}/`, input)).data;
export const archiveTemplate = async (id: number, archived: boolean) =>
  (await api.post<EsignTemplate>(`/esign/templates/${id}/`, { archived })).data;
export const getVersion = async (id: number) => (await api.get<TemplateVersion>(`/esign/versions/${id}/`)).data;
export const previewText = async (version: number, values: Record<string, string>, parties: PartyInput[]) =>
  (await api.post<{ text: string }>('/esign/preview/', { version, values, parties })).data.text;

export const listEnvelopes = async (params?: { status?: string; attached?: string }) =>
  (await api.get<Envelope[]>('/esign/envelopes/', { params })).data;
export const getEnvelope = async (id: number) => (await api.get<Envelope>(`/esign/envelopes/${id}/`)).data;
export const createEnvelope = async (input: {
  version: number;
  title?: string;
  parties: PartyInput[];
  values: Record<string, string>;
  attached_type?: string;
  attached_id?: string;
  /** Ask the signer for a W-9 (owner-only once uploaded). */
  requires_w9?: boolean;
}) => (await api.post<Envelope>('/esign/envelopes/', input)).data;
export const updateEnvelope = async (id: number, input: {
  title?: string; parties?: PartyInput[]; values?: Record<string, string>; requires_w9?: boolean;
}) =>
  (await api.patch<Envelope>(`/esign/envelopes/${id}/`, input)).data;
export const previewEnvelope = async (id: number) => (await api.post<{ text: string; frozen: boolean }>(`/esign/envelopes/${id}/preview/`)).data;
/** Send a draft, or a new link for whoever's turn it is. */
export const sendEnvelope = async (id: number) => (await api.post<Envelope>(`/esign/envelopes/${id}/send/`)).data;
export const recordNotice = async (id: number) => (await api.post<Envelope>(`/esign/envelopes/${id}/notice/`)).data;
export const voidEnvelope = async (id: number, reason: string) => (await api.post<Envelope>(`/esign/envelopes/${id}/void/`, { reason })).data;

/** A new document from an uploaded PDF. The boxes are placed next (`saveBoxes`), then it is sent. */
export async function createPdfEnvelope(input: {
  file: File;
  title: string;
  kind: string;
  parties: PartyInput[];
  acknowledgments: string[];
  attached_type?: string;
  attached_id?: string;
}): Promise<Envelope> {
  const form = new FormData();
  form.append('file', input.file);
  form.append('title', input.title);
  form.append('kind', input.kind);
  form.append('parties', JSON.stringify(input.parties));
  form.append('acknowledgments', JSON.stringify(input.acknowledgments));
  if (input.attached_type) form.append('attached_type', input.attached_type);
  if (input.attached_id) form.append('attached_id', input.attached_id);
  return (await api.post<Envelope>('/esign/envelopes/pdf/', form, { headers: { 'Content-Type': 'multipart/form-data' } })).data;
}
export const saveBoxes = async (id: number, fields: PlacedBox[]) =>
  (await api.put<Envelope>(`/esign/envelopes/${id}/fields/`, { fields })).data;
/** The uploaded PDF (owner). */
export const sourcePdf = async (id: number) =>
  (await api.get<ArrayBuffer>(`/esign/envelopes/${id}/source/`, { responseType: 'arraybuffer' })).data;

// Deleting: asked for with a reason, restorable until it is purged (90 days), then only the purge log remains.
export const requestDelete = async (id: number, reason: string) =>
  (await api.post<Envelope>(`/esign/envelopes/${id}/delete/`, { reason })).data;
export const restoreEnvelope = async (id: number) => (await api.post<Envelope>(`/esign/envelopes/${id}/restore/`)).data;
export const purgeNow = async (id: number) => (await api.post<PurgeLogEntry>(`/esign/envelopes/${id}/purge/`)).data;
export interface PurgeLogEntry {
  id: number;
  envelope_id: number;
  title: string;
  kind: string;
  status: string;
  attached_label: string;
  parties: string;
  fingerprint: string;
  requested_by: string;
  requested_at: string | null;
  reason: string;
  purged_by: string;
  purged_at: string;
  files: number;
}
export const listPurgeLog = async () => (await api.get<PurgeLogEntry[]>('/esign/purge-log/')).data;

// Sent to everyone: one template, one document per person, and who hasn't signed.
export interface EveryonePerson {
  user_id: number;
  name: string;
  email: string;
  title: string;
}
export interface BatchPerson {
  envelope: number;
  party: number;
  user_id: number | null;
  name: string;
  status: 'signed' | 'waiting' | 'void';
  signed_at: string | null;
  sent_at: string | null;
  deleting: boolean;
}
export interface Batch {
  id: number;
  name: string;
  kind: string;
  created_at: string;
  template: number | null;
  version: number | null;
  signed: number;
  total: number;
  people: BatchPerson[];
  /** On the staff list, but not sent this one yet (joined later, or left out). */
  missing: { user_id: number; name: string }[];
}
export const listEveryone = async () => (await api.get<EveryonePerson[]>('/esign/everyone/')).data;
export const listBatches = async () => (await api.get<Batch[]>('/esign/batches/')).data;
export const sendToEveryone = async (input: { version: number; name: string; people: number[]; values: Record<string, string> }) =>
  (await api.post<Batch>('/esign/batches/', input)).data;
export const addToBatch = async (id: number, people: number[]) => (await api.post<Batch>(`/esign/batches/${id}/`, { people })).data;

function saveBlob(data: Blob, filename: string): void {
  const url = URL.createObjectURL(data);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Download the signed PDF with the signed-in user's access (owners, and anyone who signed it). */
export async function downloadSignedPdf(id: number, filename: string): Promise<void> {
  saveBlob((await api.get<Blob>(`/esign/envelopes/${id}/pdf/`, { responseType: 'blob' })).data, filename);
}

/** Download a signer's W-9: the owner only. */
export async function downloadW9(id: number, filename: string): Promise<void> {
  saveBlob((await api.get<Blob>(`/esign/envelopes/${id}/w9/`, { responseType: 'blob' })).data, filename);
}

// -- A signed-in signer -------------------------------------------------------------------------

export interface MyDocument {
  party: number;
  envelope: number;
  title: string;
  status: EnvelopeStatus;
  status_label: string;
  my_status: PartyStatus;
  my_turn: boolean;
  waiting_on: string | null;
  sent_at: string | null;
  signed_at: string | null;
  completed_at: string | null;
  has_pdf: boolean;
}
export const listMine = async () => (await api.get<MyDocument[]>('/esign/mine/')).data;

// -- The signing screens (a link, or a signed-in party) ------------------------------------------

export type LinkState = 'ok' | 'used' | 'expired' | 'void' | 'invalid' | 'waiting';
export interface SigningState {
  ok: boolean;
  state: LinkState;
  detail?: string;
  party?: number;
  title?: string;
  text?: string;
  signer_name?: string;
  signer_title?: string;
  role_label?: string;
  acknowledgments?: string[];
  requires_w9?: boolean;
  has_w9?: boolean;
  consent?: string;
  company?: string;
  expires_at?: string;
  fingerprint?: string;
  /** How many still sign after this person. */
  others_after?: number;
  source?: 'text' | 'pdf';
  page_count?: number;
  /** On an uploaded PDF: this signer's boxes. */
  boxes?: PlacedBox[];
}
export interface SignInput {
  name: string;
  title: string;
  consent: boolean;
  acknowledgments: boolean[];
  signature: string;
}
export interface SignResult {
  ok: boolean;
  signed?: boolean;
  complete?: boolean;
  state?: LinkState;
  detail?: string;
}

/** Where the signing screens get and send: by the link's token, or as the signed-in party. */
export interface SigningSource {
  load: () => Promise<SigningState>;
  sign: (input: SignInput) => Promise<SignResult>;
  uploadW9?: (file: File) => Promise<{ ok: boolean; state?: LinkState; detail?: string }>;
  /** The uploaded PDF, while it is this signer's turn. */
  pdf: () => Promise<ArrayBuffer>;
}

export function linkSource(token: string): SigningSource {
  return {
    load: async () => (await publicApi.get<SigningState>('/esign/public/document/', { params: { t: token } })).data,
    sign: async (input) => (await publicApi.post<SignResult>('/esign/public/sign/', { t: token, ...input })).data,
    pdf: async () => (await publicApi.get<ArrayBuffer>('/esign/public/source/', { params: { t: token }, responseType: 'arraybuffer' })).data,
    uploadW9: async (file) => {
      const form = new FormData();
      form.append('t', token);
      form.append('file', file);
      return (await publicApi.post<{ ok: boolean; state?: LinkState; detail?: string }>('/esign/public/upload/', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })).data;
    },
  };
}

export function signedInSource(partyId: number): SigningSource {
  return {
    load: async () => (await api.get<SigningState>(`/esign/mine/${partyId}/`)).data,
    sign: async (input) => (await api.post<SignResult>(`/esign/mine/${partyId}/sign/`, input)).data,
    pdf: async () => (await api.get<ArrayBuffer>(`/esign/mine/${partyId}/source/`, { responseType: 'arraybuffer' })).data,
  };
}
