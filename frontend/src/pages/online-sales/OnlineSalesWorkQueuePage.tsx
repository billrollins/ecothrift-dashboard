import { useNavigate } from 'react-router-dom';
import { Alert, Box, Button, Stack, Typography } from '@mui/material';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import { useSnackbar } from 'notistack';
import { PageHeader } from '../../components/common/PageHeader';
import { LoadingScreen } from '../../components/feedback/LoadingScreen';
import { useCreateWebListing, useWorkQueue } from '../../hooks/useWebStore';

export default function OnlineSalesWorkQueuePage() {
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const { data, isLoading, isError } = useWorkQueue();
  const createListing = useCreateWebListing();

  if (isLoading) return <LoadingScreen />;
  if (isError || !data) {
    return (
      <Box>
        <PageHeader title="Work queue" subtitle="Items destined for online sales and unfinished drafts" />
        <Alert severity="error">Could not load the work queue.</Alert>
      </Box>
    );
  }

  const startFromItem = async (item: { id: number; sku: string; title: string; price: string | null }) => {
    try {
      const listing = await createListing.mutateAsync({
        title: item.title || `Item ${item.sku}`,
        sku: item.sku,
        item: item.id,
        price: item.price || '0.00',
        on_hand: 1,
        status: 'draft',
        return_policy: 'final_sale',
      });
      navigate(`/online-sales/listings/${listing.id}`);
    } catch {
      enqueueSnackbar('Could not start listing', { variant: 'error' });
    }
  };

  const itemCols: GridColDef[] = [
    { field: 'sku', headerName: 'SKU', width: 120 },
    { field: 'title', headerName: 'Title', flex: 1, minWidth: 180 },
    { field: 'status', headerName: 'Status', width: 120 },
    { field: 'price', headerName: 'Price', width: 90 },
    {
      field: 'actions',
      headerName: '',
      width: 140,
      sortable: false,
      renderCell: ({ row }) => (
        <Button size="small" variant="contained" onClick={() => startFromItem(row)}>
          Start listing
        </Button>
      ),
    },
  ];

  const draftCols: GridColDef[] = [
    { field: 'title', headerName: 'Draft', flex: 1 },
    { field: 'sku', headerName: 'SKU', width: 120 },
    { field: 'status', headerName: 'Status', width: 120 },
    {
      field: 'open',
      headerName: '',
      width: 100,
      sortable: false,
      renderCell: ({ row }) => (
        <Button size="small" onClick={() => navigate(`/online-sales/listings/${row.id}`)}>
          Open
        </Button>
      ),
    },
  ];

  return (
    <Box>
      <PageHeader
        title="Work queue"
        subtitle="Items destined for online sales and unfinished drafts"
      />
      <Stack spacing={3}>
        <Box>
          <Typography variant="h6" gutterBottom>
            Items at online_sales ({data.items.length})
          </Typography>
          <Box sx={{ height: 320 }}>
            <DataGrid rows={data.items} columns={itemCols} getRowId={(r) => r.id} disableRowSelectionOnClick density="compact" />
          </Box>
        </Box>
        <Box>
          <Typography variant="h6" gutterBottom>
            Draft / ready listings ({data.draft_listings.length})
          </Typography>
          <Box sx={{ height: 280 }}>
            <DataGrid
              rows={data.draft_listings}
              columns={draftCols}
              getRowId={(r) => r.id}
              disableRowSelectionOnClick
              density="compact"
            />
          </Box>
        </Box>
      </Stack>
    </Box>
  );
}
