import {
  Box,
  Button,
  Card,
  CardActionArea,
  CardContent,
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
  MOBILE_SORT_OPTIONS,
  timeRemainingSx,
  timeUrgency,
} from '../../utils/buyingAuctionList';
import type { BuyingAuctionListItem } from '../../types/buying.types';

const MOBILE_PRESET_VALUES = new Set<string>(MOBILE_SORT_OPTIONS.map((o) => o.value));

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
}: AuctionListMobileProps) {
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
            {rows.map((row) => (
              <Card key={row.id} variant="outlined" sx={{ borderRadius: 1 }}>
                <CardActionArea onClick={() => onRowNavigate(row.id)}>
                  <CardContent
                    sx={{
                      py: 0.75,
                      px: 1.25,
                      '&:last-child': { pb: 0.75 },
                    }}
                  >
                    <Typography
                      variant="caption"
                      color="primary"
                      display="block"
                      sx={{ fontWeight: 600, mb: 0.25, lineHeight: 1.2 }}
                    >
                      {row.marketplace?.name ?? '—'}
                    </Typography>
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
                  </CardContent>
                </CardActionArea>
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
