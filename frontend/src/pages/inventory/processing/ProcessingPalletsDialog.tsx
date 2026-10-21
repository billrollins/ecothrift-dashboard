import { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { useSnackbar } from 'notistack';
import type { TruckPalletDTO, TruckPalletLedgerDTO, TruckPalletStep } from '../../../api/truckPallets.api';
import { useTruckPalletStep } from '../../../hooks/useTruckPallets';
import { IconClose as Close } from '../../../icons/ecoIcons';
import { formatCurrencyWhole } from '../../../utils/format';
import { currentPallet, fmtPct, fmtUnits, missingHeadline, missingPct, missingTone } from './palletLedgerDisplay';
import { processingTokens } from './processingTokens';

const TONE_COLOR = {
  default: processingTokens.textStrong,
  good: processingTokens.accentGreen,
  warning: processingTokens.accentAmber,
  error: processingTokens.accentRed,
} as const;

const STATUS_LABEL: Record<TruckPalletDTO['status'], string> = {
  waiting: 'Not started',
  processing: 'Processing',
  done: 'Done',
};

export interface ProcessingPalletsDialogProps {
  open: boolean;
  onClose: () => void;
  orderId: number;
  ledger: TruckPalletLedgerDTO | undefined;
  /** Filter the queue to one pallet's manifest lines (searches the pallet id). */
  onShowRows: (code: string) => void;
}

export function ProcessingPalletsDialog({ open, onClose, orderId, ledger, onShowRows }: ProcessingPalletsDialogProps) {
  const { enqueueSnackbar } = useSnackbar();
  const step = useTruckPalletStep(orderId);
  const [scan, setScan] = useState('');
  const cur = currentPallet(ledger);
  const running = missingHeadline(ledger);

  const run = (s: TruckPalletStep, body: { pallet_id?: number; code?: string }, okMsg?: string) => {
    step.mutate(
      { step: s, ...body },
      {
        onSuccess: () => {
          if (okMsg) enqueueSnackbar(okMsg, { variant: 'success' });
          setScan('');
        },
        onError: (err) => {
          const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
          enqueueSnackbar(detail || 'Could not update the pallet.', { variant: 'error' });
        },
      },
    );
  };

  const startScanned = () => {
    const code = scan.trim();
    if (code) run('start', { code }, 'Pallet started. Check-ins go to it now.');
  };

  const truck = ledger?.truck;

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="lg">
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: 800 }}>
            Truck pallets
          </Typography>
          <Typography variant="h6" sx={{ lineHeight: 1.2 }}>
            Received vs manifest, pallet by pallet
          </Typography>
        </Box>
        <Button component={RouterLink} to={`/inventory/orders/${orderId}/truck`} size="small">
          Finish truck
        </Button>
        <IconButton aria-label="Close pallets" onClick={onClose}>
          <Close />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1, mb: 2 }}>
          <TextField
            size="small"
            label="Scan or type a pallet label"
            value={scan}
            onChange={(e) => setScan(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') startScanned();
            }}
            sx={{ minWidth: 260 }}
            autoFocus
          />
          <Button variant="contained" onClick={startScanned} disabled={!scan.trim() || step.isPending}>
            Start pallet
          </Button>
          <Box sx={{ flex: 1 }} />
          {cur ? (
            <>
              <Typography variant="body2">
                Processing <b>{cur.label}</b> (#{cur.number})
              </Typography>
              <Button
                variant="outlined"
                color="success"
                disabled={step.isPending}
                onClick={() => run('finish', { pallet_id: cur.id }, `Pallet ${cur.label} finished.`)}
              >
                Finish pallet
              </Button>
            </>
          ) : (
            <Typography variant="body2" color="text.secondary">
              No pallet started. Check-ins use each line's manifest pallet until you start one.
            </Typography>
          )}
        </Box>

        {ledger && !ledger.has_manifest_pallets ? (
          <Alert severity="info" sx={{ mb: 2 }}>
            This manifest has no pallet ids, so missing per pallet is unknown until the truck is done. Items still record
            the pallet they came off.
          </Alert>
        ) : null}

        {truck ? (
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 3, mb: 2 }}>
            <Fact label="Manifest" value={`${fmtUnits(truck.manifest_units)} units`} sub={formatCurrencyWhole(truck.manifest_retail)} />
            <Fact label="Received so far" value={`${fmtUnits(truck.received_units)} units`} sub={formatCurrencyWhole(truck.received_retail)} />
            <Fact
              label="Missing, finished pallets"
              value={running.value}
              sub={running.helper}
              color={TONE_COLOR[running.tone]}
            />
            <Fact label="Added (not on manifest)" value={fmtUnits(truck.added_units)} sub="units" />
            <Fact label="Pallets" value={`${ledger?.pallets_done ?? 0}/${ledger?.pallets_total ?? 0} done`} sub={`${ledger?.pallets_arrived ?? 0} arrived`} />
          </Box>
        ) : null}

        <Table size="small" sx={{ '& td, & th': { whiteSpace: 'nowrap' } }}>
          <TableHead>
            <TableRow>
              <TableCell>#</TableCell>
              <TableCell>Pallet</TableCell>
              <TableCell>Status</TableCell>
              <TableCell align="right">Manifest</TableCell>
              <TableCell align="right">Received</TableCell>
              <TableCell align="right">Missing</TableCell>
              <TableCell align="right">Broken</TableCell>
              <TableCell align="right">Added</TableCell>
              <TableCell align="right">
                <Tooltip title="Units checked in on this pallet whose manifest line belongs to another pallet.">
                  <span>From other pallets</span>
                </Tooltip>
              </TableCell>
              <TableCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {(ledger?.pallets ?? []).map((p) => {
              const pct = missingPct(p);
              const tone = p.status === 'done' ? missingTone(pct) : 'default';
              const isCur = cur?.id === p.id;
              return (
                <TableRow key={p.id} selected={isCur}>
                  <TableCell sx={{ fontFamily: processingTokens.monoFontFamily }}>{p.number}</TableCell>
                  <TableCell>
                    <Tooltip title={p.code || 'No label recorded'}>
                      <Typography variant="body2" sx={{ fontFamily: processingTokens.monoFontFamily, fontWeight: 700 }}>
                        {p.code ? p.label : '-'}
                      </Typography>
                    </Tooltip>
                  </TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      label={STATUS_LABEL[p.status]}
                      color={p.status === 'done' ? 'success' : p.status === 'processing' ? 'primary' : 'default'}
                      variant={p.status === 'waiting' ? 'outlined' : 'filled'}
                    />
                  </TableCell>
                  <TableCell align="right">
                    {ledger?.has_manifest_pallets ? `${fmtUnits(p.manifest_units)} · ${formatCurrencyWhole(p.manifest_retail)}` : '-'}
                  </TableCell>
                  <TableCell align="right">
                    {ledger?.has_manifest_pallets ? fmtUnits(p.received_units) : `${fmtUnits(p.checked_in_units)} in`}
                  </TableCell>
                  <TableCell align="right" sx={{ color: TONE_COLOR[tone], fontWeight: p.status === 'done' ? 700 : 400 }}>
                    {ledger?.has_manifest_pallets
                      ? `${fmtUnits(p.missing_units)} · ${formatCurrencyWhole(p.missing_retail)} · ${fmtPct(pct)}`
                      : '-'}
                  </TableCell>
                  <TableCell align="right">{p.broken_units || '-'}</TableCell>
                  <TableCell align="right">{p.added_units || '-'}</TableCell>
                  <TableCell align="right">{p.from_other_pallets_units || '-'}</TableCell>
                  <TableCell align="right">
                    <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end' }}>
                      {p.code && ledger?.has_manifest_pallets ? (
                        <Button
                          size="small"
                          onClick={() => {
                            onShowRows(p.code);
                            onClose();
                          }}
                        >
                          Rows
                        </Button>
                      ) : null}
                      {p.status === 'done' ? (
                        <Button size="small" disabled={step.isPending} onClick={() => run('reopen', { pallet_id: p.id })}>
                          Reopen
                        </Button>
                      ) : isCur ? (
                        <Button size="small" color="success" disabled={step.isPending} onClick={() => run('finish', { pallet_id: p.id })}>
                          Finish
                        </Button>
                      ) : (
                        <Button size="small" disabled={step.isPending} onClick={() => run('start', { pallet_id: p.id })}>
                          Start
                        </Button>
                      )}
                    </Box>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        {ledger?.unassigned ? (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
            {fmtUnits(ledger.unassigned.manifest_units)} manifest units have no pallet id (missing so far:{' '}
            {fmtUnits(ledger.unassigned.missing_units)}).
          </Typography>
        ) : null}
        {truck && truck.units_without_pallet > 0 ? (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
            {fmtUnits(truck.units_without_pallet)} units were checked in before pallets were tracked.
          </Typography>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function Fact({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', textTransform: 'uppercase', letterSpacing: 0.7, fontWeight: 800, fontSize: '0.6rem' }}>
        {label}
      </Typography>
      <Typography sx={{ fontSize: 18, fontWeight: 900, fontVariantNumeric: 'tabular-nums', color }}>{value}</Typography>
      {sub ? (
        <Typography variant="caption" color="text.secondary">
          {sub}
        </Typography>
      ) : null}
    </Box>
  );
}
