/**
 * The Vendor window (Dash Updates #13): one vendor, read-only, built like the Item window. Header (name, code with
 * copy, type, active), Spent, Cost of retail, Recovered and Days to sell for the period (the vendor page's own numbers:
 * services/vendor_metrics.py), contact, the rest of the numbers, the newest orders (each opens its Order window), notes.
 * "Edit" opens the vendor page (its form and every order). No new API: the vendor, its metrics and its orders.
 */
import { useState } from 'react';
import { Box, Button, ButtonBase, Chip, CircularProgress, Stack, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { getOneVendorMetrics, getVendor, type VendorPeriod } from '../../api/inventory.api';
import { usePurchaseOrders } from '../../hooks/useInventory';
import { IconEdit } from '../../icons/ecoIcons';
import { PERIODS, pct } from '../../pages/inventory/vendors/vendorMetrics';
import { itemCardMoney, itemCardDay } from './itemCardData';
import { useObjectModal } from './ObjectModal';
import { CopyId, Facts, Section, Stat } from './windowParts';

const TYPE: Record<string, string> = { liquidation: 'Liquidation', retail: 'Retail', direct: 'Direct', other: 'Other' };

export function VendorCardBody({ vendorId }: { vendorId: number }) {
  const { openObject, closeObject } = useObjectModal();
  const navigate = useNavigate();
  const [period, setPeriod] = useState<VendorPeriod>('12m');
  const vendor = useQuery({ queryKey: ['vendor-card', vendorId], queryFn: async () => (await getVendor(vendorId)).data });
  const metrics = useQuery({
    queryKey: ['vendorMetrics', 'one', vendorId, period],
    queryFn: async () => (await getOneVendorMetrics(vendorId, period)).data,
  });
  const orders = usePurchaseOrders({ vendor: vendorId, page_size: 10, ordering: '-ordered_date' });
  const go = (path: string) => {
    closeObject();
    navigate(path);
  };

  if (vendor.isLoading) return <CircularProgress size={28} sx={{ m: 4 }} />;
  if (vendor.isError || !vendor.data) return <Typography sx={{ p: 3 }}>This vendor could not be loaded.</Typography>;
  const v = vendor.data;
  const m = metrics.data?.metrics;
  const money = (x: string | null | undefined) => (x == null ? null : itemCardMoney(x));
  const rows = orders.data?.results ?? [];

  return (
    <Stack spacing={2} sx={{ p: { xs: 1.5, md: 2.5 } }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ xs: 'stretch', sm: 'flex-start' }}>
        <Stack spacing={0.5} sx={{ flex: 1, minWidth: 0 }}>
          <Stack direction="row" spacing={0.5} alignItems="center" flexWrap="wrap" useFlexGap>
            {v.code ? <CopyId value={v.code} label="Copy vendor code" /> : null}
            <Chip size="small" label={TYPE[v.vendor_type] ?? v.vendor_type} variant="outlined" />
            {!v.is_active ? <Chip size="small" label="Inactive" color="warning" variant="outlined" sx={{ fontWeight: 700 }} /> : null}
          </Stack>
          <Typography component="h2" sx={{ fontWeight: 800, fontSize: { xs: 18, md: 22 }, lineHeight: 1.2 }}>{v.name}</Typography>
          <ToggleButtonGroup size="small" exclusive value={period} onChange={(_, p: VendorPeriod | null) => p && setPeriod(p)}
            sx={{ pt: 0.5, flexWrap: 'wrap' }}>
            {PERIODS.map((p) => <ToggleButton key={p.value} value={p.value} sx={{ textTransform: 'none', py: 0.25 }}>{p.label}</ToggleButton>)}
          </ToggleButtonGroup>
          {metrics.isLoading ? <CircularProgress size={18} /> : (
            <Stack direction="row" spacing={{ xs: 2, md: 3 }} sx={{ pt: 0.5 }} flexWrap="wrap" useFlexGap>
              <Stat label="Spent" value={money(m?.spent) ?? '-'} />
              <Stat label="Cost of retail" value={pct(m?.landed_pct)} muted />
              <Stat label="Recovered" value={pct(m?.recovery_actual)} muted />
              <Stat label="Days to sell" value={m?.days_to_sell != null ? m.days_to_sell : '-'} muted />
            </Stack>
          )}
        </Stack>
        <Button variant="contained" startIcon={<IconEdit fontSize="small" />} onClick={() => go(`/inventory/vendors/${v.id}?period=${period}`)}
          sx={{ flexShrink: 0 }}>
          Edit
        </Button>
      </Stack>

      <Box sx={{ display: 'grid', gap: 2, alignItems: 'start', gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1.15fr) minmax(0, 1fr)' } }}>
        <Stack spacing={2} sx={{ minWidth: 0 }}>
          <Section title="Numbers">
            <Facts empty="No orders in this period." rows={m ? [
              ['Orders', String(m.orders)],
              ['Last ordered', m.last_ordered ? itemCardDay(`${m.last_ordered}T12:00:00`) : null],
              ['Manifest retail', money(m.manifest_retail)],
              ['Manifest accuracy', m.manifest_accuracy != null ? pct(m.manifest_accuracy) : null],
              ['Items checked in', m.items_checked_in ? String(m.items_checked_in) : null],
              ['Items sold', m.items_sold ? String(m.items_sold) : null],
              ['Avg cost / start / sold', [money(m.avg_cost), money(m.avg_start), money(m.avg_sold)].map((x) => x ?? '-').join(' / ')],
              ['Sold', money(m.sold)],
              ['Profit', money(m.profit)],
              ['Disputes', m.disputes ? `${m.disputes}${m.disputes_open ? ` (${m.disputes_open} open)` : ''}` : null],
            ] : []} />
          </Section>
          <Section title="Contact">
            <Facts empty="No contact on file." rows={[
              ['Name', v.contact_name],
              ['Email', v.contact_email ? <a href={`mailto:${v.contact_email}`}>{v.contact_email}</a> : null],
              ['Phone', v.contact_phone ? <a href={`tel:${v.contact_phone}`}>{v.contact_phone}</a> : null],
              ['Address', v.address ? <Box component="span" sx={{ whiteSpace: 'pre-wrap' }}>{v.address}</Box> : null],
              ['Notes', v.notes ? <Box component="span" sx={{ whiteSpace: 'pre-wrap' }}>{v.notes}</Box> : null],
            ]} />
          </Section>
        </Stack>
        <Stack spacing={2} sx={{ minWidth: 0 }}>
          <Section title="Newest orders" action={rows.length ? <Button size="small" onClick={() => go(`/inventory/vendors/${v.id}?period=all`)}>All</Button> : undefined}>
            {orders.isLoading ? <CircularProgress size={18} /> : rows.length === 0 ? (
              <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>No orders yet.</Typography>
            ) : (
              <Stack divider={<Box sx={{ borderTop: 1, borderColor: 'divider' }} />}>
                {rows.map((o) => (
                  <ButtonBase key={o.id} onClick={() => openObject({ type: 'order', id: o.id })}
                    sx={{ display: 'flex', width: '100%', gap: 1.25, py: 0.75, px: 0.5, textAlign: 'left', borderRadius: 1, justifyContent: 'flex-start', alignItems: 'baseline' }}>
                    <Typography sx={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 13, flexShrink: 0 }}>{o.order_number}</Typography>
                    <Typography sx={{ fontSize: 13, color: 'text.secondary', flex: 1, minWidth: 0 }} noWrap>
                      {[o.ordered_date ? itemCardDay(`${o.ordered_date}T12:00:00`) : '', o.description].filter(Boolean).join(' · ')}
                    </Typography>
                    <Typography sx={{ fontSize: 13, fontWeight: 700, flexShrink: 0 }}>{o.total_cost ? itemCardMoney(o.total_cost) : ''}</Typography>
                  </ButtonBase>
                ))}
              </Stack>
            )}
          </Section>
        </Stack>
      </Box>
    </Stack>
  );
}
