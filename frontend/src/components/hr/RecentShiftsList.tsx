import { Box, Skeleton, Typography } from '@mui/material';
import type { TimeEntry } from '../../types/hr.types';
import { t } from '../../i18n/routines';
import { dutyColors } from '../duty/tokens';
import { ShiftRow } from './ShiftRow';

export function RecentShiftsList({
  entries,
  loading,
  onPick,
  lang,
}: {
  entries: TimeEntry[];
  loading: boolean;
  onPick: (entry: TimeEntry) => void;
  lang: string;
}) {
  if (loading) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
        {[0, 1, 2].map((key) => (
          <Skeleton key={key} variant="rounded" height={64} sx={{ borderRadius: '12px' }} />
        ))}
      </Box>
    );
  }

  const rows = entries.slice(0, 10);
  if (rows.length === 0) {
    return (
      <Box
        sx={{
          height: 64,
          display: 'flex',
          alignItems: 'center',
          px: 1.5,
          border: `1px solid ${dutyColors.ink15}`,
          borderRadius: '12px',
          bgcolor: dutyColors.card,
        }}
      >
        <Typography sx={{ fontSize: 13, color: dutyColors.ink40 }}>{t('noShiftsYet', lang)}</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
      {rows.map((entry) => (
        <ShiftRow key={entry.id} entry={entry} onPick={onPick} lang={lang} />
      ))}
    </Box>
  );
}
