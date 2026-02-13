import { useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  Button,
  TextField,
  Grid,
  Typography,
  Chip,
} from '@mui/material';
import { DataGrid } from '@mui/x-data-grid';
import { PageHeader } from '../../components/common/PageHeader';
import { LoadingScreen } from '../../components/feedback/LoadingScreen';
import { StatusBadge } from '../../components/common/StatusBadge';
import {
  useSickLeaveBalances,
  useSickLeaveRequests,
  useCreateSickLeaveRequest,
  useApproveSickLeave,
  useDenySickLeave,
} from '../../hooks/useSickLeave';
import { useAuth } from '../../contexts/AuthContext';
import type { SickLeaveBalance, SickLeaveRequest } from '../../types/hr.types';
import { useSnackbar } from 'notistack';

export default function SickLeavePage() {
  const { user, hasRole } = useAuth();
  const { enqueueSnackbar } = useSnackbar();
  const isManager = hasRole('Manager') || hasRole('Admin');
  const employeeId = user?.id;

  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [hours, setHours] = useState('');
  const [reason, setReason] = useState('');

  const { data: balancesData, isLoading: balancesLoading } = useSickLeaveBalances(
    isManager ? undefined : (employeeId ? { employee: employeeId } : undefined)
  );
  const { data: requestsData, isLoading: requestsLoading } = useSickLeaveRequests(
    isManager ? { status: 'pending' } : (employeeId ? { employee: employeeId } : undefined)
  );

  const createRequest = useCreateSickLeaveRequest();
  const approveSickLeave = useApproveSickLeave();
  const denySickLeave = useDenySickLeave();

  const balances = (Array.isArray(balancesData) ? balancesData : []) as SickLeaveBalance[];
  const requestsResp = requestsData as { results?: SickLeaveRequest[] } | undefined;
  const requests = requestsResp?.results ?? [];
  const myBalances = !isManager ? balances : [];
  const allBalances = isManager ? balances : [];
  const pendingRequests = isManager ? requests : [];

  const handleSubmitRequest = async () => {
    if (!employeeId || !startDate || !endDate || !hours) {
      enqueueSnackbar('Please fill all required fields', { variant: 'warning' });
      return;
    }
    try {
      await createRequest.mutateAsync({
        start_date: startDate,
        end_date: endDate,
        hours_requested: hours,
        reason: reason || 'Sick leave',
      });
      enqueueSnackbar('Request submitted', { variant: 'success' });
      setStartDate('');
      setEndDate('');
      setHours('');
      setReason('');
    } catch {
      enqueueSnackbar('Failed to submit request', { variant: 'error' });
    }
  };

  const handleApprove = async (id: number) => {
    try {
      await approveSickLeave.mutateAsync({ id });
      enqueueSnackbar('Request approved', { variant: 'success' });
    } catch {
      enqueueSnackbar('Failed to approve', { variant: 'error' });
    }
  };

  const handleDeny = async (id: number) => {
    try {
      await denySickLeave.mutateAsync({ id });
      enqueueSnackbar('Request denied', { variant: 'success' });
    } catch {
      enqueueSnackbar('Failed to deny', { variant: 'error' });
    }
  };

  if (balancesLoading && !isManager) return <LoadingScreen message="Loading..." />;

  return (
    <Box>
      <PageHeader
        title="Sick Leave"
        subtitle={isManager ? 'Manage sick leave balances and requests' : 'View balance and submit requests'}
      />

      <Grid container spacing={3}>
        {!isManager && (
          <>
            <Grid size={{ xs: 12, md: 6 }}>
              <Card>
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    Current Balance
                  </Typography>
                  {myBalances.length === 0 ? (
                    <Typography color="text.secondary">No balance on record.</Typography>
                  ) : (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      {myBalances.map((b) => (
                        <Box
                          key={b.id}
                          sx={{
                            p: 2,
                            border: 1,
                            borderRadius: 1,
                            borderColor: 'divider',
                            display: 'flex',
                            flexWrap: 'wrap',
                            alignItems: 'center',
                            gap: 2,
                          }}
                        >
                          <Typography fontWeight={600}>Year {b.year}</Typography>
                          {b.is_capped && (
                            <Chip label="Capped" size="small" color="warning" />
                          )}
                          <Box sx={{ display: 'flex', gap: 3 }}>
                            <Typography variant="body2">
                              Earned: <strong>{b.hours_earned}h</strong>
                            </Typography>
                            <Typography variant="body2">
                              Used: <strong>{b.hours_used}h</strong>
                            </Typography>
                            <Typography variant="body2" color="primary.main">
                              Available: <strong>{b.hours_available}h</strong>
                            </Typography>
                          </Box>
                        </Box>
                      ))}
                    </Box>
                  )}
                </CardContent>
              </Card>
            </Grid>

            <Grid size={{ xs: 12, md: 6 }}>
              <Card>
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    Request Sick Leave
                  </Typography>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
                    <TextField
                      label="Start Date"
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      slotProps={{ htmlInput: { max: endDate || undefined } }}
                    />
                    <TextField
                      label="End Date"
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      slotProps={{ htmlInput: { min: startDate || undefined } }}
                    />
                    <TextField
                      label="Hours"
                      type="number"
                      value={hours}
                      onChange={(e) => setHours(e.target.value)}
                      slotProps={{ htmlInput: { min: 0, step: 0.5 } }}
                    />
                    <TextField
                      label="Reason"
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      multiline
                      rows={2}
                    />
                    <Button
                      variant="contained"
                      onClick={handleSubmitRequest}
                      disabled={createRequest.isPending}
                    >
                      Submit Request
                    </Button>
                  </Box>
                </CardContent>
              </Card>
            </Grid>

            <Grid size={12}>
              <Card>
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    Request History
                  </Typography>
                  <Box sx={{ height: 300 }}>
                    <DataGrid
                      rows={requests}
                      columns={[
                        { field: 'start_date', headerName: 'Start', width: 110 },
                        { field: 'end_date', headerName: 'End', width: 110 },
                        { field: 'hours_requested', headerName: 'Hours', width: 80 },
                        { field: 'reason', headerName: 'Reason', flex: 1, minWidth: 120 },
                        {
                          field: 'status',
                          headerName: 'Status',
                          width: 100,
                          renderCell: ({ value }) => <StatusBadge status={value ?? ''} />,
                        },
                      ]}
                      loading={requestsLoading}
                      getRowId={(row) => row.id}
                    />
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          </>
        )}

        {isManager && (
          <>
            <Grid size={12}>
              <Card>
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    All Balances
                  </Typography>
                  <Box sx={{ height: 350 }}>
                    <DataGrid
                      rows={allBalances}
                      columns={[
                        { field: 'employee_name', headerName: 'Employee', flex: 1, minWidth: 160 },
                        { field: 'year', headerName: 'Year', width: 80 },
                        { field: 'hours_earned', headerName: 'Earned', width: 90 },
                        { field: 'hours_used', headerName: 'Used', width: 90 },
                        { field: 'hours_available', headerName: 'Available', width: 100 },
                        {
                          field: 'is_capped',
                          headerName: 'Capped',
                          width: 80,
                          renderCell: ({ value }) => (value ? <Chip label="Yes" size="small" color="warning" /> : '—'),
                        },
                      ]}
                      loading={balancesLoading}
                      getRowId={(row) => row.id}
                    />
                  </Box>
                </CardContent>
              </Card>
            </Grid>

            <Grid size={12}>
              <Card>
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    Pending Requests
                  </Typography>
                  <Box sx={{ height: 350 }}>
                    <DataGrid
                      rows={pendingRequests}
                      columns={[
                        { field: 'employee_name', headerName: 'Employee', flex: 1, minWidth: 140 },
                        { field: 'start_date', headerName: 'Start', width: 110 },
                        { field: 'end_date', headerName: 'End', width: 110 },
                        { field: 'hours_requested', headerName: 'Hours', width: 80 },
                        { field: 'reason', headerName: 'Reason', flex: 1, minWidth: 120 },
                        {
                          field: 'actions',
                          headerName: 'Actions',
                          width: 180,
                          sortable: false,
                          renderCell: ({ row }) => (
                            <Box sx={{ display: 'flex', gap: 1 }}>
                              <Button
                                size="small"
                                variant="contained"
                                color="success"
                                onClick={() => handleApprove(row.id)}
                                disabled={approveSickLeave.isPending}
                              >
                                Approve
                              </Button>
                              <Button
                                size="small"
                                variant="outlined"
                                color="error"
                                onClick={() => handleDeny(row.id)}
                                disabled={denySickLeave.isPending}
                              >
                                Deny
                              </Button>
                            </Box>
                          ),
                        },
                      ]}
                      loading={requestsLoading}
                      getRowId={(row) => row.id}
                    />
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          </>
        )}
      </Grid>
    </Box>
  );
}
