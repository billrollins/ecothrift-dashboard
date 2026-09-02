import { Box, Typography } from '@mui/material';
import ChevronLeftRounded from '@mui/icons-material/ChevronLeftRounded';
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded';
import { parseISO } from 'date-fns';
import { useSnackbar } from 'notistack';
import { useEffect, useMemo, useState } from 'react';
import type { AuditTaxonomy, GradeLetter } from '../../../api/routines.api';
import { dutyColors, thinScrollSx } from '../../../components/duty/tokens';
import { useCoverRun, useRetailGrades } from '../../../hooks/useRoutines';
import {
  RoutineHeaderIconButton,
  RoutinePaneHeader,
} from '../../routines/RoutinePaneHeader';
import { AdminViewToggle, type AdminRoutineView } from './AdminViewToggle';
import { GradeCalibration, GradeMissingOwners } from './GradeAttention';
import { GradeCrossChecks } from './GradeCrossChecks';
import { GradeDayBreakdown } from './GradeDayBreakdown';
import { GradeTallies } from './GradeTallies';
import { GradeWeekStrip } from './GradeWeekStrip';
import { Figure, GradeBand, GradeCard, LetterChip } from './gradeParts';
import { isFutureWeek, isoWeekKey, shiftWeek, weekLabel, weekNote } from './gradeWeek';

/**
 * The retail letter grade and everything behind it, one week at a time.
 *
 * The order of this page is the order of an argument about a grade: the week,
 * then the day, then the audits, then the walks, then the two things somebody
 * has to act on. Nothing here is editable — the numbers that produce it live
 * in Settings > Retail QA.
 */
export function AdminGradesPane({
  view,
  onView,
  openOn,
}: {
  view: AdminRoutineView;
  onView: (view: AdminRoutineView) => void;
  departments: Array<{ id: number; name: string }>;
  /** `YYYY-MM-DD` to land on, from a Dashboard cell click. */
  openOn?: string | null;
}) {
  const { enqueueSnackbar } = useSnackbar();
  const today = useMemo(() => new Date(), []);
  const asked = openOn && !Number.isNaN(Date.parse(openOn)) ? openOn : null;
  const [week, setWeek] = useState(() => isoWeekKey(asked ? parseISO(asked) : new Date()));
  const [selected, setSelected] = useState<string | null>(asked);
  const [coveringId, setCoveringId] = useState<number | null>(null);

  const grades = useRetailGrades(week);
  const data = grades.data;
  const cover = useCoverRun();

  const days = data?.days ?? [];
  // Land on the most recent day that has anything to show, which is the one
  // somebody opening this page wants to read.
  useEffect(() => {
    if (!days.length) return;
    const graded = [...days].reverse().find((day) => day.graded);
    setSelected((current) => (
      current && days.some((day) => day.date === current) ? current : (graded ?? days[0]).date
    ));
  }, [data]);

  const cfg = data?.settings;
  const letterFor = (score: number): GradeLetter => {
    if (!cfg) return 'F';
    if (score >= cfg.grade_a) return 'A';
    if (score >= cfg.grade_b) return 'B';
    if (score >= cfg.grade_c) return 'C';
    if (score >= cfg.grade_d) return 'D';
    return 'F';
  };

  const day = days.find((row) => row.date === selected) ?? null;
  const loading = grades.isLoading;
  const taxonomy = data?.taxonomy ?? EMPTY_TAXONOMY;

  async function coverRun(runId: number) {
    setCoveringId(runId);
    try {
      await cover.mutateAsync(runId);
      enqueueSnackbar('That walk is yours now', { variant: 'success' });
    } catch {
      enqueueSnackbar('Could not take that walk', { variant: 'error' });
    } finally {
      setCoveringId(null);
    }
  }

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', bgcolor: dutyColors.paper }}>
      <RoutinePaneHeader
        tone="admin"
        eyebrow="Admin · retail QA"
        title="Grades"
        note={weekNote(data, loading, grades.isError)}
        noteIsError={grades.isError}
        actions={(
          <>
            <RoutineHeaderIconButton
              label="Previous week"
              icon={<ChevronLeftRounded />}
              onClick={() => setWeek((current) => shiftWeek(current, -1))}
            />
            <RoutineHeaderIconButton
              label="Next week"
              icon={<ChevronRightRounded />}
              disabled={isFutureWeek(shiftWeek(week, 1), today)}
              onClick={() => setWeek((current) => shiftWeek(current, 1))}
            />
          </>
        )}
        below={<AdminViewToggle view={view} onChange={onView} />}
      />

      <Box sx={{ flex: 1, overflowY: 'auto', pb: 3, ...thinScrollSx }}>
        <Box sx={{ px: 2.5, pt: 2 }}>
          <GradeCard tone={data?.letter === 'F' ? 'warn' : 'plain'}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.75, minHeight: 54 }}>
              <LetterChip letter={data?.letter ?? null} size="lg" />
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography noWrap sx={{ fontSize: 15, fontWeight: 700, color: dutyColors.ink }}>
                  {weekLabel(week, today)}
                </Typography>
                <Typography noWrap sx={{ fontSize: 12.5, color: dutyColors.ink60 }}>
                  {cfg
                    ? `${Math.round((cfg.weekly_daily_weight ?? 0) * 100)}% the daily average, the rest the cross-checks.`
                    : ' '}
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', gap: 2, width: 260, flexShrink: 0 }}>
                <Figure label="Week score" value={data?.score != null ? String(data.score) : '--'} />
                <Figure label="Days average" value={data?.daily_average != null ? String(data.daily_average) : '--'} />
                <Figure label="Cross-checks" value={data?.cross_check_average != null ? String(data.cross_check_average) : '--'} />
              </Box>
            </Box>
          </GradeCard>
        </Box>

        <GradeWeekStrip
          days={days}
          selected={selected}
          onSelect={setSelected}
          loading={loading}
        />

        <GradeBand title="The day" hint="Half the checklists, half the owner's look, when there was one." />
        <GradeDayBreakdown day={day} />

        <GradeBand title="Cross-checks" hint="Somebody else's eyes on a section, photo first. These are graded." />
        <GradeCrossChecks
          rows={data?.cross_checks ?? []}
          taxonomy={taxonomy}
          letters={letterFor}
          loading={loading}
        />

        <GradeBand title="Section walks" hint="Recorded, never scored. Where the work keeps coming back." />
        <GradeTallies tallies={data?.tallies ?? []} taxonomy={taxonomy} loading={loading} />

        <GradeBand title="Owed today" hint="Section walks nobody has claimed. Take one and it moves to your list." />
        <GradeMissingOwners
          rows={data?.missing_owners ?? []}
          busyRunId={coveringId}
          onCover={(runId) => void coverRun(runId)}
          loading={loading}
        />

        <GradeBand title="Checker gaps" hint="What an owner found that the week's auditor did not. Report only." />
        <GradeCalibration rows={data?.calibration ?? []} loading={loading} />
      </Box>
    </Box>
  );
}

const EMPTY_TAXONOMY: AuditTaxonomy = {
  graded: [],
  recorded: [],
  flags: [],
  safety_flag: 'safety',
};
