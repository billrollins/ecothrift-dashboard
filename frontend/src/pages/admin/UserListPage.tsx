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
import { useUsers, useCreateUser } from '../../hooks/useEmployees';
import type { User, UserRole } from '../../types/accounts.types';

const ROLES: UserRole[] = ['Admin', 'Manager', 'Employee', 'Consignee'];

export default function UserListPage() {
  const { enqueueSnackbar } = useSnackbar();
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({
    email: '',
    first_name: '',
    last_name: '',
    password: '',
    role: '' as UserRole | '',
    is_active: true,
    // Conditional profile fields
    employee_number: '',
    position: '',
    consignee_number: '',
    commission_rate: '',
  });

  const { data, isLoading } = useUsers();
  const createUser = useCreateUser();

  const users = data?.results ?? [];

  const columns: GridColDef[] = [
    {
      field: 'full_name',
      headerName: 'Name',
      flex: 1,
      minWidth: 150,
    },
    { field: 'email', headerName: 'Email', flex: 1, minWidth: 180 },
    {
      field: 'role',
      headerName: 'Role',
      width: 110,
      renderCell: ({ value }) => (
        <StatusBadge status={value ?? 'none'} size="small" />
      ),
    },
    {
      field: 'is_active',
      headerName: 'Status',
      width: 100,
      renderCell: ({ value }) => (
        <StatusBadge status={value ? 'active' : 'inactive'} size="small" />
      ),
    },
  ];

  const handleCreate = async () => {
    if (!form.email || !form.password) {
      enqueueSnackbar('Email and password required', { variant: 'warning' });
      return;
    }
    try {
      const payload: Record<string, unknown> = {
        email: form.email,
        first_name: form.first_name,
        last_name: form.last_name,
        password: form.password,
        role: form.role || null,
        is_active: form.is_active,
      };
      if (form.role === 'Employee') {
        payload.employee_profile = {
          employee_number: form.employee_number,
          position: form.position,
        };
      }
      if (form.role === 'Consignee') {
        payload.consignee_profile = {
          consignee_number: form.consignee_number,
          commission_rate: form.commission_rate,
        };
      }
      await createUser.mutateAsync(payload);
      enqueueSnackbar('User created', { variant: 'success' });
      setAddOpen(false);
      setForm({
        email: '',
        first_name: '',
        last_name: '',
        password: '',
        role: '',
        is_active: true,
        employee_number: '',
        position: '',
        consignee_number: '',
        commission_rate: '',
      });
    } catch {
      enqueueSnackbar('Failed to create user', { variant: 'error' });
    }
  };

  if (isLoading && users.length === 0) return <LoadingScreen message="Loading users..." />;

  return (
    <Box>
      <PageHeader
        title="Users"
        subtitle="User management"
        action={
          <Button variant="contained" startIcon={<Add />} onClick={() => setAddOpen(true)}>
            Add User
          </Button>
        }
      />

      <Box sx={{ height: 500 }}>
        <DataGrid
          rows={users}
          columns={columns}
          loading={isLoading}
          getRowId={(row: User) => row.id}
          pageSizeOptions={[10, 25, 50, 100]}
          initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
          sx={{ border: 'none' }}
        />
      </Box>

      <Dialog open={addOpen} onClose={() => setAddOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Add User</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            <Grid size={{ xs: 12 }}>
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
                label="First Name"
                value={form.first_name}
                onChange={(e) => setForm((f) => ({ ...f, first_name: e.target.value }))}
              />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                label="Last Name"
                value={form.last_name}
                onChange={(e) => setForm((f) => ({ ...f, last_name: e.target.value }))}
              />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <TextField
                fullWidth
                label="Password"
                type="password"
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                required
              />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <TextField
                fullWidth
                select
                label="Role"
                value={form.role}
                onChange={(e) =>
                  setForm((f) => ({ ...f, role: (e.target.value || '') as UserRole | '' }))
                }
              >
                <MenuItem value="">None</MenuItem>
                {ROLES.map((r) => (
                  <MenuItem key={r} value={r}>
                    {r}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            {form.role === 'Employee' && (
              <>
                <Grid size={{ xs: 12, md: 6 }}>
                  <TextField
                    fullWidth
                    label="Employee #"
                    value={form.employee_number}
                    onChange={(e) => setForm((f) => ({ ...f, employee_number: e.target.value }))}
                  />
                </Grid>
                <Grid size={{ xs: 12, md: 6 }}>
                  <TextField
                    fullWidth
                    label="Position"
                    value={form.position}
                    onChange={(e) => setForm((f) => ({ ...f, position: e.target.value }))}
                  />
                </Grid>
              </>
            )}
            {form.role === 'Consignee' && (
              <>
                <Grid size={{ xs: 12, md: 6 }}>
                  <TextField
                    fullWidth
                    label="Consignee #"
                    value={form.consignee_number}
                    onChange={(e) => setForm((f) => ({ ...f, consignee_number: e.target.value }))}
                  />
                </Grid>
                <Grid size={{ xs: 12, md: 6 }}>
                  <TextField
                    fullWidth
                    label="Commission Rate (%)"
                    type="number"
                    value={form.commission_rate}
                    onChange={(e) => setForm((f) => ({ ...f, commission_rate: e.target.value }))}
                    slotProps={{ input: { inputProps: { min: 0, max: 100 } } }}
                  />
                </Grid>
              </>
            )}
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleCreate}
            disabled={!form.email || !form.password || createUser.isPending}
          >
            {createUser.isPending ? 'Creating...' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
