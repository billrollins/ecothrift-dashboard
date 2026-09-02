import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from '@mui/material';
import ArrowBackRounded from '@mui/icons-material/ArrowBackRounded';
import ChecklistRtlRounded from '@mui/icons-material/ChecklistRtlRounded';
import { format } from 'date-fns';
import { useSnackbar } from 'notistack';
import { useEffect, useRef, useState } from 'react';
import type { AdminRoutine, RoutineAssignee } from '../../../api/routines.api';
import { dutyColors, thinScrollSx } from '../../../components/duty/tokens';
import { useSaveRoutine } from '../../../hooks/useRoutines';
import { FormSection } from '../../routines/editorStyles';
import { RoutineHeaderButton, RoutineHeaderIconButton, RoutinePaneHeader } from '../../routines/RoutinePaneHeader';
import {
  RoutineSettingsFields,
  sameSettings,
  settingsFromRoutine,
  settingsToPayload,
  type RoutineSettings,
} from '../../routines/RoutineSettingsFields';
import { friendlyStamp, ownerLabel } from './presentAdminRoutine';

export function AdminRoutineInspector({
  routine,
  wide,
  departments,
  people,
  onBack,
  onEditChecklist,
  onRetire,
  onRestore,
  onHardDelete,
  busy,
}: {
  routine: AdminRoutine;
  wide: boolean;
  departments: Array<{ id: number; name: string }>;
  people: RoutineAssignee[];
  /** Phones stack the panes; this returns to the list. */
  onBack?: () => void;
  onEditChecklist: () => void;
  onRetire: () => void;
  onRestore: () => void;
  onHardDelete: () => Promise<void>;
  busy: boolean;
}) {
  const { enqueueSnackbar } = useSnackbar();
  const save = useSaveRoutine();
  const [settings, setSettings] = useState<RoutineSettings>(() => settingsFromRoutine(routine, new Date()));
  const [saved, setSaved] = useState<RoutineSettings>(settings);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Only checklists have questions somebody wrote; the section kinds are code.
  const authored = routine.kind === 'checklist';
  const system = Boolean(routine.system_key);

  // A different row, or a save that came back, resets the form to what the
  // server holds. Unsaved edits survive a retire / restore or someone else's
  // change; the owner decides whether to keep them.
  const lastId = useRef(routine.id);
  useEffect(() => {
    const next = settingsFromRoutine(routine, new Date());
    const switchedRow = lastId.current !== routine.id;
    lastId.current = routine.id;
    setSettings((prev) => (switchedRow || sameSettings(prev, saved) || sameSettings(prev, next) ? next : prev));
    setSaved(next);
    setError('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routine.id, routine.updated_at]);

  const dirty = !sameSettings(settings, saved);
  const canSave = dirty && Boolean(settings.title.trim()) && !save.isPending;

  async function handleSave() {
    if (!canSave) return;
    setError('');
    try {
      await save.mutateAsync({ id: routine.id, data: settingsToPayload(settings) });
      enqueueSnackbar('Saved', { variant: 'success' });
    } catch {
      setError('Could not save. Check the owner and schedule fields.');
    }
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void handleSave();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const note = error
    || (dirty
      ? 'Unsaved changes · Ctrl+S saves'
      : `Created ${routine.created_by_name ? `by ${routine.created_by_name} ` : ''}${format(new Date(routine.created_at), 'MMM d, yyyy')} · updated ${friendlyStamp(routine.updated_at)}`);

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', bgcolor: dutyColors.desk }}>
      <RoutinePaneHeader
        tone="editor"
        eyebrow={routine.is_active ? 'Inspecting' : 'Inspecting · retired'}
        title={settings.title.trim() || 'Untitled routine'}
        note={note}
        noteIsError={Boolean(error)}
        actions={(
          <>
            {onBack ? (
              <RoutineHeaderIconButton label="Back to the list" icon={<ArrowBackRounded />} onClick={onBack} />
            ) : null}
            <RoutineHeaderIconButton
              label={authored
                ? 'Open the checklist editor — sections, checks, and the phone preview'
                : 'This kind has its own runner. There is no checklist to author.'}
              icon={<ChecklistRtlRounded />}
              disabled={!authored}
              onClick={onEditChecklist}
            />
            <Box sx={{ width: 1, height: 22, mx: 0.25, bgcolor: 'rgba(46,125,50,0.22)' }} />
            <RoutineHeaderButton
              label="Reset"
              variant="ghost"
              disabled={!dirty}
              onClick={() => setSettings(saved)}
            />
            <RoutineHeaderButton
              label="Save"
              variant="primary"
              disabled={!canSave}
              onClick={() => void handleSave()}
            />
          </>
        )}
      />

      <Box sx={{ flex: 1, overflow: 'auto', px: wide ? 3 : 0, py: wide ? 3 : 0, pb: wide ? 5 : 0, ...thinScrollSx }}>
        <Box sx={{ maxWidth: 1040, mx: 'auto', display: 'flex', flexDirection: 'column', gap: wide ? 2 : 0 }}>
          <StatStrip routine={routine} wide={wide} />

          <Box
            sx={{
              bgcolor: dutyColors.card,
              border: `1px solid ${dutyColors.ink08}`,
              borderRadius: wide ? '16px' : 0,
              boxShadow: wide ? '0 1px 3px rgba(29,36,64,0.07)' : 'none',
            }}
          >
            <RoutineSettingsFields
              value={settings}
              onChange={(patch) => setSettings((prev) => ({ ...prev, ...patch }))}
              wide={wide}
              departments={departments}
              people={people}
            />

            <FormSection
              wide={wide}
              title="Lifecycle"
              description={system
                ? 'Part of the Retail QA program. Retiring it stops it; it cannot be deleted, because the grade looks it up by name.'
                : routine.is_active
                  ? 'Live in the catalog and on the lists of everyone it is assigned to.'
                  : 'Hidden from staff. Every past run is kept until you delete it for good.'}
            >
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                {routine.is_active ? (
                  <LifecycleButton label="Retire" onClick={onRetire} disabled={busy} />
                ) : (
                  <>
                    <LifecycleButton label="Restore" primary onClick={onRestore} disabled={busy} />
                    <LifecycleButton
                      label="Delete forever"
                      danger
                      onClick={() => setConfirmDelete(true)}
                      disabled={busy || system}
                    />
                  </>
                )}
              </Box>
            </FormSection>
          </Box>
        </Box>
      </Box>

      <Dialog open={confirmDelete} onClose={() => setConfirmDelete(false)}>
        <DialogTitle>Delete {routine.title} forever?</DialogTitle>
        <DialogContent>
          {`Every one of its ${routine.stats.done} completed run${routine.stats.done === 1 ? '' : 's'} goes with it. There is no undo. Retiring already hides it from staff, so only do this to erase the history.`}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDelete(false)}>Keep</Button>
          <Button
            color="error"
            disabled={busy}
            onClick={() => {
              void onHardDelete().finally(() => setConfirmDelete(false));
            }}
          >
            Delete forever
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

/* ------------------------------------------------------------------ stats */

function passRate(routine: AdminRoutine): string {
  const { done, passed } = routine.stats;
  if (!done) return '—';
  return `${Math.round((passed / done) * 100)}%`;
}

function nextDueLabel(routine: AdminRoutine): { value: string; sub: string } {
  if (routine.trigger === 'on_demand') return { value: 'On demand', sub: 'Runs when someone starts it' };
  if (!routine.is_active) return { value: '—', sub: 'Retired routines do not schedule' };
  const at = routine.stats.next_due_at;
  if (!at) return { value: 'Nothing open', sub: 'Next run appears on its day' };
  return { value: friendlyStamp(at), sub: format(new Date(at), 'EEEE h:mmaaa') };
}

/**
 * The numbers an owner asks for first, on ink so they read as instruments
 * rather than form fields. Overdue turns the Open tile red.
 */
function StatStrip({ routine, wide }: { routine: AdminRoutine; wide: boolean }) {
  const { stats } = routine;
  const nextDue = nextDueLabel(routine);
  const last = stats.last_completed_at
    ? { value: friendlyStamp(stats.last_completed_at), sub: stats.last_completed_by_name ? `by ${stats.last_completed_by_name}` : format(new Date(stats.last_completed_at), 'EEEE h:mmaaa') }
    : { value: 'Never', sub: 'No completed run yet' };
  const tiles: Array<{ label: string; value: string; sub: string; hot?: boolean; warn?: boolean }> = [
    { label: 'Performed', value: String(stats.done), sub: stats.missed ? `${stats.missed} missed` : 'completed runs' },
    {
      label: 'Pass rate',
      value: passRate(routine),
      sub: stats.critical_fails ? `${stats.critical_fails} critical fail${stats.critical_fails === 1 ? '' : 's'}` : stats.done ? `${stats.passed} clean` : 'no runs scored',
      warn: stats.critical_fails > 0,
    },
    {
      label: 'Open now',
      value: String(stats.open),
      sub: stats.overdue ? `${stats.overdue} overdue` : stats.open ? 'on time' : 'nothing waiting',
      hot: stats.overdue > 0,
    },
    { label: 'Last performed', value: last.value, sub: last.sub },
    { label: 'Next due', value: nextDue.value, sub: nextDue.sub },
    {
      label: 'Assigned',
      value: stats.assignee_count === 0 ? 'Nobody' : `${stats.assignee_count}`,
      sub: stats.assignee_count === 0 ? 'no one matches the owner rule' : `${ownerLabel(routine)} · ${routine.assignment === 'pooled' ? 'pooled' : 'per person'}`,
      warn: stats.assignee_count === 0 && routine.is_active,
    },
  ];
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: wide ? 'repeat(6, minmax(0, 1fr))' : 'repeat(2, minmax(0, 1fr))',
        gap: '1px',
        bgcolor: 'rgba(255,255,255,0.08)',
        border: `1px solid ${dutyColors.ink}`,
        borderRadius: wide ? '16px' : 0,
        overflow: 'hidden',
        boxShadow: wide ? '0 8px 24px rgba(26,31,28,0.18)' : 'none',
      }}
    >
      {tiles.map((tile) => (
        <Box key={tile.label} sx={{ px: 2, py: 1.75, bgcolor: dutyColors.ink, minWidth: 0 }}>
          <Typography
            sx={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.09em', textTransform: 'uppercase', color: '#8FD694' }}
          >
            {tile.label}
          </Typography>
          <Typography
            noWrap
            sx={{
              mt: 0.5,
              fontSize: 22,
              fontWeight: 700,
              lineHeight: 1.15,
              color: tile.hot ? '#FF9B8A' : '#fff',
            }}
          >
            {tile.value}
          </Typography>
          <Typography
            noWrap
            sx={{
              mt: 0.25,
              fontSize: 11.5,
              minHeight: 16,
              color: tile.hot ? '#FF9B8A' : tile.warn ? dutyColors.amberBg : 'rgba(255,255,255,0.6)',
            }}
          >
            {tile.sub}
          </Typography>
        </Box>
      ))}
    </Box>
  );
}

function LifecycleButton({
  label,
  onClick,
  primary,
  danger,
  disabled,
}: {
  label: string;
  onClick: () => void;
  primary?: boolean;
  danger?: boolean;
  disabled?: boolean;
}) {
  const color = danger ? dutyColors.red : primary ? dutyColors.brand : dutyColors.ink60;
  return (
    <Box
      component="button"
      type="button"
      disabled={disabled}
      onClick={onClick}
      sx={{
        height: 38,
        px: 2,
        font: 'inherit',
        fontSize: 13.5,
        fontWeight: 700,
        cursor: disabled ? 'default' : 'pointer',
        borderRadius: '10px',
        border: `1.5px solid ${primary ? dutyColors.brand : danger ? 'rgba(192,48,28,0.35)' : dutyColors.ink15}`,
        bgcolor: primary ? dutyColors.brand : dutyColors.card,
        color: primary ? '#fff' : color,
        boxShadow: primary ? '0 1px 3px rgba(27,94,32,0.28)' : 'none',
        '&:hover': {
          bgcolor: primary ? dutyColors.brandDark : danger ? 'rgba(192,48,28,0.06)' : dutyColors.brandTint,
          borderColor: primary ? dutyColors.brandDark : danger ? dutyColors.red : dutyColors.brand,
          color: primary ? '#fff' : danger ? dutyColors.red : dutyColors.brandDark,
        },
        '&:disabled': { opacity: 0.5 },
      }}
    >
      {label}
    </Box>
  );
}
