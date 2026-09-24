import AccessTimeRounded from '@mui/icons-material/AccessTimeRounded';
import { Box, Typography } from '@mui/material';
import { format } from 'date-fns';
import type { HoursNag } from '../../hooks/useHoursNag';
import { t } from '../../i18n/routines';
import { dutyColors } from '../duty/tokens';
import { NAG_AMBER } from '../routines/MyWorkList';

function leftLabel(hours: number): string {
  const minutes = Math.max(Math.round(hours * 60), 1);
  return minutes < 60 ? `${minutes} min` : `${(minutes / 60).toFixed(1)} h`;
}

/** Title and body for the weekly-hours nag, the same words on Today and in the nag drawer. */
export function hoursNagText(nag: HoursNag, lang: string): { title: string; body: string } {
  if (nag.level === 'hard') {
    return {
      title: `${nag.limit} ${t('hoursReached', lang)}`,
      body: `${t('clockOutNow', lang)} ${t('noOvertime', lang)} ${t('hoursWrong', lang)}`,
    };
  }
  const by = nag.clockOutBy ? format(nag.clockOutBy, 'h:mm a') : '';
  return {
    title: `${leftLabel(nag.left)} ${t('hoursLeftWeek', lang)}`,
    body: `${t('clockOutBy', lang)} ${by}. ${t('noOvertime', lang)}`,
  };
}

/** Amber with an hour or less left this week, red at the limit. Nothing otherwise. */
export function HoursNagCard({ nag, lang, onOpen }: { nag: HoursNag; lang: string; onOpen?: () => void }) {
  if (nag.level === 'none') return null;
  const color = nag.level === 'hard' ? dutyColors.red : NAG_AMBER;
  const { title, body } = hoursNagText(nag, lang);
  return (
    <Box
      component={onOpen ? 'button' : 'div'}
      type={onOpen ? 'button' : undefined}
      onClick={onOpen}
      sx={{
        width: '100%',
        display: 'flex',
        gap: 1.25,
        alignItems: 'flex-start',
        px: 1.5,
        py: 1.25,
        borderRadius: '12px',
        border: `1.5px solid ${color}`,
        bgcolor: dutyColors.card,
        font: 'inherit',
        textAlign: 'left',
        cursor: onOpen ? 'pointer' : 'default',
      }}
    >
      <AccessTimeRounded sx={{ color, mt: 0.25 }} />
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ fontSize: 14.5, fontWeight: 800, color }}>{title}</Typography>
        <Typography sx={{ fontSize: 12.5, color: dutyColors.ink60 }}>{body}</Typography>
      </Box>
    </Box>
  );
}
