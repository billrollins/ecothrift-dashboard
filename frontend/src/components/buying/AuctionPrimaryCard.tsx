import { useEffect, useRef, useState } from 'react';
import { Box, Card, Tooltip, Typography } from '@mui/material';
import BuyingDetailSectionTitle from './BuyingDetailSectionTitle';
import { useBuyingValuationInputsMutation } from '../../hooks/useBuyingValuationInputsMutation';
import type { BuyingAuctionDetail } from '../../types/buying.types';
import { formatCurrencyWhole } from '../../utils/format';
import { formatTimeRemaining, timeRemainingDetailSx, msUntilEnd } from '../../utils/buyingAuctionList';

function needScoreColor(score: number | null): string {
  if (score == null) return 'text.secondary';
  if (score >= 60) return 'success.main';
  if (score >= 30) return 'warning.main';
  return 'text.secondary';
}

const cellSx = {
  minWidth: 0,
  width: '100%',
  height: '100%',
  display: 'flex',
  flexDirection: 'column' as const,
  alignItems: 'center' as const,
  justifyContent: 'flex-start' as const,
  gap: 0.5,
  px: { xs: 0.5, sm: 0.75 },
  boxSizing: 'border-box' as const,
};

/** Shared row for all metrics — centers values on the same horizontal band */
const valueSlotSx = {
  width: '100%',
  maxWidth: '100%',
  flex: 1,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  minWidth: 0,
  minHeight: 0,
  overflow: 'hidden',
};

const labelSx = {
  width: '100%',
  textAlign: 'center' as const,
  fontSize: '0.6rem',
  lineHeight: 1,
};

/** Capped with vw so narrow 4-column rows never overflow (min keeps readable floor) */
const metricValueFontSx = {
  fontVariantNumeric: 'tabular-nums' as const,
  lineHeight: 1.2,
  margin: 0,
  fontSize: {
    xs: 'clamp(0.55rem, 1.85vw + 0.35rem, min(1.5rem, 5.5vw))',
    sm: 'clamp(0.85rem, 1.2vw + 0.55rem, 1.75rem)',
    md: 'clamp(1.1rem, 1vw + 0.75rem, 2.125rem)',
  },
};

/** Time — larger than metrics but still capped to container */
const timeValueFontSx = {
  fontVariantNumeric: 'tabular-nums' as const,
  lineHeight: 1.15,
  margin: 0,
  fontSize: {
    xs: 'clamp(0.62rem, 2.2vw + 0.45rem, min(1.65rem, 6.5vw))',
    sm: 'clamp(0.95rem, 1.5vw + 0.65rem, min(2.125rem, 8vw))',
    md: 'min(2.125rem, 4vw)',
  },
};

type Props = { detail: BuyingAuctionDetail; isAdmin: boolean };

/** Top-left card: one row — time left, current price, need, priority. */
export default function AuctionPrimaryCard({ detail, isAdmin }: Props) {
  const mutation = useBuyingValuationInputsMutation();
  const [priorityDraft, setPriorityDraft] = useState('');
  const [editingPriority, setEditingPriority] = useState(false);
  const priorityInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setPriorityDraft(detail.priority != null ? String(detail.priority) : '');
  }, [detail.id, detail.priority]);

  useEffect(() => {
    if (editingPriority) {
      priorityInputRef.current?.focus();
      priorityInputRef.current?.select();
    }
  }, [editingPriority]);

  const commitPriorityFromDraft = () => {
    if (!isAdmin) return;
    const pr = priorityDraft.trim();
    if (pr === '') {
      setEditingPriority(false);
      setPriorityDraft(detail.priority != null ? String(detail.priority) : '');
      return;
    }
    const priorityNum = Number.parseInt(pr, 10);
    if (!Number.isFinite(priorityNum)) {
      setEditingPriority(false);
      setPriorityDraft(detail.priority != null ? String(detail.priority) : '');
      return;
    }
    const body = Math.min(99, Math.max(1, priorityNum));
    mutation.mutate({
      auctionId: detail.id,
      body: { priority: body },
    });
    setEditingPriority(false);
  };

  const commitPriorityValue = (next: number) => {
    if (!isAdmin) return;
    const body = Math.min(99, Math.max(1, Math.round(next)));
    mutation.mutate({
      auctionId: detail.id,
      body: { priority: body },
    });
  };

  const needDisplay =
    detail.need_score != null && Number.isFinite(Number(detail.need_score))
      ? Math.round(Number(detail.need_score))
      : null;

  const ms = msUntilEnd(detail.end_time);
  const isUrgent = ms != null && ms > 0 && ms <= 3_600_000;
  const isSoon = ms != null && ms > 3_600_000 && ms <= 4 * 3_600_000;

  const priceWhole = formatCurrencyWhole(detail.current_price);

  return (
    <Card
      variant="outlined"
      sx={{
        p: { xs: 1, sm: 1.25 },
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        bgcolor: isUrgent
          ? 'rgba(211, 47, 47, 0.04)'
          : isSoon
            ? 'rgba(237, 108, 2, 0.03)'
            : 'background.paper',
        transition: 'background-color 0.3s ease',
        minWidth: 0,
        overflow: 'visible',
      }}
    >
      <BuyingDetailSectionTitle first>Live auction</BuyingDetailSectionTitle>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
          gap: 0,
          columnGap: { xs: 0.5, sm: 1 },
          alignItems: 'stretch',
          width: '100%',
          flex: 1,
          minHeight: 0,
        }}
      >
        <Box sx={cellSx}>
          <Typography variant="caption" color="text.secondary" sx={labelSx}>
            Time left
          </Typography>
          <Box sx={valueSlotSx}>
            <Typography
              component="p"
              fontWeight={800}
              sx={[
                timeValueFontSx,
                {
                  whiteSpace: { xs: 'normal', sm: 'nowrap' },
                  overflow: 'hidden',
                  textOverflow: 'clip',
                  maxWidth: '100%',
                  width: '100%',
                  textAlign: 'center',
                  wordBreak: 'break-word',
                },
                timeRemainingDetailSx(detail.end_time),
                isUrgent && {
                  '@keyframes urgentPulse': {
                    '0%, 100%': { opacity: 1 },
                    '50%': { opacity: 0.7 },
                  },
                  animation: 'urgentPulse 2s ease-in-out infinite',
                },
              ]}
            >
              {formatTimeRemaining(detail.end_time)}
            </Typography>
          </Box>
        </Box>

        <Box sx={cellSx}>
          <Typography variant="caption" color="text.secondary" sx={labelSx}>
            Current price
          </Typography>
          <Box sx={valueSlotSx}>
            <Typography
              component="p"
              fontWeight={700}
              sx={{
                ...metricValueFontSx,
                whiteSpace: 'nowrap',
                textAlign: 'center',
                maxWidth: '100%',
                overflow: 'hidden',
                textOverflow: 'clip',
              }}
            >
              {priceWhole}
            </Typography>
          </Box>
        </Box>

        <Box sx={cellSx}>
          <Typography variant="caption" color="text.secondary" sx={labelSx}>
            Need
          </Typography>
          <Box sx={valueSlotSx}>
            <Tooltip title="Inventory demand (1–99). Higher = more needed." placement="top" enterDelay={300}>
              <Typography
                component="p"
                fontWeight={700}
                sx={{
                  ...metricValueFontSx,
                  color: needScoreColor(needDisplay),
                  cursor: 'help',
                  textAlign: 'center',
                }}
              >
                {needDisplay ?? '—'}
              </Typography>
            </Tooltip>
          </Box>
        </Box>

        <Box sx={cellSx}>
          <Typography variant="caption" color="text.secondary" sx={labelSx}>
            Priority
          </Typography>
          {!isAdmin ? (
            <Box sx={valueSlotSx}>
              <Typography component="p" fontWeight={700} sx={{ ...metricValueFontSx, textAlign: 'center' }}>
                {detail.priority ?? '—'}
              </Typography>
            </Box>
          ) : (
            <Box
              sx={{
                ...valueSlotSx,
                display: 'grid',
                gridTemplateColumns: '28px minmax(0, 1fr) 28px',
                alignItems: 'center',
                '@media (hover: hover)': {
                  '&:hover .pri-step': {
                    opacity: 1,
                  },
                },
                '@media (hover: none)': {
                  '& .pri-step': {
                    opacity: 0.75,
                  },
                },
              }}
            >
              <Box
                component="button"
                type="button"
                className="pri-step"
                aria-label="Decrease priority"
                onClick={(e) => {
                  e.stopPropagation();
                  const p = detail.priority ?? 1;
                  commitPriorityValue(Math.max(1, p - 1));
                }}
                sx={{
                  justifySelf: 'start',
                  border: 'none',
                  bgcolor: 'transparent',
                  cursor: 'pointer',
                  p: 0,
                  m: 0,
                  lineHeight: 1,
                  fontSize: { xs: '1.35rem', sm: '1.5rem' },
                  fontWeight: 800,
                  color: 'primary.main',
                  opacity: 0,
                  transition: 'opacity 0.15s ease',
                  width: 28,
                  height: 36,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  '&:disabled': { opacity: 0.25, cursor: 'not-allowed' },
                }}
                disabled={mutation.isPending || (detail.priority ?? 1) <= 1}
              >
                −
              </Box>

              {editingPriority ? (
                <Box
                  component="input"
                  ref={priorityInputRef}
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  value={priorityDraft}
                  onChange={(e) => setPriorityDraft(e.target.value.replace(/\D/g, '').slice(0, 2))}
                  onBlur={() => commitPriorityFromDraft()}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      commitPriorityFromDraft();
                    }
                    if (e.key === 'Escape') {
                      e.preventDefault();
                      setEditingPriority(false);
                      setPriorityDraft(detail.priority != null ? String(detail.priority) : '');
                    }
                  }}
                  sx={{
                    minWidth: 0,
                    width: '100%',
                    border: 'none',
                    outline: 'none',
                    bgcolor: 'transparent',
                    p: 0,
                    m: 0,
                    font: 'inherit',
                    fontWeight: 700,
                    textAlign: 'center',
                    ...metricValueFontSx,
                  }}
                />
              ) : (
                <Typography
                  component="div"
                  fontWeight={700}
                  onClick={() => {
                    setEditingPriority(true);
                    setPriorityDraft(detail.priority != null ? String(detail.priority) : '');
                  }}
                  sx={{
                    ...metricValueFontSx,
                    cursor: 'text',
                    minWidth: 0,
                    width: '100%',
                    userSelect: 'none',
                    textAlign: 'center',
                  }}
                >
                  {detail.priority ?? '—'}
                </Typography>
              )}

              <Box
                component="button"
                type="button"
                className="pri-step"
                aria-label="Increase priority"
                onClick={(e) => {
                  e.stopPropagation();
                  const p = detail.priority;
                  if (p == null) {
                    commitPriorityValue(1);
                  } else {
                    commitPriorityValue(Math.min(99, p + 1));
                  }
                }}
                sx={{
                  justifySelf: 'end',
                  border: 'none',
                  bgcolor: 'transparent',
                  cursor: 'pointer',
                  p: 0,
                  m: 0,
                  lineHeight: 1,
                  fontSize: { xs: '1.35rem', sm: '1.5rem' },
                  fontWeight: 800,
                  color: 'primary.main',
                  opacity: 0,
                  transition: 'opacity 0.15s ease',
                  width: 28,
                  height: 36,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  '&:disabled': { opacity: 0.25, cursor: 'not-allowed' },
                }}
                disabled={mutation.isPending || (detail.priority ?? 0) >= 99}
              >
                +
              </Box>
            </Box>
          )}
        </Box>
      </Box>
    </Card>
  );
}
