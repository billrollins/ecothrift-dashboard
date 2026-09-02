import { Box, Typography } from '@mui/material';
import { format, parseISO } from 'date-fns';
import { useSnackbar } from 'notistack';
import { useEffect, useMemo, useState } from 'react';
import type { AuditTaxonomy, GradeLetter } from '../../../api/routines.api';
import { dutyColors, thinScrollSx } from '../../../components/duty/tokens';
import { useCoverRun, useRetailGrades } from '../../../hooks/useRoutines';
import { GradeCalibration, GradeMissingOwners } from './GradeAttention';
import { GradeCrossChecks } from './GradeCrossChecks';
import { GradeDayBreakdown } from './GradeDayBreakdown';
import { GradeTallies } from './GradeTallies';
import { GradeWeekStrip } from './GradeWeekStrip';
import { Figure, GradeBand, GradeCard, LetterChip } from './gradeParts';
import { weekLabel, weekNote } from './gradeWeek';

/**
 * The retail letter grade and everything behind it, one week at a time.
 *
 * The order of this page is the order of an argument about a grade: the week,
 * then the day, then the audits, then the walks, then the two things somebody
 * has to act on. Nothing here is editable - the numbers that produce it live
 * in Settings > Retail QA.
 */
export function AdminGradesPane({
  week,
  openOn,
}: {
  week: string;
  departments: Array<{ id: number; name: string }>;
  /** `YYYY-MM-DD` to land on, from a Dashboard cell click. */
  openOn?: string | null;
}) {
  const { enqueueSnackbar } = useSnackbar();
  const today = useMemo(() => new Date(), []);
  const asked = openOn && !Number.isNaN(Date.parse(openOn)) ? openOn : null;
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

  const workDays = (() => {
    const rows = (data?.work_cycles ?? []).slice(0, 6);
    while (rows.length < 6) {
      rows.push({ date: `empty-${rows.length}`, shelf: 0, non_shelf: 0 });
    }
    return rows;
  })();
  const idlePrompts = data?.idle_prompts ?? [];

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', bgcolor: dutyColors.desk }}>
      <Box sx={{ flex: 1, overflowY: 'auto', pb: 3, ...thinScrollSx }}>
        <Typography
          noWrap
          sx={{
            px: 2.5,
            pt: 1.5,
            minHeight: 18,
            fontSize: 12.5,
            fontWeight: grades.isError ? 600 : 400,
            color: grades.isError ? dutyColors.red : dutyColors.ink60,
          }}
        >
          {weekNote(data, loading, grades.isError)}
        </Typography>
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

        <GradeBand title="Work cycles" hint="Activity, not a score. Six days of walks and every idle prompt this week." />
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0, 1fr))', gap: 1, mx: 2.5, mb: 1 }}>
          {workDays.map((row) => (
            <Box
              key={row.date}
              sx={{
                minHeight: 72,
                px: 1,
                py: 1,
                borderRadius: '12px',
                bgcolor: dutyColors.card,
                border: `1px solid ${dutyColors.ink08}`,
              }}
            >
              <Typography noWrap sx={{ fontSize: 11, fontWeight: 700, color: dutyColors.ink40 }}>
                {row.date.startsWith('empty') ? ' ' : format(parseISO(row.date), 'EEE')}
              </Typography>
              <Typography sx={{ fontSize: 15, fontWeight: 750, color: dutyColors.ink, fontVariantNumeric: 'tabular-nums' }}>
                {row.shelf + row.non_shelf}
              </Typography>
              <Typography noWrap sx={{ fontSize: 11, color: dutyColors.ink40 }}>
                {row.shelf} shelf · {row.non_shelf} other
              </Typography>
            </Box>
          ))}
        </Box>
        <GradeCard>
          <Typography sx={{ fontSize: 12.5, fontWeight: 700, color: dutyColors.ink, mb: 0.75 }}>
            Idle prompts
          </Typography>
          <Box sx={{ minHeight: 56 }}>
            {idlePrompts.length ? idlePrompts.map((row) => (
              <Typography key={`${row.shown_at}-${row.user_name}`} noWrap sx={{ fontSize: 12.5, color: dutyColors.ink60 }}>
                {row.user_name || 'Someone'} · {format(parseISO(row.shown_at), 'EEE h:mma')} · {row.idle_minutes} min · {row.outcome === 'dismissed' ? 'dismissed' : row.outcome === 'shelf' ? 'shelf' : 'non-shelf'}
              </Typography>
            )) : (
              <Typography sx={{ fontSize: 12.5, color: dutyColors.ink40 }}>
                No idle prompts this week.
              </Typography>
            )}
          </Box>
        </GradeCard>

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
