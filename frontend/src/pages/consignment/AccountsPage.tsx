import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Autocomplete,
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
  ToggleButton,
  ToggleButtonGroup,
} from '@mui/material';
import Add from '@mui/icons-material/Add';
import Search from '@mui/icons-material/Search';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import { useSnackbar } from 'notistack';
import { PageHeader } from '../../components/common/PageHeader';
import { LoadingScreen } from '../../components/feedback/LoadingScreen';
import { StatusBadge } from '../../components/common/StatusBadge';
import {
  useConsigneeAccounts,
  useCreateConsigneeAccount,
} from '../../hooks/useConsignment';
import { useUsers } from '../../hooks/useEmployees';
import type { ConsigneeAccount } from '../../api/consignment.api';
import { formatPhone, maskPhoneInput, stripPhone } from '../../utils/formatPhone';

export default function AccountsPage() {
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const [search, setSearch] = useState('');

  // Add dialog state
  const [addOpen, setAddOpen] = useState(false);
  const [isNewUser, setIsNewUser] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [userSearch, setUserSearch] = useState('');
  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    commission_rate: '40',
    payout_method: 'cash' as 'cash' | 'check' | 'store_credit',
  });

  const { data, isLoading } = useConsigneeAccounts({ search: search || undefined });
  const { data: usersData } = useUsers({ search: userSearch || undefined, page_size: 20 });
  const createAccount = useCreateConsigneeAccount();

  const accounts = data?.results ?? [];
  const availableUsers = (usersData?.results ?? []).filter(
    (u: { id: number; consignee?: unknown }) => !u.consignee
  );

  const columns: GridColDef[] = [
    { field: 'consignee_number', headerName: 'Consignee #', width: 130 },
    { field: 'full_name', headerName: 'Name', flex: 1, minWidth: 160 },
    {
      field: 'commission_rate',
      headerName: 'Commission',
      width: 110,
      valueFormatter: (value) => `${value}%`,
    },
    {
      field: 'payout_method',
      headerName: 'Payout',
      width: 110,
      valueFormatter: (value) =>
        (value as string)?.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()) ?? '',
    },
    {
      field: 'status',
      headerName: 'Status',
      width: 100,
      renderCell: ({ value }) => <StatusBadge status={value ?? ''} size="small" />,
    },
    { field: 'join_date', headerName: 'Since', width: 110 },
  ];

  const resetForm = () => {
    setIsNewUser(false);
    setSelectedUserId(null);
    setUserSearch('');
    setForm({
      first_name: '',
      last_name: '',
      email: '',
      phone: '',
      commission_rate: '40',
      payout_method: 'cash',
    });
  };

  const handleCreate = async () => {
    if (!isNewUser && !selectedUserId) {
      enqueueSnackbar('Select an existing user or toggle to create new', { variant: 'warning' });
      return;
    }
    if (isNewUser && (!form.first_name || !form.last_name || !form.email)) {
      enqueueSnackbar('Name and email are required for new users', { variant: 'warning' });
      return;
    }
    try {
      const payload: Record<string, unknown> = {
        commission_rate: form.commission_rate,
        payout_method: form.payout_method,
      };
      if (isNewUser) {
        payload.first_name = form.first_name;
        payload.last_name = form.last_name;
        payload.email = form.email;
        payload.phone = form.phone;
      } else {
        payload.user_id = selectedUserId;
      }
      await createAccount.mutateAsync(payload);
      enqueueSnackbar('Consignee account created', { variant: 'success' });
      setAddOpen(false);
      resetForm();
    } catch (err) {
      const axiosErr = err as { response?: { data?: Record<string, string[]> } };
      const detail = axiosErr?.response?.data;
      const msg = detail
        ? Object.values(detail).flat().join('; ')
        : 'Failed to create consignee account';
      enqueueSnackbar(msg, { variant: 'error' });
    }
  };

  if (isLoading && accounts.length === 0) return <LoadingScreen message="Loading consignee accounts..." />;

  return (
    <Box>
      <PageHeader
        title="Consignee Accounts"
        subtitle="Manage consignment accounts and their agreements"
        action={
          <Button
            variant="contained"
            startIcon={<Add />}
            onClick={() => {
              resetForm();
              setAddOpen(true);
            }}
          >
            Add Consignee
          </Button>
        }
      />

      <Box sx={{ mb: 2 }}>
        <TextField
          size="small"
          placeholder="Search by name, email, phone, or consignee #..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          sx={{ minWidth: 340 }}
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
      </Box>

      <Box sx={{ height: 500 }}>
        <DataGrid
          rows={accounts}
          columns={columns}
          loading={isLoading}
          getRowId={(row) => row.id}
          pageSizeOptions={[10, 25, 50]}
          initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
          onRowClick={({ row }) => navigate(`/consignment/accounts/${(row as ConsigneeAccount).id}`)}
          sx={{ border: 'none', cursor: 'pointer' }}
        />
      </Box>

      {/* Add Consignee Dialog */}
      <Dialog open={addOpen} onClose={() => setAddOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Add Consignee</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            <Grid size={12}>
              <ToggleButtonGroup
                value={isNewUser ? 'new' : 'existing'}
                exclusive
                onChange={(_, val) => {
                  if (val) {
                    setIsNewUser(val === 'new');
                    setSelectedUserId(null);
                  }
                }}
                size="small"
                fullWidth
              >
                <ToggleButton value="existing">Existing User</ToggleButton>
                <ToggleButton value="new">New User</ToggleButton>
              </ToggleButtonGroup>
            </Grid>

            {!isNewUser && (
              <Grid size={12}>
                <Autocomplete
                  options={availableUsers}
                  getOptionLabel={(u: { full_name: string; email: string }) =>
                    `${u.full_name} (${u.email})`
                  }
                  getOptionKey={(u: { id: number }) => u.id}
                  onInputChange={(_, val) => setUserSearch(val)}
                  onChange={(_, val) => setSelectedUserId(val ? (val as { id: number }).id : null)}
                  renderInput={(params) => (
                    <TextField {...params} label="Search existing users..." fullWidth />
                  )}
                  noOptionsText="No users without a consignee profile found"
                  filterOptions={(x) => x}
                />
              </Grid>
            )}

            {isNewUser && (
              <>
                <Grid size={{ xs: 12, md: 6 }}>
                  <TextField
                    fullWidth
                    label="First Name"
                    value={form.first_name}
                    onChange={(e) => setForm((f) => ({ ...f, first_name: e.target.value }))}
                    required
                  />
                </Grid>
                <Grid size={{ xs: 12, md: 6 }}>
                  <TextField
                    fullWidth
                    label="Last Name"
                    value={form.last_name}
                    onChange={(e) => setForm((f) => ({ ...f, last_name: e.target.value }))}
                    required
                  />
                </Grid>
                <Grid size={12}>
                  <TextField
                    fullWidth
                    label="Email"
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                    required
                  />
                </Grid>
                <Grid size={{ xs: 12, md: 6 }}>
                  <TextField
                    fullWidth
                    label="Phone"
                    value={maskPhoneInput(form.phone)}
                    onChange={(e) => setForm((f) => ({ ...f, phone: stripPhone(e.target.value) }))}
                    placeholder="(555) 123-4567"
                  />
                </Grid>
              </>
            )}

            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                label="Default Commission Rate (%)"
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
                label="Payout Method"
                value={form.payout_method}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    payout_method: e.target.value as 'cash' | 'check' | 'store_credit',
                  }))
                }
              >
                <MenuItem value="cash">Cash</MenuItem>
                <MenuItem value="check">Check</MenuItem>
                <MenuItem value="store_credit">Store Credit</MenuItem>
              </TextField>
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleCreate}
            disabled={createAccount.isPending}
          >
            {createAccount.isPending ? 'Creating...' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
