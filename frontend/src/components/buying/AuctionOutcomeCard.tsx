import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Link as MuiLink,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { useSnackbar } from 'notistack';
import { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { postBuyingAuctionLost, postBuyingAuctionWon } from '../../api/buying.api';
import type { BuyingAuctionDetail, ReportCard } from '../../types/buying.types';
import { formatCurrencyWhole } from '../../utils/format';

function errorText(err: unknown): string {
  if (isAxiosError(err) && typeof err.response?.data?.detail === 'string') return err.response.data.detail;
  return 'Could not save that.';
}

function Row({ label, predicted, actual }: { label: string; predicted: string; actual: string }) {
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: 1, py: 0.5, borderTop: 1, borderColor: 'divider' }}>
      <Typography variant="body2" color="text.secondary">{label}</Typography>
      <Typography variant="body2" sx={{ fontVariantNumeric: 'tabular-nums' }}>{predicted}</Typography>
      <Typography variant="body2" sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>{actual}</Typography>
    </Box>
  );
}

/** Predicted at the win vs what the PO's items actually did. */
export function ReportCardView({ card }: { card: ReportCard }) {
  const p = card.predicted;
  const a = card.actual;
  return (
    <Box>
      <Stack direction="row" spacing={1} alignItems="baseline" sx={{ mb: 0.5 }}>
        <Typography variant="overline" sx={{ fontWeight: 800, letterSpacing: '0.1em' }}>
          Report card
        </Typography>
        <MuiLink component={RouterLink} to={`/inventory/orders/${card.purchase_order_id}`} variant="body2">
          PO {card.order_number}
        </MuiLink>
        <Typography variant="caption" color="text.secondary">{card.po_status}</Typography>
        <MuiLink component={RouterLink} to="/buying/report-cards" variant="caption" sx={{ ml: 'auto !important' }}>
          All report cards
        </MuiLink>
      </Stack>
      <Box sx={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: 1, pb: 0.5 }}>
        <span />
        <Typography variant="caption" color="text.secondary">Predicted</Typography>
        <Typography variant="caption" color="text.secondary">Actual so far</Typography>
      </Box>
      <Row label="Revenue" predicted={formatCurrencyWhole(p.revenue)} actual={formatCurrencyWhole(a.revenue)} />
      <Row label="Profit" predicted={formatCurrencyWhole(p.profit)} actual={formatCurrencyWhole(a.profit_so_far)} />
      <Row
        label="Days to sell"
        predicted={p.days_to_sell != null ? `${p.days_to_sell}` : '-'}
        actual={a.avg_days_to_sell != null ? `${a.avg_days_to_sell}` : '-'}
      />
      <Row
        label="Items"
        predicted={p.units != null ? `${p.units}` : '-'}
        actual={`${a.items} made · ${a.sold} sold${a.sell_through_pct != null ? ` (${a.sell_through_pct}%)` : ''}`}
      />
      {card.revenue_vs_predicted_pct != null ? (
        <Typography variant="body2" sx={{ mt: 1 }}>
          So far it made <b>{card.revenue_vs_predicted_pct}%</b> of the predicted revenue
          {a.on_shelf ? `, with ${a.on_shelf} items still on the shelf (${formatCurrencyWhole(a.shelf_value)} priced)` : ''}.
        </Typography>
      ) : null}
    </Box>
  );
}

/**
 * Buying Phase 6 on the auction page: record the result. "We won it" creates the PO with the
 * manifest already on it (no second upload); the report card then shows predicted vs actual.
 */
export default function AuctionOutcomeCard({ detail }: { detail: BuyingAuctionDetail }) {
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const [dialog, setDialog] = useState<'won' | 'lost' | null>(null);
  const [hammer, setHammer] = useState('');
  const [fees, setFees] = useState('');
  const [shipping, setShipping] = useState('');

  const save = useMutation({
    mutationFn: () =>
      dialog === 'won'
        ? postBuyingAuctionWon(detail.id, {
            hammer_price: hammer,
            fees: fees.trim() || undefined,
            shipping: shipping.trim() || undefined,
          })
        : postBuyingAuctionLost(detail.id, { hammer_price: hammer.trim() || undefined }),
    onSuccess: (data) => {
      setDialog(null);
      void queryClient.invalidateQueries({ queryKey: ['buying'] });
      if (data.purchase_order_number) {
        enqueueSnackbar(`Won. PO ${data.purchase_order_number} is made${data.won_note ? '' : ' with the manifest on it'}.`, {
          variant: 'success',
        });
        if (data.won_note) enqueueSnackbar(data.won_note, { variant: 'warning' });
      } else {
        enqueueSnackbar('Saved.', { variant: 'success' });
      }
    },
    onError: (err) => enqueueSnackbar(errorText(err), { variant: 'error' }),
  });

  const open = (kind: 'won' | 'lost') => {
    setHammer(detail.current_price ?? '');
    setFees('');
    setShipping('');
    setDialog(kind);
  };

  return (
    <Paper variant="outlined" sx={{ p: 1.5, mb: 2 }}>
      {detail.report_card ? (
        <ReportCardView card={detail.report_card} />
      ) : detail.outcome && !detail.outcome.win ? (
        <Typography variant="body2">
          Lost{detail.outcome.hammer_price ? ` at ${formatCurrencyWhole(detail.outcome.hammer_price)}` : ''}.
        </Typography>
      ) : (
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }}>
          <Typography variant="body2" sx={{ flex: 1 }}>
            Did we win it? A win makes the PO with this manifest already on it.
          </Typography>
          <Button variant="contained" onClick={() => open('won')}>
            We won it
          </Button>
          <Button variant="outlined" onClick={() => open('lost')}>
            We lost it
          </Button>
        </Stack>
      )}

      <Dialog open={dialog !== null} onClose={() => setDialog(null)} maxWidth="xs" fullWidth>
        <DialogTitle>{dialog === 'won' ? 'We won it' : 'We lost it'}</DialogTitle>
        <DialogContent>
          <Stack spacing={1.5} sx={{ mt: 1 }}>
            <TextField
              label={dialog === 'won' ? 'Winning price' : 'Closing price (if you know it)'}
              value={hammer}
              onChange={(e) => setHammer(e.target.value)}
              inputMode="decimal"
              autoFocus
              fullWidth
            />
            {dialog === 'won' ? (
              <>
                <TextField
                  label="Fees"
                  placeholder="Blank: the seller's fee % on the price"
                  value={fees}
                  onChange={(e) => setFees(e.target.value)}
                  inputMode="decimal"
                  fullWidth
                />
                <TextField
                  label="Shipping"
                  placeholder={`Blank: ${formatCurrencyWhole(detail.estimated_shipping)} (our estimate or quote)`}
                  value={shipping}
                  onChange={(e) => setShipping(e.target.value)}
                  inputMode="decimal"
                  fullWidth
                />
                <Alert severity="info">
                  This makes a purchase order ({detail.manifest_row_count ? `${detail.manifest_row_count} manifest lines` : 'no manifest yet'})
                  in Ordered, ready for preprocessing.
                </Alert>
              </>
            ) : null}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialog(null)}>Cancel</Button>
          <Button
            variant="contained"
            disabled={save.isPending || (dialog === 'won' && !(Number.parseFloat(hammer) > 0))}
            onClick={() => save.mutate()}
          >
            Save
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
}
