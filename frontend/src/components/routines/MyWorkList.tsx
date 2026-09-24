import { Box, Button, Typography } from '@mui/material';
import { format, parseISO } from 'date-fns';
import { useState } from 'react';
import type { Routine, RoutineDraft, RoutineRun } from '../../api/routines.api';
import { pick, t } from '../../i18n/routines';
import type { MyWork, WorkItem, WorkSection, WorkState } from '../../pages/routines/myWork';
import { nudgeNote, workAction } from '../../pages/routines/myWork';
import { runGlyphIcon, triggerGlyphIcon } from '../../pages/routines/routineGlyphs';
import { presentRun } from '../../pages/routines/runStatus';
import { GroupHeader } from '../duty/GroupHeader';
import { StatusTag } from '../duty/StatusTag';
import { TaskRow, TaskRowAction, type TaskRowTone } from '../duty/TaskRow';
import type { StatusTagTone } from '../duty/tokens';
import { dutyColors } from '../duty/tokens';

/** One colour per state on every surface: grey later, amber soft nag, red hard nag or late. */
export const NAG_AMBER = '#C98A00';
export const STATE_TAG: Record<WorkState, StatusTagTone> = { later: 'plain', soon: 'amber', now: 'red', late: 'red' };
const STATE_RAIL: Record<WorkState, TaskRowTone> = { later: 'none', soon: 'amber', now: 'red', late: 'red' };
export const STATE_BORDER: Record<WorkState, string> = {
  later: dutyColors.ink15,
  soon: NAG_AMBER,
  now: dutyColors.red,
  late: dutyColors.red,
};
const SECTION_DOT: Record<WorkSection['tone'], string> = { red: dutyColors.red, amber: NAG_AMBER, grey: dutyColors.ink40 };

function runMeta(run: RoutineRun, lang: string): string {
  const where = run.section_name || run.subject;
  const shared = run.assignment === 'pooled'
    ? (run.audience_type === 'shift' ? t('anyoneOnShift', lang) : t('anyoneAssigned', lang))
    : '';
  return [where, shared].filter(Boolean).join(' · ');
}

function WorkTags({ item, lang }: { item: WorkItem; lang: string }) {
  return (
    <>
      <StatusTag small label={item.label} tone={STATE_TAG[item.state]} />
      {item.progress ? <StatusTag small label={`${t('inProgress', lang)} ${item.progress}`} tone="blue" /> : null}
      {item.run.is_blocking ? <StatusTag small label={t('required', lang)} tone="violet" /> : null}
      {item.run.nudge ? <StatusTag small label={nudgeNote(item.run.nudge, lang)} tone="red" /> : null}
    </>
  );
}

/** Section heading with its colour: the same grading as the nag icon. */
function SectionHeader({ section, lang }: { section: WorkSection; lang: string }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 2.5, pt: 1.25, pb: 0.75 }}>
      <Box sx={{ width: 8, height: 8, borderRadius: 99, bgcolor: SECTION_DOT[section.tone], flexShrink: 0 }} />
      <Typography sx={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: dutyColors.ink60 }}>
        {t(section.key, lang)}
      </Typography>
      <Typography sx={{ fontSize: 11, fontWeight: 800, color: dutyColors.ink40 }}>{section.items.length}</Typography>
    </Box>
  );
}

function NextUpCard({ item, lang, onOpen }: { item: WorkItem; lang: string; onOpen: () => void }) {
  const run = item.run;
  const answered = run.progress?.answered ?? 0;
  const total = run.progress?.total ?? 0;
  const pct = total > 0 ? Math.min(100, (answered / total) * 100) : 0;
  const meta = runMeta(run, lang) || pick(run, 'intro', lang) || run.intro;
  return (
    <Box
      sx={{
        mx: 1.5,
        mb: 0.75,
        px: 1.75,
        py: 1.5,
        border: `1.5px solid ${STATE_BORDER[item.state]}`,
        borderRadius: '12px',
        bgcolor: dutyColors.card,
        display: 'flex',
        flexDirection: 'column',
        gap: 0.75,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
        <Typography sx={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.09em', textTransform: 'uppercase', color: dutyColors.ink40 }}>
          {t('nextUp', lang)}
        </Typography>
        <WorkTags item={item} lang={lang} />
      </Box>
      <Typography sx={{ fontSize: 18, fontWeight: 800, color: dutyColors.ink, lineHeight: 1.25 }}>
        {pick(run, 'title', lang) || run.title}
      </Typography>
      {meta ? (
        <Typography noWrap sx={{ fontSize: 12.5, color: dutyColors.ink60 }}>{meta}</Typography>
      ) : null}
      {run.nudge?.message ? (
        <Typography sx={{ fontSize: 13, fontStyle: 'italic', color: dutyColors.red }}>
          “{run.nudge.message}”
        </Typography>
      ) : null}
      {total > 0 ? (
        <Box sx={{ height: 6, borderRadius: 99, bgcolor: dutyColors.ink08, overflow: 'hidden' }}>
          <Box sx={{ width: `${pct}%`, height: '100%', bgcolor: dutyColors.brand }} />
        </Box>
      ) : null}
      <Button variant="contained" onClick={onOpen} sx={{ height: 44, fontWeight: 800, mt: 0.25 }}>
        {workAction(item, lang)}
      </Button>
    </Box>
  );
}

/**
 * The staff routine list: Today, the nag drawer (`compact`) and the desk runner's side pane.
 * Today's work is graded by colour: Do now (red), Due soon (amber), Later today (grey), the
 * same grading as the nag icon. Then work in progress, later days, anytime routines, done today.
 */
export function MyWorkList({
  work,
  lang,
  onOpenRun,
  onOpenDraft,
  onStartAnytime,
  selectedRunId,
  hero = true,
  compact = false,
}: {
  work: MyWork;
  lang: string;
  onOpenRun: (run: RoutineRun) => void;
  onOpenDraft: (draft: RoutineDraft) => void;
  onStartAnytime: (routine: Routine) => void;
  selectedRunId?: number | null;
  /** Show the "Next up" card for the first thing to do. */
  hero?: boolean;
  /** Drawer view: today's sections and work in progress only. */
  compact?: boolean;
}) {
  const [doneOpen, setDoneOpen] = useState(false);
  const [laterOpen, setLaterOpen] = useState(true);
  const lead = hero ? work.next : null;

  function row(item: WorkItem, comingUp = false) {
    const run = item.run;
    const glyph = item.state === 'late' || item.state === 'now'
      ? 'alert'
      : item.started ? 'progress' : comingUp ? 'week' : 'today';
    return (
      <TaskRow
        key={run.id}
        title={pick(run, 'title', lang) || run.title}
        tone={comingUp ? 'none' : STATE_RAIL[item.state]}
        glyph={runGlyphIcon(glyph)}
        selected={selectedRunId === run.id}
        onClick={() => onOpenRun(run)}
        meta={runMeta(run, lang)}
        tags={<WorkTags item={item} lang={lang} />}
        actions={(
          <TaskRowAction
            label={workAction(item, lang)}
            primary={!comingUp && (item.state === 'now' || item.state === 'late')}
            onClick={() => onOpenRun(run)}
          />
        )}
      />
    );
  }

  return (
    <Box>
      <GroupHeader title={t('toDoToday', lang)} count={work.count} />
      {work.count === 0 ? (
        <Typography sx={{ mx: 2.5, my: 1.25, fontSize: 13, fontWeight: 600, color: dutyColors.green, minHeight: 18 }}>
          {t('allCaughtUp', lang)}
        </Typography>
      ) : null}
      {work.sections.map((section) => (
        <Box key={section.key}>
          <SectionHeader section={section} lang={lang} />
          {section.items.map((item) => (
            item === lead
              ? <NextUpCard key={`next-${item.run.id}`} item={item} lang={lang} onOpen={() => onOpenRun(item.run)} />
              : row(item)
          ))}
        </Box>
      ))}

      {work.drafts.length ? (
        <>
          <GroupHeader title={t('inProgress', lang)} count={work.drafts.length} />
          {work.drafts.map((draft) => (
            <TaskRow
              key={`d${draft.id}`}
              title={draft.routine_title}
              tone="blue"
              glyph={runGlyphIcon('progress')}
              onClick={() => onOpenDraft(draft)}
              meta={[draft.section_name, draft.started_at ? format(parseISO(draft.started_at), 'h:mm a') : ''].filter(Boolean).join(' · ')}
              actions={<TaskRowAction label={t('continue', lang)} primary onClick={() => onOpenDraft(draft)} />}
            />
          ))}
        </>
      ) : null}

      {!compact && work.comingUp.length ? (
        <>
          <GroupHeader
            title={t('comingUp', lang)}
            count={work.comingUp.length}
            collapsed={!laterOpen}
            onToggle={() => setLaterOpen((v) => !v)}
          />
          {laterOpen ? work.comingUp.map((item) => row(item, true)) : null}
        </>
      ) : null}

      {!compact && work.anytime.length ? (
        <>
          <GroupHeader title={t('anytime', lang)} count={work.anytime.length} />
          {work.anytime.map((routine) => (
            <TaskRow
              key={`a${routine.id}`}
              title={pick(routine, 'title', lang) || routine.title}
              tone="none"
              glyph={triggerGlyphIcon('on_demand')}
              onClick={() => onStartAnytime(routine)}
              meta={pick(routine, 'intro', lang) || routine.intro || t('startWhenever', lang)}
              actions={<TaskRowAction label={t('start', lang)} onClick={() => onStartAnytime(routine)} />}
            />
          ))}
        </>
      ) : null}

      {!compact && work.doneToday.length ? (
        <>
          <GroupHeader
            title={t('doneToday', lang)}
            count={work.doneToday.length}
            collapsed={!doneOpen}
            onToggle={() => setDoneOpen((v) => !v)}
          />
          {doneOpen ? work.doneToday.map((run) => {
            const view = presentRun(run, 'done', lang);
            return (
              <TaskRow
                key={`x${run.id}`}
                title={pick(run, 'title', lang) || run.title}
                tone={view.rail}
                glyph={runGlyphIcon(view.glyph)}
                selected={selectedRunId === run.id}
                onClick={() => onOpenRun(run)}
                meta={[run.section_name || run.subject, run.completed_at ? `${t('doneAt', lang)} ${format(parseISO(run.completed_at), 'h:mm a')}` : ''].filter(Boolean).join(' · ')}
                tags={view.badges.map((badge) => <StatusTag key={badge.label} small label={badge.label} tone={badge.tone} />)}
                actions={<TaskRowAction label={view.actionLabel} onClick={() => onOpenRun(run)} />}
              />
            );
          }) : null}
        </>
      ) : null}
    </Box>
  );
}
