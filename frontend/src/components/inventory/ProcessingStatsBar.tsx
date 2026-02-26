import { Box, Chip, FormControlLabel, Switch, Typography } from '@mui/material';
import AccessTime from '@mui/icons-material/AccessTime';
import Speed from '@mui/icons-material/Speed';
import Timer from '@mui/icons-material/Timer';

interface ProcessingStatsBarProps {
  sessionCheckedIn: number;
  sessionStartTime: number;
  totalPending: number;
  autoAdvance: boolean;
  onAutoAdvanceToggle: (value: boolean) => void;
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hrs = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  if (hrs > 0) return `${hrs}h ${mins}m`;
  return `${mins}m`;
}

export function ProcessingStatsBar({
  sessionCheckedIn,
  sessionStartTime,
  totalPending,
  autoAdvance,
  onAutoAdvanceToggle,
}: ProcessingStatsBarProps) {
  const elapsed = Date.now() - sessionStartTime;
  const elapsedHours = elapsed / 3_600_000;
  const rate = elapsedHours > 0.01 ? Math.round(sessionCheckedIn / elapsedHours) : 0;
  const eta = rate > 0 ? (totalPending / rate) * 3_600_000 : 0;

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        px: 2,
        py: 1,
        bgcolor: 'background.paper',
        borderRadius: 1,
        border: 1,
        borderColor: 'divider',
        flexWrap: 'wrap',
      }}
    >
      <Chip
        icon={<Timer sx={{ fontSize: 16 }} />}
        label={formatDuration(elapsed)}
        size="small"
        variant="outlined"
      />
      {sessionCheckedIn > 0 && (
        <Chip
          icon={<Speed sx={{ fontSize: 16 }} />}
          label={`${rate}/hr`}
          size="small"
          variant="outlined"
        />
      )}
      {eta > 0 && totalPending > 0 && (
        <Chip
          icon={<AccessTime sx={{ fontSize: 16 }} />}
          label={`~${formatDuration(eta)} left`}
          size="small"
          variant="outlined"
        />
      )}
      {sessionCheckedIn > 0 && (
        <Typography variant="caption" color="text.secondary">
          {sessionCheckedIn} checked in this session
        </Typography>
      )}
      <Box sx={{ ml: 'auto' }}>
        <FormControlLabel
          control={
            <Switch
              size="small"
              checked={autoAdvance}
              onChange={(e) => onAutoAdvanceToggle(e.target.checked)}
            />
          }
          label={<Typography variant="caption">Auto-advance</Typography>}
        />
      </Box>
    </Box>
  );
}
