import { useEffect, useState } from 'react';
import {
  Box,
  Button,
  Chip,
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
import { LoadingScreen } from '../../../components/feedback/LoadingScreen';
import type { Customer } from '../../../api/accounts.api';
import { useCreateCustomer, useCustomers } from '../../../hooks/useEmployees';
import { formatPhone, maskPhoneInput, stripPhone } from '../../../utils/formatPhone';
import { GRID_HEIGHT, GRID_PAGE_PROPS, GRID_SX, noRowsSlot } from '../presentation';
import { useOnlineSalesMobile } from '../useOnlineSalesMobile';

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

function CustomerMobileRow({
  customer,
  onSelect,
}: {
  customer: Customer;
  onSelect: (id: number) => void;
}) {
  return (
    <Box
      component="button"
      type="button"
      onClick={() => onSelect(customer.id)}
      sx={{
        display: 'block',
        width: '100%',
        textAlign: 'left',
        px: 1.5,
        py: 1.25,
        minHeight: 72,
        border: '1.5px solid',
        borderColor: customer.is_active ? 'divider' : 'warning.light',
        borderRadius: 2.5,
        bgcolor: 'background.paper',
        cursor: 'pointer',
        WebkitTapHighlightColor: 'transparent',
        '&:active': { transform: 'scale(0.985)' },
      }}
    >
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.35 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 700 }} noWrap>
          {customer.full_name || 'Unnamed'}
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto', flexShrink: 0 }}>
          {customer.customer_number}
        </Typography>
      </Stack>
      <Typography variant="body2" color="text.secondary" noWrap>
        {customer.email || 'No email'}
        {customer.phone ? ` · ${formatPhone(customer.phone)}` : ''}
      </Typography>
      <Stack direction="row" spacing={0.75} sx={{ mt: 0.75 }}>
        {customer.email_verified ? (
          <Chip size="small" label="Verified" color="success" variant="outlined" />
        ) : (
          <Chip size="small" label="Unverified" variant="outlined" />
        )}
        {!customer.is_active ? (
          <Chip size="small" label="Inactive" color="warning" variant="outlined" />
        ) : null}
      </Stack>
    </Box>
  );
}

export default function DirectoryPanel({ onSelect }: Props) {
  const isMobile = useOnlineSalesMobile();
  const { enqueueSnackbar } = useSnackbar();
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>('1');
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({ ...EMPTY_FORM });
  const createCustomer = useCreateCustomer();

  useEffect(() => {
    const t = window.setTimeout(() => setSearch(searchInput.trim()), 250);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  const listParams = {
    search: search || undefined,
    is_active: activeFilter || undefined,
    ordering: 'customer_number',
  };

  const { data, isLoading, isError } = useCustomers(listParams);

  const rows = data?.results || [];

  const columns: GridColDef<Customer>[] = [
    { field: 'customer_number', headerName: '#', width: 110 },
    {
      field: 'full_name',
      headerName: 'Name',
      flex: 1,
      minWidth: 160,
      renderCell: ({ row }) => (
        <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0 }}>
          <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
            {row.full_name || '-'}
          </Typography>
          {!row.is_active ? <Chip size="small" label="Inactive" color="warning" /> : null}
        </Stack>
      ),
    },
    { field: 'email', headerName: 'Email', flex: 1, minWidth: 180 },
    {
      field: 'phone',
      headerName: 'Phone',
      width: 140,
      valueFormatter: (value) => formatPhone(value as string),
    },
    {
      field: 'email_verified',
      headerName: 'Verified',
      width: 100,
      renderCell: ({ value }) =>
        value ? (
          <Chip size="small" label="Yes" color="success" variant="outlined" />
        ) : (
          <Chip size="small" label="No" variant="outlined" />
        ),
    },
    { field: 'customer_since', headerName: 'Since', width: 110 },
  ];

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

  if (isLoading && !data) return <LoadingScreen message="Loading customers…" />;
  if (isError && !data) {
    return (
      <Typography color="error" variant="body2">
        Could not load customers.
      </Typography>
    );
  }

  return (
    <Box>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={1.5}
        alignItems={{ sm: 'center' }}
        sx={{ mb: 2 }}
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
        rows.length === 0 ? (
          <Stack
            alignItems="center"
            justifyContent="center"
            sx={{
              px: 3,
              py: 6,
              border: '1px dashed',
              borderColor: 'divider',
              borderRadius: 2.5,
            }}
          >
            <Typography variant="body2" color="text.secondary" align="center">
              {search ? 'No customers match this search' : 'No customers yet'}
            </Typography>
          </Stack>
        ) : (
          <Stack spacing={1}>
            {rows.map((row) => (
              <CustomerMobileRow key={row.id} customer={row} onSelect={onSelect} />
            ))}
          </Stack>
        )
      ) : (
        <Box sx={{ height: GRID_HEIGHT }}>
          <DataGrid
            rows={rows}
            columns={columns}
            getRowId={(r) => r.id}
            loading={isLoading}
            disableRowSelectionOnClick
            onRowClick={(params) => onSelect(params.row.id)}
            slots={noRowsSlot(search ? 'No customers match this search' : 'No customers yet')}
            sx={{ ...GRID_SX, cursor: 'pointer' }}
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
