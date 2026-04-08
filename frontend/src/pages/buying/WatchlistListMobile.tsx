import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Typography,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import { formatCurrency } from '../../utils/format';
import {
  formatTimeRemaining,
  timeRemainingSx,
  timeUrgency,
} from '../../utils/buyingAuctionList';
import { WATCHLIST_MOBILE_SORT_OPTIONS } from '../../utils/buyingWatchlistList';
import type { BuyingWatchlistAuctionItem } from '../../types/buying.types';

const MOBILE_PRESET_VALUES = new Set<string>(WATCHLIST_MOBILE_SORT_OPTIONS.map((o) => o.value));

function priorityLabel(p: string | undefined): string {
  if (!p) return '';
  return p.charAt(0).toUpperCase() + p.slice(1);
}

export type WatchlistListMobileProps = {
  ordering: string;
  onOrderingChange: (ordering: string) => void;
  rows: BuyingWatchlistAuctionItem[];
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  isLoading: boolean;
  remainingCount: number;
  onLoadMore: () => void;
  onRowNavigate: (id: number) => void;
  onRemove: (auctionId: number) => void;
  removingId: number | null;
};

export default function WatchlistListMobile({
  ordering,
  onOrderingChange,
  rows,
  hasNextPage,
  isFetchingNextPage,
  isLoading,
  remainingCount,
  onLoadMore,
  onRowNavigate,
  onRemove,
  removingId,
}: WatchlistListMobileProps) {
  return (
    <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
      <FormControl fullWidth size="small">
        <InputLabel id="watchlist-mobile-sort">Sort</InputLabel>
        <Select
          labelId="watchlist-mobile-sort"
          label="Sort"
          value={ordering}
          onChange={(e) => onOrderingChange(e.target.value)}
        >
          {WATCHLIST_MOBILE_SORT_OPTIONS.map((opt) => (
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
            {rows.map((row) => (
              <Card key={row.id} variant="outlined" sx={{ borderRadius: 1 }}>
                <CardContent sx={{ py: 0.75, px: 1.25, '&:last-child': { pb: 0.75 }, position: 'relative' }}>
                  <Stack direction="row" justifyContent="space-between" alignItems="flex-start" gap={1} sx={{ mb: 0.25 }}>
                    <Typography
                      variant="caption"
                      color="primary"
                      sx={{ fontWeight: 600, lineHeight: 1.2, flex: 1 }}
                    >
                      {row.marketplace?.name ?? '—'}
                    </Typography>
                    <Chip size="small" label={priorityLabel(row.watchlist_entry?.priority)} variant="outlined" />
                  </Stack>
                  <Box
                    onClick={() => onRowNavigate(row.id)}
                    sx={{ cursor: 'pointer' }}
                  >
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
                      <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
                        Retail {formatCurrency(row.total_retail_value)}
                      </Typography>
                    </Stack>
                    <Box
                      sx={(theme) => {
                        const u = timeUrgency(row.end_time);
                        const base = { mt: 0.5 };
                        if (u === 'urgent') {
                          return {
                            ...base,
                            pl: 1,
                            pr: 0.75,
                            py: 0.35,
                            borderRadius: 1,
                            borderLeft: '4px solid',
                            borderColor: 'error.main',
                            bgcolor: alpha(theme.palette.error.main, 0.12),
                          };
                        }
                        if (u === 'soon') {
                          return {
                            ...base,
                            pl: 1,
                            pr: 0.75,
                            py: 0.35,
                            borderRadius: 1,
                            borderLeft: '4px solid',
                            borderColor: 'warning.main',
                            bgcolor: alpha(theme.palette.warning.main, 0.14),
                          };
                        }
                        return base;
                      }}
                    >
                      <Stack direction="row" justifyContent="space-between" alignItems="center" width="100%">
                        <Typography
                          variant="caption"
                          sx={{ ...timeRemainingSx(row.end_time), fontSize: '0.7rem' }}
                        >
                          {formatTimeRemaining(row.end_time)}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
                          {row.bid_count != null ? `${row.bid_count} bids` : '—'}
                        </Typography>
                      </Stack>
                    </Box>
                  </Box>
                  <Button
                    size="small"
                    variant="text"
                    color="inherit"
                    sx={{ mt: 0.5, fontSize: '0.75rem' }}
                    disabled={removingId === row.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemove(row.id);
                    }}
                  >
                    {removingId === row.id ? 'Removing…' : 'Remove from watchlist'}
                  </Button>
                </CardContent>
              </Card>
            ))}
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
