import api from './client';
import type { BadTag, BadTagLookup, BadTagReason, BadTagWhere } from './badTags.api';

/**
 * Floor issues (Dash Update #84): the one "Report a problem" report from the retail floor. An item problem or a tag
 * problem; either way the item keeps its status and waits on Processing > Floor issues.
 */
export type FloorItemReason = 'broken' | 'missing_parts' | 'not_working' | 'dirty' | 'other';
export type FloorIssueReason = FloorItemReason | BadTagReason;

export interface FloorIssueReasonOption {
  key: FloorIssueReason;
  label: string;
  label_es: string;
  /** What is wrong: the item itself, or its tag. */
  about: 'item' | 'tag';
}

/** The item's problems; the tag's are `BAD_TAG_REASONS` (badTags.api). */
export const FLOOR_ITEM_REASONS: FloorIssueReasonOption[] = [
  { key: 'broken', label: 'Broken or damaged', label_es: 'Roto', about: 'item' },
  { key: 'missing_parts', label: 'Missing parts', label_es: 'Faltan piezas', about: 'item' },
  { key: 'not_working', label: 'Does not work', label_es: 'No funciona', about: 'item' },
  { key: 'dirty', label: 'Dirty', label_es: 'Sucio', about: 'item' },
  { key: 'other', label: 'Other', label_es: 'Otro', about: 'item' },
];

export function isFloorItemReason(reason: string): reason is FloorItemReason {
  return FLOOR_ITEM_REASONS.some((r) => r.key === reason);
}

export interface FloorIssue {
  id: number;
  reason: FloorIssueReason;
  reason_label: string;
  about: 'item' | 'tag';
  note: string;
  where: BadTagWhere;
  where_label: string;
  photo_url: string | null;
  reported_by: string;
  reported_at: string;
  status_before: string;
  bad_tag_id: number | null;
  /** Its row on the shared list (`/inventory/reentries/`), where the actions are. */
  reentry_id: number | null;
  closed_at: string | null;
  closed_by: string;
  outcome: string;
  item: {
    id: number;
    sku: string;
    title: string;
    brand: string;
    price: string;
    retail: string | null;
    status: string;
  };
}

export interface FloorIssueLookup extends BadTagLookup {
  /** Set when this item already waits on Floor issues. */
  floor_issue: FloorIssue | null;
  reasons: FloorIssueReasonOption[];
}

export interface ReportFloorIssueBody {
  code: string;
  reason: FloorIssueReason;
  where: BadTagWhere;
  note?: string;
  /** A data URL (image/jpeg or image/png). */
  photo?: string;
  right_price?: string;
  right_retail?: string;
}

export interface ReportFloorIssueResult {
  /** Null only for a tag with no item behind it: that one stays a bad tag on PR Fix-it. */
  floor_issue: FloorIssue | null;
  bad_tag: BadTag | null;
  /** The item was already waiting; nothing new was saved. */
  already: boolean;
}

const B = '/inventory/floor-issues';

export async function lookupFloorIssue(code: string): Promise<FloorIssueLookup> {
  return (await api.get<FloorIssueLookup>(`${B}/lookup/`, { params: { code } })).data;
}

export async function reportFloorIssue(body: ReportFloorIssueBody): Promise<ReportFloorIssueResult> {
  return (await api.post<ReportFloorIssueResult>(`${B}/`, body)).data;
}

/** The reports still waiting: what the Floor issues page adds to the shared rows (the photo). */
export async function listWaitingFloorIssues(): Promise<FloorIssue[]> {
  return (await api.get<{ results: FloorIssue[] }>(`${B}/`)).data.results;
}
