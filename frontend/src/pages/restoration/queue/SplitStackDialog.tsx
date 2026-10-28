/**
 * Split a stack three ways: N equal groups, pull N out, or groups of N.
 *
 * The result is drawn as little stacks before anything happens, so the
 * person sees exactly what Split will make. Every group keeps the stack's
 * decisions; nothing on the card has to be filled in again.
 */
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import { useEffect, useMemo, useState } from 'react';
import type { RestorationJobDTO } from '../../../types/inventory.types';
import { studio } from '../tars/studio/tarsStudioTheme';
import { planSizes, planSplit, SPLIT_MODES, unitCount, type SplitMode, type SplitPlan } from './stackModel';

export function SplitStackDialog({
  job,
  picked,
  accent,
  busy,
  onClose,
  onSplit,
}: {
  job: RestorationJobDTO | null;
  /** Units ticked in the open stack; Pull out takes these. */
  picked: number[];
  accent: string;
  busy?: boolean;
  onClose: () => void;
  onSplit: (plan: SplitPlan) => void;
}) {
  const theme = useTheme();
  const phone = useMediaQuery(theme.breakpoints.down('sm'));
  const [mode, setMode] = useState<SplitMode>(picked.length > 0 ? 'pull' : 'equal');
  const [text, setText] = useState('2');
  const total = job ? unitCount(job) : 0;

  useEffect(() => {
    if (!job) return;
    setMode(picked.length > 0 ? 'pull' : 'equal');
    setText(picked.length > 0 ? String(picked.length) : '2');
  }, [job, picked]);

  const unitIds = useMemo(() => (job?.items ?? []).map((u) => u.id), [job]);
  const usePicked = mode === 'pull' && picked.length > 0;
  const plan = planSplit(unitIds, mode, Number(text), usePicked ? picked : []);
  const ask = SPLIT_MODES.find((m) => m.id === mode)?.ask ?? '';

  return (
    <Dialog open={job != null} onClose={busy ? undefined : onClose} fullScreen={phone} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 950 }}>Split {total} units</DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          <Tabs
            value={mode}
            onChange={(_e, next: SplitMode) => setMode(next)}
            variant="fullWidth"
            aria-label="How to split"
          >
            {SPLIT_MODES.map((m) => (
              <Tab key={m.id} value={m.id} label={m.label} sx={{ fontWeight: 800, textTransform: 'none' }} />
            ))}
          </Tabs>
          <Stack direction="row" spacing={1.5} alignItems="center" sx={{ minHeight: 56 }}>
            <Typography sx={{ fontWeight: 800, flex: 1 }}>{ask}</Typography>
            {usePicked ? (
              <Typography sx={{ fontWeight: 800, color: studio.inkMuted }}>The {picked.length} you ticked</Typography>
            ) : (
              <TextField
                size="small"
                type="number"
                value={text}
                onChange={(e) => setText(e.target.value)}
                inputProps={{ min: 1, max: total, 'aria-label': ask, inputMode: 'numeric' }}
                sx={{ width: 96 }}
              />
            )}
          </Stack>
          <SplitPreview sizes={plan ? planSizes(plan) : null} accent={accent} />
          <Typography sx={{ fontSize: '0.78rem', color: studio.inkMuted }}>
            Every group keeps the destination, scale, prices and note. Groups stay together on the Queue and can be
            stacked back.
          </Typography>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button
          variant="contained"
          disabled={busy || plan == null}
          onClick={() => plan && onSplit(plan)}
          sx={{ fontWeight: 900 }}
        >
          {plan ? `Split into ${plan.groups.length + 1}` : 'Split'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/** The groups Split will make, as small stacks with their counts. Fixed height. */
function SplitPreview({ sizes, accent }: { sizes: number[] | null; accent: string }) {
  return (
    <Box
      aria-label="What Split will make"
      sx={{
        minHeight: 84,
        display: 'flex',
        flexWrap: 'wrap',
        gap: 1.5,
        alignItems: 'center',
        p: 1.25,
        borderRadius: `${studio.radius.md}px`,
        bgcolor: studio.accentSoft,
      }}
    >
      {sizes == null ? (
        <Typography sx={{ color: studio.inkMuted, fontWeight: 700 }}>That would not change the stack.</Typography>
      ) : (
        sizes.map((size, i) => (
          <Box
            key={i}
            sx={{
              width: 52,
              height: 44,
              borderRadius: `${studio.radius.sm}px`,
              border: `1.5px solid ${studio.panelBorder}`,
              borderLeft: `4px solid ${accent}`,
              bgcolor: studio.panel,
              boxShadow:
                size > 1
                  ? `3px 3px 0 -1px ${studio.panel}, 3px 3px 0 0 ${studio.panelBorder}, 6px 6px 0 -1px ${studio.panel}, 6px 6px 0 0 ${studio.panelBorder}`
                  : 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: 'monospace',
              fontWeight: 900,
              color: studio.ink,
            }}
          >
            ×{size}
          </Box>
        ))
      )}
    </Box>
  );
}
