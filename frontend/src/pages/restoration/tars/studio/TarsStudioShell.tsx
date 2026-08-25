import ArrowBack from '@mui/icons-material/ArrowBack';
import QrCodeScanner from '@mui/icons-material/QrCodeScanner';
import Build from '@mui/icons-material/Build';
import SpaceDashboard from '@mui/icons-material/SpaceDashboard';
import { Box, Button, Stack, TextField, Typography } from '@mui/material';
import type { ReactNode } from 'react';
import { DECK, PANEL, RADIUS, TYPE } from './benchScale';
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
  noticeSlot,
  actionSlot,
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
  noticeSlot?: ReactNode;
  /** The ways the item in hand can leave. Bench only — Home has no item. */
  actionSlot?: ReactNode;
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
        bgcolor: '#e9eeea',
        color: studio.heroOnDark,
        overflow: 'hidden',
      }}
    >
      {/*
        Two zones: where you are on the left, what you can do about it on the
        right. The leftover width is shared so the work surface stays even.
      */}
      <Box
        sx={{
          minHeight: 62,
          px: { xs: 1, md: 1.5 },
          py: 0.75,
          borderBottom: '1px solid #2c3a34',
          bgcolor: '#1a2420',
          display: 'flex',
          alignItems: 'center',
          gap: { xs: 0.75, md: 1 },
          boxShadow: '0 2px 12px rgba(16,33,26,0.22)',
          zIndex: 5,
        }}
      >
        <Box
          sx={{
            flex: '1 1 0',
            minWidth: 0,
            alignSelf: 'stretch',
            display: 'flex',
            alignItems: 'center',
            gap: { xs: 0.75, md: 1 },
          }}
        >
        <Button
          onClick={onBack}
          startIcon={<ArrowBack />}
          aria-label="Back to dashboard"
          sx={{
            color: DECK.muted,
            minWidth: 0,
            px: 1,
            fontWeight: 800,
            textTransform: 'none',
            '&:hover': { bgcolor: 'rgba(255,255,255,0.08)' },
          }}
        >
          <Box component="span" sx={{ display: { xs: 'none', lg: 'inline' } }}>Dashboard</Box>
        </Button>
        <Box sx={{ pr: { xs: 0, md: 1.25 }, borderRight: { md: '1px solid #2c3a34' } }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700, color: DECK.ink, lineHeight: 1 }}>
            TARS
          </Typography>
          <Typography variant="caption" sx={{ ...TYPE.meta, color: DECK.label, lineHeight: 1 }}>
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
                  ...TYPE.value,
                  cursor: 'pointer',
                  borderRadius: '8px 8px 0 0',
                  border: '1px solid',
                  borderColor: active ? '#e9eeea' : 'transparent',
                  borderBottomColor: active ? '#e9eeea' : 'transparent',
                  bgcolor: active ? '#e9eeea' : 'transparent',
                  color: active ? PANEL.ink : DECK.label,
                  '&:hover': { color: active ? PANEL.ink : DECK.muted },
                }}
              >
                {entry.icon}
                {entry.label}
                <Box
                  component="span"
                  sx={{
                    ...TYPE.micro,
                    px: 0.55,
                    borderRadius: '999px',
                    bgcolor: active ? 'rgba(127,199,154,0.24)' : 'rgba(255,255,255,0.07)',
                    color: active ? '#1b5e20' : DECK.label,
                  }}
                >
                  {counts[entry.id]}
                </Box>
              </Box>
            );
          })}
        </Stack>
        </Box>

        <Box
          sx={{
            flex: '1 1 0',
            minWidth: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: { xs: 0.75, md: 1 },
          }}
        >
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
                width: { xs: 150, sm: 210, lg: 250 },
                '& .MuiOutlinedInput-root': {
                  ...TYPE.body,
                  height: 38,
                  bgcolor: PANEL.bg,
                  borderRadius: `${RADIUS.sm}px`,
                  fontFamily: 'monospace',
                },
              }}
            />
          ) : null}
          {noticeSlot}
          {actionSlot}
        </Box>
      </Box>
      <Box sx={{ flex: 1, minHeight: 0, display: 'flex', overflow: 'hidden' }}>{children}</Box>
    </Box>
  );
}
