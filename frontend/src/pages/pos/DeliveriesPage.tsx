import { useMemo, useState, type FormEvent } from 'react';
import {
  Box,
  Button,
  Chip,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import Add from '@mui/icons-material/Add';
import MapOutlined from '@mui/icons-material/MapOutlined';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import { useSnackbar } from 'notistack';
import { format, addDays } from 'date-fns';
import { PageHeader } from '../../components/common/PageHeader';
import { LoadingScreen } from '../../components/feedback/LoadingScreen';
import { useAuth } from '../../contexts/AuthContext';
import {
  useCreateDeliveryAvailability,
  useDeleteDeliveryAvailability,
  useDeliveryAvailabilities,
  useDeliveryJobs,
  useUpdateDeliveryAvailability,
  useUpdateDeliveryJob,
} from '../../hooks/usePOS';
import type { DeliveryAvailability, DeliveryJob, DeliveryJobStatus } from '../../types/pos.types';

/** Eco-Thrift Canfield — matches POS delivery distance store pin. */
const STORE_ORIGIN = '8425 West Center Road, Omaha, NE 68124';

function formatTime(value: string): string {
  return String(value || '').slice(0, 5);
}

function formatMoney(value: string | number): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num ?? 0);
}

function jobStopAddress(job: DeliveryJob): string {
  const base = (job.address || '').trim();
  if (!base) return '';
  if (job.is_apt && job.unit) return `${base}, Unit ${job.unit}`;
  return base;
}

/**
 * Google Maps multi-stop directions URL (browser). Does not re-order stops;
 * waypoint optimize needs Directions API (paid Maps key).
 * Intermediate stops capped at 9 (Maps URL practical limit).
 */
function buildGoogleMapsRouteUrl(stops: string[]): string | null {
  const cleaned = stops.map((s) => s.trim()).filter(Boolean);
  if (cleaned.length === 0) return null;
  const capped = cleaned.slice(0, 10);
  const origin = encodeURIComponent(STORE_ORIGIN);
  const destination = encodeURIComponent(capped[capped.length - 1]);
  const mid = capped.slice(0, -1);
  let url =
    `https://www.google.com/maps/dir/?api=1` +
    `&origin=${origin}` +
    `&destination=${destination}` +
    `&travelmode=driving`;
  if (mid.length > 0) {
    url += `&waypoints=${mid.map(encodeURIComponent).join('%7C')}`;
  }
  return url;
}

const STATUS_COLORS: Record<DeliveryJobStatus, 'default' | 'success' | 'warning' | 'error' | 'info'> = {
  scheduled: 'info',
  completed: 'success',
  cancelled: 'default',
  failed: 'error',
};

export default function DeliveriesPage() {
  const { enqueueSnackbar } = useSnackbar();
  const { hasRole } = useAuth();
  const canManage = hasRole('Manager') || hasRole('Admin');

  const today = useMemo(() => format(new Date(), 'yyyy-MM-dd'), []);
  const defaultHorizon = useMemo(() => format(addDays(new Date(), 60), 'yyyy-MM-dd'), []);

  const [jobStatusFilter, setJobStatusFilter] = useState<string>('scheduled');
  const [dateFrom, setDateFrom] = useState(today);
  const [dateTo, setDateTo] = useState(defaultHorizon);
  const [routeDate, setRouteDate] = useState(today);

  const [formDate, setFormDate] = useState(today);
  const [formStart, setFormStart] = useState('09:00');
  const [formEnd, setFormEnd] = useState('15:00');
  const [formCrew, setFormCrew] = useState<1 | 2>(2);
  const [formAssigned, setFormAssigned] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);

  const availParams = useMemo(
    () => ({ date_from: dateFrom || undefined, date_to: dateTo || undefined }),
    [dateFrom, dateTo],
  );
  const jobParams = useMemo(
    () => ({
      date_from: dateFrom || undefined,
      date_to: dateTo || undefined,
      ...(jobStatusFilter ? { status: jobStatusFilter } : {}),
    }),
    [dateFrom, dateTo, jobStatusFilter],
  );

  const { data: availabilities = [], isLoading: availLoading } =
    useDeliveryAvailabilities(availParams);
  const { data: jobs = [], isLoading: jobsLoading } = useDeliveryJobs(jobParams);

  const createAvail = useCreateDeliveryAvailability();
  const updateAvail = useUpdateDeliveryAvailability();
  const deleteAvail = useDeleteDeliveryAvailability();
  const updateJob = useUpdateDeliveryJob();

  const resetForm = () => {
    setEditingId(null);
    setFormDate(today);
    setFormStart('09:00');
    setFormEnd('15:00');
    setFormCrew(2);
    setFormAssigned('');
    setFormNotes('');
  };

  const startEdit = (row: DeliveryAvailability) => {
    setEditingId(row.id);
    setFormDate(row.date);
    setFormStart(formatTime(row.time_start));
    setFormEnd(formatTime(row.time_end));
    setFormCrew(row.crew_size === 1 ? 1 : 2);
    setFormAssigned(row.assigned_to || '');
    setFormNotes(row.notes || '');
  };

  const handleSaveAvailability = async (e: FormEvent) => {
    e.preventDefault();
    if (!canManage) return;
    const payload = {
      date: formDate,
      time_start: formStart.length === 5 ? `${formStart}:00` : formStart,
      time_end: formEnd.length === 5 ? `${formEnd}:00` : formEnd,
      crew_size: formCrew,
      assigned_to: formAssigned.trim(),
      notes: formNotes.trim(),
      is_active: true,
    };
    try {
      if (editingId != null) {
        await updateAvail.mutateAsync({ id: editingId, data: payload });
        enqueueSnackbar('Delivery date updated', { variant: 'success' });
      } else {
        await createAvail.mutateAsync(payload);
        enqueueSnackbar('Delivery date added', { variant: 'success' });
      }
      resetForm();
    } catch (err: unknown) {
      const detail =
        (err as { response?: { data?: { detail?: string; time_end?: string[] } } })?.response?.data;
      const msg =
        detail?.detail ||
        detail?.time_end?.[0] ||
        'Failed to save delivery date';
      enqueueSnackbar(msg, { variant: 'error' });
    }
  };

  const handleDeactivate = async (id: number) => {
    if (!canManage) return;
    try {
      await deleteAvail.mutateAsync(id);
      enqueueSnackbar('Delivery date deactivated', { variant: 'info' });
      if (editingId === id) resetForm();
    } catch {
      enqueueSnackbar('Failed to deactivate date', { variant: 'error' });
    }
  };

  const handleJobStatus = async (id: number, status: DeliveryJobStatus) => {
    if (!canManage) return;
    try {
      await updateJob.mutateAsync({ id, data: { status } });
      enqueueSnackbar(`Marked ${status}`, { variant: 'success' });
    } catch {
      enqueueSnackbar('Failed to update delivery', { variant: 'error' });
    }
  };

  const handleOpenGoogleRoute = () => {
    const dayJobs = jobs.filter((j) => j.scheduled_date === routeDate && j.status === 'scheduled');
    const stops = dayJobs.map(jobStopAddress).filter(Boolean);
    if (stops.length === 0) {
      enqueueSnackbar('No scheduled stops with addresses for that date.', { variant: 'warning' });
      return;
    }
    const url = buildGoogleMapsRouteUrl(stops);
    if (!url) return;
    if (stops.length > 10) {
      enqueueSnackbar(
        `Maps URL supports ~10 stops; opened first 10 of ${stops.length}. Best-path optimize needs a Maps Directions key.`,
        { variant: 'info' },
      );
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const jobColumns: GridColDef[] = [
    { field: 'scheduled_date', headerName: 'Date', width: 110 },
    {
      field: 'window',
      headerName: 'Window',
      width: 110,
      valueGetter: (_v, row) =>
        `${formatTime(row.availability_time_start)}–${formatTime(row.availability_time_end)}`,
    },
    { field: 'customer_name', headerName: 'Customer', flex: 1, minWidth: 140 },
    { field: 'phone', headerName: 'Phone', width: 120 },
    {
      field: 'address',
      headerName: 'Address',
      flex: 1.2,
      minWidth: 180,
      valueGetter: (_v, row) =>
        row.is_apt && row.unit ? `${row.address} #${row.unit}` : row.address,
    },
    { field: 'items_delivered', headerName: 'Items', flex: 1, minWidth: 160 },
    { field: 'item_count', headerName: '#', width: 60 },
    {
      field: 'fee',
      headerName: 'Fee',
      width: 90,
      valueFormatter: (v) => formatMoney(String(v ?? 0)),
    },
    {
      field: 'crew',
      headerName: 'Crew',
      width: 90,
      valueGetter: (_v, row) =>
        `${row.availability_crew_size ?? '—'}p${
          row.availability_assigned_to ? ` ${row.availability_assigned_to}` : ''
        }`,
    },
    {
      field: 'status',
      headerName: 'Status',
      width: 120,
      renderCell: (params) => (
        <Chip
          size="small"
          label={params.value}
          color={STATUS_COLORS[params.value as DeliveryJobStatus] ?? 'default'}
        />
      ),
    },
    ...(canManage
      ? [
          {
            field: 'actions',
            headerName: 'Update',
            width: 220,
            sortable: false,
            renderCell: (params) => (
              <Stack direction="row" spacing={0.5}>
                {params.row.status === 'scheduled' && (
                  <>
                    <Button size="small" onClick={() => handleJobStatus(params.row.id, 'completed')}>
                      Done
                    </Button>
                    <Button size="small" onClick={() => handleJobStatus(params.row.id, 'cancelled')}>
                      Cancel
                    </Button>
                  </>
                )}
                {params.row.status !== 'scheduled' && (
                  <Button size="small" onClick={() => handleJobStatus(params.row.id, 'scheduled')}>
                    Reopen
                  </Button>
                )}
              </Stack>
            ),
          } as GridColDef,
        ]
      : []),
  ];

  if (availLoading && jobsLoading) {
    return <LoadingScreen />;
  }

  return (
    <Box>
      <PageHeader
        title="Deliveries"
        subtitle="Scheduled appliance deliveries and the dates cashiers can book."
      />

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 2 }} alignItems={{ sm: 'center' }}>
        <TextField
          label="From"
          type="date"
          size="small"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          slotProps={{ inputLabel: { shrink: true } }}
        />
        <TextField
          label="To"
          type="date"
          size="small"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          slotProps={{ inputLabel: { shrink: true } }}
        />
        <FormControl size="small" sx={{ minWidth: 160 }}>
          <InputLabel>Job status</InputLabel>
          <Select
            label="Job status"
            value={jobStatusFilter}
            onChange={(e) => setJobStatusFilter(e.target.value)}
          >
            <MenuItem value="">All</MenuItem>
            <MenuItem value="scheduled">Scheduled</MenuItem>
            <MenuItem value="completed">Completed</MenuItem>
            <MenuItem value="cancelled">Cancelled</MenuItem>
            <MenuItem value="failed">Failed</MenuItem>
          </Select>
        </FormControl>
        <TextField
          label="Route day"
          type="date"
          size="small"
          value={routeDate}
          onChange={(e) => setRouteDate(e.target.value)}
          slotProps={{ inputLabel: { shrink: true } }}
        />
        <Button
          variant="outlined"
          startIcon={<MapOutlined />}
          onClick={handleOpenGoogleRoute}
        >
          Open Google Maps route
        </Button>
      </Stack>

      <Typography variant="h6" sx={{ mb: 1 }}>
        Scheduled deliveries
      </Typography>
      <Paper sx={{ height: 420, mb: 4 }}>
        <DataGrid
          rows={jobs}
          columns={jobColumns}
          density="compact"
          disableRowSelectionOnClick
          pageSizeOptions={[25, 50, 100]}
          initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
          localeText={{ noRowsLabel: 'No deliveries in this range.' }}
        />
      </Paper>

      <Typography variant="h6" sx={{ mb: 1 }}>
        Available dates
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Set date, time window, who is delivering, and 1- vs 2-person crew. Counts show items and
        deliveries already booked on that window.
      </Typography>

      {canManage && (
        <Paper
          component="form"
          onSubmit={handleSaveAvailability}
          sx={{ p: 2, mb: 2, border: 1, borderColor: 'divider' }}
        >
          <Stack
            direction={{ xs: 'column', md: 'row' }}
            spacing={1.5}
            useFlexGap
            flexWrap="wrap"
            alignItems={{ md: 'flex-end' }}
          >
            <TextField
              label="Date"
              type="date"
              size="small"
              required
              value={formDate}
              onChange={(e) => setFormDate(e.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
            />
            <TextField
              label="Start"
              type="time"
              size="small"
              required
              value={formStart}
              onChange={(e) => setFormStart(e.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
            />
            <TextField
              label="End"
              type="time"
              size="small"
              required
              value={formEnd}
              onChange={(e) => setFormEnd(e.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
            />
            <FormControl size="small" sx={{ minWidth: 120 }}>
              <InputLabel>Crew</InputLabel>
              <Select
                label="Crew"
                value={formCrew}
                onChange={(e) => setFormCrew(Number(e.target.value) as 1 | 2)}
              >
                <MenuItem value={1}>1 person</MenuItem>
                <MenuItem value={2}>2 people</MenuItem>
              </Select>
            </FormControl>
            <TextField
              label="Who"
              size="small"
              value={formAssigned}
              onChange={(e) => setFormAssigned(e.target.value)}
              placeholder="Driver names"
              sx={{ minWidth: 180 }}
            />
            <TextField
              label="Notes"
              size="small"
              value={formNotes}
              onChange={(e) => setFormNotes(e.target.value)}
              sx={{ minWidth: 180, flex: 1 }}
            />
            <Button
              type="submit"
              variant="contained"
              startIcon={<Add />}
              disabled={createAvail.isPending || updateAvail.isPending}
            >
              {editingId != null ? 'Update date' : 'Add date'}
            </Button>
            {editingId != null && (
              <Button type="button" onClick={resetForm}>
                Cancel edit
              </Button>
            )}
          </Stack>
        </Paper>
      )}

      <Paper variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Date</TableCell>
              <TableCell>Times</TableCell>
              <TableCell>Crew</TableCell>
              <TableCell>Who</TableCell>
              <TableCell align="right">Deliveries</TableCell>
              <TableCell align="right">Items</TableCell>
              <TableCell>Active</TableCell>
              {canManage && <TableCell align="right">Actions</TableCell>}
            </TableRow>
          </TableHead>
          <TableBody>
            {availabilities.length === 0 ? (
              <TableRow>
                <TableCell colSpan={canManage ? 8 : 7}>
                  <Typography variant="body2" color="text.secondary">
                    No available dates in this range.
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              availabilities.map((row) => (
                <TableRow key={row.id} hover selected={editingId === row.id}>
                  <TableCell>{row.date}</TableCell>
                  <TableCell>
                    {formatTime(row.time_start)}–{formatTime(row.time_end)}
                  </TableCell>
                  <TableCell>{row.crew_size === 1 ? '1 person' : '2 people'}</TableCell>
                  <TableCell>{row.assigned_to || '—'}</TableCell>
                  <TableCell align="right">{row.delivery_count}</TableCell>
                  <TableCell align="right">{row.items_booked}</TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      label={row.is_active ? 'Yes' : 'Off'}
                      color={row.is_active ? 'success' : 'default'}
                    />
                  </TableCell>
                  {canManage && (
                    <TableCell align="right">
                      <Button size="small" onClick={() => startEdit(row)}>
                        Edit
                      </Button>
                      {row.is_active && (
                        <Button size="small" color="warning" onClick={() => handleDeactivate(row.id)}>
                          Deactivate
                        </Button>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Paper>
    </Box>
  );
}
