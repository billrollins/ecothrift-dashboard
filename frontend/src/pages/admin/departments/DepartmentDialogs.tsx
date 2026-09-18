import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  TextField,
  Typography,
} from '@mui/material';
import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import {
  createDepartment,
  DEFAULT_PROGRAM_DEPARTMENT_SLUG,
  programDepartmentSlug,
  updateDepartment,
  type Department,
} from '../../../api/hr.api';
import { getLocations, getSettings } from '../../../api/core.api';
import { useRoutineAssignees } from '../../../hooks/useRoutines';
import { QaIcon } from '../retailqa/QaIcons';
import { ccTokens } from '../../../theme';
import {
  DEPARTMENT_ICONS,
  errorDetail,
  fieldError,
  slugifyName,
} from './departmentUi';

export type DepartmentDialogMode = 'create' | 'edit';

export function DepartmentFormDialog({
  open,
  mode,
  department,
  canEditHard,
  onClose,
  onSaved,
}: {
  open: boolean;
  mode: DepartmentDialogMode;
  department?: Department | null;
  canEditHard: boolean;
  onClose: () => void;
  onSaved: (row: Department) => void;
}) {
  const { enqueueSnackbar } = useSnackbar();
  const settings = useQuery({
    queryKey: ['settings'],
    queryFn: async () => (await getSettings()).data,
    enabled: open,
  });
  const locations = useQuery({
    queryKey: ['locations'],
    queryFn: async () => (await getLocations()).data?.results || [],
    enabled: open,
  });
  const people = useRoutineAssignees();
  const programSlug = programDepartmentSlug(settings.data) || DEFAULT_PROGRAM_DEPARTMENT_SLUG;

  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [icon, setIcon] = useState<(typeof DEPARTMENT_ICONS)[number]>('none');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState<number | ''>('');
  const [manager, setManager] = useState<number | ''>('');
  const [sortOrder, setSortOrder] = useState('0');
  const [nameError, setNameError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(department?.name || '');
    setSlug(department?.slug || '');
    setSlugTouched(Boolean(department?.slug));
    setIcon(department?.icon || 'none');
    setDescription(department?.description || '');
    setLocation(department?.location ?? '');
    setManager(department?.manager ?? '');
    setSortOrder(String(department?.sort_order ?? 0));
    setNameError('');
  }, [open, department]);

  const isProgram = Boolean(department && department.slug === programSlug);

  const payload = useMemo(() => {
    const body: Record<string, unknown> = {
      description: description.trim(),
      location: location === '' ? null : location,
      manager: manager === '' ? null : manager,
    };
    if (canEditHard) {
      body.name = name.trim();
      body.slug = slug.trim();
      body.icon = icon;
      body.sort_order = Number(sortOrder) || 0;
    }
    return body;
  }, [canEditHard, description, icon, location, manager, name, slug, sortOrder]);

  async function save() {
    setSaving(true);
    setNameError('');
    try {
      const result = mode === 'create'
        ? await createDepartment(payload)
        : await updateDepartment(department!.id, payload);
      onSaved(result.data);
      onClose();
    } catch (err) {
      const unique = fieldError(err, 'name');
      if (unique) setNameError(unique);
      else enqueueSnackbar(errorDetail(err, 'Could not save that department'), { variant: 'error' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" data-testid="department-form-dialog">
      <DialogTitle>{mode === 'create' ? 'New department' : `Edit ${department?.name || 'department'}`}</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'grid', gap: 2, pt: 1 }}>
          <TextField
            label="Name"
            value={name}
            onChange={(event) => {
              const next = event.target.value;
              setName(next);
              if (mode === 'create' && !slugTouched) setSlug(slugifyName(next));
            }}
            disabled={!canEditHard}
            error={Boolean(nameError)}
            helperText={nameError}
            autoFocus={canEditHard}
          />
          <TextField
            label="Slug"
            value={slug}
            onChange={(event) => {
              setSlugTouched(true);
              setSlug(event.target.value);
            }}
            disabled={!canEditHard}
            helperText={isProgram && canEditHard
              ? 'Changing the slug affects Command Center grouping and the QA program link'
              : 'Used in the address and Command Center grouping'}
          />
          <FormControl disabled={!canEditHard}>
            <InputLabel shrink>Icon</InputLabel>
            <Select
              label="Icon"
              notched
              value={icon}
              onChange={(event) => setIcon(event.target.value as typeof icon)}
            >
              {DEPARTMENT_ICONS.map((value) => (
                <MenuItem key={value} value={value}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Box sx={{ width: 18, height: 18, color: ccTokens.ink2, '& svg': { width: 18, height: 18, fill: 'none', stroke: 'currentColor', strokeWidth: 2 } }}>
                      <QaIcon name={value} />
                    </Box>
                    {value}
                  </Box>
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField
            label="Description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            multiline
            minRows={2}
            autoFocus={!canEditHard}
          />
          <TextField
            select
            label="Location"
            value={location}
            onChange={(event) => setLocation(event.target.value === '' ? '' : Number(event.target.value))}
          >
            <MenuItem value="">None</MenuItem>
            {(locations.data ?? []).map((row) => (
              <MenuItem key={row.id} value={row.id}>{row.name}</MenuItem>
            ))}
          </TextField>
          <TextField
            select
            label="Manager"
            value={manager}
            onChange={(event) => setManager(event.target.value === '' ? '' : Number(event.target.value))}
          >
            <MenuItem value="">None</MenuItem>
            {(people.data ?? []).map((row) => (
              <MenuItem key={row.id} value={row.id}>{row.full_name}</MenuItem>
            ))}
          </TextField>
          <TextField
            label="Sort order"
            type="number"
            value={sortOrder}
            onChange={(event) => setSortOrder(event.target.value)}
            disabled={!canEditHard}
          />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={() => void save()} disabled={saving || (canEditHard && !name.trim())}>
          {mode === 'create' ? 'Create' : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export function DeactivateDepartmentDialog({
  open,
  department,
  homeCount,
  onClose,
  onConfirm,
}: {
  open: boolean;
  department?: Department | null;
  homeCount: number;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const name = department?.name || 'This department';
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" data-testid="department-deactivate-dialog">
      <DialogTitle>Deactivate {name}?</DialogTitle>
      <DialogContent>
        <Typography sx={{ mb: 1 }}>
          {name} stays on existing records. It disappears from pickers and Command Center.
        </Typography>
        <Typography>
          {homeCount === 1
            ? '1 staff member keeps it as their home department until you reassign them.'
            : `${homeCount} staff keep it as their home department until you reassign them.`}
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button color="warning" variant="contained" onClick={onConfirm}>Deactivate</Button>
      </DialogActions>
    </Dialog>
  );
}

export function DeleteDepartmentDialog({
  open,
  department,
  onClose,
  onConfirm,
  loading,
}: {
  open: boolean;
  department?: Department | null;
  onClose: () => void;
  onConfirm: () => void;
  loading?: boolean;
}) {
  const [typed, setTyped] = useState('');
  useEffect(() => {
    if (open) setTyped('');
  }, [open, department?.id]);
  const name = department?.name || '';
  const matches = typed.trim() === name;
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Delete {name}?</DialogTitle>
      <DialogContent>
        <Typography sx={{ mb: 2 }}>This cannot be undone. Type the department name to confirm.</Typography>
        <TextField
          label="Department name"
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          fullWidth
          autoFocus
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button color="error" variant="contained" disabled={!matches || loading} onClick={onConfirm}>
          Delete
        </Button>
      </DialogActions>
    </Dialog>
  );
}
