import ArrowBack from '@mui/icons-material/ArrowBack';
import QrCodeScanner from '@mui/icons-material/QrCodeScanner';
import Build from '@mui/icons-material/Build';
import SpaceDashboard from '@mui/icons-material/SpaceDashboard';
import { Box, Button, Chip, Stack, TextField, Typography } from '@mui/material';
import type { ReactNode } from 'react';
import { studio } from './tarsStudioTheme';

/**
 * Two surfaces, not four. Home answers "what is there to do"; Bench is the one
 * item being done. Queue and Holding are both lists of waiting items, so they
 * live side by side on Home rather than each claiming a tab nobody visits.
 */
export type StudioLane = 'home' | 'bench';

export const STUDIO_LANES: Array<{ id: StudioLane; label: string; icon: ReactNode }> = [
  { id: 'home', label: 'Home', icon: <SpaceDashboard sx={{ fontSize: 16 }} /> },
  { id: 'bench', label: 'Bench', icon: <Build sx={{ fontSize: 16 }} /> },
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
  hrSlot,
  noticeSlot,
  onBack,
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
  hrSlot?: ReactNode;
  noticeSlot?: ReactNode;
  onBack: () => void;
  children: ReactNode;
}) {
  return (
    <Box
      sx={{
        flex: 1,
        width: '100%',
        height: '100%',
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        bgcolor: '#e8edf3',
        color: studio.heroOnDark,
        overflow: 'hidden',
      }}
    >
      <Box
        sx={{
          minHeight: 62,
          px: { xs: 1, md: 1.5 },
          py: 0.75,
          borderBottom: '1px solid #253247',
          bgcolor: '#111c2e',
          display: 'flex',
          alignItems: 'center',
          gap: { xs: 0.75, md: 1 },
          flexWrap: 'wrap',
          boxShadow: '0 4px 18px rgba(15, 23, 42, 0.2)',
          zIndex: 5,
        }}
      >
        <Button
          onClick={onBack}
          startIcon={<ArrowBack />}
          aria-label="Back to dashboard"
          sx={{
            color: '#d9e3f0',
            minWidth: 0,
            px: 1,
            fontWeight: 800,
            textTransform: 'none',
            '&:hover': { bgcolor: 'rgba(255,255,255,0.08)' },
          }}
        >
          <Box component="span" sx={{ display: { xs: 'none', lg: 'inline' } }}>Dashboard</Box>
        </Button>
        <Box sx={{ pr: { xs: 0, md: 1.25 }, borderRight: { md: '1px solid #334155' } }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 950, color: '#f8fafc', lineHeight: 1 }}>
            TARS
          </Typography>
          <Typography variant="caption" sx={{ color: '#91a4bc', lineHeight: 1 }}>
            Restoration Studio
          </Typography>
        </Box>
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
                  bgcolor: active ? '#d8f3ee' : 'transparent',
                  color: active ? '#0b665e' : '#b6c4d5',
                  border: `1px solid ${active ? '#51b9ad' : '#3b4a60'}`,
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
            width: { xs: '100%', sm: 210, lg: 250 },
            '& .MuiOutlinedInput-root': {
              height: 38,
              bgcolor: '#f8fafc',
              borderRadius: `${studio.radius.sm}px`,
              fontSize: '0.85rem',
              fontFamily: 'monospace',
            },
          }}
        />
        {hrSlot}
        {noticeSlot}
        {timerSlot}
      </Box>
      <Box sx={{ flex: 1, minHeight: 0, display: 'flex', overflow: 'hidden' }}>{children}</Box>
    </Box>
  );
}
