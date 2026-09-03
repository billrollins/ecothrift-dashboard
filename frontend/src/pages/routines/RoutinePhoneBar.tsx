import { Box, Button, Typography } from '@mui/material';
import { dutyColors } from '../../components/duty/tokens';
import { useAuth } from '../../hooks/useAuth';
import { t } from '../../i18n/routines';

export const ROUTINE_PHONE_BAR_HEIGHT = 64;

export type RoutinePhoneBarMode = 'fill' | 'preview' | 'demo' | 'review' | 'idle';

const PILL_KEYS: Record<Exclude<RoutinePhoneBarMode, 'fill'>, string> = {
  preview: 'livePreview',
  demo: 'demo',
  review: 'submittedReadOnly',
  idle: 'selectRoutine',
};

const MODE_PILL: Record<Exclude<RoutinePhoneBarMode, 'fill'>, {
  bar: string;
  chip: string;
  ink: string;
  dot: string;
}> = {
  preview: {
    bar: dutyColors.brandSoft,
    chip: '#fff',
    ink: dutyColors.brandDark,
    dot: dutyColors.brand,
  },
  demo: {
    bar: dutyColors.brandSoft,
    chip: '#fff',
    ink: dutyColors.brandDark,
    dot: dutyColors.brand,
  },
  review: {
    bar: dutyColors.brandTint,
    chip: '#fff',
    ink: dutyColors.brandDark,
    dot: dutyColors.brand,
  },
  idle: {
    bar: dutyColors.paper,
    chip: '#fff',
    ink: dutyColors.ink60,
    dot: dutyColors.ink40,
  },
};

function ModePill({ mode }: { mode: Exclude<RoutinePhoneBarMode, 'fill'> }) {
  const { user } = useAuth();
  const lang = user?.language === 'es' ? 'es' : 'en';
  const chrome = MODE_PILL[mode];
  const label = t(PILL_KEYS[mode], lang);
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
        {label}
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
  const { user } = useAuth();
  const lang = user?.language === 'es' ? 'es' : 'en';
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
            {t('cancel', lang)}
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
            {saveLabel || t('saveClose', lang)}
          </Button>
        </>
      ) : mode === 'review' ? (
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
            {t('close', lang)}
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
