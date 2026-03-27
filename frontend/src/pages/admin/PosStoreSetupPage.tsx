import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Grid,
  MenuItem,
  Switch,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import Add from '@mui/icons-material/Add';
import Delete from '@mui/icons-material/Delete';
import Edit from '@mui/icons-material/Edit';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import { useSnackbar } from 'notistack';
import { PageHeader } from '../../components/common/PageHeader';
import { LoadingScreen } from '../../components/feedback/LoadingScreen';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import DenominationCounter, { EMPTY_BREAKDOWN, calculateTotal } from '../../components/forms/DenominationCounter';
import {
  useRegisters,
  useCreateRegister,
  useUpdateRegister,
  useDeleteRegister,
  useSupplemental,
  useBootstrapSupplemental,
} from '../../hooks/usePOS';
import {
  useWorkLocations,
  useCreateLocation,
  useUpdateLocation,
  useDeleteLocation,
} from '../../hooks/useStoreLocations';
import type { DenominationBreakdown, Register } from '../../types/pos.types';
import type { WorkLocation } from '../../api/core.api';

const DEFAULT_STARTING_BREAKDOWN: DenominationBreakdown = {
  hundreds: 0,
  fifties: 0,
  twenties: 4,
  tens: 4,
  fives: 8,
  ones: 40,
  quarters: 40,
  dimes: 50,
  nickels: 40,
  pennies: 50,
};

function parseBreakdown(raw: unknown): DenominationBreakdown {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_STARTING_BREAKDOWN };
  const o = raw as Record<string, unknown>;
  const keys = Object.keys(EMPTY_BREAKDOWN) as (keyof DenominationBreakdown)[];
  const out: DenominationBreakdown = { ...EMPTY_BREAKDOWN };
  for (const k of keys) {
    const v = o[k];
    if (typeof v === 'number' && !Number.isNaN(v)) out[k] = v;
  }
  return out;
}

export default function PosStoreSetupPage() {
  const { enqueueSnackbar } = useSnackbar();
  const [tab, setTab] = useState(0);

  const { data: registersData, isLoading: regLoading } = useRegisters({ page_size: 200 });
  const { data: locationsData, isLoading: locLoading } = useWorkLocations();
  const { data: supplemental, isLoading: supLoading } = useSupplemental();
  const bootstrapSupp = useBootstrapSupplemental();

  const registers = registersData?.results ?? [];
  const locations = locationsData?.results ?? [];

  const [suppBootstrapLoc, setSuppBootstrapLoc] = useState<number | ''>('');
  useEffect(() => {
    if (locations.length && suppBootstrapLoc === '') {
      setSuppBootstrapLoc(locations[0].id);
    }
  }, [locations, suppBootstrapLoc]);

  const createReg = useCreateRegister();
  const updateReg = useUpdateRegister();
  const deleteReg = useDeleteRegister();

  const createLoc = useCreateLocation();
  const updateLoc = useUpdateLocation();
  const deleteLoc = useDeleteLocation();

  const [regDialog, setRegDialog] = useState<'add' | 'edit' | null>(null);
  const [editingReg, setEditingReg] = useState<Register | null>(null);
  const [regForm, setRegForm] = useState({
    location: '' as number | '',
    name: '',
    code: '',
    starting_cash: '200',
    is_active: true,
    breakdown: { ...DEFAULT_STARTING_BREAKDOWN } as DenominationBreakdown,
  });

  const [locDialog, setLocDialog] = useState<'add' | 'edit' | null>(null);
  const [editingLoc, setEditingLoc] = useState<WorkLocation | null>(null);
  const [locForm, setLocForm] = useState({
    name: '',
    address: '',
    phone: '',
    timezone: 'America/Chicago',
    is_active: true,
  });

  const [deleteRegId, setDeleteRegId] = useState<number | null>(null);
  const [deleteLocId, setDeleteLocId] = useState<number | null>(null);

  const suppTargetLocationId = useMemo(() => {
    if (suppBootstrapLoc !== '') return suppBootstrapLoc;
    return locations[0]?.id;
  }, [suppBootstrapLoc, locations]);

  const openAddRegister = () => {
    setEditingReg(null);
    setRegForm({
      location: locations[0]?.id ?? '',
      name: '',
      code: '',
      starting_cash: '200',
      is_active: true,
      breakdown: { ...DEFAULT_STARTING_BREAKDOWN },
    });
    setRegDialog('add');
  };

  const openEditRegister = (r: Register) => {
    setEditingReg(r);
    const bd = parseBreakdown(r.starting_breakdown);
    setRegForm({
      location: r.location,
      name: r.name,
      code: r.code,
      starting_cash: String(r.starting_cash ?? '0'),
      is_active: r.is_active,
      breakdown: bd,
    });
    setRegDialog('edit');
  };

  const saveRegister = async () => {
    if (regForm.location === '' || !regForm.name.trim() || !regForm.code.trim()) {
      enqueueSnackbar('Location, name, and code are required.', { variant: 'warning' });
      return;
    }
    const payload: Record<string, unknown> = {
      location: regForm.location,
      name: regForm.name.trim(),
      code: regForm.code.trim(),
      starting_cash: regForm.starting_cash,
      starting_breakdown: regForm.breakdown,
      is_active: regForm.is_active,
    };
    try {
      if (regDialog === 'add') {
        await createReg.mutateAsync(payload);
        enqueueSnackbar('Register created.', { variant: 'success' });
      } else if (editingReg) {
        await updateReg.mutateAsync({ id: editingReg.id, data: payload });
        enqueueSnackbar('Register updated.', { variant: 'success' });
      }
      setRegDialog(null);
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'response' in e
          ? String((e as { response?: { data?: { detail?: unknown } } }).response?.data?.detail ?? e)
          : String(e);
      enqueueSnackbar(msg, { variant: 'error' });
    }
  };

  const openAddLocation = () => {
    setEditingLoc(null);
    setLocForm({
      name: '',
      address: '',
      phone: '',
      timezone: 'America/Chicago',
      is_active: true,
    });
    setLocDialog('add');
  };

  const openEditLocation = (l: WorkLocation) => {
    setEditingLoc(l);
    setLocForm({
      name: l.name,
      address: l.address ?? '',
      phone: l.phone ?? '',
      timezone: l.timezone ?? 'America/Chicago',
      is_active: l.is_active,
    });
    setLocDialog('edit');
  };

  const saveLocation = async () => {
    if (!locForm.name.trim()) {
      enqueueSnackbar('Name is required.', { variant: 'warning' });
      return;
    }
    const payload: Record<string, unknown> = {
      name: locForm.name.trim(),
      address: locForm.address,
      phone: locForm.phone,
      timezone: locForm.timezone,
      is_active: locForm.is_active,
    };
    try {
      if (locDialog === 'add') {
        await createLoc.mutateAsync(payload);
        enqueueSnackbar('Location created.', { variant: 'success' });
      } else if (editingLoc) {
        await updateLoc.mutateAsync({ id: editingLoc.id, data: payload });
        enqueueSnackbar('Location updated.', { variant: 'success' });
      }
      setLocDialog(null);
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'response' in e
          ? String((e as { response?: { data?: { detail?: unknown } } }).response?.data?.detail ?? e)
          : String(e);
      enqueueSnackbar(msg, { variant: 'error' });
    }
  };

  const handleBootstrapSupplemental = async () => {
    if (suppTargetLocationId == null) {
      enqueueSnackbar('Add a store location first.', { variant: 'warning' });
      return;
    }
    try {
      await bootstrapSupp.mutateAsync(suppTargetLocationId);
      enqueueSnackbar('Supplemental drawer is ready.', { variant: 'success' });
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'response' in e
          ? String((e as { response?: { data?: { detail?: unknown } } }).response?.data?.detail ?? e)
          : String(e);
      enqueueSnackbar(msg, { variant: 'error' });
    }
  };

  const regColumns: GridColDef<Register>[] = useMemo(
    () => [
      { field: 'id', headerName: 'ID', width: 70 },
      { field: 'code', headerName: 'Code', width: 100 },
      { field: 'name', headerName: 'Name', flex: 1, minWidth: 140 },
      { field: 'location_name', headerName: 'Location', width: 160 },
      {
        field: 'starting_cash',
        headerName: 'Starting cash',
        width: 120,
        valueFormatter: (value) => (value != null ? `$${Number(value).toFixed(2)}` : ''),
      },
      {
        field: 'is_active',
        headerName: 'Active',
        width: 90,
        type: 'boolean',
      },
      {
        field: 'actions',
        headerName: '',
        width: 160,
        sortable: false,
        renderCell: (params) => (
          <Box sx={{ display: 'flex', gap: 0.5 }}>
            <Button size="small" onClick={() => openEditRegister(params.row)} startIcon={<Edit />}>
              Edit
            </Button>
            <Button size="small" color="error" onClick={() => setDeleteRegId(params.row.id)}>
              <Delete />
            </Button>
          </Box>
        ),
      },
    ],
    [],
  );

  const locColumns: GridColDef<WorkLocation>[] = useMemo(
    () => [
      { field: 'id', headerName: 'ID', width: 70 },
      { field: 'name', headerName: 'Name', flex: 1, minWidth: 160 },
      { field: 'phone', headerName: 'Phone', width: 130 },
      { field: 'timezone', headerName: 'Timezone', width: 160 },
      { field: 'is_active', headerName: 'Active', width: 90, type: 'boolean' },
      {
        field: 'actions',
        headerName: '',
        width: 160,
        sortable: false,
        renderCell: (params) => (
          <Box sx={{ display: 'flex', gap: 0.5 }}>
            <Button size="small" onClick={() => openEditLocation(params.row)} startIcon={<Edit />}>
              Edit
            </Button>
            <Button size="small" color="error" onClick={() => setDeleteLocId(params.row.id)}>
              <Delete />
            </Button>
          </Box>
        ),
      },
    ],
    [],
  );

  const breakdownTotal = calculateTotal(regForm.breakdown);

  if (regLoading || locLoading) {
    return <LoadingScreen message="Loading POS setup…" />;
  }

  return (
    <Box>
      <PageHeader title="POS store setup" subtitle="Manage registers and store locations (Manager / Admin)." />

      <Alert severity="info" sx={{ mb: 2 }}>
        If registers disappeared after a data reset, run{' '}
        <Typography component="span" variant="body2" sx={{ fontFamily: 'monospace' }}>
          python manage.py setup_initial_data
        </Typography>{' '}
        from the repo root, or create registers here. After register IDs change, re-select the register in{' '}
        <strong>POS device config</strong> (browser localStorage) on each terminal.
      </Alert>

      {!supLoading && supplemental == null && locations.length > 0 && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          <Typography variant="body2" gutterBottom>
            No supplemental drawer is available for POS cash operations (or the API cannot find one). Create one for a
            store location, or run <code>setup_initial_data</code>.
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center', mt: 1 }}>
            <TextField
              select
              size="small"
              label="Location"
              value={suppBootstrapLoc === '' ? '' : suppBootstrapLoc}
              onChange={(e) => setSuppBootstrapLoc(Number(e.target.value))}
              sx={{ minWidth: 220 }}
            >
              {locations.map((l) => (
                <MenuItem key={l.id} value={l.id}>
                  {l.name}
                </MenuItem>
              ))}
            </TextField>
            <Button
              variant="contained"
              color="warning"
              onClick={handleBootstrapSupplemental}
              disabled={bootstrapSupp.isPending || suppTargetLocationId == null}
            >
              Create supplemental drawer
            </Button>
          </Box>
        </Alert>
      )}

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab label="Registers" />
        <Tab label="Locations" />
      </Tabs>

      {tab === 0 && (
        <Box>
          <Box sx={{ mb: 2 }}>
            <Button
              variant="contained"
              startIcon={<Add />}
              onClick={openAddRegister}
              disabled={locations.length === 0}
            >
              Add register
            </Button>
          </Box>
          {locations.length === 0 && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              Add a store location first (Locations tab), then create registers.
            </Alert>
          )}
          <Box sx={{ height: 480 }}>
            <DataGrid
              rows={registers}
              columns={regColumns}
              pageSizeOptions={[10, 25, 50]}
              initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
              disableRowSelectionOnClick
              getRowId={(r) => r.id}
              sx={{ border: 'none' }}
            />
          </Box>
        </Box>
      )}

      {tab === 1 && (
        <Box>
          <Box sx={{ mb: 2 }}>
            <Button variant="contained" startIcon={<Add />} onClick={openAddLocation}>
              Add location
            </Button>
          </Box>
          <Box sx={{ height: 480 }}>
            <DataGrid
              rows={locations}
              columns={locColumns}
              pageSizeOptions={[10, 25, 50]}
              initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
              disableRowSelectionOnClick
              getRowId={(r) => r.id}
              sx={{ border: 'none' }}
            />
          </Box>
        </Box>
      )}

      <Dialog open={!!regDialog} onClose={() => setRegDialog(null)} maxWidth="sm" fullWidth>
        <DialogTitle>{regDialog === 'add' ? 'Add register' : 'Edit register'}</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            <Grid size={{ xs: 12 }}>
              <TextField
                select
                fullWidth
                label="Location"
                value={regForm.location === '' ? '' : regForm.location}
                onChange={(e) =>
                  setRegForm((f) => ({ ...f, location: Number(e.target.value) }))
                }
                disabled={locations.length === 0}
              >
                {locations.map((l) => (
                  <MenuItem key={l.id} value={l.id}>
                    {l.name}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                fullWidth
                label="Name"
                value={regForm.name}
                onChange={(e) => setRegForm((f) => ({ ...f, name: e.target.value }))}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                fullWidth
                label="Code (unique)"
                value={regForm.code}
                onChange={(e) => setRegForm((f) => ({ ...f, code: e.target.value }))}
                disabled={regDialog === 'edit'}
                helperText={regDialog === 'edit' ? 'Code is fixed after create.' : ''}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                fullWidth
                label="Starting cash (reference)"
                value={regForm.starting_cash}
                onChange={(e) => setRegForm((f) => ({ ...f, starting_cash: e.target.value }))}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <FormControlLabel
                control={
                  <Switch
                    checked={regForm.is_active}
                    onChange={(e) => setRegForm((f) => ({ ...f, is_active: e.target.checked }))}
                  />
                }
                label="Active"
              />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Starting breakdown — total ${breakdownTotal.toFixed(2)}
              </Typography>
              <DenominationCounter
                value={regForm.breakdown}
                onChange={(breakdown) => setRegForm((f) => ({ ...f, breakdown }))}
                label="Starting breakdown"
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRegDialog(null)}>Cancel</Button>
          <Button variant="contained" onClick={saveRegister} disabled={createReg.isPending || updateReg.isPending}>
            Save
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!locDialog} onClose={() => setLocDialog(null)} maxWidth="sm" fullWidth>
        <DialogTitle>{locDialog === 'add' ? 'Add location' : 'Edit location'}</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            <Grid size={{ xs: 12 }}>
              <TextField
                fullWidth
                label="Name"
                value={locForm.name}
                onChange={(e) => setLocForm((f) => ({ ...f, name: e.target.value }))}
              />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <TextField
                fullWidth
                label="Address"
                multiline
                minRows={2}
                value={locForm.address}
                onChange={(e) => setLocForm((f) => ({ ...f, address: e.target.value }))}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                fullWidth
                label="Phone"
                value={locForm.phone}
                onChange={(e) => setLocForm((f) => ({ ...f, phone: e.target.value }))}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                fullWidth
                label="Timezone"
                value={locForm.timezone}
                onChange={(e) => setLocForm((f) => ({ ...f, timezone: e.target.value }))}
              />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <FormControlLabel
                control={
                  <Switch
                    checked={locForm.is_active}
                    onChange={(e) => setLocForm((f) => ({ ...f, is_active: e.target.checked }))}
                  />
                }
                label="Active"
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setLocDialog(null)}>Cancel</Button>
          <Button variant="contained" onClick={saveLocation} disabled={createLoc.isPending || updateLoc.isPending}>
            Save
          </Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        open={deleteRegId != null}
        title="Delete register?"
        message="This cannot be undone if no drawers reference it. If you see an error, remove dependent data first."
        confirmLabel="Delete"
        severity="error"
        onConfirm={async () => {
          if (deleteRegId == null) return;
          try {
            await deleteReg.mutateAsync(deleteRegId);
            enqueueSnackbar('Register deleted.', { variant: 'success' });
          } catch (e: unknown) {
            const msg =
              e && typeof e === 'object' && 'response' in e
                ? String((e as { response?: { data?: { detail?: unknown } } }).response?.data?.detail ?? e)
                : String(e);
            enqueueSnackbar(msg, { variant: 'error' });
          } finally {
            setDeleteRegId(null);
          }
        }}
        onCancel={() => setDeleteRegId(null)}
      />

      <ConfirmDialog
        open={deleteLocId != null}
        title="Delete location?"
        message="Only allowed if no registers or other records reference this location."
        confirmLabel="Delete"
        severity="error"
        onConfirm={async () => {
          if (deleteLocId == null) return;
          try {
            await deleteLoc.mutateAsync(deleteLocId);
            enqueueSnackbar('Location deleted.', { variant: 'success' });
          } catch (e: unknown) {
            const msg =
              e && typeof e === 'object' && 'response' in e
                ? String((e as { response?: { data?: unknown } }).response?.data ?? e)
                : String(e);
            enqueueSnackbar(msg, { variant: 'error' });
          } finally {
            setDeleteLocId(null);
          }
        }}
        onCancel={() => setDeleteLocId(null)}
      />
    </Box>
  );
}
