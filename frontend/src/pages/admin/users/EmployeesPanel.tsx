/**
 * The staff directory.
 *
 * Scan left to right: who they are, their number, where they sit, what they
 * do, then authority / hours / phone, then tenure and whether they can sign
 * in. Department, job, role, type, and phone save on the row so a manager
 * does not have to open every file for a roster correction.
 *
 * The access cell is always painted and only changes colour, so a row never
 * resizes when someone is deactivated.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  InputAdornment,
  MenuItem,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import Add from '@mui/icons-material/Add';
import Search from '@mui/icons-material/Search';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import { useQuery } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import { getDepartments } from '../../../api/hr.api';
import {
  GRID_FILL_SX,
  GRID_PAGE_PROPS,
  GRID_SX,
  PAGE_FILL_SX,
  noRowsSlot,
} from '../../../components/common/gridChrome';
import { InlineEmpty, InlineSelect, InlineText } from '../../../components/users/InlineCell';
import {
  PersonCell,
  StackCell,
  StateChip,
  formatDay,
  tenureFrom,
} from '../../../components/users/userChrome';
import type { User } from '../../../api/accounts.api';
import type { EmploymentType, UserRole } from '../../../types/accounts.types';
import {
  useCreateUser,
  useUpdateEmployeeProfile,
  useUpdateUser,
  useUsers,
} from '../../../hooks/useEmployees';
import { useIsMobileLayout } from '../../../hooks/useIsMobileLayout';
import { maskPhoneInput, stripPhone } from '../../../utils/formatPhone';

type Props = {
  onSelect: (userId: number) => void;
};

type ActiveFilter = '1' | '0' | '';
type RoleFilter = '' | 'Admin' | 'Manager' | 'Employee';

const STAFF_ROLES: UserRole[] = ['Admin', 'Manager', 'Employee'];

const EMPLOYMENT_LABELS: Record<string, string> = {
  full_time: 'Full time',
  part_time: 'Part time',
  seasonal: 'Seasonal',
};

const ROLE_COLOR: Record<string, 'error' | 'warning' | 'default'> = {
  Admin: 'error',
  Manager: 'warning',
  Employee: 'default',
};

const EMPTY_FORM = {
  first_name: '',
  last_name: '',
  email: '',
  phone: '',
  role: 'Employee' as RoleFilter,
  department: '',
  position: '',
  employment_type: 'full_time',
  pay_rate: '',
};

/** Fields that save on the row. A click here must not open the drawer. */
const INLINE_FIELDS = new Set(['department', 'position', 'role', 'employment_type', 'phone']);

type EmployeePatch = {
  role?: UserRole;
  phone?: string;
  department?: number | null;
  department_name?: string | null;
  position?: string;
  employment_type?: EmploymentType;
};

function departmentChoices(
  options: { value: string; label: string }[],
  currentId: string,
  currentName: string | null,
) {
  if (!currentId || options.some((d) => d.value === currentId)) return options;
  return [{ value: currentId, label: currentName || 'Current' }, ...options];
}

function applyEmployeePatch(user: User, patch?: EmployeePatch): User {
  if (!patch) return user;
  return {
    ...user,
    role: patch.role ?? user.role,
    phone: patch.phone ?? user.phone,
    employee: user.employee
      ? {
          ...user.employee,
          department:
            patch.department !== undefined ? patch.department : user.employee.department,
          department_name:
            patch.department_name !== undefined
              ? patch.department_name
              : user.employee.department_name,
          position: patch.position ?? user.employee.position,
          employment_type: patch.employment_type ?? user.employee.employment_type,
        }
      : user.employee,
  };
}

/**
 * Access state is one cell that always exists: what stops them signing in?
 *
 * A blank last_login is not evidence of anything. Sign-in times were only
 * stamped from Aug 2026 on, so long-serving staff still read as blank.
 */
function accessState(user: User): { label: string; tone: 'good' | 'warn' | 'muted'; hint: string } {
  if (!user.is_active) {
    return { label: 'Inactive', tone: 'warn', hint: 'Cannot sign in. Records are kept.' };
  }
  if (!user.has_password) {
    return { label: 'No password', tone: 'warn', hint: 'Cannot sign in yet. Send a reset link.' };
  }
  return {
    label: 'Active',
    tone: 'good',
    hint: user.last_login
      ? `Last signed in ${formatDay(user.last_login)}.`
      : 'No sign-in recorded yet for this account.',
  };
}

function jobLine(user: User): string {
  const profile = user.employee;
  if (!profile) return 'No employee record';
  const bits = [
    profile.department_name,
    profile.position,
    EMPLOYMENT_LABELS[profile.employment_type],
  ].filter(Boolean);
  return bits.join(' · ') || 'Position not set';
}

function EmployeeMobileRow({ user, onSelect }: { user: User; onSelect: (id: number) => void }) {
  const state = accessState(user);
  return (
    <Box
      component="button"
      type="button"
      onClick={() => onSelect(user.id)}
      aria-label={`Open ${user.full_name || user.email}`}
      sx={{
        display: 'block',
        width: '100%',
        textAlign: 'left',
        px: 1.5,
        py: 1.25,
        minHeight: 84,
        border: '1.5px solid',
        borderColor: user.is_active ? 'divider' : 'warning.light',
        borderRadius: 2.5,
        bgcolor: 'background.paper',
        cursor: 'pointer',
        WebkitTapHighlightColor: 'transparent',
        '&:active': { transform: 'scale(0.985)' },
      }}
    >
      <PersonCell
        name={user.full_name}
        secondary={user.email}
        seed={user.email || String(user.id)}
        muted={!user.is_active}
        trailing={
          <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto', flexShrink: 0 }}>
            {user.employee?.employee_number || '-'}
          </Typography>
        }
      />
      <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mt: 0.75 }}>
        <Chip
          size="small"
          label={user.role || 'No role'}
          color={ROLE_COLOR[user.role || ''] || 'default'}
          variant="outlined"
        />
        <StateChip label={state.label} tone={state.tone} />
        <Typography variant="caption" color="text.secondary" noWrap>
          {jobLine(user)}
        </Typography>
      </Stack>
    </Box>
  );
}

export default function EmployeesPanel({ onSelect }: Props) {
  const isMobile = useIsMobileLayout();
  const { enqueueSnackbar } = useSnackbar();
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>('1');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('');
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({ ...EMPTY_FORM });
  const [patches, setPatches] = useState<Record<number, EmployeePatch>>({});
  const createUser = useCreateUser();
  const updateUser = useUpdateUser();
  const updateProfile = useUpdateEmployeeProfile();

  const departments = useQuery({
    queryKey: ['departments'],
    queryFn: async () => (await getDepartments()).data,
    staleTime: 300_000,
  });

  useEffect(() => {
    const t = window.setTimeout(() => setSearch(searchInput.trim()), 250);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  const { data, isLoading, isError } = useUsers({
    page_size: 200,
    search: search || undefined,
    role: roleFilter || undefined,
    is_active: activeFilter || undefined,
    ordering: 'last_name',
  });

  // Consignees and customers share the User table; this tab is staff only.
  const rows = useMemo(
    () =>
      (data?.results || [])
        .filter((u) => STAFF_ROLES.includes(u.role as UserRole))
        .map((u) => applyEmployeePatch(u, patches[u.id])),
    [data, patches],
  );

  const departmentOptions = useMemo(() => {
    const list = Array.isArray(departments.data) ? [...departments.data] : [];
    list.sort((a, b) => a.name.localeCompare(b.name));
    return list.map((d) => ({ value: String(d.id), label: d.name }));
  }, [departments.data]);

  const typeOptions = useMemo(
    () =>
      Object.entries(EMPLOYMENT_LABELS).map(([value, label]) => ({ value, label })),
    [],
  );
  const roleOptions = useMemo(
    () => STAFF_ROLES.map((r) => ({ value: r, label: r })),
    [],
  );

  const patchRow = useCallback((id: number, next: EmployeePatch) => {
    setPatches((prev) => ({ ...prev, [id]: { ...prev[id], ...next } }));
  }, []);

  const revertRow = useCallback((id: number) => {
    setPatches((prev) => {
      const { [id]: _dropped, ...rest } = prev;
      return rest;
    });
  }, []);

  const saveProfile = useCallback(
    async (user: User, payload: Record<string, unknown>, next: EmployeePatch) => {
      if (!user.employee) return;
      patchRow(user.id, next);
      try {
        await updateProfile.mutateAsync({ userId: user.id, data: payload });
      } catch {
        revertRow(user.id);
        enqueueSnackbar('Could not save that change', { variant: 'error' });
      }
    },
    [enqueueSnackbar, patchRow, revertRow, updateProfile],
  );

  const saveAccount = useCallback(
    async (user: User, payload: Record<string, unknown>, next: EmployeePatch) => {
      patchRow(user.id, next);
      try {
        await updateUser.mutateAsync({ id: user.id, data: payload });
      } catch {
        revertRow(user.id);
        enqueueSnackbar('Could not save that change', { variant: 'error' });
      }
    },
    [enqueueSnackbar, patchRow, revertRow, updateUser],
  );

  const columns: GridColDef<User>[] = useMemo(
    () => [
      {
        field: 'full_name',
        headerName: 'Employee',
        flex: 1.5,
        minWidth: 200,
        sortable: false,
        renderCell: ({ row }) => (
          <PersonCell
            name={row.full_name}
            secondary={row.email}
            seed={row.email || String(row.id)}
            muted={!row.is_active}
          />
        ),
      },
      {
        field: 'employee_number',
        headerName: '#',
        width: 80,
        sortable: false,
        valueGetter: (_v, row) => row.employee?.employee_number || '',
        renderCell: ({ row }) => (
          <Typography
            variant="body2"
            color={row.employee ? 'text.primary' : 'text.disabled'}
            sx={{ fontVariantNumeric: 'tabular-nums' }}
          >
            {row.employee?.employee_number || '-'}
          </Typography>
        ),
      },
      {
        field: 'department',
        headerName: 'Dept',
        width: 150,
        sortable: false,
        renderCell: ({ row }) =>
          row.employee ? (
            <InlineSelect
              ariaLabel={`Department for ${row.full_name || row.email}`}
              value={row.employee.department != null ? String(row.employee.department) : ''}
              options={departmentChoices(
                departmentOptions,
                row.employee.department != null ? String(row.employee.department) : '',
                row.employee.department_name,
              )}
              emptyLabel="None"
              onCommit={(next) => {
                const id = next ? Number(next) : null;
                const name =
                  departmentOptions.find((d) => d.value === next)?.label ??
                  (next && next === String(row.employee?.department)
                    ? row.employee?.department_name
                    : null);
                void saveProfile(row, { department: id }, { department: id, department_name: name });
              }}
            />
          ) : (
            <InlineEmpty>No record</InlineEmpty>
          ),
      },
      {
        field: 'position',
        headerName: 'Job',
        flex: 1.2,
        minWidth: 140,
        sortable: false,
        renderCell: ({ row }) =>
          row.employee ? (
            <InlineText
              ariaLabel={`Job for ${row.full_name || row.email}`}
              value={row.employee.position || ''}
              placeholder="Job title"
              onCommit={(next) => {
                void saveProfile(row, { position: next }, { position: next });
              }}
            />
          ) : (
            <InlineEmpty>No record</InlineEmpty>
          ),
      },
      {
        field: 'role',
        headerName: 'Role',
        width: 118,
        renderCell: ({ row }) => (
          <InlineSelect
            ariaLabel={`Role for ${row.full_name || row.email}`}
            value={row.role || 'Employee'}
            options={roleOptions}
            onCommit={(next) => {
              void saveAccount(row, { role: next }, { role: next as UserRole });
            }}
          />
        ),
      },
      {
        field: 'employment_type',
        headerName: 'Type',
        width: 118,
        sortable: false,
        renderCell: ({ row }) =>
          row.employee ? (
            <InlineSelect
              ariaLabel={`Employment type for ${row.full_name || row.email}`}
              value={row.employee.employment_type}
              options={typeOptions}
              onCommit={(next) => {
                void saveProfile(
                  row,
                  { employment_type: next },
                  { employment_type: next as EmploymentType },
                );
              }}
            />
          ) : (
            <InlineEmpty>No record</InlineEmpty>
          ),
      },
      {
        field: 'phone',
        headerName: 'Phone',
        width: 148,
        renderCell: ({ row }) => (
          <InlineText
            ariaLabel={`Phone for ${row.full_name || row.email}`}
            value={row.phone || ''}
            placeholder="Phone"
            display={maskPhoneInput}
            parse={stripPhone}
            onCommit={(next) => {
              void saveAccount(row, { phone: next }, { phone: next });
            }}
          />
        ),
      },
      {
        field: 'hire_date',
        headerName: 'Tenure',
        width: 108,
        sortable: false,
        valueGetter: (_v, row) => row.employee?.hire_date || '',
        renderCell: ({ row }) => {
          const profile = row.employee;
          if (!profile) return <StackCell top="-" bottom="no record" />;
          if (profile.termination_date) {
            return (
              <StackCell top="Left" bottom={formatDay(profile.termination_date) || 'date unknown'} />
            );
          }
          return (
            <StackCell
              top={tenureFrom(profile.hire_date) || '-'}
              bottom={formatDay(profile.hire_date) || 'hire date unknown'}
            />
          );
        },
      },
      {
        field: 'is_active',
        headerName: 'Access',
        width: 118,
        sortable: false,
        renderCell: ({ row }) => {
          const state = accessState(row);
          return <StateChip label={state.label} tone={state.tone} hint={state.hint} />;
        },
      },
    ],
    [departmentOptions, roleOptions, saveAccount, saveProfile, typeOptions],
  );

  const handleCreate = async () => {
    if (!createForm.email.trim()) {
      enqueueSnackbar('Email is required', { variant: 'warning' });
      return;
    }
    try {
      const created = await createUser.mutateAsync({
        email: createForm.email.trim(),
        first_name: createForm.first_name.trim(),
        last_name: createForm.last_name.trim(),
        phone: createForm.phone,
        role: createForm.role || 'Employee',
        position: createForm.position.trim(),
        department: createForm.department ? Number(createForm.department) : undefined,
        employment_type: createForm.employment_type,
        pay_rate: createForm.pay_rate || undefined,
        // They set their own on first sign-in; nobody types a password for them.
        password: crypto.randomUUID(),
      });
      enqueueSnackbar('Employee added. Send them a reset link to set a password.', {
        variant: 'success',
      });
      setCreateOpen(false);
      setCreateForm({ ...EMPTY_FORM });
      onSelect(created.id);
    } catch (err) {
      const detail = (err as { response?: { data?: Record<string, string[]> } })?.response?.data;
      const first = detail ? Object.values(detail)[0] : null;
      enqueueSnackbar(
        Array.isArray(first) ? first[0] : 'Could not add employee',
        { variant: 'error' },
      );
    }
  };

  if (isError && !data) {
    return (
      <Typography color="error" variant="body2">
        Could not load employees.
      </Typography>
    );
  }

  return (
    <Box sx={PAGE_FILL_SX}>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={1.5}
        alignItems={{ sm: 'center' }}
        sx={{ mb: 2, flexShrink: 0 }}
      >
        <TextField
          size="small"
          placeholder="Search name or email"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          fullWidth={isMobile}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <Search fontSize="small" />
              </InputAdornment>
            ),
          }}
          sx={{ minWidth: isMobile ? 0 : 240, flex: isMobile ? undefined : '1 1 240px' }}
        />
        <TextField
          select
          size="small"
          label="Role"
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value as RoleFilter)}
          sx={{ minWidth: 130 }}
        >
          <MenuItem value="">All roles</MenuItem>
          {STAFF_ROLES.map((r) => (
            <MenuItem key={r} value={r}>
              {r}
            </MenuItem>
          ))}
        </TextField>
        <ToggleButtonGroup
          exclusive
          size="small"
          value={activeFilter}
          onChange={(_e, next: ActiveFilter | null) => next !== null && setActiveFilter(next)}
        >
          <ToggleButton value="1" sx={{ textTransform: 'none', px: 1.5 }}>
            Active
          </ToggleButton>
          <ToggleButton value="0" sx={{ textTransform: 'none', px: 1.5 }}>
            Inactive
          </ToggleButton>
          <ToggleButton value="" sx={{ textTransform: 'none', px: 1.5 }}>
            All
          </ToggleButton>
        </ToggleButtonGroup>
        <Button
          variant="contained"
          startIcon={<Add />}
          onClick={() => setCreateOpen(true)}
          sx={{ flexShrink: 0, ml: { sm: 'auto' } }}
        >
          Add employee
        </Button>
      </Stack>

      {isMobile ? (
        <Stack spacing={1} sx={{ minHeight: 200 }}>
          {rows.length === 0 ? (
            <Stack
              alignItems="center"
              justifyContent="center"
              sx={{ px: 3, py: 6, border: '1px dashed', borderColor: 'divider', borderRadius: 2.5 }}
            >
              <Typography variant="body2" color="text.secondary" align="center">
                {isLoading ? 'Loading employees…' : 'No employees match these filters'}
              </Typography>
            </Stack>
          ) : (
            rows.map((row) => <EmployeeMobileRow key={row.id} user={row} onSelect={onSelect} />)
          )}
        </Stack>
      ) : (
        <Box sx={GRID_FILL_SX}>
          <DataGrid
            rows={rows}
            columns={columns}
            getRowId={(r) => r.id}
            loading={isLoading}
            disableRowSelectionOnClick
            onCellClick={(params, event) => {
              if (INLINE_FIELDS.has(params.field)) event.stopPropagation();
            }}
            onRowClick={(params) => onSelect(params.row.id)}
            slots={noRowsSlot(
              'No employees match these filters',
              'Clear the role or status filter to see everyone.',
            )}
            sx={{
              ...GRID_SX,
              cursor: 'pointer',
              '& .MuiDataGrid-cell[data-field="department"], & .MuiDataGrid-cell[data-field="position"], & .MuiDataGrid-cell[data-field="role"], & .MuiDataGrid-cell[data-field="employment_type"], & .MuiDataGrid-cell[data-field="phone"]':
                { overflow: 'visible', cursor: 'default' },
            }}
            {...GRID_PAGE_PROPS}
          />
        </Box>
      )}

      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Add employee</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 0.5 }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField
                label="First name"
                value={createForm.first_name}
                onChange={(e) => setCreateForm((f) => ({ ...f, first_name: e.target.value }))}
                fullWidth
                autoFocus
              />
              <TextField
                label="Last name"
                value={createForm.last_name}
                onChange={(e) => setCreateForm((f) => ({ ...f, last_name: e.target.value }))}
                fullWidth
              />
            </Stack>
            <TextField
              label="Email"
              type="email"
              value={createForm.email}
              onChange={(e) => setCreateForm((f) => ({ ...f, email: e.target.value }))}
              fullWidth
              required
              helperText="This is their sign-in and where the reset link goes."
            />
            <TextField
              label="Phone"
              value={maskPhoneInput(createForm.phone)}
              onChange={(e) => setCreateForm((f) => ({ ...f, phone: stripPhone(e.target.value) }))}
              placeholder="(555) 123-4567"
              fullWidth
            />
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField
                select
                label="Role"
                value={createForm.role || 'Employee'}
                onChange={(e) => setCreateForm((f) => ({ ...f, role: e.target.value as RoleFilter }))}
                fullWidth
              >
                {STAFF_ROLES.map((r) => (
                  <MenuItem key={r} value={r}>
                    {r}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                select
                label="Employment"
                value={createForm.employment_type}
                onChange={(e) =>
                  setCreateForm((f) => ({ ...f, employment_type: e.target.value }))
                }
                fullWidth
              >
                {Object.entries(EMPLOYMENT_LABELS).map(([value, label]) => (
                  <MenuItem key={value} value={value}>
                    {label}
                  </MenuItem>
                ))}
              </TextField>
            </Stack>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField
                select
                label="Department"
                value={createForm.department}
                onChange={(e) => setCreateForm((f) => ({ ...f, department: e.target.value }))}
                fullWidth
              >
                <MenuItem value="">None yet</MenuItem>
                {departmentOptions.map((d) => (
                  <MenuItem key={d.value} value={d.value}>
                    {d.label}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                label="Job"
                value={createForm.position}
                onChange={(e) => setCreateForm((f) => ({ ...f, position: e.target.value }))}
                fullWidth
              />
            </Stack>
            <TextField
              label="Pay rate"
              type="number"
              value={createForm.pay_rate}
              onChange={(e) => setCreateForm((f) => ({ ...f, pay_rate: e.target.value }))}
              fullWidth
              InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }}
            />
            <Typography variant="caption" color="text.secondary">
              No password is set here. Open the new record and send a reset link so they choose
              their own.
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleCreate}
            disabled={!createForm.email.trim() || createUser.isPending}
          >
            {createUser.isPending ? 'Adding…' : 'Add employee'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
