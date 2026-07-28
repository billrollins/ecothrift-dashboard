import { Link as RouterLink, useParams } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Chip,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { useDeliveryDay } from '../../../../hooks/useDelivery';
import { DeskDayLiveMonitor } from './DeskDayLiveMonitor';

export default function DeskDayDetailPage() {
  const { dayId } = useParams();
  const id = Number(dayId);
  const { data: day, isLoading, isError } = useDeliveryDay(Number.isFinite(id) ? id : undefined);

  if (isLoading) return <Typography color="text.secondary">Loading day…</Typography>;
  if (isError || !day) return <Typography color="error">Day not found.</Typography>;

  return (
    <Box>
      <Button component={RouterLink} to="/pos/deliveries/desk/days" size="small" sx={{ mb: 1 }}>
        ← Back to Days
      </Button>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
        <Typography variant="h6" fontWeight={700}>
          {day.date}
        </Typography>
        <Chip size="small" label={day.display_state} />
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {day.time_start?.slice(0, 5)}–{day.time_end?.slice(0, 5)} ·{' '}
        {day.primary_driver_name || day.assigned_to || 'Unassigned'} · {day.delivery_count}{' '}
        deliveries / {day.items_booked} items
      </Typography>

      {day.display_state === 'planned' && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Inactive planning/review mode. Drivers start today from{' '}
          <Button component={RouterLink} to={`/pos/deliveries/field/days/${day.id}`} size="small">
            Field day board
          </Button>
          .
        </Alert>
      )}

      <DeskDayLiveMonitor day={day} />

      <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1 }}>
        Deliveries
      </Typography>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Customer</TableCell>
            <TableCell>Phone</TableCell>
            <TableCell>Address</TableCell>
            <TableCell>Items</TableCell>
            <TableCell>Status</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {(day.jobs || []).map((job) => (
            <TableRow key={job.id}>
              <TableCell>{job.customer_name}</TableCell>
              <TableCell>{job.phone}</TableCell>
              <TableCell>{job.delivery_address || job.address}</TableCell>
              <TableCell>
                {job.item_count} · {job.items_delivered}
              </TableCell>
              <TableCell>
                <Chip size="small" label={job.status} />
              </TableCell>
            </TableRow>
          ))}
          {(day.jobs || []).length === 0 && (
            <TableRow>
              <TableCell colSpan={5}>
                <Typography color="text.secondary">No deliveries on this day.</Typography>
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </Box>
  );
}
