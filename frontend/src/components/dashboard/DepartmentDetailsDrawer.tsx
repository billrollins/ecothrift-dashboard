/**
 * What is behind a department number (owner 2026-10-22): tap an Actual or a day cell and this opens. A side drawer on a
 * desk, a bottom sheet on a phone. Buying lists its orders; Processing and Restoration list each person.
 */
import {
  Alert,
  Box,
  Drawer,
  IconButton,
  LinearProgress,
  Link,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { Link as RouterLink } from 'react-router-dom';
import { getDashboardDepartmentDetails } from '../../api/pos.api';
import type { DepartmentDetails, DepartmentDetailsKey } from '../../types/pos.types';
import { IconClose as Close } from '../../icons/ecoIcons';
import { dashboardPalette } from './dashboardCardStyles';
import { formatDashboardCurrency, shortDate } from './dashboardFormatters';
import { periodLabel, processedItemsHref, type DetailsPeriod } from './departmentPeriods';
import { DashboardPhoneSheet } from './phone/DashboardPhoneSheet';
import { useDashboardLayout } from './useDashboardLayout';

export interface DepartmentDetailsRequest {
  department: DepartmentDetailsKey;
  /** "Buying", shown with the metric name. */
  label: string;
  metricLabel: string;
  period: DetailsPeriod;
}

const money = (value: string | null) => (value == null ? 'No cost yet' : formatDashboardCurrency(value));
const count = (n: number) => n.toLocaleString('en-US');

const tableSx = {
  '& th, & td': { px: { xs: 0.75, sm: 1 }, py: 0.75, fontSize: { xs: '0.8rem', sm: '0.85rem' } },
  '& th': { fontWeight: 800, color: 'text.secondary', whiteSpace: 'nowrap' },
  '& tfoot td, & tr.total td': { fontWeight: 900, borderBottom: 0 },
} as const;

function Summary({ children }: { children: string }) {
  return (
    <Typography sx={{ fontWeight: 800, fontSize: '0.95rem', mb: 1, color: dashboardPalette.greenDark }}>
      {children}
    </Typography>
  );
}

function Empty() {
  return (
    <Typography color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>
      Nothing in this period.
    </Typography>
  );
}

function BuyingTable({ data }: { data: Extract<DepartmentDetails, { department: 'buying' }> }) {
  if (!data.rows.length) return <Empty />;
  return (
    <>
      <Summary>{`${count(data.totals.orders)} order${data.totals.orders === 1 ? '' : 's'} · ${formatDashboardCurrency(data.totals.total_cost)}`}</Summary>
      <Table size="small" aria-label="Orders bought" sx={tableSx}>
        <TableHead>
          <TableRow>
            <TableCell>Order</TableCell>
            <TableCell>Date</TableCell>
            <TableCell align="right">Cost</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {data.rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell sx={{ maxWidth: 0, width: '100%' }}>
                <Link component={RouterLink} to={`/inventory/orders/${row.id}`} sx={{ fontWeight: 800 }}>
                  {row.order_number}
                </Link>
                <Typography variant="caption" color="text.secondary" noWrap component="div" title={row.description || row.vendor}>
                  {[row.vendor, row.status_label].filter(Boolean).join(' · ')}
                </Typography>
              </TableCell>
              <TableCell sx={{ whiteSpace: 'nowrap' }}>{row.ordered_date ? shortDate(row.ordered_date) : ''}</TableCell>
              <TableCell align="right" sx={{ whiteSpace: 'nowrap', fontWeight: 700 }}>{money(row.total_cost)}</TableCell>
            </TableRow>
          ))}
          <TableRow className="total">
            <TableCell colSpan={2}>Total</TableCell>
            <TableCell align="right">{formatDashboardCurrency(data.totals.total_cost)}</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </>
  );
}

function ProcessingTable({ data, period }: { data: Extract<DepartmentDetails, { department: 'processing' }>; period: DetailsPeriod }) {
  if (!data.rows.length) return <Empty />;
  const { totals } = data;
  return (
    <>
      <Summary>
        {`${count(totals.items)} items · ${formatDashboardCurrency(totals.total_price)} at our price · ${formatDashboardCurrency(totals.total_retail)} retail`}
      </Summary>
      <Table size="small" aria-label="Processed by person" sx={tableSx}>
        <TableHead>
          <TableRow>
            <TableCell>Person</TableCell>
            <TableCell align="right">Items</TableCell>
            <TableCell align="right">Price</TableCell>
            <TableCell align="right">Retail</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {data.rows.map((row) => (
            <TableRow key={row.user_id ?? 'none'}>
              <TableCell sx={{ maxWidth: 0, width: '100%' }}>
                <Link
                  component={RouterLink}
                  to={processedItemsHref(row.user_id, period)}
                  aria-label={`${row.name}: open these ${row.items} items in Inventory search`}
                  sx={{ fontWeight: 800, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                >
                  {row.name}
                </Link>
              </TableCell>
              <TableCell align="right">{count(row.items)}</TableCell>
              <TableCell align="right" sx={{ whiteSpace: 'nowrap', fontWeight: 700 }}>{formatDashboardCurrency(row.total_price)}</TableCell>
              <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                {formatDashboardCurrency(row.total_retail)}
                {row.missing_retail > 0 && (
                  <Typography variant="caption" color="text.secondary" component="div" sx={{ lineHeight: 1.1 }}>
                    {row.missing_retail} without
                  </Typography>
                )}
              </TableCell>
            </TableRow>
          ))}
          <TableRow className="total">
            <TableCell>Total</TableCell>
            <TableCell align="right">{count(totals.items)}</TableCell>
            <TableCell align="right">{formatDashboardCurrency(totals.total_price)}</TableCell>
            <TableCell align="right">{formatDashboardCurrency(totals.total_retail)}</TableCell>
          </TableRow>
        </TableBody>
      </Table>
      <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 1 }}>
        Tap a name to see their items in Inventory search.
        {totals.missing_retail > 0 ? ` ${totals.missing_retail} item${totals.missing_retail === 1 ? ' has' : 's have'} no retail, so retail is low.` : ''}
      </Typography>
    </>
  );
}

function RestorationTable({ data }: { data: Extract<DepartmentDetails, { department: 'restoration' }> }) {
  if (!data.rows.length) return <Empty />;
  const { totals } = data;
  return (
    <>
      <Summary>{`${count(totals.items)} item${totals.items === 1 ? '' : 's'} finished · ${formatDashboardCurrency(totals.value_added)} value added`}</Summary>
      <Table size="small" aria-label="Finished by person" sx={tableSx}>
        <TableHead>
          <TableRow>
            <TableCell>Person</TableCell>
            <TableCell align="right">Items</TableCell>
            <TableCell align="right">Value added</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {data.rows.map((row) => (
            <TableRow key={row.user_id ?? 'none'}>
              <TableCell sx={{ fontWeight: 800 }}>{row.name}</TableCell>
              <TableCell align="right">{count(row.items)}</TableCell>
              <TableCell align="right" sx={{ whiteSpace: 'nowrap', fontWeight: 700 }}>
                {formatDashboardCurrency(row.value_added)}
                {row.unmeasured > 0 && (
                  <Typography variant="caption" color="text.secondary" component="div" sx={{ lineHeight: 1.1, fontWeight: 400 }}>
                    {row.unmeasured} not measured
                  </Typography>
                )}
              </TableCell>
            </TableRow>
          ))}
          <TableRow className="total">
            <TableCell>Total</TableCell>
            <TableCell align="right">{count(totals.items)}</TableCell>
            <TableCell align="right">{formatDashboardCurrency(totals.value_added)}</TableCell>
          </TableRow>
        </TableBody>
      </Table>
      {totals.unmeasured > 0 && (
        <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 1 }}>
          Not measured: the job had no starting grade or price, so its value added is unknown.
        </Typography>
      )}
    </>
  );
}

function DetailsBody({ request }: { request: DepartmentDetailsRequest }) {
  const { department, period } = request;
  const query = useQuery({
    queryKey: ['dashboard', 'department-details', department, period.start, period.end],
    queryFn: async () => (await getDashboardDepartmentDetails({ department, ...period })).data,
    staleTime: 30_000,
  });
  if (query.isError) return <Alert severity="error">Could not load the details. Try again.</Alert>;
  const data = query.data;
  if (!data) return <LinearProgress sx={{ my: 2 }} aria-label="Loading details" />;
  if (data.department === 'buying') return <BuyingTable data={data} />;
  if (data.department === 'processing') return <ProcessingTable data={data} period={period} />;
  return <RestorationTable data={data} />;
}

export function DepartmentDetailsDrawer({
  request,
  onClose,
}: {
  request: DepartmentDetailsRequest | null;
  onClose: () => void;
}) {
  const { isMobile } = useDashboardLayout();
  const title = request?.label ?? '';
  const when = request ? `${request.metricLabel} · ${periodLabel(request.period)}` : '';

  if (isMobile) {
    return (
      <DashboardPhoneSheet open={request !== null} title={title} onClose={onClose}>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>{when}</Typography>
        {request && <DetailsBody request={request} />}
      </DashboardPhoneSheet>
    );
  }

  return (
    <Drawer
      anchor="right"
      open={request !== null}
      onClose={onClose}
      PaperProps={{ sx: { width: 500, maxWidth: '100vw', bgcolor: dashboardPalette.surface }, role: 'dialog', 'aria-label': `${title} details` }}
    >
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, px: 2.5, pt: 2, pb: 1 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="h6" sx={{ fontWeight: 900, lineHeight: 1.2 }}>{title}</Typography>
          <Typography variant="body2" color="text.secondary">{when}</Typography>
        </Box>
        <IconButton onClick={onClose} aria-label="Close" sx={{ mt: -0.5 }}>
          <Close />
        </IconButton>
      </Box>
      <Box sx={{ px: 2.5, pb: 3, overflowY: 'auto' }}>{request && <DetailsBody request={request} />}</Box>
    </Drawer>
  );
}
