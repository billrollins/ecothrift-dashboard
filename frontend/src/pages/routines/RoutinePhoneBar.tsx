import { Box, Button, Typography } from '@mui/material';
import { dutyColors } from '../../components/duty/tokens';

export const ROUTINE_PHONE_BAR_HEIGHT = 64;

export type RoutinePhoneBarMode = 'fill' | 'preview' | 'demo' | 'review' | 'idle';

const MODE_PILL: Record<Exclude<RoutinePhoneBarMode, 'fill'>, {
  label: string;
  bar: string;
  chip: string;
  ink: string;
  dot: string;
}> = {
  preview: {
    label: 'Live preview',
    bar: dutyColors.brandSoft,
    chip: '#fff',
    ink: dutyColors.brandDark,
    dot: dutyColors.brand,
  },
  demo: {
    label: 'Demo',
    bar: dutyColors.brandSoft,
    chip: '#fff',
    ink: dutyColors.brandDark,
    dot: dutyColors.brand,
  },
  review: {
    label: 'Submitted · read only',
    bar: dutyColors.brandTint,
    chip: '#fff',
    ink: dutyColors.brandDark,
    dot: dutyColors.brand,
  },
  idle: {
    label: 'Select a routine',
    bar: dutyColors.paper,
    chip: '#fff',
    ink: dutyColors.ink60,
    dot: dutyColors.ink40,
  },
};

function ModePill({ mode }: { mode: Exclude<RoutinePhoneBarMode, 'fill'> }) {
  const chrome = MODE_PILL[mode];
  return (
    <Box
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.75,
        height: 32,
        px: 1.25,
        borderRadius: 999,
        bgcolor: chrome.chip,
        border: `1px solid ${mode === 'idle' ? dutyColors.ink15 : 'rgba(46,125,50,0.22)'}`,
        boxShadow: mode === 'idle' ? 'none' : '0 1px 2px rgba(27,94,32,0.08)',
      }}
    >
      <Box
        sx={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          bgcolor: chrome.dot,
          flexShrink: 0,
        }}
      />
      <Typography
        sx={{
          fontSize: 12.5,
          fontWeight: 700,
          color: chrome.ink,
          letterSpacing: '0.01em',
          lineHeight: 1,
        }}
      >
        {chrome.label}
      </Typography>
    </Box>
  );
}

export function RoutinePhoneBar({
  mode,
  onCancel,
  onSave,
  saveLabel,
  saveDisabled,
  saving,
}: {
  mode: RoutinePhoneBarMode;
  onCancel?: () => void;
  onSave?: () => void;
  saveLabel?: string;
  saveDisabled?: boolean;
  saving?: boolean;
}) {
  const chrome = mode === 'fill' ? null : MODE_PILL[mode];

  return (
    <Box
      sx={{
        flex: '0 0 auto',
        height: ROUTINE_PHONE_BAR_HEIGHT,
        boxSizing: 'border-box',
        px: 1.5,
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        bgcolor: mode === 'fill' ? dutyColors.card : (chrome?.bar ?? dutyColors.card),
        borderTop: `1px solid ${mode === 'fill' ? dutyColors.ink15 : 'rgba(46,125,50,0.16)'}`,
        pb: 'env(safe-area-inset-bottom)',
      }}
    >
      {mode === 'fill' ? (
        <>
          <Button
            onClick={onCancel}
            sx={{
              flex: 1,
              height: 46,
              borderRadius: '10px',
              fontWeight: 700,
              color: dutyColors.ink60,
              border: `1.5px solid ${dutyColors.ink15}`,
              bgcolor: dutyColors.card,
            }}
          >
            Cancel
          </Button>
          <Button
            onClick={onSave}
            disabled={saveDisabled || saving}
            sx={{
              flex: 1,
              height: 46,
              borderRadius: '10px',
              fontWeight: 700,
              bgcolor: saveDisabled ? dutyColors.ink15 : dutyColors.brand,
              color: saveDisabled ? dutyColors.ink40 : '#fff',
              '&:hover': { bgcolor: saveDisabled ? dutyColors.ink15 : dutyColors.brandDark },
              '&:disabled': { bgcolor: dutyColors.ink15, color: dutyColors.ink40 },
            }}
          >
            {saveLabel || 'Save & close'}
          </Button>
        </>
      ) : mode === 'demo' || mode === 'review' ? (
        <>
          <Button
            onClick={onCancel}
            sx={{
              flex: 1,
              height: 40,
              borderRadius: '10px',
              fontWeight: 700,
              color: dutyColors.ink60,
              border: `1.5px solid ${dutyColors.ink15}`,
              bgcolor: '#fff',
            }}
          >
            {mode === 'review' ? 'Close' : 'Cancel'}
          </Button>
          <Box sx={{ flex: 1.2, display: 'flex', justifyContent: 'center' }}>
            <ModePill mode={mode} />
          </Box>
        </>
      ) : (
        <Box sx={{ width: '100%', display: 'flex', justifyContent: 'center' }}>
          <ModePill mode={mode} />
        </Box>
      )}
    </Box>
  );
}
