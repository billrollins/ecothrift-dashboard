import { Box, Typography } from '@mui/material';
import { format, parseISO } from 'date-fns';
import type { DayGrade } from '../../../api/routines.api';
import { dutyColors } from '../../../components/duty/tokens';
import { LetterChip } from './gradeParts';

/**
 * Six days across the top, the shape of the week at a glance. Clicking a day
 * opens its breakdown below. Every day keeps its tile whether or not it was
 * graded, so answering an open run never shuffles the row under the cursor.
 */
export function GradeWeekStrip({
  days,
  selected,
  onSelect,
  loading,
}: {
  days: DayGrade[];
  selected: string | null;
  onSelect: (date: string) => void;
  loading: boolean;
}) {
  // Six tiles exist before the week does, so the panes below sit still while
  // it loads instead of dropping when the strip appears.
  const tiles: Array<DayGrade | null> = days.length ? days : [null, null, null, null, null, null];
  return (
    <Box sx={{ display: 'flex', gap: 0.75, px: 2.5, pt: 1.75 }}>
      {tiles.map((day, index) => {
        if (!day) return <PlaceholderTile key={index} />;
        const active = day.date === selected;
        return (
          <Box
            key={day.date}
            component="button"
            type="button"
            onClick={() => onSelect(day.date)}
            sx={{
              flex: 1,
              minWidth: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 0.5,
              py: 1,
              font: 'inherit',
              cursor: 'pointer',
              borderRadius: '12px',
              bgcolor: active ? dutyColors.brandTint : dutyColors.card,
              border: `1.5px solid ${active ? dutyColors.brand : dutyColors.ink08}`,
              '&:hover': { borderColor: dutyColors.brand },
            }}
          >
            <Typography sx={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: dutyColors.ink40 }}>
              {format(parseISO(day.date), 'EEE')}
            </Typography>
            <LetterChip letter={day.graded ? day.letter : null} />
            <Typography sx={{ fontSize: 11, color: dutyColors.ink60, fontVariantNumeric: 'tabular-nums', minHeight: 16 }}>
              {day.graded ? `${day.score}` : loading ? ' ' : '--'}
            </Typography>
          </Box>
        );
      })}
    </Box>
  );
}

function PlaceholderTile() {
  return (
    <Box
      sx={{
        flex: 1,
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 0.5,
        py: 1,
        borderRadius: '12px',
        bgcolor: dutyColors.card,
        border: `1.5px solid ${dutyColors.ink08}`,
      }}
    >
      <Typography sx={{ fontSize: 10.5, minHeight: 16 }}>&nbsp;</Typography>
      <LetterChip letter={null} />
      <Typography sx={{ fontSize: 11, minHeight: 16 }}>&nbsp;</Typography>
    </Box>
  );
}
