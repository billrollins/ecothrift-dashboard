import { useEffect, useMemo, useState, type FormEvent, type SyntheticEvent } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Tab,
  Tabs,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import Add from '@mui/icons-material/Add';
import ArrowBack from '@mui/icons-material/ArrowBack';
import ContentCopy from '@mui/icons-material/ContentCopy';
import LocalShippingOutlined from '@mui/icons-material/LocalShippingOutlined';
import MapOutlined from '@mui/icons-material/MapOutlined';
import PhoneOutlined from '@mui/icons-material/PhoneOutlined';
import WarningAmber from '@mui/icons-material/WarningAmber';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import { useSnackbar } from 'notistack';
import { addDays, format, parseISO, isValid } from 'date-fns';
import { useSearchParams } from 'react-router-dom';
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

type DeliveriesTab = 'day' | 'all' | 'schedule';

function formatTime(value: string): string {
  return String(value || '').slice(0, 5);
}

function formatMoney(value: string | number): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num ?? 0);
}

function formatDayLabel(iso: string): string {
  const d = parseISO(iso);
  if (!isValid(d)) return iso;
  return format(d, 'EEE MMM d');
}

function jobStopAddress(job: DeliveryJob): string {
  const base = (job.address || '').trim();
  if (!base) return '';
  if (job.is_apt && job.unit) return `${base}, Unit ${job.unit}`;
  return base;
}

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

function parseTab(raw: string | null): DeliveriesTab {
  if (raw === 'all' || raw === 'schedule') return raw;
  return 'day';
}

const STATUS_COLORS: Record<DeliveryJobStatus, 'default' | 'success' | 'warning' | 'error' | 'info'> = {
  needs_scheduling: 'warning',
  scheduled: 'info',
  completed: 'success',
  cancelled: 'default',
  failed: 'error',
};

function jobNeedsScheduling(job: DeliveryJob): boolean {
  return job.status === 'needs_scheduling' || !job.scheduled_date;
}

export default function DeliveriesPage() {
  const { enqueueSnackbar } = useSnackbar();
  const { hasRole } = useAuth();
  const canManage = hasRole('Manager') || hasRole('Admin');
  const [searchParams, setSearchParams] = useSearchParams();

  const today = useMemo(() => format(new Date(), 'yyyy-MM-dd'), []);
  const defaultHorizon = useMemo(() => format(addDays(new Date(), 60), 'yyyy-MM-dd'), []);

  const tab = parseTab(searchParams.get('tab'));
  const selectedDate = searchParams.get('date') || today;

  const [jobStatusFilter, setJobStatusFilter] = useState<string>('scheduled');
  const [dateFrom, setDateFrom] = useState(today);
  const [dateTo, setDateTo] = useState(defaultHorizon);

  const [formDate, setFormDate] = useState(today);
  const [formStart, setFormStart] = useState('09:00');
  const [formEnd, setFormEnd] = useState('15:00');
  const [formCrew, setFormCrew] = useState<1 | 2>(2);
  const [formAssigned, setFormAssigned] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);

  const [scheduleJob, setScheduleJob] = useState<DeliveryJob | null>(null);
  const [scheduleAvailId, setScheduleAvailId] = useState<number | ''>('');
  const [scheduleNotes, setScheduleNotes] = useState('');
  const [customerMessage, setCustomerMessage] = useState<string | null>(null);
  const [notesJob, setNotesJob] = useState<DeliveryJob | null>(null);
  const [notesDraft, setNotesDraft] = useState('');

  const rangeParams = useMemo(
    () => ({ date_from: dateFrom || undefined, date_to: dateTo || undefined }),
    [dateFrom, dateTo],
  );

  const { data: availabilities = [], isLoading: availLoading } =
    useDeliveryAvailabilities(rangeParams);
  const { data: jobs = [], isLoading: jobsLoading } = useDeliveryJobs(rangeParams);

  const createAvail = useCreateDeliveryAvailability();
  const updateAvail = useUpdateDeliveryAvailability();
  const deleteAvail = useDeleteDeliveryAvailability();
  const updateJob = useUpdateDeliveryJob();

  const setTab = (next: DeliveriesTab) => {
    const params = new URLSearchParams(searchParams);
    params.set('tab', next);
    if (!params.get('date')) params.set('date', selectedDate);
    setSearchParams(params, { replace: true });
  };

  const selectDate = (iso: string, nextTab: DeliveriesTab = 'day') => {
    const params = new URLSearchParams(searchParams);
    params.set('tab', nextTab);
    params.set('date', iso);
    setSearchParams(params, { replace: true });
  };

  const daySlots = useMemo(
    () =>
      availabilities
        .filter((a) => a.is_active)
        .slice()
        .sort((a, b) => a.date.localeCompare(b.date) || a.time_start.localeCompare(b.time_start)),
    [availabilities],
  );

  const needsSchedulingJobs = useMemo(
    () => jobs.filter(jobNeedsScheduling).slice().sort((a, b) => a.id - b.id),
    [jobs],
  );

  const jobsByDate = useMemo(() => {
    const map = new Map<string, DeliveryJob[]>();
    for (const job of jobs) {
      if (!job.scheduled_date) continue;
      const list = map.get(job.scheduled_date) ?? [];
      list.push(job);
      map.set(job.scheduled_date, list);
    }
    return map;
  }, [jobs]);

  const dayRail = useMemo(() => {
    const fromSlots = daySlots.map((slot) => ({
      key: `slot-${slot.id}`,
      date: slot.date,
      slot,
      scheduledCount: (jobsByDate.get(slot.date) ?? []).filter((j) => j.status === 'scheduled').length,
      itemCount: slot.items_booked,
      deliveryCount: slot.delivery_count,
    }));
    const slotDates = new Set(fromSlots.map((r) => r.date));
    const orphanDates = [...jobsByDate.keys()]
      .filter((d) => !slotDates.has(d) && d >= today)
      .sort()
      .map((date) => {
        const dayJobs = jobsByDate.get(date) ?? [];
        return {
          key: `orphan-${date}`,
          date,
          slot: null as DeliveryAvailability | null,
          scheduledCount: dayJobs.filter((j) => j.status === 'scheduled').length,
          itemCount: dayJobs.reduce((n, j) => n + (j.item_count || 0), 0),
          deliveryCount: dayJobs.length,
        };
      });
    return [...fromSlots, ...orphanDates].sort((a, b) => a.date.localeCompare(b.date));
  }, [daySlots, jobsByDate, today]);

  useEffect(() => {
    if (tab !== 'day') return;
    if (dayRail.some((r) => r.date === selectedDate)) return;
    const next = dayRail.find((r) => r.date >= today)?.date ?? dayRail[0]?.date ?? today;
    if (next !== selectedDate) {
      const params = new URLSearchParams(searchParams);
      params.set('date', next);
      setSearchParams(params, { replace: true });
    }
  }, [tab, dayRail, selectedDate, today, searchParams, setSearchParams]);

  const selectedSlot =
    daySlots.find((s) => s.date === selectedDate) ??
    availabilities.find((s) => s.date === selectedDate) ??
    null;

  const dayJobs = useMemo(() => {
    const list = jobsByDate.get(selectedDate) ?? [];
    return list.slice().sort((a, b) => a.id - b.id);
  }, [jobsByDate, selectedDate]);

  const dayScheduled = dayJobs.filter((j) => j.status === 'scheduled');
  const dayItems = dayJobs.reduce((n, j) => n + (j.item_count || 0), 0);

  const filteredAllJobs = useMemo(() => {
    if (!jobStatusFilter) return jobs;
    return jobs.filter((j) => j.status === jobStatusFilter);
  }, [jobs, jobStatusFilter]);

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
    setTab('schedule');
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
      selectDate(payload.date, 'schedule');
    } catch (err: unknown) {
      const detail =
        (err as { response?: { data?: { detail?: string; time_end?: string[] } } })?.response?.data;
      const msg = detail?.detail || detail?.time_end?.[0] || 'Failed to save delivery date';
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

  const openScheduleDialog = (job: DeliveryJob) => {
    setScheduleJob(job);
    setScheduleAvailId(daySlots[0]?.id ?? '');
    setScheduleNotes(job.notes || '');
  };

  const handleScheduleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canManage || !scheduleJob || scheduleAvailId === '') return;
    try {
      const updated = await updateJob.mutateAsync({
        id: scheduleJob.id,
        data: {
          availability_id: Number(scheduleAvailId),
          notes: scheduleNotes.trim(),
        },
      });
      setScheduleJob(null);
      const msg = updated.customer_schedule_message;
      if (msg) {
        setCustomerMessage(msg);
      } else {
        enqueueSnackbar('Delivery scheduled', { variant: 'success' });
      }
    } catch {
      enqueueSnackbar('Failed to schedule delivery', { variant: 'error' });
    }
  };

  const openNotesDialog = (job: DeliveryJob) => {
    setNotesJob(job);
    setNotesDraft(job.notes || '');
  };

  const handleSaveNotes = async () => {
    if (!canManage || !notesJob) return;
    try {
      await updateJob.mutateAsync({ id: notesJob.id, data: { notes: notesDraft.trim() } });
      enqueueSnackbar('Notes saved', { variant: 'success' });
      setNotesJob(null);
    } catch {
      enqueueSnackbar('Failed to save notes', { variant: 'error' });
    }
  };

  const copyCustomerMessage = async () => {
    if (!customerMessage) return;
    try {
      await navigator.clipboard.writeText(customerMessage);
      enqueueSnackbar('Message copied — ready to text/send', { variant: 'success' });
    } catch {
      enqueueSnackbar('Could not copy — select the text manually', { variant: 'warning' });
    }
  };

  const handleOpenGoogleRoute = (dateIso: string) => {
    const stops = (jobsByDate.get(dateIso) ?? [])
      .filter((j) => j.status === 'scheduled')
      .map(jobStopAddress)
      .filter(Boolean);
    if (stops.length === 0) {
      enqueueSnackbar('No scheduled stops with addresses for that date.', { variant: 'warning' });
      return;
    }
    const url = buildGoogleMapsRouteUrl(stops);
    if (!url) return;
    if (stops.length > 10) {
      enqueueSnackbar(
        `Google Maps allows ~10 stops per URL; opened the first 10 of ${stops.length}. Print a second Saturday delivery log sheet and open a second route for the rest.`,
        { variant: 'info' },
      );
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const allColumns: GridColDef[] = [
    {
      field: 'scheduled_date',
      headerName: 'Date',
      width: 140,
      renderCell: (params) => {
        if (!params.value) {
          return (
            <Chip size="small" color="warning" icon={<WarningAmber />} label="Needs date" />
          );
        }
        return (
          <Button size="small" onClick={() => selectDate(String(params.value), 'day')}>
            {formatDayLabel(String(params.value))}
          </Button>
        );
      },
    },
    {
      field: 'window',
      headerName: 'Window',
      width: 110,
      valueGetter: (_v, row) =>
        row.availability_time_start
          ? `${formatTime(row.availability_time_start)}–${formatTime(row.availability_time_end || '')}`
          : '—',
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
    {
      field: 'notes',
      headerName: 'Notes',
      flex: 0.8,
      minWidth: 120,
      valueGetter: (_v, row) => row.notes || '',
    },
    { field: 'item_count', headerName: '#', width: 60 },
    {
      field: 'fee',
      headerName: 'Fee',
      width: 90,
      valueFormatter: (v) => formatMoney(String(v ?? 0)),
    },
    {
      field: 'status',
      headerName: 'Status',
      width: 140,
      renderCell: (params) => (
        <Chip
          size="small"
          label={
            params.value === 'needs_scheduling' ? 'Needs scheduling' : String(params.value)
          }
          color={STATUS_COLORS[params.value as DeliveryJobStatus] ?? 'default'}
        />
      ),
    },
    ...(canManage
      ? [
          {
            field: 'actions',
            headerName: 'Update',
            width: 260,
            sortable: false,
            renderCell: (params) => (
              <Stack direction="row" spacing={0.5}>
                {jobNeedsScheduling(params.row) ? (
                  <Button
                    size="small"
                    variant="contained"
                    color="warning"
                    onClick={() => openScheduleDialog(params.row)}
                  >
                    Schedule
                  </Button>
                ) : params.row.status === 'scheduled' ? (
                  <>
                    <Button size="small" onClick={() => handleJobStatus(params.row.id, 'completed')}>
                      Done
                    </Button>
                    <Button size="small" onClick={() => handleJobStatus(params.row.id, 'cancelled')}>
                      Cancel
                    </Button>
                  </>
                ) : (
                  <Button size="small" onClick={() => handleJobStatus(params.row.id, 'scheduled')}>
                    Reopen
                  </Button>
                )}
                <Button size="small" onClick={() => openNotesDialog(params.row)}>
                  Notes
                </Button>
              </Stack>
            ),
          } as GridColDef,
        ]
      : []),
  ];

  if (availLoading && jobsLoading) {
    return <LoadingScreen />;
  }

  const scheduledTotal = jobs.filter((j) => j.status === 'scheduled').length;

  return (
    <Box
      sx={{
        height: '100%',
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: 1.25,
      }}
    >
      <PageHeader
        dense
        title="Deliveries"
        subtitle="Pick a day for the route board, browse every stop, or set bookable dates."
        action={
          <Stack direction="row" spacing={1} alignItems="center">
            {needsSchedulingJobs.length > 0 && (
              <Chip
                size="small"
                icon={<WarningAmber />}
                label={`${needsSchedulingJobs.length} need scheduling`}
                color="warning"
              />
            )}
            <Chip
              size="small"
              icon={<LocalShippingOutlined />}
              label={`${scheduledTotal} scheduled`}
              color="info"
              variant="outlined"
            />
            <TextField
              label="From"
              type="date"
              size="small"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
              sx={{ width: 150 }}
            />
            <TextField
              label="To"
              type="date"
              size="small"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
              sx={{ width: 150 }}
            />
          </Stack>
        }
      />

      <Tabs
        value={tab}
        onChange={(_e: SyntheticEvent, next: DeliveriesTab) => setTab(next)}
        sx={{ borderBottom: 1, borderColor: 'divider', minHeight: 42 }}
      >
        <Tab value="day" label="Day board" sx={{ minHeight: 42, fontWeight: 700 }} />
        <Tab
          value="all"
          label={`All deliveries (${filteredAllJobs.length})`}
          sx={{ minHeight: 42, fontWeight: 700 }}
        />
        <Tab
          value="schedule"
          label={`Available dates (${daySlots.length})`}
          sx={{ minHeight: 42, fontWeight: 700 }}
        />
      </Tabs>

      {needsSchedulingJobs.length > 0 && (
        <Alert
          severity="warning"
          icon={<WarningAmber />}
          sx={{ alignItems: 'flex-start' }}
          action={
            canManage && daySlots.length > 0 ? (
              <Button
                color="inherit"
                size="small"
                onClick={() => openScheduleDialog(needsSchedulingJobs[0])}
              >
                Schedule first
              </Button>
            ) : null
          }
        >
          <Typography variant="subtitle2" fontWeight={700}>
            {needsSchedulingJobs.length} delivery
            {needsSchedulingJobs.length === 1 ? '' : 's'} need a date
          </Typography>
          <Typography variant="body2" sx={{ mb: 1 }}>
            Sold with delivery but no Saturday assigned yet. Schedule below — you’ll get text to send
            the customer.
          </Typography>
          <Stack spacing={0.75}>
            {needsSchedulingJobs.map((job) => (
              <Paper key={job.id} variant="outlined" sx={{ p: 1, bgcolor: 'background.paper' }}>
                <Stack
                  direction={{ xs: 'column', sm: 'row' }}
                  spacing={1}
                  justifyContent="space-between"
                  alignItems={{ sm: 'center' }}
                >
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="body2" fontWeight={700}>
                      {job.customer_name} · {job.phone}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" noWrap>
                      {job.items_delivered} — {jobStopAddress(job)}
                    </Typography>
                    {job.notes ? (
                      <Typography variant="caption" color="text.secondary">
                        Notes: {job.notes}
                      </Typography>
                    ) : null}
                  </Box>
                  {canManage && (
                    <Stack direction="row" spacing={0.75} flexShrink={0}>
                      <Button
                        size="small"
                        variant="contained"
                        color="warning"
                        onClick={() => openScheduleDialog(job)}
                        disabled={daySlots.length === 0}
                      >
                        Schedule
                      </Button>
                      <Button size="small" onClick={() => openNotesDialog(job)}>
                        Notes
                      </Button>
                    </Stack>
                  )}
                </Stack>
              </Paper>
            ))}
          </Stack>
          {canManage && daySlots.length === 0 && (
            <Typography variant="body2" sx={{ mt: 1 }}>
              Add an available Saturday on the Available dates tab before scheduling.
            </Typography>
          )}
        </Alert>
      )}

      {tab === 'day' && (
        <Box
          sx={{
            flex: 1,
            minHeight: 0,
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', md: 'minmax(220px, 280px) 1fr' },
            gap: 1.25,
          }}
        >
          <Paper
            variant="outlined"
            sx={{
              overflow: 'auto',
              maxHeight: { xs: 220, md: 'calc(100vh - 220px)' },
              p: 1,
            }}
          >
            <Typography variant="overline" color="text.secondary" sx={{ px: 1 }}>
              Dates
            </Typography>
            {dayRail.length === 0 ? (
              <Box sx={{ p: 2 }}>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                  No bookable dates yet. Add them on Available dates.
                </Typography>
                {canManage && (
                  <Button size="small" variant="contained" onClick={() => setTab('schedule')}>
                    Set available dates
                  </Button>
                )}
              </Box>
            ) : (
              <Stack spacing={0.5}>
                {dayRail.map((row) => {
                  const selected = row.date === selectedDate;
                  return (
                    <Box
                      key={row.key}
                      component="button"
                      type="button"
                      onClick={() => selectDate(row.date, 'day')}
                      sx={{
                        textAlign: 'left',
                        border: 1,
                        borderColor: selected ? 'primary.main' : 'divider',
                        bgcolor: selected ? 'action.selected' : 'transparent',
                        borderRadius: 1,
                        px: 1.25,
                        py: 1,
                        cursor: 'pointer',
                        width: '100%',
                        font: 'inherit',
                        color: 'inherit',
                        '&:hover': { bgcolor: 'action.hover' },
                      }}
                    >
                      <Typography variant="subtitle2" fontWeight={700}>
                        {formatDayLabel(row.date)}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" display="block">
                        {row.slot
                          ? `${formatTime(row.slot.time_start)}–${formatTime(row.slot.time_end)} · ${row.slot.crew_size}p`
                          : 'No slot set'}
                        {row.slot?.assigned_to ? ` · ${row.slot.assigned_to}` : ''}
                      </Typography>
                      <Stack direction="row" spacing={0.75} sx={{ mt: 0.75 }}>
                        <Chip size="small" label={`${row.scheduledCount} stops`} />
                        <Chip size="small" variant="outlined" label={`${row.itemCount} items`} />
                      </Stack>
                    </Box>
                  );
                })}
              </Stack>
            )}
          </Paper>

          <Paper
            variant="outlined"
            sx={{
              display: 'flex',
              flexDirection: 'column',
              minHeight: 0,
              maxHeight: { xs: 'none', md: 'calc(100vh - 220px)' },
              overflow: 'hidden',
            }}
          >
            <Box
              sx={{
                px: 2,
                py: 1.5,
                borderBottom: 1,
                borderColor: 'divider',
                display: 'flex',
                flexWrap: 'wrap',
                gap: 1.5,
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <Box>
                <Typography variant="h6" fontWeight={700}>
                  {formatDayLabel(selectedDate)}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {selectedSlot
                    ? `${formatTime(selectedSlot.time_start)}–${formatTime(selectedSlot.time_end)} · ${
                        selectedSlot.crew_size === 1 ? '1 person' : '2 people'
                      }${selectedSlot.assigned_to ? ` · ${selectedSlot.assigned_to}` : ''}`
                    : 'No availability window for this day'}
                </Typography>
              </Box>
              <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap">
                <Chip label={`${dayScheduled.length} scheduled`} color="info" size="small" />
                <Chip label={`${dayItems} items`} size="small" variant="outlined" />
                <Chip label={`${dayJobs.length} total`} size="small" variant="outlined" />
                <Button
                  variant="contained"
                  size="small"
                  startIcon={<MapOutlined />}
                  onClick={() => handleOpenGoogleRoute(selectedDate)}
                  disabled={dayScheduled.length === 0}
                >
                  Google Maps route
                </Button>
                {canManage && selectedSlot && (
                  <Button size="small" onClick={() => startEdit(selectedSlot)}>
                    Edit slot
                  </Button>
                )}
              </Stack>
            </Box>

            <Box sx={{ flex: 1, overflow: 'auto', p: 1.5 }}>
              {dayJobs.length === 0 ? (
                <Box sx={{ py: 6, textAlign: 'center' }}>
                  <Typography variant="body1" color="text.secondary">
                    No deliveries on this day yet.
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                    Cashiers book stops from the terminal Delivery dialog.
                  </Typography>
                </Box>
              ) : (
                <Stack spacing={1.25}>
                  {dayJobs.map((job, index) => (
                    <Paper
                      key={job.id}
                      variant="outlined"
                      sx={{
                        p: 1.5,
                        borderColor: job.status === 'scheduled' ? 'divider' : 'action.disabledBackground',
                        opacity: job.status === 'cancelled' ? 0.7 : 1,
                      }}
                    >
                      <Stack
                        direction={{ xs: 'column', sm: 'row' }}
                        spacing={1.5}
                        justifyContent="space-between"
                        alignItems={{ sm: 'flex-start' }}
                      >
                        <Box sx={{ minWidth: 0, flex: 1 }}>
                          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                            <Chip size="small" label={`#${index + 1}`} />
                            <Typography variant="subtitle1" fontWeight={700} noWrap>
                              {job.customer_name}
                            </Typography>
                            <Chip
                              size="small"
                              label={
                                job.status === 'needs_scheduling'
                                  ? 'Needs scheduling'
                                  : job.status
                              }
                              color={STATUS_COLORS[job.status]}
                            />
                            <Chip size="small" variant="outlined" label={formatMoney(job.fee)} />
                          </Stack>
                          <Typography variant="body2" sx={{ mb: 0.5 }}>
                            {job.items_delivered}
                            {job.item_count > 1 ? ` · ${job.item_count} items` : ''}
                          </Typography>
                          <Typography variant="body2" color="text.secondary">
                            {jobStopAddress(job)}
                          </Typography>
                          <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.75 }}>
                            <PhoneOutlined sx={{ fontSize: 16, color: 'text.secondary' }} />
                            <Typography variant="body2">{job.phone || '—'}</Typography>
                          </Stack>
                          {job.notes ? (
                            <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.75 }}>
                              Notes: {job.notes}
                            </Typography>
                          ) : null}
                        </Box>
                        {canManage && (
                          <Stack direction="row" spacing={0.75} flexShrink={0}>
                            {jobNeedsScheduling(job) ? (
                              <Button
                                size="small"
                                variant="contained"
                                color="warning"
                                onClick={() => openScheduleDialog(job)}
                              >
                                Schedule
                              </Button>
                            ) : job.status === 'scheduled' ? (
                              <>
                                <Button
                                  size="small"
                                  variant="contained"
                                  onClick={() => handleJobStatus(job.id, 'completed')}
                                >
                                  Done
                                </Button>
                                <Button
                                  size="small"
                                  onClick={() => handleJobStatus(job.id, 'cancelled')}
                                >
                                  Cancel
                                </Button>
                              </>
                            ) : (
                              <Button
                                size="small"
                                onClick={() => handleJobStatus(job.id, 'scheduled')}
                              >
                                Reopen
                              </Button>
                            )}
                            <Button size="small" onClick={() => openNotesDialog(job)}>
                              Notes
                            </Button>
                          </Stack>
                        )}
                      </Stack>
                    </Paper>
                  ))}
                </Stack>
              )}
            </Box>
          </Paper>
        </Box>
      )}

      {tab === 'all' && (
        <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
          <Stack direction="row" spacing={1.5} alignItems="center">
            <FormControl size="small" sx={{ minWidth: 160 }}>
              <InputLabel>Status</InputLabel>
              <Select
                label="Status"
                value={jobStatusFilter}
                onChange={(e) => setJobStatusFilter(e.target.value)}
              >
                <MenuItem value="">All</MenuItem>
                <MenuItem value="needs_scheduling">Needs scheduling</MenuItem>
                <MenuItem value="scheduled">Scheduled</MenuItem>
                <MenuItem value="completed">Completed</MenuItem>
                <MenuItem value="cancelled">Cancelled</MenuItem>
                <MenuItem value="failed">Failed</MenuItem>
              </Select>
            </FormControl>
            <Typography variant="body2" color="text.secondary">
              Click a date to open that day’s board.
            </Typography>
          </Stack>
          <Paper sx={{ flex: 1, minHeight: 360, height: 'calc(100vh - 260px)' }}>
            <DataGrid
              rows={filteredAllJobs}
              columns={allColumns}
              density="compact"
              disableRowSelectionOnClick
              pageSizeOptions={[25, 50, 100]}
              initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
              localeText={{ noRowsLabel: 'No deliveries in this range.' }}
            />
          </Paper>
        </Box>
      )}

      {tab === 'schedule' && (
        <Box
          sx={{
            flex: 1,
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 1.5,
            overflow: 'auto',
          }}
        >
          <Typography variant="body2" color="text.secondary">
            These are the days cashiers can book at the terminal. Click a row to open that day on
            the Day board.
          </Typography>

          {canManage && (
            <Paper
              component="form"
              onSubmit={handleSaveAvailability}
              variant="outlined"
              sx={{ p: 2 }}
            >
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }}>
                {editingId != null && (
                  <IconButton size="small" onClick={resetForm} aria-label="Cancel edit">
                    <ArrowBack fontSize="small" />
                  </IconButton>
                )}
                <Typography variant="subtitle1" fontWeight={700}>
                  {editingId != null ? 'Edit available date' : 'Add available date'}
                </Typography>
              </Stack>
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
                    Cancel
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
                  <TableCell>Window</TableCell>
                  <TableCell>Crew</TableCell>
                  <TableCell>Who</TableCell>
                  <TableCell align="right">Deliveries</TableCell>
                  <TableCell align="right">Items</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {availabilities.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8}>
                      <Typography variant="body2" color="text.secondary">
                        No available dates in this range.
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  availabilities.map((row) => (
                    <TableRow
                      key={row.id}
                      hover
                      selected={editingId === row.id || selectedDate === row.date}
                      sx={{ cursor: 'pointer' }}
                      onClick={() => selectDate(row.date, 'day')}
                    >
                      <TableCell>
                        <Typography fontWeight={600}>{formatDayLabel(row.date)}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {row.date}
                        </Typography>
                      </TableCell>
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
                          label={row.is_active ? 'Open' : 'Off'}
                          color={row.is_active ? 'success' : 'default'}
                        />
                      </TableCell>
                      <TableCell align="right" onClick={(e) => e.stopPropagation()}>
                        <Tooltip title="Open day board">
                          <Button size="small" onClick={() => selectDate(row.date, 'day')}>
                            Open day
                          </Button>
                        </Tooltip>
                        {canManage && (
                          <>
                            <Button size="small" onClick={() => startEdit(row)}>
                              Edit
                            </Button>
                            {row.is_active && (
                              <Button
                                size="small"
                                color="warning"
                                onClick={() => handleDeactivate(row.id)}
                              >
                                Deactivate
                              </Button>
                            )}
                          </>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Paper>
        </Box>
      )}

      <Dialog
        open={Boolean(scheduleJob)}
        onClose={() => setScheduleJob(null)}
        maxWidth="sm"
        fullWidth
      >
        <form onSubmit={handleScheduleSubmit}>
          <DialogTitle>Schedule delivery</DialogTitle>
          <DialogContent>
            {scheduleJob && (
              <Stack spacing={2} sx={{ mt: 1 }}>
                <Typography variant="body2">
                  <strong>{scheduleJob.customer_name}</strong> · {scheduleJob.phone}
                  <br />
                  {scheduleJob.items_delivered}
                  <br />
                  {jobStopAddress(scheduleJob)}
                </Typography>
                <FormControl fullWidth required>
                  <InputLabel id="schedule-date-label">Delivery date</InputLabel>
                  <Select
                    labelId="schedule-date-label"
                    label="Delivery date"
                    value={scheduleAvailId === '' ? '' : String(scheduleAvailId)}
                    onChange={(e) =>
                      setScheduleAvailId(e.target.value === '' ? '' : Number(e.target.value))
                    }
                  >
                    {daySlots.length === 0 ? (
                      <MenuItem value="" disabled>
                        No available dates — add one on Available dates
                      </MenuItem>
                    ) : (
                      daySlots.map((slot) => (
                        <MenuItem key={slot.id} value={String(slot.id)}>
                          {formatDayLabel(slot.date)} {formatTime(slot.time_start)}–
                          {formatTime(slot.time_end)}
                          {slot.assigned_to ? ` · ${slot.assigned_to}` : ''}
                        </MenuItem>
                      ))
                    )}
                  </Select>
                </FormControl>
                <TextField
                  label="Notes"
                  value={scheduleNotes}
                  onChange={(e) => setScheduleNotes(e.target.value)}
                  fullWidth
                  multiline
                  minRows={2}
                />
              </Stack>
            )}
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button type="button" onClick={() => setScheduleJob(null)}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="contained"
              disabled={updateJob.isPending || scheduleAvailId === '' || daySlots.length === 0}
            >
              {updateJob.isPending ? 'Saving…' : 'Save date'}
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      <Dialog
        open={Boolean(notesJob)}
        onClose={() => setNotesJob(null)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Delivery notes</DialogTitle>
        <DialogContent>
          {notesJob && (
            <Stack spacing={1.5} sx={{ mt: 1 }}>
              <Typography variant="body2" color="text.secondary">
                {notesJob.customer_name} · {notesJob.items_delivered}
              </Typography>
              <TextField
                label="Notes"
                value={notesDraft}
                onChange={(e) => setNotesDraft(e.target.value)}
                fullWidth
                multiline
                minRows={3}
                autoFocus
              />
            </Stack>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setNotesJob(null)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={() => void handleSaveNotes()}
            disabled={updateJob.isPending || !canManage}
          >
            Save notes
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={Boolean(customerMessage)}
        onClose={() => setCustomerMessage(null)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Text to send the customer</DialogTitle>
        <DialogContent>
          <Alert severity="success" sx={{ mb: 1.5 }}>
            Delivery scheduled. Copy this message to text or message the customer.
          </Alert>
          <Paper variant="outlined" sx={{ p: 1.5, bgcolor: 'action.hover' }}>
            <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap' }}>
              {customerMessage}
            </Typography>
          </Paper>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setCustomerMessage(null)}>Close</Button>
          <Button
            variant="contained"
            startIcon={<ContentCopy />}
            onClick={() => void copyCustomerMessage()}
          >
            Copy message
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
