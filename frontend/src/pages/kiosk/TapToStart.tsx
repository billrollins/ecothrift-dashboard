import { Box, Typography } from '@mui/material';
import TouchApp from '@mui/icons-material/TouchApp';
import { tk, type AppLanguage } from '../../i18n/kiosk';
import { kioskColors } from './kioskTheme';

/** requestFullscreen needs a user gesture; this is that gesture, once per device. */
export function TapToStart({ lang, onTap }: { lang: AppLanguage; onTap: () => void }) {
  return (
    <Box
      role="button"
      tabIndex={0}
      data-testid="tap-to-start"
      onClick={onTap}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onTap();
      }}
      sx={{
        position: 'fixed',
        inset: 0,
        zIndex: 30,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
        bgcolor: kioskColors.bg,
        color: kioskColors.ink,
        cursor: 'pointer',
      }}
    >
      <TouchApp sx={{ fontSize: 96, color: kioskColors.brand }} />
      <Typography sx={{ fontSize: 44, fontWeight: 900 }}>{tk('tapToStart', lang)}</Typography>
      <Typography sx={{ fontSize: 20, color: kioskColors.ink60, fontWeight: 600 }}>{tk('tapToStartHint', lang)}</Typography>
    </Box>
  );
}
