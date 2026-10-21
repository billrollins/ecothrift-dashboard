import { useState } from 'react';
import { Link as RouterLink, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  FormControlLabel,
  IconButton,
  MenuItem,
  Paper,
  Switch,
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
  addTruckAdjustment,
  deleteTruckAdjustment,
  getTruckFinalize,
  truckFinalizeStep,
  type TruckAdjustmentPayload,
  type TruckFinalizeDTO,
  type TruckMeasure,
} from '../../../api/truckFinalize.api';
import { ConfirmDialog } from '../../../components/common/ConfirmDialog';
import { useAuth } from '../../../hooks/useAuth';
import { IconClose as Close } from '../../../icons/ecoIcons';
import { formatCurrency, formatCurrencyWhole } from '../../../utils/format';
import { finalizeWarnings, pctText, refundRuleText, unitsText } from './truckFinalizeDisplay';

const SUMMARY: { key: TruckMeasure; label: string; help: string }[] = [
  { key: 'manifest', label: 'Manifest', help: 'What the manifest lists' },
  { key: 'unfulfilled', label: 'Unfulfilled', help: 'Adjusted off by B-Stock or the seller' },
  { key: 'expected', label: 'Expected', help: 'Manifest less unfulfilled' },
  { key: 'received', label: 'Received', help: 'Checked in against the manifest' },
  { key: 'missing', label: 'Missing', help: 'Expected, never checked in' },
  { key: 'broken', label: 'Broken', help: 'Arrived broken (scrapped or salvage)' },
  { key: 'over', label: 'Over', help: 'More than the line listed' },
];

function errDetail(err: unknown, fallback: string): string {
  return (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || fallback;
}

export default function TruckFinalizePage() {
  const { id } = useParams<{ id: string }>();
  const orderId = id && /^\d+$/.test(id) ? Number.parseInt(id, 10) : null;
  const { enqueueSnackbar } = useSnackbar();
  const { hasRole } = useAuth();
  const qc = useQueryClient();
  const [allLines, setAllLines] = useState(false);
  const [confirm, setConfirm] = useState<'finalize' | 'reopen' | null>(null);
  const key = ['truck-finalize', orderId, allLines] as const;

  const { data, isLoading, isError } = useQuery({
    queryKey: key,
    queryFn: async () => (await getTruckFinalize(orderId as number, allLines)).data,
    enabled: orderId != null,
  });

  const onSaved = (fresh: TruckFinalizeDTO) => {
    qc.setQueryData(key, fresh);
    void qc.invalidateQueries({ queryKey: ['truck-finalize', orderId] });
  };

  const step = useMutation({
    mutationFn: async (s: 'finalize' | 'reopen') => (await truckFinalizeStep(orderId as number, s)).data,
    onSuccess: (fresh, s) => {
      onSaved(fresh);
      setConfirm(null);
      enqueueSnackbar(s === 'finalize' ? 'Truck finalized.' : 'Truck reopened.', { variant: 'success' });
    },
    onError: (err) => enqueueSnackbar(errDetail(err, 'Could not update the truck.'), { variant: 'error' }),
  });

  const removeAdj = useMutation({
    mutationFn: async (adjId: number) => (await deleteTruckAdjustment(orderId as number, adjId)).data,
    onSuccess: onSaved,
    onError: (err) => enqueueSnackbar(errDetail(err, 'Could not remove it.'), { variant: 'error' }),
  });

  if (orderId == null) return <Alert severity="error">No order.</Alert>;
  if (isLoading) return <Box sx={{ p: 4, textAlign: 'center' }}><CircularProgress /></Box>;
  if (isError || !data) return <Alert severity="error">Could not load this truck.</Alert>;

  const finalized = Boolean(data.finalized.at);
  const warnings = finalizeWarnings(data);
  const t = data.totals;

  return (
    <Box sx={{ p: { xs: 1.5, md: 3 }, maxWidth: 1400, mx: 'auto' }}>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1.5, mb: 2 }}>
        <Box sx={{ flex: 1, minWidth: 260 }}>
          <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: 800 }}>
            Finish truck
          </Typography>
          <Typography variant="h5" sx={{ fontWeight: 800 }}>
            {data.order.order_number}{' '}
            <Typography component="span" color="text.secondary">· {data.order.vendor}</Typography>
          </Typography>
          <Typography variant="body2" color="text.secondary">{data.order.description}</Typography>
        </Box>
        {finalized ? (
          <Chip color="success" label={`Finalized ${new Date(data.finalized.at as string).toLocaleDateString()} by ${data.finalized.by || '-'}`} />
        ) : (
          <Chip variant="outlined" label="Open" />
        )}
        <Button component={RouterLink} to={`/inventory/processing/${orderId}`} variant="outlined">
          Processing
        </Button>
        {finalized ? (
          hasRole('Manager') ? (
            <Button variant="outlined" color="warning" onClick={() => setConfirm('reopen')}>
              Reopen
            </Button>
          ) : null
        ) : (
          <Button variant="contained" color="success" onClick={() => setConfirm('finalize')}>
            Mark finalized
          </Button>
        )}
      </Box>

      {!finalized && warnings.length > 0 ? (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {warnings.map((w) => (
            <div key={w}>{w}</div>
          ))}
        </Alert>
      ) : null}

      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', md: 'repeat(8, 1fr)' }, gap: 2 }}>
          {SUMMARY.map((s) => (
            <Box key={s.key}>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 800, textTransform: 'uppercase', fontSize: '0.62rem' }}>
                {s.label}
              </Typography>
              <Typography sx={{ fontSize: 20, fontWeight: 900, fontVariantNumeric: 'tabular-nums' }}>
                {unitsText(t.units[s.key])}
              </Typography>
              <Typography variant="caption" color="text.secondary" title={s.help}>
                {formatCurrencyWhole(t.retail[s.key])}
                {s.key === 'missing' ? ` · ${pctText(t.missing_pct)}` : ''}
              </Typography>
            </Box>
          ))}
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 800, textTransform: 'uppercase', fontSize: '0.62rem' }}>
              Added
            </Typography>
            <Typography sx={{ fontSize: 20, fontWeight: 900 }}>{unitsText(t.added_units)}</Typography>
            <Typography variant="caption" color="text.secondary">
              {formatCurrencyWhole(t.added_retail)} not on manifest
            </Typography>
          </Box>
        </Box>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
          Units and $ at the manifest price. Pallets: {data.pallets.arrived} arrived, {data.pallets.done} of{' '}
          {data.pallets.total} done.
        </Typography>
      </Paper>

      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>What we can expect back</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          {refundRuleText(data.refund.rate, data.refund.deductible)}
        </Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 3, alignItems: 'baseline' }}>
          <Fact label="Sale price" value={formatCurrency(data.refund.sale_price)} />
          <Fact label="Claimed (missing + broken)" value={`${formatCurrency(data.refund.claimed_retail)} · ${pctText(data.refund.claimed_pct)}`} />
          <Fact label="Not refunded (first part)" value={formatCurrency(data.refund.not_refunded_retail)} />
          <Fact label="Refundable share of sale" value={`${data.refund.refundable_share.toFixed(2)}%`} />
          <Fact label="Expect back" value={formatCurrency(data.refund.amount)} strong />
          {Number(t.adjusted_refund) > 0 ? (
            <Fact label="Already adjusted (unfulfilled)" value={formatCurrency(t.adjusted_refund)} />
          ) : null}
        </Box>
      </Paper>

      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>Unfulfilled lines</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          B-Stock or seller adjustments, before or after arrival. They come off what the truck should have held, so they
          are not counted missing.
        </Typography>
        {!finalized ? <AdjustmentForm orderId={orderId} onSaved={onSaved} /> : null}
        {data.adjustments.length > 0 ? (
          <Table size="small" sx={{ mt: 1 }}>
            <TableHead>
              <TableRow>
                <TableCell>Line</TableCell>
                <TableCell>Item</TableCell>
                <TableCell align="right">Units</TableCell>
                <TableCell>When</TableCell>
                <TableCell align="right">Refund</TableCell>
                <TableCell>Note</TableCell>
                <TableCell>By</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {data.adjustments.map((a) => (
                <TableRow key={a.id}>
                  <TableCell>{a.row_number}</TableCell>
                  <TableCell sx={{ maxWidth: 360 }}>{a.title}</TableCell>
                  <TableCell align="right">{a.units}</TableCell>
                  <TableCell>{a.timing === 'before_arrival' ? 'Before arrival' : 'After arrival'}</TableCell>
                  <TableCell align="right">{formatCurrency(a.refund_amount)}</TableCell>
                  <TableCell>{a.note}</TableCell>
                  <TableCell>{a.created_by}</TableCell>
                  <TableCell align="right">
                    {!finalized ? (
                      <IconButton size="small" aria-label="Remove adjustment" onClick={() => removeAdj.mutate(a.id)}>
                        <Close />
                      </IconButton>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : null}
      </Paper>

      <Paper variant="outlined" sx={{ p: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 800, flex: 1 }}>
            {allLines ? `All ${t.lines} manifest lines` : 'Lines with a problem'}
          </Typography>
          <FormControlLabel
            control={<Switch checked={allLines} onChange={(e) => setAllLines(e.target.checked)} />}
            label="All lines"
          />
        </Box>
        <Box sx={{ overflowX: 'auto' }}>
          <Table size="small" sx={{ '& td, & th': { whiteSpace: 'nowrap' } }}>
            <TableHead>
              <TableRow>
                <TableCell>Line</TableCell>
                <TableCell>Item</TableCell>
                <TableCell>Pallet</TableCell>
                <TableCell align="right">Unit $</TableCell>
                <TableCell align="right">Manifest</TableCell>
                <TableCell align="right">Unfulfilled</TableCell>
                <TableCell align="right">Received</TableCell>
                <TableCell align="right">Missing</TableCell>
                <TableCell align="right">Broken</TableCell>
                <TableCell align="right">Over</TableCell>
                <TableCell align="right">Missing $</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.lines.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={11} sx={{ color: 'text.secondary' }}>
                    No problems: every expected unit was checked in.
                  </TableCell>
                </TableRow>
              ) : (
                data.lines.map((l) => (
                  <TableRow key={l.manifest_row_id}>
                    <TableCell>{l.row_number}</TableCell>
                    <TableCell sx={{ maxWidth: 380, overflow: 'hidden', textOverflow: 'ellipsis' }} title={l.title}>
                      {l.title}
                    </TableCell>
                    <TableCell sx={{ fontFamily: 'monospace' }}>{l.pallet_code ? l.pallet_code.split(':').pop() : '-'}</TableCell>
                    <TableCell align="right">{formatCurrency(l.unit_retail)}</TableCell>
                    <TableCell align="right">{unitsText(l.units.manifest)}</TableCell>
                    <TableCell align="right">{l.units.unfulfilled ? unitsText(l.units.unfulfilled) : '-'}</TableCell>
                    <TableCell align="right">{unitsText(l.units.received)}</TableCell>
                    <TableCell align="right" sx={{ color: l.units.missing ? 'error.main' : undefined, fontWeight: l.units.missing ? 700 : 400 }}>
                      {l.units.missing ? unitsText(l.units.missing) : '-'}
                    </TableCell>
                    <TableCell align="right">{l.units.broken ? unitsText(l.units.broken) : '-'}</TableCell>
                    <TableCell align="right">{l.units.over ? unitsText(l.units.over) : '-'}</TableCell>
                    <TableCell align="right">{l.units.missing ? formatCurrency(l.retail.missing) : '-'}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Box>
      </Paper>

      <ConfirmDialog
        open={confirm != null}
        title={confirm === 'reopen' ? 'Reopen this truck?' : 'Mark this truck finalized?'}
        message={
          confirm === 'reopen'
            ? 'Adjustments can be changed again. The last finalize numbers stay on record until it is finalized again.'
            : `This freezes today's numbers: missing ${unitsText(t.units.missing)} units (${formatCurrencyWhole(t.retail.missing)}), expect back ${formatCurrency(data.refund.amount)}.${warnings.length ? ` Note: ${warnings.join(' ')}` : ''}`
        }
        confirmLabel={confirm === 'reopen' ? 'Reopen' : 'Mark finalized'}
        confirmColor={confirm === 'reopen' ? 'warning' : 'success'}
        loading={step.isPending}
        onConfirm={() => confirm && step.mutate(confirm)}
        onCancel={() => setConfirm(null)}
      />
    </Box>
  );
}

function Fact({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontWeight: 800, textTransform: 'uppercase', fontSize: '0.62rem' }}>
        {label}
      </Typography>
      <Typography sx={{ fontSize: strong ? 22 : 16, fontWeight: strong ? 900 : 700, color: strong ? 'success.main' : undefined }}>
        {value}
      </Typography>
    </Box>
  );
}

function AdjustmentForm({ orderId, onSaved }: { orderId: number; onSaved: (d: TruckFinalizeDTO) => void }) {
  const { enqueueSnackbar } = useSnackbar();
  const [rowNumber, setRowNumber] = useState('');
  const [units, setUnits] = useState('');
  const [timing, setTiming] = useState<TruckAdjustmentPayload['timing']>('before_arrival');
  const [refund, setRefund] = useState('');
  const [note, setNote] = useState('');
  const add = useMutation({
    mutationFn: async (body: TruckAdjustmentPayload) => (await addTruckAdjustment(orderId, body)).data,
    onSuccess: (fresh) => {
      onSaved(fresh);
      setRowNumber('');
      setUnits('');
      setRefund('');
      setNote('');
    },
    onError: (err) => enqueueSnackbar(errDetail(err, 'Could not add it.'), { variant: 'error' }),
  });
  const ready = /^\d+$/.test(rowNumber) && /^\d+$/.test(units) && Number(units) > 0;
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center' }}>
      <TextField size="small" label="Manifest line #" value={rowNumber} onChange={(e) => setRowNumber(e.target.value.trim())} sx={{ width: 130 }} />
      <TextField size="small" label="Units" value={units} onChange={(e) => setUnits(e.target.value.trim())} sx={{ width: 90 }} />
      <TextField select size="small" label="When" value={timing} onChange={(e) => setTiming(e.target.value as TruckAdjustmentPayload['timing'])} sx={{ width: 160 }}>
        <MenuItem value="before_arrival">Before arrival</MenuItem>
        <MenuItem value="after_arrival">After arrival</MenuItem>
      </TextField>
      <TextField size="small" label="Refund $ (if known)" value={refund} onChange={(e) => setRefund(e.target.value.trim())} sx={{ width: 150 }} />
      <TextField size="small" label="Note" value={note} onChange={(e) => setNote(e.target.value)} sx={{ flex: 1, minWidth: 180 }} />
      <Button
        variant="outlined"
        disabled={!ready || add.isPending}
        onClick={() =>
          add.mutate({
            row_number: Number(rowNumber),
            units: Number(units),
            timing,
            ...(refund ? { refund_amount: refund } : {}),
            ...(note.trim() ? { note: note.trim() } : {}),
          })
        }
      >
        Add unfulfilled
      </Button>
    </Box>
  );
}
