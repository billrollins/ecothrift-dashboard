import { Box, Button, Typography } from '@mui/material';
import type { RoutineRun } from '../../../api/routines.api';
import { dutyColors } from '../../../components/duty/tokens';

export function OwnerCheckGate({
  gate,
  onNudge,
  onAsk,
  onBack,
}: {
  gate: NonNullable<RoutineRun['owner_check']>;
  onNudge: () => void;
  onAsk?: () => void;
  onBack: () => void;
}) {
  return (
    <Box sx={{ p: 3, maxWidth: 420, mx: 'auto' }}>
      <Typography sx={{ fontSize: 16, fontWeight: 750, mb: 1 }}>
        {gate.message || "Owner check for this section isn't done yet."}
      </Typography>
      {gate.reason === 'missed' ? (
        <Typography sx={{ fontSize: 13, color: dutyColors.ink60, mb: 1 }}>Owner check missed.</Typography>
      ) : null}
      {gate.owner_name ? (
        <Typography sx={{ fontSize: 13, color: dutyColors.ink60, mb: 2 }}>
          Owner: {gate.owner_name}
        </Typography>
      ) : null}
      <Box sx={{ display: 'flex', gap: 1 }}>
        <Button variant="outlined" onClick={onNudge} disabled={!gate.tally_run_id && !gate.owner_id}>
          Nudge owner
        </Button>
        {gate.reason === 'blocked' && onAsk ? (
          <Button variant="outlined" onClick={onAsk}>Ask to check first</Button>
        ) : null}
        <Button variant="contained" onClick={onBack}>Go back</Button>
      </Box>
    </Box>
  );
}
