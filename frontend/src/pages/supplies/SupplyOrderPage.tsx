/**
 * The week's supply order (owner, 2026-10-26). Built within the hour after the count deadline, by rule: at or under
 * min, order up to max in whole packs. Vendor by vendor: each line with its link, packs, price and line total, and
 * the vendor's total. Amazon: one button adds every ASIN and quantity to the cart; Bill checks out himself. Tick
 * "Ordered" per line or per vendor (who and when are kept). Owner only. Desk: a table per vendor. Phone: cards.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert, Box, Button, Card, CardContent, Checkbox, Chip, FormControlLabel, LinearProgress, MenuItem, Paper, Stack,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, ToggleButton, ToggleButtonGroup,
  Tooltip, Typography, useMediaQuery, useTheme,
} from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import {
  buildSupplyOrder, getSupplyOrder, getSupplySpend, markSupplyOrdered, type OrderLine, type OrderVendor,
  type SupplyOrder, type SupplySpend,
} from '../../api/supplies.api';
import { PageHeader } from '../../components/common/PageHeader';
import { formatCurrency } from '../../utils/format';
import { apiError, dayText, deadlineText, OutLink, whenText } from './supplyBits';

function packsText(line: OrderLine): string {
  const u = line.unit || 'each';
  return line.pack_size > 1 ? `${line.packs} × ${line.pack_size} ${u}` : `${line.packs} ${u}`;
}

/** What has come in (staff tick it on Receive). */
function InText({ line }: { line: OrderLine }) {
  if (!line.ordered_at) return null;
  const tip = line.received_at ? `${line.received_by}, ${whenText(line.received_at)}` : 'Nothing in yet';
  const all = line.received_qty >= line.packs;
  const label = all ? 'All in' : `${line.received_qty} of ${line.packs} in`;
  const color = all ? 'success' : line.received_qty ? 'warning' : 'default';
  return <Tooltip title={tip}><Chip size="small" variant="outlined" color={color} label={label} /></Tooltip>;
}

function LinkFlag({ line }: { line: OrderLine }) {
  if (line.link_status !== 'broken') return null;
  return <Chip size="small" color="error" label="Link gone" sx={{ ml: 1 }} />;
}

function OrderedTick({ line, onTick }: { line: OrderLine; onTick: (on: boolean) => void }) {
  return (
    <Tooltip title={line.ordered_at ? `${line.ordered_by}, ${whenText(line.ordered_at)}` : 'Not ordered yet'}>
      <FormControlLabel
        sx={{ m: 0 }}
        control={<Checkbox checked={!!line.ordered_at} onChange={(e) => onTick(e.target.checked)} />}
        label={line.ordered_at ? 'Ordered' : 'Order'}
      />
    </Tooltip>
  );
}

function VendorBlock({ vendor, order, phone }: { vendor: OrderVendor; order: SupplyOrder; phone: boolean }) {
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const tick = useMutation({
    mutationFn: ({ ids, on }: { ids: number[]; on: boolean }) => markSupplyOrdered(order.id, ids, on),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['supplies', 'order'] }),
    onError: (err) => enqueueSnackbar(apiError(err, 'Could not save the tick.'), { variant: 'error' }),
  });
  const allIds = vendor.lines.map((l) => l.id);
  return (
    <Paper variant="outlined" sx={{ p: { xs: 1.5, md: 2 } }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ alignItems: { sm: 'center' }, justifyContent: 'space-between', mb: 1.5 }}>
        <Box>
          <Typography variant="h6" sx={{ fontSize: '1.1rem' }}>
            <OutLink href={vendor.vendor_url}>{vendor.vendor}</OutLink>
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {vendor.lines.length} {vendor.lines.length === 1 ? 'line' : 'lines'} · {formatCurrency(vendor.total)}
            {vendor.unpriced > 0 && ` + ${vendor.unpriced} with no price`}
          </Typography>
        </Box>
        <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', rowGap: 1 }}>
          {vendor.cart_url && (
            <Button variant="contained" href={vendor.cart_url} target="_blank" rel="noopener noreferrer">
              Add all to Amazon cart
            </Button>
          )}
          <Button
            variant={vendor.ordered ? 'outlined' : 'text'}
            onClick={() => tick.mutate({ ids: allIds, on: !vendor.ordered })}
            disabled={tick.isPending}
          >
            {vendor.ordered ? 'Untick all' : 'All ordered'}
          </Button>
        </Stack>
      </Stack>
      {vendor.is_amazon && vendor.not_in_cart > 0 && (
        <Alert severity="warning" sx={{ mb: 1.5 }}>
          {vendor.not_in_cart} {vendor.not_in_cart === 1 ? 'line has' : 'lines have'} no ASIN, so {vendor.not_in_cart === 1 ? 'it is' : 'they are'} not in the cart button. Add them from their links.
        </Alert>
      )}
      {phone ? (
        <Stack spacing={1}>
          {vendor.lines.map((line) => (
            <Card key={line.id} variant="outlined" sx={{ opacity: line.ordered_at ? 0.65 : 1 }}>
              <CardContent sx={{ pb: '8px !important' }}>
                <Typography sx={{ fontWeight: 600 }}>
                  <OutLink href={line.url}>{line.name}</OutLink><LinkFlag line={line} />
                </Typography>
                <Typography variant="body2">
                  {packsText(line)} · {line.price ? `${formatCurrency(line.price)} each` : 'no price'}
                  {line.line_total && <> · <b>{formatCurrency(line.line_total)}</b></>}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{line.list_name}: {line.reason}</Typography>
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                  <OrderedTick line={line} onTick={(on) => tick.mutate({ ids: [line.id], on })} />
                  <InText line={line} />
                </Stack>
              </CardContent>
            </Card>
          ))}
        </Stack>
      ) : (
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Item</TableCell>
                <TableCell>Why</TableCell>
                <TableCell align="right">Qty</TableCell>
                <TableCell align="right">Price</TableCell>
                <TableCell align="right">Line total</TableCell>
                <TableCell>Ordered</TableCell>
                <TableCell>In</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {vendor.lines.map((line) => (
                <TableRow key={line.id} sx={{ opacity: line.ordered_at ? 0.65 : 1 }}>
                  <TableCell>
                    <OutLink href={line.url}>{line.name}</OutLink><LinkFlag line={line} />
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                      {line.list_name}{line.vendor_item_id && ` · ${line.vendor_item_id}`}
                    </Typography>
                  </TableCell>
                  <TableCell sx={{ maxWidth: 380 }}><Typography variant="body2" color="text.secondary">{line.reason}</Typography></TableCell>
                  <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>{packsText(line)}</TableCell>
                  <TableCell align="right">{line.price ? formatCurrency(line.price) : '-'}</TableCell>
                  <TableCell align="right">{line.line_total ? formatCurrency(line.line_total) : '-'}</TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>
                    <OrderedTick line={line} onTick={(on) => tick.mutate({ ids: [line.id], on })} />
                  </TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}><InText line={line} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Paper>
  );
}

function periodLabel(iso: string, by: SupplySpend['by']): string {
  const d = new Date(`${iso}T12:00:00`);
  return by === 'month' ? d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }) : dayText(iso);
}

/** Spend: what was ticked Ordered, per vendor or per list, by week (8) or month (6). */
function SpendSection({ phone }: { phone: boolean }) {
  const [by, setBy] = useState<SupplySpend['by']>('week');
  const [per, setPer] = useState<'vendors' | 'lists'>('vendors');
  const { data, isLoading } = useQuery({ queryKey: ['supplies', 'spend', by], queryFn: () => getSupplySpend(by) });
  const rows = data ? data[per] : [];
  const last = (list: string[]) => list[list.length - 1];
  return (
    <Paper variant="outlined" sx={{ p: { xs: 1.5, md: 2 }, mt: 3 }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ justifyContent: 'space-between', alignItems: { sm: 'center' }, mb: 1.5 }}>
        <Box>
          <Typography variant="h6" sx={{ fontSize: '1.1rem' }}>Spend</Typography>
          <Typography variant="body2" color="text.secondary">
            Lines ticked Ordered, on the day they were ticked.
            {data && data.unpriced > 0 && ` ${data.unpriced} ordered ${data.unpriced === 1 ? 'line has' : 'lines have'} no price.`}
          </Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          <ToggleButtonGroup size="small" exclusive value={per} onChange={(_, v) => v && setPer(v)} aria-label="Spend per">
            <ToggleButton value="vendors" sx={{ textTransform: 'none' }}>Vendor</ToggleButton>
            <ToggleButton value="lists" sx={{ textTransform: 'none' }}>List</ToggleButton>
          </ToggleButtonGroup>
          <ToggleButtonGroup size="small" exclusive value={by} onChange={(_, v) => v && setBy(v)} aria-label="Spend by">
            <ToggleButton value="week" sx={{ textTransform: 'none' }}>Week</ToggleButton>
            <ToggleButton value="month" sx={{ textTransform: 'none' }}>Month</ToggleButton>
          </ToggleButtonGroup>
        </Stack>
      </Stack>
      {isLoading && <LinearProgress />}
      {data && rows.length === 0 && <Typography color="text.secondary">Nothing ordered in this time yet.</Typography>}
      {data && rows.length > 0 && phone && (
        <Stack spacing={0.75}>
          {rows.map((row) => (
            <Stack key={row.name} direction="row" spacing={1} sx={{ justifyContent: 'space-between' }}>
              <Typography variant="body2">{row.name}</Typography>
              <Typography variant="body2" sx={{ textAlign: 'right' }}>
                {formatCurrency(last(row.amounts))} this {by} · {formatCurrency(row.total)} in {data.periods.length} {by}s
              </Typography>
            </Stack>
          ))}
          <Typography variant="body2" sx={{ fontWeight: 700 }}>Total this {by}: {formatCurrency(last(data.totals))}</Typography>
        </Stack>
      )}
      {data && rows.length > 0 && !phone && (
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>{per === 'vendors' ? 'Vendor' : 'List'}</TableCell>
                {data.periods.map((p) => <TableCell key={p} align="right">{periodLabel(p, by)}</TableCell>)}
                <TableCell align="right">Total</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.name}>
                  <TableCell>{row.name}</TableCell>
                  {row.amounts.map((a, i) => <TableCell key={data.periods[i]} align="right">{Number(a) ? formatCurrency(a) : '-'}</TableCell>)}
                  <TableCell align="right" sx={{ fontWeight: 700 }}>{formatCurrency(row.total)}</TableCell>
                </TableRow>
              ))}
              <TableRow>
                <TableCell sx={{ fontWeight: 700 }}>All</TableCell>
                {data.totals.map((t, i) => <TableCell key={data.periods[i]} align="right" sx={{ fontWeight: 700 }}>{Number(t) ? formatCurrency(t) : '-'}</TableCell>)}
                <TableCell align="right" sx={{ fontWeight: 700 }}>
                  {formatCurrency(data.totals.reduce((sum, t) => sum + Number(t), 0))}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Paper>
  );
}

export default function SupplyOrderPage() {
  const navigate = useNavigate();
  const theme = useTheme();
  const phone = useMediaQuery(theme.breakpoints.down('md'));
  const [week, setWeek] = useState<string>('');
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const { data, isLoading, error } = useQuery({
    queryKey: ['supplies', 'order', week],
    queryFn: () => getSupplyOrder(week || undefined),
  });
  const build = useMutation({
    mutationFn: buildSupplyOrder,
    onSuccess: (r) => {
      enqueueSnackbar(r.detail, { variant: 'info' });
      queryClient.invalidateQueries({ queryKey: ['supplies', 'order'] });
    },
  });
  const order = data?.order;
  return (
    <Box sx={{ maxWidth: 1300, mx: 'auto' }}>
      <PageHeader
        title="Supply order"
        subtitle={order
          ? `Week of ${dayText(order.week_start)} · built ${whenText(order.built_at)} · ${formatCurrency(order.total)} in all`
          : undefined}
        action={(
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            {data && data.weeks.length > 1 && (
              <TextField select size="small" label="Week" value={week || order?.week_start || ''} onChange={(e) => setWeek(e.target.value)} sx={{ minWidth: 140 }}>
                {data.weeks.map((w) => <MenuItem key={w} value={w}>{dayText(w)}</MenuItem>)}
              </TextField>
            )}
            <Button onClick={() => navigate('/supplies')}>Lists</Button>
          </Stack>
        )}
      />
      {isLoading && <LinearProgress />}
      {error && <Alert severity="error">{apiError(error, 'Could not load the order.')}</Alert>}
      {data && !order && (
        <Alert severity="info" action={<Button color="inherit" onClick={() => build.mutate()} disabled={build.isPending}>Build now</Button>}>
          No order yet. It is built within the hour after the count deadline ({deadlineText(data.cycle.deadline)} next).
          Build now makes the one for the deadline that already passed.
        </Alert>
      )}
      {order && order.missed_lists.length > 0 && (
        <Alert severity="error" sx={{ mb: 2 }}>
          Not counted by the deadline, so not on this order: {order.missed_lists.join(', ')}.
        </Alert>
      )}
      {order && order.line_count === 0 && (
        <Alert severity="success" sx={{ mb: 2 }}>Nothing to order this week: every counted item is above its min.</Alert>
      )}
      {order && order.line_count > 0 && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {order.open_count ? `${order.open_count} of ${order.line_count} lines still to order.` : 'Everything is ordered.'}
          {order.waiting_count ? ` ${order.waiting_count} ordered ${order.waiting_count === 1 ? 'line is' : 'lines are'} not all in yet.` : ''}
          {' '}Qty is in packs; each line says why.
        </Typography>
      )}
      <Stack spacing={2}>
        {order?.vendors.map((v) => <VendorBlock key={v.vendor} vendor={v} order={order} phone={phone} />)}
      </Stack>
      <SpendSection phone={phone} />
    </Box>
  );
}
