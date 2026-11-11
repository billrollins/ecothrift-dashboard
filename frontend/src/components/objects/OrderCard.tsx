/**
 * The Order window (Dash Updates #12): one purchase order, read-only, built like the Item window. Header (order number
 * with copy, vendor, status, what it is), Cost, Cost % of retail, Sold so far and Recovered; money; units; the truck
 * claim; the journey from ordered to closed; links to its Processing, Receiving and Truck pages and its vendor.
 * The description and the "Truck plan" button open the Truck Plan window (TruckPlanCard.tsx, Dash Updates #81).
 * "Edit" swaps in the order page it opened before (OrderDetailPage, embedded).
 * Data: GET /api/inventory/orders/<id>/card/ (apps/inventory/services/order_card.py).
 */
import { useState, type ReactNode } from 'react';
import { Box, Button, Chip, CircularProgress, Link, Stack, Typography } from '@mui/material';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import api from '../../api/client';
import { IconBack, IconEdit } from '../../icons/ecoIcons';
import { itemCardDay, itemCardMoney, itemCardWhen } from './itemCardData';
import { useObjectModal } from './ObjectModal';
import { CopyId, Facts, Section, Stat, Timeline, type TimelineRow } from './windowParts';

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

export function useOrderCard(id: number) {
  return useQuery({
    queryKey: ['order-card', id],
    queryFn: async () => (await api.get<OrderCardData>(`/inventory/orders/${id}/card/`)).data,
    staleTime: 15_000,
  });
}

const dateOnly = (iso: string | null) => (iso && iso.length === 10 ? `${iso}T12:00:00` : iso);

function CardView({ c, onEdit }: { c: OrderCardData; onEdit: () => void }) {
  const { closeObject, openObject } = useObjectModal();
  const navigate = useNavigate();
  const go = (path: string) => {
    closeObject();
    navigate(path);
  };
  const m = c.money;
  const u = c.units;
  const unitsLine = [
    u.pending ? `${u.pending} to check in` : '',
    u.on_shelf ? `${u.on_shelf} on the shelf${m.shelf_value ? ` (${itemCardMoney(m.shelf_value)} in tags)` : ''}` : '',
    u.sold ? `${u.sold} sold` : '',
    u.returned ? `${u.returned} returned` : '',
    u.gone ? `${u.gone} scrapped or lost` : '',
  ].filter(Boolean).join(' · ');
  const journey: TimelineRow[] = c.journey.map((e, i) => ({
    key: `${e.kind}-${i}`,
    label: STEP[e.kind] ?? e.kind,
    detail: null,
    // Ordered, paid, shipped and delivered are days; the rest have a time.
    when: e.at && e.at.length === 10 ? itemCardDay(dateOnly(e.at)) : itemCardWhen(e.at),
    dot: e.kind === 'closed' || e.kind === 'truck_finalized' ? '#2e7d32' : '#0277bd',
  }));

  return (
    <Stack spacing={2} sx={{ p: { xs: 1.5, md: 2.5 } }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ xs: 'stretch', sm: 'flex-start' }}>
        <Stack spacing={0.5} sx={{ flex: 1, minWidth: 0 }}>
          <Stack direction="row" spacing={0.5} alignItems="center" flexWrap="wrap" useFlexGap>
            <CopyId value={c.order_number} label="Copy order number" />
            <Chip size="small" label={c.status_label} color={STATUS_COLOR[c.status] ?? 'default'} variant="outlined" sx={{ fontWeight: 700 }} />
            {c.condition ? <Chip size="small" label={c.condition} variant="outlined" /> : null}
          </Stack>
          <Typography component="h2" sx={{ fontWeight: 800, fontSize: { xs: 18, md: 22 }, lineHeight: 1.2 }}>
            {c.vendor_name || 'Order'}
          </Typography>
          {c.description ? (
            <Link
              component="button"
              type="button"
              underline="hover"
              title="Open the Truck Plan"
              onClick={() => openObject({ type: 'truck-plan', id: c.id })}
              sx={{ color: 'text.secondary', fontSize: 14, textAlign: 'left', alignSelf: 'flex-start' }}
            >
              {c.description}
            </Link>
          ) : null}
          <Stack direction="row" spacing={{ xs: 2, md: 3 }} sx={{ pt: 0.5 }} flexWrap="wrap" useFlexGap>
            <Stat label="Cost" value={itemCardMoney(m.total)} />
            <Stat label="Cost of retail" value={m.cost_pct_of_retail != null ? `${m.cost_pct_of_retail}%` : '-'} muted />
            <Stat label="Sold so far" value={itemCardMoney(m.sold_for)} muted />
            <Stat label="Recovered" value={m.recovered_pct != null ? `${m.recovered_pct}%` : '-'} muted />
          </Stack>
        </Stack>
        <Button variant="contained" startIcon={<IconEdit fontSize="small" />} onClick={onEdit} sx={{ flexShrink: 0 }}>Edit</Button>
      </Stack>

      <Box sx={{ display: 'grid', gap: 2, alignItems: 'start', gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1.15fr) minmax(0, 1fr)' } }}>
        <Stack spacing={2} sx={{ minWidth: 0 }}>
          <Section title="Money">
            <Facts rows={[
              ['Purchase', m.purchase ? itemCardMoney(m.purchase) : null],
              ['Shipping', m.shipping ? itemCardMoney(m.shipping) : null],
              ['Fees', m.fees ? itemCardMoney(m.fees) : null],
              ['Total (landed)', m.total ? itemCardMoney(m.total) : null],
              ['Retail', m.retail ? itemCardMoney(m.retail) : null],
              ['Est. shrink', m.est_shrink ? `${Math.round(Number(m.est_shrink) * 100)}%` : null],
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
              ['Manifest', u.manifest_lines ? `${u.manifest_units} units on ${u.manifest_lines} lines` : null],
              ['Pallets', u.pallets ? String(u.pallets) : null],
              ['Items', u.items ? String(u.items) : null],
              ['Where', unitsLine || null],
              ['Disputed', u.disputed ? String(u.disputed) : null],
            ]} />
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
        <Stack spacing={2} sx={{ minWidth: 0 }}>
          <Section title="Journey"><Timeline rows={journey} empty="Nothing recorded yet." /></Section>
          <Section title="Links">
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              {c.vendor ? (
                <Button size="small" variant="outlined" onClick={() => openObject({ type: 'vendor', id: c.vendor!.id })}>{c.vendor.name}</Button>
              ) : null}
              <Button size="small" variant="outlined" onClick={() => openObject({ type: 'truck-plan', id: c.id })}>Truck Plan</Button>
              <Button size="small" variant="outlined" onClick={() => go(`/inventory/receiving/${c.id}`)}>Receiving</Button>
              <Button size="small" variant="outlined" onClick={() => go(`/inventory/processing/${c.id}`)}>Processing</Button>
              <Button size="small" variant="outlined" onClick={() => go(`/inventory/orders/${c.id}/truck`)}>Truck</Button>
              <Button size="small" variant="outlined" onClick={() => openObject({ type: 'close-truck', id: c.id })}>Close the truck</Button>
            </Stack>
          </Section>
        </Stack>
      </Box>
    </Stack>
  );
}

/** The order window body. `renderEditor` is the order page it opened before, passed in by ObjectModal. */
export function OrderCardBody({ orderId, renderEditor }: { orderId: number; renderEditor: () => ReactNode }) {
  const [editing, setEditing] = useState(false);
  const qc = useQueryClient();
  const { data, isLoading, isError } = useOrderCard(orderId);
  if (editing) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: 320 }}>
        <Box sx={{ px: 2, pt: 1 }}>
          <Button size="small" startIcon={<IconBack fontSize="small" />}
            onClick={() => { setEditing(false); void qc.invalidateQueries({ queryKey: ['order-card', orderId] }); }}>
            Back to the order
          </Button>
        </Box>
        {renderEditor()}
      </Box>
    );
  }
  if (isLoading) return <CircularProgress size={28} sx={{ m: 4 }} />;
  if (isError || !data) return <Typography sx={{ p: 3 }}>This order could not be loaded.</Typography>;
  return <CardView c={data} onEdit={() => setEditing(true)} />;
}
