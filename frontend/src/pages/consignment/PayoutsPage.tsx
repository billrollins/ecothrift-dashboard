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
import Check from '@mui/icons-material/Check';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import { useSnackbar } from 'notistack';
import { PageHeader } from '../../components/common/PageHeader';
import { LoadingScreen } from '../../components/feedback/LoadingScreen';
import { StatusBadge } from '../../components/common/StatusBadge';
import {
  useAgreements,
  usePayouts,
  useGeneratePayout,
  useMarkPayoutPaid,
} from '../../hooks/useConsignment';
import type { ConsignmentPayout } from '../../types/consignment.types';
import { format } from 'date-fns';

function formatCurrency(value: string | number): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num ?? 0);
}

export default function PayoutsPage() {
  const { enqueueSnackbar } = useSnackbar();
  const [generateOpen, setGenerateOpen] = useState(false);
  const [generateForm, setGenerateForm] = useState({
    consignee: '' as number | '',
    period_start: '',
    period_end: '',
  });

  const { data: agreementsData } = useAgreements();
  const { data, isLoading } = usePayouts();
  const generatePayout = useGeneratePayout();
  const markPaid = useMarkPayoutPaid();

  const payouts = data?.results ?? [];
  const agreements = (agreementsData?.results ?? []).filter(
    (a: { status: string }) => a.status === 'active'
  );

  const handleMarkPaid = async (id: number) => {
    try {
      await markPaid.mutateAsync({ id, data: {} });
      enqueueSnackbar('Payout marked paid', { variant: 'success' });
    } catch {
      enqueueSnackbar('Failed to mark paid', { variant: 'error' });
    }
  };

  const columns: GridColDef[] = [
    { field: 'payout_number', headerName: 'Payout #', width: 110 },
    { field: 'consignee_name', headerName: 'Consignee', flex: 1, minWidth: 130 },
    {
      field: 'period',
      headerName: 'Period',
      width: 180,
      valueGetter: (_, row) =>
        row.period_start && row.period_end
          ? `${format(new Date(row.period_start), 'MM/dd/yyyy')} - ${format(
              new Date(row.period_end),
              'MM/dd/yyyy'
            )}`
          : '—',
    },
    { field: 'items_sold', headerName: 'Items Sold', width: 100 },
    {
      field: 'total_sales',
      headerName: 'Total Sales',
      width: 110,
      valueFormatter: (value) => formatCurrency(value ?? 0),
    },
    {
      field: 'payout_amount',
      headerName: 'Payout',
      width: 110,
      valueFormatter: (value) => formatCurrency(value ?? 0),
    },
    {
      field: 'status',
      headerName: 'Status',
      width: 100,
      renderCell: ({ value }) => <StatusBadge status={value ?? ''} size="small" />,
    },
    {
      field: 'actions',
      headerName: '',
      width: 100,
      sortable: false,
      renderCell: ({ row }) => (
        <Box sx={{ display: 'flex', alignItems: 'center', height: '100%' }}>
          {row.status === 'pending' ? (
            <Button
              size="small"
              variant="outlined"
              startIcon={<Check />}
              onClick={() => handleMarkPaid(row.id)}
              disabled={markPaid.isPending}
            >
              Mark Paid
            </Button>
          ) : null}
        </Box>
      ),
    },
  ];

  const handleGeneratePayout = async () => {
    if (!generateForm.consignee || !generateForm.period_start || !generateForm.period_end) {
      enqueueSnackbar('Fill all fields', { variant: 'warning' });
      return;
    }
    try {
      await generatePayout.mutateAsync({
        consignee: generateForm.consignee,
        period_start: generateForm.period_start,
        period_end: generateForm.period_end,
      });
      enqueueSnackbar('Payout generated', { variant: 'success' });
      setGenerateOpen(false);
      setGenerateForm({ consignee: '', period_start: '', period_end: '' });
    } catch {
      enqueueSnackbar('Failed to generate payout', { variant: 'error' });
    }
  };

  if (isLoading && payouts.length === 0) return <LoadingScreen message="Loading payouts..." />;

  return (
    <Box>
      <PageHeader
        title="Payouts"
        subtitle="Consignee payout management"
        action={
          <Button
            variant="contained"
            startIcon={<Add />}
            onClick={() => setGenerateOpen(true)}
            disabled={generatePayout.isPending}
          >
            Generate Payout
          </Button>
        }
      />

      <Box sx={{ height: 500 }}>
        <DataGrid
          rows={payouts}
          columns={columns}
          loading={isLoading}
          getRowId={(row: ConsignmentPayout) => row.id}
          pageSizeOptions={[10, 25, 50, 100]}
          initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
          sx={{ border: 'none' }}
        />
      </Box>

      <Dialog open={generateOpen} onClose={() => setGenerateOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Generate Payout</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            <Grid size={{ xs: 12 }}>
              <TextField
                fullWidth
                select
                label="Consignee"
                value={generateForm.consignee}
                onChange={(e) =>
                  setGenerateForm((f) => ({
                    ...f,
                    consignee: e.target.value === '' ? '' : Number(e.target.value),
                  }))
                }
                required
              >
                <MenuItem value="">Select...</MenuItem>
                {agreements.map((a: { consignee: number; consignee_name: string }) => (
                  <MenuItem key={a.consignee} value={a.consignee}>
                    {a.consignee_name}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                label="Period Start"
                type="date"
                value={generateForm.period_start}
                onChange={(e) =>
                  setGenerateForm((f) => ({ ...f, period_start: e.target.value }))
                }
                required
                slotProps={{
                  inputLabel: { shrink: true },
                  input: { inputProps: { max: generateForm.period_end || undefined } },
                }}
              />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                label="Period End"
                type="date"
                value={generateForm.period_end}
                onChange={(e) =>
                  setGenerateForm((f) => ({ ...f, period_end: e.target.value }))
                }
                required
                slotProps={{
                  inputLabel: { shrink: true },
                  input: { inputProps: { min: generateForm.period_start || undefined } },
                }}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setGenerateOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleGeneratePayout}
            disabled={
              !generateForm.consignee ||
              !generateForm.period_start ||
              !generateForm.period_end ||
              generatePayout.isPending
            }
          >
            {generatePayout.isPending ? 'Generating...' : 'Generate'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
