import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  Autocomplete,
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  InputAdornment,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import { useSnackbar } from 'notistack';
import { useGoogleReviewUsernames } from '../../hooks/usePOS';
import type { Cart, CartLine } from '../../types/pos.types';
import {
  DISCOUNT_REASON_GOOGLE_REVIEW,
  DISCOUNT_REASON_OTHER,
  DISCOUNT_REASON_STORE_CREDIT,
  GOOGLE_REVIEW_MAX_DOLLARS,
  GOOGLE_REVIEW_PERCENT,
  GOOGLE_REVIEWS_URL,
  applyGoogleReviewCap,
  discountBase,
  discountableLines,
  dollarsFromPercent,
  formatDiscountCurrency,
  percentFromDollars,
  type DiscountApplyTo,
  type DiscountInputMode,
} from './discountUtils';
import { IconOpenExternal as OpenInNew } from '../../icons/ecoIcons';

export interface DiscountSubmitPayload {
  mode: DiscountInputMode;
  amount?: number;
  percent?: number;
  reason: string;
  target_line_id: number | null;
  /** Several items at once (Dash Updates #30): a percent off each, one discount line per item. */
  target_line_ids?: number[];
  google_review_username?: string;
  google_review_stars?: number;
}

interface DiscountDialogProps {
  open: boolean;
  cart: Cart | null;
  pending: boolean;
  onClose: () => void;
  onSubmit: (payload: DiscountSubmitPayload) => Promise<void>;
}

function parsePositive(raw: string): number | null {
  const n = parseFloat(raw);
  if (Number.isNaN(n) || n <= 0) return null;
  return n;
}

export function DiscountDialog({ open, cart, pending, onClose, onSubmit }: DiscountDialogProps) {
  const { enqueueSnackbar } = useSnackbar();
  const { data: pastUsernames = [] } = useGoogleReviewUsernames(open);
  // No default reason (2026-10-21, REG-27): "In-store credit (return)" was preset, so a discount stood in for a return.
  const [reasonPreset, setReasonPreset] = useState('');
  const [reasonNote, setReasonNote] = useState('');
  const [reviewUsername, setReviewUsername] = useState('');
  const [reviewStars, setReviewStars] = useState(5);
  const [mode, setMode] = useState<DiscountInputMode>('amount');
  const [amount, setAmount] = useState('');
  const [percent, setPercent] = useState('');
  const [targetLineId, setTargetLineId] = useState<DiscountApplyTo | 'several'>('ticket');
  // "Several items" (Carrie, Dash Updates #30): the lines picked for a percent off each.
  const [picked, setPicked] = useState<number[]>([]);

  useEffect(() => {
    if (!open) return;
    setReasonPreset('');
    setReasonNote('');
    setReviewUsername('');
    setReviewStars(5);
    setMode('amount');
    setAmount('');
    setPercent('');
    setTargetLineId('ticket');
    setPicked([]);
  }, [open]);

  const lines = cart?.lines ?? [];
  const itemLines = discountableLines(lines);
  const several = targetLineId === 'several';
  const pickedLines = itemLines.filter((ln) => picked.includes(ln.id));
  const base = several
    ? pickedLines.reduce((sum, ln) => sum + Number(ln.line_total), 0)
    : discountBase(lines, targetLineId);
  const isGoogleReview = reasonPreset === DISCOUNT_REASON_GOOGLE_REVIEW;

  const applyGooglePreset = () => {
    setMode('percent');
    setPercent(String(GOOGLE_REVIEW_PERCENT));
    setTargetLineId('ticket');
  };

  const derivedDollars = useMemo(() => {
    const p = parsePositive(percent);
    if (p == null) return '';
    // Several items: each line's own percent, rounded per line, as the register adds them.
    let dollars = several
      ? pickedLines.reduce((sum, ln) => sum + dollarsFromPercent(p, Number(ln.line_total)), 0)
      : dollarsFromPercent(p, base);
    if (isGoogleReview) dollars = applyGoogleReviewCap(dollars, base);
    if (dollars <= 0) return '';
    return dollars.toFixed(2);
  }, [percent, base, isGoogleReview, several, pickedLines]);

  const derivedPercent = useMemo(() => {
    const d = parsePositive(amount);
    if (d == null || base <= 0) return '';
    let dollars = d;
    if (isGoogleReview) dollars = applyGoogleReviewCap(dollars, base);
    if (dollars <= 0) return '';
    return String(percentFromDollars(dollars, base));
  }, [amount, base, isGoogleReview]);

  const previewDollars = mode === 'percent' ? Number(derivedDollars || 0) : (() => {
    const d = parsePositive(amount);
    if (d == null) return 0;
    return isGoogleReview ? applyGoogleReviewCap(d, base) : d;
  })();

  const previewPercent = base > 0 && previewDollars > 0 ? percentFromDollars(previewDollars, base) : 0;

  const switchMode = (next: DiscountInputMode) => {
    if (next === mode) return;
    if (next === 'amount') {
      if (derivedDollars) setAmount(derivedDollars);
    } else if (derivedPercent) {
      setPercent(derivedPercent);
    }
    setMode(next);
  };

  const handleReason = (next: string) => {
    setReasonPreset(next);
    if (next === DISCOUNT_REASON_GOOGLE_REVIEW) {
      applyGooglePreset();
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const reason =
      reasonPreset === DISCOUNT_REASON_OTHER
        ? reasonNote.trim()
        : reasonPreset;
    if (!reason) {
      enqueueSnackbar('Pick a reason for the discount.', { variant: 'warning' });
      return;
    }
    if (reasonPreset === DISCOUNT_REASON_GOOGLE_REVIEW && !reviewUsername.trim()) {
      enqueueSnackbar('Enter the Google review username.', { variant: 'warning' });
      return;
    }

    const reviewFields =
      reasonPreset === DISCOUNT_REASON_GOOGLE_REVIEW
        ? {
            google_review_username: reviewUsername.trim(),
            google_review_stars: reviewStars,
          }
        : {};

    if (several) {
      const p = parsePositive(percent);
      if (pickedLines.length < 2) {
        enqueueSnackbar('Pick two or more items.', { variant: 'warning' });
        return;
      }
      if (p == null || p > 100) {
        enqueueSnackbar('Enter a percent greater than 0 and at most 100.', { variant: 'warning' });
        return;
      }
      await onSubmit({ mode: 'percent', percent: p, reason, target_line_id: null, target_line_ids: pickedLines.map((ln) => ln.id) });
      return;
    }

    if (mode === 'percent') {
      const p = parsePositive(percent);
      if (p == null || p > 100) {
        enqueueSnackbar('Enter a percent greater than 0 and at most 100.', { variant: 'warning' });
        return;
      }
      if (!derivedDollars || Number(derivedDollars) <= 0) {
        enqueueSnackbar('Add items before applying a percent discount.', { variant: 'warning' });
        return;
      }
      await onSubmit({
        mode: 'percent',
        percent: p,
        reason,
        target_line_id: typeof targetLineId === 'number' ? targetLineId : null,
        ...reviewFields,
      });
      return;
    }

    const d = parsePositive(amount);
    if (d == null) {
      enqueueSnackbar('Enter a discount amount greater than zero.', { variant: 'warning' });
      return;
    }
    await onSubmit({
      mode: 'amount',
      amount: d,
      reason,
      target_line_id: typeof targetLineId === 'number' ? targetLineId : null,
      ...reviewFields,
    });
  };

  const amountValue = mode === 'amount' ? amount : derivedDollars;
  const percentValue = mode === 'percent' ? percent : derivedPercent;
  const helper = isGoogleReview
    ? `Google Review: ${GOOGLE_REVIEW_PERCENT}% of the selected total, max $${GOOGLE_REVIEW_MAX_DOLLARS}.`
    : 'Applied as a negative line on the cart.';
  const applyHelper = several
    ? 'Several items take a percent off each, one line per item.'
    : mode === 'percent'
      ? 'Percent of the whole ticket, one line, or several items.'
      : 'Dollar off the whole ticket or of one line.';
  const previewText =
    previewDollars > 0
      ? `Takes ${formatDiscountCurrency(previewDollars)} off${previewPercent ? ` (${previewPercent}%)` : ''}.`
      : 'Takes $0.00 off.';
  const typedKey = reviewUsername.trim().toLowerCase();
  const matchedPast = pastUsernames.find((row) => row.username_key === typedKey);
  const usernameHelper = isGoogleReview
    ? matchedPast
      ? `Already redeemed (${matchedPast.stars ?? '?'} stars).`
      : 'As shown on their Google review. Matches as you type.'
    : reasonPreset === DISCOUNT_REASON_OTHER
      ? 'Required for Other.'
      : 'Username and stars are used for Google Review.';

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <form onSubmit={handleSubmit}>
        <DialogTitle>Discount / store credit</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <FormControl fullWidth>
              <InputLabel id="discount-reason-label">Reason</InputLabel>
              <Select
                labelId="discount-reason-label"
                label="Reason"
                autoFocus
                value={reasonPreset}
                onChange={(e) => handleReason(e.target.value)}
              >
                <MenuItem value={DISCOUNT_REASON_STORE_CREDIT}>
                  {DISCOUNT_REASON_STORE_CREDIT}
                </MenuItem>
                <MenuItem value={DISCOUNT_REASON_GOOGLE_REVIEW}>Google Review</MenuItem>
                <MenuItem value={DISCOUNT_REASON_OTHER}>Other</MenuItem>
              </Select>
            </FormControl>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <Autocomplete
                freeSolo
                options={isGoogleReview ? pastUsernames : []}
                getOptionLabel={(option) =>
                  typeof option === 'string' ? option : option.username
                }
                filterOptions={(opts, state) => {
                  const q = state.inputValue.trim().toLowerCase();
                  if (!q) return opts.slice(0, 20);
                  return opts.filter((row) => row.username.toLowerCase().includes(q));
                }}
                inputValue={isGoogleReview ? reviewUsername : reasonNote}
                onInputChange={(_, next) => {
                  if (isGoogleReview) setReviewUsername(next);
                  else setReasonNote(next);
                }}
                onChange={(_, next) => {
                  if (!isGoogleReview || typeof next === 'string' || next == null) return;
                  setReviewUsername(next.username);
                  if (next.stars != null) setReviewStars(next.stars);
                }}
                disabled={!isGoogleReview && reasonPreset !== DISCOUNT_REASON_OTHER}
                sx={{ flex: 2 }}
                renderOption={(props, option) => (
                  <li {...props} key={option.username_key}>
                    {option.username}
                    {option.stars != null ? ` · ${option.stars} stars` : ''}
                  </li>
                )}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label={isGoogleReview ? 'Google username' : 'Note'}
                    required={isGoogleReview || reasonPreset === DISCOUNT_REASON_OTHER}
                    helperText={usernameHelper}
                  />
                )}
              />
              <FormControl sx={{ flex: 1, minWidth: 120 }} disabled={!isGoogleReview}>
                <InputLabel id="discount-stars-label">Stars</InputLabel>
                <Select
                  labelId="discount-stars-label"
                  label="Stars"
                  value={reviewStars}
                  onChange={(e) => setReviewStars(Number(e.target.value))}
                >
                  <MenuItem value={1}>1</MenuItem>
                  <MenuItem value={2}>2</MenuItem>
                  <MenuItem value={3}>3</MenuItem>
                  <MenuItem value={4}>4</MenuItem>
                  <MenuItem value={5}>5</MenuItem>
                </Select>
              </FormControl>
            </Stack>
            <Box sx={{ minHeight: 37 }}>
              {isGoogleReview ? (
                <Button
                  type="button"
                  variant="outlined"
                  fullWidth
                  startIcon={<OpenInNew />}
                  onClick={() =>
                    window.open(GOOGLE_REVIEWS_URL, '_blank', 'noopener,noreferrer')
                  }
                >
                  Open Google reviews
                </Button>
              ) : null}
            </Box>
            <Stack spacing={0.75}>
              <Typography variant="caption" color="text.secondary">
                Type in
              </Typography>
              <ToggleButtonGroup
                exclusive
                fullWidth
                size="small"
                value={mode}
                onChange={(_, next: DiscountInputMode | null) => {
                  if (next) switchMode(next);
                }}
              >
                <ToggleButton value="amount" disabled={several} sx={{ textTransform: 'none' }}>
                  $
                </ToggleButton>
                <ToggleButton value="percent" sx={{ textTransform: 'none' }}>
                  %
                </ToggleButton>
              </ToggleButtonGroup>
            </Stack>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField
                label="Amount"
                type="number"
                required={mode === 'amount'}
                value={amountValue}
                onChange={(e) => setAmount(e.target.value)}
                slotProps={{
                  input: {
                    readOnly: mode !== 'amount',
                    startAdornment: <InputAdornment position="start">$</InputAdornment>,
                    inputProps: { min: 0.01, step: 0.01 },
                  },
                }}
                sx={{ flex: 1 }}
              />
              <TextField
                label="Percent"
                type="number"
                required={mode === 'percent'}
                value={percentValue}
                onChange={(e) => setPercent(e.target.value)}
                slotProps={{
                  input: {
                    readOnly: mode !== 'percent',
                    endAdornment: <InputAdornment position="end">%</InputAdornment>,
                    inputProps: { min: 0.01, max: 100, step: 0.01 },
                  },
                }}
                sx={{ flex: 1 }}
              />
            </Stack>
            <Typography variant="body2" color="text.secondary" sx={{ minHeight: 24 }}>
              {previewText}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ minHeight: 40 }}>
              {helper}
            </Typography>
            <FormControl fullWidth size="small">
              <InputLabel id="discount-apply-label">Apply to</InputLabel>
              <Select
                labelId="discount-apply-label"
                label="Apply to"
                value={typeof targetLineId === 'number' ? String(targetLineId) : targetLineId}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === 'several') {
                    setTargetLineId('several');
                    switchMode('percent');
                  } else {
                    setTargetLineId(v === 'ticket' ? 'ticket' : Number(v));
                  }
                }}
              >
                <MenuItem value="ticket">Full ticket</MenuItem>
                {itemLines.length > 1 && !isGoogleReview ? <MenuItem value="several">Several items</MenuItem> : null}
                {itemLines.map((ln: CartLine) => (
                  <MenuItem key={ln.id} value={String(ln.id)}>
                    Per line - {ln.description} ({formatDiscountCurrency(Number(ln.line_total))})
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            {several ? (
              <Box data-testid="discount-several" sx={{ border: 1, borderColor: 'divider', borderRadius: 1, px: 1, py: 0.5, maxHeight: 220, overflowY: 'auto' }}>
                <FormControlLabel
                  control={(
                    <Checkbox
                      size="small"
                      checked={picked.length === itemLines.length}
                      indeterminate={picked.length > 0 && picked.length < itemLines.length}
                      onChange={(e) => setPicked(e.target.checked ? itemLines.map((ln) => ln.id) : [])}
                    />
                  )}
                  label={<Typography variant="body2" fontWeight={700}>All items</Typography>}
                />
                {itemLines.map((ln: CartLine) => (
                  <FormControlLabel
                    key={ln.id}
                    sx={{ display: 'flex' }}
                    control={(
                      <Checkbox
                        size="small"
                        checked={picked.includes(ln.id)}
                        onChange={(e) => setPicked((now) => (e.target.checked ? [...now, ln.id] : now.filter((id) => id !== ln.id)))}
                      />
                    )}
                    label={<Typography variant="body2">{ln.description} ({formatDiscountCurrency(Number(ln.line_total))})</Typography>}
                  />
                ))}
              </Box>
            ) : null}
            <Typography variant="caption" color="text.secondary" sx={{ minHeight: 20 }}>
              {applyHelper}
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="contained" disabled={pending}>
            {pending ? 'Adding…' : 'Add discount'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
