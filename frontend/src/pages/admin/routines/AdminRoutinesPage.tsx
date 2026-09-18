import { Box, Button, Typography, useMediaQuery, useTheme } from '@mui/material';
import AddRounded from '@mui/icons-material/AddRounded';
import TuneRounded from '@mui/icons-material/TuneRounded';
import { useQuery } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import { useMemo, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { getDepartments, mergeCurrentDepartments } from '../../../api/hr.api';
import type { AdminRoutine } from '../../../api/routines.api';
import { dutyColors } from '../../../components/duty/tokens';
import {
  useAdminRoutines,
  useDeleteRoutine,
  useHardDeleteRoutine,
  useRestoreRoutine,
  useRoutineAssignees,
} from '../../../hooks/useRoutines';
import { RoutineHeaderButton, RoutineHeaderIconButton, RoutinePaneHeader } from '../../routines/RoutinePaneHeader';
import { AdminRoutineInspector } from './AdminRoutineInspector';
import { AdminRoutineList } from './AdminRoutineList';
import { AdminSectionsPane } from './AdminSectionsPane';
import { AdminViewToggle, parseAdminView, type AdminRoutineView } from './AdminViewToggle';
import { DEFAULT_ADMIN_FILTERS, type AdminRoutineFilters } from './adminRoutineFilters';

/** Same width as the Routines page panes, so the two rooms feel like one building. */
const LIST_WIDTH = 'clamp(520px, 48%, 720px)';

function sectionsNote(rows: AdminRoutine[] | undefined) {
  const tally = rows?.find((row) => row.system_key === 'retail.section_tally')?.title || 'Section check';
  const cross = rows?.find((row) => row.system_key === 'retail.section_audit')?.title || 'Cross-check';
  return `The floor plan behind the ${tally} and the ${cross}.`;
}

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
  const [showRetired, setShowRetired] = useState(false);

  if (params.get('view') === 'grades') {
    const day = params.get('day');
    const to = day
      ? `/admin/retail-qa?day=${encodeURIComponent(day)}`
      : '/admin/retail-qa';
    return <Navigate to={to} replace />;
  }

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

  const departmentOptions = useMemo(() => (
    mergeCurrentDepartments(
      departments.data ?? [],
      (routines.data ?? []).flatMap((row) => [
        { id: row.assigned_department, name: row.assigned_department_name },
        ...(row.assigned_department_ids || []).map((id) => ({
          id,
          name: row.assigned_department_name,
        })),
      ]),
    ).map((d) => ({ id: d.id, name: d.name, slug: d.slug }))
  ), [departments.data, routines.data]);

  const headerNote = view === 'routines'
    ? (routines.isError ? 'Could not load routines.' : 'Every routine, including the program ones.')
    : sectionsNote(routines.data);

  const headerActions = view === 'routines' ? (
    <RoutineHeaderIconButton
      label="New routine"
      icon={<AddRounded />}
      onClick={() => navigate('/routines/new')}
    />
  ) : (
    <RoutineHeaderButton
      label={showRetired ? 'Hide retired' : 'Show retired'}
      variant="ghost"
      onClick={() => setShowRetired((on) => !on)}
    />
  );

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
      onEditChecklist={(routine) => navigate(`/routines/${routine.id}/edit`)}
      onRetire={(routine) => void doRetire(routine)}
      onRestore={(routine) => void doRestore(routine)}
      onHardDelete={(routine) => void doHardDelete(routine)}
      busyId={busyId}
    />
  );

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

  const centred = (
    <Box sx={{ height: '100%', overflow: 'auto', bgcolor: dutyColors.desk }}>
      <Box sx={{ maxWidth: 1040, mx: 'auto', height: '100%' }}>
        <AdminSectionsPane
          departments={departmentOptions}
          people={assignees.data ?? []}
          showRetired={showRetired}
          onShowRetired={setShowRetired}
        />
      </Box>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, bgcolor: dutyColors.desk }}>
      <RoutinePaneHeader
        tone="admin"
        eyebrow="Admin"
        title="Routine Control"
        note={headerNote}
        noteIsError={view === 'routines' && routines.isError}
        actions={headerActions}
        below={<AdminViewToggle view={view} onChange={setView} />}
      />
      <Box sx={{ flex: 1, minHeight: 0 }}>
        {view !== 'routines' ? centred : !desktop ? (
          selected ? inspector : list
        ) : (
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
        )}
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
