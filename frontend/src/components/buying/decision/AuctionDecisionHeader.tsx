import ChevronLeft from '@mui/icons-material/ChevronLeft';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import RefreshRounded from '@mui/icons-material/RefreshRounded';
import StarBorderIcon from '@mui/icons-material/StarBorder';
import StarIcon from '@mui/icons-material/Star';
import {
  Box,
  Button,
  ButtonBase,
  CircularProgress,
  InputAdornment,
  Link as MuiLink,
  Paper,
  Skeleton,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { useSnackbar } from 'notistack';
import { useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { patchBuyingAuctionBuyer } from '../../../api/buying.api';
import type { AuctionDecision, BuyingAuctionDetail } from '../../../types/buying.types';
import { formatCurrencyWhole } from '../../../utils/format';
import { ScoreBadge } from './ScoreBadge';

function useCountdown(end: string | null | undefined): { text: string; seconds: number | null } {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  if (!end) return { text: '-', seconds: null };
  const left = Math.floor((parseISO(end).getTime() - now) / 1000);
  if (left <= 0) return { text: 'Ended', seconds: 0 };
  const d = Math.floor(left / 86400);
  const h = Math.floor((left % 86400) / 3600);
  const m = Math.floor((left % 3600) / 60);
  const s = left % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return { text: d > 0 ? `${d}d ${h}h ${pad(m)}m` : `${h}:${pad(m)}:${pad(s)}`, seconds: left };
}

function Tier({ label, value, active, onPick }: { label: string; value: string | null; active: boolean; onPick: () => void }) {
  return (
    <ButtonBase
      disabled={!value}
      onClick={onPick}
      sx={{
        flex: 1,
        minWidth: 0,
        px: 1,
        py: 0.5,
        borderRadius: 1,
        border: 1,
        borderColor: active ? 'primary.main' : 'divider',
        bgcolor: active ? 'action.selected' : 'transparent',
        display: 'block',
        textAlign: 'left',
      }}
    >
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.2 }}>
        {label}
      </Typography>
      <Typography variant="body2" sx={{ fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
        {value ? formatCurrencyWhole(value) : '-'}
      </Typography>
    </ButtonBase>
  );
}

function facts(detail: BuyingAuctionDetail, decision: AuctionDecision | undefined): string {
  const parts: string[] = [];
  if (detail.pallet_count) parts.push(`${detail.pallet_count} pallet${detail.pallet_count === 1 ? '' : 's'}`);
  const units = decision?.units || detail.lot_size;
  if (units) parts.push(`${units} items`);
  const retail = decision?.retail ?? detail.total_retail_value;
  if (retail) parts.push(`${formatCurrencyWhole(retail)} retail`);
  parts.push(detail.manifest_row_count ? `manifest: ${detail.manifest_row_count} lines` : 'no manifest yet');
  return parts.join(' · ');
}

/**
 * The top of the auction page, decision first: what it is, when it ends, where the bid is,
 * and your max (typed, or one of the model's three tiers), then the one-line verdict with
 * the score and the actions (watch, refresh from B-Stock, pass).
 */
export default function AuctionDecisionHeader({
  detail,
  decision,
  watched,
  watchlistBusy,
  onToggleWatchlist,
  onRefresh,
  refreshing,
  onPass,
  passing,
}: {
  detail: BuyingAuctionDetail;
  decision: AuctionDecision | undefined;
  watched: boolean;
  watchlistBusy: boolean;
  onToggleWatchlist: () => void;
  onRefresh: () => void;
  refreshing: boolean;
  onPass: () => void;
  passing: boolean;
}) {
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const countdown = useCountdown(detail.end_time);
  const bids = decision?.bids;
  const [maxInput, setMaxInput] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (bids?.max_bid) setMaxInput(String(Math.round(Number.parseFloat(bids.max_bid))));
  }, [bids?.max_bid]);

  const saveMax = useMutation({
    mutationFn: (value: string) => patchBuyingAuctionBuyer(detail.id, { max_bid: value }),
    onSuccess: () => {
      setSaved(true);
      void queryClient.invalidateQueries({ queryKey: ['buying'] });
    },
    onError: () => enqueueSnackbar('Could not save your max.', { variant: 'error' }),
  });

  const urgent = countdown.seconds != null && countdown.seconds > 0 && countdown.seconds < 3 * 3600;
  const meta = [
    detail.marketplace?.name,
    detail.origin_city,
    detail.condition_summary,
    detail.lot_id ? `Lot ${detail.lot_id}` : '',
  ].filter(Boolean).join(' · ');

  return (
    <Box sx={{ mb: 2 }}>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1fr) auto' }, gap: 2, alignItems: 'start', mb: 1.5 }}>
        <Box sx={{ minWidth: 0 }}>
          <MuiLink component={RouterLink} to="/buying/wishlist" underline="hover" sx={{ display: 'inline-flex', alignItems: 'center', fontWeight: 700, mb: 0.5 }}>
            <ChevronLeft fontSize="small" /> Today&apos;s best
          </MuiLink>
          <Typography variant="body2" color="text.secondary">{meta}</Typography>
          <Typography variant="h4" component="h1" sx={{ fontWeight: 800, lineHeight: 1.2, my: 0.5, wordBreak: 'break-word' }}>
            {detail.url ? (
              <Box component="a" href={detail.url} target="_blank" rel="noopener noreferrer" sx={{ color: 'inherit', textDecoration: 'none', '&:hover': { color: 'primary.main' } }}>
                {detail.title}
                <OpenInNewIcon sx={{ fontSize: '0.6em', ml: 0.75, verticalAlign: '0.1em' }} aria-hidden />
              </Box>
            ) : detail.title}
          </Typography>
          <Typography variant="body1" color="text.secondary">{facts(detail, decision)}</Typography>
        </Box>

        <Paper variant="outlined" sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: 'auto auto minmax(300px, auto)' }, overflow: 'hidden' }}>
          <Box sx={{ p: 1.75, borderRight: 1, borderColor: 'divider' }}>
            <Typography variant="body2" color="text.secondary">Ends in</Typography>
            <Typography variant="h4" sx={{ fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: urgent ? 'warning.dark' : 'text.primary' }}>
              {countdown.text}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {detail.end_time ? format(parseISO(detail.end_time), 'EEE h:mm a') : ''}
            </Typography>
          </Box>
          <Box sx={{ p: 1.75, borderRight: { sm: 1 }, borderColor: 'divider' }}>
            <Typography variant="body2" color="text.secondary">Current bid</Typography>
            <Typography variant="h4" sx={{ fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
              {formatCurrencyWhole(detail.current_price)}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {detail.bid_count != null ? `${detail.bid_count} bids` : ''}
            </Typography>
          </Box>
          <Box sx={{ p: 1.75, gridColumn: { xs: '1 / -1', sm: 'auto' }, borderTop: { xs: 1, sm: 0 }, borderColor: 'divider' }}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
              Your max bid {bids && !bids.max_is_buyer ? '(the model’s)' : ''}
            </Typography>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
              <TextField
                size="small"
                value={maxInput}
                onChange={(e) => {
                  setMaxInput(e.target.value.replace(/[^0-9.]/g, ''));
                  setSaved(false);
                }}
                inputMode="decimal"
                slotProps={{ input: { startAdornment: <InputAdornment position="start">$</InputAdornment> }, htmlInput: { 'aria-label': 'Your max bid' } }}
                sx={{ width: 130 }}
              />
              <Button
                variant="contained"
                disabled={!maxInput || saveMax.isPending}
                onClick={() => saveMax.mutate(maxInput)}
              >
                Set max
              </Button>
              {saved ? <Typography variant="caption" color="success.main">Saved</Typography> : null}
              {bids?.max_is_buyer && !saved ? (
                // Back to the model's max: a blank max clears the buyer's own.
                <Button size="small" color="inherit" disabled={saveMax.isPending} onClick={() => saveMax.mutate('')}>
                  Use the model&apos;s
                </Button>
              ) : null}
            </Stack>
            {bids ? (
              <Stack direction="row" spacing={0.75}>
                <Tier label="Comfortable" value={bids.comfortable} active={false} onPick={() => bids.comfortable && setMaxInput(String(Math.round(Number.parseFloat(bids.comfortable))))} />
                <Tier label="Model max" value={bids.model} active={!bids.max_is_buyer} onPick={() => bids.model && setMaxInput(String(Math.round(Number.parseFloat(bids.model))))} />
                <Tier label="Stretch" value={bids.stretch} active={false} onPick={() => bids.stretch && setMaxInput(String(Math.round(Number.parseFloat(bids.stretch))))} />
              </Stack>
            ) : (
              <Skeleton variant="rounded" height={44} />
            )}
          </Box>
        </Paper>
      </Box>

      <Paper
        variant="outlined"
        sx={{ p: 1.5, display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: { xs: 'wrap', md: 'nowrap' }, bgcolor: 'action.hover', borderColor: 'transparent' }}
      >
        {decision ? <ScoreBadge score={decision.score} size={48} /> : <Skeleton variant="circular" width={48} height={48} />}
        <Typography variant="body1" sx={{ flex: 1, minWidth: 240 }}>
          {decision ? (() => {
            const [first, ...rest] = decision.verdict.split('. ');
            return (
              <>
                <b>{first}{rest.length ? '.' : ''}</b> {rest.join('. ')}
              </>
            );
          })() : <Skeleton width="80%" />}
        </Typography>
        <Stack direction="row" spacing={1} sx={{ flexShrink: 0 }}>
          <Button
            variant="outlined"
            startIcon={watchlistBusy ? <CircularProgress size={16} /> : watched ? <StarIcon /> : <StarBorderIcon />}
            color={watched ? 'warning' : 'primary'}
            onClick={onToggleWatchlist}
            disabled={watchlistBusy}
          >
            {watched ? 'Watching' : 'Watch'}
          </Button>
          <Button variant="outlined" startIcon={refreshing ? <CircularProgress size={16} /> : <RefreshRounded />} onClick={onRefresh} disabled={refreshing}>
            Refresh
          </Button>
          <Button variant="outlined" color="inherit" onClick={onPass} disabled={passing}>
            {detail.archived_at ? 'Unpass' : 'Pass'}
          </Button>
        </Stack>
      </Paper>
    </Box>
  );
}
