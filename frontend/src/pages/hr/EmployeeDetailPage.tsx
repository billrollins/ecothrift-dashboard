import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box,
  Card,
  CardContent,
  Tabs,
  Tab,
  TextField,
  Button,
  Grid,
  Typography,
  MenuItem,
} from '@mui/material';
import ArrowBack from '@mui/icons-material/ArrowBack';
import { DataGrid } from '@mui/x-data-grid';
import { PageHeader } from '../../components/common/PageHeader';
import { LoadingScreen } from '../../components/feedback/LoadingScreen';
import { StatusBadge } from '../../components/common/StatusBadge';
import { useQuery } from '@tanstack/react-query';
import { useUser, useUpdateUser, useUpdateEmployeeProfile } from '../../hooks/useEmployees';
import { getDepartments } from '../../api/hr.api';
import { useTimeEntries } from '../../hooks/useTimeEntries';
import { useSickLeaveBalances, useSickLeaveRequests } from '../../hooks/useSickLeave';
import type { User } from '../../types';
import { useSnackbar } from 'notistack';
import { format } from 'date-fns';

export default function EmployeeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const numericId = id && id !== 'new' ? parseInt(id, 10) : null;
  const isNew = id === 'new';

  const { data: user, isLoading } = useUser(numericId);
  const updateUser = useUpdateUser();
  const updateEmployeeProfile = useUpdateEmployeeProfile();
  const { data: departments } = useQuery({
    queryKey: ['departments'],
    queryFn: () => getDepartments().then((r) => r.data),
  });
  const { data: timeData } = useTimeEntries(
    numericId ? { employee: numericId } : undefined
  );
  const { data: balances } = useSickLeaveBalances(
    numericId ? { employee: numericId } : undefined
  );
  const { data: requestsData } = useSickLeaveRequests(
    numericId ? { employee: numericId } : undefined
  );

  const [tab, setTab] = useState(0);
  const [form, setForm] = useState<Record<string, unknown>>({});

  const currentUser = user as User | undefined;
  const emp = currentUser?.employee;
  const timeEntries = (timeData as { results?: unknown[] })?.results ?? [];
  const balanceList = Array.isArray(balances) ? balances : [];
  const requests = (requestsData as { results?: unknown[] })?.results ?? [];

  const handleChange = (field: string, value: unknown) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleEmployeeChange = (field: string, value: unknown) => {
    setForm((prev) => ({
      ...prev,
      employee: { ...((prev.employee as Record<string, unknown>) ?? emp ?? {}), [field]: value },
    }));
  };

  const handleSave = async () => {
    if (!numericId) return;
    try {
      await updateUser.mutateAsync({
        id: numericId,
        data: {
          first_name: form.first_name ?? currentUser?.first_name,
          last_name: form.last_name ?? currentUser?.last_name,
          phone: form.phone ?? currentUser?.phone,
        },
      });
      const empData = form.employee as Record<string, unknown> | undefined;
      if (empData && Object.keys(empData).length > 0) {
        await updateEmployeeProfile.mutateAsync({
          userId: numericId,
          data: {
            department: empData.department ?? emp?.department ?? null,
            position: empData.position ?? emp?.position ?? '',
            pay_rate: empData.pay_rate ?? emp?.pay_rate ?? '',
            hire_date: empData.hire_date ?? emp?.hire_date ?? '',
            emergency_name: empData.emergency_name ?? emp?.emergency_name ?? '',
            emergency_phone: empData.emergency_phone ?? emp?.emergency_phone ?? '',
          },
        });
      }
      enqueueSnackbar('Profile updated', { variant: 'success' });
    } catch {
      enqueueSnackbar('Failed to update', { variant: 'error' });
    }
  };

  if (!isNew && isLoading) return <LoadingScreen message="Loading employee..." />;
  if (!isNew && !currentUser) {
    return (
      <Box>
        <PageHeader title="Employee" />
        <Card><CardContent>Employee not found.</CardContent></Card>
      </Box>
    );
  }

  const displayName = currentUser?.full_name ?? 'Employee';

  return (
    <Box>
      <PageHeader
        title={displayName}
        subtitle={emp?.position ?? 'Employee'}
        action={
          <Button startIcon={<ArrowBack />} onClick={() => navigate('/hr/employees')}>
            Back
          </Button>
        }
      />

      {isNew ? (
        <Card>
          <CardContent>
            <Typography>Add Employee form — use admin user management.</Typography>
          </CardContent>
        </Card>
      ) : (
        <>
          <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
            <Tab label="Profile" />
            <Tab label="Time" />
            <Tab label="Sick Leave" />
          </Tabs>

          {tab === 0 && (
            <Card>
              <CardContent>
                <Grid container spacing={3}>
                  <Grid size={{ xs: 12, md: 6 }}>
                    <TextField
                      label="First Name"
                      fullWidth
                      value={form.first_name ?? currentUser?.first_name ?? ''}
                      onChange={(e) => handleChange('first_name', e.target.value)}
                    />
                  </Grid>
                  <Grid size={{ xs: 12, md: 6 }}>
                    <TextField
                      label="Last Name"
                      fullWidth
                      value={form.last_name ?? currentUser?.last_name ?? ''}
                      onChange={(e) => handleChange('last_name', e.target.value)}
                    />
                  </Grid>
                  <Grid size={{ xs: 12, md: 6 }}>
                    <TextField
                      label="Email"
                      fullWidth
                      value={currentUser?.email ?? ''}
                      disabled
                    />
                  </Grid>
                  <Grid size={{ xs: 12, md: 6 }}>
                    <TextField
                      label="Phone"
                      fullWidth
                      value={form.phone ?? currentUser?.phone ?? ''}
                      onChange={(e) => handleChange('phone', e.target.value)}
                    />
                  </Grid>
                  <Grid size={{ xs: 12, md: 6 }}>
                    <TextField
                      select
                      label="Department"
                      fullWidth
                      value={(form.employee as { department?: number })?.department ?? emp?.department ?? ''}
                      onChange={(e) => handleEmployeeChange('department', e.target.value ? parseInt(e.target.value, 10) : null)}
                    >
                      <MenuItem value="">—</MenuItem>
                      {(departments ?? []).map((d: { id: number; name: string }) => (
                        <MenuItem key={d.id} value={d.id}>
                          {d.name}
                        </MenuItem>
                      ))}
                    </TextField>
                  </Grid>
                  <Grid size={{ xs: 12, md: 6 }}>
                    <TextField
                      label="Position"
                      fullWidth
                      value={(form.employee as { position?: string })?.position ?? emp?.position ?? ''}
                      onChange={(e) => handleEmployeeChange('position', e.target.value)}
                    />
                  </Grid>
                  <Grid size={{ xs: 12, md: 6 }}>
                    <TextField
                      label="Pay Rate"
                      fullWidth
                      value={(form.employee as { pay_rate?: string })?.pay_rate ?? emp?.pay_rate ?? ''}
                      onChange={(e) => handleEmployeeChange('pay_rate', e.target.value)}
                    />
                  </Grid>
                  <Grid size={{ xs: 12, md: 6 }}>
                    <TextField
                      label="Hire Date"
                      type="date"
                      fullWidth
                      value={((form.employee as { hire_date?: string })?.hire_date ?? emp?.hire_date ?? '').slice(0, 10)}
                      onChange={(e) => handleEmployeeChange('hire_date', e.target.value)}
                    />
                  </Grid>
                  <Grid size={{ xs: 12, md: 6 }}>
                    <TextField
                      label="Emergency Contact"
                      fullWidth
                      value={(form.employee as { emergency_name?: string })?.emergency_name ?? emp?.emergency_name ?? ''}
                      onChange={(e) => handleEmployeeChange('emergency_name', e.target.value)}
                    />
                  </Grid>
                  <Grid size={{ xs: 12, md: 6 }}>
                    <TextField
                      label="Emergency Phone"
                      fullWidth
                      value={(form.employee as { emergency_phone?: string })?.emergency_phone ?? emp?.emergency_phone ?? ''}
                      onChange={(e) => handleEmployeeChange('emergency_phone', e.target.value)}
                    />
                  </Grid>
                  <Grid size={12}>
                    <Button variant="contained" onClick={handleSave} disabled={updateUser.isPending || updateEmployeeProfile.isPending}>
                      Save
                    </Button>
                  </Grid>
                </Grid>
              </CardContent>
            </Card>
          )}

          {tab === 1 && (
            <Card>
              <CardContent>
                <Box sx={{ height: 400 }}>
                  <DataGrid
                    rows={timeEntries as { id: number; date?: string; clock_in?: string; clock_out?: string; total_hours?: string; status?: string }[]}
                    columns={[
                      { field: 'date', headerName: 'Date', width: 120, valueFormatter: (value) => (value ? format(new Date(value as string), 'MMM d, yyyy') : '') },
                      { field: 'clock_in', headerName: 'Clock In', width: 100, valueFormatter: (value) => (value ? format(new Date(value as string), 'h:mm a') : '') },
                      { field: 'clock_out', headerName: 'Clock Out', width: 100, valueFormatter: (value) => (value ? format(new Date(value as string), 'h:mm a') : '—') },
                      { field: 'total_hours', headerName: 'Hours', width: 80 },
                      { field: 'status', headerName: 'Status', width: 100, renderCell: ({ value }) => <StatusBadge status={value ?? ''} /> },
                    ]}
                    getRowId={(row) => row.id}
                  />
                </Box>
              </CardContent>
            </Card>
          )}

          {tab === 2 && (
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>Balance</Typography>
                {balanceList.length === 0 ? (
                  <Typography color="text.secondary">No sick leave balance on record.</Typography>
                ) : (
                  <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap', mb: 3 }}>
                    {balanceList.map((b: { year: number; hours_earned: string; hours_used: string; hours_available: string }) => (
                      <Box key={b.year} sx={{ p: 2, border: 1, borderRadius: 1, borderColor: 'divider' }}>
                        <Typography variant="subtitle2">Year {b.year}</Typography>
                        <Typography>Earned: {b.hours_earned}h | Used: {b.hours_used}h | Available: {b.hours_available}h</Typography>
                      </Box>
                    ))}
                  </Box>
                )}
                <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>Requests</Typography>
                {requests.length === 0 ? (
                  <Typography color="text.secondary">No sick leave requests.</Typography>
                ) : (
                  <Box sx={{ height: 300 }}>
                    <DataGrid
                      rows={requests as { id: number; start_date?: string; end_date?: string; hours_requested?: string; status?: string }[]}
                      columns={[
                        { field: 'start_date', headerName: 'Start', width: 110 },
                        { field: 'end_date', headerName: 'End', width: 110 },
                        { field: 'hours_requested', headerName: 'Hours', width: 80 },
                        { field: 'status', headerName: 'Status', width: 100, renderCell: ({ value }) => <StatusBadge status={value ?? ''} /> },
                      ]}
                      getRowId={(row) => row.id}
                    />
                  </Box>
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </Box>
  );
}
