import { Box } from '@mui/material';
import WarningAmber from '@mui/icons-material/WarningAmber';
import { tk, type AppLanguage } from '../../i18n/kiosk';
import { kioskColors } from './kioskTheme';

/** The host should be a dedicated Employee account. Warn, do not block. */
export function ManagerWarningBanner({ lang }: { lang: AppLanguage }) {
  return (
    <Box
      data-testid="manager-warning"
      sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 2, py: 1, bgcolor: kioskColors.amber, color: kioskColors.amberInk, fontWeight: 800, fontSize: 16 }}
    >
      <WarningAmber fontSize="small" />
      {tk('managerWarning', lang)}
    </Box>
  );
}
