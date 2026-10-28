/**
 * The universal Item modal: one item as Retail, Processing and Restoration each need to see it.
 * The model for every object modal after it (product, order, ...): see `.ai/extended/frontend.md` § Universal object modal.
 *
 * Header: photo, SKU (copy), title, brand · model, status, condition, tag price, retail.
 * Sections: Overview · Where it is · Money · Restoration (if any) · Journey · Links.
 * Read-only; "Edit" swaps in the existing item editor (ItemManagePanel) with its save and print.
 */
import { useState, type ReactNode } from 'react';
import {
  Alert, Box, Button, Chip, CircularProgress, Divider, IconButton, Stack, Tooltip, Typography,
} from '@mui/material';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { IconCopy, IconEdit, IconSearch, IconBack } from '../../icons/ecoIcons';
import { restorationOverviewPath } from '../../pages/restoration/restorationRoutes';
import {
  itemCardDay, itemCardMoney, itemCardSpecs, itemCardWhen, itemCardWhere, useItemCard,
  type ItemCardFull, type ItemJourneyEvent,
} from './itemCardData';
import { GoogleItLink } from './GoogleItLink';
import { ProductCategoryLine } from './ProductCategoryLine';
import { useObjectModal } from './ObjectModal';

const STATUS_TONE: Record<string, 'success' | 'info' | 'warning' | 'default' | 'error'> = {
  on_shelf: 'success',
  processing: 'info',
  intake: 'info',
  sold: 'default',
  returned: 'warning',
  scrapped: 'error',
  lost: 'error',
};

const JOURNEY_DOT: Record<ItemJourneyEvent['kind'], string> = {
  order: '#7a6f5a',
  created: '#9e9e9e',
  check_in: '#2e7d32',
  restoration: '#6a1b9a',
  tag: '#0277bd',
  history: '#757575',
  sale: '#c62828',
  note: '#ef6c00',
  count: '#00838f',
};

function Section({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <Box component="section" sx={{ border: 1, borderColor: 'divider', borderRadius: 2, p: { xs: 1.5, md: 2 }, minWidth: 0 }}>
      <Stack direction="row" alignItems="center" sx={{ mb: 1 }}>
        <Typography component="h3" sx={{ fontSize: 13, fontWeight: 800, letterSpacing: 0.4, textTransform: 'uppercase', color: 'text.secondary', flex: 1 }}>
          {title}
        </Typography>
        {action}
      </Stack>
      {children}
    </Box>
  );
}

/** Label / value rows. Empty values are left out, so every section shows only what is known. */
function Facts({ rows }: { rows: [string, ReactNode][] }) {
  const shown = rows.filter(([, v]) => v != null && v !== '' && v !== false);
  if (!shown.length) return <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>Nothing recorded.</Typography>;
  return (
    <Box
      component="dl"
      sx={{
        m: 0, display: 'grid', gridTemplateColumns: { xs: 'minmax(96px, auto) 1fr', sm: 'minmax(120px, auto) 1fr' },
        columnGap: 2, rowGap: 0.75, fontSize: 14,
        '& dt': { color: 'text.secondary' },
        '& dd': { m: 0, overflowWrap: 'anywhere', fontWeight: 500 },
      }}
    >
      {shown.map(([k, v]) => (
        <Box key={k} sx={{ display: 'contents' }}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </Box>
      ))}
    </Box>
  );
}

function money(v: string | null | undefined): string | null {
  return v == null || v === '' ? null : itemCardMoney(v);
}

const RETAIL_CHECK: Record<string, string> = {
  passed: 'Passed',
  confirmed: 'Confirmed',
  fixed: 'Fixed',
  no_retail: 'No retail',
  missing: 'Missing',
};

/** "A $220 · B $160 · C $90": the restoration price per grade. */
function gradePrices(values: Record<string, unknown> | undefined): string | null {
  const parts = Object.entries(values ?? {}).flatMap(([grade, v]) => {
    const n = typeof v === 'number' ? v : typeof v === 'string' ? Number.parseFloat(v) : Number.NaN;
    return Number.isFinite(n) ? [`${grade} $${Math.round(n)}`] : [];
  });
  return parts.length ? parts.join(' · ') : null;
}

function minutes(seconds: number | undefined): string | null {
  if (!seconds) return null;
  const m = Math.round(seconds / 60);
  return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`;
}

function Header({ card }: { card: ItemCardFull }) {
  const [copied, setCopied] = useState(false);
  const brandModel = [card.brand !== 'Generic' ? card.brand : '', card.model].filter(Boolean).join(' · ');
  return (
    <Stack direction="row" spacing={{ xs: 1.5, md: 2.5 }} alignItems="flex-start">
      <Box
        sx={{
          width: { xs: 88, md: 140 }, height: { xs: 88, md: 140 }, flexShrink: 0, borderRadius: 2, overflow: 'hidden',
          bgcolor: 'action.hover', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        {card.photo_url ? (
          <Box component="img" src={card.photo_url} alt={card.title} sx={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <Typography sx={{ fontSize: 12, color: 'text.disabled' }}>No photo</Typography>
        )}
      </Box>
      <Stack spacing={0.5} sx={{ minWidth: 0, flex: 1 }}>
        <Stack direction="row" spacing={0.5} alignItems="center" flexWrap="wrap" useFlexGap>
          <Typography sx={{ fontFamily: 'monospace', fontWeight: 900, fontSize: { xs: 14, md: 15 } }}>{card.sku}</Typography>
          <Tooltip title={copied ? 'Copied' : 'Copy SKU'}>
            <IconButton
              size="small"
              aria-label="Copy SKU"
              onClick={() => {
                void navigator.clipboard?.writeText(card.sku).then(() => setCopied(true));
                window.setTimeout(() => setCopied(false), 1400);
              }}
            >
              <IconCopy fontSize="small" />
            </IconButton>
          </Tooltip>
          <GoogleItLink brand={card.brand} title={card.title} model={card.model} />
          <Chip size="small" label={card.status_label} color={STATUS_TONE[card.status] ?? 'default'} variant="outlined" sx={{ fontWeight: 700 }} />
          <Chip size="small" label={card.condition_label} variant="outlined" />
        </Stack>
        <Typography component="h2" sx={{ fontWeight: 800, fontSize: { xs: 18, md: 22 }, lineHeight: 1.2 }}>
          {card.title || 'Untitled item'}
        </Typography>
        {brandModel && <Typography sx={{ color: 'text.secondary', fontSize: 14 }}>{brandModel}</Typography>}
        <Stack direction="row" spacing={{ xs: 2, md: 3 }} sx={{ pt: 0.5 }} flexWrap="wrap" useFlexGap>
          <Box>
            <Typography sx={{ fontSize: 11, color: 'text.secondary', textTransform: 'uppercase', fontWeight: 700 }}>Tag price</Typography>
            <Typography sx={{ fontSize: { xs: 20, md: 24 }, fontWeight: 900, lineHeight: 1.1 }}>{itemCardMoney(card.price)}</Typography>
          </Box>
          <Box>
            <Typography sx={{ fontSize: 11, color: 'text.secondary', textTransform: 'uppercase', fontWeight: 700 }}>Retail</Typography>
            <Typography sx={{ fontSize: { xs: 20, md: 24 }, fontWeight: 600, lineHeight: 1.1, color: 'text.secondary' }}>
              {itemCardMoney(card.retail)}
            </Typography>
          </Box>
          {card.sold_at && (
            <Box>
              <Typography sx={{ fontSize: 11, color: 'text.secondary', textTransform: 'uppercase', fontWeight: 700 }}>Sold for</Typography>
              <Typography sx={{ fontSize: { xs: 20, md: 24 }, fontWeight: 900, lineHeight: 1.1 }}>{itemCardMoney(card.sold_for)}</Typography>
            </Box>
          )}
        </Stack>
      </Stack>
    </Stack>
  );
}

function Journey({ events }: { events: ItemJourneyEvent[] }) {
  if (!events.length) return <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>Nothing recorded yet.</Typography>;
  return (
    <Box component="ol" sx={{ listStyle: 'none', m: 0, p: 0 }}>
      {events.map((e, i) => (
        <Box component="li" key={`${e.at}-${i}`} sx={{ display: 'grid', gridTemplateColumns: '14px 1fr', columnGap: 1.25, pb: 1.25, position: 'relative' }}>
          <Box sx={{ position: 'relative' }}>
            <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: JOURNEY_DOT[e.kind] ?? '#999', mt: '5px' }} />
            {i < events.length - 1 && (
              <Box sx={{ position: 'absolute', left: 4, top: 17, bottom: -4, width: 2, bgcolor: 'divider' }} />
            )}
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontSize: 14, fontWeight: 700, lineHeight: 1.3 }}>{e.label}</Typography>
            {e.detail && <Typography sx={{ fontSize: 13, color: 'text.primary', overflowWrap: 'anywhere' }}>{e.detail}</Typography>}
            <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>
              {itemCardWhen(e.at)}{e.who ? ` · ${e.who}` : ''}
            </Typography>
          </Box>
        </Box>
      ))}
    </Box>
  );
}

function CardView({ card, onEdit }: { card: ItemCardFull; onEdit: () => void }) {
  const { openObject, closeObject } = useObjectModal();
  const navigate = useNavigate();
  const specs = itemCardSpecs(card.specifications);
  const r = card.restoration;
  const go = (path: string) => {
    closeObject();
    navigate(path);
  };

  const links = (
    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
      {card.product_id != null && (
        <Button size="small" variant="outlined" onClick={() => openObject({ type: 'product', id: card.product_id! })}>
          Product{card.product_number ? ` ${card.product_number}` : ''}
        </Button>
      )}
      {card.order && (
        <Button size="small" variant="outlined" onClick={() => openObject({ type: 'order', id: card.order!.id })}>
          Order {card.order.order_number}
        </Button>
      )}
      {card.check_in_id != null && (
        <Button size="small" variant="outlined" onClick={() => openObject({ type: 'checkin', id: card.check_in_id! })}>
          Check-in
        </Button>
      )}
      {r && (
        <Button size="small" variant="outlined" onClick={() => go(restorationOverviewPath(r.job_id))}>
          Restoration job
        </Button>
      )}
      {card.parent_item && (
        <Button size="small" variant="outlined" onClick={() => openObject({ type: 'item', id: card.parent_item!.id })}>
          Salvaged from {card.parent_item.sku}
        </Button>
      )}
      <Button size="small" variant="outlined" startIcon={<IconSearch fontSize="small" />} onClick={() => go(`/inventory/search?q=${encodeURIComponent(card.sku)}`)}>
        Inventory search
      </Button>
    </Stack>
  );

  return (
    <Stack spacing={2} sx={{ p: { xs: 1.5, md: 2.5 } }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ xs: 'stretch', sm: 'flex-start' }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Header card={card} />
        </Box>
        <Button variant="contained" startIcon={<IconEdit fontSize="small" />} onClick={onEdit} sx={{ flexShrink: 0 }}>
          Edit
        </Button>
      </Stack>
      {card.dispute && (
        <Alert severity="warning">
          Dispute: {card.dispute.type}{card.dispute.pct_loss != null ? ` (${card.dispute.pct_loss}% loss)` : ''}
          {card.dispute.description ? ` · ${card.dispute.description}` : ''}
        </Alert>
      )}
      <Box
        sx={{
          display: 'grid', gap: 2, alignItems: 'start',
          gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1.15fr) minmax(0, 1fr)' },
        }}
      >
        <Stack spacing={2} sx={{ minWidth: 0 }}>
          <Section title="Overview">
            <Facts
              rows={[
                ['Product', card.title],
                ['Brand', card.brand],
                ['Model', card.model],
                ['Category', card.product_id != null
                  ? <ProductCategoryLine productId={card.product_id} fallback={card.category} />
                  : card.category],
                ['Condition', card.condition_label],
                ['UPC', card.upc],
                ['Source', card.source_label],
                ...specs,
                ['Notes', card.notes ? <Box component="span" sx={{ whiteSpace: 'pre-wrap' }}>{card.notes}</Box> : null],
              ]}
            />
          </Section>
          <Section title="Where it is">
            <Facts
              rows={[
                ['Now', itemCardWhere(card)],
                ['Location', card.location],
                ['Pallet', card.pallet],
                ['Checked in', card.checked_in_at ? `${itemCardWhen(card.checked_in_at)}${card.checked_in_by ? ` · ${card.checked_in_by}` : ''}` : null],
                ['Tag printed', card.label_printed_at ? itemCardWhen(card.label_printed_at) : 'Not yet'],
                ['On the floor since', card.listed_at ? itemCardDay(card.listed_at) : null],
                ['Last scan', card.last_scan_at ? `${itemCardWhen(card.last_scan_at)}${card.last_scan_source ? ` · ${card.last_scan_source}` : ''}` : null],
                ['Scans', card.scan_count ? String(card.scan_count) : null],
              ]}
            />
          </Section>
          <Section title="Money">
            <Facts
              rows={[
                ['Tag price', money(card.price)],
                ['Retail', money(card.retail)],
                ['Retail on the tag', card.tag_retail ? itemCardMoney(card.tag_retail) : 'Not printed'],
                ['Retail check', RETAIL_CHECK[card.retail_check] ?? (card.retail_check || 'Not checked')],
                ['Retail from', card.retail_source],
                ['Manifest retail', money(card.manifest_line?.unit_retail)],
                ['Cost (estimate)', money(card.cost)],
                ['Sold for', money(card.sold_for)],
                ['Store keeps', money(card.sold_net)],
                ['ThriftBucks earned', money(card.thriftbucks_at_sale)],
                ['Sold', card.sold_at ? itemCardWhen(card.sold_at) : null],
                ['Sale channel', card.sale_channel_label],
              ]}
            />
          </Section>
        </Stack>
        <Stack spacing={2} sx={{ minWidth: 0 }}>
          {r && (
            <Section title="Restoration">
              <Facts
                rows={[
                  ['Stage', r.stage_label],
                  ['Scale', r.scale],
                  ['Grade prices', gradePrices(r.grade_values)],
                  ['Starting grade', r.starting_grade],
                  ['Final grade', r.final_grade],
                  ['Bench', r.bench_owner],
                  ['Meant for', r.intended_destination],
                  ['Went to', r.bench_disposition],
                  ['Bench time', minutes(r.active_seconds)],
                  ['Parts cost', money(r.spent_parts_cost)],
                  ['Value added', money(r.value_added)],
                  ['Queue note', r.queue_note],
                  ['Waiting on', r.pending_reason],
                  ['Finish notes', r.disposition_notes],
                  ['Sent back', [r.return_reason, r.return_notes].filter(Boolean).join(' · ')],
                ]}
              />
              {!!r.actions?.length && (
                <>
                  <Divider sx={{ my: 1.25 }} />
                  <Typography sx={{ fontSize: 12, fontWeight: 700, color: 'text.secondary', mb: 0.5 }}>Work done</Typography>
                  <Stack spacing={0.5}>
                    {r.actions.map((a, i) => (
                      <Typography key={i} sx={{ fontSize: 13 }}>
                        <b style={{ textTransform: 'capitalize' }}>{a.category}</b>
                        {a.grade ? ` · ${a.grade}` : ''}
                        {a.description ? ` · ${a.description}` : ''}
                        {a.seconds ? ` · ${minutes(a.seconds)}` : ''}
                      </Typography>
                    ))}
                  </Stack>
                </>
              )}
            </Section>
          )}
          <Section title="Journey">
            <Journey events={card.journey} />
          </Section>
          <Section title="Links">{links}</Section>
        </Stack>
      </Box>
    </Stack>
  );
}

/**
 * The item modal body. `renderEditor` is the existing item editor (passed in by ObjectModal so this file
 * never imports the editor's page code).
 */
export function ItemCardBody({ itemId, renderEditor }: { itemId: number; renderEditor: () => ReactNode }) {
  const [editing, setEditing] = useState(false);
  const qc = useQueryClient();
  const { data, isLoading, isError } = useItemCard(itemId);

  if (editing) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: 320 }}>
        <Box sx={{ px: 2, pt: 1 }}>
          <Button
            size="small"
            startIcon={<IconBack fontSize="small" />}
            onClick={() => {
              setEditing(false);
              void qc.invalidateQueries({ queryKey: ['item-card', itemId] });
            }}
          >
            Back to the item
          </Button>
        </Box>
        {renderEditor()}
      </Box>
    );
  }
  if (isLoading) return <CircularProgress size={28} sx={{ m: 4 }} />;
  if (isError || !data) return <Typography sx={{ p: 3 }}>This item could not be loaded.</Typography>;
  return <CardView card={data} onEdit={() => setEditing(true)} />;
}
