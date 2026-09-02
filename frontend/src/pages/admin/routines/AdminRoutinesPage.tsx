import { Box, Button, Typography, useMediaQuery, useTheme } from '@mui/material';
import TuneRounded from '@mui/icons-material/TuneRounded';
import { useQuery } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getDepartments } from '../../../api/hr.api';
import type { AdminRoutine } from '../../../api/routines.api';
import { dutyColors } from '../../../components/duty/tokens';
import {
  useAdminRoutines,
  useDeleteRoutine,
  useHardDeleteRoutine,
  useRestoreRoutine,
  useRoutineAssignees,
} from '../../../hooks/useRoutines';
import { AdminGradesPane } from './AdminGradesPane';
import { AdminRoutineInspector } from './AdminRoutineInspector';
import { AdminRoutineList } from './AdminRoutineList';
import { AdminSectionsPane } from './AdminSectionsPane';
import { parseAdminView, type AdminRoutineView } from './AdminViewToggle';
import { DEFAULT_ADMIN_FILTERS, type AdminRoutineFilters } from './adminRoutineFilters';

/** Same width as the Routines page panes, so the two rooms feel like one building. */
const LIST_WIDTH = 'clamp(520px, 48%, 720px)';

export default function AdminRoutinesPage() {
  const theme = useTheme();
  const desktop = useMediaQuery(theme.breakpoints.up('md'));
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { enqueueSnackbar, closeSnackbar } = useSnackbar();

  const routines = useAdminRoutines();
  const assignees = useRoutineAssignees();
  const departments = useQuery({
    queryKey: ['hr', 'departments'],
    queryFn: async () => (await getDepartments()).data,
  });
  const retire = useDeleteRoutine();
  const restore = useRestoreRoutine();
  const hardDelete = useHardDeleteRoutine();

  const [filters, setFilters] = useState<AdminRoutineFilters>(DEFAULT_ADMIN_FILTERS);
  const [busyId, setBusyId] = useState<number | null>(null);

  const rows = routines.data ?? [];
  const view = parseAdminView(params.get('view'));
  const selectedId = Number(params.get('id') || 0) || null;
  const selected = selectedId ? rows.find((row) => row.id === selectedId) ?? null : null;

  function select(id: number | null) {
    const next = new URLSearchParams(params);
    if (id) next.set('id', String(id));
    else next.delete('id');
    setParams(next, { replace: false });
  }

  function setView(next: AdminRoutineView) {
    const search = new URLSearchParams(params);
    search.delete('id');
    if (next === 'routines') search.delete('view');
    else search.set('view', next);
    setParams(search, { replace: false });
  }

  async function doRestore(routine: AdminRoutine, quiet = false) {
    setBusyId(routine.id);
    try {
      await restore.mutateAsync(routine.id);
      if (!quiet) enqueueSnackbar(`${routine.title} is back in the catalog`, { variant: 'success' });
    } catch {
      enqueueSnackbar('Could not restore that routine', { variant: 'error' });
    } finally {
      setBusyId(null);
    }
  }

  async function doRetire(routine: AdminRoutine) {
    setBusyId(routine.id);
    try {
      await retire.mutateAsync(routine.id);
      const key = enqueueSnackbar(`${routine.title} retired · hidden from staff, history kept`, {
        variant: 'success',
        autoHideDuration: 6000,
        action: (
          <Button
            size="small"
            sx={{ color: '#fff', fontWeight: 700 }}
            onClick={() => {
              closeSnackbar(key);
              void doRestore(routine, true);
            }}
          >
            Undo
          </Button>
        ),
      });
    } catch {
      enqueueSnackbar('Could not retire that routine', { variant: 'error' });
    } finally {
      setBusyId(null);
    }
  }

  async function doHardDelete(routine: AdminRoutine) {
    setBusyId(routine.id);
    try {
      await hardDelete.mutateAsync(routine.id);
      enqueueSnackbar(`${routine.title} deleted forever`, { variant: 'success' });
      if (selectedId === routine.id) select(null);
    } catch {
      enqueueSnackbar('Could not delete that routine', { variant: 'error' });
    } finally {
      setBusyId(null);
    }
  }

  const departmentOptions = (departments.data ?? []).map((d) => ({ id: d.id, name: d.name }));

  const list = (
    <AdminRoutineList
      rows={rows}
      loading={routines.isLoading}
      error={routines.isError}
      filters={filters}
      onFilters={setFilters}
      departments={departmentOptions}
      selectedId={selectedId}
      onSelect={(id) => select(id)}
      onNew={() => navigate('/routines/new')}
      onEditChecklist={(routine) => navigate(`/routines/${routine.id}/edit`)}
      onRetire={(routine) => void doRetire(routine)}
      onRestore={(routine) => void doRestore(routine)}
      onView={setView}
      busyId={busyId}
    />
  );

  if (view !== 'routines') {
    return (
      <Box sx={{ height: '100%', minHeight: 0, bgcolor: dutyColors.paper }}>
        {view === 'sections' ? (
          <AdminSectionsPane
            view={view}
            onView={setView}
            departments={departmentOptions}
            people={assignees.data ?? []}
          />
        ) : (
          <AdminGradesPane
            view={view}
            onView={setView}
            departments={departmentOptions}
            openOn={params.get('day')}
          />
        )}
      </Box>
    );
  }

  const inspector = selected ? (
    <AdminRoutineInspector
      key={selected.id}
      routine={selected}
      wide={desktop}
      departments={departmentOptions}
      people={assignees.data ?? []}
      onBack={desktop ? undefined : () => select(null)}
      onEditChecklist={() => navigate(`/routines/${selected.id}/edit`)}
      onRetire={() => void doRetire(selected)}
      onRestore={() => void doRestore(selected)}
      onHardDelete={() => doHardDelete(selected)}
      busy={busyId === selected.id}
    />
  ) : (
    <IdleInspector
      count={rows.length}
      missing={Boolean(selectedId) && !routines.isLoading}
    />
  );

  if (!desktop) {
    return (
      <Box sx={{ height: '100%', minHeight: 0, bgcolor: dutyColors.paper }}>
        {selected ? inspector : list}
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', height: '100%', minHeight: 0, bgcolor: dutyColors.desk }}>
      <Box
        sx={{
          flex: `0 0 ${LIST_WIDTH}`,
          minWidth: 0,
          minHeight: 0,
          borderRight: `1px solid ${dutyColors.ink15}`,
        }}
      >
        {list}
      </Box>
      <Box sx={{ flex: 1, minWidth: 0, minHeight: 0 }}>
        {inspector}
      </Box>
    </Box>
  );
}

/** The right pane before a row is picked: quiet, on-brand, says what to do. */
function IdleInspector({ count, missing }: { count: number; missing: boolean }) {
  return (
    <Box
      sx={{
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        p: 4,
        background: `radial-gradient(ellipse at 50% 40%, ${dutyColors.brandTint} 0%, ${dutyColors.desk} 60%)`,
      }}
    >
      <Box sx={{ textAlign: 'center', maxWidth: 320 }}>
        <Box
          sx={{
            width: 56,
            height: 56,
            mx: 'auto',
            mb: 2,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '16px',
            bgcolor: dutyColors.ink,
            color: '#8FD694',
            boxShadow: '0 8px 24px rgba(26,31,28,0.18)',
            '& svg': { fontSize: 26 },
          }}
        >
          <TuneRounded />
        </Box>
        <Typography sx={{ fontSize: 17, fontWeight: 700, color: dutyColors.ink }}>
          {missing ? 'That routine is gone' : 'Pick a routine'}
        </Typography>
        <Typography sx={{ mt: 0.75, fontSize: 13, color: dutyColors.ink60, lineHeight: 1.5, minHeight: 40 }}>
          {missing
            ? 'It was deleted for good. Choose another row on the left.'
            : `Its history, owner, and schedule open here. Quick edits save in place; the checklist itself opens in the editor. ${count ? `${count} to choose from.` : ''}`}
        </Typography>
      </Box>
    </Box>
  );
}
