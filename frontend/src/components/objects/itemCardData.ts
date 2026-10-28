/**
 * The item card's data: GET /api/inventory/items/<id>/card/ (full) and ?lite=1 (the hover card).
 * One query key per item; the hover card reads the full card from the cache when it is already there.
 */
import { useQuery, type QueryClient } from '@tanstack/react-query';
import api from '../../api/client';

export interface ItemCardRestoration {
  job_id: number;
  stage: string;
  stage_label: string;
  scale: string;
  starting_grade: string;
  final_grade: string;
  bench_owner: string;
  intended_destination: string;
  bench_disposition: string;
  grade_values?: Record<string, unknown>;
  queue_note?: string;
  pending_reason?: string;
  disposition_notes?: string;
  return_reason?: string;
  return_notes?: string;
  active_seconds?: number;
  spent_parts_cost?: string | null;
  value_added?: string | null;
  actions?: { grade: string; category: string; description: string; seconds: number }[];
  sent_at?: string | null;
  bench_started_at?: string | null;
  dispositioned_at?: string | null;
  returned_at?: string | null;
}

export interface ItemJourneyEvent {
  at: string;
  kind: 'order' | 'created' | 'check_in' | 'restoration' | 'tag' | 'history' | 'sale' | 'note' | 'count';
  label: string;
  detail: string;
  who: string;
}

/** The hover card (?lite=1). */
export interface ItemCardLite {
  id: number;
  sku: string;
  title: string;
  brand: string;
  model: string;
  product_id: number | null;
  product_number: string | null;
  category: string;
  photo_url: string | null;
  status: string;
  status_label: string;
  condition: string;
  condition_label: string;
  location: string;
  price: string | null;
  retail: string | null;
  tag_retail: string | null;
  specifications: Record<string, unknown>;
  notes: string;
  order: { id: number; order_number: string; vendor: string } | null;
  checked_in_at: string | null;
  checked_in_by: string;
  sold_at: string | null;
  sold_for: string | null;
  last_scan_at: string | null;
  restoration: ItemCardRestoration | null;
}

/** The universal Item modal. */
export interface ItemCardFull extends ItemCardLite {
  photos: string[];
  upc: string;
  source: string;
  source_label: string;
  retail_check: string;
  retail_source: string;
  cost: string | null;
  sold_net: string | null;
  thriftbucks_at_sale: string | null;
  sale_channel: string;
  sale_channel_label: string;
  listed_at: string | null;
  label_printed_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  manifest_line: { id: number; row_number: number; title: string; unit_retail: string | null } | null;
  check_in_id: number | null;
  pallet: string;
  parent_item: { id: number; sku: string } | null;
  dispute: { type: string; pct_loss: number | null; description: string } | null;
  last_scan_source: string;
  scan_count: number;
  journey: ItemJourneyEvent[];
}

export const itemCardKey = (id: number, lite = false) => ['item-card', id, lite ? 'lite' : 'full'] as const;

export async function getItemCard(id: number): Promise<ItemCardFull> {
  return (await api.get<ItemCardFull>(`/inventory/items/${id}/card/`)).data;
}

export async function getItemCardLite(id: number): Promise<ItemCardLite> {
  return (await api.get<ItemCardLite>(`/inventory/items/${id}/card/`, { params: { lite: 1 } })).data;
}

/** The hover card stays good for a minute: moving the mouse back over a name never waits. */
export const HOVER_STALE_MS = 60_000;

export function prefetchItemCardLite(qc: QueryClient, id: number): void {
  if (qc.getQueryData(itemCardKey(id))) return;
  void qc.prefetchQuery({ queryKey: itemCardKey(id, true), queryFn: () => getItemCardLite(id), staleTime: HOVER_STALE_MS });
}

export function useItemCard(id: number) {
  return useQuery({ queryKey: itemCardKey(id), queryFn: () => getItemCard(id), staleTime: 15_000 });
}

export function useItemCardLite(id: number, enabled: boolean, qc: QueryClient) {
  return useQuery({
    queryKey: itemCardKey(id, true),
    queryFn: () => getItemCardLite(id),
    enabled,
    staleTime: HOVER_STALE_MS,
    initialData: () => qc.getQueryData<ItemCardFull>(itemCardKey(id)),
  });
}

export function itemCardMoney(value: string | null | undefined): string {
  if (value == null || value === '') return '—';
  const n = Number(value);
  return Number.isFinite(n) ? `$${n.toFixed(2)}` : '—';
}

export function itemCardSpecs(specs: Record<string, unknown> | undefined, max?: number): [string, string][] {
  const rows = Object.entries(specs ?? {})
    .filter(([, v]) => v != null && v !== '' && typeof v !== 'object')
    .map(([k, v]) => {
      const label = k.replace(/_/g, ' ');
      return [label.charAt(0).toUpperCase() + label.slice(1), String(v)] as [string, string];
    });
  return max == null ? rows : rows.slice(0, max);
}

export function itemCardWhen(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function itemCardDay(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Where the item is, in words: the status says most of it; location adds the shelf or the department. */
export function itemCardWhere(card: Pick<ItemCardLite, 'status_label' | 'location' | 'restoration'>): string {
  const parts = [card.status_label];
  if (card.restoration && !['done', 'returned'].includes(card.restoration.stage)) {
    parts.push(`Restoration · ${card.restoration.stage_label}`);
  } else if (card.location) {
    parts.push(card.location);
  }
  return parts.filter(Boolean).join(' · ');
}
