import { Box, Card, Tooltip, Typography } from '@mui/material';
import BuyingDetailSectionTitle from './BuyingDetailSectionTitle';
import type { BuyingAuctionDetail } from '../../types/buying.types';
import { computeMaxBidAtProfitFactor } from '../../utils/auctionMaxBid';
import { formatCurrencyWhole } from '../../utils/format';
import { parseDec } from '../../utils/valuationParse';

const BAR_H = 14;

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

  const gaugeAnchor =
    target != null && target > 0
      ? target
      : breakeven != null && breakeven > 0
        ? breakeven
        : currentPrice != null && currentPrice > 0
          ? currentPrice
          : 1;
  const gaugeMax = Math.max(gaugeAnchor * 1.15, 1);
  const pctOf = (v: number | null) =>
    v != null && gaugeMax > 0 ? Math.min(100, Math.max(0, (v / gaugeMax) * 100)) : null;

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

  const tickTooltips = [
    { pct: targetPct, color: 'success.main' as const, short: 'T', label: 'Target', mult: '2.0x', amount: bidAt2 },
    { pct: moderatePct, color: 'warning.main' as const, short: 'M', label: 'Moderate', mult: '1.5x', amount: bidAt15 },
    { pct: breakevenPct, color: 'error.main' as const, short: 'B', label: 'Break-even', mult: '1.0x', amount: bidAtBreakeven },
  ];

  return (
    <Card
      variant="outlined"
      sx={{ p: 1.25, height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0, overflow: 'visible' }}
    >
      <BuyingDetailSectionTitle first>Max bid at each target</BuyingDetailSectionTitle>

      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, minmax(0, 1fr))' },
          gap: 1,
          alignItems: 'stretch',
        }}
      >
        {tiles.map(({ key, head, sub, value, borderColor }) => (
          <Box
            key={key}
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
              display: 'flex',
              flexDirection: { xs: 'column', sm: 'row' },
              alignItems: { xs: 'center', sm: 'center' },
              justifyContent: { xs: 'flex-start', sm: 'space-between' },
              gap: { xs: 0.75, sm: 1 },
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
        ))}
      </Box>

      <Box sx={{ mt: 'auto', pt: 1.5, flexShrink: 0, width: '100%', minWidth: 0, overflow: 'visible' }}>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.75, fontSize: '0.65rem', lineHeight: 1.35 }}>
          Fill = current price vs scale · T/M/B ticks = max bid targets · ● = current price (hover for $)
        </Typography>

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
              <Tooltip
                title={
                  currentPrice != null
                    ? `Current price — ${formatCurrencyWhole(String(currentPrice))}`
                    : 'Current price'
                }
                placement="top"
                enterDelay={200}
              >
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
                    cursor: 'help',
                  }}
                />
              </Tooltip>
            )}
          </Box>

          {/* Ticks + dot — centered on bar vertically */}
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
            {tickTooltips.map(
              ({ pct, color, label, mult, amount, short }) =>
                pct != null && (
                  <Tooltip
                    key={label}
                    title={
                      <Typography component="span" variant="body2" sx={{ display: 'block' }}>
                        {label} · {mult}
                        <Box component="span" display="block" sx={{ fontVariantNumeric: 'tabular-nums', mt: 0.5 }}>
                          {formatMaxBid(amount)}
                        </Box>
                      </Typography>
                    }
                    placement="top"
                    enterDelay={200}
                  >
                    <Box
                      sx={{
                        position: 'absolute',
                        left: `${pct}%`,
                        top: '50%',
                        transform: 'translate(-50%, -50%)',
                        width: 12,
                        cursor: 'help',
                        pointerEvents: 'auto',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Box
                        sx={{
                          width: 3,
                          height: BAR_H + 8,
                          bgcolor: color,
                          borderRadius: 1,
                          flexShrink: 0,
                          boxShadow: 1,
                        }}
                      />
                    </Box>
                  </Tooltip>
                ),
            )}
            {currentPct != null && (
              <Tooltip
                title={
                  currentPrice != null
                    ? `Current price — ${formatCurrencyWhole(String(currentPrice))}`
                    : 'Current price'
                }
                placement="top"
                enterDelay={200}
              >
                <Box
                  sx={{
                    position: 'absolute',
                    left: `${currentPct}%`,
                    top: '50%',
                    transform: 'translate(-50%, -50%)',
                    width: 16,
                    height: 16,
                    cursor: 'help',
                    pointerEvents: 'auto',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 2,
                  }}
                >
                  <Box
                    sx={{
                      width: 10,
                      height: 10,
                      borderRadius: '50%',
                      bgcolor: 'text.primary',
                      border: 2,
                      borderColor: 'background.paper',
                      boxShadow: 1,
                    }}
                  />
                </Box>
              </Tooltip>
            )}
          </Box>

          {/* Labels below the bar (same horizontal % as ticks) */}
          <Box sx={{ position: 'relative', mt: 1.25, minHeight: 30, width: '100%' }}>
            {tickTooltips.map(
              ({ pct, color, label, mult, short }) =>
                pct != null && (
                  <Box
                    key={`lbl-${label}`}
                    sx={{
                      position: 'absolute',
                      left: `${pct}%`,
                      transform: 'translateX(-50%)',
                      top: 0,
                      textAlign: 'center',
                      width: 76,
                      maxWidth: '30vw',
                    }}
                  >
                    <Typography
                      variant="caption"
                      sx={{
                        display: 'block',
                        fontWeight: 800,
                        color,
                        fontSize: '0.68rem',
                        lineHeight: 1.15,
                      }}
                    >
                      {short} · {mult}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.6rem', lineHeight: 1.15, display: 'block' }}>
                      {label}
                    </Typography>
                  </Box>
                ),
            )}
          </Box>
        </Box>
      </Box>
    </Card>
  );
}
