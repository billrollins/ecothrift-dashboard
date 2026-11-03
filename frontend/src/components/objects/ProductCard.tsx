/**
 * The Product window (Dash Updates #11): one product, read-only, built like the Item window. Header (photo, product
 * number with copy, Google it, title, brand · model, category, active), on the shelf / sold / average sold, the stock
 * line, the newest items (each opens its Item window), the orders it came on (each opens its Order window), and a short
 * journey. "Edit" swaps in the existing product editor (ProductManagePanel), as the Item window's Edit does.
 * Data: GET /api/inventory/products/<id>/card/ (apps/inventory/services/product_card.py).
 */
import { useState, type ReactNode } from 'react';
import { Box, Button, ButtonBase, Chip, CircularProgress, Stack, Typography } from '@mui/material';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import api from '../../api/client';
import { IconBack, IconEdit, IconSearch } from '../../icons/ecoIcons';
import { GoogleItLink } from './GoogleItLink';
import { itemCardMoney, itemCardWhen } from './itemCardData';
import { useObjectModal } from './ObjectModal';
import { CopyId, Facts, Section, Stat, Timeline, type TimelineRow } from './windowParts';

export interface ProductCardData {
  id: number;
  product_number: string;
  title: string;
  brand: string;
  model: string;
  category: string;
  is_active: boolean;
  photo_url: string | null;
  upc: string;
  identifiers: Record<string, string>;
  tags: string[];
  created_at: string | null;
  counts: { total: number; on_shelf: number; processing: number; sold: number; gone: number; returned: number };
  avg_sold: string | null;
  avg_price: string | null;
  avg_retail: string | null;
  avg_days_to_sell: number | null;
  items: { id: number; sku: string; status: string; status_label: string; price: string | null; sold_for: string | null; order_number: string }[];
  orders: { id: number; order_number: string; items: number }[];
  more_orders: boolean;
  journey: { kind: string; at: string | null; label: string; detail: string; check_in_id?: number }[];
}

const DOT: Record<string, string> = { created: '#9e9e9e', check_in: '#2e7d32', sale: '#c62828' };
const STATUS_TONE: Record<string, string> = { on_shelf: 'success.main', sold: 'text.secondary', scrapped: 'error.main', lost: 'error.main' };

export function useProductCard(id: number) {
  return useQuery({
    queryKey: ['product-card', id],
    queryFn: async () => (await api.get<ProductCardData>(`/inventory/products/${id}/card/`)).data,
    staleTime: 15_000,
  });
}

function Row({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <ButtonBase onClick={onClick} sx={{ display: 'flex', width: '100%', gap: 1.25, py: 0.75, px: 0.5, textAlign: 'left', borderRadius: 1, justifyContent: 'flex-start', alignItems: 'baseline' }}>
      {children}
    </ButtonBase>
  );
}

function CardView({ c, onEdit }: { c: ProductCardData; onEdit: () => void }) {
  const { openObject, closeObject } = useObjectModal();
  const navigate = useNavigate();
  const go = (path: string) => {
    closeObject();
    navigate(path);
  };
  const brandModel = [c.brand !== 'Generic' ? c.brand : '', c.model].filter(Boolean).join(' · ');
  const n = c.counts;
  const stock = [
    n.on_shelf ? `${n.on_shelf} on the shelf` : '',
    n.processing ? `${n.processing} in processing` : '',
    n.sold ? `${n.sold} sold` : '',
    n.returned ? `${n.returned} returned` : '',
    n.gone ? `${n.gone} scrapped or lost` : '',
  ].filter(Boolean).join(' · ');
  const averages = [
    c.avg_price ? `Avg tag ${itemCardMoney(c.avg_price)}` : '',
    c.avg_retail ? `avg retail ${itemCardMoney(c.avg_retail)}` : '',
    c.avg_days_to_sell != null ? `${c.avg_days_to_sell} days to sell` : '',
  ].filter(Boolean).join(' · ');
  const journey: TimelineRow[] = c.journey.map((e, i) => ({
    key: `${e.kind}-${e.at}-${i}`,
    label: e.label,
    detail: e.detail || null,
    when: itemCardWhen(e.at),
    dot: DOT[e.kind] ?? '#999',
  }));
  const ids = Object.entries(c.identifiers).filter(([k]) => k.toLowerCase() !== 'upc');

  return (
    <Stack spacing={2} sx={{ p: { xs: 1.5, md: 2.5 } }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ xs: 'stretch', sm: 'flex-start' }}>
        <Stack direction="row" spacing={{ xs: 1.5, md: 2.5 }} alignItems="flex-start" sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ width: { xs: 88, md: 140 }, height: { xs: 88, md: 140 }, flexShrink: 0, borderRadius: 2, overflow: 'hidden', bgcolor: 'action.hover', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {c.photo_url ? <Box component="img" src={c.photo_url} alt={c.title} sx={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <Typography sx={{ fontSize: 12, color: 'text.disabled' }}>No photo</Typography>}
          </Box>
          <Stack spacing={0.5} sx={{ minWidth: 0, flex: 1 }}>
            <Stack direction="row" spacing={0.5} alignItems="center" flexWrap="wrap" useFlexGap>
              {c.product_number ? <CopyId value={c.product_number} label="Copy product number" /> : null}
              <GoogleItLink brand={c.brand} title={c.title} model={c.model} />
              {!c.is_active ? <Chip size="small" label="Inactive" color="warning" variant="outlined" sx={{ fontWeight: 700 }} /> : null}
            </Stack>
            <Typography component="h2" sx={{ fontWeight: 800, fontSize: { xs: 18, md: 22 }, lineHeight: 1.2 }}>{c.title}</Typography>
            {brandModel ? <Typography sx={{ color: 'text.secondary', fontSize: 14 }}>{brandModel}</Typography> : null}
            {c.category ? <Typography sx={{ color: 'text.secondary', fontSize: 13 }}>{c.category}</Typography> : null}
            {n.total ? (
              <>
                <Stack direction="row" spacing={{ xs: 2, md: 3 }} sx={{ pt: 0.5 }} flexWrap="wrap" useFlexGap>
                  <Stat label="On the shelf" value={n.on_shelf} />
                  <Stat label="Sold" value={n.sold} muted />
                  <Stat label="Avg sold" value={c.avg_sold ? itemCardMoney(c.avg_sold) : '-'} muted />
                </Stack>
                {averages ? <Typography sx={{ color: 'text.secondary', fontSize: 12 }}>{averages}</Typography> : null}
              </>
            ) : <Typography sx={{ color: 'text.secondary', fontSize: 13, pt: 0.5 }}>No items of this product yet.</Typography>}
          </Stack>
        </Stack>
        <Button variant="contained" startIcon={<IconEdit fontSize="small" />} onClick={onEdit} sx={{ flexShrink: 0 }}>Edit</Button>
      </Stack>

      <Box sx={{ display: 'grid', gap: 2, alignItems: 'start', gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1.15fr) minmax(0, 1fr)' } }}>
        <Stack spacing={2} sx={{ minWidth: 0 }}>
          <Section title="Details">
            <Facts rows={[
              ['UPC', c.upc],
              ...ids.map(([k, v]) => [k.toUpperCase(), String(v)] as [string, string]),
              ['Tags', c.tags.length ? c.tags.join(', ') : null],
              ['Stock', stock || null],
            ]} />
          </Section>
          <Section
            title="Items"
            action={n.total ? (
              <Button size="small" startIcon={<IconSearch fontSize="small" />} onClick={() => go(`/inventory/products/${c.id}`)}>
                All {n.total}
              </Button>
            ) : undefined}
          >
            {c.items.length === 0 ? <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>No items yet.</Typography> : (
              <Stack divider={<Box sx={{ borderTop: 1, borderColor: 'divider' }} />}>
                {c.items.map((it) => (
                  <Row key={it.id} onClick={() => openObject({ type: 'item', id: it.id })}>
                    <Typography sx={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 13, flexShrink: 0 }}>{it.sku}</Typography>
                    <Typography sx={{ fontSize: 13, color: STATUS_TONE[it.status] ?? 'text.primary', flex: 1, minWidth: 0 }} noWrap>
                      {[it.status_label, it.order_number].filter(Boolean).join(' · ')}
                    </Typography>
                    <Typography sx={{ fontSize: 13, fontWeight: 700, flexShrink: 0 }}>
                      {itemCardMoney(it.status === 'sold' && it.sold_for ? it.sold_for : it.price)}
                    </Typography>
                  </Row>
                ))}
              </Stack>
            )}
          </Section>
        </Stack>
        <Stack spacing={2} sx={{ minWidth: 0 }}>
          <Section title="Journey"><Timeline rows={journey} empty="Nothing recorded yet." /></Section>
          <Section title="Links">
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              {c.orders.map((o) => (
                <Button key={o.id} size="small" variant="outlined" onClick={() => openObject({ type: 'order', id: o.id })}>
                  {o.order_number} ({o.items})
                </Button>
              ))}
              {c.more_orders ? <Typography sx={{ fontSize: 13, color: 'text.secondary', alignSelf: 'center' }}>and more</Typography> : null}
              <Button size="small" variant="outlined" startIcon={<IconSearch fontSize="small" />}
                onClick={() => go(`/inventory/search?q=${encodeURIComponent(c.product_number || c.title)}`)}>
                Inventory search
              </Button>
            </Stack>
          </Section>
        </Stack>
      </Box>
    </Stack>
  );
}

/** The product window body. `renderEditor` is the existing product editor, passed in by ObjectModal. */
export function ProductCardBody({ productId, renderEditor }: { productId: number; renderEditor: () => ReactNode }) {
  const [editing, setEditing] = useState(false);
  const qc = useQueryClient();
  const { data, isLoading, isError } = useProductCard(productId);
  if (editing) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: 320 }}>
        <Box sx={{ px: 2, pt: 1 }}>
          <Button size="small" startIcon={<IconBack fontSize="small" />}
            onClick={() => { setEditing(false); void qc.invalidateQueries({ queryKey: ['product-card', productId] }); }}>
            Back to the product
          </Button>
        </Box>
        {renderEditor()}
      </Box>
    );
  }
  if (isLoading) return <CircularProgress size={28} sx={{ m: 4 }} />;
  if (isError || !data) return <Typography sx={{ p: 3 }}>This product could not be loaded.</Typography>;
  return <CardView c={data} onEdit={() => setEditing(true)} />;
}
