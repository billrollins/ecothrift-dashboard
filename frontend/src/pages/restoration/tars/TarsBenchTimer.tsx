import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import PlayArrow from '@mui/icons-material/PlayArrow';
import Stop from '@mui/icons-material/Stop';
import Timer from '@mui/icons-material/Timer';
import { useSnackbar } from 'notistack';
import { useEffect, useState } from 'react';
import type { RestorationJobDTO } from '../../../types/inventory.types';
import { formatStopwatch, jobSkuLabel, liveElapsedSeconds } from './tarsJobAdapter';
import { tarsTimerItemPillSx, tarsTokens as eco } from './tarsTokens';

interface TarsBenchTimerProps {
  job: RestorationJobDTO;
  onStart: () => void;
  onPause: () => void;
  busy?: boolean;
  compact?: boolean;
  /** When timer belongs to a different item than the one selected in the main panel. */
  detached?: boolean;
  onSelectRunningItem?: () => void;
  onAdjustSeconds?: (activeSeconds: number) => void | Promise<unknown>;
}

export function TarsBenchTimer({
  job,
  onStart,
  onPause,
  busy,
  compact = false,
  detached = false,
  onSelectRunningItem,
  onAdjustSeconds,
}: TarsBenchTimerProps) {
  const { enqueueSnackbar } = useSnackbar();
  const running = job.timer_is_running;
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustHours, setAdjustHours] = useState('0');
  const [adjustMinutes, setAdjustMinutes] = useState('0');
  const [adjustSeconds, setAdjustSeconds] = useState('0');
  const [pendingAdjustSeconds, setPendingAdjustSeconds] = useState<number | null>(null);

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [running, job.id, job.timer_started_at]);

  const seconds = liveElapsedSeconds(job, nowMs);
  const timeLabel = formatStopwatch(seconds);
  const skuLabel = jobSkuLabel(job);
  const openAdjust = () => {
    const current = liveElapsedSeconds(job, Date.now());
    setAdjustHours(String(Math.floor(current / 3600)));
    setAdjustMinutes(String(Math.floor((current % 3600) / 60)));
    setAdjustSeconds(String(current % 60));
    setAdjustOpen(true);
  };
  const clampInt = (raw: string, max?: number) => {
    const n = Number.parseInt(raw || '0', 10);
    if (!Number.isFinite(n) || n < 0) return 0;
    return max != null ? Math.min(n, max) : n;
  };
  const parsedAdjustSeconds =
    clampInt(adjustHours) * 3600
    + clampInt(adjustMinutes, 59) * 60
    + clampInt(adjustSeconds, 59);
  const requestAdjust = (nextSeconds: number) => {
    setPendingAdjustSeconds(Math.max(Math.floor(nextSeconds), 0));
  };
  const confirmAdjust = async () => {
    if (pendingAdjustSeconds == null) return;
    try {
      await onAdjustSeconds?.(pendingAdjustSeconds);
    } catch (err) {
      enqueueSnackbar(err instanceof Error ? err.message : 'Could not adjust the timer', {
        variant: 'error',
      });
      return;
    }
    setPendingAdjustSeconds(null);
    setAdjustOpen(false);
  };

  const shellSx = {
    borderRadius: compact ? 999 : 2,
    bgcolor: compact ? eco.timerShellBg : '#020617',
    background: compact ? undefined : (running ? eco.timerRunningBg : eco.timerStoppedBg),
    border: compact ? '2px solid' : '1px solid',
    borderColor: compact ? eco.timerShellBorder : eco.greenAlpha72,
    boxShadow: compact ? eco.timerShadow : (
      running ?
        `0 0 0 4px ${eco.greenAlpha12}, 0 16px 40px rgba(2, 6, 23, 0.55)`
      : '0 8px 24px rgba(2, 6, 23, 0.35)'
    ),
  } as const;
  const timerItemPillSx = tarsTimerItemPillSx(running ? 'running' : 'paused');

  if (compact) {
    return (
      <Box
        sx={{
          ...shellSx,
          px: 0.75,
          py: 0.45,
          display: 'grid',
          gridTemplateColumns: 'auto auto minmax(88px, 1fr) auto',
          alignItems: 'center',
          gap: 0.65,
          minWidth: { xs: 300, sm: 430 },
          maxWidth: 'min(100%, 580px)',
          minHeight: 38,
          whiteSpace: 'nowrap',
        }}
      >
        <IconButton
          aria-label="Adjust bench timer"
          size="small"
          disabled={!onAdjustSeconds || busy}
          onClick={openAdjust}
          sx={{
            width: 26,
            height: 26,
            p: 0,
            ml: 0.15,
            mr: 0.35,
            borderRadius: '50%',
            display: 'grid',
            placeItems: 'center',
            bgcolor: '#fff',
            color: eco.timerText,
            border: '1.5px solid',
            borderColor: '#94a3b8',
            boxShadow: '0 1px 2px rgba(15, 23, 42, 0.06)',
            '&:hover': {
              bgcolor: '#f8fafc',
              borderColor: '#94a3b8',
            },
            '&.Mui-disabled': {
              bgcolor: '#f1f5f9',
              color: '#94a3b8',
              borderColor: '#e2e8f0',
            },
          }}
        >
          <Timer sx={{ fontSize: 15 }} />
        </IconButton>

        <Typography
          component="div"
          fontFamily="monospace"
          fontWeight={950}
          sx={{
            fontSize: '1.18rem',
            lineHeight: 1,
            letterSpacing: '0.05em',
            color: eco.timerText,
            fontVariantNumeric: 'tabular-nums',
            mx: 0.35,
            mr: 0.45,
            textShadow: '0 1px 0 rgba(255, 255, 255, 0.8)',
          }}
        >
          {timeLabel}
        </Typography>

        <Button
          size="small"
          variant="text"
          disabled={!onSelectRunningItem}
          onClick={onSelectRunningItem}
          sx={{
            minWidth: 0,
            justifySelf: 'center',
            maxWidth: '100%',
            height: 26,
            px: 0.85,
            py: 0,
            borderRadius: 999,
            color: timerItemPillSx.color,
            bgcolor: timerItemPillSx.bgcolor,
            border: '1.5px solid',
            borderColor: timerItemPillSx.borderColor,
            boxShadow: timerItemPillSx.boxShadow,
            textTransform: 'none',
            fontSize: '0.7rem',
            fontWeight: 800,
            '&.Mui-disabled': {
              color: timerItemPillSx.color,
              bgcolor: timerItemPillSx.bgcolor,
              borderColor: timerItemPillSx.borderColor,
              opacity: 1,
            },
            '&:hover': {
              bgcolor: timerItemPillSx.bgcolor,
              borderColor: timerItemPillSx.borderColor,
            },
          }}
        >
          <Box
            component="span"
            sx={{
              width: 5,
              height: 5,
              borderRadius: '50%',
              bgcolor: timerItemPillSx.dotColor,
              flexShrink: 0,
              mr: 0.55,
            }}
          />
          <Typography
            component="span"
            title={skuLabel}
            sx={{
              minWidth: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              fontFamily: 'monospace',
              fontWeight: 800,
              lineHeight: 1,
              color: 'inherit',
            }}
          >
            {skuLabel}
          </Typography>
        </Button>

        <Button
          size="small"
          variant="contained"
          disabled={busy}
          onClick={() => (running ? onPause() : onStart())}
          startIcon={running ? <Stop /> : <PlayArrow />}
          sx={{
            minHeight: 26,
            px: 0.85,
            py: 0,
            mr: 0.15,
            borderRadius: 999,
            fontSize: '0.72rem',
            fontWeight: 900,
            color: '#fff',
            bgcolor: eco.green,
            boxShadow: '0 1px 3px rgba(27, 94, 32, 0.35)',
            justifySelf: 'end',
            '&:hover': { bgcolor: eco.greenDark, boxShadow: 'none' },
            '&.Mui-disabled': { bgcolor: '#cbd5e1', color: '#fff' },
            '& .MuiButton-startIcon': { mr: 0.25, '& svg': { fontSize: 15 } },
          }}
        >
          {running ? 'Stop' : 'Start'}
        </Button>
        <Dialog
          open={adjustOpen}
          onClose={() => {
            if (pendingAdjustSeconds == null) setAdjustOpen(false);
          }}
          fullWidth
          maxWidth="xs"
        >
          <DialogTitle>Adjust Bench Timer</DialogTitle>
          <DialogContent>
            <Stack spacing={1.5} sx={{ pt: 0.5 }}>
              <Typography variant="body2" color="text.secondary">
                Reset the timer or set the elapsed work time.
              </Typography>
              <Stack direction="row" spacing={1}>
                <TextField
                  label="Hours"
                  type="number"
                  size="small"
                  value={adjustHours}
                  onChange={(e) => setAdjustHours(e.target.value)}
                  slotProps={{ htmlInput: { min: 0 } }}
                />
                <TextField
                  label="Minutes"
                  type="number"
                  size="small"
                  value={adjustMinutes}
                  onChange={(e) => setAdjustMinutes(e.target.value)}
                  slotProps={{ htmlInput: { min: 0, max: 59 } }}
                />
                <TextField
                  label="Seconds"
                  type="number"
                  size="small"
                  value={adjustSeconds}
                  onChange={(e) => setAdjustSeconds(e.target.value)}
                  slotProps={{ htmlInput: { min: 0, max: 59 } }}
                />
              </Stack>
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button color="inherit" onClick={() => setAdjustOpen(false)}>
              Cancel
            </Button>
            <Button color="warning" disabled={busy} onClick={() => requestAdjust(0)}>
              Reset
            </Button>
            <Button variant="contained" disabled={busy} onClick={() => requestAdjust(parsedAdjustSeconds)}>
              Save
            </Button>
          </DialogActions>
        </Dialog>
        <Dialog open={pendingAdjustSeconds != null} onClose={() => setPendingAdjustSeconds(null)} fullWidth maxWidth="xs">
          <DialogTitle>Confirm Timer Edit</DialogTitle>
          <DialogContent>
            <Stack spacing={1}>
              <Typography variant="body2">
                Change this bench timer from {formatStopwatch(seconds)} to{' '}
                <strong>{formatStopwatch(pendingAdjustSeconds ?? 0)}</strong>?
              </Typography>
              <Typography variant="caption" color="text.secondary">
                This updates the saved work time for {skuLabel}.
              </Typography>
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button color="inherit" disabled={busy} onClick={() => setPendingAdjustSeconds(null)}>
              Cancel
            </Button>
            <Button variant="contained" color="warning" disabled={busy} onClick={() => void confirmAdjust()}>
              Confirm edit
            </Button>
          </DialogActions>
        </Dialog>
      </Box>
    );
  }

  return (
    <Box sx={shellSx}>
      <Box sx={{ px: { xs: 2, sm: 3 }, py: { xs: 1.5, sm: 2 } }}>
        <Stack spacing={1.25} alignItems="center" textAlign="center">
          <Stack direction="row" spacing={1} alignItems="center" justifyContent="center" flexWrap="wrap">
            <Timer sx={{ fontSize: 28, color: running ? eco.greenLight : '#94a3b8' }} />
            <Typography
              variant="overline"
              sx={{ color: '#94a3b8', fontWeight: 900, letterSpacing: '0.12em', lineHeight: 1.2 }}
            >
              {detached ? 'Timer on another item' : 'Bench timer'}
            </Typography>
            <Chip
              label={running ? 'Running' : 'Paused'}
              size="small"
              sx={{
                height: 24,
                fontWeight: 900,
                ...(running ?
                  {
                    bgcolor: eco.greenAlpha22,
                    color: eco.greenTextBright,
                    border: '1px solid',
                    borderColor: eco.greenAlpha50,
                  }
                : {
                    bgcolor: '#f1f5f9',
                    color: '#64748b',
                    border: '1px solid',
                    borderColor: '#cbd5e1',
                  }),
              }}
            />
          </Stack>

          <Typography
            component="div"
            fontFamily="monospace"
            fontWeight={900}
            sx={{
              fontSize: { xs: '3rem', sm: '4rem', md: '4.5rem' },
              lineHeight: 1,
              letterSpacing: '0.06em',
              color: running ? '#f8fafc' : '#e2e8f0',
              fontVariantNumeric: 'tabular-nums',
              userSelect: 'none',
              textShadow: running ? '0 0 28px rgba(74, 222, 128, 0.35)' : 'none',
            }}
          >
            {timeLabel}
          </Typography>

          <Box
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              px: 1,
              py: 0.25,
              borderRadius: 999,
              bgcolor: timerItemPillSx.bgcolor,
              color: timerItemPillSx.color,
              border: '1px solid',
              borderColor: timerItemPillSx.borderColor,
              fontFamily: 'monospace',
              fontWeight: 800,
              fontSize: '0.78rem',
              lineHeight: 1.2,
            }}
          >
            {skuLabel}
          </Box>

          <Stack direction="row" spacing={1} flexWrap="wrap" justifyContent="center">
            {detached && onSelectRunningItem ?
              <Button size="small" variant="outlined" onClick={onSelectRunningItem} sx={{ fontWeight: 800 }}>
                Select running item
              </Button>
            : null}
            <Button
              variant="contained"
              size="large"
              disabled={busy}
              onClick={() => (running ? onPause() : onStart())}
              startIcon={running ? <Stop /> : <PlayArrow />}
              sx={{
                minWidth: 168,
                minHeight: 48,
                fontWeight: 900,
                bgcolor: running ? '#b45309' : eco.greenDark,
                '&:hover': { bgcolor: running ? '#92400e' : eco.greenDarker },
              }}
            >
              {running ? 'Stop timer' : 'Start timer'}
            </Button>
          </Stack>
        </Stack>
      </Box>
    </Box>
  );
}
