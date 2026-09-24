import { Box, Button, Skeleton, Typography } from '@mui/material';
import type { TimeEntry } from '../../types/hr.types';
import { t } from '../../i18n/routines';
import { dutyColors } from '../duty/tokens';
import { ShiftRow } from './ShiftRow';

const MAX = 10;

/**
 * Recent shifts as one compact list: the first `limit` rows (as many as fit), then up to ten
 * on "More shifts". The caller decides the limit and whether the list scrolls when opened.
 */
export function RecentShiftsList({
  entries,
  loading,
  onPick,
  lang,
  limit,
  all,
  onToggleAll,
}: {
  entries: TimeEntry[];
  loading: boolean;
  onPick: (entry: TimeEntry) => void;
  lang: string;
  limit: number;
  all: boolean;
  onToggleAll: () => void;
}) {
  if (loading) {
    return <Skeleton variant="rounded" height={3 * 44} sx={{ borderRadius: '10px' }} />;
  }
  if (entries.length === 0) {
    return (
      <Typography sx={{ py: 1, fontSize: 13, color: dutyColors.ink40 }}>{t('noShiftsYet', lang)}</Typography>
    );
  }

  const total = Math.min(entries.length, MAX);
  const shown = Math.min(Math.max(limit, 1), total);
  const rows = entries.slice(0, all ? total : shown);
  const more = total - shown;
  return (
    <Box>
      <Box sx={{ border: `1px solid ${dutyColors.ink15}`, borderRadius: '10px', overflow: 'hidden', bgcolor: dutyColors.card }}>
        {rows.map((entry) => (
          <ShiftRow key={entry.id} entry={entry} onPick={onPick} lang={lang} />
        ))}
      </Box>
      {more > 0 ? (
        <Button size="small" onClick={onToggleAll} sx={{ mt: 0.5, px: 0.5, minWidth: 0 }}>
          {all ? t('showFewer', lang) : `${t('showMoreShifts', lang)} (${more})`}
        </Button>
      ) : null}
    </Box>
  );
}
