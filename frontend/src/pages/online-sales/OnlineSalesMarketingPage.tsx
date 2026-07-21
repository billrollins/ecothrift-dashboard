import { Box, Button, Stack, Typography } from '@mui/material';
import OpenInNew from '@mui/icons-material/OpenInNew';
import { PageHeader } from '../../components/common/PageHeader';
import { useWebListings } from '../../hooks/useWebStore';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import { useNavigate } from 'react-router-dom';

export default function OnlineSalesMarketingPage() {
  const navigate = useNavigate();
  const { data } = useWebListings({ status: 'published', ordering: '-updated_at' });

  const cols: GridColDef[] = [
    { field: 'title', headerName: 'Listing', flex: 1 },
    { field: 'fb_title', headerName: 'FB title', flex: 1 },
    {
      field: 'fb_posted_at',
      headerName: 'FB posted',
      width: 160,
      valueFormatter: (v) => (v ? new Date(String(v)).toLocaleString() : 'Not posted'),
    },
    {
      field: 'open',
      headerName: '',
      width: 120,
      sortable: false,
      renderCell: ({ row }) => (
        <Button size="small" onClick={() => navigate(`/online-sales/listings/${row.id}`)}>
          Studio
        </Button>
      ),
    },
  ];

  return (
    <Box>
      <PageHeader
        title="Marketing"
        subtitle="Channel post templates and Blog Studio"
        action={
          <Button
            variant="outlined"
            startIcon={<OpenInNew />}
            onClick={() => window.open('/blog-studio', '_blank', 'noopener,noreferrer')}
          >
            Blog Studio
          </Button>
        }
      />
      <Stack spacing={2}>
        <Typography variant="body2" color="text.secondary">
          Facebook Page copy lives on each Listing. Open Studio to generate, copy, and mark posted.
          Marketplace templates are deferred.
        </Typography>
        <Box sx={{ height: 480 }}>
          <DataGrid
            rows={data?.results || []}
            columns={cols}
            getRowId={(r) => r.id}
            disableRowSelectionOnClick
          />
        </Box>
      </Stack>
    </Box>
  );
}
