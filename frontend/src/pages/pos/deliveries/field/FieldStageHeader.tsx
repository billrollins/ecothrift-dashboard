import { Box, Chip, LinearProgress, Stack, Typography } from '@mui/material';
import type { DeliveryRun } from '../../../../types/pos.types';
import { FIELD_PHASE_ORDER, fieldStageLabel, formatElapsed, liveElapsedSeconds, normalizeFieldPhase, type FieldStage } from './fieldRunUtils';

type Props = {
  run: DeliveryRun;
  stage: FieldStage;
  tick: number;
};

export function FieldStageHeader({ run, stage, tick }: Props) {
  const phase = normalizeFieldPhase(run.phase);
  const phaseIndex = FIELD_PHASE_ORDER.indexOf(phase);
  const progress = phaseIndex >= 0 ? ((phaseIndex + 1) / FIELD_PHASE_ORDER.length) * 100 : 0;
  const elapsed = liveElapsedSeconds(run, tick);

  return (
    <Box
      sx={{
        position: 'sticky',
        top: 0,
        zIndex: 10,
        bgcolor: 'background.paper',
        borderBottom: 1,
        borderColor: 'divider',
        px: 1.5,
        py: 1,
      }}
    >
      <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1}>
        <Typography variant="subtitle2" fontWeight={700}>
          {fieldStageLabel(stage)}
        </Typography>
        <Chip size="small" label={formatElapsed(elapsed)} color="primary" variant="outlined" />
      </Stack>
      <LinearProgress variant="determinate" value={progress} sx={{ mt: 1, height: 6, borderRadius: 1 }} />
      {run.monitor?.load && (
        <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
          Load {run.monitor.load.ready}/{run.monitor.load.total_items} · Contact{' '}
          {run.monitor.contact.confirmed}/{run.monitor.contact.total}
        </Typography>
      )}
    </Box>
  );
}
