import { useState } from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  MenuItem,
  TextField,
} from '@mui/material';
import Add from '@mui/icons-material/Add';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import { useSnackbar } from 'notistack';
import { PageHeader } from '../../components/common/PageHeader';
import { LoadingScreen } from '../../components/feedback/LoadingScreen';
import { StatusBadge } from '../../components/common/StatusBadge';
import { useAgreements, useCreateAgreement } from '../../hooks/useConsignment';
import { useUsers } from '../../hooks/useEmployees';
import type { ConsignmentAgreement } from '../../types/consignment.types';
import { format } from 'date-fns';

export default function AccountsPage() {
  const { enqueueSnackbar } = useSnackbar();
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({
    consignee: '' as number | '',
    agreement_number: '',
    commission_rate: '',
    status: 'active' as 'active' | 'paused' | 'closed',
    start_date: '',
    end_date: '',
    terms: '',
  });

  const { data, isLoading } = useAgreements();
  const { data: usersData } = useUsers({ page_size: 200 });
  const createAgreement = useCreateAgreement();

  const agreements = data?.results ?? [];
  const consignees = (usersData?.results ?? []).filter(
    (u: { role: string | null }) => u.role === 'Consignee'
  );

  const columns: GridColDef[] = [
    { field: 'consignee_name', headerName: 'Name', flex: 1, minWidth: 140 },
    { field: 'agreement_number', headerName: 'Agreement #', width: 130 },
    {
      field: 'commission_rate',
      headerName: 'Commission',
      width: 100,
      valueFormatter: (value) => `${((value as number) * 100).toFixed(1)}%`,
    },
    {
      field: 'status',
      headerName: 'Status',
      width: 110,
      renderCell: ({ value }) => <StatusBadge status={value ?? ''} size="small" />,
    },
    {
      field: 'start_date',
      headerName: 'Start',
      width: 110,
      valueFormatter: (value) => (value ? format(new Date(value as string), 'MM/dd/yyyy') : '—'),
    },
    {
      field: 'end_date',
      headerName: 'End',
      width: 110,
      valueFormatter: (value) => (value ? format(new Date(value as string), 'MM/dd/yyyy') : '—'),
    },
  ];

  const handleCreate = async () => {
    if (!form.consignee || !form.agreement_number || !form.start_date) {
      enqueueSnackbar('Fill required fields', { variant: 'warning' });
      return;
    }
    try {
      const rate = form.commission_rate ? String(parseFloat(form.commission_rate) / 100) : '0';
      await createAgreement.mutateAsync({
        consignee: form.consignee,
        agreement_number: form.agreement_number,
        commission_rate: rate,
        status: form.status,
        start_date: form.start_date,
        end_date: form.end_date || null,
        terms: form.terms || '',
      });
      enqueueSnackbar('Agreement created', { variant: 'success' });
      setAddOpen(false);
      setForm({
        consignee: '',
        agreement_number: '',
        commission_rate: '',
        status: 'active',
        start_date: '',
        end_date: '',
        terms: '',
      });
    } catch {
      enqueueSnackbar('Failed to create agreement', { variant: 'error' });
    }
  };

  if (isLoading && agreements.length === 0) return <LoadingScreen message="Loading..." />;

  return (
    <Box>
      <PageHeader
        title="Consignee Accounts"
        subtitle="Manage consignment agreements"
        action={
          <Button variant="contained" startIcon={<Add />} onClick={() => setAddOpen(true)}>
            New Agreement
          </Button>
        }
      />

      <Box sx={{ height: 500 }}>
        <DataGrid
          rows={agreements}
          columns={columns}
          loading={isLoading}
          getRowId={(row: ConsignmentAgreement) => row.id}
          pageSizeOptions={[10, 25, 50, 100]}
          initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
          sx={{ border: 'none' }}
        />
      </Box>

      <Dialog open={addOpen} onClose={() => setAddOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>New Agreement</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            <Grid size={{ xs: 12 }}>
              <TextField
                fullWidth
                select
                label="Consignee"
                value={form.consignee}
                onChange={(e) =>
                  setForm((f) => ({ ...f, consignee: e.target.value === '' ? '' : Number(e.target.value) }))
                }
                required
              >
                <MenuItem value="">Select...</MenuItem>
                {consignees.map((u: { id: number; full_name: string }) => (
                  <MenuItem key={u.id} value={u.id}>
                    {u.full_name}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid size={{ xs: 12 }}>
              <TextField
                fullWidth
                label="Agreement #"
                value={form.agreement_number}
                onChange={(e) => setForm((f) => ({ ...f, agreement_number: e.target.value }))}
                required
              />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                label="Commission Rate (%)"
                type="number"
                value={form.commission_rate}
                onChange={(e) => setForm((f) => ({ ...f, commission_rate: e.target.value }))}
                slotProps={{ input: { inputProps: { min: 0, max: 100, step: 0.1 } } }}
              />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                select
                label="Status"
                value={form.status}
                onChange={(e) =>
                  setForm((f) => ({ ...f, status: e.target.value as 'active' | 'paused' | 'closed' }))
                }
              >
                <MenuItem value="active">Active</MenuItem>
                <MenuItem value="paused">Paused</MenuItem>
                <MenuItem value="closed">Closed</MenuItem>
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                label="Start Date"
                type="date"
                value={form.start_date}
                onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))}
                required
                slotProps={{ input: { inputProps: { max: form.end_date || undefined } } }}
              />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                label="End Date"
                type="date"
                value={form.end_date}
                onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))}
                slotProps={{ input: { inputProps: { min: form.start_date || undefined } } }}
              />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <TextField
                fullWidth
                label="Terms"
                multiline
                rows={3}
                value={form.terms}
                onChange={(e) => setForm((f) => ({ ...f, terms: e.target.value }))}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleCreate}
            disabled={!form.consignee || !form.agreement_number || !form.start_date || createAgreement.isPending}
          >
            {createAgreement.isPending ? 'Creating...' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
