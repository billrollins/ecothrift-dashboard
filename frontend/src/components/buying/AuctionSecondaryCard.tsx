import { Box, Card, Divider, Stack, Tooltip, Typography } from '@mui/material';
import BuyingDetailSectionTitle from './BuyingDetailSectionTitle';
import type { BuyingAuctionDetail } from '../../types/buying.types';
import { computeMaxBidAtProfitFactor } from '../../utils/auctionMaxBid';
import { formatCurrencyWhole } from '../../utils/format';
import { parseDec } from '../../utils/valuationParse';

const BAR_H = 12;

const GAUGE_LABEL_SX = {
  fontSize: '0.65rem',
  lineHeight: 1.2,
  color: 'text.secondary',
} as const;

/** Shared dark tooltip shell for max-bid summary (gauge + bid tiles). */
const MAX_BID_TOOLTIP_SLOT_PROPS = {
  tooltip: {
    sx: {
      bgcolor: 'grey.900',
      border: '1px solid',
      borderColor: 'rgba(255,255,255,0.1)',
      maxWidth: 320,
      py: 1,
      px: 1.25,
    },
  },
} as const;

type Props = { detail: BuyingAuctionDetail };

/** Top-right secondary card: max-bid tiles, gauge with tick labels. */
export default function AuctionSecondaryCard({ detail }: Props) {
  const bidAtBreakeven = computeMaxBidAtProfitFactor(detail, 1);
  const bidAt15 = computeMaxBidAtProfitFactor(detail, 1.5);
  const bidAt2 = computeMaxBidAtProfitFactor(detail, 2);
  const formatMaxBid = (n: number | null) =>
    n != null && Number.isFinite(n) ? formatCurrencyWhole(String(n)) : '—';

  const currentPrice = parseDec(detail.current_price);
  const breakeven = bidAtBreakeven;
  const target = bidAt2;

  /** Bar scale is 0 → break-even (max bid at 1.0×); ticks are shares of that range. */
  const gaugeMax = breakeven != null && breakeven > 0 ? breakeven : null;
  const pctOf = (v: number | null) =>
    v != null && gaugeMax != null && gaugeMax > 0
      ? Math.min(100, Math.max(0, (v / gaugeMax) * 100))
      : null;

  const currentPct = pctOf(currentPrice);
  const breakevenPct = pctOf(breakeven);
  const moderatePct = pctOf(bidAt15);
  const targetPct = pctOf(target);

  const marginRatio =
    currentPrice != null && breakeven != null && breakeven > 0 ? currentPrice / breakeven : null;

  const tiles = [
    { key: '2x', head: 'Target', sub: '2.0x', value: bidAt2, borderColor: 'success.light' as const },
    { key: '15', head: 'Moderate', sub: '1.5x', value: bidAt15, borderColor: 'warning.light' as const },
    { key: 'be', head: 'Break-even', sub: '1.0x', value: bidAtBreakeven, borderColor: 'error.light' as const },
  ];

  /** Abbreviated labels only on the gauge (below bar), not tiles or tooltip. */
  const tickMarks = [
    { pct: targetPct, color: 'success.main' as const, chartLabel: 'Tgt', amount: bidAt2 },
    { pct: moderatePct, color: 'warning.main' as const, chartLabel: 'Mod', amount: bidAt15 },
    { pct: breakevenPct, color: 'error.main' as const, chartLabel: 'BE', amount: bidAtBreakeven },
  ];

  const tooltipRowSx = {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 2,
    minWidth: 200,
  } as const;

  const tooltipLabelSx = {
    fontSize: '0.65rem',
    fontWeight: 700,
    letterSpacing: '0.06em',
    textTransform: 'uppercase' as const,
    opacity: 0.75,
    lineHeight: 1.2,
  };

  const tooltipAmountSx = {
    fontSize: '0.9375rem',
    fontWeight: 700,
    fontVariantNumeric: 'tabular-nums' as const,
    lineHeight: 1.2,
  };

  const maxBidTooltip = (
    <Box
      component="div"
      sx={{
        color: 'common.white',
        '& .gauge-tip-amount': { fontVariantNumeric: 'tabular-nums' },
      }}
    >
      <Box sx={{ ...tooltipRowSx, mb: 1 }}>
        <Typography component="span" sx={{ ...tooltipLabelSx, color: 'rgba(255,255,255,0.7)' }}>
          Current price
        </Typography>
        <Typography
          component="span"
          className="gauge-tip-amount"
          sx={{ ...tooltipAmountSx, fontSize: '1.0625rem', color: 'common.white' }}
        >
          {currentPrice != null ? formatCurrencyWhole(String(currentPrice)) : '—'}
        </Typography>
      </Box>
      <Divider sx={{ mb: 1, borderColor: 'rgba(255,255,255,0.2)' }} />
      <Stack spacing={0.85}>
        <Box sx={tooltipRowSx}>
          <Typography component="span" sx={{ ...tooltipLabelSx, color: 'success.main' }}>
            Target · 2×
          </Typography>
          <Typography component="span" className="gauge-tip-amount" sx={{ ...tooltipAmountSx, color: 'success.main' }}>
            {formatMaxBid(bidAt2)}
          </Typography>
        </Box>
        <Box sx={tooltipRowSx}>
          <Typography component="span" sx={{ ...tooltipLabelSx, color: 'warning.main' }}>
            Moderate · 1.5×
          </Typography>
          <Typography component="span" className="gauge-tip-amount" sx={{ ...tooltipAmountSx, color: 'warning.main' }}>
            {formatMaxBid(bidAt15)}
          </Typography>
        </Box>
        <Box sx={tooltipRowSx}>
          <Typography component="span" sx={{ ...tooltipLabelSx, color: 'error.main' }}>
            Break-even · 1×
          </Typography>
          <Typography component="span" className="gauge-tip-amount" sx={{ ...tooltipAmountSx, color: 'error.main' }}>
            {formatMaxBid(bidAtBreakeven)}
          </Typography>
        </Box>
      </Stack>
    </Box>
  );

  return (
    <Card
      variant="outlined"
      sx={{ p: 1, height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0, overflow: 'visible' }}
    >
      <BuyingDetailSectionTitle first>Max bid at each target</BuyingDetailSectionTitle>

      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, minmax(0, 1fr))' },
          gap: 0.75,
          alignItems: 'stretch',
        }}
      >
        {tiles.map(({ key, head, sub, value, borderColor }) => (
          <Tooltip
            key={key}
            title={maxBidTooltip}
            placement="top"
            enterDelay={180}
            slotProps={MAX_BID_TOOLTIP_SLOT_PROPS}
          >
            <Box
              sx={{
                p: 1,
                borderRadius: 1,
                border: 1,
                borderColor: 'divider',
                borderLeftWidth: 3,
                borderLeftColor: borderColor,
                bgcolor: 'background.paper',
                minWidth: 0,
                width: '100%',
                maxWidth: '100%',
                height: '100%',
                display: 'flex',
                flexDirection: { xs: 'column', sm: 'row' },
                alignItems: { xs: 'center', sm: 'center' },
                justifyContent: { xs: 'flex-start', sm: 'space-between' },
                gap: { xs: 0.75, sm: 1 },
                cursor: 'default',
              }}
            >
            <Box
              sx={{
                flex: '0 0 auto',
                display: 'flex',
                flexDirection: 'column',
                alignItems: { xs: 'center', sm: 'flex-start' },
                justifyContent: 'center',
                gap: 0.35,
                minWidth: 0,
                maxWidth: { xs: '100%', sm: '46%' },
                pr: { sm: 0.5 },
                textAlign: { xs: 'center', sm: 'left' },
              }}
            >
              <Typography
                variant="subtitle2"
                color="text.secondary"
                fontWeight={800}
                lineHeight={1.2}
                sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' } }}
              >
                {head}
              </Typography>
              <Typography variant="caption" color="text.disabled" fontWeight={700} lineHeight={1.15} sx={{ fontVariantNumeric: 'tabular-nums' }}>
                {sub}
              </Typography>
            </Box>
            <Typography
              component="div"
              fontWeight={800}
              sx={{
                flex: { xs: '0 1 auto', sm: '1 1 0%' },
                minWidth: 0,
                width: { xs: '100%', sm: 'auto' },
                maxWidth: '100%',
                fontVariantNumeric: 'tabular-nums',
                lineHeight: 1.2,
                textAlign: 'center',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'clip',
                fontSize: {
                  xs: 'clamp(0.62rem, 1.9vw + 0.42rem, min(1.45rem, 5.2vw))',
                  sm: 'clamp(0.85rem, 1vw + 0.55rem, min(2rem, 4vw))',
                },
              }}
            >
              {formatMaxBid(value)}
            </Typography>
            </Box>
          </Tooltip>
        ))}
      </Box>

      <Box sx={{ mt: 'auto', pt: 1, flexShrink: 0, width: '100%', minWidth: 0, overflow: 'visible' }}>
        <Tooltip
          title={maxBidTooltip}
          placement="top"
          enterDelay={180}
          slotProps={MAX_BID_TOOLTIP_SLOT_PROPS}
        >
          <Box sx={{ width: '100%', cursor: 'default' }}>
            {/* "Current" label above the bar (aligned with dot) */}
            <Box sx={{ position: 'relative', height: 14, mb: 0.25, width: '100%' }}>
              {currentPct != null ? (
                <Typography
                  sx={{
                    ...GAUGE_LABEL_SX,
                    position: 'absolute',
                    left: `${currentPct}%`,
                    transform: 'translateX(-50%)',
                    top: 0,
                    whiteSpace: 'nowrap',
                  }}
                >
                  Current
                </Typography>
              ) : null}
            </Box>

            <Box sx={{ position: 'relative', width: '100%' }}>
              {/* Track + fill */}
              <Box
                sx={{
                  position: 'relative',
                  height: BAR_H,
                  borderRadius: BAR_H / 2,
                  bgcolor: 'grey.200',
                  overflow: 'hidden',
                }}
              >
                {currentPct != null && (
                  <Box
                    sx={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      height: '100%',
                      width: `${currentPct}%`,
                      borderRadius: `${BAR_H / 2}px`,
                      bgcolor:
                        marginRatio != null
                          ? marginRatio < 0.5
                            ? 'success.main'
                            : marginRatio < 0.8
                              ? 'warning.main'
                              : 'error.main'
                          : 'grey.400',
                      transition: 'width 0.3s ease',
                      opacity: 0.38,
                    }}
                  />
                )}
              </Box>

              {/* Ticks + dot */}
              <Box
                sx={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  top: 0,
                  height: BAR_H,
                  pointerEvents: 'none',
                  overflow: 'visible',
                }}
              >
                {tickMarks.map(({ pct, color, chartLabel }) =>
                  pct != null ? (
                    <Box
                      key={chartLabel}
                      sx={{
                        position: 'absolute',
                        left: `${pct}%`,
                        top: '50%',
                        transform: 'translate(-50%, -50%)',
                        width: 10,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Box
                        sx={{
                          width: 2,
                          height: BAR_H + 6,
                          bgcolor: color,
                          borderRadius: 1,
                          flexShrink: 0,
                          opacity: 0.95,
                        }}
                      />
                    </Box>
                  ) : null,
                )}
                {currentPct != null && (
                  <Box
                    sx={{
                      position: 'absolute',
                      left: `${currentPct}%`,
                      top: '50%',
                      transform: 'translate(-50%, -50%)',
                      width: 14,
                      height: 14,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      zIndex: 2,
                    }}
                  >
                    <Box
                      sx={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        bgcolor: 'text.primary',
                        border: 2,
                        borderColor: 'background.paper',
                        boxShadow: 1,
                      }}
                    />
                  </Box>
                )}
              </Box>

              {/* Tgt / Mod / BE below bar */}
              <Box sx={{ position: 'relative', mt: 0.75, minHeight: 14, width: '100%' }}>
                {tickMarks.map(({ pct, chartLabel }) =>
                  pct != null ? (
                    <Typography
                      key={`below-${chartLabel}`}
                      sx={{
                        ...GAUGE_LABEL_SX,
                        position: 'absolute',
                        left: `${pct}%`,
                        transform: 'translateX(-50%)',
                        top: 0,
                        textAlign: 'center',
                        maxWidth: 72,
                      }}
                    >
                      {chartLabel}
                    </Typography>
                  ) : null,
                )}
              </Box>
            </Box>
          </Box>
        </Tooltip>
      </Box>
    </Card>
  );
}
