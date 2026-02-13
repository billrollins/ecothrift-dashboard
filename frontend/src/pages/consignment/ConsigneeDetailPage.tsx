import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  Card,
  CardContent,
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
import ArrowBack from '@mui/icons-material/ArrowBack';
import Add from '@mui/icons-material/Add';
import Edit from '@mui/icons-material/Edit';
import Delete from '@mui/icons-material/Delete';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import { useSnackbar } from 'notistack';
import { format } from 'date-fns';
import { PageHeader } from '../../components/common/PageHeader';
import { LoadingScreen } from '../../components/feedback/LoadingScreen';
import { StatusBadge } from '../../components/common/StatusBadge';
import { ConfirmDialog } from '../../components/feedback/ConfirmDialog';
import {
  useConsigneeAccount,
  useUpdateConsigneeAccount,
  useAgreements,
  useCreateAgreement,
  useUpdateAgreement,
  useDeleteAgreement,
} from '../../hooks/useConsignment';
import { formatPhone, maskPhoneInput, stripPhone } from '../../utils/formatPhone';

const DEFAULT_TERMS =
  'Standard consignment terms: Store retains commission as specified. ' +
  'Unsold items may be returned after 90 days. ' +
  'Consignee is responsible for pricing accuracy. ' +
  'Payout processed per store schedule.';

export default function ConsigneeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const numericId = id ? parseInt(id, 10) : null;

  const { data: account, isLoading } = useConsigneeAccount(numericId);
  const updateAccount = useUpdateConsigneeAccount();
  const { data: agreementsData } = useAgreements(
    numericId ? { consignee: account?.id } : undefined,
  );
  const createAgreement = useCreateAgreement();
  const updateAgreement = useUpdateAgreement();
  const deleteAgreementMut = useDeleteAgreement();

  const agreements = agreementsData?.results ?? [];

  // Profile form
  const [profileForm, setProfileForm] = useState({
    commission_rate: '',
    payout_method: 'cash' as string,
    notes: '',
    phone: '',
  });

  useEffect(() => {
    if (account) {
      setProfileForm({
        commission_rate: String(account.commission_rate),
        payout_method: account.payout_method,
        notes: account.notes ?? '',
        phone: account.phone ?? '',
      });
    }
  }, [account]);

  // Agreement create
  const [agreementOpen, setAgreementOpen] = useState(false);
  const [agreementForm, setAgreementForm] = useState({
    commission_rate: '',
    start_date: new Date().toISOString().slice(0, 10),
    end_date: '',
    terms: DEFAULT_TERMS,
  });

  // Agreement edit
  const [editOpen, setEditOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<{ id: number; agreement_number: string } | null>(null);
  const [editForm, setEditForm] = useState({
    commission_rate: '',
    status: 'active' as string,
    end_date: '',
    terms: '',
  });

  // Agreement delete
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; agreement_number: string } | null>(null);

  const handleSaveProfile = async () => {
    if (!numericId) return;
    try {
      await updateAccount.mutateAsync({
        id: numericId,
        data: {
          commission_rate: profileForm.commission_rate,
          payout_method: profileForm.payout_method,
          notes: profileForm.notes,
          phone: profileForm.phone,
        },
      });
      enqueueSnackbar('Profile updated', { variant: 'success' });
    } catch {
      enqueueSnackbar('Failed to update profile', { variant: 'error' });
    }
  };

  const handleOpenNewAgreement = () => {
    setAgreementForm({
      commission_rate: account?.commission_rate ? String(account.commission_rate) : '40',
      start_date: new Date().toISOString().slice(0, 10),
      end_date: '',
      terms: DEFAULT_TERMS,
    });
    setAgreementOpen(true);
  };

  const handleCreateAgreement = async () => {
    if (!account) return;
    try {
      await createAgreement.mutateAsync({
        consignee: account.id,
        commission_rate: String(parseFloat(agreementForm.commission_rate) / 100),
        start_date: agreementForm.start_date,
        end_date: agreementForm.end_date || null,
        terms: agreementForm.terms,
      });
      enqueueSnackbar('Agreement created', { variant: 'success' });
      setAgreementOpen(false);
    } catch {
      enqueueSnackbar('Failed to create agreement', { variant: 'error' });
    }
  };

  const handleOpenEdit = (row: Record<string, unknown>) => {
    setEditTarget({ id: row.id as number, agreement_number: row.agreement_number as string });
    setEditForm({
      commission_rate: String((row.commission_rate as number) * 100),
      status: (row.status as string) ?? 'active',
      end_date: (row.end_date as string) ?? '',
      terms: (row.terms as string) ?? '',
    });
    setEditOpen(true);
  };

  const handleEditAgreement = async () => {
    if (!editTarget) return;
    try {
      await updateAgreement.mutateAsync({
        id: editTarget.id,
        data: {
          commission_rate: String(parseFloat(editForm.commission_rate) / 100),
          status: editForm.status,
          end_date: editForm.end_date || null,
          terms: editForm.terms,
        },
      });
      enqueueSnackbar('Agreement updated', { variant: 'success' });
      setEditOpen(false);
      setEditTarget(null);
    } catch {
      enqueueSnackbar('Failed to update agreement', { variant: 'error' });
    }
  };

  const handleDeleteAgreement = async () => {
    if (!deleteTarget) return;
    try {
      await deleteAgreementMut.mutateAsync(deleteTarget.id);
      enqueueSnackbar('Agreement deleted', { variant: 'success' });
      setDeleteOpen(false);
      setDeleteTarget(null);
    } catch {
      enqueueSnackbar('Failed to delete agreement', { variant: 'error' });
    }
  };

  const agreementColumns: GridColDef[] = [
    { field: 'agreement_number', headerName: 'Agreement #', width: 130 },
    {
      field: 'commission_rate',
      headerName: 'Commission',
      width: 110,
      valueFormatter: (value) => `${((value as number) * 100).toFixed(1)}%`,
    },
    {
      field: 'status',
      headerName: 'Status',
      width: 100,
      renderCell: ({ value }) => <StatusBadge status={value ?? ''} size="small" />,
    },
    {
      field: 'start_date',
      headerName: 'Start',
      width: 110,
      valueFormatter: (value) =>
        value ? format(new Date(value as string), 'MM/dd/yyyy') : '',
    },
    {
      field: 'end_date',
      headerName: 'End',
      width: 110,
      valueFormatter: (value) =>
        value ? format(new Date(value as string), 'MM/dd/yyyy') : '—',
    },
    {
      field: 'actions',
      headerName: 'Actions',
      width: 110,
      sortable: false,
      filterable: false,
      renderCell: ({ row }) => (
        <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center', height: '100%' }}>
          <Tooltip title="Edit">
            <IconButton size="small" onClick={() => handleOpenEdit(row)}>
              <Edit fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Delete">
            <IconButton
              size="small"
              color="error"
              onClick={() => {
                setDeleteTarget({ id: row.id, agreement_number: row.agreement_number });
                setDeleteOpen(true);
              }}
            >
              <Delete fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      ),
    },
  ];

  if (isLoading) return <LoadingScreen message="Loading consignee..." />;
  if (!account) {
    return (
      <Box>
        <PageHeader title="Consignee" />
        <Card>
          <CardContent>Consignee not found.</CardContent>
        </Card>
      </Box>
    );
  }

  return (
    <Box>
      <PageHeader
        title={account.full_name}
        subtitle={`${account.consignee_number}`}
        action={
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            <StatusBadge status={account.status} />
            <Button startIcon={<ArrowBack />} onClick={() => navigate('/consignment/accounts')}>
              Back
            </Button>
          </Box>
        }
      />

      {/* Profile Section */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Account Settings
          </Typography>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, md: 4 }}>
              <TextField
                fullWidth
                label="Email"
                value={account.email}
                disabled
              />
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <TextField
                fullWidth
                label="Phone"
                value={maskPhoneInput(profileForm.phone)}
                onChange={(e) =>
                  setProfileForm((f) => ({ ...f, phone: stripPhone(e.target.value) }))
                }
                placeholder="(555) 123-4567"
              />
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <TextField
                fullWidth
                label="Default Commission Rate (%)"
                type="number"
                value={profileForm.commission_rate}
                onChange={(e) =>
                  setProfileForm((f) => ({ ...f, commission_rate: e.target.value }))
                }
                slotProps={{ input: { inputProps: { min: 0, max: 100, step: 0.1 } } }}
              />
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <TextField
                fullWidth
                select
                label="Payout Method"
                value={profileForm.payout_method}
                onChange={(e) =>
                  setProfileForm((f) => ({ ...f, payout_method: e.target.value }))
                }
              >
                <MenuItem value="cash">Cash</MenuItem>
                <MenuItem value="check">Check</MenuItem>
                <MenuItem value="store_credit">Store Credit</MenuItem>
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, md: 8 }}>
              <TextField
                fullWidth
                label="Notes"
                multiline
                rows={2}
                value={profileForm.notes}
                onChange={(e) =>
                  setProfileForm((f) => ({ ...f, notes: e.target.value }))
                }
              />
            </Grid>
            <Grid size={12}>
              <Button
                variant="contained"
                onClick={handleSaveProfile}
                disabled={updateAccount.isPending}
              >
                {updateAccount.isPending ? 'Saving...' : 'Save'}
              </Button>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Agreements Section */}
      <Card>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h6">Agreements (Drop-offs)</Typography>
            <Button
              variant="outlined"
              startIcon={<Add />}
              onClick={handleOpenNewAgreement}
            >
              New Agreement
            </Button>
          </Box>
          <Box sx={{ height: 350 }}>
            <DataGrid
              rows={agreements}
              columns={agreementColumns}
              getRowId={(row) => row.id}
              pageSizeOptions={[10, 25]}
              initialState={{ pagination: { paginationModel: { pageSize: 10 } } }}
              sx={{ border: 'none' }}
            />
          </Box>
        </CardContent>
      </Card>

      {/* New Agreement Dialog */}
      <Dialog open={agreementOpen} onClose={() => setAgreementOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>New Agreement</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                label="Commission Rate (%)"
                type="number"
                value={agreementForm.commission_rate}
                onChange={(e) =>
                  setAgreementForm((f) => ({ ...f, commission_rate: e.target.value }))
                }
                slotProps={{ input: { inputProps: { min: 0, max: 100, step: 0.1 } } }}
              />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }} />
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                label="Start Date"
                type="date"
                value={agreementForm.start_date}
                onChange={(e) =>
                  setAgreementForm((f) => ({ ...f, start_date: e.target.value }))
                }
                slotProps={{ inputLabel: { shrink: true } }}
              />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                label="End Date"
                type="date"
                value={agreementForm.end_date}
                onChange={(e) =>
                  setAgreementForm((f) => ({ ...f, end_date: e.target.value }))
                }
                slotProps={{ inputLabel: { shrink: true } }}
              />
            </Grid>
            <Grid size={12}>
              <TextField
                fullWidth
                label="Terms"
                multiline
                rows={3}
                value={agreementForm.terms}
                onChange={(e) =>
                  setAgreementForm((f) => ({ ...f, terms: e.target.value }))
                }
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAgreementOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleCreateAgreement}
            disabled={createAgreement.isPending}
          >
            {createAgreement.isPending ? 'Creating...' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Edit Agreement Dialog */}
      <Dialog open={editOpen} onClose={() => setEditOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Edit Agreement — {editTarget?.agreement_number}</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                label="Commission Rate (%)"
                type="number"
                value={editForm.commission_rate}
                onChange={(e) =>
                  setEditForm((f) => ({ ...f, commission_rate: e.target.value }))
                }
                slotProps={{ input: { inputProps: { min: 0, max: 100, step: 0.1 } } }}
              />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                select
                label="Status"
                value={editForm.status}
                onChange={(e) =>
                  setEditForm((f) => ({ ...f, status: e.target.value }))
                }
              >
                <MenuItem value="active">Active</MenuItem>
                <MenuItem value="paused">Paused</MenuItem>
                <MenuItem value="closed">Closed</MenuItem>
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                label="End Date"
                type="date"
                value={editForm.end_date}
                onChange={(e) =>
                  setEditForm((f) => ({ ...f, end_date: e.target.value }))
                }
                slotProps={{ inputLabel: { shrink: true } }}
              />
            </Grid>
            <Grid size={12}>
              <TextField
                fullWidth
                label="Terms"
                multiline
                rows={3}
                value={editForm.terms}
                onChange={(e) =>
                  setEditForm((f) => ({ ...f, terms: e.target.value }))
                }
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleEditAgreement}
            disabled={updateAgreement.isPending}
          >
            {updateAgreement.isPending ? 'Saving...' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Agreement Confirmation */}
      <ConfirmDialog
        open={deleteOpen}
        title="Delete Agreement"
        message={`Delete agreement ${deleteTarget?.agreement_number ?? ''}? This cannot be undone.`}
        confirmLabel="Delete"
        confirmColor="error"
        onConfirm={handleDeleteAgreement}
        onCancel={() => {
          setDeleteOpen(false);
          setDeleteTarget(null);
        }}
        loading={deleteAgreementMut.isPending}
      />
    </Box>
  );
}
