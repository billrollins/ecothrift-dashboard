import { useState } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  IconButton,
  MenuItem,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import Edit from '@mui/icons-material/Edit';
import Delete from '@mui/icons-material/Delete';
import NoteAdd from '@mui/icons-material/NoteAdd';
import { DataGrid, type GridColDef, type GridRowSelectionModel } from '@mui/x-data-grid';
import { PageHeader } from '../../components/common/PageHeader';
import { StatusBadge } from '../../components/common/StatusBadge';
import { LoadingScreen } from '../../components/feedback/LoadingScreen';
import { ConfirmDialog } from '../../components/feedback/ConfirmDialog';
import {
  useTimeEntries,
  useApproveEntry,
  useBulkApprove,
  useUpdateTimeEntry,
  useDeleteTimeEntry,
  useTimeSummary,
  useModificationRequests,
  useCreateModificationRequest,
  useApproveModificationRequest,
  useDenyModificationRequest,
} from '../../hooks/useTimeEntries';
import { useUsers } from '../../hooks/useEmployees';
import { useAuth } from '../../contexts/AuthContext';
import type { TimeEntry } from '../../types/hr.types';
import type { ModificationRequest } from '../../api/hr.api';
import { useSnackbar } from 'notistack';
import { format } from 'date-fns';

export default function TimeHistoryPage() {
  const { user, hasRole } = useAuth();
  const { enqueueSnackbar } = useSnackbar();
  const isManager = hasRole('Manager') || hasRole('Admin');

  // Filters
  const [employeeId, setEmployeeId] = useState<string>('');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [status, setStatus] = useState<string>('');
  const [selectedIds, setSelectedIds] = useState<GridRowSelectionModel>({
    type: 'include',
    ids: new Set(),
  });

  // Edit dialog
  const [editOpen, setEditOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<TimeEntry | null>(null);
  const [editForm, setEditForm] = useState({ clock_in: '', clock_out: '', break_minutes: '' });

  // Delete confirm
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<TimeEntry | null>(null);

  // Mod request dialog (employee)
  const [modOpen, setModOpen] = useState(false);
  const [modTarget, setModTarget] = useState<TimeEntry | null>(null);
  const [modForm, setModForm] = useState({
    requested_clock_in: '',
    requested_clock_out: '',
    requested_break_minutes: '',
    reason: '',
  });

  // Mod request review dialog (manager)
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewTarget, setReviewTarget] = useState<ModificationRequest | null>(null);
  const [reviewNote, setReviewNote] = useState('');

  const params = {
    employee: employeeId ? parseInt(employeeId, 10) : undefined,
    date_from: dateFrom || undefined,
    date_to: dateTo || undefined,
    status: status || undefined,
  };

  const { data: entriesData, isLoading } = useTimeEntries(params);
  const { data: summaryData } = useTimeSummary(params);
  const { data: usersData } = useUsers({ role: 'Employee' });
  const { data: modRequestsData } = useModificationRequests(
    isManager ? { status: 'pending' } : undefined,
  );
  const approveEntry = useApproveEntry();
  const bulkApprove = useBulkApprove();
  const updateTimeEntry = useUpdateTimeEntry();
  const deleteTimeEntry = useDeleteTimeEntry();
  const createModRequest = useCreateModificationRequest();
  const approveModRequest = useApproveModificationRequest();
  const denyModRequest = useDenyModificationRequest();

  const entries = entriesData?.results ?? [];
  const summary = summaryData as { total_hours?: string } | undefined;
  const users = usersData?.results ?? [];
  const modRequests = (modRequestsData?.results ?? []) as ModificationRequest[];

  // Handlers
  const handleApprove = async (id: number) => {
    try {
      await approveEntry.mutateAsync(id);
      enqueueSnackbar('Entry approved', { variant: 'success' });
    } catch {
      enqueueSnackbar('Failed to approve', { variant: 'error' });
    }
  };

  const handleBulkApprove = async (ids: number[]) => {
    if (ids.length === 0) return;
    try {
      await bulkApprove.mutateAsync(ids);
      enqueueSnackbar(`${ids.length} entries approved`, { variant: 'success' });
      setSelectedIds({ type: 'include', ids: new Set() });
    } catch {
      enqueueSnackbar('Failed to approve', { variant: 'error' });
    }
  };

  const handleOpenEdit = (entry: TimeEntry) => {
    setEditTarget(entry);
    setEditForm({
      clock_in: entry.clock_in ? entry.clock_in.slice(0, 16) : '',
      clock_out: entry.clock_out ? entry.clock_out.slice(0, 16) : '',
      break_minutes: String(entry.break_minutes),
    });
    setEditOpen(true);
  };

  const handleEdit = async () => {
    if (!editTarget) return;
    try {
      await updateTimeEntry.mutateAsync({
        id: editTarget.id,
        data: {
          clock_in: editForm.clock_in ? new Date(editForm.clock_in).toISOString() : undefined,
          clock_out: editForm.clock_out ? new Date(editForm.clock_out).toISOString() : undefined,
          break_minutes: editForm.break_minutes ? parseInt(editForm.break_minutes, 10) : undefined,
        },
      });
      enqueueSnackbar('Time entry updated', { variant: 'success' });
      setEditOpen(false);
    } catch {
      enqueueSnackbar('Failed to update', { variant: 'error' });
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteTimeEntry.mutateAsync(deleteTarget.id);
      enqueueSnackbar('Time entry deleted', { variant: 'success' });
      setDeleteOpen(false);
      setDeleteTarget(null);
    } catch {
      enqueueSnackbar('Failed to delete', { variant: 'error' });
    }
  };

  const handleOpenModRequest = (entry: TimeEntry) => {
    setModTarget(entry);
    setModForm({
      requested_clock_in: entry.clock_in ? entry.clock_in.slice(0, 16) : '',
      requested_clock_out: entry.clock_out ? entry.clock_out.slice(0, 16) : '',
      requested_break_minutes: String(entry.break_minutes),
      reason: '',
    });
    setModOpen(true);
  };

  const handleSubmitModRequest = async () => {
    if (!modTarget || !modForm.reason) {
      enqueueSnackbar('Reason is required', { variant: 'warning' });
      return;
    }
    try {
      await createModRequest.mutateAsync({
        time_entry: modTarget.id,
        requested_clock_in: modForm.requested_clock_in
          ? new Date(modForm.requested_clock_in).toISOString()
          : null,
        requested_clock_out: modForm.requested_clock_out
          ? new Date(modForm.requested_clock_out).toISOString()
          : null,
        requested_break_minutes: modForm.requested_break_minutes
          ? parseInt(modForm.requested_break_minutes, 10)
          : null,
        reason: modForm.reason,
      });
      enqueueSnackbar('Modification request submitted', { variant: 'success' });
      setModOpen(false);
    } catch {
      enqueueSnackbar('Failed to submit request', { variant: 'error' });
    }
  };

  const handleApproveModRequest = async () => {
    if (!reviewTarget) return;
    try {
      await approveModRequest.mutateAsync({ id: reviewTarget.id, reviewNote });
      enqueueSnackbar('Modification approved', { variant: 'success' });
      setReviewOpen(false);
      setReviewTarget(null);
      setReviewNote('');
    } catch {
      enqueueSnackbar('Failed to approve', { variant: 'error' });
    }
  };

  const handleDenyModRequest = async () => {
    if (!reviewTarget) return;
    try {
      await denyModRequest.mutateAsync({ id: reviewTarget.id, reviewNote });
      enqueueSnackbar('Modification denied', { variant: 'success' });
      setReviewOpen(false);
      setReviewTarget(null);
      setReviewNote('');
    } catch {
      enqueueSnackbar('Failed to deny', { variant: 'error' });
    }
  };

  const columns: GridColDef[] = [
    { field: 'employee_name', headerName: 'Employee', flex: 1, minWidth: 140 },
    {
      field: 'date',
      headerName: 'Date',
      width: 120,
      valueFormatter: (value) => (value ? format(new Date(value), 'MMM d, yyyy') : ''),
    },
    {
      field: 'clock_in',
      headerName: 'Clock In',
      width: 100,
      valueFormatter: (value) => (value ? format(new Date(value), 'h:mm a') : ''),
    },
    {
      field: 'clock_out',
      headerName: 'Clock Out',
      width: 100,
      valueFormatter: (value) => (value ? format(new Date(value), 'h:mm a') : '—'),
    },
    { field: 'break_minutes', headerName: 'Break', width: 70 },
    { field: 'total_hours', headerName: 'Hours', width: 80 },
    {
      field: 'status',
      headerName: 'Status',
      width: 110,
      renderCell: ({ value }) => <StatusBadge status={value ?? ''} />,
    },
    {
      field: 'actions',
      headerName: 'Actions',
      width: isManager ? 180 : 80,
      sortable: false,
      renderCell: ({ row }) => {
        const entry = row as TimeEntry;
        return (
          <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center', height: '100%' }}>
            {/* Employee: request modification for approved entries */}
            {!isManager && entry.status === 'approved' && (
              <Tooltip title="Request Modification">
                <IconButton size="small" onClick={() => handleOpenModRequest(entry)}>
                  <NoteAdd fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
            {/* Manager: edit and delete */}
            {isManager && (
              <>
                {entry.status === 'pending' && (
                  <Button size="small" onClick={() => handleApprove(entry.id)}>
                    Approve
                  </Button>
                )}
                <Tooltip title="Edit">
                  <IconButton size="small" onClick={() => handleOpenEdit(entry)}>
                    <Edit fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Delete">
                  <IconButton
                    size="small"
                    color="error"
                    onClick={() => {
                      setDeleteTarget(entry);
                      setDeleteOpen(true);
                    }}
                  >
                    <Delete fontSize="small" />
                  </IconButton>
                </Tooltip>
              </>
            )}
          </Box>
        );
      },
    },
  ];

  if (isLoading) return <LoadingScreen message="Loading time entries..." />;

  return (
    <Box>
      <PageHeader
        title="Time History"
        subtitle="View and manage time entries"
        action={
          isManager && selectedIds.ids.size > 0 ? (
            <Button
              variant="contained"
              onClick={() => handleBulkApprove(Array.from(selectedIds.ids) as number[])}
              disabled={bulkApprove.isPending}
            >
              Approve {selectedIds.ids.size} selected
            </Button>
          ) : undefined
        }
      />

      <Grid container spacing={3}>
        {summary && (
          <Grid size={12}>
            <Card>
              <CardContent sx={{ py: 1.5 }}>
                <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                  <Box>
                    <strong>Total Hours:</strong> {summary.total_hours ?? '0'}
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        )}

        {/* Pending Modification Requests (manager view) */}
        {isManager && modRequests.length > 0 && (
          <Grid size={12}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Pending Modification Requests ({modRequests.length})
                </Typography>
                <DataGrid
                  rows={modRequests}
                  columns={[
                    { field: 'employee_name', headerName: 'Employee', flex: 1, minWidth: 120 },
                    {
                      field: 'entry_date',
                      headerName: 'Entry Date',
                      width: 110,
                      valueFormatter: (value) =>
                        value ? format(new Date(value), 'MMM d, yyyy') : '',
                    },
                    { field: 'reason', headerName: 'Reason', flex: 1, minWidth: 150 },
                    {
                      field: 'created_at',
                      headerName: 'Submitted',
                      width: 130,
                      valueFormatter: (value) =>
                        value ? format(new Date(value), 'MMM d, h:mm a') : '',
                    },
                    {
                      field: 'review_actions',
                      headerName: 'Actions',
                      width: 120,
                      sortable: false,
                      renderCell: ({ row }) => (
                        <Button
                          size="small"
                          variant="outlined"
                          onClick={() => {
                            setReviewTarget(row as ModificationRequest);
                            setReviewNote('');
                            setReviewOpen(true);
                          }}
                        >
                          Review
                        </Button>
                      ),
                    },
                  ]}
                  autoHeight
                  pageSizeOptions={[5]}
                  initialState={{ pagination: { paginationModel: { pageSize: 5 } } }}
                  getRowId={(row) => row.id}
                  sx={{ border: 'none' }}
                />
              </CardContent>
            </Card>
          </Grid>
        )}

        <Grid size={12}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mb: 2 }}>
                <TextField
                  select
                  label="Employee"
                  size="small"
                  value={employeeId}
                  onChange={(e) => setEmployeeId(e.target.value)}
                  sx={{ minWidth: 180 }}
                >
                  <MenuItem value="">All</MenuItem>
                  {users.map((u) => (
                    <MenuItem key={u.id} value={String(u.id)}>
                      {u.full_name}
                    </MenuItem>
                  ))}
                </TextField>
                <TextField
                  label="From"
                  type="date"
                  size="small"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: dateTo || undefined } }}
                />
                <TextField
                  label="To"
                  type="date"
                  size="small"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: dateFrom || undefined } }}
                />
                <TextField
                  select
                  label="Status"
                  size="small"
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  sx={{ minWidth: 120 }}
                >
                  <MenuItem value="">All</MenuItem>
                  <MenuItem value="pending">Pending</MenuItem>
                  <MenuItem value="approved">Approved</MenuItem>
                  <MenuItem value="flagged">Flagged</MenuItem>
                </TextField>
              </Box>
              <Box sx={{ height: 500 }}>
                <DataGrid
                  rows={entries}
                  columns={columns}
                  loading={isLoading}
                  pageSizeOptions={[10, 25, 50, 100]}
                  initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
                  checkboxSelection={isManager}
                  rowSelectionModel={selectedIds}
                  onRowSelectionModelChange={(ids) => setSelectedIds(ids)}
                  getRowId={(row) => row.id}
                />
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Manager: Edit Time Entry Dialog */}
      <Dialog open={editOpen} onClose={() => setEditOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Edit Time Entry</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                label="Clock In"
                type="datetime-local"
                value={editForm.clock_in}
                onChange={(e) => setEditForm((f) => ({ ...f, clock_in: e.target.value }))}
              />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                label="Clock Out"
                type="datetime-local"
                value={editForm.clock_out}
                onChange={(e) => setEditForm((f) => ({ ...f, clock_out: e.target.value }))}
              />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                label="Break Minutes"
                type="number"
                value={editForm.break_minutes}
                onChange={(e) => setEditForm((f) => ({ ...f, break_minutes: e.target.value }))}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleEdit} disabled={updateTimeEntry.isPending}>
            Save
          </Button>
        </DialogActions>
      </Dialog>

      {/* Manager: Delete Time Entry Confirm */}
      <ConfirmDialog
        open={deleteOpen}
        title="Delete Time Entry"
        message={`Delete this time entry for ${deleteTarget?.employee_name ?? ''} on ${deleteTarget?.date ?? ''}?`}
        confirmLabel="Delete"
        confirmColor="error"
        onConfirm={handleDelete}
        onCancel={() => {
          setDeleteOpen(false);
          setDeleteTarget(null);
        }}
        loading={deleteTimeEntry.isPending}
      />

      {/* Employee: Submit Modification Request Dialog */}
      <Dialog open={modOpen} onClose={() => setModOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Request Time Entry Modification</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2, mt: 1 }}>
            Requesting changes for {modTarget?.date ?? ''} entry. Your manager will review this request.
          </Typography>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                label="Requested Clock In"
                type="datetime-local"
                value={modForm.requested_clock_in}
                onChange={(e) =>
                  setModForm((f) => ({ ...f, requested_clock_in: e.target.value }))
                }
              />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                label="Requested Clock Out"
                type="datetime-local"
                value={modForm.requested_clock_out}
                onChange={(e) =>
                  setModForm((f) => ({ ...f, requested_clock_out: e.target.value }))
                }
              />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                label="Requested Break Minutes"
                type="number"
                value={modForm.requested_break_minutes}
                onChange={(e) =>
                  setModForm((f) => ({ ...f, requested_break_minutes: e.target.value }))
                }
              />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <TextField
                fullWidth
                label="Reason"
                value={modForm.reason}
                onChange={(e) => setModForm((f) => ({ ...f, reason: e.target.value }))}
                multiline
                rows={3}
                required
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setModOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleSubmitModRequest}
            disabled={!modForm.reason || createModRequest.isPending}
          >
            Submit Request
          </Button>
        </DialogActions>
      </Dialog>

      {/* Manager: Review Modification Request Dialog */}
      <Dialog open={reviewOpen} onClose={() => setReviewOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Review Modification Request</DialogTitle>
        <DialogContent>
          {reviewTarget && (
            <Box sx={{ mt: 1 }}>
              <Typography variant="body2" gutterBottom>
                <strong>Employee:</strong> {reviewTarget.employee_name}
              </Typography>
              <Typography variant="body2" gutterBottom>
                <strong>Entry Date:</strong>{' '}
                {reviewTarget.entry_date
                  ? format(new Date(reviewTarget.entry_date), 'MMM d, yyyy')
                  : '—'}
              </Typography>
              <Typography variant="body2" gutterBottom>
                <strong>Current Clock In:</strong>{' '}
                {reviewTarget.entry_clock_in
                  ? format(new Date(reviewTarget.entry_clock_in), 'h:mm a')
                  : '—'}
              </Typography>
              <Typography variant="body2" gutterBottom>
                <strong>Current Clock Out:</strong>{' '}
                {reviewTarget.entry_clock_out
                  ? format(new Date(reviewTarget.entry_clock_out), 'h:mm a')
                  : '—'}
              </Typography>
              <Typography variant="body2" color="primary.main" gutterBottom>
                <strong>Requested Clock In:</strong>{' '}
                {reviewTarget.requested_clock_in
                  ? format(new Date(reviewTarget.requested_clock_in), 'h:mm a')
                  : 'No change'}
              </Typography>
              <Typography variant="body2" color="primary.main" gutterBottom>
                <strong>Requested Clock Out:</strong>{' '}
                {reviewTarget.requested_clock_out
                  ? format(new Date(reviewTarget.requested_clock_out), 'h:mm a')
                  : 'No change'}
              </Typography>
              {reviewTarget.requested_break_minutes != null && (
                <Typography variant="body2" color="primary.main" gutterBottom>
                  <strong>Requested Break:</strong> {reviewTarget.requested_break_minutes} min
                </Typography>
              )}
              <Typography variant="body2" gutterBottom sx={{ mt: 1 }}>
                <strong>Reason:</strong> {reviewTarget.reason}
              </Typography>
              <TextField
                fullWidth
                label="Review Note (optional)"
                value={reviewNote}
                onChange={(e) => setReviewNote(e.target.value)}
                multiline
                rows={2}
                sx={{ mt: 2 }}
              />
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setReviewOpen(false)}>Cancel</Button>
          <Button
            variant="outlined"
            color="error"
            onClick={handleDenyModRequest}
            disabled={denyModRequest.isPending}
          >
            Deny
          </Button>
          <Button
            variant="contained"
            color="success"
            onClick={handleApproveModRequest}
            disabled={approveModRequest.isPending}
          >
            Approve
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
