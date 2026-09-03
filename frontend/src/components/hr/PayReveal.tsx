import { Box } from '@mui/material';
import { differenceInCalendarDays, parseISO } from 'date-fns';
import { formatDashboardCurrency } from '../dashboard/dashboardFormatters';
import { dutyColors } from '../duty/tokens';
import { t } from '../../i18n/routines';

export function daysLeftInPeriod(dateTo: string): number {
  return differenceInCalendarDays(parseISO(`${dateTo}T12:00:00`), new Date()) + 1;
}

export function PayReveal({
  show,
  amount,
  onToggle,
  lang,
}: {
  show: boolean;
  amount?: string;
  onToggle: () => void;
  lang: string;
}) {
  return (
    <Box
      component="button"
      type="button"
      aria-label={t(show ? 'hidePay' : 'showPay', lang)}
      onClick={onToggle}
      sx={{
        minHeight: 22,
        px: 0.25,
        border: 'none',
        background: 'none',
        font: 'inherit',
        cursor: 'pointer',
        fontSize: 13,
        fontWeight: 800,
        lineHeight: 1.2,
        color: show ? dutyColors.brandDark : dutyColors.ink40,
      }}
    >
      {show && amount ? formatDashboardCurrency(amount) : '••••'}
    </Box>
  );
}
