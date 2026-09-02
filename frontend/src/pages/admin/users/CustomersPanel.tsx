/**
 * The customer directory.
 *
 * Scan left to right: who they are, their number, how to reach them, what we
 * remember, then holds and whether the account can actually be reached.
 * Phone and notes save on the row so a floor conversation does not need the
 * drawer. Every state cell is always painted and only changes colour and
 * wording, so filtering never resizes a row.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  InputAdornment,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import Add from '@mui/icons-material/Add';
import Search from '@mui/icons-material/Search';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import { useSnackbar } from 'notistack';
import {
  GRID_FILL_SX,
  GRID_PAGE_PROPS,
  GRID_SX,
  PAGE_FILL_SX,
  noRowsSlot,
} from '../../../components/common/gridChrome';
import { InlineText } from '../../../components/users/InlineCell';
import {
  PersonCell,
  StackCell,
  StateChip,
  formatDay,
  relativeDay,
} from '../../../components/users/userChrome';
import type { Customer } from '../../../api/accounts.api';
import { useCreateCustomer, useCustomers, useUpdateCustomer } from '../../../hooks/useEmployees';
import { useIsMobileLayout } from '../../../hooks/useIsMobileLayout';
import { formatPhone, maskPhoneInput, stripPhone } from '../../../utils/formatPhone';

type Props = {
  onSelect: (customerId: number) => void;
};

type ActiveFilter = '1' | '0' | '';

const EMPTY_FORM = {
  first_name: '',
  last_name: '',
  email: '',
  phone: '',
  notes: '',
};

/** Fields that save on the row. A click here must not open the drawer. */
const INLINE_FIELDS = new Set(['phone', 'notes']);

type CustomerPatch = {
  phone?: string;
  notes?: string;
};

function applyCustomerPatch(customer: Customer, patch?: CustomerPatch): Customer {
  if (!patch) return customer;
  return {
    ...customer,
    phone: patch.phone ?? customer.phone,
    notes: patch.notes ?? customer.notes,
  };
}

function reachState(customer: Customer): { label: string; tone: 'good' | 'warn' | 'muted'; hint: string } {
  if (!customer.is_active) {
    return { label: 'Inactive', tone: 'warn', hint: 'Cannot sign in. History is kept.' };
  }
  if (!customer.email) {
    return { label: 'No email', tone: 'warn', hint: 'Nothing to send a sign-in link to.' };
  }
  if (!customer.email_verified) {
    return { label: 'Unverified', tone: 'muted', hint: 'They have not proven this email yet.' };
  }
  return { label: 'Verified', tone: 'good', hint: 'Email proven. Sign-in links will reach them.' };
}

function CustomerMobileRow({
  customer,
  onSelect,
}: {
  customer: Customer;
  onSelect: (id: number) => void;
}) {
  const state = reachState(customer);
  const holds = customer.holds_count ?? 0;
  return (
    <Box
      component="button"
      type="button"
      onClick={() => onSelect(customer.id)}
      aria-label={`Open ${customer.full_name || customer.email || 'customer'}`}
      sx={{
        display: 'block',
        width: '100%',
        textAlign: 'left',
        px: 1.5,
        py: 1.25,
        minHeight: 104,
        border: '1.5px solid',
        borderColor: customer.is_active ? 'divider' : 'warning.light',
        borderRadius: 2.5,
        bgcolor: 'background.paper',
        cursor: 'pointer',
        WebkitTapHighlightColor: 'transparent',
        '&:active': { transform: 'scale(0.985)' },
      }}
    >
      <PersonCell
        name={customer.full_name}
        secondary={customer.email || 'No email'}
        seed={customer.email || String(customer.id)}
        muted={!customer.is_active}
        trailing={
          <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto', flexShrink: 0 }}>
            {customer.customer_number}
          </Typography>
        }
      />
      <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mt: 0.75 }}>
        <StateChip label={state.label} tone={state.tone} />
        <Typography variant="caption" color="text.secondary" noWrap>
          {holds ? `${holds} hold${holds === 1 ? '' : 's'}` : 'No holds'}
          {customer.phone ? ` · ${formatPhone(customer.phone)}` : ''}
        </Typography>
      </Stack>
      <Typography
        variant="caption"
        color="text.disabled"
        noWrap
        sx={{ display: 'block', mt: 0.25, minHeight: 18 }}
      >
        {(customer.notes || '').trim() || 'No notes'}
      </Typography>
    </Box>
  );
}

export default function CustomersPanel({ onSelect }: Props) {
  const isMobile = useIsMobileLayout();
  const { enqueueSnackbar } = useSnackbar();
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>('1');
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({ ...EMPTY_FORM });
  const [patches, setPatches] = useState<Record<number, CustomerPatch>>({});
  const createCustomer = useCreateCustomer();
  const updateCustomer = useUpdateCustomer();

  useEffect(() => {
    const t = window.setTimeout(() => setSearch(searchInput.trim()), 250);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  const { data, isLoading, isError } = useCustomers({
    search: search || undefined,
    is_active: activeFilter || undefined,
    ordering: 'customer_number',
  });

  const rows = useMemo(
    () => (data?.results || []).map((row) => applyCustomerPatch(row, patches[row.id])),
    [data, patches],
  );

  const patchRow = useCallback((id: number, next: CustomerPatch) => {
    setPatches((prev) => ({ ...prev, [id]: { ...prev[id], ...next } }));
  }, []);

  const revertRow = useCallback((id: number) => {
    setPatches((prev) => {
      const { [id]: _dropped, ...rest } = prev;
      return rest;
    });
  }, []);

  const saveCustomer = useCallback(
    async (customer: Customer, payload: Record<string, unknown>, next: CustomerPatch) => {
      patchRow(customer.id, next);
      try {
        await updateCustomer.mutateAsync({ id: customer.id, data: payload });
      } catch {
        revertRow(customer.id);
        enqueueSnackbar('Could not save that change', { variant: 'error' });
      }
    },
    [enqueueSnackbar, patchRow, revertRow, updateCustomer],
  );

  const columns: GridColDef<Customer>[] = useMemo(
    () => [
      {
        field: 'full_name',
        headerName: 'Customer',
        flex: 1.4,
        minWidth: 200,
        sortable: false,
        renderCell: ({ row }) => (
          <PersonCell
            name={row.full_name}
            secondary={row.email || 'No email'}
            seed={row.email || String(row.id)}
            muted={!row.is_active}
          />
        ),
      },
      {
        field: 'customer_number',
        headerName: '#',
        width: 92,
        renderCell: ({ row }) => (
          <Typography variant="body2" sx={{ fontVariantNumeric: 'tabular-nums' }}>
            {row.customer_number}
          </Typography>
        ),
      },
      {
        field: 'phone',
        headerName: 'Phone',
        width: 148,
        renderCell: ({ row }) => (
          <InlineText
            ariaLabel={`Phone for ${row.full_name || row.email || 'customer'}`}
            value={row.phone || ''}
            placeholder="Phone"
            display={maskPhoneInput}
            parse={stripPhone}
            onCommit={(next) => {
              void saveCustomer(row, { phone: next }, { phone: next });
            }}
          />
        ),
      },
      {
        field: 'notes',
        headerName: 'Notes',
        flex: 1.8,
        minWidth: 180,
        sortable: false,
        renderCell: ({ row }) => (
          <InlineText
            ariaLabel={`Notes for ${row.full_name || row.email || 'customer'}`}
            value={row.notes || ''}
            placeholder="Notes"
            onCommit={(next) => {
              void saveCustomer(row, { notes: next }, { notes: next });
            }}
          />
        ),
      },
      {
        field: 'holds_count',
        headerName: 'Holds',
        width: 100,
        renderCell: ({ row }) => {
          const holds = row.holds_count ?? 0;
          return (
            <StackCell
              top={holds ? String(holds) : '—'}
              bottom={holds ? relativeDay(row.last_hold_at) || 'on file' : 'none yet'}
            />
          );
        },
      },
      {
        field: 'email_verified',
        headerName: 'Account',
        width: 118,
        sortable: false,
        renderCell: ({ row }) => {
          const state = reachState(row);
          return <StateChip label={state.label} tone={state.tone} hint={state.hint} />;
        },
      },
      {
        field: 'customer_since',
        headerName: 'Since',
        width: 104,
        renderCell: ({ row }) => (
          <Typography variant="body2" color="text.secondary">
            {formatDay(row.customer_since) || '—'}
          </Typography>
        ),
      },
    ],
    [saveCustomer],
  );

  const handleCreate = async () => {
    if (!createForm.first_name.trim() || !createForm.last_name.trim()) {
      enqueueSnackbar('Name is required', { variant: 'warning' });
      return;
    }
    try {
      const created = await createCustomer.mutateAsync({
        ...createForm,
        first_name: createForm.first_name.trim(),
        last_name: createForm.last_name.trim(),
        email: createForm.email.trim(),
      });
      enqueueSnackbar('Customer created', { variant: 'success' });
      setCreateOpen(false);
      setCreateForm({ ...EMPTY_FORM });
      onSelect(created.id);
    } catch {
      enqueueSnackbar('Could not create customer', { variant: 'error' });
    }
  };

  if (isError && !data) {
    return (
      <Typography color="error" variant="body2">
        Could not load customers.
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
          placeholder="Search name, email, phone, or #"
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
          sx={{ minWidth: isMobile ? 0 : 280, flex: isMobile ? undefined : '1 1 280px' }}
        />
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
          Add customer
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
                {isLoading
                  ? 'Loading customers…'
                  : search
                    ? 'No customers match this search'
                    : 'No customers yet'}
              </Typography>
            </Stack>
          ) : (
            rows.map((row) => (
              <CustomerMobileRow key={row.id} customer={row} onSelect={onSelect} />
            ))
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
              search ? 'No customers match this search' : 'No customers yet',
              search ? 'Try an email address or a CUS- number.' : undefined,
            )}
            sx={{
              ...GRID_SX,
              cursor: 'pointer',
              '& .MuiDataGrid-cell[data-field="phone"], & .MuiDataGrid-cell[data-field="notes"]': {
                overflow: 'visible',
                cursor: 'default',
              },
            }}
            {...GRID_PAGE_PROPS}
          />
        </Box>
      )}

      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Add customer</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 0.5 }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField
                label="First name"
                value={createForm.first_name}
                onChange={(e) => setCreateForm((f) => ({ ...f, first_name: e.target.value }))}
                fullWidth
                required
                autoFocus
              />
              <TextField
                label="Last name"
                value={createForm.last_name}
                onChange={(e) => setCreateForm((f) => ({ ...f, last_name: e.target.value }))}
                fullWidth
                required
              />
            </Stack>
            <TextField
              label="Email"
              type="email"
              value={createForm.email}
              onChange={(e) => setCreateForm((f) => ({ ...f, email: e.target.value }))}
              fullWidth
              helperText="Without this they cannot sign in or receive a hold."
            />
            <TextField
              label="Phone"
              value={maskPhoneInput(createForm.phone)}
              onChange={(e) => setCreateForm((f) => ({ ...f, phone: stripPhone(e.target.value) }))}
              placeholder="(555) 123-4567"
              fullWidth
            />
            <TextField
              label="Notes"
              value={createForm.notes}
              onChange={(e) => setCreateForm((f) => ({ ...f, notes: e.target.value }))}
              fullWidth
              multiline
              minRows={2}
              helperText="Internal only"
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleCreate}
            disabled={
              !createForm.first_name.trim() ||
              !createForm.last_name.trim() ||
              createCustomer.isPending
            }
          >
            {createCustomer.isPending ? 'Creating…' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
