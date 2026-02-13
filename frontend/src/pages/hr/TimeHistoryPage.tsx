import { useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  Button,
  TextField,
  Grid,
  MenuItem,
} from '@mui/material';
import { DataGrid, type GridColDef, type GridRowSelectionModel } from '@mui/x-data-grid';
import { PageHeader } from '../../components/common/PageHeader';
import { StatusBadge } from '../../components/common/StatusBadge';
import { LoadingScreen } from '../../components/feedback/LoadingScreen';
import { useTimeEntries, useApproveEntry, useBulkApprove, useTimeSummary } from '../../hooks/useTimeEntries';
import { useUsers } from '../../hooks/useEmployees';
import { useAuth } from '../../contexts/AuthContext';
import { useSnackbar } from 'notistack';
import { format } from 'date-fns';

export default function TimeHistoryPage() {
  const { hasRole } = useAuth();
  const { enqueueSnackbar } = useSnackbar();
  const [employeeId, setEmployeeId] = useState<string>('');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [status, setStatus] = useState<string>('');
  const [selectedIds, setSelectedIds] = useState<GridRowSelectionModel>({
    type: 'include',
    ids: new Set(),
  });

  const params = {
    employee: employeeId ? parseInt(employeeId, 10) : undefined,
    date_from: dateFrom || undefined,
    date_to: dateTo || undefined,
    status: status || undefined,
  };

  const { data: entriesData, isLoading } = useTimeEntries(params);
  const { data: summaryData } = useTimeSummary(params);
  const { data: usersData } = useUsers({ role: 'Employee' });
  const approveEntry = useApproveEntry();
  const bulkApprove = useBulkApprove();

  const entries = entriesData?.results ?? [];
  const summary = summaryData as { total_hours?: string } | undefined;
  const users = usersData?.results ?? [];
  const isManager = hasRole('Manager') || hasRole('Admin');

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
    ...(isManager
      ? [
          {
            field: 'actions',
            headerName: 'Actions',
            width: 100,
            sortable: false,
            renderCell: ({ row }: { row: { id: number; status: string } }) =>
              row.status === 'pending' ? (
                <Button size="small" onClick={() => handleApprove(row.id)}>
                  Approve
                </Button>
              ) : null,
          },
        ]
      : []),
  ];

  if (isLoading) return <LoadingScreen message="Loading time entries..." />;

  return (
    <Box>
      <PageHeader
        title="Time History"
        subtitle="View and manage time entries"
        action={
          isManager && selectedIds.ids.size > 0 && (
            <Button variant="contained" onClick={() => handleBulkApprove(Array.from(selectedIds.ids) as number[])} disabled={bulkApprove.isPending}>
              Approve {selectedIds.ids.size} selected
            </Button>
          )
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
                  slotProps={{ htmlInput: { max: dateTo || undefined } }}
                />
                <TextField
                  label="To"
                  type="date"
                  size="small"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  slotProps={{ htmlInput: { min: dateFrom || undefined } }}
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
    </Box>
  );
}
