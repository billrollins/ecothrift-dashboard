import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, TextField, Typography } from '@mui/material';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { WorkCycleResponses } from '../../api/routines.api';
import { dutyColors } from '../../components/duty/tokens';
import {
  useLogWorkCyclePrompt,
  useMyRoutineRuns,
  useRoutine,
  useSaveRoutineDraft,
  useStartRoutineSubmission,
} from '../../hooks/useRoutines';
import { idlePromptDue, readLastActivity, writeLastActivity } from './idlePrompt';

const WORK_CYCLE_KEY = 'retail.work_cycle';

/**
 * Idle register prompt. Opens only when the drawer is ready, the idle clock
 * is due, and this person has no work-cycle draft. Overlay, so the cart never
 * moves.
 */
export function WorkCyclePromptDialog({
  terminalState,
  registerId,
}: {
  terminalState: string;
  registerId: number | null;
}) {
  const navigate = useNavigate();
  const { data } = useMyRoutineRuns();
  const workCycle = (data?.on_demand ?? []).find((row) => row.system_key === WORK_CYCLE_KEY);
  const detail = useRoutine(workCycle?.id ?? null);
  const start = useStartRoutineSubmission();
  const saveDraft = useSaveRoutineDraft();
  const logPrompt = useLogWorkCyclePrompt();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<'ask' | 'shelf_section' | 'started'>('ask');
  const [href, setHref] = useState('');
  const [error, setError] = useState('');
  const [nowIso, setNowIso] = useState(() => new Date().toISOString());
  const shownAt = useRef('');

  useEffect(() => {
    const tick = window.setInterval(() => setNowIso(new Date().toISOString()), 10_000);
    return () => window.clearInterval(tick);
  }, []);

  const minutes = data?.idle_prompt_minutes ?? 5;
  const drafts = data?.drafts ?? [];
  const hasDraft = drafts.some((row) => (
    row.kind === 'work_cycle' || (workCycle != null && row.routine === workCycle.id)
  ));
  const last = registerId != null ? readLastActivity(registerId) : null;
  const due = idlePromptDue(last, nowIso, minutes);
  const shouldOffer = terminalState === 'ready' && due && !hasDraft && Boolean(workCycle);

  useEffect(() => {
    if (!shouldOffer || open || step === 'started') return;
    shownAt.current = new Date().toISOString();
    setStep('ask');
    setError('');
    setOpen(true);
  }, [shouldOffer, open, step]);

  function markActivity() {
    if (registerId != null) writeLastActivity(registerId, new Date().toISOString());
  }

  function idleSeconds(): number {
    if (!shownAt.current) return 0;
    const lastMs = last ? Date.parse(last) : Date.parse(shownAt.current);
    return Math.max(0, Math.round((Date.now() - lastMs) / 1000));
  }

  async function begin(mode: 'shelf' | 'non_shelf', section?: { id: number; name: string }) {
    if (!workCycle) return;
    setError('');
    try {
      const draft = await start.mutateAsync({ routine: workCycle.id, mode });
      if (mode === 'shelf' && section) {
        const responses = draft.responses as WorkCycleResponses;
        await saveDraft.mutateAsync({
          id: draft.id,
          responses: {
            ...responses,
            mode: 'shelf',
            shelf: { ...responses.shelf, section_id: section.id, section_name: section.name },
          },
        });
      }
      await logPrompt.mutateAsync({
        outcome: mode,
        idle_seconds: idleSeconds(),
        shown_at: shownAt.current || new Date().toISOString(),
        register: registerId,
        submission: draft.id,
      });
      markActivity();
      setHref(`/routines/run/new?routine=${workCycle.id}&draft=${draft.id}`);
      setStep('started');
    } catch {
      setError('Could not start that walk.');
    }
  }

  async function dismiss() {
    try {
      await logPrompt.mutateAsync({
        outcome: 'dismissed',
        idle_seconds: idleSeconds(),
        shown_at: shownAt.current || new Date().toISOString(),
        register: registerId,
      });
    } catch {
      /* The timer still re-arms; a missed log is better than a stuck dialog. */
    }
    markActivity();
    setOpen(false);
    setStep('ask');
  }

  const sections = detail.data?.runner?.sections ?? [];
  const busy = start.isPending || saveDraft.isPending || logPrompt.isPending;

  return (
    <Dialog open={open} onClose={() => undefined} maxWidth="xs" fullWidth>
      {step === 'started' ? (
        <>
          <DialogTitle>Started</DialogTitle>
          <DialogContent>
            <Typography variant="body2">
              It is in your Routines on any device.
            </Typography>
            <Typography sx={{ mt: 1, fontSize: 12.5, color: dutyColors.ink40, minHeight: 18 }}>
              {error || ' '}
            </Typography>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button onClick={() => { setOpen(false); setStep('ask'); }}>Back to register</Button>
            <Button variant="contained" onClick={() => navigate(href)}>Open here</Button>
          </DialogActions>
        </>
      ) : step === 'shelf_section' ? (
        <>
          <DialogTitle>Which section?</DialogTitle>
          <DialogContent>
            <Typography variant="body2" sx={{ mb: 1.5 }}>
              Pick the aisle you are about to walk.
            </Typography>
            <TextField
              select
              fullWidth
              size="small"
              label="Section"
              value=""
              disabled={busy}
              onChange={(event) => {
                const picked = sections.find((row) => row.id === Number(event.target.value));
                if (picked) void begin('shelf', picked);
              }}
            >
              {sections.map((row) => (
                <MenuItem key={row.id} value={row.id}>{row.name}</MenuItem>
              ))}
            </TextField>
            <Typography sx={{ mt: 1, fontSize: 12.5, color: dutyColors.red, minHeight: 18 }}>
              {error || (sections.length ? ' ' : 'No sections set up yet. Add them in Routine Control, Sections.')}
            </Typography>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button disabled={busy} onClick={() => setStep('ask')}>Back</Button>
            <Button disabled={busy || !sections.length} onClick={() => void begin('shelf')}>
              Start without a section
            </Button>
          </DialogActions>
        </>
      ) : (
        <>
          <DialogTitle>Log a work cycle?</DialogTitle>
          <DialogContent>
            <Typography variant="body2">
              No carts for a few minutes. A shelf check or a non-shelf check now, or dismiss and we will ask again later.
            </Typography>
            <Typography sx={{ mt: 1, fontSize: 12.5, color: dutyColors.red, minHeight: 18 }}>
              {error || ' '}
            </Typography>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2, flexWrap: 'wrap', gap: 1 }}>
            <Button disabled={busy} onClick={() => void dismiss()}>Not now</Button>
            <Box sx={{ flex: 1 }} />
            <Button disabled={busy} onClick={() => setStep('shelf_section')}>Shelf check</Button>
            <Button variant="contained" disabled={busy} onClick={() => void begin('non_shelf')}>
              Non-shelf check
            </Button>
          </DialogActions>
        </>
      )}
    </Dialog>
  );
}
