/**
 * Inventory search filtered to the items one person put on the floor in a period (owner 2026-10-22). Opened from a
 * Processing row in the Dashboard's details drawer: `/inventory/search?processed_by=<id|none>&from=&to=`.
 * A table on a desk, a list on a phone; each SKU opens the standard item view.
 */
import {
  Box,
  Button,
  LinearProgress,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { getDashboardProcessedItems } from '../../api/pos.api';
import { PageHeader } from '../../components/common/PageHeader';
import { ObjectLink } from '../../components/objects/ObjectModal';
import { periodLabel } from '../../components/dashboard/departmentPeriods';
import { formatCurrency } from '../../utils/format';
import type { ProcessedItemRow } from '../../types/pos.types';

function shortDay(iso: string): string {
  const date = new Date(`${iso}T12:00:00`);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric' });
}

function money(value: string | null): string {
  return value == null ? '' : formatCurrency(value);
}

function PhoneRow({ item }: { item: ProcessedItemRow }) {
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 1, py: 1, borderBottom: 1, borderColor: 'divider' }}>
      <Box sx={{ minWidth: 0 }}>
        <ObjectLink type="item" id={item.id} label={item.sku} />
        <Typography variant="body2" noWrap title={item.title}>{item.title}</Typography>
        <Typography variant="caption" color="text.secondary">{`${item.status_label} · ${shortDay(item.processed_on)}`}</Typography>
      </Box>
      <Box sx={{ textAlign: 'right' }}>
        <Typography variant="body2" sx={{ fontWeight: 800 }}>{money(item.price)}</Typography>
        <Typography variant="caption" color="text.secondary">{item.retail != null ? `${money(item.retail)} retail` : 'No retail'}</Typography>
      </Box>
    </Box>
  );
}

export function ProcessedItemsView({
  user,
  from,
  to,
  page,
  setParam,
}: {
  user: string;
  from: string;
  to: string;
  page: number;
  setParam: (changes: Record<string, string | null>) => void;
}) {
  const theme = useTheme();
  const isPhone = useMediaQuery(theme.breakpoints.down('sm'));
  const { data, isFetching, isError } = useQuery({
    queryKey: ['dashboard', 'processed-items', user, from, to, page],
    queryFn: async () => (await getDashboardProcessedItems({ user, start: from, end: to, page })).data,
    placeholderData: keepPreviousData,
  });
  const rows = data?.results ?? [];
  const when = from && to ? periodLabel({ start: from, end: to }) : '';

  return (
    <Box>
      <PageHeader title="Inventory search" dense />
      <Paper
        variant="outlined"
        sx={{ p: 1.5, mb: 1, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1.5 }}
      >
        <Box sx={{ flex: 1, minWidth: 220 }}>
          <Typography sx={{ fontWeight: 800 }}>
            {data ? `Put on the floor by ${data.name}` : 'Put on the floor'}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {[
              when,
              data ? `${data.count.toLocaleString()} item${data.count === 1 ? '' : 's'}` : null,
              data ? `${formatCurrency(data.total_price)} at our price` : null,
              data ? `${formatCurrency(data.total_retail)} retail` : null,
            ].filter(Boolean).join(' · ')}
          </Typography>
        </Box>
        <Button
          variant="outlined"
          size="small"
          onClick={() => setParam({ processed_by: null, from: null, to: null, page: null })}
        >
          Search all inventory
        </Button>
      </Paper>
      <Box sx={{ height: 4, mb: 0.5 }}>{isFetching && <LinearProgress />}</Box>
      {isError && (
        <Typography color="error" sx={{ mb: 1 }}>Could not load these items. Try again.</Typography>
      )}
      {isPhone ? (
        <Box>{rows.map((item) => <PhoneRow key={item.id} item={item} />)}</Box>
      ) : (
        <TableContainer component={Paper} variant="outlined">
          <Table size="small" stickyHeader aria-label="Items put on the floor" sx={{ '& th': { whiteSpace: 'nowrap' } }}>
            <TableHead>
              <TableRow>
                <TableCell>SKU</TableCell>
                <TableCell>Product</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>On the floor</TableCell>
                <TableCell align="right">Price</TableCell>
                <TableCell align="right">Retail</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((item) => (
                <TableRow key={item.id} hover>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}><ObjectLink type="item" id={item.id} label={item.sku} /></TableCell>
                  <TableCell sx={{ width: '100%', maxWidth: 0 }}>
                    <Typography variant="body2" noWrap title={item.title}>{item.title}</Typography>
                  </TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>{item.status_label}</TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>{shortDay(item.processed_on)}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>{money(item.price)}</TableCell>
                  <TableCell align="right">{money(item.retail)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
      {data && !rows.length && (
        <Typography color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>Nothing in this period.</Typography>
      )}
      {data && data.count > data.page_size && (
        <TablePagination
          component="div"
          count={data.count}
          page={page - 1}
          rowsPerPage={data.page_size}
          rowsPerPageOptions={[data.page_size]}
          onPageChange={(_e, next) => setParam({ page: next ? String(next + 1) : null })}
        />
      )}
    </Box>
  );
}
