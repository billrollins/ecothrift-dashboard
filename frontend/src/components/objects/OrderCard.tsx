/**
 * The Order window (Dash Updates #12, #191): one purchase order, built like the Item window, and the only order view.
 * Header (order number with copy, status, vendor and its code, what it is), Cost, Cost % of retail, Sold so far and
 * Recovered, and the step buttons (Preprocessing, Receiving, Processing, Finish truck, Close the truck, Truck Plan);
 * then Lifecycle (the five dates, the step it is on, the later steps; "All dates" adds every recorded date and time),
 * Costs (with margin), Units, Manifest (file, upload day, rows, categories, est. value; the file opens the
 * preview/download) and notes/claims.
 * Read and edit look the same (Bill, 2026-11-20): the owner clicks a value to change it and it saves itself
 * (useOrderAutosave); everyone else reads it. Staff change orders through their pages (Receiving and so on).
 * Data: GET /api/inventory/orders/<id>/card/ (apps/inventory/services/order_card.py) and
 * GET /api/inventory/orders/<id>/detail-surface/ (the order's own fields and manifest facts).
 */
import { useRef, useState, type ReactNode } from 'react';
import { Box, Button, Chip, CircularProgress, Link, Stack, Typography } from '@mui/material';
import ExpandMore from '@mui/icons-material/ExpandMore';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useSnackbar } from 'notistack';
import api from '../../api/client';
import { PO_CONDITION_OPTIONS } from '../../constants/purchaseOrderCondition';
import { useAuth } from '../../contexts/AuthContext';
import { usePurchaseOrderSurface, useUploadManifest } from '../../hooks/useInventory';
import { IconUpload } from '../../icons/ecoIcons';
import type { PurchaseOrderDetailSurface } from '../../types/inventory.types';
import InlineEditableValue from '../inventory/orderDetail/InlineEditableValue';
import { manifestUploadError, marginPct, ORDER_MILESTONES, orderStepGates } from '../inventory/orderDetail/orderSteps';
import { useOrderAutosave } from '../inventory/orderDetail/useOrderAutosave';
import { PurchaseOrderManifestDialog } from '../inventory/PurchaseOrderManifestDialog';
import { itemCardDay, itemCardMoney, itemCardWhen } from './itemCardData';
import { useObjectModal } from './ObjectModal';
import { CopyId, Facts, Section, Stat } from './windowParts';

export interface OrderCardData {
  id: number;
  order_number: string;
  status: string;
  status_label: string;
  vendor: { id: number; name: string } | null;
  vendor_name: string;
  description: string;
  condition: string;
  notes: string;
  ordered_date: string | null;
  money: {
    purchase: string | null; shipping: string | null; fees: string | null; total: string | null; retail: string | null;
    est_shrink: string | null; sold_for: string | null; shelf_value: string | null;
    cost_pct_of_retail: number | null; recovered_pct: number | null;
  };
  units: {
    manifest_lines: number; manifest_units: number; items: number; pending: number; on_shelf: number; sold: number;
    returned: number; gone: number; disputed: number; pallets: number | null;
  };
  claim: { status: string; status_label: string; refund_expected: string | null; refund_received: string | null } | null;
  /** Disputed items (not broken) and the manifest retail they add to the truck claim (Dash Update #1). */
  disputed_claim?: { items: number; retail: string | null } | null;
  /** The plan the truck works to: its own or the store default (#99). Never blank. */
  truck_plan?: { is_default: boolean; pricing_start_pct: string | null; watch_for: string } | null;
  disputes: { kind: string; status: string; title: string }[];
  journey: { kind: string; at: string | null }[];
}

/** The words for each step, in one place. */
const STEP: Record<string, string> = {
  ordered: 'Ordered', paid: 'Paid', shipped: 'Shipped', delivered: 'Delivered',
  receiving_started: 'Receiving started', receiving_done: 'Received', processing_started: 'Processing started',
  processing_done: 'Processing done', truck_finalized: 'Truck finalized', claim_filed: 'Claim filed with the supplier',
  closed: 'Closed',
};
const STATUS_COLOR: Record<string, 'default' | 'info' | 'success' | 'warning' | 'error'> = {
  ordered: 'default', paid: 'default', shipped: 'info', delivered: 'info', processing: 'warning', complete: 'success',
  cancelled: 'error',
};
/** "All dates": every date and time Dash keeps for an order, by its field. */
const ALL_DATES: [keyof PurchaseOrderDetailSurface, string][] = [
  ['created_at', 'Created in Dash'], ['manifest_uploaded_at', 'Manifest uploaded'], ['standardized_at', 'Manifest standardized'],
  ['ai_cleaned_at', 'AI cleanup'], ['review_saved_at', 'Review saved'], ['finalized_at', 'Manifest finalized'],
  ['receiving_started_at', 'Receiving started'], ['receiving_done_at', 'Received'], ['processing_started_at', 'Processing started'],
  ['processing_done_at', 'Processing done'], ['closed_at', 'Closed'],
];
const CONDITIONS = PO_CONDITION_OPTIONS.filter((c) => c.value !== '') as { value: string; label: string }[];

export function useOrderCard(id: number) {
  return useQuery({
    queryKey: ['order-card', id],
    queryFn: async () => (await api.get<OrderCardData>(`/inventory/orders/${id}/card/`)).data,
    staleTime: 15_000,
  });
}

const dateOnly = (iso: string | null | undefined) => (iso && iso.length === 10 ? `${iso}T12:00:00` : iso ?? null);
const num = (v: string | null | undefined) => (v == null || v === '' ? 0 : Number(v) || 0);
const wholeDollars = (v: string | null | undefined) => (num(v) > 0 ? itemCardMoney(v).replace(/\.\d\d$/, '') : '-');
/** The steps the five dates already cover. */
const DATED = new Set(['ordered', 'paid', 'shipped', 'delivered']);

/** One lifecycle step: a check when it happened, its day, and "Current" on the step the order is on. */
function LifeRow({ label, when, done, current, last }: { label: string; when: ReactNode; done: boolean; current: boolean; last: boolean }) {
  return (
    <Box component="li" sx={{ display: 'grid', gridTemplateColumns: '18px 1fr minmax(0, auto)', columnGap: 1.25, alignItems: 'start', pb: last ? 0 : 1 }}>
      <Box sx={{ position: 'relative', alignSelf: 'stretch' }}>
        <Box
          sx={{
            width: 14, height: 14, mt: '4px', borderRadius: '50%', boxSizing: 'border-box',
            ...(done ? { bgcolor: '#10b981' } : { border: '1.5px dashed', borderColor: 'text.disabled' }),
          }}
        />
        {!last && <Box sx={{ position: 'absolute', left: 6, top: 21, bottom: -6, width: 2, bgcolor: done ? '#a5d6a7' : 'divider' }} />}
      </Box>
      <Typography sx={{ fontSize: 14, fontWeight: done ? 700 : 500, color: done ? 'text.primary' : 'text.secondary', lineHeight: 1.6 }}>
        {label}
        {current ? (
          <Box component="span" sx={{ ml: 1, fontSize: 10, fontWeight: 800, px: 0.75, py: 0.25, borderRadius: '3px', bgcolor: '#d1fae5', color: '#065f46', textTransform: 'uppercase', letterSpacing: '0.06em', verticalAlign: 'middle' }}>
            Current
          </Box>
        ) : null}
      </Typography>
      <Box sx={{ fontSize: 13, color: done ? 'text.primary' : 'text.secondary', lineHeight: 1.7, fontVariantNumeric: 'tabular-nums', textAlign: 'right', minWidth: 0 }}>{when}</Box>
    </Box>
  );
}

/** A small boxed number (the manifest's rows, categories and value). */
function MiniStat({ label, value, green }: { label: string; value: string; green?: boolean }) {
  return (
    <Box sx={{ flex: 1, minWidth: 0, py: 1, px: 1.25, bgcolor: 'action.hover', borderRadius: 1.5 }}>
      <Typography sx={{ fontSize: 11, fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase' }}>{label}</Typography>
      <Typography sx={{ fontSize: 15, fontWeight: 800, color: green ? '#059669' : undefined, fontVariantNumeric: 'tabular-nums' }}>{value}</Typography>
    </Box>
  );
}

function CardView({ c, o, canEdit }: { c: OrderCardData; o: PurchaseOrderDetailSurface; canEdit: boolean }) {
  const { closeObject, openObject } = useObjectModal();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const upload = useUploadManifest();
  const [dropOver, setDropOver] = useState(false);
  const { save, savedKey, failedKey } = useOrderAutosave(o.id);
  const fileRef = useRef<HTMLInputElement>(null);
  const [viewer, setViewer] = useState(false);
  const [allDates, setAllDates] = useState(false);
  const go = (path: string) => {
    closeObject();
    navigate(path);
  };
  const u = c.units;
  const gates = orderStepGates(o);
  const unitsLine = [
    u.pending ? `${u.pending} to check in` : '',
    u.on_shelf ? `${u.on_shelf} on the shelf${c.money.shelf_value ? ` (${itemCardMoney(c.money.shelf_value)} in tags)` : ''}` : '',
    u.sold ? `${u.sold} sold` : '',
    u.returned ? `${u.returned} returned` : '',
    u.gone ? `${u.gone} scrapped or lost` : '',
  ].filter(Boolean).join(' · ');
  const total = num(o.total_cost) || num(o.purchase_cost) + num(o.fees) + num(o.shipping_cost);
  const margin = marginPct(num(o.retail_value), total);

  /** One order field: the owner clicks to change it (saves itself), everyone else reads it. Same look either way. */
  const field = (
    key: string,
    value: string | number | null | undefined,
    opts: { type?: 'text' | 'currency' | 'integer' | 'date' | 'select'; format?: (v: string) => string; label: string; multiline?: boolean; toApi?: (v: string) => unknown },
  ) => (
    <InlineEditableValue
      fieldId={key}
      value={value == null ? '' : String(value)}
      type={opts.type}
      options={opts.type === 'select' ? CONDITIONS : undefined}
      displayFormatter={opts.format}
      multiline={opts.multiline}
      label={opts.label}
      readOnly={!canEdit}
      savedKey={savedKey}
      failedKey={failedKey}
      onCommit={(next) => save({ [key]: opts.toApi ? opts.toApi(next) : next })}
    />
  );
  const money = (key: 'purchase_cost' | 'fees' | 'shipping_cost' | 'retail_value', label: string) =>
    field(key, o[key], { type: 'currency', format: itemCardMoney, label, toApi: (v) => (v ? v : null) });
  const count = (v: string) => {
    const n = Number.parseInt(v, 10);
    return Number.isFinite(n) && n >= 0 ? n : null;
  };

  // Lifecycle: the five dates (Expected is a plan, never a check), then the later steps as they happened.
  const life = [
    ...ORDER_MILESTONES.map((s) => ({
      key: s.key as string,
      label: s.label,
      when: field(s.key, o[s.key] ? String(o[s.key]).slice(0, 10) : '', {
        type: 'date', label: s.label, format: (v) => itemCardDay(dateOnly(v)),
        // An order always has an ordered day; clearing it is ignored.
        toApi: (v) => (v ? v : s.key === 'ordered_date' ? o.ordered_date : null),
      }),
      done: s.key !== 'expected_delivery' && Boolean(o[s.key]),
    })),
    ...c.journey.filter((e) => !DATED.has(e.kind)).map((e, i) => ({
      key: `${e.kind}-${i}`, label: STEP[e.kind] ?? e.kind, when: itemCardWhen(e.at) as ReactNode, done: true,
    })),
  ];
  const currentKey = o.status === 'cancelled' ? null : [...life].reverse().find((r) => r.done)?.key ?? null;
  const extraDates = [
    ...ALL_DATES.filter(([k]) => o[k]).map(([k, label]) => ({ label, at: String(o[k]) })),
    ...c.journey.filter((e) => e.kind === 'truck_finalized' || e.kind === 'claim_filed').map((e) => ({ label: STEP[e.kind], at: e.at ?? '' })),
  ].sort((a, b) => a.at.localeCompare(b.at));

  const onPickFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      await upload.mutateAsync({ orderId: o.id, file });
      void qc.invalidateQueries({ queryKey: ['order-card', c.id] });
    } catch (err) {
      enqueueSnackbar(manifestUploadError(err), { variant: 'error' });
    }
  };

  return (
    <Stack spacing={2} sx={{ p: { xs: 1.5, md: 2.5 } }}>
      <Stack spacing={0.5} sx={{ minWidth: 0 }}>
        <Stack direction="row" spacing={0.5} alignItems="center" flexWrap="wrap" useFlexGap>
          <CopyId value={c.order_number} label="Copy order number" />
          <Chip size="small" label={c.status_label} color={STATUS_COLOR[c.status] ?? 'default'} variant="outlined" sx={{ fontWeight: 700 }} />
        </Stack>
        <Stack direction="row" spacing={1} alignItems="baseline" flexWrap="wrap" useFlexGap>
          <Typography component="h2" sx={{ fontWeight: 800, fontSize: { xs: 18, md: 22 }, lineHeight: 1.2 }}>
            {c.vendor ? (
              <Link
                component="button"
                type="button"
                underline="hover"
                color="inherit"
                onClick={() => openObject({ type: 'vendor', id: c.vendor!.id })}
                sx={{ font: 'inherit', textAlign: 'left', verticalAlign: 'baseline' }}
              >
                {c.vendor.name}
              </Link>
            ) : (c.vendor_name || 'Order')}
          </Typography>
          {o.vendor_code ? <Typography sx={{ fontSize: 13, color: 'text.secondary', fontFamily: 'monospace' }}>{o.vendor_code}</Typography> : null}
        </Stack>
        <Box sx={{ color: 'text.secondary', fontSize: 14 }}>
          {field('description', o.description, { label: 'Description', multiline: true })}
        </Box>
        <Stack direction="row" spacing={{ xs: 2, md: 3 }} sx={{ pt: 0.5 }} flexWrap="wrap" useFlexGap>
          <Stat label="Cost" value={itemCardMoney(c.money.total)} />
          <Stat label="Cost of retail" value={c.money.cost_pct_of_retail != null ? `${c.money.cost_pct_of_retail}%` : '-'} muted />
          <Stat label="Sold so far" value={itemCardMoney(c.money.sold_for)} muted />
          <Stat label="Recovered" value={c.money.recovered_pct != null ? `${c.money.recovered_pct}%` : '-'} muted />
        </Stack>
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ pt: 1 }}>
          <Button variant="contained" disabled={!gates.preprocessing} onClick={() => go(`/prep/steps/${c.id}`)}>Prep Truck</Button>
          <Button variant="outlined" disabled={!gates.preprocessing} onClick={() => go(`/inventory/preprocessing/${c.id}`)}>Preprocessing (old)</Button>
          <Button variant="outlined" disabled={!gates.receiving} onClick={() => go(`/inventory/receiving/${c.id}`)}>Receiving</Button>
          <Button variant="outlined" disabled={!gates.processing} onClick={() => go(`/inventory/processing/${c.id}`)}>Start Processing</Button>
          <Button variant="outlined" disabled={!gates.processing} onClick={() => go(`/inventory/orders/${c.id}/truck`)}>
            {o.closeout_status === 'finalized' ? 'Truck finalized' : 'Finish truck'}
          </Button>
          <Button variant="outlined" onClick={() => openObject({ type: 'close-truck', id: c.id })}>Close the truck</Button>
          <Button variant="outlined" onClick={() => openObject({ type: 'truck-plan', id: c.id })}>Truck Plan</Button>
        </Stack>
      </Stack>

      {/* Lifecycle has its own column (last on a phone), so opening "All dates" moves nothing else. */}
      <Box
        sx={{
          display: 'grid', gap: 2, alignItems: 'start',
          gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(3, minmax(0, 1fr))' },
        }}
      >
        <Box sx={{ minWidth: 0, order: { xs: 3, md: 0 }, gridRow: { md: '1 / span 2', lg: 'auto' } }}>
          <Section
            title="Lifecycle"
            action={
              <Button
                size="small"
                aria-expanded={allDates}
                endIcon={<ExpandMore sx={{ transform: allDates ? 'rotate(180deg)' : 'none', transition: 'transform 150ms' }} />}
                onClick={() => setAllDates((v) => !v)}
              >
                All dates
              </Button>
            }
          >
            <Box component="ol" sx={{ listStyle: 'none', m: 0, p: 0 }}>
              {life.map((r, i) => (
                <LifeRow key={r.key} label={r.label} when={r.when} done={r.done} current={r.key === currentKey} last={i === life.length - 1} />
              ))}
            </Box>
            {allDates ? (
              <Box sx={{ mt: 1.5, pt: 1.5, borderTop: 1, borderColor: 'divider' }}>
                <Facts
                  rows={[
                    ...extraDates.map((d) => [d.label, itemCardWhen(d.at)] as [string, ReactNode]),
                    ['Last changed', itemCardWhen(o.updated_at)],
                  ]}
                />
              </Box>
            ) : null}
          </Section>
        </Box>
        <Stack spacing={2} sx={{ minWidth: 0 }}>
          <Section title="Costs">
            <Facts rows={[
              ['Purchase', money('purchase_cost', 'Purchase')],
              ['Fees', money('fees', 'Fees')],
              ['Shipping', money('shipping_cost', 'Shipping')],
              ['Total cost', <Box key="t" component="span" sx={{ fontWeight: 800 }}>{itemCardMoney(String(total))}</Box>],
              ['Retail value', money('retail_value', 'Retail value')],
              ['Margin', (
                <Box key="mg" component="span" sx={{ fontWeight: 800, color: margin == null ? 'text.secondary' : margin >= 60 ? '#059669' : '#d97706' }}>
                  {margin == null ? '-' : `${margin.toFixed(1)}%`}
                </Box>
              )],
              ['Est. shrink', c.money.est_shrink ? `${Math.round(Number(c.money.est_shrink) * 100)}%` : null],
              ['Truck Plan', c.truck_plan ? (
                <Link key="plan" component="button" type="button" underline="hover" onClick={() => openObject({ type: 'truck-plan', id: c.id })} sx={{ fontSize: 'inherit', textAlign: 'left' }}>
                  {c.truck_plan.is_default ? 'Default plan' : 'Own plan'}
                  {c.truck_plan.pricing_start_pct ? `, tags start at ${c.truck_plan.pricing_start_pct}% of retail` : ''}
                </Link>
              ) : null],
            ]} />
          </Section>
          <Section title="Units">
            <Facts rows={[
              ['Condition', field('condition', o.condition, { type: 'select', label: 'Condition' })],
              ['Items', (
                <Box key="items" component="span">
                  {field('item_count', o.item_count, { type: 'integer', label: 'Items', toApi: (v) => count(v) ?? 0 })}
                  {u.items ? <Box component="span" sx={{ color: 'text.secondary' }}>{` on the order · ${u.items} in Dash`}</Box> : null}
                </Box>
              )],
              ['Pallets', field('pallet_count', o.pallet_count, { type: 'integer', label: 'Pallets', toApi: count })],
              ['Manifest', u.manifest_lines ? `${u.manifest_units} units on ${u.manifest_lines} lines` : null],
              ['Where', unitsLine || null],
              ['Disputed', u.disputed ? String(u.disputed) : null],
            ]} />
          </Section>
        </Stack>
        <Stack spacing={2} sx={{ minWidth: 0 }}>
          <Section title="Manifest">
            {o.has_manifest ? (
              <Stack spacing={1.25}>
                <Box sx={{ minWidth: 0 }}>
                  <Link
                    component="button"
                    type="button"
                    underline="hover"
                    title="Preview or download the manifest"
                    onClick={() => setViewer(true)}
                    sx={{ fontSize: 14, fontWeight: 700, textAlign: 'left', overflowWrap: 'anywhere' }}
                  >
                    {o.manifest_filename || 'Manifest'}
                  </Link>
                  <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>Uploaded {itemCardDay(o.manifest_uploaded_at)}</Typography>
                </Box>
                <Stack direction="row" spacing={1}>
                  <MiniStat label="Rows" value={(o.manifest_row_count ?? 0).toLocaleString('en-US')} />
                  <MiniStat label="Categories" value={o.manifest_category_count == null ? '-' : o.manifest_category_count.toLocaleString('en-US')} />
                  <MiniStat label="Est. value" value={wholeDollars(o.retail_value)} green />
                </Stack>
              </Stack>
            ) : (
              canEdit ? (
                <Box
                  role="button"
                  tabIndex={0}
                  data-testid="order-manifest-drop"
                  aria-label="Upload manifest"
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') fileRef.current?.click(); }}
                  onDragEnter={(e) => { e.preventDefault(); setDropOver(true); }}
                  onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }}
                  onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropOver(false); }}
                  onDrop={(e) => { e.preventDefault(); setDropOver(false); if (!upload.isPending) void onPickFile(e.dataTransfer.files?.[0]); }}
                  onClick={() => { if (!upload.isPending) fileRef.current?.click(); }}
                  sx={{
                    border: 2, borderStyle: 'dashed', borderColor: dropOver ? 'primary.main' : 'divider', borderRadius: 2,
                    py: 3, px: 2, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1,
                    bgcolor: dropOver ? 'action.hover' : 'transparent', cursor: upload.isPending ? 'wait' : 'pointer',
                  }}
                >
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".csv,.tsv,text/csv,text/tab-separated-values"
                    hidden
                    data-testid="order-manifest-file"
                    onChange={(e) => { void onPickFile(e.target.files?.[0]); e.target.value = ''; }}
                  />
                  {upload.isPending ? <CircularProgress size={24} /> : <IconUpload sx={{ color: 'text.secondary' }} />}
                  <Typography sx={{ fontSize: 13, fontWeight: 600, color: 'text.secondary' }}>
                    No manifest yet. Drop a CSV or TSV here, or click to browse
                  </Typography>
                </Box>
              ) : (
                <Typography sx={{ fontSize: 14, color: 'text.secondary' }}>No manifest yet.</Typography>
              )
            )}
          </Section>
          {c.claim || c.disputed_claim || c.disputes.length || c.notes ? (
            <Section title="Notes and claims">
              <Facts rows={[
                ['Truck claim', c.claim ? [c.claim.status_label,
                  c.claim.refund_expected ? `expected ${itemCardMoney(c.claim.refund_expected)}` : '',
                  c.claim.refund_received ? `received ${itemCardMoney(c.claim.refund_received)}` : ''].filter(Boolean).join(' · ') : null],
                ['Disputed', c.disputed_claim
                  ? `${c.disputed_claim.items} ${c.disputed_claim.items === 1 ? 'item' : 'items'}, ${itemCardMoney(c.disputed_claim.retail)} toward the claim`
                  : null],
                ...c.disputes.map((d, i) => [`Dispute ${i + 1}`, `${d.title} (${d.status})`] as [string, string]),
                ['Notes', c.notes ? <Box component="span" sx={{ whiteSpace: 'pre-wrap' }}>{c.notes}</Box> : null],
              ] as [string, ReactNode][]} />
            </Section>
          ) : null}
        </Stack>
      </Box>

      <PurchaseOrderManifestDialog open={viewer} onClose={() => setViewer(false)} orderId={o.id} fallbackFilename={o.manifest_filename} />
    </Stack>
  );
}

/** The order window body. The owner (not viewing as someone else) can change fields; everyone else reads. */
export function OrderCardBody({ orderId }: { orderId: number }) {
  const { user } = useAuth();
  const card = useOrderCard(orderId);
  const surface = usePurchaseOrderSurface(orderId);
  if (card.isLoading || surface.isLoading) return <CircularProgress size={28} sx={{ m: 4 }} />;
  if (card.isError || surface.isError || !card.data || !surface.data) {
    return <Typography sx={{ p: 3 }}>This order could not be loaded.</Typography>;
  }
  return <CardView c={card.data} o={surface.data} canEdit={Boolean(user?.is_superuser && !user.view_as)} />;
}
