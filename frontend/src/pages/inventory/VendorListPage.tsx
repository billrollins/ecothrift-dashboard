import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  InputAdornment,
  MenuItem,
  TextField,
} from '@mui/material';
import Add from '@mui/icons-material/Add';
import Search from '@mui/icons-material/Search';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import { useSnackbar } from 'notistack';
import { PageHeader } from '../../components/common/PageHeader';
import { StatusBadge } from '../../components/common/StatusBadge';
import { LoadingScreen } from '../../components/feedback/LoadingScreen';
import { useVendors, useCreateVendor } from '../../hooks/useInventory';
import type { Vendor, VendorType } from '../../types/inventory.types';

const VENDOR_TYPES: VendorType[] = ['liquidation', 'retail', 'direct', 'other'];

export default function VendorListPage() {
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({
    name: '',
    code: '',
    vendor_type: 'other' as VendorType,
    contact_name: '',
    contact_email: '',
    contact_phone: '',
  });

  const params = useMemo(() => {
    const p: Record<string, string> = {};
    if (search) p.search = search;
    if (typeFilter) p.vendor_type = typeFilter;
    return p;
  }, [search, typeFilter]);

  const { data, isLoading } = useVendors(params);
  const createVendor = useCreateVendor();

  const vendors = data?.results ?? [];

  const columns: GridColDef[] = [
    { field: 'name', headerName: 'Name', flex: 1, minWidth: 160 },
    { field: 'code', headerName: 'Code', width: 120 },
    {
      field: 'vendor_type',
      headerName: 'Type',
      width: 120,
      valueFormatter: (value) =>
        String(value).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    },
    { field: 'contact_name', headerName: 'Contact', width: 150 },
    { field: 'contact_phone', headerName: 'Phone', width: 140 },
    {
      field: 'is_active',
      headerName: 'Status',
      width: 110,
      renderCell: ({ value }) => (
        <StatusBadge status={value ? 'active' : 'closed'} size="small" />
      ),
    },
  ];

  const handleCreate = async () => {
    try {
      await createVendor.mutateAsync(form);
      enqueueSnackbar('Vendor created', { variant: 'success' });
      setAddOpen(false);
      setForm({ name: '', code: '', vendor_type: 'other', contact_name: '', contact_email: '', contact_phone: '' });
    } catch {
      enqueueSnackbar('Failed to create vendor', { variant: 'error' });
    }
  };

  const handleRowClick = ({ id }: { id: unknown }) => {
    navigate(`/inventory/vendors/${id}`);
  };

  if (isLoading && vendors.length === 0) return <LoadingScreen />;

  return (
    <Box>
      <PageHeader
        title="Vendors"
        subtitle="Manage inventory vendors"
        action={
          <Button variant="contained" startIcon={<Add />} onClick={() => setAddOpen(true)}>
            Add Vendor
          </Button>
        }
      />

      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid size={{ xs: 12, md: 6 }}>
          <TextField
            fullWidth
            size="small"
            placeholder="Search vendors..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <Search fontSize="small" />
                  </InputAdornment>
                ),
              },
            }}
          />
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <TextField
            fullWidth
            size="small"
            select
            label="Type"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
          >
            <MenuItem value="">All</MenuItem>
            {VENDOR_TYPES.map((t) => (
              <MenuItem key={t} value={t}>
                {t.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
              </MenuItem>
            ))}
          </TextField>
        </Grid>
      </Grid>

      <Box sx={{ height: 500 }}>
        <DataGrid
          rows={vendors}
          columns={columns}
          loading={isLoading}
          pageSizeOptions={[10, 25, 50, 100]}
          initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
          onRowClick={(params) => handleRowClick({ id: params.id })}
          getRowId={(row: Vendor) => row.id}
          sx={{
            border: 'none',
            '& .MuiDataGrid-row': { cursor: 'pointer' },
          }}
        />
      </Box>

      <Dialog open={addOpen} onClose={() => setAddOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Add Vendor</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            <Grid size={{ xs: 12 }}>
              <TextField
                fullWidth
                label="Name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                required
              />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <TextField
                fullWidth
                label="Code"
                value={form.code}
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
              />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <TextField
                fullWidth
                select
                label="Type"
                value={form.vendor_type}
                onChange={(e) => setForm((f) => ({ ...f, vendor_type: e.target.value as VendorType }))}
              >
                {VENDOR_TYPES.map((t) => (
                  <MenuItem key={t} value={t}>
                    {t.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid size={{ xs: 12 }}>
              <TextField
                fullWidth
                label="Contact Name"
                value={form.contact_name}
                onChange={(e) => setForm((f) => ({ ...f, contact_name: e.target.value }))}
              />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <TextField
                fullWidth
                label="Contact Email"
                type="email"
                value={form.contact_email}
                onChange={(e) => setForm((f) => ({ ...f, contact_email: e.target.value }))}
              />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <TextField
                fullWidth
                label="Contact Phone"
                value={form.contact_phone}
                onChange={(e) => setForm((f) => ({ ...f, contact_phone: e.target.value }))}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleCreate}
            disabled={!form.name || createVendor.isPending}
          >
            {createVendor.isPending ? 'Creating...' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
