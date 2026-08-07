import { useState } from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  IconButton,
  MenuItem,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import Add from '@mui/icons-material/Add';
import Edit from '@mui/icons-material/Edit';
import LockReset from '@mui/icons-material/LockReset';
import PersonOff from '@mui/icons-material/PersonOff';
import PersonOutline from '@mui/icons-material/PersonOutline';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import { useSnackbar } from 'notistack';
import { PageHeader } from '../../components/common/PageHeader';
import { LoadingScreen } from '../../components/feedback/LoadingScreen';
import { StatusBadge } from '../../components/common/StatusBadge';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { useUsers, useCreateUser, useUpdateUser } from '../../hooks/useEmployees';
import { adminResetPassword, updateEmployeeProfile } from '../../api/accounts.api';
import { formatPhone, maskPhoneInput, stripPhone } from '../../utils/formatPhone';
import type { User, UserRole } from '../../types/accounts.types';

const ROLES: UserRole[] = ['Admin', 'Manager', 'Employee'];
const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

const EMPTY_CREATE_FORM = {
  email: '',
  first_name: '',
  last_name: '',
  phone: '',
  password: '',
  role: 'Employee' as UserRole,
  is_active: true,
  position: '',
  employment_type: 'full_time',
  pay_rate: '',
};

export default function UserListPage() {
  const { enqueueSnackbar } = useSnackbar();

  // Create dialog state
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_CREATE_FORM });

  // Edit dialog state
  const [editOpen, setEditOpen] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [editForm, setEditForm] = useState({
    email: '',
    first_name: '',
    last_name: '',
    phone: '',
    role: '' as UserRole | '',
    is_active: true,
    position: '',
    employment_type: 'full_time',
    pay_rate: '',
  });

  // Deactivate/activate confirmation state
  const [toggleActiveOpen, setToggleActiveOpen] = useState(false);
  const [toggleActiveUser, setToggleActiveUser] = useState<User | null>(null);

  // Password reset state
  const [tempPasswordOpen, setTempPasswordOpen] = useState(false);
  const [tempPasswordInfo, setTempPasswordInfo] = useState<{ userName: string; password: string } | null>(null);

  const { data, isLoading } = useUsers({ page_size: 200 });
  const createUser = useCreateUser();
  const updateUser = useUpdateUser();

  const users = (data?.results ?? []).filter((user) => user.role !== 'Consignee');

  const handleOpenEdit = (user: User) => {
    setEditUser(user);
    setEditForm({
      email: user.email,
      first_name: user.first_name,
      last_name: user.last_name,
      phone: user.phone ?? '',
      role: user.role ?? '',
      is_active: user.is_active,
      position: user.employee?.position ?? '',
      employment_type: user.employee?.employment_type ?? 'full_time',
      pay_rate: user.employee?.pay_rate ?? '',
    });
    setEditOpen(true);
  };

  const handleOpenToggleActive = (user: User) => {
    setToggleActiveUser(user);
    setToggleActiveOpen(true);
  };

  const handleResetPassword = async (user: User) => {
    try {
      const { data: result } = await adminResetPassword(user.id);
      setTempPasswordInfo({ userName: user.full_name || user.email, password: result.temporary_password });
      setTempPasswordOpen(true);
      enqueueSnackbar('Password reset successful', { variant: 'success' });
    } catch {
      enqueueSnackbar('Failed to reset password', { variant: 'error' });
    }
  };

  const columns: GridColDef[] = [
    {
      field: 'is_active',
      headerName: 'Status',
      width: 105,
      renderCell: ({ value }) => (
        <StatusBadge status={value ? 'active' : 'inactive'} size="small" />
      ),
    },
    {
      field: 'full_name',
      headerName: 'Name',
      width: 190,
    },
    {
      field: 'contact',
      headerName: 'Contact',
      width: 260,
      sortable: false,
      renderCell: ({ row }) => {
        const user = row as User;
        return (
          <Box sx={{ display: 'grid', lineHeight: 1.25 }}>
            <Typography variant="body2">{user.email}</Typography>
            <Typography variant="caption" color="text.secondary">
              {formatPhone(user.phone) || 'No phone'}
            </Typography>
          </Box>
        );
      },
    },
    {
      field: 'role',
      headerName: 'Role',
      width: 110,
      renderCell: ({ value }) => (
        <StatusBadge status={value ?? 'none'} size="small" />
      ),
    },
    {
      field: 'department',
      headerName: 'Department',
      width: 150,
      valueGetter: (_value, row) => (row as User).employee?.department_name ?? '-',
    },
    {
      field: 'pay_rate',
      headerName: 'Pay Rate',
      width: 115,
      align: 'right',
      headerAlign: 'right',
      valueGetter: (_value, row) => (row as User).employee?.pay_rate ?? '0',
      renderCell: ({ value }) => (
        <span style={{ fontVariantNumeric: 'tabular-nums' }}>
          {money.format(Number(value ?? 0))}
        </span>
      ),
    },
    {
      field: 'actions',
      headerName: 'Actions',
      width: 150,
      sortable: false,
      filterable: false,
      renderCell: ({ row }) => (
        <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center', height: '100%' }}>
          <Tooltip title="Edit">
            <IconButton size="small" onClick={() => handleOpenEdit(row as User)}>
              <Edit fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Reset Password">
            <IconButton size="small" onClick={() => handleResetPassword(row as User)}>
              <LockReset fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title={(row as User).is_active ? 'Deactivate' : 'Activate'}>
            <IconButton
              size="small"
              color={(row as User).is_active ? 'warning' : 'success'}
              onClick={() => handleOpenToggleActive(row as User)}
            >
              {(row as User).is_active ? (
                <PersonOff fontSize="small" />
              ) : (
                <PersonOutline fontSize="small" />
              )}
            </IconButton>
          </Tooltip>
        </Box>
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
      phone: stripPhone(form.phone),
        password: form.password,
      role: form.role || 'Employee',
        is_active: form.is_active,
      position: form.position,
      employment_type: form.employment_type,
      pay_rate: form.pay_rate || '0',
      };
      await createUser.mutateAsync(payload);
      enqueueSnackbar('User created', { variant: 'success' });
      setAddOpen(false);
      setForm({ ...EMPTY_CREATE_FORM });
    } catch {
      enqueueSnackbar('Failed to create user', { variant: 'error' });
    }
  };

  const handleEdit = async () => {
    if (!editUser) return;
    try {
      await updateUser.mutateAsync({
        id: editUser.id,
        data: {
          email: editForm.email,
          first_name: editForm.first_name,
          last_name: editForm.last_name,
          phone: editForm.phone,
          role: editForm.role || undefined,
          is_active: editForm.is_active,
        },
      });
      if (editForm.role && editForm.role !== 'Consignee') {
        await updateEmployeeProfile(editUser.id, {
          position: editForm.position,
          employment_type: editForm.employment_type,
          pay_rate: editForm.pay_rate || '0',
        });
      }
      enqueueSnackbar('Employee updated', { variant: 'success' });
      setEditOpen(false);
      setEditUser(null);
    } catch {
      enqueueSnackbar('Failed to update user', { variant: 'error' });
    }
  };

  const handleToggleActive = async () => {
    if (!toggleActiveUser) return;
    try {
      const newStatus = !toggleActiveUser.is_active;
      await updateUser.mutateAsync({
        id: toggleActiveUser.id,
        data: { is_active: newStatus },
      });
      enqueueSnackbar(
        newStatus ? 'Employee activated' : 'Employee deactivated',
        { variant: 'success' },
      );
      setToggleActiveOpen(false);
      setToggleActiveUser(null);
    } catch {
      enqueueSnackbar('Failed to update user status', { variant: 'error' });
    }
  };

  if (isLoading && users.length === 0) return <LoadingScreen message="Loading employees..." />;

  return (
    <Box>
      <PageHeader
        title="Employees"
        subtitle="Employee records, access roles, contact info, status, and pay rates"
        action={
          <Button variant="contained" startIcon={<Add />} onClick={() => setAddOpen(true)}>
            Add Employee
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

      {/* Create Employee Dialog */}
      <Dialog open={addOpen} onClose={() => setAddOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Add Employee</DialogTitle>
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
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                label="Phone"
                value={maskPhoneInput(form.phone)}
                onChange={(e) => setForm((f) => ({ ...f, phone: stripPhone(e.target.value) }))}
                placeholder="(555) 123-4567"
              />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                select
                label="Role"
                value={form.role}
                onChange={(e) =>
                  setForm((f) => ({ ...f, role: e.target.value as UserRole }))
                }
              >
                {ROLES.map((r) => (
                  <MenuItem key={r} value={r}>
                    {r}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                select
                label="Status"
                value={form.is_active ? 'active' : 'inactive'}
                onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.value === 'active' }))}
              >
                <MenuItem value="active">Active</MenuItem>
                <MenuItem value="inactive">Inactive</MenuItem>
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                label="Position"
                value={form.position}
                onChange={(e) => setForm((f) => ({ ...f, position: e.target.value }))}
              />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                select
                label="Employment Type"
                value={form.employment_type}
                onChange={(e) => setForm((f) => ({ ...f, employment_type: e.target.value }))}
              >
                <MenuItem value="full_time">Full time</MenuItem>
                <MenuItem value="part_time">Part time</MenuItem>
                <MenuItem value="seasonal">Seasonal</MenuItem>
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                label="Pay Rate"
                type="number"
                value={form.pay_rate}
                onChange={(e) => setForm((f) => ({ ...f, pay_rate: e.target.value }))}
                slotProps={{ input: { inputProps: { min: 0, step: '0.01' } } }}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleCreate}
            disabled={!form.email || !form.password || createUser.isPending}
          >
            {createUser.isPending ? 'Creating...' : 'Create employee'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Edit Employee Dialog */}
      <Dialog open={editOpen} onClose={() => setEditOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Edit Employee</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            <Grid size={{ xs: 12 }}>
              <TextField
                fullWidth
                label="Email"
                type="email"
                value={editForm.email}
                onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))}
              />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                label="First Name"
                value={editForm.first_name}
                onChange={(e) => setEditForm((f) => ({ ...f, first_name: e.target.value }))}
              />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                label="Last Name"
                value={editForm.last_name}
                onChange={(e) => setEditForm((f) => ({ ...f, last_name: e.target.value }))}
              />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                label="Phone"
                value={maskPhoneInput(editForm.phone)}
                onChange={(e) => setEditForm((f) => ({ ...f, phone: stripPhone(e.target.value) }))}
                placeholder="(555) 123-4567"
              />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                select
                label="Role"
                value={editForm.role}
                onChange={(e) =>
                  setEditForm((f) => ({ ...f, role: (e.target.value || '') as UserRole | '' }))
                }
              >
                {ROLES.map((r) => (
                  <MenuItem key={r} value={r}>
                    {r}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                select
                label="Status"
                value={editForm.is_active ? 'active' : 'inactive'}
                onChange={(e) => setEditForm((f) => ({ ...f, is_active: e.target.value === 'active' }))}
              >
                <MenuItem value="active">Active</MenuItem>
                <MenuItem value="inactive">Inactive</MenuItem>
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                label="Position"
                value={editForm.position}
                onChange={(e) => setEditForm((f) => ({ ...f, position: e.target.value }))}
              />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                select
                label="Employment Type"
                value={editForm.employment_type}
                onChange={(e) => setEditForm((f) => ({ ...f, employment_type: e.target.value }))}
              >
                <MenuItem value="full_time">Full time</MenuItem>
                <MenuItem value="part_time">Part time</MenuItem>
                <MenuItem value="seasonal">Seasonal</MenuItem>
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                label="Pay Rate"
                type="number"
                value={editForm.pay_rate}
                onChange={(e) => setEditForm((f) => ({ ...f, pay_rate: e.target.value }))}
                slotProps={{ input: { inputProps: { min: 0, step: '0.01' } } }}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleEdit}
            disabled={updateUser.isPending}
          >
            {updateUser.isPending ? 'Saving...' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Deactivate / Activate Confirmation */}
      <ConfirmDialog
        open={toggleActiveOpen}
        title={toggleActiveUser?.is_active ? 'Deactivate Employee' : 'Activate Employee'}
        message={
          toggleActiveUser?.is_active
            ? `Deactivate ${toggleActiveUser?.full_name ?? 'this employee'}? They will no longer be able to log in.`
            : `Reactivate ${toggleActiveUser?.full_name ?? 'this employee'}? They will be able to log in again.`
        }
        confirmLabel={toggleActiveUser?.is_active ? 'Deactivate' : 'Activate'}
        confirmColor={toggleActiveUser?.is_active ? 'warning' : 'success'}
        onConfirm={handleToggleActive}
        onCancel={() => {
          setToggleActiveOpen(false);
          setToggleActiveUser(null);
        }}
        loading={updateUser.isPending}
      />

      {/* Temp Password Result Dialog */}
      <Dialog
        open={tempPasswordOpen}
        onClose={() => setTempPasswordOpen(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Password Reset</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 2 }}>
            A temporary password has been generated for <strong>{tempPasswordInfo?.userName}</strong>.
            Please share it securely with the employee.
          </Typography>
          <TextField
            fullWidth
            label="Temporary Password"
            value={tempPasswordInfo?.password ?? ''}
            slotProps={{ input: { readOnly: true } }}
            sx={{
              '& .MuiInputBase-input': { fontFamily: 'monospace', fontSize: '1.1rem' },
            }}
          />
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              navigator.clipboard.writeText(tempPasswordInfo?.password ?? '');
              enqueueSnackbar('Copied to clipboard', { variant: 'info' });
            }}
          >
            Copy
          </Button>
          <Button variant="contained" onClick={() => setTempPasswordOpen(false)}>
            Done
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
