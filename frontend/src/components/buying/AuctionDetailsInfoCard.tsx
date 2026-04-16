import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { Box, Card, Chip, Stack, Tooltip, Typography } from '@mui/material';
import { format, parseISO } from 'date-fns';
import BuyingDetailSectionTitle from './BuyingDetailSectionTitle';
import type { BuyingAuctionDetail } from '../../types/buying.types';
import { formatCurrency, formatCurrencyWhole, formatNumber } from '../../utils/format';

function formatEndTime(iso: string | null): string {
  if (!iso) return '—';
  try {
    return format(parseISO(iso), 'MMM d, yyyy h:mm a');
  } catch {
    return iso;
  }
}

const LISTING_TYPE_TOOLTIPS: Record<string, string> = {
  SPOT: 'Spot auction — standard single-lot listing on B-Stock.',
  CONTRACT: 'Contract-style listing on B-Stock (terms may differ from spot).',
};

function listingTypeTooltip(code: string): string {
  const c = code.trim();
  if (!c) return 'Listing format from B-Stock.';
  return LISTING_TYPE_TOOLTIPS[c] ?? `B-Stock listing type "${c}".`;
}

function conditionChipColor(cond: string): 'success' | 'primary' | 'warning' | 'error' | 'default' {
  const lower = cond.toLowerCase().trim();
  if (lower === 'new' || lower === 'like new') return 'success';
  if (lower === 'used good' || lower === 'good') return 'primary';
  if (lower === 'used fair' || lower === 'used' || lower === 'fair') return 'warning';
  if (lower === 'salvage' || lower === 'damaged') return 'error';
  return 'default';
}

type Props = { detail: BuyingAuctionDetail };

/** Cell 2,2 — listing details plus static bid-reference fields (starting price, buy now, profit). */
export default function AuctionDetailsInfoCard({ detail }: Props) {
  const retailVal = detail.total_retail_value != null ? Number.parseFloat(String(detail.total_retail_value)) : null;
  const lotSize = detail.lot_size;
  const avgRetailPerItem =
    retailVal != null && Number.isFinite(retailVal) && lotSize != null && lotSize > 0
      ? retailVal / lotSize
      : null;

  const estProfit = detail.est_profit != null ? Number.parseFloat(String(detail.est_profit)) : null;
  const profRatio = detail.profitability_ratio != null ? Number.parseFloat(String(detail.profitability_ratio)) : null;

  return (
    <Card variant="outlined" sx={{ p: 1.25, height: '100%' }}>
      <BuyingDetailSectionTitle first>Auction details</BuyingDetailSectionTitle>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' },
          gap: 1.25,
          columnGap: 1.5,
          alignItems: 'start',
        }}
      >
        <Box
          sx={{
            p: 1,
            borderRadius: 1,
            bgcolor: 'action.hover',
            border: 1,
            borderColor: 'divider',
          }}
        >
          <Typography variant="caption" color="text.secondary" display="block" sx={{ fontSize: '0.7rem', lineHeight: 1.2 }}>
            Total retail (listing)
          </Typography>
          <Typography variant="subtitle1" component="p" fontWeight={700} sx={{ mt: 0.35, mb: 0, fontVariantNumeric: 'tabular-nums' }}>
            {formatCurrencyWhole(detail.total_retail_value)}
          </Typography>
        </Box>
        <Box>
          <Typography variant="caption" color="text.secondary" display="block" sx={{ fontSize: '0.7rem', lineHeight: 1.2 }}>
            End time
          </Typography>
          <Typography variant="body2" sx={{ mt: 0.2 }}>
            {formatEndTime(detail.end_time)}
          </Typography>
        </Box>
        <Box>
          <Typography variant="caption" color="text.secondary" display="block" sx={{ fontSize: '0.7rem', lineHeight: 1.2 }}>
            Lot size
          </Typography>
          {lotSize != null ? (
            <Stack direction="row" alignItems="baseline" spacing={0.75} sx={{ mt: 0.2 }}>
              <Typography variant="body2">
                <Box component="span" fontWeight={600}>
                  {formatNumber(lotSize)}
                </Box>{' '}
                <Box component="span" color="text.secondary">
                  items
                </Box>
              </Typography>
              {avgRetailPerItem != null && (
                <Typography variant="caption" color="text.secondary" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                  ~{formatCurrencyWhole(avgRetailPerItem)}/item
                </Typography>
              )}
            </Stack>
          ) : (
            <Typography variant="body2" sx={{ mt: 0.2 }}>—</Typography>
          )}
        </Box>
        <Box>
          <Typography variant="caption" color="text.secondary" display="block" sx={{ fontSize: '0.7rem', lineHeight: 1.2 }}>
            Condition
          </Typography>
          {detail.condition_summary ? (
            <Chip
              label={detail.condition_summary}
              size="small"
              color={conditionChipColor(detail.condition_summary)}
              variant="outlined"
              sx={{ mt: 0.35, height: 22, '& .MuiChip-label': { px: 0.75, fontSize: '0.75rem' } }}
            />
          ) : (
            <Typography variant="body2" sx={{ mt: 0.2 }}>—</Typography>
          )}
        </Box>
        <Box>
          <Stack direction="row" alignItems="center" spacing={0.25} sx={{ mb: 0.15 }}>
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem', lineHeight: 1.2 }}>
              Listing type
            </Typography>
            <Tooltip title={listingTypeTooltip(detail.listing_type || '')} placement="top" enterDelay={300}>
              <InfoOutlinedIcon sx={{ fontSize: 16, color: 'action.active', cursor: 'help', opacity: 0.85 }} aria-label="About listing type" />
            </Tooltip>
          </Stack>
          <Typography variant="body2" sx={{ mt: 0.1 }}>
            {detail.listing_type?.trim() || '—'}
          </Typography>
        </Box>
        <Box>
          <Typography variant="caption" color="text.secondary" display="block" sx={{ fontSize: '0.7rem', lineHeight: 1.2 }}>
            Starting price
          </Typography>
          <Typography variant="body2" fontWeight={700} sx={{ mt: 0.2, fontVariantNumeric: 'tabular-nums' }}>
            {formatCurrency(detail.starting_price)}
          </Typography>
        </Box>
        <Box>
          <Typography variant="caption" color="text.secondary" display="block" sx={{ fontSize: '0.7rem', lineHeight: 1.2 }}>
            Buy now
          </Typography>
          <Typography variant="body2" fontWeight={700} sx={{ mt: 0.2, fontVariantNumeric: 'tabular-nums' }}>
            {formatCurrency(detail.buy_now_price)}
          </Typography>
        </Box>
        <Box>
          <Typography variant="caption" color="text.secondary" display="block" sx={{ fontSize: '0.7rem', lineHeight: 1.2 }}>
            Est. profit
          </Typography>
          <Typography
            variant="body2"
            fontWeight={700}
            sx={{
              mt: 0.2,
              fontVariantNumeric: 'tabular-nums',
              color:
                estProfit != null && Number.isFinite(estProfit)
                  ? estProfit >= 0
                    ? 'success.main'
                    : 'error.main'
                  : 'text.primary',
            }}
          >
            {estProfit != null && Number.isFinite(estProfit) ? formatCurrency(estProfit) : '—'}
          </Typography>
        </Box>
        <Box>
          <Tooltip title="Revenue ÷ total cost. Above 1.5 is typically good." placement="top" enterDelay={300}>
            <Typography variant="caption" color="text.secondary" display="block" sx={{ fontSize: '0.7rem', lineHeight: 1.2, cursor: 'help' }}>
              Profitability
            </Typography>
          </Tooltip>
          <Typography
            variant="body2"
            fontWeight={700}
            sx={{
              mt: 0.2,
              fontVariantNumeric: 'tabular-nums',
              color:
                profRatio != null && Number.isFinite(profRatio)
                  ? profRatio >= 1.5
                    ? 'success.main'
                    : profRatio >= 1
                      ? 'warning.main'
                      : 'error.main'
                  : 'text.primary',
            }}
          >
            {profRatio != null && Number.isFinite(profRatio) ? `${profRatio.toFixed(2)}x` : '—'}
          </Typography>
        </Box>
      </Box>

      {detail.description ? (
        <Box sx={{ mt: 1.25 }}>
          <Typography variant="caption" color="text.secondary" display="block">
            Description
          </Typography>
          <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', mt: 0.25 }}>
            {detail.description}
          </Typography>
        </Box>
      ) : null}
    </Card>
  );
}
