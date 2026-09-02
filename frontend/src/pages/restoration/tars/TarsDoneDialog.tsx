import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type {
  RestorationJobDTO,
  RestorationJobDonePayload,
  RestorationBenchDisposition,
} from '../../../types/inventory.types';
import { JobNotesSlot } from '../../../components/notes/JobNotesSlot';
import { useAuth } from '../../../hooks/useAuth';
import { useRestorationActions, useRestorationJobTimeline } from '../../../hooks/useRestorationBench';
import { JobHistoryList } from '../queue/JobHistoryList';
import {
  filterBenchHistory,
  mergeBenchHistory,
  type TarsHistoryFilter,
} from './tarsBenchHistory';
import { HistoryFilterRows } from './tarsHistoryFilters';
import { GRADE_ROLE } from './tarsGradeRoles';
import { studio } from './studio/tarsStudioTheme';
import type { TarsWorkEvaluation, TarsWorkSession } from './tarsWorkTypes';
import {
  emptyMainOutput,
  emptyPartOutput,
  FINISH_DESTINATIONS,
  finishMainNoteReady,
  lowestGrade,
  type FinishOutputLine,
} from './finishNotes';

const STAT_HEIGHT = 78;
const TAB_BODY_HEIGHT = 520;
const REMOVE_SLOT = 72;

const INTENDED_TO_DESTINATION: Record<string, RestorationBenchDisposition> = {
  shelf: 'processing',
  staff_pick: 'processing',
  online_sales: 'online_sales',
  storage: 'storage',
};

type FinishTab = 'dispatch' | 'notes' | 'actions';

interface TarsDoneDialogProps {
  open: boolean;
  job: RestorationJobDTO | null;
  evaluation: TarsWorkEvaluation | null;
  session?: TarsWorkSession;
  partsCost?: { parts: number; supplies: number; ffe: number };
  cannotUndo?: boolean;
  mode?: 'finish' | 'fix';
  onClose: () => void;
  onSubmit: (payload: RestorationJobDonePayload) => void;
}

function usd(value: number): string {
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function defaultDestination(job: RestorationJobDTO, mode: 'finish' | 'fix'): RestorationBenchDisposition {
  if (mode === 'fix' && job.bench_disposition) {
    return job.bench_disposition;
  }
  const intended = INTENDED_TO_DESTINATION[job.intended_destination ?? ''];
  return intended ?? 'processing';
}

function gradeMoney(job: RestorationJobDTO, grade: string): number | null {
  const raw = job.grade_values?.[grade];
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
}

export function TarsDoneDialog({
  open,
  job,
  evaluation,
  session,
  partsCost,
  mode = 'finish',
  onClose,
  onSubmit,
}: TarsDoneDialogProps) {
  const [tab, setTab] = useState<FinishTab>('dispatch');
  const [startingGrade, setStartingGrade] = useState('');
  const [finalGrade, setFinalGrade] = useState('');
  const [outputs, setOutputs] = useState<FinishOutputLine[]>([emptyMainOutput()]);
  const [editingGrades, setEditingGrades] = useState(false);
  const [historyFilter, setHistoryFilter] = useState<TarsHistoryFilter>('all');
  const { user } = useAuth();

  const actions = useRestorationActions(open ? job?.id : null);
  const timeline = useRestorationJobTimeline(open ? job?.id ?? null : null);
  const gradeOptions = useMemo(
    () =>
      Object.keys(job?.grade_values ?? {}).filter((g) => {
        const value = job?.grade_values?.[g];
        return typeof value === 'number' && Number.isFinite(value);
      }),
    [job],
  );

  const selectedDecision = session?.decisionWork?.selection;
  const knownBySection = partsCost ?? { parts: 0, supplies: 0, ffe: 0 };
  const costTotal = knownBySection.parts + knownBySection.supplies + knownBySection.ffe;
  const itemLabel = job?.items[0]?.sku ?? job?.sku ?? job?.name ?? 'Item';
  const hasActions = (job?.action_count ?? 0) > 0 || (actions.data?.results.length ?? 0) > 0;
  const merged = useMemo(
    () =>
      mergeBenchHistory(
        actions.data?.results ?? [],
        timeline.data ?? [],
        actions.data?.current_action_id ?? job?.current_action ?? null,
      ),
    [actions.data, timeline.data, job?.current_action],
  );
  const historyRows = useMemo(
    () => filterBenchHistory(merged, historyFilter),
    [merged, historyFilter],
  );
  const startMoney = job ? gradeMoney(job, startingGrade) : null;
  const endMoney = job ? gradeMoney(job, finalGrade) : null;
  const valueAdded =
    startMoney != null && endMoney != null ? endMoney - startMoney - costTotal : null;

  useEffect(() => {
    if (!open || !job) return;
    const dest = defaultDestination(job, mode);
    setTab('dispatch');
    setHistoryFilter('all');
    setStartingGrade(
      job.starting_grade ||
        session?.benchPlan?.startingGrade ||
        session?.decisionWork?.condition.currentGrade ||
        lowestGrade(job.grade_values) ||
        '',
    );
    setEditingGrades(false);
    if (mode === 'fix') {
      setFinalGrade(job.final_grade || selectedDecision?.grade || evaluation?.selectedGrade || gradeOptions[0] || '');
      setOutputs([{ ...emptyMainOutput(job.items[0]?.sku ?? job.sku ?? undefined, dest), notes: job.disposition_notes ?? '' }]);
      return;
    }
    setFinalGrade(selectedDecision?.grade ?? evaluation?.selectedGrade ?? gradeOptions[0] ?? '');
    setOutputs([emptyMainOutput(job.items[0]?.sku ?? job.sku ?? undefined, dest)]);
  }, [open, job, evaluation, gradeOptions, selectedDecision?.grade, mode, session]);

  if (!job) return null;

  const main = outputs[0] ?? emptyMainOutput();
  const parts = outputs.filter((row) => row.seq > 0);
  const gradeReady = !hasActions || finalGrade.trim() !== '';
  const canSubmit = finishMainNoteReady(main.notes, hasActions) && gradeReady;

  const handleSubmit = () => {
    if (!canSubmit) return;
    onSubmit({
      destination: main.destination,
      final_grade: finalGrade.trim(),
      starting_grade: startingGrade.trim(),
      notes: main.notes.trim(),
      outputs: outputs
        .filter((row) => row.seq === 0 || row.label.trim() !== '')
        .map((row) => ({
          seq: row.seq,
          label: row.seq === 0 ? itemLabel || 'Whole item' : row.label.trim(),
          notes: row.seq === 0 ? '' : row.notes.trim(),
          destination: row.destination,
        })),
    });
    onClose();
  };

  const title = mode === 'fix' ? 'Fix Finish' : 'Finish';
  const confirmLabel = mode === 'fix' ? 'Save finish' : 'Finish';
  const patchLine = (seq: number, partial: Partial<FinishOutputLine>) =>
    setOutputs((prev) => prev.map((row) => (row.seq === seq ? { ...row, ...partial } : row)));

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ pb: 0.5, fontWeight: 900 }}>{title}</DialogTitle>
      <DialogContent sx={{ pt: 0.5 }}>
        <Tabs
          value={tab}
          onChange={(_event, next: FinishTab) => setTab(next)}
          aria-label="Finish sections"
          sx={{ minHeight: 40, mb: 1, borderBottom: `1px solid ${studio.rule}` }}
        >
          <Tab value="dispatch" label="Dispatch" sx={{ textTransform: 'none', fontWeight: 800, minHeight: 40 }} />
          <Tab value="notes" label="Notes" sx={{ textTransform: 'none', fontWeight: 800, minHeight: 40 }} />
          <Tab value="actions" label="Actions" sx={{ textTransform: 'none', fontWeight: 800, minHeight: 40 }} />
        </Tabs>

        <Box sx={{ height: TAB_BODY_HEIGHT, minHeight: TAB_BODY_HEIGHT, overflow: 'hidden' }}>
          <Box
            role="tabpanel"
            hidden={tab !== 'dispatch'}
            sx={{ height: '100%', overflow: 'auto', display: tab === 'dispatch' ? 'block' : 'none' }}
          >
            <Stack spacing={1.25}>
              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(4, 1fr)' },
                  gap: 1,
                }}
              >
                <StatCard label="Item" value={itemLabel} detail={job.name || '-'} />
                <Box
                  sx={{
                    minHeight: STAT_HEIGHT,
                    p: 1,
                    borderRadius: `${studio.radius.md}px`,
                    border: `1px solid ${studio.panelBorder}`,
                    bgcolor: studio.panel,
                  }}
                >
                  <Typography variant="caption" color="text.secondary" fontWeight={800} display="block">
                    Grade
                  </Typography>
                  {editingGrades ? (
                    <Stack direction="row" spacing={0.5} sx={{ mt: 0.35 }}>
                      <TextField
                        select
                        size="small"
                        label="Original"
                        value={startingGrade}
                        onChange={(e) => setStartingGrade(e.target.value)}
                        sx={{ flex: 1 }}
                      >
                        {gradeOptions.map((g) => (
                          <MenuItem key={g} value={g}>{g}</MenuItem>
                        ))}
                      </TextField>
                      <TextField
                        select
                        size="small"
                        label="Current"
                        value={finalGrade}
                        disabled={Boolean(selectedDecision?.grade)}
                        onChange={(e) => setFinalGrade(e.target.value)}
                        sx={{ flex: 1 }}
                      >
                        {gradeOptions.map((g) => (
                          <MenuItem key={g} value={g}>{g}</MenuItem>
                        ))}
                      </TextField>
                    </Stack>
                  ) : (
                    <Box
                      component="button"
                      type="button"
                      onClick={() => setEditingGrades(true)}
                      sx={{
                        display: 'block',
                        width: '100%',
                        textAlign: 'left',
                        border: 0,
                        bgcolor: 'transparent',
                        p: 0,
                        cursor: 'pointer',
                      }}
                    >
                      <Typography variant="body2" fontWeight={900}>
                        <Box component="span" sx={{ color: GRADE_ROLE.original.ink }}>{startingGrade || '-'}</Box>
                        {' → '}
                        <Box component="span" sx={{ color: GRADE_ROLE.current.ink }}>{finalGrade || '-'}</Box>
                      </Typography>
                      <Typography variant="caption" sx={{ color: studio.inkMuted }}>
                        Click to edit
                      </Typography>
                    </Box>
                  )}
                </Box>
                <StatCard
                  label="Value added"
                  value={valueAdded == null ? '-' : `${valueAdded >= 0 ? '+' : ''}${usd(valueAdded)}`}
                  detail={valueAdded == null ? 'Set grades to see value' : 'After parts and supplies'}
                />
                <StatCard
                  label="Cost"
                  value={usd(costTotal)}
                  detail={`Parts ${usd(knownBySection.parts)} · Supplies ${usd(knownBySection.supplies)} · FFE ${usd(knownBySection.ffe)}`}
                />
              </Box>

              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: `minmax(140px, 1.1fr) minmax(150px, 1fr) minmax(160px, 1.4fr) ${REMOVE_SLOT}px`,
                  gap: 0.75,
                  alignItems: 'center',
                  px: 0.25,
                }}
              >
                <ColHead>Item</ColHead>
                <ColHead>Dispatched to</ColHead>
                <ColHead>Notes for dispatch</ColHead>
                <Box />
              </Box>

              <Typography sx={{ fontSize: '0.68rem', fontWeight: 800, color: studio.inkLabel, letterSpacing: 0.4 }}>
                Main
              </Typography>
              <DispatchRow
                item={
                  <Typography noWrap sx={{ fontWeight: 800, fontSize: '0.84rem', color: studio.ink }} title={itemLabel}>
                    {itemLabel}
                  </Typography>
                }
                destination={main.destination}
                notes={main.notes}
                notesRequired={!hasActions}
                onDestination={(destination) => patchLine(0, { destination })}
                onNotes={(notes) => patchLine(0, { notes })}
              />

              {mode === 'fix' ? null : (
                <>
                  <Box sx={{ borderTop: `1px solid ${studio.rule}`, pt: 1 }}>
                    <Stack direction="row" alignItems="center" justifyContent="space-between">
                      <Typography sx={{ fontSize: '0.68rem', fontWeight: 800, color: studio.inkLabel, letterSpacing: 0.4 }}>
                        Additionals
                      </Typography>
                      <Button
                        size="small"
                        onClick={() =>
                          setOutputs((prev) => [
                            ...prev,
                            emptyPartOutput((prev.at(-1)?.seq ?? 0) + 1, main.destination),
                          ])
                        }
                        sx={{ textTransform: 'none', fontWeight: 800 }}
                      >
                        Add
                      </Button>
                    </Stack>
                  </Box>
                  {parts.map((row) => (
                    <DispatchRow
                      key={row.seq}
                      item={
                        <TextField
                          size="small"
                          fullWidth
                          label="Item"
                          value={row.label}
                          onChange={(e) => patchLine(row.seq, { label: e.target.value })}
                        />
                      }
                      destination={row.destination}
                      notes={row.notes}
                      onDestination={(destination) => patchLine(row.seq, { destination })}
                      onNotes={(notes) => patchLine(row.seq, { notes })}
                      onRemove={() => setOutputs((prev) => prev.filter((line) => line.seq !== row.seq))}
                    />
                  ))}
                </>
              )}
            </Stack>
          </Box>

          <Box
            role="tabpanel"
            hidden={tab !== 'notes'}
            sx={{ height: '100%', overflow: 'auto', display: tab === 'notes' ? 'block' : 'none' }}
          >
            <JobNotesSlot jobId={open ? job.id : null} itemId={job.items[0]?.id ?? null} compose />
          </Box>

          <Box
            role="tabpanel"
            hidden={tab !== 'actions'}
            sx={{
              height: '100%',
              display: tab === 'actions' ? 'flex' : 'none',
              flexDirection: 'column',
              minHeight: 0,
            }}
          >
            <Box sx={{ flexShrink: 0, pb: 1 }}>
              <HistoryFilterRows filter={historyFilter} onFilter={setHistoryFilter} />
            </Box>
            <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
              <JobHistoryList
                rows={historyRows}
                empty={merged.length === 0 ? 'Nothing recorded yet.' : 'Nothing in this history yet.'}
                jobId={open ? job.id : null}
                actions={actions.data?.results ?? []}
                merged={merged}
                currentUserId={user?.id ?? null}
                closed={job.stage === 'done' || job.stage === 'returned'}
              />
            </Box>
          </Box>
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 2, pb: 1.5 }}>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" disabled={!canSubmit} onClick={handleSubmit}>
          {confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function ColHead({ children }: { children: string }) {
  return (
    <Typography
      sx={{
        fontSize: '0.62rem',
        fontWeight: 800,
        letterSpacing: 0.6,
        textTransform: 'uppercase',
        color: studio.inkMuted,
      }}
    >
      {children}
    </Typography>
  );
}

function DispatchRow({
  item,
  destination,
  notes,
  notesRequired,
  onDestination,
  onNotes,
  onRemove,
}: {
  item: ReactNode;
  destination: RestorationBenchDisposition;
  notes: string;
  notesRequired?: boolean;
  onDestination: (value: RestorationBenchDisposition) => void;
  onNotes: (value: string) => void;
  onRemove?: () => void;
}) {
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: `minmax(140px, 1.1fr) minmax(150px, 1fr) minmax(160px, 1.4fr) ${REMOVE_SLOT}px`,
        gap: 0.75,
        alignItems: 'center',
      }}
    >
      <Box sx={{ minWidth: 0 }}>{item}</Box>
      <TextField
        select
        size="small"
        fullWidth
        label="Dispatched to"
        value={destination}
        onChange={(e) => onDestination(e.target.value as RestorationBenchDisposition)}
      >
        {FINISH_DESTINATIONS.map((d) => (
          <MenuItem key={d.value} value={d.value}>
            {d.label}
          </MenuItem>
        ))}
      </TextField>
      <TextField
        size="small"
        fullWidth
        required={notesRequired}
        label="Notes for dispatch"
        value={notes}
        onChange={(e) => onNotes(e.target.value)}
      />
      {onRemove ? (
        <Button size="small" onClick={onRemove} sx={{ textTransform: 'none', minWidth: REMOVE_SLOT }}>
          Remove
        </Button>
      ) : (
        <Box sx={{ width: REMOVE_SLOT }} />
      )}
    </Box>
  );
}

function StatCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <Box
      sx={{
        minHeight: STAT_HEIGHT,
        p: 1,
        borderRadius: `${studio.radius.md}px`,
        border: `1px solid ${studio.panelBorder}`,
        bgcolor: studio.panel,
      }}
    >
      <Typography variant="caption" color="text.secondary" fontWeight={800} display="block">
        {label}
      </Typography>
      <Typography variant="body2" fontWeight={900} noWrap>
        {value}
      </Typography>
      <Typography variant="caption" sx={{ color: studio.inkMuted }} noWrap>
        {detail}
      </Typography>
    </Box>
  );
}
