import { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Tab,
  Tabs,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material';
import Check from '@mui/icons-material/Check';
import Edit from '@mui/icons-material/Edit';
import Delete from '@mui/icons-material/Delete';
import Add from '@mui/icons-material/Add';
import Block from '@mui/icons-material/Block';
import { DataGrid, type GridColDef, type GridRowSelectionModel } from '@mui/x-data-grid';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import {
  format,
  parseISO,
  startOfWeek,
  endOfWeek,
  subWeeks,
  startOfMonth,
  endOfMonth,
  subMonths,
} from 'date-fns';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import { PageHeader } from '../../components/common/PageHeader';
import { LoadingScreen } from '../../components/feedback/LoadingScreen';
import { StatusBadge } from '../../components/common/StatusBadge';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import {
  approveModificationRequest,
  bulkApproveModificationRequests,
  bulkDeleteModificationRequests,
  bulkRejectModificationRequests,
  bulkDeleteTimeEntries,
  createTimeEntry,
  denyModificationRequest,
  getModificationRequests,
  getPayrollHours,
  getPayrollPeriods,
  getTimeEntryRoster,
  updateModificationRequest,
  updateTimeEntry,
  type ModificationRequest,
} from '../../api/hr.api';
import { useUsers } from '../../hooks/useEmployees';
import type { TimeEntryRosterRow } from '../../types/hr.types';

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

function fmtHours(v: string | number | null | undefined): string {
  const n = typeof v === 'string' ? parseFloat(v) : Number(v);
  return Number.isFinite(n) ? n.toFixed(2) : '0.00';
}

const WEEKLY_HOUR_LIMIT = 40;
/** Min width for columns showing `40.00 (+XX.XX overtime)`. */
const OVERTIME_HOURS_COL_WIDTH = 240;
const OVERTIME_PAYROLL_COL_WIDTH = 320;

function WeeklyHoursLine({ total }: { total: number }) {
  if (!Number.isFinite(total) || total <= 0) {
    return <span style={{ fontVariantNumeric: 'tabular-nums' }}>0.00</span>;
  }
  if (total <= WEEKLY_HOUR_LIMIT) {
    return <span style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtHours(total)}</span>;
  }
  const overtime = total - WEEKLY_HOUR_LIMIT;
  return (
    <span style={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
      {fmtHours(WEEKLY_HOUR_LIMIT)}{' '}
      <Box component="span" sx={{ color: 'error.main', fontWeight: 700 }}>
        (+{fmtHours(overtime)} overtime)
      </Box>
    </span>
  );
}

function ThisWeekHoursCell({ value }: { value: string | number | null | undefined }) {
  const total = typeof value === 'number' ? value : parseFloat(String(value));
  return <WeeklyHoursLine total={total} />;
}

function fmtWeekRangeMonSun(weekStart: string): string {
  const start = parseISO(weekStart);
  const end = endOfWeek(start, { weekStartsOn: 1 });
  return `${format(start, 'MMM d')}-${format(end, 'MMM d')}`;
}

function PayrollPeriodHoursCell({ weeks }: { weeks: { week_start: string; hours: number }[] }) {
  if (weeks.length === 0) {
    return <WeeklyHoursLine total={0} />;
  }
  if (weeks.length === 1) {
    return <WeeklyHoursLine total={weeks[0].hours} />;
  }
  return (
    <Stack spacing={0.35} sx={{ py: 0.25, width: '100%' }}>
      {weeks.map((w) => (
        <Box key={w.week_start} sx={{ display: 'flex', alignItems: 'baseline', gap: 0.75, flexWrap: 'nowrap' }}>
          <Typography
            component="span"
            variant="caption"
            color="text.secondary"
            sx={{ minWidth: 96, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', flexShrink: 0 }}
          >
            {fmtWeekRangeMonSun(w.week_start)}:
          </Typography>
          <WeeklyHoursLine total={w.hours} />
        </Box>
      ))}
    </Stack>
  );
}

function fmtMoney(v: string | number | null | undefined): string {
  const n = typeof v === 'string' ? parseFloat(v) : Number(v);
  return usd.format(Number.isFinite(n) ? n : 0);
}

function fmtTime(iso: string | null): string {
  return iso ? format(parseISO(iso), 'h:mm a') : '-';
}

/** Show date + time when clock timestamp is not on the roster row date (multi-day span). */
function fmtClockCell(iso: string | null, rowDate: string): string {
  if (!iso) return '-';
  const dt = parseISO(iso);
  const clockDay = format(dt, 'yyyy-MM-dd');
  if (clockDay !== rowDate) {
    return format(dt, 'MMM d, h:mm a');
  }
  return format(dt, 'h:mm a');
}

function fmtDt(v: string | null): string {
  return v ? format(parseISO(v), 'MMM d, h:mm a') : '-';
}

function fmtDay(d: Date): string {
  return format(d, 'yyyy-MM-dd');
}

/** Date range label for period quick select (MMM dd, yyyy - MMM dd, yyyy). */
function fmtRangeLabel(from: string | Date, to: string | Date): string {
  const start = typeof from === 'string' ? parseISO(from) : from;
  const end = typeof to === 'string' ? parseISO(to) : to;
  return `${format(start, 'MMM dd, yyyy')} - ${format(end, 'MMM dd, yyyy')}`;
}

const DATE_DISPLAY_FORMAT = 'MMM dd, yyyy';

function toLocalInput(iso: string | null): string {
  return iso ? format(parseISO(iso), "yyyy-MM-dd'T'HH:mm") : '';
}

function fromLocalInput(value: string): string | null {
  return value.trim() ? new Date(value).toISOString() : null;
}

type Range = { date_from: string; date_to: string };
type HoursFilter = 'overtime' | 'long' | 'short';

function KpiCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: 'success' | 'warning' | 'error' | 'primary';
}) {
  const color = accent ? `${accent}.main` : 'text.primary';
  return (
    <Card variant="outlined" sx={{ height: '100%' }}>
      <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
        <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>
          {label}
        </Typography>
        <Typography variant="h4" fontWeight={800} sx={{ fontVariantNumeric: 'tabular-nums', color, lineHeight: 1.25 }}>
          {value}
        </Typography>
        {sub && (
          <Typography variant="caption" color="text.secondary">
            {sub}
          </Typography>
        )}
      </CardContent>
    </Card>
  );
}

/** A single pill split into two clickable halves: [ Last X | This X ]. */
function SplitToggle({
  leftLabel,
  rightLabel,
  leftActive,
  rightActive,
  onLeft,
  onRight,
}: {
  leftLabel: string;
  rightLabel: string;
  leftActive: boolean;
  rightActive: boolean;
  onLeft: () => void;
  onRight: () => void;
}) {
  const half = (label: string, active: boolean, onClick: () => void, side: 'l' | 'r') => (
    <Box
      role="button"
      onClick={onClick}
      sx={{
        px: 1.75,
        py: 0.75,
        cursor: 'pointer',
        userSelect: 'none',
        whiteSpace: 'nowrap',
        fontSize: '0.8125rem',
        fontWeight: active ? 700 : 500,
        color: active ? 'primary.contrastText' : 'text.primary',
        bgcolor: active ? 'primary.main' : 'transparent',
        transition: 'background-color 0.15s',
        '&:hover': { bgcolor: active ? 'primary.dark' : 'action.hover' },
        borderTopLeftRadius: side === 'l' ? 8 : 0,
        borderBottomLeftRadius: side === 'l' ? 8 : 0,
        borderTopRightRadius: side === 'r' ? 8 : 0,
        borderBottomRightRadius: side === 'r' ? 8 : 0,
      }}
    >
      {label}
    </Box>
  );
  return (
    <Box
      sx={{
        display: 'inline-flex',
        border: 1,
        borderColor: 'divider',
        borderRadius: 2,
        overflow: 'hidden',
        '& > *:first-of-type': { borderRight: 1, borderColor: 'divider' },
      }}
    >
      {half(leftLabel, leftActive, onLeft, 'l')}
      {half(rightLabel, rightActive, onRight, 'r')}
    </Box>
  );
}

const SOFT_DELETE_NOTE = 'Records are kept for 30 days, then permanently removed.';

const EMPTY_ROW_SELECTION: GridRowSelectionModel = { type: 'include', ids: new Set() };

const DATA_GRID_SX = {
  border: 0,
  '& .tabular': { fontVariantNumeric: 'tabular-nums' },
  '& .MuiDataGrid-columnHeaders': { bgcolor: 'action.hover' },
  '& .MuiDataGrid-columnHeaderTitle': { fontWeight: 700 },
  '& .MuiDataGrid-cell': { alignItems: 'center', justifyContent: 'flex-start' },
  '& .MuiDataGrid-cell--textRight': { justifyContent: 'flex-start', textAlign: 'left' },
  '& .MuiDataGrid-columnHeader--alignRight .MuiDataGrid-columnHeaderDraggableContainer, & .MuiDataGrid-columnHeader--alignRight .MuiDataGrid-columnHeaderTitleContainer': {
    justifyContent: 'flex-start',
  },
  '& .overtime-hours-cell': {
    overflow: 'visible',
    whiteSpace: 'nowrap',
  },
  '& .overtime-hours-cell .MuiDataGrid-cellContent': {
    overflow: 'visible',
    textOverflow: 'clip',
  },
} as const;

const TAB_TOOLBAR_CARD_SX = {
  mb: 2,
  minHeight: 74,
  display: 'flex',
} as const;

const TAB_TOOLBAR_CONTENT_SX = {
  width: '100%',
  py: 1.5,
  '&:last-child': { pb: 1.5 },
} as const;

const TAB_TOOLBAR_ROW_SX = {
  minHeight: 40,
  alignItems: { xs: 'stretch', sm: 'center' },
} as const;

function selectionToIds(model: GridRowSelectionModel, rowIds: number[]): number[] {
  const key = (id: number) => String(id);
  if (model.type === 'exclude') {
    const excluded = new Set([...model.ids].map(String));
    return rowIds.filter((id) => !excluded.has(key(id)));
  }
  const included = new Set([...model.ids].map(String));
  return rowIds.filter((id) => included.has(key(id)));
}

const EMPTY_FORM = {
  employee: '' as number | '',
  clock_in: '',
  clock_out: '',
  break_minutes: '0',
};

export default function TimePayrollPage() {
  const { enqueueSnackbar } = useSnackbar();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState(0);

  // ── Period data ──────────────────────────────────────────────
  const { data: periods, isLoading: periodsLoading } = useQuery({
    queryKey: ['payrollPeriods'],
    queryFn: async () => (await getPayrollPeriods(16)).data,
  });

  const currentPeriod = periods?.find((p) => p.is_current) ?? periods?.[0];
  const currentIdx = periods?.findIndex((p) => p === currentPeriod) ?? -1;
  const lastPeriod = currentIdx >= 0 ? periods?.[currentIdx + 1] : undefined;

  const [dateFrom, setDateFrom] = useState<Date | null>(null);
  const [dateTo, setDateTo] = useState<Date | null>(null);

  useEffect(() => {
    if (dateFrom == null && dateTo == null && currentPeriod) {
      setDateFrom(parseISO(currentPeriod.date_from));
      setDateTo(parseISO(currentPeriod.date_to));
    }
  }, [currentPeriod, dateFrom, dateTo]);

  const activeRange: Range | null =
    dateFrom && dateTo ? { date_from: fmtDay(dateFrom), date_to: fmtDay(dateTo) } : null;

  const applyRange = (from: string, to: string) => {
    setDateFrom(parseISO(from));
    setDateTo(parseISO(to));
  };

  const isActive = (from: string, to: string) =>
    activeRange?.date_from === from && activeRange?.date_to === to;

  const selectedPeriodKey = useMemo(() => {
    if (!activeRange || !periods) return '';
    const match = periods.find(
      (p) => p.date_from === activeRange.date_from && p.date_to === activeRange.date_to,
    );
    return match ? `${match.date_from}|${match.date_to}` : '';
  }, [activeRange, periods]);

  // Quick ranges (client-computed)
  const today = new Date();
  const thisWeek: Range = {
    date_from: fmtDay(startOfWeek(today, { weekStartsOn: 1 })),
    date_to: fmtDay(endOfWeek(today, { weekStartsOn: 1 })),
  };
  const lastWeek: Range = {
    date_from: fmtDay(startOfWeek(subWeeks(today, 1), { weekStartsOn: 1 })),
    date_to: fmtDay(endOfWeek(subWeeks(today, 1), { weekStartsOn: 1 })),
  };
  const thisMonth: Range = { date_from: fmtDay(startOfMonth(today)), date_to: fmtDay(endOfMonth(today)) };
  const lastMonth: Range = {
    date_from: fmtDay(startOfMonth(subMonths(today, 1))),
    date_to: fmtDay(endOfMonth(subMonths(today, 1))),
  };

  // ── Data queries ─────────────────────────────────────────────
  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ['payrollHours', activeRange],
    queryFn: async () => (await getPayrollHours(activeRange!)).data,
    enabled: Boolean(activeRange),
  });

  const { data: roster, isLoading: rosterLoading } = useQuery({
    queryKey: ['timeEntryRoster', activeRange],
    queryFn: async () => (await getTimeEntryRoster(activeRange!)).data,
    enabled: Boolean(activeRange),
  });

  const { data: thisWeekRoster } = useQuery({
    queryKey: ['timeEntryRoster', thisWeek.date_from, thisWeek.date_to],
    queryFn: async () => (await getTimeEntryRoster(thisWeek)).data,
  });

  const [statusFilter, setStatusFilter] = useState<'pending' | 'approved' | 'denied' | ''>('pending');
  const { data: requests, isLoading: requestsLoading } = useQuery({
    queryKey: ['modificationRequests', statusFilter],
    queryFn: async () => {
      const params = statusFilter ? { status: statusFilter, page_size: 200 } : { page_size: 200 };
      return (await getModificationRequests(params)).data.results ?? [];
    },
  });

  const { data: pendingCountData } = useQuery({
    queryKey: ['modificationRequests', 'pending-count'],
    queryFn: async () => {
      const resp = (await getModificationRequests({ status: 'pending', page_size: 1 })).data;
      return resp.count ?? resp.results?.length ?? 0;
    },
  });
  const pendingCount = pendingCountData ?? 0;

  const { data: usersData } = useUsers({ page_size: 200 });
  const staffOptions = useMemo(
    () => (usersData?.results ?? []).filter((u) => u.role && u.role !== 'Consignee'),
    [usersData],
  );

  // ── Roster filters ───────────────────────────────────────────
  const [employeeFilter, setEmployeeFilter] = useState<number | ''>('');
  const [hoursFilters, setHoursFilters] = useState<HoursFilter[]>([]);

  const employeesInRoster = useMemo(() => {
    const map = new Map<number, string>();
    (roster ?? []).forEach((r) => map.set(r.employee_id, r.employee_name));
    return Array.from(map, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [roster]);

  const filteredRoster = useMemo(() => {
    let rows = roster ?? [];
    if (employeeFilter !== '') rows = rows.filter((r) => r.employee_id === employeeFilter);
    for (const f of hoursFilters) {
      if (f === 'overtime') rows = rows.filter((r) => parseFloat(r.weekly_cumulative_hours) > 40);
      if (f === 'long') rows = rows.filter((r) => parseFloat(r.total_hours) > 8);
      if (f === 'short') rows = rows.filter((r) => parseFloat(r.total_hours) < 2);
    }
    return rows;
  }, [roster, employeeFilter, hoursFilters]);

  // ── KPIs ─────────────────────────────────────────────────────
  const payrollHoursTotal = useMemo(
    () => (summary ?? []).reduce((a, r) => a + parseFloat(r.total_hours || '0'), 0),
    [summary],
  );
  const payrollPayTotal = useMemo(
    () => (summary ?? []).reduce((a, r) => a + parseFloat(r.total_pay || '0'), 0),
    [summary],
  );
  const weeklyHoursTotal = useMemo(
    () =>
      (thisWeekRoster ?? [])
        .filter((r) => !r.is_open)
        .reduce((a, r) => a + parseFloat(r.total_hours || '0'), 0),
    [thisWeekRoster],
  );

  /** Completed shift hours in the selected payroll range, grouped by employee and calendar week. */
  const payrollWeekHoursByEmployee = useMemo(() => {
    const map = new Map<number, Map<string, number>>();
    for (const row of roster ?? []) {
      if (row.is_open) continue;
      const hrs = parseFloat(row.total_hours || '0');
      if (!Number.isFinite(hrs)) continue;
      if (!map.has(row.employee_id)) map.set(row.employee_id, new Map());
      const weeks = map.get(row.employee_id)!;
      weeks.set(row.week_start, (weeks.get(row.week_start) ?? 0) + hrs);
    }
    return map;
  }, [roster]);

  // ── Mutations: roster row edit / add / delete ────────────────
  const invalidateTime = () => {
    queryClient.invalidateQueries({ queryKey: ['timeEntryRoster'] });
    queryClient.invalidateQueries({ queryKey: ['payrollHours'] });
  };

  const [rowDialogOpen, setRowDialogOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<TimeEntryRosterRow | null>(null);
  const [rowForm, setRowForm] = useState({ ...EMPTY_FORM });
  const [savingRow, setSavingRow] = useState(false);
  const [rosterSelection, setRosterSelection] = useState<GridRowSelectionModel>(EMPTY_ROW_SELECTION);
  const [deleteTargets, setDeleteTargets] = useState<number[]>([]);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const rosterSelectedIds = useMemo(
    () => selectionToIds(rosterSelection, filteredRoster.map((r) => r.id)),
    [rosterSelection, filteredRoster],
  );

  const openAddRow = () => {
    setEditingRow(null);
    setRowForm({ ...EMPTY_FORM, clock_in: toLocalInput(new Date().toISOString()) });
    setRowDialogOpen(true);
  };

  const openEditRow = (row: TimeEntryRosterRow) => {
    setEditingRow(row);
    setRowForm({
      employee: row.employee_id,
      clock_in: toLocalInput(row.clock_in),
      clock_out: toLocalInput(row.clock_out),
      break_minutes: String(row.break_minutes ?? 0),
    });
    setRowDialogOpen(true);
  };

  const saveRow = async () => {
    if (!rowForm.clock_in) {
      enqueueSnackbar('Clock in time is required', { variant: 'warning' });
      return;
    }
    if (!editingRow && rowForm.employee === '') {
      enqueueSnackbar('Select an employee', { variant: 'warning' });
      return;
    }
    setSavingRow(true);
    try {
      const clockInIso = fromLocalInput(rowForm.clock_in)!;
      const payload = {
        clock_in: clockInIso,
        clock_out: fromLocalInput(rowForm.clock_out),
        break_minutes: parseInt(rowForm.break_minutes || '0', 10) || 0,
      };
      if (editingRow) {
        await updateTimeEntry(editingRow.id, payload);
        enqueueSnackbar('Shift updated', { variant: 'success' });
      } else {
        await createTimeEntry({
          ...payload,
          employee: rowForm.employee,
          date: clockInIso.slice(0, 10),
        });
        enqueueSnackbar('Shift added', { variant: 'success' });
      }
      invalidateTime();
      setRowDialogOpen(false);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? 'Failed to save shift';
      enqueueSnackbar(String(msg), { variant: 'error' });
    } finally {
      setSavingRow(false);
    }
  };

  const confirmDelete = async () => {
    if (deleteTargets.length === 0) return;
    setBulkDeleting(true);
    try {
      const { data } = await bulkDeleteTimeEntries(deleteTargets);
      enqueueSnackbar(`${data.deleted} shift${data.deleted === 1 ? '' : 's'} removed`, { variant: 'success' });
      setRosterSelection(EMPTY_ROW_SELECTION);
      invalidateTime();
    } catch {
      enqueueSnackbar('Failed to remove shifts', { variant: 'error' });
    } finally {
      setBulkDeleting(false);
      setDeleteTargets([]);
    }
  };

  // ── Mod request approve / edit ───────────────────────────────
  const approveMut = useMutation({
    mutationFn: ({ id, note }: { id: number; note?: string }) => approveModificationRequest(id, note),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['modificationRequests'] });
      invalidateTime();
      enqueueSnackbar('Applied to time entry', { variant: 'success' });
    },
  });

  const rejectMut = useMutation({
    mutationFn: ({ id, note }: { id: number; note?: string }) => denyModificationRequest(id, note),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['modificationRequests'] });
      enqueueSnackbar('Request rejected', { variant: 'success' });
    },
    onError: () => {
      enqueueSnackbar('Failed to reject request', { variant: 'error' });
    },
  });

  const [editReqOpen, setEditReqOpen] = useState(false);
  const [reqTarget, setReqTarget] = useState<ModificationRequest | null>(null);
  const [reqForm, setReqForm] = useState({
    requested_clock_in: '',
    requested_clock_out: '',
    requested_break_minutes: '',
    reason: '',
    review_note: '',
  });
  const [savingReq, setSavingReq] = useState(false);
  const [requestSelection, setRequestSelection] = useState<GridRowSelectionModel>(EMPTY_ROW_SELECTION);
  const [deleteRequestTargets, setDeleteRequestTargets] = useState<number[]>([]);
  const [bulkActionLoading, setBulkActionLoading] = useState(false);

  const requestSelectedIds = useMemo(
    () => selectionToIds(requestSelection, (requests ?? []).map((r) => r.id)),
    [requestSelection, requests],
  );

  const confirmDeleteRequests = async () => {
    if (deleteRequestTargets.length === 0) return;
    setBulkActionLoading(true);
    try {
      const { data } = await bulkDeleteModificationRequests(deleteRequestTargets);
      enqueueSnackbar(`${data.deleted} request${data.deleted === 1 ? '' : 's'} removed`, { variant: 'success' });
      setRequestSelection(EMPTY_ROW_SELECTION);
      queryClient.invalidateQueries({ queryKey: ['modificationRequests'] });
    } catch {
      enqueueSnackbar('Failed to remove requests', { variant: 'error' });
    } finally {
      setBulkActionLoading(false);
      setDeleteRequestTargets([]);
    }
  };

  const bulkApproveRequests = async () => {
    if (requestSelectedIds.length === 0) return;
    setBulkActionLoading(true);
    try {
      const { data } = await bulkApproveModificationRequests(requestSelectedIds);
      enqueueSnackbar(`${data.approved} request${data.approved === 1 ? '' : 's'} approved`, { variant: 'success' });
      setRequestSelection(EMPTY_ROW_SELECTION);
      queryClient.invalidateQueries({ queryKey: ['modificationRequests'] });
      invalidateTime();
    } catch {
      enqueueSnackbar('Failed to approve requests', { variant: 'error' });
    } finally {
      setBulkActionLoading(false);
    }
  };

  const bulkRejectRequests = async () => {
    if (requestSelectedIds.length === 0) return;
    setBulkActionLoading(true);
    try {
      const { data } = await bulkRejectModificationRequests(requestSelectedIds);
      enqueueSnackbar(`${data.rejected} request${data.rejected === 1 ? '' : 's'} rejected`, { variant: 'success' });
      setRequestSelection(EMPTY_ROW_SELECTION);
      queryClient.invalidateQueries({ queryKey: ['modificationRequests'] });
    } catch {
      enqueueSnackbar('Failed to reject requests', { variant: 'error' });
    } finally {
      setBulkActionLoading(false);
    }
  };

  const openReq = (row: ModificationRequest) => {
    setReqTarget(row);
    setReqForm({
      requested_clock_in: toLocalInput(row.requested_clock_in),
      requested_clock_out: toLocalInput(row.requested_clock_out),
      requested_break_minutes: row.requested_break_minutes != null ? String(row.requested_break_minutes) : '',
      reason: row.reason,
      review_note: '',
    });
    setEditReqOpen(true);
  };

  const persistReq = async () => {
    if (!reqTarget) return;
    await updateModificationRequest(reqTarget.id, {
      requested_clock_in: fromLocalInput(reqForm.requested_clock_in),
      requested_clock_out: fromLocalInput(reqForm.requested_clock_out),
      requested_break_minutes: reqForm.requested_break_minutes
        ? parseInt(reqForm.requested_break_minutes, 10)
        : null,
      reason: reqForm.reason.trim(),
    });
  };

  const approveReqAndApply = async () => {
    if (!reqTarget) return;
    setSavingReq(true);
    try {
      await persistReq();
      await approveMut.mutateAsync({ id: reqTarget.id, note: reqForm.review_note.trim() || undefined });
      setEditReqOpen(false);
    } catch {
      enqueueSnackbar('Failed to approve', { variant: 'error' });
    } finally {
      setSavingReq(false);
    }
  };

  // ── Columns ──────────────────────────────────────────────────
  const rosterColumns: GridColDef[] = [
    { field: 'date', headerName: 'Date', width: 112 },
    { field: 'employee_name', headerName: 'Employee', width: 190 },
    { field: 'clock_in', headerName: 'Start', width: 130, valueFormatter: (v, row) => fmtClockCell(v as string | null, row.date as string) },
    { field: 'clock_out', headerName: 'Stop', width: 130, valueFormatter: (v, row) => fmtClockCell(v as string | null, row.date as string) },
    { field: 'break_label', headerName: 'Break', width: 112 },
    {
      field: 'total_hours',
      headerName: 'Hours',
      width: 82,
      cellClassName: 'tabular',
      valueFormatter: (v) => fmtHours(v as string),
    },
    {
      field: 'weekly_cumulative_hours',
      headerName: 'Week hours',
      width: OVERTIME_HOURS_COL_WIDTH,
      minWidth: OVERTIME_HOURS_COL_WIDTH,
      flex: 0,
      cellClassName: 'tabular overtime-hours-cell',
      renderCell: ({ value }) => <WeeklyHoursLine total={parseFloat(String(value))} />,
    },
    {
      field: 'pay',
      headerName: 'Pay',
      width: 95,
      cellClassName: 'tabular',
      valueFormatter: (v) => fmtMoney(v as string),
    },
    {
      field: 'actions',
      headerName: '',
      width: 90,
      sortable: false,
      renderCell: ({ row }) => (
        <Box sx={{ display: 'inline-flex', alignItems: 'center' }}>
          <Tooltip title="Edit shift">
            <IconButton size="small" onClick={() => openEditRow(row as TimeEntryRosterRow)}>
              <Edit fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Remove shift">
            <IconButton size="small" color="error" onClick={() => setDeleteTargets([(row as TimeEntryRosterRow).id])}>
              <Delete fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      ),
    },
  ];

  const summaryColumns: GridColDef[] = [
    { field: 'employee_name', headerName: 'Employee', width: 200 },
    {
      field: 'pay_rate',
      headerName: 'Rate',
      width: 96,
      cellClassName: 'tabular',
      valueFormatter: (v) => fmtMoney(v as string),
    },
    {
      field: 'hours_this_week',
      headerName: 'This week',
      width: OVERTIME_HOURS_COL_WIDTH,
      minWidth: OVERTIME_HOURS_COL_WIDTH,
      flex: 0,
      cellClassName: 'tabular overtime-hours-cell',
      renderCell: ({ value }) => <ThisWeekHoursCell value={value as string} />,
    },
    {
      field: 'total_hours',
      headerName: 'This payroll',
      width: OVERTIME_PAYROLL_COL_WIDTH,
      minWidth: OVERTIME_PAYROLL_COL_WIDTH,
      flex: 0,
      cellClassName: 'tabular overtime-hours-cell',
      sortable: false,
      renderCell: ({ row }) => {
        const weeksMap = payrollWeekHoursByEmployee.get(row.employee_id as number);
        const weeks = weeksMap
          ? [...weeksMap.entries()]
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([week_start, hours]) => ({ week_start, hours }))
          : [];
        return <PayrollPeriodHoursCell weeks={weeks} />;
      },
    },
    {
      field: 'total_pay',
      headerName: 'Payroll $',
      width: 112,
      cellClassName: 'tabular',
      renderCell: ({ value }) => (
        <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>{fmtMoney(value as string)}</span>
      ),
    },
    { field: 'entry_count', headerName: '# Shifts', width: 88, cellClassName: 'tabular' },
  ];

  const requestColumns: GridColDef[] = [
    { field: 'employee_name', headerName: 'Employee', width: 180 },
    { field: 'entry_date', headerName: 'Shift', width: 108 },
    {
      field: 'requested_clock_in',
      headerName: 'Wants in',
      width: 134,
      valueFormatter: (v) => fmtDt(v as string | null),
    },
    {
      field: 'requested_clock_out',
      headerName: 'Wants out',
      width: 134,
      valueFormatter: (v) => fmtDt(v as string | null),
    },
    {
      field: 'status',
      headerName: 'Status',
      width: 110,
      renderCell: ({ value }) => <StatusBadge status={value === 'denied' ? 'rejected' : String(value)} />,
    },
    { field: 'reason', headerName: 'Reason', width: 220 },
    { field: 'entry_clock_in', headerName: 'Was in', width: 134, valueFormatter: (v) => fmtDt(v as string | null) },
    { field: 'entry_clock_out', headerName: 'Was out', width: 134, valueFormatter: (v) => fmtDt(v as string | null) },
    {
      field: 'actions',
      headerName: '',
      width: 280,
      sortable: false,
      renderCell: ({ row }) =>
        row.status === 'pending' ? (
          <Stack direction="row" spacing={1}>
            <Button size="small" startIcon={<Edit />} onClick={() => openReq(row as ModificationRequest)}>
              Edit
            </Button>
            <Button
              size="small"
              color="success"
              startIcon={<Check />}
              onClick={() => approveMut.mutate({ id: (row as ModificationRequest).id })}
              disabled={approveMut.isPending}
            >
              Approve
            </Button>
            <Button
              size="small"
              color="warning"
              startIcon={<Block />}
              onClick={() => rejectMut.mutate({ id: (row as ModificationRequest).id })}
              disabled={rejectMut.isPending}
            >
              Reject
            </Button>
          </Stack>
        ) : null,
    },
  ];

  if (periodsLoading) return <LoadingScreen message="Loading time & payroll..." />;

  return (
    <Box>
      <PageHeader
        title="Time & payroll"
        subtitle="Shifts, hours, pay, and change requests - biweekly periods from Jun 8, 2026"
      />

      {/* Period controls */}
      <Card variant="outlined" sx={{ mb: 3 }}>
        <CardContent sx={{ py: 2 }}>
          <Stack spacing={2}>
            <Stack
              direction={{ xs: 'column', md: 'row' }}
              spacing={2}
              alignItems={{ xs: 'stretch', md: 'flex-end' }}
              flexWrap="wrap"
              useFlexGap
            >
              <FormControl size="small" sx={{ minWidth: 320, width: { xs: '100%', md: 320 } }}>
                <InputLabel id="period-quick-select-label" shrink>
                  Period quick select
                </InputLabel>
                <Select
                  labelId="period-quick-select-label"
                  label="Period quick select"
                  value={selectedPeriodKey}
                  onChange={(e) => {
                    const [from, to] = String(e.target.value).split('|');
                    if (from && to) applyRange(from, to);
                  }}
                  displayEmpty
                  renderValue={(val) => {
                    if (!val) {
                      return (
                        <Box component="span" sx={{ color: 'text.secondary' }}>
                          Custom range
                        </Box>
                      );
                    }
                    const p = periods?.find((x) => `${x.date_from}|${x.date_to}` === val);
                    return p ? fmtRangeLabel(p.date_from, p.date_to) : val;
                  }}
                  MenuProps={{ PaperProps: { sx: { minWidth: 320 } } }}
                >
                  {(periods ?? []).map((p) => (
                    <MenuItem key={`${p.date_from}-${p.date_to}`} value={`${p.date_from}|${p.date_to}`}>
                      {fmtRangeLabel(p.date_from, p.date_to)}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              <DatePicker
                label="From"
                value={dateFrom}
                onChange={(d) => {
                  setDateFrom(d);
                  if (d && dateTo && d > dateTo) setDateTo(d);
                }}
                format={DATE_DISPLAY_FORMAT}
                slotProps={{
                  textField: {
                    size: 'small',
                    sx: { width: { xs: '100%', md: 168 } },
                  },
                }}
              />
              <DatePicker
                label="To"
                value={dateTo}
                onChange={(d) => {
                  setDateTo(d);
                  if (d && dateFrom && d < dateFrom) setDateFrom(d);
                }}
                format={DATE_DISPLAY_FORMAT}
                minDate={dateFrom ?? undefined}
                slotProps={{
                  textField: {
                    size: 'small',
                    sx: { width: { xs: '100%', md: 168 } },
                  },
                }}
              />
            </Stack>

            <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap>
              <SplitToggle
                leftLabel="Last week"
                rightLabel="This week"
                leftActive={isActive(lastWeek.date_from, lastWeek.date_to)}
                rightActive={isActive(thisWeek.date_from, thisWeek.date_to)}
                onLeft={() => applyRange(lastWeek.date_from, lastWeek.date_to)}
                onRight={() => applyRange(thisWeek.date_from, thisWeek.date_to)}
              />
              {lastPeriod && currentPeriod && (
                <SplitToggle
                  leftLabel="Last period"
                  rightLabel="This period"
                  leftActive={isActive(lastPeriod.date_from, lastPeriod.date_to)}
                  rightActive={isActive(currentPeriod.date_from, currentPeriod.date_to)}
                  onLeft={() => applyRange(lastPeriod.date_from, lastPeriod.date_to)}
                  onRight={() => applyRange(currentPeriod.date_from, currentPeriod.date_to)}
                />
              )}
              <SplitToggle
                leftLabel="Last month"
                rightLabel="This month"
                leftActive={isActive(lastMonth.date_from, lastMonth.date_to)}
                rightActive={isActive(thisMonth.date_from, thisMonth.date_to)}
                onLeft={() => applyRange(lastMonth.date_from, lastMonth.date_to)}
                onRight={() => applyRange(thisMonth.date_from, thisMonth.date_to)}
              />
            </Stack>
          </Stack>
        </CardContent>
      </Card>

      {/* KPI cards */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' },
          gap: 2,
          mb: 3,
        }}
      >
        <KpiCard label="This week" value={`${weeklyHoursTotal.toFixed(2)} h`} sub="Mon-Sun (current week)" />
        <KpiCard label="Payroll hours" value={`${payrollHoursTotal.toFixed(2)} h`} sub="Selected period" />
        <KpiCard label="Payroll total" value={fmtMoney(payrollPayTotal)} sub="Rate × hours" accent="success" />
        <KpiCard
          label="Pending requests"
          value={String(pendingCount)}
          sub="Time changes"
          accent={pendingCount > 0 ? 'warning' : undefined}
        />
      </Box>

      {/* Tabs */}
      <Tabs value={tab} onChange={(_e, v) => setTab(v)} sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}>
        <Tab label="Roster" />
        <Tab label="By employee" />
        <Tab
          label={
            <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
              <span>Change requests</span>
              {pendingCount > 0 && (
                <Box
                  component="span"
                  sx={{
                    minWidth: 20,
                    height: 20,
                    px: 0.75,
                    borderRadius: 10,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    bgcolor: 'warning.main',
                    color: 'warning.contrastText',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    lineHeight: 1,
                  }}
                >
                  {pendingCount}
                </Box>
              )}
            </Box>
          }
        />
      </Tabs>

      {tab === 0 && (
        <Box>
          <Card variant="outlined" sx={TAB_TOOLBAR_CARD_SX}>
            <CardContent sx={TAB_TOOLBAR_CONTENT_SX}>
              <Stack
                direction={{ xs: 'column', sm: 'row' }}
                spacing={2}
                sx={TAB_TOOLBAR_ROW_SX}
                flexWrap="wrap"
                useFlexGap
              >
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} flexWrap="wrap" useFlexGap>
                  <FormControl size="small" sx={{ minWidth: 200 }}>
                    <InputLabel>Employee</InputLabel>
                    <Select
                      label="Employee"
                      value={employeeFilter}
                      onChange={(e) => {
                        const raw = String(e.target.value);
                        setEmployeeFilter(raw === '' ? '' : Number(raw));
                      }}
                    >
                      <MenuItem value="">All employees</MenuItem>
                      {employeesInRoster.map((e) => (
                        <MenuItem key={e.id} value={e.id}>
                          {e.name}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>

                  <ToggleButtonGroup
                    size="small"
                    value={hoursFilters}
                    onChange={(_e, val) => setHoursFilters(val as HoursFilter[])}
                  >
                    <ToggleButton value="overtime" color="error">
                      Overtime
                    </ToggleButton>
                    <ToggleButton value="long">Long &gt; 8h</ToggleButton>
                    <ToggleButton value="short">Short &lt; 2h</ToggleButton>
                  </ToggleButtonGroup>
                </Stack>

                <Stack
                  direction="row"
                  spacing={1}
                  alignItems="center"
                  sx={{ ml: { sm: 'auto' }, minWidth: { sm: 360 } }}
                >
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ minWidth: 76, textAlign: 'right' }}
                  >
                    {rosterSelectedIds.length} selected
                  </Typography>
                  <Button
                    size="small"
                    color="error"
                    variant="outlined"
                    startIcon={<Delete />}
                    onClick={() => setDeleteTargets(rosterSelectedIds)}
                    disabled={rosterSelectedIds.length === 0}
                  >
                    Remove selected
                  </Button>
                  <Button variant="contained" startIcon={<Add />} onClick={openAddRow}>
                    Add shift
                  </Button>
                </Stack>
              </Stack>
            </CardContent>
          </Card>

          <Card variant="outlined">
            <DataGrid
              autoHeight
              density="compact"
              rows={filteredRoster}
              columns={rosterColumns}
              loading={rosterLoading}
              checkboxSelection
              disableRowSelectionOnClick
              rowSelectionModel={rosterSelection}
              onRowSelectionModelChange={setRosterSelection}
              pageSizeOptions={[25, 50, 100]}
              initialState={{ pagination: { paginationModel: { pageSize: 50 } } }}
              getRowClassName={({ row }) => (row.is_open ? 'roster-open-shift' : '')}
              sx={{
                ...DATA_GRID_SX,
                '& .roster-open-shift': { bgcolor: 'action.hover' },
              }}
            />
          </Card>
        </Box>
      )}

      {tab === 1 && (
        <Box>
          <Card variant="outlined" sx={TAB_TOOLBAR_CARD_SX}>
            <CardContent sx={TAB_TOOLBAR_CONTENT_SX}>
              <Stack
                direction={{ xs: 'column', sm: 'row' }}
                spacing={2}
                sx={TAB_TOOLBAR_ROW_SX}
                flexWrap="wrap"
                useFlexGap
              >
                <Box>
                  <Typography variant="subtitle2" fontWeight={700}>
                    Employee payroll summary
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Completed shifts only · weeks Mon-Sun · 40h/week before overtime
                  </Typography>
                </Box>
                <Stack
                  direction="row"
                  spacing={1}
                  alignItems="center"
                  sx={{ ml: { sm: 'auto' }, minWidth: { sm: 360 }, justifyContent: 'flex-end' }}
                >
                  <Typography variant="body2" color="text.secondary" sx={{ minWidth: 110, textAlign: 'right' }}>
                    {(summary ?? []).length} employees
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ minWidth: 130, textAlign: 'right' }}>
                    {fmtMoney(payrollPayTotal)}
                  </Typography>
                </Stack>
              </Stack>
            </CardContent>
          </Card>

          <Card variant="outlined">
            <DataGrid
              autoHeight
              density="compact"
              rows={(summary ?? []).map((r) => ({ ...r, id: r.employee_id }))}
              columns={summaryColumns}
              loading={summaryLoading}
              disableRowSelectionOnClick
              getRowHeight={() => 'auto'}
              pageSizeOptions={[25, 50]}
              initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
              sx={{
                ...DATA_GRID_SX,
                '& .MuiDataGrid-cell': { py: 1, alignItems: 'flex-start' },
              }}
            />
          </Card>
        </Box>
      )}

      {tab === 2 && (
        <Box>
          <Card variant="outlined" sx={TAB_TOOLBAR_CARD_SX}>
            <CardContent sx={TAB_TOOLBAR_CONTENT_SX}>
              <Stack
                direction={{ xs: 'column', sm: 'row' }}
                spacing={2}
                sx={TAB_TOOLBAR_ROW_SX}
                flexWrap="wrap"
                useFlexGap
              >
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                  {(['pending', 'approved', 'denied', ''] as const).map((s) => (
                    <Button
                      key={s || 'all'}
                      size="small"
                      variant={statusFilter === s ? 'contained' : 'outlined'}
                      onClick={() => setStatusFilter(s)}
                    >
                      {s === '' ? 'All' : s === 'denied' ? 'Rejected' : s.charAt(0).toUpperCase() + s.slice(1)}
                    </Button>
                  ))}
                </Stack>
                <Stack
                  direction="row"
                  spacing={1}
                  alignItems="center"
                  sx={{ ml: { sm: 'auto' }, minWidth: { sm: 540 } }}
                >
                  <Typography variant="body2" color="text.secondary" sx={{ minWidth: 76, textAlign: 'right' }}>
                    {requestSelectedIds.length} selected
                  </Typography>
                  <Button
                    size="small"
                    color="success"
                    variant="outlined"
                    startIcon={<Check />}
                    onClick={bulkApproveRequests}
                    disabled={bulkActionLoading || statusFilter !== 'pending' || requestSelectedIds.length === 0}
                  >
                    Approve selected
                  </Button>
                  <Button
                    size="small"
                    color="warning"
                    variant="outlined"
                    startIcon={<Block />}
                    onClick={bulkRejectRequests}
                    disabled={bulkActionLoading || statusFilter !== 'pending' || requestSelectedIds.length === 0}
                  >
                    Reject selected
                  </Button>
                  <Button
                    size="small"
                    color="error"
                    variant="outlined"
                    startIcon={<Delete />}
                    onClick={() => setDeleteRequestTargets(requestSelectedIds)}
                    disabled={bulkActionLoading || requestSelectedIds.length === 0}
                  >
                    Remove selected
                  </Button>
                </Stack>
              </Stack>
            </CardContent>
          </Card>

          <Card variant="outlined">
            <DataGrid
              autoHeight
              density="compact"
              rows={requests ?? []}
              columns={requestColumns}
              loading={requestsLoading}
              checkboxSelection
              disableRowSelectionOnClick
              rowSelectionModel={requestSelection}
              onRowSelectionModelChange={setRequestSelection}
              pageSizeOptions={[25, 50, 100]}
              initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
              sx={DATA_GRID_SX}
            />
          </Card>
        </Box>
      )}

      {/* Add / edit shift dialog */}
      <Dialog open={rowDialogOpen} onClose={() => setRowDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editingRow ? 'Edit shift' : 'Add shift'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {editingRow ? (
              <Typography variant="body2" color="text.secondary">
                {editingRow.employee_name}
              </Typography>
            ) : (
              <FormControl fullWidth>
                <InputLabel>Employee</InputLabel>
                <Select
                  label="Employee"
                  value={rowForm.employee}
                  onChange={(e) => setRowForm((f) => ({ ...f, employee: Number(e.target.value) }))}
                >
                  {staffOptions.map((u) => (
                    <MenuItem key={u.id} value={u.id}>
                      {u.full_name} ({u.role})
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}
            <TextField
              label="Clock in"
              type="datetime-local"
              value={rowForm.clock_in}
              onChange={(e) => setRowForm((f) => ({ ...f, clock_in: e.target.value }))}
              InputLabelProps={{ shrink: true }}
              fullWidth
            />
            <TextField
              label="Clock out (leave blank for open shift)"
              type="datetime-local"
              value={rowForm.clock_out}
              onChange={(e) => setRowForm((f) => ({ ...f, clock_out: e.target.value }))}
              InputLabelProps={{ shrink: true }}
              fullWidth
            />
            <TextField
              label="Break minutes"
              type="number"
              value={rowForm.break_minutes}
              onChange={(e) => setRowForm((f) => ({ ...f, break_minutes: e.target.value }))}
              fullWidth
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRowDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={saveRow} disabled={savingRow}>
            {editingRow ? 'Save' : 'Add shift'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete confirm */}
      <ConfirmDialog
        open={deleteTargets.length > 0}
        title={deleteTargets.length === 1 ? 'Remove shift?' : `Remove ${deleteTargets.length} shifts?`}
        message={`Selected shifts will be hidden from the roster. ${SOFT_DELETE_NOTE}`}
        confirmLabel="Remove"
        severity="error"
        loading={bulkDeleting}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTargets([])}
      />

      <ConfirmDialog
        open={deleteRequestTargets.length > 0}
        title={
          deleteRequestTargets.length === 1
            ? 'Remove change request?'
            : `Remove ${deleteRequestTargets.length} change requests?`
        }
        message={`Selected requests will be hidden from the list. ${SOFT_DELETE_NOTE}`}
        confirmLabel="Remove"
        severity="error"
        loading={bulkActionLoading}
        onConfirm={confirmDeleteRequests}
        onCancel={() => setDeleteRequestTargets([])}
      />

      {/* Edit & approve change request */}
      <Dialog open={editReqOpen} onClose={() => setEditReqOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Edit &amp; approve time change</DialogTitle>
        <DialogContent>
          {reqTarget && (
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              {reqTarget.employee_name} - shift {reqTarget.entry_date}
            </Typography>
          )}
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Requested clock in"
              type="datetime-local"
              value={reqForm.requested_clock_in}
              onChange={(e) => setReqForm((f) => ({ ...f, requested_clock_in: e.target.value }))}
              InputLabelProps={{ shrink: true }}
              fullWidth
            />
            <TextField
              label="Requested clock out"
              type="datetime-local"
              value={reqForm.requested_clock_out}
              onChange={(e) => setReqForm((f) => ({ ...f, requested_clock_out: e.target.value }))}
              InputLabelProps={{ shrink: true }}
              fullWidth
            />
            <TextField
              label="Break minutes"
              type="number"
              value={reqForm.requested_break_minutes}
              onChange={(e) => setReqForm((f) => ({ ...f, requested_break_minutes: e.target.value }))}
              fullWidth
            />
            <TextField
              label="Reason"
              multiline
              minRows={2}
              value={reqForm.reason}
              onChange={(e) => setReqForm((f) => ({ ...f, reason: e.target.value }))}
              fullWidth
            />
            <TextField
              label="Note (optional, saved on approve)"
              multiline
              minRows={2}
              value={reqForm.review_note}
              onChange={(e) => setReqForm((f) => ({ ...f, review_note: e.target.value }))}
              fullWidth
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditReqOpen(false)}>Cancel</Button>
          <Button
            onClick={async () => {
              setSavingReq(true);
              try {
                await persistReq();
                queryClient.invalidateQueries({ queryKey: ['modificationRequests'] });
                enqueueSnackbar('Request updated', { variant: 'success' });
                setEditReqOpen(false);
              } catch {
                enqueueSnackbar('Failed to save', { variant: 'error' });
              } finally {
                setSavingReq(false);
              }
            }}
            disabled={savingReq}
          >
            Save edits
          </Button>
          <Button variant="contained" color="success" onClick={approveReqAndApply} disabled={savingReq}>
            Save &amp; approve
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
