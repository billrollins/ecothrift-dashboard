import ThumbUpIcon from '@mui/icons-material/ThumbUp';
import ThumbUpOutlinedIcon from '@mui/icons-material/ThumbUpOutlined';
import StarIcon from '@mui/icons-material/Star';
import StarBorderIcon from '@mui/icons-material/StarBorder';
import {
  Box,
  Button,
  Card,
  CardActionArea,
  CardContent,
  CircularProgress,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import { formatCurrency, formatCurrencyWhole } from '../../utils/format';
import {
  formatAuctionCostToRetailPct,
  formatPriceToRetailPct,
  formatTimeRemainingShort,
  MOBILE_SORT_OPTIONS,
  timeRemainingSx,
} from '../../utils/buyingAuctionList';
import type { BuyingAuctionListItem } from '../../types/buying.types';
import AuctionCategoryListBlock from '../../components/buying/AuctionCategoryListBlock';
import ManifestListCell from '../../components/buying/ManifestListCell';

const MOBILE_PRESET_VALUES = new Set<string>(MOBILE_SORT_OPTIONS.map((o) => o.value));

function formatNeedScoreRaw(score: string | number | null | undefined): string {
  if (score == null || score === '') return '—';
  const n = Number.parseFloat(String(score));
  if (Number.isNaN(n)) return String(score);
  if (Number.isInteger(n)) return String(n);
  return n.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

export type AuctionListMobileProps = {
  ordering: string;
  onOrderingChange: (ordering: string) => void;
  rows: BuyingAuctionListItem[];
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  isLoading: boolean;
  /** Rows left to load after the current list (from server total − loaded). */
  remainingCount: number;
  onLoadMore: () => void;
  onRowNavigate: (id: number) => void;
  watchlistIds?: Set<number>;
  canThumbsToggle?: boolean;
  onThumbsToggle?: (id: number, next: boolean) => void;
  /** When set, star toggles watchlist (POST/DELETE watch API). */
  onWatchToggle?: (id: number, add: boolean) => void;
  /** Forces time display to update every second when any row is under 5 min. */
  countdownTick: number;
};

export default function AuctionListMobile({
  ordering,
  onOrderingChange,
  rows,
  hasNextPage,
  isFetchingNextPage,
  isLoading,
  remainingCount,
  onLoadMore,
  onRowNavigate,
  watchlistIds,
  canThumbsToggle = false,
  onThumbsToggle,
  onWatchToggle,
  countdownTick,
}: AuctionListMobileProps) {
  void countdownTick;
  return (
    <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
      <FormControl fullWidth size="small">
        <InputLabel id="buying-mobile-sort">Sort</InputLabel>
        <Select
          labelId="buying-mobile-sort"
          label="Sort"
          value={ordering}
          onChange={(e) => onOrderingChange(e.target.value)}
        >
          {MOBILE_SORT_OPTIONS.map((opt) => (
            <MenuItem key={opt.value} value={opt.value}>
              {opt.label}
            </MenuItem>
          ))}
          {!MOBILE_PRESET_VALUES.has(ordering) && (
            <MenuItem value={ordering}>Current sort (from desktop)</MenuItem>
          )}
        </Select>
      </FormControl>

      <Box sx={{ flex: 1, minHeight: 200, overflow: 'auto' }}>
        {isLoading && rows.length === 0 ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress size={32} />
          </Box>
        ) : (
          <Stack spacing={0.5}>
            {rows.map((row) => {
              const watched = watchlistIds?.has(row.id);
              const watchUnknown = watchlistIds === undefined;
              const costPct = formatAuctionCostToRetailPct(row);
              const priceRetailPct = formatPriceToRetailPct(row);
              return (
                <Card
                  key={row.id}
                  variant="outlined"
                  sx={{
                    borderRadius: 1,
                    bgcolor: watched ? '#fffde7' : undefined,
                  }}
                >
                  <CardActionArea onClick={() => onRowNavigate(row.id)}>
                    <CardContent
                      sx={{
                        py: 0.75,
                        px: 1.25,
                        '&:last-child': { pb: 0.75 },
                      }}
                    >
                      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" flexWrap="wrap" gap={0.5}>
                        <Stack direction="row" alignItems="center" spacing={0.75} flexWrap="wrap" useFlexGap sx={{ flex: 1, minWidth: 0 }}>
                          <Typography
                            variant="caption"
                            color="primary"
                            sx={{ fontWeight: 600, lineHeight: 1.2 }}
                          >
                            {row.marketplace?.name ?? '—'}
                          </Typography>
                          <ManifestListCell row={row} />
                          {onWatchToggle && !watchUnknown ? (
                            <Tooltip title={watched ? 'Remove from watchlist' : 'Add to watchlist'}>
                              <IconButton
                                size="small"
                                aria-label={watched ? 'Remove from watchlist' : 'Add to watchlist'}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onWatchToggle(row.id, !watched);
                                }}
                              >
                                {watched ? (
                                  <StarIcon fontSize="small" color="warning" />
                                ) : (
                                  <StarBorderIcon fontSize="small" sx={{ color: 'action.disabled' }} />
                                )}
                              </IconButton>
                            </Tooltip>
                          ) : watchUnknown ? (
                            <Tooltip title="Watchlist status may be incomplete when watchlist is large">
                              <StarBorderIcon fontSize="small" sx={{ color: 'action.disabled' }} />
                            </Tooltip>
                          ) : watched ? (
                            <StarIcon fontSize="small" color="warning" />
                          ) : (
                            <StarBorderIcon fontSize="small" sx={{ color: 'action.disabled' }} />
                          )}
                        </Stack>
                        {canThumbsToggle && onThumbsToggle ? (
                          <Stack direction="row" alignItems="center" spacing={0.25}>
                            <IconButton
                              size="small"
                              aria-label="Thumbs up"
                              onClick={(e) => {
                                e.stopPropagation();
                                onThumbsToggle(row.id, !row.thumbs_up);
                              }}
                            >
                              {row.thumbs_up ? (
                                <ThumbUpIcon fontSize="small" color="primary" />
                              ) : (
                                <ThumbUpOutlinedIcon fontSize="small" color="disabled" />
                              )}
                            </IconButton>
                            <Typography
                              variant="caption"
                              color="text.secondary"
                              sx={{ fontVariantNumeric: 'tabular-nums', fontSize: '0.7rem' }}
                            >
                              {row.thumbs_up_count ?? 0}
                            </Typography>
                          </Stack>
                        ) : (
                          <Stack direction="row" alignItems="center" spacing={0.35}>
                            {row.thumbs_up ? (
                              <ThumbUpIcon fontSize="small" color="primary" />
                            ) : (
                              <ThumbUpOutlinedIcon fontSize="small" color="disabled" />
                            )}
                            <Typography
                              variant="caption"
                              color="text.secondary"
                              sx={{ fontVariantNumeric: 'tabular-nums', fontSize: '0.7rem' }}
                            >
                              {row.thumbs_up_count ?? 0}
                            </Typography>
                          </Stack>
                        )}
                      </Stack>
                      <Box sx={{ mb: 0.5, mt: -0.25, display: 'flex', alignItems: 'center', overflow: 'hidden' }}>
                        <AuctionCategoryListBlock row={row} dense />
                      </Box>
                      <Typography
                        variant="body2"
                        sx={{
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                          lineHeight: 1.25,
                          mb: 0.5,
                          fontSize: '0.8125rem',
                        }}
                      >
                        {row.title}
                      </Typography>
                      <Stack direction="row" spacing={0.75} sx={{ mb: 0.5 }} flexWrap="wrap" useFlexGap>
                        <Typography variant="caption" color="text.secondary">
                          P{row.priority ?? '—'}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                          Need {formatNeedScoreRaw(row.need_score)}
                        </Typography>
                      </Stack>
                      <Stack
                        direction="row"
                        justifyContent="space-between"
                        alignItems="baseline"
                        flexWrap="wrap"
                        gap={0.25}
                      >
                        <Typography variant="body2" fontWeight={700} component="span" sx={{ fontSize: '0.95rem' }}>
                          {formatCurrency(row.current_price)}
                        </Typography>
                        <Tooltip
                          title={
                            row.retail_source === 'manifest'
                              ? `From manifest: ${formatCurrencyWhole(row.total_retail_display ?? row.total_retail_value)}`
                              : `From listing: ${formatCurrencyWhole(row.total_retail_display ?? row.total_retail_value)}`
                          }
                        >
                          <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
                            Retail {formatCurrencyWhole(row.total_retail_display ?? row.total_retail_value)}
                          </Typography>
                        </Tooltip>
                      </Stack>
                      <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.25, fontVariantNumeric: 'tabular-nums' }}>
                        Price / retail {priceRetailPct} · Cost / retail {costPct}
                      </Typography>
                      <Stack
                        direction="row"
                        justifyContent="space-between"
                        alignItems="center"
                        width="100%"
                        sx={{ mt: 0.5 }}
                      >
                        <Typography
                          variant="caption"
                          sx={{ ...timeRemainingSx(row.end_time), fontSize: '0.75rem' }}
                        >
                          {formatTimeRemainingShort(row.end_time)}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
                          {row.bid_count != null ? `${row.bid_count} bids` : '—'}
                        </Typography>
                      </Stack>
                    </CardContent>
                  </CardActionArea>
                </Card>
              );
            })}
          </Stack>
        )}
      </Box>

      {hasNextPage ? (
        <Button
          variant="outlined"
          fullWidth
          size="small"
          onClick={() => onLoadMore()}
          disabled={isFetchingNextPage}
          startIcon={isFetchingNextPage ? <CircularProgress size={18} color="inherit" /> : undefined}
        >
          {isFetchingNextPage
            ? 'Loading…'
            : `Load more (${remainingCount} remaining)`}
        </Button>
      ) : null}
    </Box>
  );
}
