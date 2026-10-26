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
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Tooltip, Typography, useMediaQuery,
  useTheme,
} from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import {
  buildSupplyOrder, getSupplyOrder, markSupplyOrdered, type OrderLine, type OrderVendor, type SupplyOrder,
} from '../../api/supplies.api';
import { PageHeader } from '../../components/common/PageHeader';
import { formatCurrency } from '../../utils/format';
import { apiError, dayText, deadlineText, OutLink, whenText } from './supplyBits';

function packsText(line: OrderLine): string {
  const u = line.unit || 'each';
  return line.pack_size > 1 ? `${line.packs} × ${line.pack_size} ${u}` : `${line.packs} ${u}`;
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
                <OrderedTick line={line} onTick={(on) => tick.mutate({ ids: [line.id], on })} />
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
                </TableRow>
              ))}
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
          {' '}Qty is in packs; each line says why.
        </Typography>
      )}
      <Stack spacing={2}>
        {order?.vendors.map((v) => <VendorBlock key={v.vendor} vendor={v} order={order} phone={phone} />)}
      </Stack>
    </Box>
  );
}
