import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Card,
  CardActionArea,
  CardContent,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  IconButton,
  MenuItem,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import MapIcon from '@mui/icons-material/Map';
import { useQuery } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import { getLocations } from '../../api/core.api';
import { useAuth } from '../../contexts/AuthContext';
import {
  useCreateFloorPlan,
  useDeleteFloorPlan,
  useFloorPlans,
  useRenameFloorPlan,
} from '../../hooks/useFloorplans';
import type { FloorPlanListItem } from '../../types/floorplan.types';

export default function FloorplanListPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { enqueueSnackbar } = useSnackbar();
  const canEdit = Boolean(user?.role && ['Manager', 'Admin'].includes(user.role));

  const plansQuery = useFloorPlans();
  const locationsQuery = useQuery({
    queryKey: ['workLocations'],
    queryFn: () => getLocations().then((r) => r.data),
  });
  const createMutation = useCreateFloorPlan();
  const renameMutation = useRenameFloorPlan();
  const deleteMutation = useDeleteFloorPlan();

  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newLocation, setNewLocation] = useState<number | ''>('');
  const [renameTarget, setRenameTarget] = useState<FloorPlanListItem | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<FloorPlanListItem | null>(null);

  const locations = locationsQuery.data?.results ?? [];

  const handleCreate = () => {
    if (!newName.trim() || newLocation === '') return;
    createMutation.mutate(
      { name: newName.trim(), location: newLocation },
      {
        onSuccess: (plan) => {
          setCreateOpen(false);
          setNewName('');
          navigate(`/floor-ops/floorplans/${plan.id}/edit`);
        },
        onError: () => enqueueSnackbar('Failed to create floorplan.', { variant: 'error' }),
      },
    );
  };

  const handleRename = () => {
    if (!renameTarget || !renameValue.trim()) return;
    renameMutation.mutate(
      { id: renameTarget.id, name: renameValue.trim() },
      {
        onSuccess: () => setRenameTarget(null),
        onError: () => enqueueSnackbar('Failed to rename floorplan.', { variant: 'error' }),
      },
    );
  };

  const handleDelete = () => {
    if (!deleteTarget) return;
    deleteMutation.mutate(deleteTarget.id, {
      onSuccess: () => {
        setDeleteTarget(null);
        enqueueSnackbar('Floorplan deleted.', { variant: 'success' });
      },
      onError: () => enqueueSnackbar('Failed to delete floorplan.', { variant: 'error' }),
    });
  };

  return (
    <Box sx={{ p: 3 }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 3 }}>
        <Typography variant="h5" sx={{ fontWeight: 600 }}>Floorplans</Typography>
        {canEdit && (
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setCreateOpen(true)}>
            New floorplan
          </Button>
        )}
      </Stack>

      {plansQuery.isLoading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      )}
      {plansQuery.isError && <Alert severity="error">Failed to load floorplans.</Alert>}

      {plansQuery.data && plansQuery.data.results.length === 0 && (
        <Alert severity="info">
          No floorplans yet.{canEdit ? ' Create one to start laying out a store.' : ''}
        </Alert>
      )}

      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 2 }}>
        {plansQuery.data?.results.map((plan) => (
          <Card key={plan.id} variant="outlined">
            <CardActionArea onClick={() => navigate(`/floor-ops/floorplans/${plan.id}/edit`)}>
              <CardContent>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                  <MapIcon color="action" fontSize="small" />
                  <Typography variant="subtitle1" sx={{ fontWeight: 600 }} noWrap>
                    {plan.name}
                  </Typography>
                </Stack>
                <Typography variant="body2" color="text.secondary">{plan.location_name}</Typography>
                <Typography variant="caption" color="text.secondary">
                  Updated {new Date(plan.updated_at).toLocaleString()}
                </Typography>
              </CardContent>
            </CardActionArea>
            {canEdit && (
              <Stack direction="row" justifyContent="flex-end" sx={{ px: 1, pb: 1 }}>
                <Tooltip title="Rename">
                  <IconButton
                    size="small"
                    aria-label={`Rename ${plan.name}`}
                    onClick={() => {
                      setRenameTarget(plan);
                      setRenameValue(plan.name);
                    }}
                  >
                    <EditIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Delete">
                  <IconButton size="small" color="error" aria-label={`Delete ${plan.name}`} onClick={() => setDeleteTarget(plan)}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Stack>
            )}
          </Card>
        ))}
      </Box>

      {/* Create dialog */}
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>New floorplan</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Plan name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              autoFocus
              fullWidth
            />
            <TextField
              select
              label="Store location"
              value={newLocation}
              onChange={(e) => setNewLocation(Number(e.target.value))}
              fullWidth
            >
              {locations.map((loc) => (
                <MenuItem key={loc.id} value={loc.id}>{loc.name}</MenuItem>
              ))}
            </TextField>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleCreate}
            disabled={!newName.trim() || newLocation === '' || createMutation.isPending}
          >
            Create
          </Button>
        </DialogActions>
      </Dialog>

      {/* Rename dialog */}
      <Dialog open={Boolean(renameTarget)} onClose={() => setRenameTarget(null)} fullWidth maxWidth="xs">
        <DialogTitle>Rename floorplan</DialogTitle>
        <DialogContent>
          <TextField
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            autoFocus
            fullWidth
            sx={{ mt: 1 }}
            onKeyDown={(e) => e.key === 'Enter' && handleRename()}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRenameTarget(null)}>Cancel</Button>
          <Button variant="contained" onClick={handleRename} disabled={!renameValue.trim() || renameMutation.isPending}>
            Rename
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete dialog */}
      <Dialog open={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)}>
        <DialogTitle>Delete floorplan?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            “{deleteTarget?.name}” will be removed from the list. This cannot be undone from the app.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={handleDelete} disabled={deleteMutation.isPending}>
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
