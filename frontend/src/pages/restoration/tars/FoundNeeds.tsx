/**
 * What did you find? (owner, 2026-10-28). Processing says what an item needs when it sends it; Restoration says what it
 * really needed. A quick chip pick when a job is first worked on the bench (prefilled from the request), and the same
 * chips on Finish. Saved as `found_needs` on the job, so the queue's odds and minutes can learn from it later.
 */
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useEffect, useState } from 'react';
import type { RestorationJobDTO, RestorationNeed } from '../../../types/inventory.types';
import { NEED_OPTIONS } from '../../inventory/restorationRequest/restorationRequest';

/** What the chips start from: what was found, else what Processing asked for. */
export function initialFoundNeeds(job: Pick<RestorationJobDTO, 'found_needs' | 'requested_needs'> | null | undefined): RestorationNeed[] {
  if (job?.found_needs?.length) return [...job.found_needs];
  return [...(job?.requested_needs ?? [])];
}

/** The bench asks once per job: only for a request still unanswered. */
export function shouldAskFoundNeeds(
  job: Pick<RestorationJobDTO, 'stage' | 'found_needs' | 'requested_needs' | 'id'> | null | undefined,
  dismissed: ReadonlySet<number>,
): boolean {
  if (!job || job.stage !== 'bench' || dismissed.has(job.id)) return false;
  return (job.requested_needs?.length ?? 0) > 0 && !(job.found_needs?.length ?? 0);
}

export function FoundNeedsChips({
  value,
  onChange,
  disabled,
}: {
  value: RestorationNeed[];
  onChange: (next: RestorationNeed[]) => void;
  disabled?: boolean;
}) {
  return (
    <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
      {NEED_OPTIONS.map((n) => {
        const on = value.includes(n.value);
        return (
          <Chip
            key={n.value}
            label={n.label}
            color={on ? 'primary' : 'default'}
            variant={on ? 'filled' : 'outlined'}
            disabled={disabled}
            onClick={() => onChange(on ? value.filter((v) => v !== n.value) : [...value, n.value])}
          />
        );
      })}
    </Stack>
  );
}

export function FoundNeedsDialog({
  job,
  open,
  busy,
  onSave,
  onLater,
}: {
  job: RestorationJobDTO | null;
  open: boolean;
  busy?: boolean;
  onSave: (found: RestorationNeed[]) => void;
  onLater: () => void;
}) {
  const [found, setFound] = useState<RestorationNeed[]>([]);
  useEffect(() => {
    if (open) setFound(initialFoundNeeds(job));
  }, [open, job]);
  const asked = (job?.requested_needs ?? [])
    .map((n) => NEED_OPTIONS.find((o) => o.value === n)?.label ?? n)
    .join(', ');
  return (
    <Dialog open={open} onClose={busy ? undefined : onLater} fullWidth maxWidth="xs">
      <DialogTitle sx={{ fontWeight: 900, pb: 0.5 }}>What did you find?</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.25 }}>
          {job?.items[0]?.sku ?? job?.sku ?? ''} · Processing asked: {asked || '-'}. Change it to what it really needs.
        </Typography>
        <FoundNeedsChips value={found} onChange={setFound} disabled={busy} />
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onLater} disabled={busy}>Later</Button>
        <Button variant="contained" disabled={busy || found.length === 0} onClick={() => onSave(found)}>
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
}
