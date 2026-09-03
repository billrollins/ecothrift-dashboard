import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, TextField, Typography } from '@mui/material';
import AddRounded from '@mui/icons-material/AddRounded';
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useSnackbar } from 'notistack';
import { useEffect, useMemo, useState } from 'react';
import type { RoutineAssignee, Section } from '../../../api/routines.api';
import { StatusTag } from '../../../components/duty/StatusTag';
import { dutyColors, thinScrollSx } from '../../../components/duty/tokens';
import {
  useDeleteSection,
  useHardDeleteSection,
  useReorderSections,
  useSaveSection,
  useSections,
} from '../../../hooks/useRoutines';
import { RoutineHeaderButton } from '../../routines/RoutinePaneHeader';
import { AdminSectionRow } from './AdminSectionRow';
import { coverageNote, sectionCoverage } from './sectionCoverage';

/**
 * The floor plan behind the daily tally and the Tuesday cross-check. Every
 * section here becomes somebody's standing job, so an area with no owner is
 * an area nobody ever reports on.
 */
export function AdminSectionsPane({
  departments,
  people,
  showRetired,
}: {
  departments: Array<{ id: number; name: string }>;
  people: RoutineAssignee[];
  showRetired: boolean;
  onShowRetired: (next: boolean) => void;
}) {
  const { enqueueSnackbar } = useSnackbar();
  const [departmentId, setDepartmentId] = useState<number | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [adding, setAdding] = useState('');
  const [pendingDelete, setPendingDelete] = useState<Section | null>(null);

  // Default to Retail, which is the department the QA program was built for.
  useEffect(() => {
    if (departmentId != null || !departments.length) return;
    const retail = departments.find((d) => /retail/i.test(d.name));
    setDepartmentId((retail ?? departments[0]).id);
  }, [departments, departmentId]);

  const sections = useSections({
    department: departmentId ?? undefined,
    includeRetired: showRetired,
  });
  const save = useSaveSection();
  const retire = useDeleteSection();
  const hardDelete = useHardDeleteSection();
  const reorder = useReorderSections();

  const rows = sections.data ?? [];
  const [order, setOrder] = useState<number[]>([]);
  useEffect(() => setOrder(rows.map((row) => row.id)), [sections.data]);

  const byId = useMemo(() => new Map(rows.map((row) => [row.id, row])), [rows]);
  const ordered = order.map((id) => byId.get(id)).filter(Boolean) as Section[];
  const coverage = useMemo(
    () => sectionCoverage(rows, people, departmentId),
    [rows, people, departmentId],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
  );

  async function run(id: number | null, work: () => Promise<unknown>, failure: string) {
    setBusyId(id);
    try {
      await work();
    } catch (err) {
      const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
      enqueueSnackbar(typeof detail === 'string' && detail ? detail : failure, { variant: 'error' });
    } finally {
      setBusyId(null);
    }
  }

  async function addSection() {
    const name = adding.trim();
    if (!name || departmentId == null) return;
    setAdding('');
    await run(null, async () => {
      await save.mutateAsync({ data: { department: departmentId, name, sort_order: rows.length } });
      enqueueSnackbar(`${name} added`, { variant: 'success' });
    }, 'Could not add that section');
  }

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = order.indexOf(Number(active.id));
    const to = order.indexOf(Number(over.id));
    if (from < 0 || to < 0) return;
    const next = arrayMove(order, from, to);
    setOrder(next);
    void run(null, () => reorder.mutateAsync(next), 'Could not save the new order');
  }

  const note = sections.isError
    ? 'Could not load sections.'
    : sections.isLoading
      ? 'Loading the floor plan.'
      : coverageNote(coverage, rows.filter((row) => row.is_active).length);

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', bgcolor: dutyColors.desk }}>
      <Box sx={{ px: 2.5, pt: 1.5, pb: 1 }}>
        <Typography
          noWrap
          sx={{
            minHeight: 18,
            fontSize: 12.5,
            fontWeight: sections.isError ? 600 : 400,
            color: sections.isError ? dutyColors.red : dutyColors.ink60,
            mb: 1,
          }}
        >
          {note}
        </Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <TextField
            select
            size="small"
            value={departmentId ?? ''}
            onChange={(e) => setDepartmentId(Number(e.target.value) || null)}
            sx={{ width: 220, ...LIGHT_FIELD }}
          >
            {departments.map((d) => (
              <MenuItem key={d.id} value={d.id}>{d.name}</MenuItem>
            ))}
          </TextField>
          <TextField
            size="small"
            placeholder="Add a section, then Enter"
            value={adding}
            onChange={(e) => setAdding(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void addSection(); }}
            disabled={departmentId == null}
            sx={{ flex: 1, ...LIGHT_FIELD }}
          />
          <RoutineHeaderButton
            label="Add"
            variant="primary"
            disabled={!adding.trim() || departmentId == null}
            onClick={() => void addSection()}
          />
        </Box>
      </Box>

      <Box sx={{ flex: 1, overflow: 'auto', pt: 0.5, pb: 2, ...thinScrollSx }}>
        <ColumnHeads />
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={order} strategy={verticalListSortingStrategy}>
            {ordered.map((section) => (
              <AdminSectionRow
                key={section.id}
                section={section}
                people={people}
                busy={busyId === section.id}
                onRename={(name) => void run(
                  section.id,
                  () => save.mutateAsync({ id: section.id, data: { name } }),
                  'Could not rename that section',
                )}
                onOwner={(owner) => void run(
                  section.id,
                  () => save.mutateAsync({ id: section.id, data: { owner } }),
                  'Could not change the owner',
                )}
                onRetire={() => void run(
                  section.id,
                  () => retire.mutateAsync(section.id),
                  'Could not retire that section',
                )}
                onRestore={() => void run(
                  section.id,
                  () => save.mutateAsync({ id: section.id, data: { is_active: true } }),
                  'Could not restore that section',
                )}
                onHardDelete={() => setPendingDelete(section)}
              />
            ))}
          </SortableContext>
        </DndContext>

        {!ordered.length ? (
          <Typography sx={{ px: 2.5, py: 2, fontSize: 12.5, color: dutyColors.ink40, minHeight: 20 }}>
            {sections.isLoading ? ' ' : 'No sections in this department yet. Add one above.'}
          </Typography>
        ) : null}

        <Gaps coverage={coverage} loading={sections.isLoading} />
      </Box>

      <Dialog open={pendingDelete != null} onClose={() => setPendingDelete(null)}>
        <DialogTitle>Delete {pendingDelete?.name} forever?</DialogTitle>
        <DialogContent>
          Finished tallies keep the name they were walked under. Open runs for this aisle go with it. There is no undo.
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPendingDelete(null)}>Keep</Button>
          <Button
            color="error"
            disabled={pendingDelete != null && busyId === pendingDelete.id}
            onClick={() => {
              const section = pendingDelete;
              if (!section) return;
              void run(
                section.id,
                async () => {
                  await hardDelete.mutateAsync(section.id);
                  enqueueSnackbar(`${section.name} deleted forever`, { variant: 'success' });
                },
                'Could not delete that section',
              ).finally(() => setPendingDelete(null));
            }}
          >
            Delete forever
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

const LIGHT_FIELD = {
  '& .MuiInputBase-root': {
    height: 36,
    fontSize: 13,
    bgcolor: dutyColors.card,
    borderRadius: '9px',
  },
} as const;

function ColumnHeads() {
  const head = { fontSize: 10.5, fontWeight: 800, letterSpacing: '0.09em', textTransform: 'uppercase' as const, color: dutyColors.ink40 };
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mx: 1.5, mb: 0.75, pl: 3, pr: 1 }}>
      <Typography sx={{ ...head, flex: 1 }}>Section</Typography>
      <Typography sx={{ ...head, width: 210, flexShrink: 0 }}>Owner</Typography>
      <Box sx={{ width: 64, flexShrink: 0 }} />
    </Box>
  );
}

/**
 * Always rendered so answering one gap does not lift the list under the hand
 * that answered it. Silence here is a real answer: the floor is covered.
 */
function Gaps({ coverage, loading }: { coverage: ReturnType<typeof sectionCoverage>; loading: boolean }) {
  const clear = !coverage.orphans.length && !coverage.idle.length;
  return (
    <Box sx={{ mx: 1.5, mt: 2, px: 1.75, py: 1.5, minHeight: 92, borderRadius: '12px', bgcolor: dutyColors.card, border: `1px solid ${dutyColors.ink08}` }}>
      <Typography sx={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.09em', textTransform: 'uppercase', color: dutyColors.ink40 }}>
        Coverage
      </Typography>
      <Typography sx={{ mt: 0.5, fontSize: 13, color: clear ? dutyColors.brandDark : dutyColors.ink, fontWeight: 600 }}>
        {loading
          ? ' '
          : clear
            ? 'Every section has a keeper and everyone keeps one.'
            : 'These will never produce a daily tally.'}
      </Typography>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 1, minHeight: 24 }}>
        {coverage.orphans.map((section) => (
          <StatusTag key={`o-${section.id}`} small label={`${section.name}: no owner`} tone="amber" />
        ))}
        {coverage.idle.map((person) => (
          <StatusTag key={`i-${person.id}`} small label={`${person.full_name}: no section`} tone="plain" />
        ))}
      </Box>
    </Box>
  );
}
