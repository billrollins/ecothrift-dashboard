import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import PlayArrow from '@mui/icons-material/PlayArrow';
import Stop from '@mui/icons-material/Stop';
import FreeBreakfast from '@mui/icons-material/FreeBreakfast';
import PlayCircleOutline from '@mui/icons-material/PlayCircleOutline';
import Edit from '@mui/icons-material/Edit';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import { format, parseISO } from 'date-fns';
import { useSnackbar } from 'notistack';
import { PageHeader } from '../../components/common/PageHeader';
import { LoadingScreen } from '../../components/feedback/LoadingScreen';
import {
  useClockIn,
  useClockOut,
  useCurrentEntry,
  useEndBreak,
  useStartBreak,
  useWeeklyHoursStatus,
} from '../../hooks/useTimeClock';
import { useTimeEntries } from '../../hooks/useTimeEntries';
import { createModificationRequest } from '../../api/hr.api';
import { useAuth } from '../../contexts/AuthContext';
import type { TimeEntry } from '../../types/hr.types';

function formatHours(value: string | number | null | undefined): string {
  if (value == null || value === '') return '0.00';
  const n = typeof value === 'string' ? parseFloat(value) : value;
  return Number.isFinite(n) ? n.toFixed(2) : '0.00';
}

function formatElapsed(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) totalSeconds = 0;
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** Re-render every second while a shift is active so the live timer ticks. */
function useNowTick(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return undefined;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [active]);
  return now;
}

function OvertimeBanner({
  hoursWorked,
  hoursLimit,
  isAtLimit,
  isOverLimit,
}: {
  hoursWorked: string;
  hoursLimit: string;
  isAtLimit: boolean;
  isOverLimit: boolean;
}) {
  const worked = parseFloat(hoursWorked);
  const limit = parseFloat(hoursLimit);
  const showWarning = isOverLimit || isAtLimit || worked >= limit - 2;

  if (!showWarning) return null;

  const title = isOverLimit || worked > limit
    ? 'OVERTIME - NOT ALLOWED'
    : isAtLimit || worked >= limit
      ? 'WEEKLY HOUR LIMIT REACHED'
      : 'APPROACHING WEEKLY HOUR LIMIT';

  return (
    <Alert
      severity="error"
      sx={{
        mb: 3,
        py: 2,
        px: 3,
        border: 2,
        borderColor: 'error.main',
        animation: 'otPulse 2s ease-in-out infinite',
        '@keyframes otPulse': {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(211, 47, 47, 0.45)' },
          '50%': { boxShadow: '0 0 0 14px rgba(211, 47, 47, 0)' },
        },
        '& .MuiAlert-message': { width: '100%' },
      }}
    >
      <Typography variant="h6" fontWeight={800} gutterBottom color="error.dark">
        {title}
      </Typography>
      <Typography variant="body1" fontWeight={600}>
        This week: {formatHours(hoursWorked)} / {formatHours(hoursLimit)} hours.
        {worked >= limit
          ? ' Overtime is not allowed. Clock out if needed, then use Correct time below to submit your actual hours - Super Admin will review and approve.'
          : ` ${formatHours(Math.max(limit - worked, 0))} hours left this week.`}
      </Typography>
    </Alert>
  );
}

function WeeklyRing({
  hoursWorked,
  hoursLimit,
  hoursRemaining,
  danger,
}: {
  hoursWorked: string;
  hoursLimit: string;
  hoursRemaining: string;
  danger: boolean;
}) {
  const worked = parseFloat(hoursWorked);
  const limit = parseFloat(hoursLimit);
  const pct = limit > 0 ? Math.min((worked / limit) * 100, 100) : 0;
  const color = danger ? 'error' : pct >= 90 ? 'warning' : 'success';

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1.5 }}>
      <Typography variant="overline" color="text.secondary" letterSpacing={0.5}>
        This week
      </Typography>
      <Box sx={{ position: 'relative', display: 'inline-flex' }}>
        <CircularProgress
          variant="determinate"
          value={100}
          size={150}
          thickness={4}
          sx={{ color: 'action.hover' }}
        />
        <CircularProgress
          variant="determinate"
          value={pct}
          size={150}
          thickness={4}
          color={color}
          sx={{ position: 'absolute', left: 0, '& .MuiCircularProgress-circle': { strokeLinecap: 'round' } }}
        />
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Typography variant="h4" fontWeight={800} sx={{ fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
            {formatHours(hoursWorked)}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            / {formatHours(hoursLimit)} h
          </Typography>
        </Box>
      </Box>
      <Typography variant="body2" color="text.secondary">
        {formatHours(hoursRemaining)} h remaining
      </Typography>
    </Box>
  );
}

export default function TimeClockPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();

  const { data: currentEntry, isLoading: currentLoading } = useCurrentEntry();
  const { data: weeklyStatus, isLoading: weeklyLoading } = useWeeklyHoursStatus();
  const { data: entriesData, isLoading: entriesLoading } = useTimeEntries(
    user?.id
      ? { employee: user.id, page_size: 20, ordering: '-date,-clock_in' }
      : undefined,
    { enabled: Boolean(user?.id) },
  );

  const clockIn = useClockIn();
  const clockOut = useClockOut();
  const startBreak = useStartBreak();
  const endBreak = useEndBreak();

  const [modOpen, setModOpen] = useState(false);
  const [modEntry, setModEntry] = useState<TimeEntry | null>(null);
  const [modForm, setModForm] = useState({
    requested_clock_in: '',
    requested_clock_out: '',
    requested_break_minutes: '',
    reason: '',
  });
  const [modSubmitting, setModSubmitting] = useState(false);

  const isClockedIn = !!currentEntry;
  const onBreak = Boolean(currentEntry?.on_break);
  const now = useNowTick(isClockedIn);

  const entries = entriesData?.results ?? [];
  const isSuperuser = Boolean(user?.is_superuser);

  const dangerWeekly = Boolean(weeklyStatus?.is_at_limit || weeklyStatus?.is_over_limit);

  // Live elapsed seconds for the active shift (subtracts accumulated + active break time).
  const elapsedSeconds = useMemo(() => {
    if (!currentEntry?.clock_in) return 0;
    const start = parseISO(currentEntry.clock_in).getTime();
    let seconds = (now - start) / 1000;
    seconds -= (currentEntry.break_minutes ?? 0) * 60;
    if (onBreak && currentEntry.break_started_at) {
      seconds -= (now - parseISO(currentEntry.break_started_at).getTime()) / 1000;
    }
    return Math.max(seconds, 0);
  }, [currentEntry, now, onBreak]);

  const handleClockIn = async () => {
    try {
      await clockIn.mutateAsync({});
      enqueueSnackbar('Clocked in', { variant: 'success' });
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
        ?? 'Failed to clock in';
      enqueueSnackbar(String(msg), { variant: 'error' });
    }
  };

  const handleClockOut = async () => {
    if (!currentEntry) return;
    try {
      await clockOut.mutateAsync({ id: currentEntry.id });
      enqueueSnackbar('Clocked out', { variant: 'success' });
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
        ?? 'Failed to clock out';
      enqueueSnackbar(String(msg), { variant: 'error' });
    }
  };

  const handleToggleBreak = async () => {
    if (!currentEntry) return;
    try {
      if (onBreak) {
        await endBreak.mutateAsync(currentEntry.id);
        enqueueSnackbar('Break ended', { variant: 'success' });
      } else {
        await startBreak.mutateAsync(currentEntry.id);
        enqueueSnackbar('Break started', { variant: 'info' });
      }
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
        ?? 'Break action failed';
      enqueueSnackbar(String(msg), { variant: 'error' });
    }
  };

  const openModDialog = (entry: TimeEntry) => {
    setModEntry(entry);
    setModForm({
      requested_clock_in: entry.clock_in ? format(parseISO(entry.clock_in), "yyyy-MM-dd'T'HH:mm") : '',
      requested_clock_out: entry.clock_out ? format(parseISO(entry.clock_out), "yyyy-MM-dd'T'HH:mm") : '',
      requested_break_minutes: String(entry.break_minutes ?? 0),
      reason: '',
    });
    setModOpen(true);
  };

  const submitModRequest = async () => {
    if (!modEntry || !modForm.reason.trim()) {
      enqueueSnackbar('Reason is required', { variant: 'warning' });
      return;
    }
    setModSubmitting(true);
    try {
      await createModificationRequest({
        time_entry: modEntry.id,
        requested_clock_in: modForm.requested_clock_in || null,
        requested_clock_out: modForm.requested_clock_out || null,
        requested_break_minutes: modForm.requested_break_minutes
          ? parseInt(modForm.requested_break_minutes, 10)
          : null,
        reason: modForm.reason.trim(),
      });
      enqueueSnackbar('Modification request submitted', { variant: 'success' });
      setModOpen(false);
    } catch {
      enqueueSnackbar('Failed to submit request', { variant: 'error' });
    } finally {
      setModSubmitting(false);
    }
  };

  const columns: GridColDef[] = [
    { field: 'date', headerName: 'Date', width: 120 },
    {
      field: 'clock_in',
      headerName: 'In',
      width: 100,
      valueFormatter: (v) => (v ? format(parseISO(String(v)), 'h:mm a') : '-'),
    },
    {
      field: 'clock_out',
      headerName: 'Out',
      width: 100,
      valueFormatter: (v) => (v ? format(parseISO(String(v)), 'h:mm a') : '-'),
    },
    {
      field: 'break_minutes',
      headerName: 'Break',
      width: 90,
      valueFormatter: (v) => `${v ?? 0}m`,
    },
    {
      field: 'total_hours',
      headerName: 'Hours',
      width: 90,
      cellClassName: 'tabular',
      valueFormatter: (v) => formatHours(v as string),
    },
    {
      field: 'actions',
      headerName: '',
      flex: 1,
      minWidth: 150,
      align: 'right',
      headerAlign: 'right',
      sortable: false,
      renderCell: ({ row }) => (
        <Button size="small" startIcon={<Edit />} onClick={() => openModDialog(row as TimeEntry)}>
          {row.clock_out ? 'Request change' : 'Correct time'}
        </Button>
      ),
    },
  ];

  if (currentLoading || weeklyLoading) return <LoadingScreen message="Loading time clock..." />;

  const accentColor = onBreak ? 'warning.main' : isClockedIn ? 'success.main' : 'text.secondary';

  return (
    <Box>
      <PageHeader
        title="Time clock"
        subtitle="Clock in, take breaks, and track your weekly hours"
        action={
          isSuperuser ? (
            <Button variant="outlined" onClick={() => navigate('/admin/time-payroll')}>
              Time & payroll
            </Button>
          ) : undefined
        }
      />

      {weeklyStatus && (
        <OvertimeBanner
          hoursWorked={weeklyStatus.hours_worked}
          hoursLimit={weeklyStatus.hours_limit}
          isAtLimit={weeklyStatus.is_at_limit}
          isOverLimit={weeklyStatus.is_over_limit}
        />
      )}

      <Card variant="outlined" sx={{ mb: 3, overflow: 'hidden' }}>
        <Box sx={{ height: 6, bgcolor: accentColor, transition: 'background-color 0.3s' }} />
        <CardContent sx={{ p: { xs: 3, md: 4 } }}>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', md: '1fr auto' },
              gap: 4,
              alignItems: 'center',
            }}
          >
            {/* Left: status + live timer + actions */}
            <Box sx={{ textAlign: { xs: 'center', md: 'left' } }}>
              {isClockedIn && currentEntry ? (
                <>
                  <Stack
                    direction="row"
                    spacing={1}
                    alignItems="center"
                    justifyContent={{ xs: 'center', md: 'flex-start' }}
                    sx={{ mb: 1 }}
                  >
                    <Box
                      sx={{
                        width: 10,
                        height: 10,
                        borderRadius: '50%',
                        bgcolor: accentColor,
                        animation: onBreak ? 'none' : 'livePulse 1.6s ease-in-out infinite',
                        '@keyframes livePulse': {
                          '0%, 100%': { opacity: 1 },
                          '50%': { opacity: 0.3 },
                        },
                      }}
                    />
                    <Typography variant="overline" sx={{ color: accentColor, fontWeight: 700, letterSpacing: 1 }}>
                      {onBreak ? 'On break' : 'On the clock'}
                    </Typography>
                  </Stack>

                  <Typography
                    variant="h1"
                    fontWeight={800}
                    sx={{
                      fontSize: { xs: '3.5rem', md: '5rem' },
                      lineHeight: 1,
                      fontVariantNumeric: 'tabular-nums',
                      color: onBreak ? 'warning.main' : 'text.primary',
                      mb: 1,
                    }}
                  >
                    {formatElapsed(elapsedSeconds)}
                  </Typography>

                  <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
                    Clocked in at {format(parseISO(currentEntry.clock_in), 'h:mm a')}
                    {onBreak && currentEntry.break_started_at
                      ? ` · break since ${format(parseISO(currentEntry.break_started_at), 'h:mm a')}`
                      : ''}
                  </Typography>

                  {elapsedSeconds > 16 * 3600 && (
                    <Alert severity="warning" sx={{ mb: 2, textAlign: 'left' }}>
                      This shift looks longer than a normal work day. Clock out, then use{' '}
                      <strong>Correct time</strong> below to submit the actual hours for Super Admin
                      approval.
                    </Alert>
                  )}

                  <Stack
                    direction={{ xs: 'column', sm: 'row' }}
                    spacing={2}
                    justifyContent={{ xs: 'center', md: 'flex-start' }}
                  >
                    <Button
                      variant={onBreak ? 'contained' : 'outlined'}
                      color="warning"
                      size="large"
                      startIcon={onBreak ? <PlayCircleOutline /> : <FreeBreakfast />}
                      onClick={handleToggleBreak}
                      disabled={startBreak.isPending || endBreak.isPending}
                      sx={{ px: 3, py: 1.25 }}
                    >
                      {onBreak ? 'End break' : 'Take a break'}
                    </Button>
                    <Button
                      variant="contained"
                      color="error"
                      size="large"
                      startIcon={<Stop />}
                      onClick={handleClockOut}
                      disabled={clockOut.isPending || onBreak}
                      sx={{ px: 3, py: 1.25 }}
                    >
                      Clock out
                    </Button>
                  </Stack>
                  {onBreak && (
                    <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1.5 }}>
                      End your break before clocking out.
                    </Typography>
                  )}
                </>
              ) : (
                <>
                  <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 700, letterSpacing: 1 }}>
                    Clocked out
                  </Typography>
                  <Typography variant="h3" fontWeight={800} sx={{ mb: 1, mt: 0.5 }}>
                    Ready to start?
                  </Typography>
                  <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
                    {format(new Date(now), 'EEEE, MMMM d · h:mm a')}
                  </Typography>
                  <Button
                    variant="contained"
                    color="success"
                    size="large"
                    startIcon={<PlayArrow />}
                    onClick={handleClockIn}
                    disabled={clockIn.isPending}
                    sx={{ px: 6, py: 1.5, fontSize: '1.15rem' }}
                  >
                    Clock in
                  </Button>
                </>
              )}
            </Box>

            {/* Right: weekly hours ring */}
            {weeklyStatus && (
              <Box
                sx={{
                  borderLeft: { md: 1 },
                  borderColor: { md: 'divider' },
                  pl: { md: 4 },
                  display: 'flex',
                  justifyContent: 'center',
                }}
              >
                <WeeklyRing
                  hoursWorked={weeklyStatus.hours_worked}
                  hoursLimit={weeklyStatus.hours_limit}
                  hoursRemaining={weeklyStatus.hours_remaining}
                  danger={dangerWeekly}
                />
              </Box>
            )}
          </Box>
        </CardContent>
      </Card>

      <Typography variant="h6" fontWeight={600} sx={{ mb: 1 }}>
        My recent shifts
      </Typography>
      <Card variant="outlined">
        <DataGrid
          autoHeight
          rows={entries}
          columns={columns}
          loading={entriesLoading}
          disableRowSelectionOnClick
          pageSizeOptions={[10, 20]}
          initialState={{ pagination: { paginationModel: { pageSize: 10 } } }}
          sx={{ border: 0, '& .tabular': { fontVariantNumeric: 'tabular-nums' } }}
        />
      </Card>

      <Dialog open={modOpen} onClose={() => setModOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Request time change</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Requested clock in"
              type="datetime-local"
              value={modForm.requested_clock_in}
              onChange={(e) => setModForm((f) => ({ ...f, requested_clock_in: e.target.value }))}
              InputLabelProps={{ shrink: true }}
              fullWidth
            />
            <TextField
              label="Requested clock out"
              type="datetime-local"
              value={modForm.requested_clock_out}
              onChange={(e) => setModForm((f) => ({ ...f, requested_clock_out: e.target.value }))}
              InputLabelProps={{ shrink: true }}
              fullWidth
            />
            <TextField
              label="Break minutes"
              type="number"
              value={modForm.requested_break_minutes}
              onChange={(e) => setModForm((f) => ({ ...f, requested_break_minutes: e.target.value }))}
              fullWidth
            />
            <TextField
              label="Reason"
              required
              multiline
              minRows={3}
              value={modForm.reason}
              onChange={(e) => setModForm((f) => ({ ...f, reason: e.target.value }))}
              fullWidth
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setModOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={submitModRequest} disabled={modSubmitting}>
            Submit request
          </Button>
        </DialogActions>
      </Dialog>

    </Box>
  );
}
