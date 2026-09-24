import { Box, Button, TextField, Typography } from '@mui/material';
import { format, parseISO } from 'date-fns';
import { useState } from 'react';
import type { TimeEntry } from '../../types/hr.types';
import { t } from '../../i18n/routines';
import { dutyColors } from '../duty/tokens';

/**
 * A punch open 14 hours or more: it was never clocked out. Ask when they left (the roster
 * time out, or store close, is filled in), close it there, and a manager confirms the time.
 * Closing it at "now" is what turned a 7-hour day into a 24-hour shift.
 */
export function ForgottenClockOutCard({
  entry,
  lang,
  pending,
  onFix,
}: {
  entry: TimeEntry;
  lang: string;
  pending?: boolean;
  onFix: (clockOutIso: string) => void;
}) {
  const stale = entry.stale;
  const [value, setValue] = useState(() => (
    stale ? format(parseISO(stale.suggested_clock_out), "yyyy-MM-dd'T'HH:mm") : ''
  ));
  if (!stale) return null;
  return (
    <Box
      sx={{
        bgcolor: dutyColors.card,
        border: `1.5px solid ${dutyColors.red}`,
        borderRadius: '12px',
        px: 2,
        py: 1.75,
        display: 'flex',
        flexDirection: 'column',
        gap: 1.25,
      }}
    >
      <Typography sx={{ fontSize: 18, fontWeight: 900, color: dutyColors.red }}>{t('forgotTitle', lang)}</Typography>
      <Typography sx={{ fontSize: 13.5, color: dutyColors.ink60 }}>
        {t('forgotSince', lang)}{' '}
        <Box component="b" sx={{ color: dutyColors.ink }}>{format(parseISO(stale.since), 'EEE MMM d, h:mm a')}</Box>{' '}
        {t('forgotStillOpen', lang)}
      </Typography>
      <TextField
        type="datetime-local"
        size="small"
        label={t('forgotWhen', lang)}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        slotProps={{ inputLabel: { shrink: true } }}
        fullWidth
      />
      <Button
        variant="contained"
        disabled={pending || !value}
        onClick={() => onFix(new Date(value).toISOString())}
        sx={{ height: 48, fontWeight: 800 }}
      >
        {t('forgotFix', lang)}
      </Button>
      <Typography sx={{ fontSize: 12, color: dutyColors.ink40 }}>{t('forgotNote', lang)}</Typography>
    </Box>
  );
}
