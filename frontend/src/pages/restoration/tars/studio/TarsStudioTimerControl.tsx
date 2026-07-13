import PauseCircle from '@mui/icons-material/PauseCircle';
import PlayArrow from '@mui/icons-material/PlayArrow';
import { Box, Button, Typography } from '@mui/material';
import { useEffect, useState } from 'react';
import type { RestorationJobDTO } from '../../../../types/inventory.types';
import { formatElapsed, liveElapsedSeconds } from '../tarsJobAdapter';

export function TarsStudioTimerControl({
  job,
  busy,
  canTrackTime,
  onStart,
  onPause,
}: {
  job: RestorationJobDTO | null;
  busy?: boolean;
  canTrackTime: boolean;
  onStart: () => void;
  onPause: () => void;
}) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const running = Boolean(job?.timer_is_running);

  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => setNowMs(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [job?.id, job?.timer_started_at, running]);

  const seconds = job ? liveElapsedSeconds(job, nowMs) : 0;
  return (
    <Box
      sx={{
        height: 44,
        pl: 1.25,
        pr: 0.5,
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        borderRadius: 1.5,
        bgcolor: running ? '#e8fff8' : '#f1f5f9',
        border: `1px solid ${running ? '#56c5b5' : '#64748b'}`,
        minWidth: { xs: 205, lg: 250 },
      }}
    >
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography
          sx={{
            color: '#0f172a',
            fontFamily: 'monospace',
            fontVariantNumeric: 'tabular-nums',
            fontSize: '1.12rem',
            lineHeight: 1,
            fontWeight: 950,
            letterSpacing: '0.04em',
          }}
        >
          {formatElapsed(seconds)}
        </Typography>
        <Typography
          variant="caption"
          noWrap
          sx={{ display: 'block', color: '#526177', lineHeight: 1.1, mt: 0.25, maxWidth: 120 }}
        >
          {job?.items[0]?.sku ?? job?.sku ?? 'No bench item'}
        </Typography>
      </Box>
      <Button
        variant="contained"
        disabled={busy || !job || (!running && !canTrackTime)}
        onClick={running ? onPause : onStart}
        startIcon={running ? <PauseCircle /> : <PlayArrow />}
        sx={{
          height: 36,
          minWidth: running ? 105 : 112,
          px: 1.25,
          textTransform: 'none',
          fontWeight: 950,
          bgcolor: running ? '#c73535' : '#087b6f',
          color: '#fff',
          boxShadow: 'none',
          '&:hover': { bgcolor: running ? '#a92c2c' : '#06665d', boxShadow: 'none' },
        }}
      >
        {running ? 'Pause' : 'Resume'}
      </Button>
    </Box>
  );
}

