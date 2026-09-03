import { Box, Typography } from '@mui/material';
import { format, parseISO } from 'date-fns';
import type { DayGrade } from '../../../api/routines.api';
import { StatusTag } from '../../../components/duty/StatusTag';
import { dutyColors } from '../../../components/duty/tokens';
import { Figure, GradeCard, LetterChip } from './gradeParts';

const CHECKLIST_ORDER = ['retail.open', 'retail.day', 'retail.close'];

function statusTag(row: DayGrade['performed'][string]) {
  if (row.status === 'done' && row.late) return { label: 'Late', tone: 'amber' as const };
  if (row.status === 'done') return { label: 'On time', tone: 'green' as const };
  if (row.status === 'open') return { label: 'Still open', tone: 'red' as const };
  return { label: 'Not done', tone: 'red' as const };
}

/**
 * One day, taken apart. The two figures answer the only question people ask
 * when they disagree with a grade: which half pulled it down.
 */
export function GradeDayBreakdown({ day }: { day: DayGrade | null }) {
  const keys = day
    ? [...CHECKLIST_ORDER.filter((key) => key in day.performed),
       ...Object.keys(day.performed).filter((key) => !CHECKLIST_ORDER.includes(key))]
    : CHECKLIST_ORDER;

  return (
    <GradeCard>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minHeight: 54 }}>
        <LetterChip letter={day?.graded ? day.letter : null} size="lg" />
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography noWrap sx={{ fontSize: 15, fontWeight: 700, color: dutyColors.ink }}>
            {day ? format(parseISO(day.date), 'EEEE, MMM d') : 'No day selected'}
          </Typography>
          <Typography noWrap sx={{ fontSize: 12.5, color: dutyColors.ink60 }}>
            {!day
              ? 'Pick a day above.'
              : !day.graded
                ? 'Nothing was scheduled on this day.'
                : day.owner_score == null
                  ? 'No spot check today, so the checklists carry the whole day.'
                  : `Spot check on ${day.owner_section ?? 'a section'} carries half the day.`}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 2, width: 190, flexShrink: 0 }}>
          <Figure label="Checklists" value={day?.graded ? String(day.performed_score) : '--'} />
          <Figure
            label="Spot check"
            value={day?.owner_score != null ? String(day.owner_score) : '--'}
          />
        </Box>
      </Box>

      <Box sx={{ mt: 1, pt: 1, borderTop: `1px solid ${dutyColors.ink08}` }}>
        {keys.map((key) => {
          const row = day?.performed[key];
          const tag = row ? statusTag(row) : { label: 'No run', tone: 'plain' as const };
          const checks = row?.verify?.checks ?? [];
          return (
            <Box key={key} sx={{ py: 0.6 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minHeight: 30 }}>
                <Typography noWrap sx={{ flex: 1, minWidth: 0, fontSize: 13, color: dutyColors.ink }}>
                  {row?.title ?? key}
                </Typography>
                <Typography
                  noWrap
                  sx={{ width: 150, flexShrink: 0, fontSize: 12, color: dutyColors.ink40, textAlign: 'right' }}
                >
                  {row?.completed_by_name ?? ''}
                </Typography>
                <Box sx={{ width: 84, flexShrink: 0, display: 'flex', justifyContent: 'flex-end' }}>
                  <StatusTag small label={tag.label} tone={tag.tone} />
                </Box>
              </Box>
              <Box sx={{ pl: 0.25, minHeight: 18 }}>
                {checks.length ? checks.map((check) => (
                  <Typography key={check.check_id} sx={{ fontSize: 12, color: dutyColors.ink40, py: 0.1 }}>
                    {check.label}
                    {': '}
                    {check.result || 'unanswered'}
                    {check.their_result ? ` (they: ${check.their_result})` : ''}
                  </Typography>
                )) : (
                  <Typography sx={{ fontSize: 12, color: dutyColors.ink15 }}>No verify on this list.</Typography>
                )}
              </Box>
            </Box>
          );
        })}
      </Box>
    </GradeCard>
  );
}
