import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from '@mui/material';
import DeleteOutline from '@mui/icons-material/DeleteOutline';
import EditOutlined from '@mui/icons-material/EditOutlined';
import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { GroupHeader } from '../../components/duty/GroupHeader';
import { StatusTag } from '../../components/duty/StatusTag';
import { TaskRow, TaskRowAction, TaskRowIcon } from '../../components/duty/TaskRow';
import { dutyColors, thinScrollSx } from '../../components/duty/tokens';
import { useAuth } from '../../hooks/useAuth';
import { useDeleteRoutine, useRoutines } from '../../hooks/useRoutines';
import type { Routine } from '../../api/routines.api';
import { useSnackbar } from 'notistack';
import { groupCatalog } from './groupCatalog';
import { matchesQuery } from './matchesQuery';
import { TRIGGER_LABELS } from './RoutineEditorPane';
import { RoutineListHeader } from './RoutineListHeader';
import { triggerGlyphIcon } from './routineGlyphs';

function friendlyTime(hhmmss: string): string {
  const [h, m] = hhmmss.split(':').map(Number);
  if (Number.isNaN(h)) return '';
  const suffix = h >= 12 ? 'pm' : 'am';
  const hour = h % 12 || 12;
  return `${hour}:${String(m || 0).padStart(2, '0')}${suffix}`;
}

function routineMeta(routine: Routine): string {
  const trigger = TRIGGER_LABELS[routine.trigger] ?? routine.trigger;
  const who = routine.assignment === 'pooled' ? 'pooled' : 'per person';
  const checks = (routine.definition?.sections ?? []).reduce((sum, s) => sum + (s.checks?.length ?? 0), 0);
  const when = routine.trigger === 'on_demand' ? trigger : `${trigger} at ${friendlyTime(routine.due_time || '')}`;
  return `${when} · ${who} · ${checks} check${checks === 1 ? '' : 's'}`;
}

export function CatalogPane({ desktop: _desktop }: { desktop: boolean }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const [params] = useSearchParams();
  const selectedId = Number(params.get('view') || 0) || null;
  const catalog = useRoutines();
  const remove = useDeleteRoutine();
  const canEdit = Boolean(user?.is_superuser);
  const [query, setQuery] = useState('');
  const groups = useMemo(() => {
    const filtered = (catalog.data ?? []).filter((routine) => routine.is_active && matchesQuery(
      query,
      routine.title,
      routine.intro,
      routine.assigned_department_name,
    ));
    return groupCatalog(filtered);
  }, [catalog.data, query]);
  const [pendingDelete, setPendingDelete] = useState<Routine | null>(null);

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', bgcolor: dutyColors.paper }}>
      <RoutineListHeader
        view="catalog"
        onView={(next) => navigate(next === 'catalog' ? '/routines/catalog' : '/routines')}
        eyebrow="All departments"
        note={catalog.isError ? 'Could not load the catalog.' : 'View, edit, or retire any routine.'}
        noteIsError={catalog.isError}
        canCreate={canEdit}
        onCreate={() => navigate('/routines/new')}
        query={query}
        onQuery={setQuery}
      />
      <Box sx={{ flex: 1, overflow: 'auto', pb: 2, ...thinScrollSx }}>
        {groups.length ? groups.map((group) => (
          <Box key={group.name}>
            <GroupHeader title={group.name} count={group.routines.length} />
            {group.routines.map((routine) => (
              <TaskRow
                key={routine.id}
                title={routine.title}
                tone={routine.is_blocking ? 'violet' : 'brand'}
                glyph={triggerGlyphIcon(routine.trigger)}
                meta={routineMeta(routine)}
                selected={selectedId === routine.id}
                onClick={() => navigate(`/routines/catalog?view=${routine.id}`)}
                tags={routine.is_blocking ? <StatusTag small label="Blocking" tone="violet" /> : null}
                actions={(
                  <>
                    <TaskRowAction
                      label="View"
                      primary={selectedId === routine.id}
                      onClick={() => navigate(`/routines/catalog?view=${routine.id}`)}
                    />
                    <TaskRowIcon
                      label="Edit routine"
                      icon={<EditOutlined sx={{ fontSize: 17 }} />}
                      disabled={!canEdit}
                      onClick={() => navigate(`/routines/${routine.id}/edit`)}
                    />
                    <TaskRowIcon
                      label="Delete routine"
                      danger
                      icon={<DeleteOutline sx={{ fontSize: 17 }} />}
                      disabled={!canEdit}
                      onClick={() => setPendingDelete(routine)}
                    />
                  </>
                )}
              />
            ))}
          </Box>
        )) : (
          <Typography sx={{ px: 2.5, py: 2, fontSize: 12.5, color: dutyColors.ink40, minHeight: 20 }}>
            {query.trim() ? 'Nothing matches that filter.' : 'None'}
          </Typography>
        )}
      </Box>
      <Dialog open={Boolean(pendingDelete)} onClose={() => setPendingDelete(null)}>
        <DialogTitle>Delete this routine?</DialogTitle>
        <DialogContent>
          {pendingDelete
            ? `${pendingDelete.title} will leave the catalog and everyone's lists. You can restore it later from Admin.`
            : ' '}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPendingDelete(null)}>Keep</Button>
          <Button
            color="error"
            disabled={remove.isPending}
            onClick={() => {
              if (!pendingDelete) return;
              void remove.mutateAsync(pendingDelete.id).then(() => {
                enqueueSnackbar(`${pendingDelete.title} deleted`, { variant: 'success' });
                setPendingDelete(null);
                if (selectedId === pendingDelete.id) navigate('/routines/catalog');
              }).catch(() => enqueueSnackbar('Could not delete that routine', { variant: 'error' }));
            }}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
