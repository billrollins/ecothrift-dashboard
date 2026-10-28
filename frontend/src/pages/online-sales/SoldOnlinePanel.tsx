import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Button,
  Chip,
  MenuItem,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { useSnackbar } from 'notistack';
import {
  getOnlineSales,
  recordOnlineSale,
  undoOnlineSale,
  type OnlineSaleRow,
} from '../../api/webstore.api';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { formatCurrency } from '../../utils/format';
import { useOnlineSalesMobile } from './useOnlineSalesMobile';
import { ItemSkuLink } from '../../components/objects/ItemPeek';
import { skuFromScan } from '../../utils/scanCode';

const KEY = ['online-sales-sold', 90] as const;

function errDetail(err: unknown, fallback: string): string {
  return (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || fallback;
}

function when(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString() : '-';
}

/**
 * Sold online (E5): record an item sold online and paid outside the register (it leaves inventory), and see every
 * online sale of the last 90 days, including holds picked up and paid at the register.
 */
export function SoldOnlinePanel() {
  const isMobile = useOnlineSalesMobile();
  const { enqueueSnackbar } = useSnackbar();
  const qc = useQueryClient();
  const [sku, setSku] = useState('');
  const [price, setPrice] = useState('');
  const [channel, setChannel] = useState<'facebook' | 'online_other'>('facebook');
  const [note, setNote] = useState('');
  const [undoRow, setUndoRow] = useState<OnlineSaleRow | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: KEY,
    queryFn: async () => (await getOnlineSales(90)).data.results,
  });

  const record = useMutation({
    mutationFn: async () => (await recordOnlineSale({ sku: skuFromScan(sku), sold_for: price.trim(), channel, note: note.trim() })).data,
    onSuccess: (fresh) => {
      qc.setQueryData(KEY, fresh.results);
      enqueueSnackbar(`${skuFromScan(sku).toUpperCase()} recorded as sold online. It left inventory.`, { variant: 'success' });
      setSku('');
      setPrice('');
      setNote('');
    },
    onError: (err) => enqueueSnackbar(errDetail(err, 'Could not record the sale.'), { variant: 'error' }),
  });

  const undo = useMutation({
    mutationFn: async (itemId: number) => (await undoOnlineSale(itemId)).data,
    onSuccess: (fresh) => {
      qc.setQueryData(KEY, fresh.results);
      setUndoRow(null);
      enqueueSnackbar('Back on the shelf.', { variant: 'success' });
    },
    onError: (err) => enqueueSnackbar(errDetail(err, 'Could not undo it.'), { variant: 'error' }),
  });

  const ready = sku.trim() !== '' && /^\d+(\.\d{1,2})?$/.test(price.trim());
  const rows = data ?? [];

  return (
    <Box sx={{ display: 'grid', gap: 2, minWidth: 0 }}>
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>Record a sale paid outside the register</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          Sold on Facebook or elsewhere online and paid there? Scan or type its tag: it leaves inventory at that price. A
          hold picked up at the register is recorded by the register itself.
        </Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center' }}>
          <TextField
            size="small"
            label="Tag (SKU)"
            value={sku}
            onChange={(e) => setSku(e.target.value)}
            sx={{ width: { xs: 'calc(50% - 4px)', sm: 160 } }}
          />
          <TextField
            size="small"
            label="Sold for $"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            inputProps={{ inputMode: 'decimal' }}
            sx={{ width: { xs: 'calc(50% - 4px)', sm: 120 } }}
          />
          <TextField
            select
            size="small"
            label="Where"
            value={channel}
            onChange={(e) => setChannel(e.target.value as 'facebook' | 'online_other')}
            sx={{ width: { xs: '100%', sm: 170 } }}
          >
            <MenuItem value="facebook">Facebook</MenuItem>
            <MenuItem value="online_other">Other online</MenuItem>
          </TextField>
          <TextField
            size="small"
            label="Note (optional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            sx={{ flex: 1, minWidth: { xs: '100%', sm: 200 } }}
          />
          <Button
            variant="contained"
            disabled={!ready || record.isPending}
            onClick={() => record.mutate()}
            sx={{ width: { xs: '100%', sm: 'auto' } }}
          >
            Record sale
          </Button>
        </Box>
      </Paper>

      <Paper variant="outlined" sx={{ p: 2, minWidth: 0 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 800, mb: 1 }}>
          Sold online, last 90 days ({rows.length})
        </Typography>
        {isLoading ? null : rows.length === 0 ? (
          <Alert severity="info">No online sales in the last 90 days.</Alert>
        ) : isMobile ? (
          <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 1 }}>
            {rows.map((r) => (
              <Box key={r.item_id} sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 1 }}>
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'baseline' }}>
                  <Typography variant="body2" sx={{ fontWeight: 700, flex: 1, minWidth: 0 }} noWrap title={r.title}>
                    {r.title || r.sku}
                  </Typography>
                  <Typography variant="body2" sx={{ fontWeight: 800 }}>{formatCurrency(r.sold_for)}</Typography>
                </Box>
                <Typography variant="caption" color="text.secondary" component="div">
                  <ItemSkuLink itemId={r.item_id} sku={r.sku} /> · {when(r.sold_at)} · {r.channel_label}
                  {r.recorded_by ? ` · ${r.recorded_by}` : ''}
                </Typography>
                {r.can_undo ? (
                  <Box sx={{ textAlign: 'right' }}>
                    <Button size="small" onClick={() => setUndoRow(r)}>Undo</Button>
                  </Box>
                ) : null}
              </Box>
            ))}
          </Box>
        ) : (
          <Box sx={{ overflowX: 'auto' }}>
            <Table size="small" sx={{ '& td, & th': { whiteSpace: 'nowrap' } }}>
              <TableHead>
                <TableRow>
                  <TableCell>Sold</TableCell>
                  <TableCell>Tag</TableCell>
                  <TableCell>Item</TableCell>
                  <TableCell align="right">Price</TableCell>
                  <TableCell>Where</TableCell>
                  <TableCell>Recorded by</TableCell>
                  <TableCell />
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.item_id} hover>
                    <TableCell>{when(r.sold_at)}</TableCell>
                    <TableCell><ItemSkuLink itemId={r.item_id} sku={r.sku} /></TableCell>
                    <TableCell sx={{ maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis' }} title={r.note || r.title}>
                      {r.title}
                    </TableCell>
                    <TableCell align="right">{formatCurrency(r.sold_for)}</TableCell>
                    <TableCell>
                      <Chip size="small" variant="outlined" color={r.paid_at_register ? 'success' : 'primary'} label={r.channel_label} />
                    </TableCell>
                    <TableCell>{r.recorded_by || (r.paid_at_register ? 'Register' : '-')}</TableCell>
                    <TableCell align="right">
                      {r.can_undo ? <Button size="small" onClick={() => setUndoRow(r)}>Undo</Button> : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        )}
      </Paper>

      <ConfirmDialog
        open={undoRow != null}
        title="Undo this online sale?"
        message={undoRow ? `${undoRow.sku} goes back on the shelf, unsold.` : ''}
        confirmLabel="Undo sale"
        severity="warning"
        loading={undo.isPending}
        onConfirm={() => undoRow && undo.mutate(undoRow.item_id)}
        onCancel={() => setUndoRow(null)}
      />
    </Box>
  );
}
