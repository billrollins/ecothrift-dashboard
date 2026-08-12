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
        {/*
          Tabs, drawn as tabs. They sit on the bottom edge of the header and the
          active one joins the surface below it, so the shape itself says which
          surface you are looking at rather than leaving colour to do the work.
        */}
        <Stack direction="row" gap={0.25} sx={{ alignSelf: 'stretch', alignItems: 'flex-end', mb: '-0.75rem' }}>
          {STUDIO_LANES.map((entry) => {
            const active = lane === entry.id;
            return (
              <Box
                key={entry.id}
                component="button"
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => onLaneChange(entry.id)}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 0.6,
                  px: 1.5,
                  pt: 0.7,
                  pb: 0.9,
                  cursor: 'pointer',
                  fontSize: '0.82rem',
                  fontWeight: 900,
                  borderRadius: '8px 8px 0 0',
                  border: '1px solid',
                  borderColor: active ? '#e8edf3' : 'transparent',
                  borderBottomColor: active ? '#e8edf3' : 'transparent',
                  bgcolor: active ? '#e8edf3' : 'transparent',
                  color: active ? '#0b3b46' : '#8ea2ba',
                  '&:hover': { color: active ? '#0b3b46' : '#d9e3f0' },
                }}
              >
                {entry.icon}
                {entry.label}
                <Box
                  component="span"
                  sx={{
                    px: 0.55,
                    borderRadius: '999px',
                    fontSize: '0.68rem',
                    fontWeight: 900,
                    bgcolor: active ? '#c9e6e0' : '#26344a',
                    color: active ? '#0b665e' : '#9db0c7',
                  }}
                >
                  {counts[entry.id]}
                </Box>
              </Box>
            );
          })}
        </Stack>

        {/*
          Scanning is how an item gets onto a bench, so it belongs where you go
          looking for one. On Bench there is already an item in hand and the
          field would only be a way to lose it.
        */}
        {lane === 'home' ? (
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
        ) : (
          <Box sx={{ ml: 'auto' }} />
        )}
        {hrSlot}
        {noticeSlot}
        {timerSlot}
      </Box>
      <Box sx={{ flex: 1, minHeight: 0, display: 'flex', overflow: 'hidden' }}>{children}</Box>
    </Box>
  );
}
