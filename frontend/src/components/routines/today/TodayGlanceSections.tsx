import { Box, Button, Skeleton, Typography } from '@mui/material';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Routine, RoutineRun, TodayGlance } from '../../../api/routines.api';
import { t } from '../../../i18n/routines';
import { runDeadlineLabel } from '../../../pages/routines/runDeadline';
import { runUrgency } from '../../../pages/routines/runIsDue';
import { ColumnCard } from '../../duty/ColumnCard';
import { StatusTag } from '../../duty/StatusTag';
import { dutyColors } from '../../duty/tokens';
import { eyebrowSx } from '../../hr/ShiftPicker';
import { GlanceEmptyRow, GlanceRunRow } from './GlanceRunRow';
import { glanceHref } from './useTodayModel';

function runMeta(run: RoutineRun): string {
  const parts = [
    runDeadlineLabel(run),
    run.section_name,
    run.progress && run.progress.total > 0
      ? `${run.progress.answered}/${run.progress.total}`
      : null,
  ].filter(Boolean);
  return parts.join(' · ');
}

function runTone(run: RoutineRun): 'late' | 'hard' | 'none' {
  const urgency = runUrgency(run);
  if (urgency === 'late') return 'late';
  if (urgency === 'hard') return 'hard';
  return 'none';
}

function Section({
  title,
  loading,
  children,
}: {
  title: string;
  loading: boolean;
  children: ReactNode;
}) {
  return (
    <Box>
      <Typography sx={{ ...eyebrowSx, mb: 0.5 }}>{title}</Typography>
      {loading ? (
        <Skeleton variant="rounded" height={68} sx={{ borderRadius: '12px' }} />
      ) : children}
    </Box>
  );
}

function startPct(start: RoutineRun): number {
  return start.progress && start.progress.total > 0
    ? Math.min(100, (start.progress.answered / start.progress.total) * 100)
    : 0;
}

/** Desk hero: the one thing to do next, laid out across the full width. */
function StartWithWide({
  start,
  verifyOf,
  lang,
}: {
  start: RoutineRun | null;
  verifyOf: string | null | undefined;
  lang: string;
}) {
  const navigate = useNavigate();
  const pct = start ? startPct(start) : 0;
  return (
    <Box
      sx={{
        minHeight: 132,
        px: 2.5,
        py: 2,
        border: `1px solid ${start ? dutyColors.brand : dutyColors.ink15}`,
        borderRadius: '12px',
        bgcolor: start ? dutyColors.brandTint : dutyColors.card,
        display: 'grid',
        gridTemplateColumns: '1fr auto',
        columnGap: 3,
        alignItems: 'center',
      }}
    >
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ ...eyebrowSx, mb: 0.5 }}>{t('startWith', lang)}</Typography>
        <Typography noWrap sx={{ fontSize: 24, fontWeight: 900, letterSpacing: '-0.02em', color: dutyColors.ink }}>
          {start ? start.title : t('nothingDue', lang)}
        </Typography>
        <Box sx={{ minHeight: 22, mt: 0.5, display: 'flex', alignItems: 'center', gap: 0.75 }}>
          {start && verifyOf ? (
            <>
              <StatusTag tone="blue" label={t('verifyPrev', lang)} />
              <Typography noWrap sx={{ fontSize: 13, color: dutyColors.ink60 }}>
                {verifyOf}
              </Typography>
            </>
          ) : (
            <Typography noWrap sx={{ fontSize: 13, color: dutyColors.ink60 }}>
              {start ? (start.intro || runMeta(start) || ' ') : t('pickFromDueToday', lang)}
            </Typography>
          )}
        </Box>
        <Box sx={{ mt: 1.25, display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Box sx={{ flex: 1, height: 6, borderRadius: 99, bgcolor: dutyColors.ink08, overflow: 'hidden' }}>
            <Box sx={{ width: `${pct}%`, height: '100%', bgcolor: dutyColors.brand }} />
          </Box>
          <Typography sx={{ width: 64, fontSize: 12.5, fontWeight: 700, color: dutyColors.ink40, fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}>
            {start?.progress && start.progress.total > 0
              ? `${start.progress.answered}/${start.progress.total}`
              : ' '}
          </Typography>
        </Box>
      </Box>
      <Button
        variant="contained"
        disabled={!start}
        onClick={() => { if (start) navigate(glanceHref(start)); }}
        sx={{ height: 52, minWidth: 160, fontSize: 15, fontWeight: 800 }}
      >
        {t(start?.progress && start.progress.answered > 0 ? 'continue' : 'fillIn', lang)}
      </Button>
    </Box>
  );
}

function StartWithCard({
  start,
  verifyOf,
  lang,
}: {
  start: RoutineRun;
  verifyOf: string | null | undefined;
  lang: string;
}) {
  const navigate = useNavigate();
  return (
    <Box
      sx={{
        px: 1.5,
        py: 1.25,
        border: `1px solid ${dutyColors.brand}`,
        borderRadius: '12px',
        bgcolor: dutyColors.brandTint,
        display: 'flex',
        flexDirection: 'column',
        gap: 1,
      }}
    >
      <Typography sx={{ fontSize: 18, fontWeight: 800, color: dutyColors.ink }}>
        {start.title}
      </Typography>
      <Box sx={{ minHeight: 20, display: 'flex', alignItems: 'center', gap: 0.75 }}>
        {verifyOf ? (
          <>
            <StatusTag tone="blue" label={t('verifyPrev', lang)} />
            <Typography noWrap sx={{ fontSize: 12, color: dutyColors.ink40 }}>
              {verifyOf}
            </Typography>
          </>
        ) : (
          <Typography noWrap sx={{ fontSize: 12, color: dutyColors.ink40 }}>
            {start.intro || ' '}
          </Typography>
        )}
      </Box>
      <Box sx={{ height: 6, borderRadius: 99, bgcolor: dutyColors.ink08, overflow: 'hidden' }}>
        <Box
          sx={{
            width: start.progress && start.progress.total > 0
              ? `${Math.min(100, (start.progress.answered / start.progress.total) * 100)}%`
              : 0,
            height: '100%',
            bgcolor: dutyColors.brand,
          }}
        />
      </Box>
      <Button
        variant="contained"
        onClick={() => navigate(glanceHref(start))}
        sx={{ height: 44 }}
      >
        {t(start.progress && start.progress.answered > 0 ? 'continue' : 'fillIn', lang)}
      </Button>
    </Box>
  );
}

export function TodayGlanceSections({
  loading,
  start,
  due,
  drafts,
  workCycle,
  verifyOf,
  lang,
  columns = 1,
}: {
  loading: boolean;
  start: RoutineRun | null;
  due: RoutineRun[];
  drafts: TodayGlance['drafts'];
  workCycle: Routine | null;
  verifyOf: string | null | undefined;
  lang: string;
  columns?: 1 | 3;
}) {
  if (columns === 3) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minHeight: 0, height: '100%' }}>
        {loading ? (
          <Skeleton variant="rounded" height={132} sx={{ borderRadius: '12px' }} />
        ) : (
          <StartWithWide start={start} verifyOf={verifyOf} lang={lang} />
        )}
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 2, flex: 1, minHeight: 0, alignItems: 'stretch' }}>
          <ColumnCard title={t('dueToday', lang)} count={due.length} loading={loading} empty={t('nothingDue', lang)}>
            {due.map((run) => (
              <GlanceRunRow
                key={run.id}
                title={run.title}
                meta={runMeta(run)}
                href={glanceHref(run)}
                urgency={runTone(run)}
                lang={lang}
              />
            ))}
          </ColumnCard>
          <ColumnCard title={t('inProgress', lang)} count={drafts.length} loading={loading} empty={t('nothingInProgress', lang)}>
            {drafts.map((draft) => (
              <GlanceRunRow
                key={draft.id}
                title={draft.routine_title}
                meta={draft.section_name || draft.mode || t('inProgress', lang)}
                href={draft.href}
                lang={lang}
              />
            ))}
          </ColumnCard>
          <ColumnCard title={t('workCycle', lang)} count={workCycle ? 1 : 0} loading={loading} empty={t('nothingDue', lang)}>
            {workCycle ? (
              <GlanceRunRow
                title={workCycle.title}
                meta={workCycle.intro}
                href={`/routines/run/new?routine=${workCycle.id}`}
                lang={lang}
              />
            ) : null}
          </ColumnCard>
        </Box>
      </Box>
    );
  }

  const lists = (
    <>
      <Section title={t('dueToday', lang)} loading={loading}>
        {due.length ? due.map((run) => (
          <GlanceRunRow
            key={run.id}
            title={run.title}
            meta={runMeta(run)}
            href={glanceHref(run)}
            urgency={runTone(run)}
            lang={lang}
          />
        )) : (
          <GlanceEmptyRow text={t('nothingDue', lang)} />
        )}
      </Section>
      <Section title={t('inProgress', lang)} loading={loading}>
        {drafts.length ? drafts.map((draft) => (
          <GlanceRunRow
            key={draft.id}
            title={draft.routine_title}
            meta={draft.section_name || draft.mode || t('inProgress', lang)}
            href={draft.href}
            lang={lang}
          />
        )) : (
          <GlanceEmptyRow text={t('nothingInProgress', lang)} />
        )}
      </Section>
      <Section title={t('workCycle', lang)} loading={loading}>
        {workCycle ? (
          <GlanceRunRow
            title={workCycle.title}
            meta={workCycle.intro}
            href={`/routines/run/new?routine=${workCycle.id}`}
            lang={lang}
          />
        ) : (
          <GlanceEmptyRow text={t('nothingDue', lang)} />
        )}
      </Section>
    </>
  );

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
      <Typography sx={{ ...eyebrowSx }}>{t('dayAtAGlance', lang)}</Typography>
      <Section title={t('startWith', lang)} loading={loading}>
        {start ? (
          <StartWithCard start={start} verifyOf={verifyOf} lang={lang} />
        ) : (
          <GlanceEmptyRow text={t('nothingDue', lang)} />
        )}
      </Section>
      {lists}
    </Box>
  );
}
