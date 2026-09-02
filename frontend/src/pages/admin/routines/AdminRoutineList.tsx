import { Box, Typography } from '@mui/material';
import AddRounded from '@mui/icons-material/AddRounded';
import ArchiveOutlined from '@mui/icons-material/ArchiveOutlined';
import ChecklistRtlRounded from '@mui/icons-material/ChecklistRtlRounded';
import UnarchiveOutlined from '@mui/icons-material/UnarchiveOutlined';
import { useMemo } from 'react';
import type { AdminRoutine } from '../../../api/routines.api';
import { StatusTag } from '../../../components/duty/StatusTag';
import { TaskRow, TaskRowAction, TaskRowIcon } from '../../../components/duty/TaskRow';
import { dutyColors, thinScrollSx } from '../../../components/duty/tokens';
import { triggerGlyphIcon } from '../../routines/routineGlyphs';
import { RoutineHeaderIconButton, RoutinePaneHeader } from '../../routines/RoutinePaneHeader';
import { AdminRoutineFilterBar } from './AdminRoutineFilterBar';
import { AdminViewToggle, type AdminRoutineView } from './AdminViewToggle';
import { baseRows, flagCounts, visibleRows, type AdminRoutineFilters } from './adminRoutineFilters';
import { presentAdminRoutine } from './presentAdminRoutine';

function summaryNote(rows: AdminRoutine[], shown: number): string {
  const active = rows.filter((r) => r.is_active).length;
  const retired = rows.length - active;
  const overdue = rows.reduce((sum, r) => sum + (r.is_active ? r.stats.overdue : 0), 0);
  const parts = [`${shown} shown`, `${active} active`];
  if (retired) parts.push(`${retired} retired`);
  parts.push(overdue ? `${overdue} overdue run${overdue === 1 ? '' : 's'}` : 'nothing overdue');
  return parts.join(' · ');
}

export function AdminRoutineList({
  rows,
  loading,
  error,
  filters,
  onFilters,
  departments,
  selectedId,
  onSelect,
  onNew,
  onEditChecklist,
  onRetire,
  onRestore,
  onView,
  busyId,
}: {
  rows: AdminRoutine[];
  loading: boolean;
  error: boolean;
  filters: AdminRoutineFilters;
  onFilters: (next: AdminRoutineFilters) => void;
  onView: (view: AdminRoutineView) => void;
  departments: Array<{ id: number; name: string }>;
  selectedId: number | null;
  onSelect: (id: number) => void;
  onNew: () => void;
  onEditChecklist: (routine: AdminRoutine) => void;
  onRetire: (routine: AdminRoutine) => void;
  onRestore: (routine: AdminRoutine) => void;
  /** Row whose retire / restore is in flight; its buttons wait. */
  busyId: number | null;
}) {
  const base = useMemo(() => baseRows(rows, filters), [rows, filters]);
  const counts = useMemo(() => flagCounts(base), [base]);
  const visible = useMemo(() => visibleRows(rows, filters), [rows, filters]);
  const now = new Date();

  const note = error
    ? 'Could not load routines.'
    : loading
      ? 'Loading every routine, retired ones too.'
      : summaryNote(rows, visible.length);

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', bgcolor: dutyColors.paper }}>
      <RoutinePaneHeader
        tone="admin"
        eyebrow="Admin · every department"
        title="Routine Control"
        note={note}
        noteIsError={error}
        actions={(
          <RoutineHeaderIconButton
            label="New routine"
            icon={<AddRounded />}
            onClick={onNew}
          />
        )}
        below={(
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <AdminViewToggle view="routines" onChange={onView} />
            <AdminRoutineFilterBar
              filters={filters}
              onChange={onFilters}
              counts={counts}
              departments={departments}
            />
          </Box>
        )}
      />

      <Box sx={{ flex: 1, overflow: 'auto', pt: 1.5, pb: 2, ...thinScrollSx }}>
        {visible.length ? visible.map((routine) => {
          const shown = presentAdminRoutine(routine, now);
          const selected = selectedId === routine.id;
          const busy = busyId === routine.id;
          return (
            <TaskRow
              key={routine.id}
              title={routine.title}
              tone={shown.tone}
              glyph={triggerGlyphIcon(routine.trigger)}
              meta={shown.meta}
              selected={selected}
              onClick={() => onSelect(routine.id)}
              tags={shown.tags.map((tag) => (
                <StatusTag key={tag.label} small label={tag.label} tone={tag.tone} />
              ))}
              actions={(
                <>
                  <TaskRowAction
                    label="Inspect"
                    primary={selected}
                    onClick={() => onSelect(routine.id)}
                  />
                  <TaskRowIcon
                    label="Edit checklist"
                    icon={<ChecklistRtlRounded sx={{ fontSize: 17 }} />}
                    onClick={() => onEditChecklist(routine)}
                  />
                  {routine.is_active ? (
                    <TaskRowIcon
                      label="Retire — hide from staff, keep the history"
                      danger
                      disabled={busy}
                      icon={<ArchiveOutlined sx={{ fontSize: 17 }} />}
                      onClick={() => onRetire(routine)}
                    />
                  ) : (
                    <TaskRowIcon
                      label="Restore to the catalog"
                      disabled={busy}
                      icon={<UnarchiveOutlined sx={{ fontSize: 17 }} />}
                      onClick={() => onRestore(routine)}
                    />
                  )}
                </>
              )}
            />
          );
        }) : (
          <Typography sx={{ px: 2.5, py: 2, fontSize: 12.5, color: dutyColors.ink40, minHeight: 20 }}>
            {loading
              ? ' '
              : rows.length === 0
                ? 'No routines yet. Create the first one.'
                : filters.status === 'retired' && !filters.query && !filters.flags.length
                  ? 'Nothing retired. Everything is live.'
                  : 'Nothing matches these filters.'}
          </Typography>
        )}
      </Box>
    </Box>
  );
}
