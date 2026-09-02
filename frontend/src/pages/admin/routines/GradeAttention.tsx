import { Box, Typography } from '@mui/material';
import type { CalibrationRow, WeekGrade } from '../../../api/routines.api';
import { StatusTag } from '../../../components/duty/StatusTag';
import { dutyColors } from '../../../components/duty/tokens';
import { RoutineHeaderButton } from '../../routines/RoutinePaneHeader';
import { GradeCard, GradeEmpty } from './gradeParts';

/**
 * Section walks still owed today, with the button that hands one over. An
 * absent owner is the one gap the day cannot fix itself: nobody else is asked
 * for that aisle unless somebody takes it.
 */
export function GradeMissingOwners({
  rows,
  busyRunId,
  onCover,
  loading,
}: {
  rows: WeekGrade['missing_owners'];
  busyRunId: number | null;
  onCover: (runId: number) => void;
  loading: boolean;
}) {
  if (!rows.length) {
    return (
      <GradeEmpty>
        {loading ? ' ' : 'Every section walk owed today has been claimed.'}
      </GradeEmpty>
    );
  }
  return (
    <>
      {rows.map((row) => (
        <GradeCard key={row.run_id} tone="warn">
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minHeight: 38 }}>
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography noWrap sx={{ fontSize: 14, fontWeight: 700, color: dutyColors.ink }}>
                {row.owner_name}
              </Typography>
              <Typography noWrap sx={{ fontSize: 12.5, color: dutyColors.ink60 }}>
                {row.sections || 'No section on this run'}
              </Typography>
            </Box>
            <RoutineHeaderButton
              label={busyRunId === row.run_id ? 'Taking' : 'Cover'}
              variant="ghost"
              disabled={busyRunId === row.run_id}
              onClick={() => onCover(row.run_id)}
            />
          </Box>
        </GradeCard>
      ))}
    </>
  );
}

/**
 * Where the owner's own walk of a section found things the week's auditor did
 * not. Never in the grade, always on the screen: the point is that both people
 * can see it, not that anyone loses points for it.
 */
export function GradeCalibration({
  rows,
  loading,
}: {
  rows: CalibrationRow[];
  loading: boolean;
}) {
  const withGaps = rows.filter((row) => row.gaps.length);
  if (!withGaps.length) {
    return (
      <GradeEmpty>
        {loading
          ? ' '
          : rows.length
            ? 'The spot checks and the cross-checks agree on every section they both saw.'
            : 'No section was seen by both a spot check and a cross-check this week.'}
      </GradeEmpty>
    );
  }
  return (
    <>
      {withGaps.map((row) => (
        <GradeCard key={`${row.section_id}-${row.section_name}`}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography noWrap sx={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 700, color: dutyColors.ink }}>
              {row.section_name}
            </Typography>
            <StatusTag small label={`Owner ${row.owner_score}`} tone="blue" />
            <StatusTag small label={`Checker ${row.checker_score}`} tone="plain" />
          </Box>
          <Typography noWrap sx={{ fontSize: 12.5, color: dutyColors.ink60, mt: 0.25 }}>
            {row.checker_name ?? 'The checker'} logged none of these.
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.75, minHeight: 20 }}>
            {row.gaps.map((gap) => (
              <Box
                key={gap.key}
                component="span"
                sx={{
                  px: 0.9,
                  height: 20,
                  display: 'inline-flex',
                  alignItems: 'center',
                  borderRadius: '6px',
                  fontSize: 11,
                  fontWeight: 650,
                  color: dutyColors.amberInk,
                  bgcolor: '#FDF3DC',
                }}
              >
                {`${gap.label}: ${gap.owner}`}
              </Box>
            ))}
          </Box>
        </GradeCard>
      ))}
    </>
  );
}
