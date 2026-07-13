import Inbox from '@mui/icons-material/Inbox';
import PauseCircle from '@mui/icons-material/PauseCircle';
import PlayArrow from '@mui/icons-material/PlayArrow';
import QrCodeScanner from '@mui/icons-material/QrCodeScanner';
import Build from '@mui/icons-material/Build';
import { Box, Chip, IconButton, Stack, TextField, Typography } from '@mui/material';
import type { ReactNode } from 'react';
import type { RestorationJobDTO } from '../../../../types/inventory.types';
import { formatElapsed } from '../tarsJobAdapter';
import { studio } from './tarsStudioTheme';

export type StudioLane = 'inbox' | 'bench' | 'pending';

export const STUDIO_LANES: Array<{ id: StudioLane; label: string; icon: ReactNode }> = [
  { id: 'inbox', label: 'Inbox', icon: <Inbox sx={{ fontSize: 16 }} /> },
  { id: 'bench', label: 'Bench', icon: <Build sx={{ fontSize: 16 }} /> },
  { id: 'pending', label: 'Pending', icon: <PauseCircle sx={{ fontSize: 16 }} /> },
];

export function TarsStudioShell({
  lane,
  onLaneChange,
  counts,
  scanValue,
  onScanChange,
  onScanSubmit,
  scanInputRef,
  timerSlot,
  children,
}: {
  lane: StudioLane;
  onLaneChange: (lane: StudioLane) => void;
  counts: Record<StudioLane, number>;
  scanValue: string;
  onScanChange: (value: string) => void;
  onScanSubmit: () => void;
  scanInputRef?: React.RefObject<HTMLInputElement | null>;
  timerSlot?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Box
      sx={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        bgcolor: studio.canvas,
        color: studio.heroOnDark,
        overflow: 'hidden',
      }}
    >
      <Box
        sx={{
          px: 1,
          py: 0.65,
          borderBottom: `1px solid ${studio.railBorder}`,
          bgcolor: studio.panel,
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          flexWrap: 'wrap',
        }}
      >
        <Typography variant="subtitle2" sx={{ fontWeight: 900, color: studio.accentDark, mr: 0.5 }}>
          TARS
        </Typography>
        <Stack direction="row" gap={0.5}>
          {STUDIO_LANES.map((entry) => {
            const active = lane === entry.id;
            return (
              <Chip
                key={entry.id}
                size="small"
                icon={entry.icon as React.ReactElement}
                label={`${entry.label} ${counts[entry.id]}`}
                clickable
                onClick={() => onLaneChange(entry.id)}
                sx={{
                  height: 28,
                  fontWeight: 800,
                  bgcolor: active ? studio.railActive : 'transparent',
                  color: active ? studio.accentDark : studio.railTextMuted,
                  border: `1px solid ${active ? studio.railActiveBorder : studio.railBorder}`,
                  '& .MuiChip-icon': { color: 'inherit', ml: 0.5 },
                  '& .MuiChip-label': { px: 0.75 },
                }}
              />
            );
          })}
        </Stack>
        <TextField
          size="small"
          placeholder="Scan SKU…"
          value={scanValue}
          onChange={(e) => onScanChange(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onScanSubmit()}
          inputRef={scanInputRef}
          InputProps={{
            startAdornment: <QrCodeScanner sx={{ mr: 0.75, color: studio.railTextMuted, fontSize: 18 }} />,
          }}
          sx={{
            ml: 'auto',
            width: { xs: '100%', sm: 220 },
            '& .MuiOutlinedInput-root': {
              height: 32,
              bgcolor: '#f8fafc',
              borderRadius: `${studio.radius.sm}px`,
              fontSize: '0.85rem',
              fontFamily: 'monospace',
            },
          }}
        />
        {timerSlot}
      </Box>
      <Box sx={{ flex: 1, minHeight: 0, display: 'flex', overflow: 'hidden' }}>{children}</Box>
    </Box>
  );
}

export function TarsStudioJobCard({
  job,
  selected,
  running,
  onClick,
}: {
  job: RestorationJobDTO;
  selected: boolean;
  running?: boolean;
  onClick: () => void;
}) {
  const sku = job.items[0]?.sku ?? job.sku ?? '—';
  const title = job.name?.trim() || 'Untitled item';
  return (
    <Box
      onClick={onClick}
      sx={{
        px: 1,
        py: 0.75,
        borderRadius: `${studio.radius.sm}px`,
        cursor: 'pointer',
        border: `1px solid ${selected ? studio.railActiveBorder : 'transparent'}`,
        bgcolor: selected ? studio.railActive : 'transparent',
        '&:hover': { bgcolor: studio.accentSoft },
      }}
    >
      <Stack direction="row" alignItems="center" justifyContent="space-between" gap={0.5}>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="caption" sx={{ color: studio.accentDark, fontWeight: 900, lineHeight: 1.1 }}>
            {sku}
          </Typography>
          <Typography variant="body2" sx={{ fontWeight: 800, color: studio.railText, lineHeight: 1.2 }} noWrap>
            {title}
          </Typography>
        </Box>
        {running ?
          <Chip size="small" icon={<PlayArrow sx={{ fontSize: 14 }} />} label="On" sx={{ height: 22, fontWeight: 800, bgcolor: studio.accentSoft }} />
        : null}
      </Stack>
    </Box>
  );
}

export function TarsStudioItemHero({
  job,
  elapsedSeconds,
  timerRunning,
  onStartTimer,
  onPauseTimer,
  actions,
}: {
  job: RestorationJobDTO;
  elapsedSeconds: number;
  timerRunning: boolean;
  onStartTimer?: () => void;
  onPauseTimer?: () => void;
  actions?: ReactNode;
}) {
  return (
    <Box
      sx={{
        px: 1,
        py: 0.65,
        borderRadius: `${studio.radius.md}px`,
        bgcolor: studio.panel,
        border: `1px solid ${studio.panelBorder}`,
      }}
    >
      <Stack direction="row" alignItems="center" gap={1} flexWrap="wrap">
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="caption" sx={{ color: studio.accentDark, fontWeight: 900, lineHeight: 1 }}>
            {job.items[0]?.sku ?? job.sku}
          </Typography>
          <Typography variant="subtitle1" sx={{ fontWeight: 900, lineHeight: 1.15 }} noWrap>
            {job.name}
          </Typography>
        </Box>
        <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 900, minWidth: 64, textAlign: 'right' }}>
          {formatElapsed(elapsedSeconds)}
        </Typography>
        {onStartTimer || onPauseTimer ?
          <IconButton
            size="small"
            onClick={timerRunning ? onPauseTimer : onStartTimer}
            sx={{
              bgcolor: timerRunning ? studio.accent : studio.accentSoft,
              color: timerRunning ? '#fff' : studio.accentDark,
              width: 30,
              height: 30,
              '&:hover': { bgcolor: timerRunning ? studio.accentDark : studio.accentSoftBorder },
            }}
          >
            {timerRunning ? <PauseCircle sx={{ fontSize: 18 }} /> : <PlayArrow sx={{ fontSize: 18 }} />}
          </IconButton>
        : null}
        {actions}
      </Stack>
    </Box>
  );
}
