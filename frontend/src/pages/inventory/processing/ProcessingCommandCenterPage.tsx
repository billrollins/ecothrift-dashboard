/**
 * Processing Command Center (Dash Update #87): who did what on a day and in its week, and how the room is doing
 * against the goal. Read only, one server call. Leads and the owner see every processor; anyone else sees their own
 * numbers ("My numbers") with the room under them. Hours come from the time clock: no punch, no per-hour number.
 *
 * The page answers three things in this order: is the room on pace (the cards), what needs a look (plain
 * sentences), and how each person stands. Where the data cannot back a verdict about one person (a shared PC left
 * signed in as someone else) it says so once and judges nobody; the room as a whole is still a fair read.
 */
import ChevronLeft from '@mui/icons-material/ChevronLeft';
import ChevronRight from '@mui/icons-material/ChevronRight';
import {
  Box,
  Button,
  Chip,
  LinearProgress,
  Link,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Fragment, useState } from 'react';
import { useInRouterContext, useSearchParams } from 'react-router-dom';
import {
  getProcessingCommandCenter,
  type ProcessingCommandCenter,
  type ProcessingDay,
  type ProcessingNumbers,
  type ProcessingPace,
  type ProcessingPerson,
  type ProcessingWhole,
} from '../../../api/processingCommandCenter.api';
import { PageHeader } from '../../../components/common/PageHeader';
import { ccTokens } from '../../../theme';
import { formatCurrency, formatCurrencyWhole } from '../../../utils/format';

export type Period = 'day' | 'week';

/** More than this far from the room's dollars an hour reads as above or below the room. */
const ROOM_BAND = 0.1;
const TAG_ERRORS_PATH = '/inventory/tag-errors';

function asDate(iso: string): Date {
  return new Date(`${iso}T12:00:00`);
}

function isoDay(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function longDay(iso: string): string {
  const date = asDate(iso);
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
}

function shortDay(iso: string): string {
  const date = asDate(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function weekday(iso: string, length: 'long' | 'short' = 'long'): string {
  const date = asDate(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleDateString('en-US', { weekday: length });
}

function shiftDay(iso: string, days: number): string {
  const date = asDate(iso);
  date.setDate(date.getDate() + days);
  return isoDay(date);
}

function oneDecimal(value: string | null): string {
  return value == null ? '' : Number(value).toFixed(1);
}

function count(value: number): string {
  return value.toLocaleString('en-US');
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${count(n)} ${n === 1 ? one : many}`;
}

/** "Maria", "Maria and Rhea", "Maria, Rhea and Josh". */
export function nameList(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** Clocked Processing hours with nothing checked in under their own sign-in: the mark of a shared sign-in. */
function clockedWithNothing(numbers: ProcessingNumbers): boolean {
  return numbers.hours != null && Number(numbers.hours) > 0 && numbers.items === 0;
}

/** Not in: no check-ins and not on the Processing clock. (A tag error found that day does not make a line.) */
function notIn(numbers: ProcessingNumbers): boolean {
  return numbers.items === 0 && numbers.hours == null;
}

export type Tone = 'good' | 'plain' | 'warn';

/**
 * How one person stands against the room, in a few plain words, or null when there is nothing fair to say:
 * no pace, a room pace that rests on one person, or a shared sign-in (then the page says so once, above).
 */
export function standing(
  numbers: ProcessingNumbers,
  room: ProcessingPace,
  { shared, isNew }: { shared: boolean; isNew: boolean },
): { text: string; tone: Tone } | null {
  if (shared || numbers.dollars_per_hour == null) return null;
  if (room.dollars_per_hour == null || room.people < 2 || Number(room.dollars_per_hour) <= 0) return null;
  const ratio = Number(numbers.dollars_per_hour) / Number(room.dollars_per_hour);
  if (ratio >= 1 + ROOM_BAND) return { text: 'Above the room', tone: 'good' };
  // A new person under the room is normal, so it is never a warning colour.
  if (ratio <= 1 - ROOM_BAND) return { text: 'Below the room', tone: isNew ? 'plain' : 'warn' };
  return { text: 'With the room', tone: 'plain' };
}

/** The last two days a person checked in, for "up from 103 the day before". Null with fewer than two. */
export function lastTwoDays(days: ProcessingDay[]): { now: ProcessingDay; before: ProcessingDay } | null {
  // Only days with a pace: a day with no punch is no yardstick (round 3: "Down from 463" against a no-punch Monday).
  const paced = days.filter((day) => day.items > 0 && day.items_per_hour != null);
  if (paced.length < 2) return null;
  return { now: paced[paced.length - 1], before: paced[paced.length - 2] };
}

/** "20.6 an hour". */
function perHour(day: ProcessingDay): string {
  return `${oneDecimal(day.items_per_hour)} an hour`;
}

/** A new person's first days in words: the direction of their pace, not a grade. */
export function comingAlong(person: ProcessingPerson): string {
  if (!person.is_new) return '';
  const two = lastTwoDays(person.days);
  if (!two) return '';
  const { now, before } = two;
  const day = `${weekday(now.date, 'short')} ${asDate(now.date).getDate()}`;
  const a = Number(now.items_per_hour);
  const b = Number(before.items_per_hour);
  if (a > b) return `Coming along: ${perHour(now)} on ${day}, up from ${perHour(before)}.`;
  if (a < b) return `${perHour(now)} on ${day}, down from ${perHour(before)}.`;
  return `${perHour(now)} on ${day}, the same as before.`;
}

/** "Tue 27". */
function dayName(iso: string): string {
  return `${weekday(iso, 'short')} ${asDate(iso).getDate()}`;
}

/** A person against their own last day in: the one thing a shared sign-in cannot blur. '' with no earlier day. */
export function ownTrend(person: ProcessingPerson, date: string): { text: string; tone: Tone } | null {
  // Pace against their own last clocked day: never raw counts, never a day with no punch.
  const now = person.days.find((day) => day.date === date);
  const before = person.days.filter((day) => day.date < date && day.items > 0 && day.items_per_hour != null).pop();
  if (!now || !now.items || now.items_per_hour == null || !before) return null;
  const a = Number(now.items_per_hour);
  const b = Number(before.items_per_hour);
  if (a > b) return { text: `Faster than ${dayName(before.date)} (${oneDecimal(before.items_per_hour)} an hour)`, tone: 'good' };
  if (a < b) return { text: `Slower than ${dayName(before.date)} (${oneDecimal(before.items_per_hour)} an hour)`, tone: 'plain' };
  return { text: `Same pace as ${dayName(before.date)}`, tone: 'plain' };
}

/** Days this week, up to `date`, on the Processing clock with nothing under their own sign-in. */
export function idleDays(person: ProcessingPerson, date: string): number {
  return person.days.filter((day) => day.date <= date && day.hours != null && Number(day.hours) > 0 && day.items === 0).length;
}

export type Verdict = { text: string; tone: Tone };

/** The day against its share of the week goal. */
export function dayVerdict(data: ProcessingCommandCenter): Verdict {
  const isToday = data.date === data.today;
  const dollars = Number(data.room.day_dollars);
  const goal = data.goal.day ? Number(data.goal.day) : null;
  if (goal == null) return { text: data.goal.week ? 'Not a Processing day, so no goal' : 'No weekly goal set', tone: 'plain' };
  const gap = Math.abs(dollars - goal);
  if (dollars >= goal) return { text: `Goal met, ${formatCurrencyWhole(gap)} over`, tone: 'good' };
  if (isToday) return { text: `${formatCurrencyWhole(gap)} to go today`, tone: 'plain' };
  return { text: `${formatCurrencyWhole(gap)} short of the goal`, tone: 'warn' };
}

/** The week against where it should be by the picked day: one day's share for each Processing day so far. */
export function weekVerdict(data: ProcessingCommandCenter): Verdict {
  const goal = data.goal.week ? Number(data.goal.week) : null;
  if (goal == null || !data.goal.work_days.length) return { text: 'No weekly goal set', tone: 'plain' };
  const dollars = Number(data.room.week_dollars);
  let daysSoFar = 0;
  for (let on = data.week_start; on <= data.date; on = shiftDay(on, 1)) {
    if (data.goal.work_days.includes((asDate(on).getDay() + 6) % 7)) daysSoFar += 1;
  }
  const due = Math.min((goal / data.goal.work_days.length) * daysSoFar, goal);
  if (dollars >= goal) return { text: `Week goal met, ${formatCurrencyWhole(dollars - goal)} over`, tone: 'good' };
  if (dollars >= due) {
    return { text: `${formatCurrencyWhole(dollars - due)} ahead of the ${formatCurrencyWhole(due)} due by ${weekday(data.date)}`, tone: 'good' };
  }
  return { text: `${formatCurrencyWhole(due - dollars)} behind the ${formatCurrencyWhole(due)} due by ${weekday(data.date)}`, tone: 'warn' };
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

/** Who was in: checked in, or on the Processing clock. */
function inThe(people: ProcessingPerson[], period: Period): ProcessingPerson[] {
  return people.filter((person) => !notIn(person[period]));
}

/**
 * The whole ten-second answer in a few short sentences: how the room did, how fast, what can and cannot be said
 * about people, and who is new and climbing.
 */
export function roomStory(data: ProcessingCommandCenter, period: Period): string {
  const isToday = data.date === data.today;
  const parts: string[] = [];
  if (period === 'day') {
    const verdict = dayVerdict(data);
    const when = isToday ? 'Today' : `${weekday(data.date)} ${shortDay(data.date)}`;
    const goalWords = data.goal.day ? `, ${verdict.text.charAt(0).toLowerCase()}${verdict.text.slice(1)}` : '';
    parts.push(`${when}: the room put ${formatCurrencyWhole(data.room.day_dollars)} on the floor${goalWords}.`);
  } else {
    const verdict = weekVerdict(data);
    const goalWords = data.goal.week ? `, ${verdict.text.charAt(0).toLowerCase()}${verdict.text.slice(1)}` : '';
    parts.push(`Week of ${shortDay(data.week_start)}: ${formatCurrencyWhole(data.room.week_dollars)} on the floor${goalWords}.`);
  }
  const whole = period === 'day' ? data.room.day_whole : data.room.week_whole;
  const people = inThe(data.people, period);
  if (!people.length) {
    parts.push(isToday && period === 'day' ? 'Nobody is on the Processing clock or checking in yet.' : 'Nobody checked in or clocked Processing hours.');
    return parts.join(' ');
  }
  const onClock = people.filter((person) => person[period].hours != null);
  if (whole.hours && whole.items_per_hour != null) {
    parts.push(`${plural(onClock.length, 'person', 'people')} on the Processing clock for ${oneDecimal(whole.hours)} hours, ${oneDecimal(whole.items_per_hour)} items an hour.`);
  }
  const idle = people.filter((person) => clockedWithNothing(person[period]));
  if (idle.length) {
    parts.push(
      `${nameList(idle.map((p) => firstName(p.name)))} had no check-ins under ${idle.length === 1 ? 'their own name' : 'their own names'}, `
      + 'so who did which items is not sure; each person is shown against their own days instead.',
    );
  }
  for (const person of people.filter((p) => p.is_new)) {
    const two = lastTwoDays(person.days.filter((day) => day.date <= data.date));
    if (two && two.now.date === data.date && Number(two.now.items_per_hour) > Number(two.before.items_per_hour)) {
      parts.push(`${firstName(person.name)} (new) is climbing: ${perHour(two.now)}, up from ${perHour(two.before)}.`);
    }
  }
  return parts.join(' ');
}

export type Call = { text: string; link?: { to: string; label: string } };

/** The one to three things the owner should look at, each with its next move. Empty when nothing is off. */
export function needsALook(people: ProcessingPerson[], period: Period, date?: string): Call[] {
  const out: Call[] = [];
  const span = period === 'day' ? '' : ' this week';
  const idle = people.filter((person) => clockedWithNothing(person[period]));
  if (idle.length) {
    const hours = idle.reduce((sum, person) => sum + Number(person[period].hours), 0);
    const one = idle.length === 1;
    // A standing problem says how long it has stood, so it does not read like yesterday's note.
    const running = date && period === 'day'
      ? idle.map((person) => idleDays(person, date)).filter((n) => n > 1)
      : [];
    const streak = running.length ? ` ${running.length === idle.length && running.every((n) => n === running[0])
      ? `This is day ${running[0]} this week.`
      : 'For some, not the first day this week.'}` : '';
    out.push({
      text: `${nameList(idle.map((p) => p.name))} clocked ${hours.toFixed(1)} Processing hours${span} with no check-ins `
        + `under ${one ? 'that sign-in' : 'their own sign-ins'}.${streak} ${one ? 'Those' : 'Their'} items are likely under someone else's name. `
        + `Ask ${one ? 'them' : 'each of them'} to sign in at the PC before checking in.`,
    });
  }
  // The owner checks in now and then without a punch; that is not a missed punch.
  const offClock = people.filter((person) => person[period].items_off_clock > 0 && !person.is_owner);
  if (offClock.length) {
    const parts = offClock.map((p) => `${p.name} (${plural(p[period].items_off_clock, 'item')})`);
    out.push({
      text: `Checked in with no Processing punch${period === 'week' ? ' that day' : ''}: ${nameList(parts)}. `
        + 'No pace can be shown for those items. Add the missing punch in the time clock.',
    });
  }
  const errors = people.filter((person) => person[period].tag_errors > 0);
  if (errors.length) {
    const total = errors.reduce((sum, person) => sum + person[period].tag_errors, 0);
    out.push({
      text: `${plural(total, 'tag error')} found${span}, traced to ${nameList(errors.map((p) => p.name))}.`,
      link: { to: TAG_ERRORS_PATH, label: 'See the tag errors' },
    });
  }
  return out;
}

const LABEL_SX = { fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: ccTokens.ink2 } as const;
const CARD_SX = { p: 2, flex: '1 1 240px', minWidth: 0, minHeight: 148, borderRadius: ccTokens.r } as const;
const TONE_TEXT: Record<Tone, string> = { good: ccTokens.goodText, plain: ccTokens.ink2, warn: ccTokens.warnText };
const SMALL = { fontSize: 13, color: ccTokens.ink2 } as const;

function GoalCard({
  label, actual, goal, verdict, tone, note,
}: {
  label: string; actual: string; goal: string | null; verdict: string; tone: Tone; note: string;
}) {
  const share = goal && Number(goal) > 0 ? Math.min(Number(actual) / Number(goal), 1) : null;
  const bar = tone === 'good' ? ccTokens.good : tone === 'warn' ? ccTokens.warn : ccTokens.brand;
  return (
    <Paper variant="outlined" sx={CARD_SX}>
      <Typography sx={LABEL_SX}>{label}</Typography>
      <Typography sx={{ fontSize: 26, fontWeight: 750, lineHeight: 1.2, mt: 0.5 }}>
        {formatCurrencyWhole(actual)}
        {goal ? (
          <Box component="span" sx={{ fontSize: 15, fontWeight: 500, color: ccTokens.ink2 }}>
            {' '}of {formatCurrencyWhole(goal)}
          </Box>
        ) : null}
      </Typography>
      {share != null ? (
        <LinearProgress
          variant="determinate"
          value={share * 100}
          aria-label={`${label}: ${Math.round((Number(actual) / Number(goal)) * 100)}% of the goal`}
          sx={{
            mt: 1, height: 8, borderRadius: 4, bgcolor: ccTokens.line,
            // No slide: a bar must never show the last day's length under this day's number.
            '& .MuiLinearProgress-bar': { bgcolor: bar, transition: 'none' },
          }}
        />
      ) : null}
      <Typography sx={{ fontSize: 14, fontWeight: 650, color: TONE_TEXT[tone], mt: 0.75 }}>{verdict}</Typography>
      <Typography sx={{ ...SMALL, mt: 0.25 }}>{note}</Typography>
    </Paper>
  );
}

function wholeKnown(whole: ProcessingWhole): boolean {
  return whole.items > 0 && whole.items_per_hour != null && whole.dollars_per_hour != null;
}

/** The room's pace as one: every check-in over every Processing hour, so a shared sign-in cannot blur it. */
function PaceCard({ data }: { data: ProcessingCommandCenter }) {
  const isToday = data.date === data.today;
  const day = data.room.day_whole;
  const week = data.room.week_whole;
  return (
    <Paper variant="outlined" sx={CARD_SX}>
      <Typography sx={LABEL_SX}>{isToday ? 'Room pace today' : `Room pace, ${shortDay(data.date)}`}</Typography>
      {wholeKnown(day) ? (
        <>
          <Typography sx={{ fontSize: 26, fontWeight: 750, lineHeight: 1.2, mt: 0.5 }}>
            {formatCurrencyWhole(day.dollars_per_hour)}
            <Box component="span" sx={{ fontSize: 15, fontWeight: 500, color: ccTokens.ink2 }}> an hour</Box>
          </Typography>
          <Typography sx={{ fontSize: 14, fontWeight: 650, color: ccTokens.ink2, mt: 0.75 }}>
            {oneDecimal(day.items_per_hour)} items an hour
          </Typography>
          <Typography sx={{ ...SMALL, mt: 0.25 }}>
            {count(day.items)} check-ins over {oneDecimal(day.hours)} Processing hours.
            {wholeKnown(week) && data.week_start !== data.date
              ? ` The week: ${formatCurrencyWhole(week.dollars_per_hour)} and ${oneDecimal(week.items_per_hour)} items an hour.`
              : ''}
          </Typography>
        </>
      ) : (
        <Typography sx={{ fontSize: 15, color: ccTokens.ink2, mt: 1 }}>
          {day.items > 0
            ? 'No Processing punches this day, so there is no pace.'
            : isToday ? 'No check-ins yet today.' : 'No check-ins this day.'}
        </Typography>
      )}
    </Paper>
  );
}

/** The three room cards: the day against its goal, the week against where it should be by now, and the pace. */
export function RoomCards({ data }: { data: ProcessingCommandCenter }) {
  const isToday = data.date === data.today;
  const day = dayVerdict(data);
  const week = weekVerdict(data);
  const weekGoal = data.goal.week ? Number(data.goal.week) : null;
  const weekSpan = data.week_start === data.date
    ? `${weekday(data.date)} ${shortDay(data.date)}, the first day of the week.`
    : `Monday ${shortDay(data.week_start)} to ${weekday(data.date)} ${shortDay(data.date)}.`;
  return (
    <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
      <GoalCard
        label={isToday ? 'The room today' : `The room, ${shortDay(data.date)}`}
        actual={data.room.day_dollars}
        goal={data.goal.day}
        verdict={day.text}
        tone={day.tone}
        note={data.goal.day && weekGoal != null
          ? `Tag dollars put on the floor. A day's goal is its share of the ${formatCurrencyWhole(weekGoal)} week.`
          : 'Tag dollars put on the floor.'}
      />
      <GoalCard
        label={isToday ? 'The room this week' : `The room, week of ${shortDay(data.week_start)}`}
        actual={data.room.week_dollars}
        goal={data.goal.week}
        verdict={week.text}
        tone={week.tone}
        note={weekSpan}
      />
      <PaceCard data={data} />
    </Box>
  );
}

/** The week one day at a time: only the days the person was in, with a day that has no punch said in words. */
export function DayStrip({ days, unsure = false }: { days: ProcessingDay[]; unsure?: boolean }) {
  // Days with check-ins only: a day of hours with nothing under the name is already said on the line.
  const worked = days.filter((day) => day.items > 0);
  if (!worked.length) return null;
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(104px, 1fr))', gap: 0.75, maxWidth: 760 }} data-testid="day-strip">
      {worked.map((day) => (
        <Box key={day.date} sx={{ px: 1, py: 0.5, borderRadius: ccTokens.rSm, bgcolor: ccTokens.bg }}>
          <Typography sx={{ fontSize: 12, fontWeight: 700, color: ccTokens.ink2 }}>{dayName(day.date)}</Typography>
          <Typography sx={{ fontSize: 14, fontWeight: 650 }}>{plural(day.items, 'item')}</Typography>
          <Typography sx={{ fontSize: 13, color: unsure ? ccTokens.ink3 : ccTokens.ink2 }}>
            {day.items_per_hour != null ? `${oneDecimal(day.items_per_hour)} an hour` : 'no punch'}
          </Typography>
        </Box>
      ))}
    </Box>
  );
}

function NewChip() {
  return (
    <Chip size="small" label="New" sx={{ height: 22, bgcolor: ccTokens.kraftTint, color: ccTokens.kraftDeep, fontWeight: 700 }} />
  );
}

/** Under a new person's name: when they started, and how their first days are going. */
function newLine(person: ProcessingPerson, date: string): string {
  if (person.first_check_in) {
    const along = comingAlong(person);
    return along || `First check-in ${shortDay(person.first_check_in)}.`;
  }
  const idle = idleDays(person, date);
  const clock = idle ? ` On the clock ${plural(idle, 'day')} this week, nothing under this sign-in yet.` : ' No check-in under this sign-in yet.';
  return person.hired ? `Hired ${shortDay(person.hired)}.${clock}` : clock.trim();
}

/** Under anyone's name when their line cannot show a pace: why, once. */
function whyNoPace(person: ProcessingPerson, numbers: ProcessingNumbers, date: string, period: Period): string {
  if (clockedWithNothing(numbers)) {
    if (person.is_new && !person.first_check_in) return '';
    const n = period === 'day' ? idleDays(person, date) : 0;
    return n > 1 ? `No check-ins under this sign-in, ${n} days this week.` : 'No check-ins under this sign-in.';
  }
  if (numbers.items > 0 && numbers.hours == null) return person.is_owner ? 'The owner, not on the Processing clock.' : 'No punch, so no pace.';
  return '';
}

/** The one word beside a name: against the room when the lines can be trusted, else against their own last day. */
function personStatus(person: ProcessingPerson, numbers: ProcessingNumbers, pace: ProcessingPace, shared: boolean, period: Period, date: string) {
  const vsRoom = standing(numbers, pace, { shared, isNew: person.is_new });
  if (vsRoom) return vsRoom;
  // A new person's climb is already said under the name.
  if (period !== 'day' || (person.is_new && person.first_check_in)) return null;
  return ownTrend(person, date);
}

function StandingText({ value }: { value: { text: string; tone: Tone } | null }) {
  if (!value) return null;
  return (
    <Typography
      component="span"
      sx={{
        display: 'inline-block', fontSize: 13, fontWeight: 650, color: TONE_TEXT[value.tone], whiteSpace: 'nowrap',
        ...(value.tone === 'plain' ? {} : {
          px: 0.75, borderRadius: '6px', bgcolor: value.tone === 'good' ? ccTokens.goodTint : ccTokens.warnTint,
        }),
      }}
    >
      {value.text}
    </Typography>
  );
}

/** "97 (91% of tag dollars)", or just the count. */
export function bigItemsText(numbers: ProcessingNumbers): string {
  if (!numbers.big_items) return '0';
  return numbers.big_share == null ? count(numbers.big_items) : `${count(numbers.big_items)} (${numbers.big_share}% of tag dollars)`;
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography sx={SMALL}>{label}</Typography>
      <Typography sx={{ fontSize: 18, fontWeight: 650, lineHeight: 1.25 }}>{value}</Typography>
      {sub ? <Typography sx={SMALL}>{sub}</Typography> : null}
    </Box>
  );
}

/** The few numbers that answer "how did it go": hours and pace. Nothing here without a punch. */
function PaceTiles({ numbers, room, roomLabel }: { numbers: ProcessingNumbers; room: ProcessingPace | null; roomLabel: string }) {
  if (numbers.hours == null) return null;
  const roomItems = room && room.items_per_hour != null && room.people > 1 ? `${roomLabel}: ${oneDecimal(room.items_per_hour)}` : undefined;
  const roomDollars = room && room.dollars_per_hour != null && room.people > 1 ? `${roomLabel}: ${formatCurrencyWhole(room.dollars_per_hour)}` : undefined;
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', columnGap: 2, rowGap: 1.5, maxWidth: 520 }}>
      <Tile label="Hours" value={oneDecimal(numbers.hours)} />
      {numbers.items_per_hour != null ? <Tile label="Items an hour" value={oneDecimal(numbers.items_per_hour)} sub={roomItems} /> : null}
      {numbers.dollars_per_hour != null ? <Tile label="Dollars an hour" value={formatCurrencyWhole(numbers.dollars_per_hour)} sub={roomDollars} /> : null}
    </Box>
  );
}

/** The rest of a line in one sentence, so a card is a few facts and not nine equal ones. */
export function restOfLine(numbers: ProcessingNumbers, bigItemPrice: string): string {
  if (!numbers.items) return '';
  const parts = [
    `Average tag ${formatCurrency(numbers.average_tag)}`,
    numbers.big_items
      ? `${plural(numbers.big_items, 'big item')} (${formatCurrencyWhole(bigItemPrice)} and up)${numbers.big_share != null ? `, ${numbers.big_share}% of the tag dollars` : ''}`
      : `no big items (${formatCurrencyWhole(bigItemPrice)} and up)`,
    `${count(numbers.to_restoration)} sent to Restoration`,
  ];
  return `${parts.join('. ')}.`;
}

type RowProps = {
  person: ProcessingPerson;
  period: Period;
  pace: ProcessingPace;
  me: number;
  shared: boolean;
  bigItemPrice: string;
  date: string;
};

/** A person on a narrow screen: name, the one word, one line of numbers. The rest is on the desktop table. */
function PersonCard({ person, period, pace, me, shared, date }: RowProps) {
  const numbers = person[period];
  const why = whyNoPace(person, numbers, date, period);
  const pacePart = numbers.items_per_hour != null ? `, ${oneDecimal(numbers.items_per_hour)} an hour` : '';
  return (
    <Paper variant="outlined" sx={{ p: 1.5, borderRadius: ccTokens.r }} data-testid={`processor-${person.user_id}`}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        <Typography sx={{ fontSize: 16, fontWeight: 700 }}>
          {person.name}{person.user_id === me ? ' (you)' : ''}
        </Typography>
        {person.is_new ? <NewChip /> : null}
        <StandingText value={personStatus(person, numbers, pace, shared, period, date)} />
      </Box>
      {person.is_new ? <Typography sx={SMALL}>{newLine(person, date)}</Typography> : null}
      <Typography sx={{ fontSize: 15, mt: 0.5 }}>
        {clockedWithNothing(numbers)
          ? `${oneDecimal(numbers.hours)} hours on the clock.`
          : `${plural(numbers.items, 'item')}, ${formatCurrencyWhole(numbers.dollars)}`
            + `${numbers.hours != null ? `, ${oneDecimal(numbers.hours)} hours` : ''}`}
        {!clockedWithNothing(numbers) ? (
          <Box component="span" sx={{ color: shared ? ccTokens.ink3 : 'inherit' }}>{pacePart}</Box>
        ) : null}
        {!clockedWithNothing(numbers) ? '.' : ''}
        {why ? <Box component="span" sx={{ color: ccTokens.ink2 }}>{` ${why}`}</Box> : null}
      </Typography>
      {numbers.tag_errors ? (
        <Typography sx={{ fontSize: 13, fontWeight: 700, color: ccTokens.badText, mt: 0.5 }}>{plural(numbers.tag_errors, 'tag error')}</Typography>
      ) : null}
      {period === 'week' ? <Box sx={{ mt: 1 }}><DayStrip days={person.days} unsure={shared} /></Box> : null}
    </Paper>
  );
}

const NUM = { align: 'right' as const };

/** A person on a wide screen: one table line, and in the week view their days under it. */
function PersonRows({ person, period, pace, me, shared, date }: RowProps) {
  const numbers = person[period];
  const idle = clockedWithNothing(numbers);
  const why = whyNoPace(person, numbers, date, period);
  const days = period === 'week' && person.days.some((day) => day.items > 0);
  const noBottom = days ? { borderBottom: 'none' } : undefined;
  // With a shared sign-in a person's pace is not sure: it stays, quiet, never bold.
  const paceSx = { ...noBottom, ...(shared ? { color: ccTokens.ink3 } : {}) };
  return (
    <Fragment>
      <TableRow data-testid={`processor-${person.user_id}`}>
        <TableCell sx={noBottom}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <Typography sx={{ fontWeight: 650, whiteSpace: 'nowrap' }}>
              {person.name}{person.user_id === me ? ' (you)' : ''}
            </Typography>
            {person.is_new ? <NewChip /> : null}
            <StandingText value={personStatus(person, numbers, pace, shared, period, date)} />
          </Box>
          {person.is_new ? <Typography sx={SMALL}>{newLine(person, date)}</Typography> : null}
          {why ? <Typography sx={SMALL}>{why}</Typography> : null}
        </TableCell>
        <TableCell {...NUM} sx={noBottom}>{idle ? '' : count(numbers.items)}</TableCell>
        <TableCell {...NUM} sx={noBottom}>{idle ? '' : formatCurrencyWhole(numbers.dollars)}</TableCell>
        <TableCell {...NUM} sx={noBottom}>{oneDecimal(numbers.hours)}</TableCell>
        <TableCell {...NUM} sx={paceSx}>{oneDecimal(numbers.items_per_hour)}</TableCell>
        <TableCell {...NUM} sx={paceSx}>
          {numbers.dollars_per_hour == null ? '' : formatCurrencyWhole(numbers.dollars_per_hour)}
        </TableCell>
        <TableCell {...NUM} sx={noBottom}>{numbers.average_tag == null ? '' : formatCurrency(numbers.average_tag)}</TableCell>
        <TableCell {...NUM} sx={{ ...noBottom, whiteSpace: 'nowrap' }}>
          {numbers.items ? count(numbers.big_items) : ''}
          {numbers.big_items && numbers.big_share != null ? (
            <Typography component="span" sx={{ ...SMALL, ml: 0.75 }}>{numbers.big_share}%</Typography>
          ) : null}
        </TableCell>
        <TableCell {...NUM} sx={{ ...noBottom, ...(numbers.tag_errors ? { color: ccTokens.badText, fontWeight: 700 } : {}) }}>
          {numbers.tag_errors || (numbers.items ? '0' : '')}
        </TableCell>
        <TableCell {...NUM} sx={noBottom}>{numbers.items || numbers.to_restoration ? count(numbers.to_restoration) : ''}</TableCell>
      </TableRow>
      {days ? (
        <TableRow>
          <TableCell colSpan={10} sx={{ pt: 0, pb: 1.5 }}>
            <DayStrip days={person.days} unsure={shared} />
          </TableCell>
        </TableRow>
      ) : null}
    </Fragment>
  );
}

export function CommandCenterTable({
  people,
  period,
  pace,
  whole,
  me,
  bigItemPrice,
  today,
  date,
}: {
  people: ProcessingPerson[];
  period: Period;
  pace: ProcessingPace;
  /** Every check-in over every Processing hour: the "whole room" pace, which adds up on its face. */
  whole: ProcessingWhole;
  me: number;
  bigItemPrice: string;
  today: string;
  date: string;
}) {
  // Only people who were in: checked in, or on the Processing clock.
  const shown = people.filter((person) => !notIn(person[period]));
  const shared = shown.some((person) => clockedWithNothing(person[period]));
  if (shown.length === 0) {
    return (
      <Paper variant="outlined" sx={{ p: 2, borderRadius: ccTokens.r, color: ccTokens.ink2 }}>
        {period === 'week'
          ? 'Nobody checked in or clocked Processing hours this week.'
          : date === today
            ? 'Nobody has checked in or clocked Processing hours yet today.'
            : `Nobody checked in or clocked Processing hours on ${shortDay(date)}.`}
      </Paper>
    );
  }
  const totals = shown.reduce(
    (sum, person) => ({
      items: sum.items + person[period].items,
      dollars: sum.dollars + Number(person[period].dollars),
      hours: sum.hours + Number(person[period].hours ?? 0),
    }),
    { items: 0, dollars: 0, hours: 0 },
  );
  const row = (person: ProcessingPerson): RowProps => ({ person, period, pace, me, shared, bigItemPrice, date });
  return (
    <>
      {shared ? (
        <Typography sx={{ ...SMALL, mb: 1 }} data-testid="no-verdicts">
          Pace is grey while sign-ins are shared: a line may hold another person's items. Ratings against the room come
          back once everyone on the clock checks in under their own name.
        </Typography>
      ) : null}
      {/* Wide screens: the table. */}
      <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: ccTokens.r, display: { xs: 'none', lg: 'block' } }}>
        <Table size="small" aria-label="Processing numbers by person" sx={{ '& td, & th': { px: 1.25 } }}>
          <TableHead>
            <TableRow sx={{ '& th': { verticalAlign: 'bottom', lineHeight: 1.3 } }}>
              <TableCell>Person</TableCell>
              <TableCell {...NUM}>Items</TableCell>
              <TableCell {...NUM}>Tag dollars</TableCell>
              <TableCell {...NUM}>Hours</TableCell>
              <TableCell {...NUM}>Items an hour</TableCell>
              <TableCell {...NUM}>Dollars an hour</TableCell>
              <TableCell {...NUM}>Average tag</TableCell>
              <TableCell {...NUM}>
                Big items
                <Typography component="div" sx={{ fontSize: 12, color: ccTokens.ink2, whiteSpace: 'nowrap' }}>
                  {formatCurrencyWhole(bigItemPrice)} and up, share of dollars
                </Typography>
              </TableCell>
              <TableCell {...NUM}>Tag errors</TableCell>
              <TableCell {...NUM}>To Restoration</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {shown.map((person) => <PersonRows key={person.user_id} {...row(person)} />)}
            <TableRow data-testid="room-line" sx={{ '& td': { borderBottom: 'none', fontWeight: 650, bgcolor: ccTokens.bg } }}>
              <TableCell>The whole room</TableCell>
              <TableCell {...NUM}>{count(totals.items)}</TableCell>
              <TableCell {...NUM}>{formatCurrencyWhole(totals.dollars)}</TableCell>
              <TableCell {...NUM}>{totals.hours ? totals.hours.toFixed(1) : ''}</TableCell>
              <TableCell {...NUM}>{wholeKnown(whole) ? oneDecimal(whole.items_per_hour) : ''}</TableCell>
              <TableCell {...NUM}>{wholeKnown(whole) ? formatCurrencyWhole(whole.dollars_per_hour) : ''}</TableCell>
              <TableCell colSpan={4} />
            </TableRow>
          </TableBody>
        </Table>
      </TableContainer>
      {/* Narrow screens: one card a person, so a name never slides away from its pace. */}
      <Box sx={{ display: { xs: 'flex', lg: 'none' }, flexDirection: 'column', gap: 1.5 }}>
        {shown.map((person) => <PersonCard key={person.user_id} {...row(person)} />)}
        <Typography sx={SMALL} data-testid="room-line-narrow">
          The whole room: {plural(totals.items, 'item')}, {formatCurrencyWhole(totals.dollars)} in tags
          {totals.hours ? `, ${totals.hours.toFixed(1)} hours` : ''}
          {wholeKnown(whole) ? `, ${oneDecimal(whole.items_per_hour)} items an hour` : ''}.
        </Typography>
      </Box>
    </>
  );
}

function PeriodToggle({ period, onPeriod }: { period: Period; onPeriod: (period: Period) => void }) {
  return (
    <ToggleButtonGroup
      size="small"
      exclusive
      value={period}
      onChange={(_, next: Period | null) => { if (next) onPeriod(next); }}
      aria-label="Show the day or the week"
      sx={{ '& .MuiToggleButton-root': { textTransform: 'none', px: 2, minHeight: 44 } }}
    >
      <ToggleButton value="day">The day</ToggleButton>
      <ToggleButton value="week">The week</ToggleButton>
    </ToggleButtonGroup>
  );
}

const NOTE_SX = { ...SMALL, maxWidth: 860 } as const;

/** The owner's and leads' view: the answer in words, the room, then people with what needs a look. */
function EveryoneView({ data, period, onPeriod }: { data: ProcessingCommandCenter; period: Period; onPeriod: (period: Period) => void }) {
  const isToday = data.date === data.today;
  const pace = period === 'day' ? data.room.day_average : data.room.week_average;
  const whole = period === 'day' ? data.room.day_whole : data.room.week_whole;
  const shownPeople = data.people.filter((person) => !notIn(person[period]) || person[period].tag_errors > 0);
  const calls = needsALook(shownPeople, period, data.date);
  const lines = shownPeople.reduce((sum, person) => sum + Number(person[period].dollars), 0);
  const room = Number(period === 'day' ? data.room.day_dollars : data.room.week_dollars);
  const gap = Math.abs(lines - room) >= 1;
  const span = period === 'day' ? (isToday ? 'today' : shortDay(data.date)) : `week of ${shortDay(data.week_start)}`;
  return (
    <>
      <Typography sx={{ fontSize: { xs: 15, sm: 17 }, lineHeight: 1.45, fontWeight: 550, mb: 2, maxWidth: 980 }} data-testid="room-story">
        {roomStory(data, period)}
      </Typography>
      <RoomCards data={data} />

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap', mt: 2.5, mb: 1.25 }}>
        <Typography sx={{ fontSize: 16, fontWeight: 750, flex: 1, minWidth: 160 }}>People, {span}</Typography>
        <PeriodToggle period={period} onPeriod={onPeriod} />
      </Box>

      {calls.length ? (
        <Paper
          variant="outlined"
          data-testid="needs-a-look"
          sx={{ mb: 1.5, p: 2, borderRadius: ccTokens.r, bgcolor: ccTokens.warnTint, borderColor: ccTokens.warn }}
        >
          <Typography sx={{ ...LABEL_SX, color: ccTokens.warnText }}>Needs a look, {span}</Typography>
          <Box component="ul" sx={{ m: 0, mt: 0.5, pl: 2.5 }}>
            {calls.map((call) => (
              <Typography component="li" key={call.text} sx={{ fontSize: 14, color: ccTokens.ink, mt: 0.25 }}>
                {call.text}
                {call.link ? <>{' '}<Link href={call.link.to} sx={{ fontWeight: 650 }}>{call.link.label}</Link></> : null}
              </Typography>
            ))}
          </Box>
        </Paper>
      ) : null}

      <CommandCenterTable
        people={data.people}
        period={period}
        pace={pace}
        whole={whole}
        me={data.me}
        bigItemPrice={data.big_item_price}
        today={data.today}
        date={data.date}
      />
      <Typography sx={{ ...NOTE_SX, mt: 1.25 }}>
        {gap ? (
          <span data-testid="gap-note">
            Checked in: {formatCurrencyWhole(lines)}. Put on the floor, the room card: {formatCurrencyWhole(room)}. They differ
            by items sent to Restoration (on a line now, in the room when they come back) and items put out without a check-in.{' '}
          </span>
        ) : null}
        An item counts for whoever is signed in when it is checked in. Pace needs a Processing punch that day.
      </Typography>
    </>
  );
}

/** "More each day: 16, 103, 150." when a week climbs; '' otherwise. */
export function weekClimb(days: ProcessingDay[]): string {
  const paced = days.filter((day) => day.items > 0 && day.items_per_hour != null);
  if (paced.length < 2) return '';
  const climbing = paced.every((day, n) => n === 0 || Number(day.items_per_hour) > Number(paced[n - 1].items_per_hour));
  return climbing ? `Faster each clocked day: ${paced.map((day) => oneDecimal(day.items_per_hour)).join(', ')} items an hour.` : '';
}

/** The person against their own days, in words: the fair yardstick while sign-ins are shared. */
export function mineTrend(person: ProcessingPerson, date: string): string {
  const now = person.days.find((day) => day.date === date);
  const before = person.days.filter((day) => day.date < date && day.items > 0 && day.items_per_hour != null);
  const last = before[before.length - 1];
  if (!now || !now.items || now.items_per_hour == null || !last) return '';
  const a = Number(now.items_per_hour);
  const best = before.every((day) => a > Number(day.items_per_hour));
  if (a > Number(last.items_per_hour)) {
    return `Faster than ${dayName(last.date)}: ${oneDecimal(now.items_per_hour)} an hour, up from ${oneDecimal(last.items_per_hour)}.${best && before.length > 1 ? ' Your best pace so far.' : ''}`;
  }
  if (a < Number(last.items_per_hour)) return `${oneDecimal(last.items_per_hour)} an hour on ${dayName(last.date)}.`;
  return `The same pace as ${dayName(last.date)}.`;
}

function Score({ label, value }: { label: string; value: string }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography sx={{ fontSize: { xs: 30, sm: 34 }, fontWeight: 800, lineHeight: 1.1 }}>{value}</Typography>
      <Typography sx={{ fontSize: 14, color: ccTokens.ink2, mt: 0.25 }}>{label}</Typography>
    </Box>
  );
}

function Fact({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography sx={{ fontSize: 14 }}>
        <Box component="span" sx={{ fontWeight: 700 }}>{value}</Box> {label}
      </Typography>
      <Typography sx={SMALL}>{hint}</Typography>
    </Box>
  );
}

/** The room, quietly, for the same span the person picked. */
function RoomLine({ data, period }: { data: ProcessingCommandCenter; period: Period }) {
  const whole = period === 'day' ? data.room.day_whole : data.room.week_whole;
  const verdict = period === 'day' ? dayVerdict(data) : weekVerdict(data);
  const dollars = period === 'day' ? data.room.day_dollars : data.room.week_dollars;
  const span = period === 'day' ? (data.date === data.today ? 'today' : shortDay(data.date)) : `the week of ${shortDay(data.week_start)}`;
  const goal = period === 'day' ? data.goal.day : data.goal.week;
  return (
    <Paper variant="outlined" sx={{ p: 2, borderRadius: ccTokens.r }} data-testid="room-line-mine">
      <Typography sx={LABEL_SX}>The whole room, {span}</Typography>
      <Typography sx={{ fontSize: 15, mt: 0.5 }}>
        {formatCurrencyWhole(dollars)} in tag dollars put on the floor
        {goal ? <>, <Box component="span" sx={{ color: TONE_TEXT[verdict.tone], fontWeight: 650 }}>{verdict.text.charAt(0).toLowerCase() + verdict.text.slice(1)}</Box></> : null}.
        {whole.items_per_hour != null ? ` ${oneDecimal(whole.items_per_hour)} items an hour across everyone on the clock.` : ''}
      </Typography>
    </Paper>
  );
}

/** One processor's own page: their day as a scoreboard, their climb in words, one note, then the room. */
function MineView({ data, period, onPeriod }: { data: ProcessingCommandCenter; period: Period; onPeriod: (period: Period) => void }) {
  const isToday = data.date === data.today;
  const person = data.people[0];
  const shared = data.room.shared_sign_in?.[period] ?? false;
  const span = period === 'day' ? (isToday ? 'today' : shortDay(data.date)) : `week of ${shortDay(data.week_start)}`;
  const when = period === 'day' ? (isToday ? 'today' : 'this day') : 'this week';
  if (!person) return <RoomLine data={data} period={period} />;
  const numbers = person[period];
  const idle = clockedWithNothing(numbers);
  const trend = period === 'day' ? mineTrend(person, data.date) : weekClimb(person.days);
  const daysIn = person.days.filter((day) => day.hours != null && Number(day.hours) > 0).length;
  const fixed = numbers.tag_errors_fixed ?? 0;
  return (
    <>
      <Paper variant="outlined" sx={{ p: { xs: 2, sm: 2.5 }, borderRadius: ccTokens.r }} data-testid={`processor-${person.user_id}`}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap', mb: 1.5 }}>
          <Typography sx={{ ...LABEL_SX, flex: 1, minWidth: 120 }}>You, {span}</Typography>
          {person.is_new ? <NewChip /> : null}
          <PeriodToggle period={period} onPeriod={onPeriod} />
        </Box>

        {notIn(numbers) ? (
          <Typography sx={{ fontSize: 16, color: ccTokens.ink2 }}>
            {isToday && period === 'day'
              ? 'Nothing under your name yet today. Your numbers show here as you check in.'
              : `Nothing under your name ${when}.`}
          </Typography>
        ) : idle ? (
          <>
            <Score
              label={period === 'day' ? `in Processing ${when}` : `in Processing ${when}, ${plural(daysIn, 'day')}`}
              value={`${oneDecimal(numbers.hours)} hours`}
            />
            <Typography sx={{ fontSize: 15, mt: 1.25, maxWidth: 600 }}>
              Thank you for the time. {period === 'day'
                ? `The room put ${formatCurrencyWhole(data.room.day_dollars)} on the floor ${when}, and your hours were part of it.`
                : `The room put ${formatCurrencyWhole(data.room.week_dollars)} on the floor ${when}, and your hours were part of it.`}
            </Typography>
            <Typography sx={{ ...SMALL, fontSize: 14, mt: 1.25, maxWidth: 600 }} data-testid="sign-in-note">
              None of your check-ins are under your name, so they count on someone else's line. Next time, sign in as
              yourself at the PC before you check in. If you think items are missing, tell your lead.
            </Typography>
          </>
        ) : (
          <>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', sm: 'repeat(3, minmax(0, 1fr))' }, gap: 2, maxWidth: 640 }}>
              <Score label="items checked in" value={count(numbers.items)} />
              <Score label="in tag dollars" value={formatCurrencyWhole(numbers.dollars)} />
              {numbers.items_per_hour != null ? <Score label="items an hour" value={oneDecimal(numbers.items_per_hour)} /> : null}
            </Box>
            {trend ? (
              <Typography sx={{ fontSize: 17, fontWeight: 700, color: ccTokens.goodText, mt: 1.5 }} data-testid="up-line">{trend}</Typography>
            ) : null}
            {numbers.hours == null ? (
              <Typography sx={{ ...SMALL, mt: 1 }}>
                {isToday && period === 'day'
                  ? 'Not clocked in to Processing yet today, so no per-hour number yet.'
                  : `Not clocked in to Processing ${when}, so no per-hour number.`}
              </Typography>
            ) : (
              <Typography sx={{ ...SMALL, mt: 1 }}>
                {oneDecimal(numbers.hours)} hours in Processing, {formatCurrencyWhole(numbers.dollars_per_hour)} in tag dollars an hour.
                {numbers.items_off_clock > 0 ? ` ${plural(numbers.items_off_clock, 'item')} came on a day you were not clocked in, so the per-hour numbers leave them out.` : ''}
              </Typography>
            )}
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 1.25, mt: 2, maxWidth: 720 }}>
              <Fact label="average tag" value={formatCurrency(numbers.average_tag)} hint="Your tag dollars over your items." />
              <Fact
                label={`${numbers.big_items === 1 ? 'big item' : 'big items'} (${formatCurrencyWhole(data.big_item_price)} and up)`}
                value={count(numbers.big_items)}
                hint={numbers.big_share != null && numbers.big_items
                  ? `They carry ${numbers.big_share}% of your tag dollars. More is good: big items move the goal.`
                  : 'Big items move the goal fastest.'}
              />
              <Fact label="sent to Restoration" value={count(numbers.to_restoration)} hint="Items that need a fix first. Neither good nor bad: it is where they belong." />
              <Fact
                label={numbers.tag_errors === 1 ? 'tag error' : 'tag errors'}
                value={count(numbers.tag_errors)}
                hint={numbers.tag_errors
                  ? `${fixed === numbers.tag_errors ? (fixed === 1 ? 'Already fixed.' : 'All already fixed.') : fixed ? `${fixed} already fixed.` : 'Wrong tags found on your items.'} Fewer is better.`
                  : 'Wrong tags found on your items. None is the goal.'}
              />
            </Box>
            {period === 'week' ? <Box sx={{ mt: 2 }}><DayStrip days={person.days} /></Box> : null}
            {shared ? (
              <Typography sx={{ ...SMALL, mt: 2, maxWidth: 640 }} data-testid="shared-note">
                Some people on the clock {when} had nothing under their own name, so some of these items may be theirs.
                Signing out when you step away keeps your numbers your own. Your lead sees the same note.
              </Typography>
            ) : null}
          </>
        )}
        {numbers.tag_errors > 0 && (notIn(numbers) || idle) ? (
          <Typography sx={{ fontSize: 14, mt: 1.25 }} data-testid="my-tag-errors">
            {plural(numbers.tag_errors, 'tag error')} found on your items {when}{fixed ? `, ${fixed === numbers.tag_errors ? 'already fixed' : `${fixed} already fixed`}` : ''}.
          </Typography>
        ) : null}
        {numbers.tag_errors > 0 ? (
          <Link href={TAG_ERRORS_PATH} sx={{ fontSize: 14, fontWeight: 650, display: 'inline-block', mt: 0.5 }}>See which ones</Link>
        ) : null}
      </Paper>

      <Box sx={{ mt: 2 }}><RoomLine data={data} period={period} /></Box>
      <Typography sx={{ ...NOTE_SX, mt: 1.25 }}>
        An item counts for whoever is signed in when it is checked in. Your lead and the owner see these same numbers and
        notes on the Command Center.
      </Typography>
    </>
  );
}

export function CommandCenterView({
  data,
  period,
  onPeriod,
}: {
  data: ProcessingCommandCenter;
  period: Period;
  onPeriod: (period: Period) => void;
}) {
  return data.can_see_everyone
    ? <EveryoneView data={data} period={period} onPeriod={onPeriod} />
    : <MineView data={data} period={period} onPeriod={onPeriod} />;
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** The picked day lives in the address (`?date=2026-10-28`), so a day can be reloaded or sent to a lead. */
function useDayInAddress(): [string | undefined, (next: string | undefined) => void] {
  const [params, setParams] = useSearchParams();
  const raw = params.get('date') ?? '';
  const set = (next: string | undefined) => {
    const copy = new URLSearchParams(params);
    if (next) copy.set('date', next); else copy.delete('date');
    setParams(copy, { replace: true });
  };
  return [ISO_DAY.test(raw) ? raw : undefined, set];
}

/** The page's shape before the numbers land, so nothing moves when they do. */
function Holding() {
  return (
    <Box aria-hidden data-testid="holding">
      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
        {[0, 1, 2].map((n) => <Paper key={n} variant="outlined" sx={CARD_SX} />)}
      </Box>
      <Paper variant="outlined" sx={{ mt: 2.5, minHeight: 220, borderRadius: ccTokens.r }} />
    </Box>
  );
}

function PageBody({ mine, date, setDate }: { mine: boolean; date: string | undefined; setDate: (next: string | undefined) => void }) {
  const [period, setPeriod] = useState<Period>('day');
  const query = useQuery({
    queryKey: ['processing-command-center', date ?? 'today', mine],
    queryFn: () => getProcessingCommandCenter(date, mine),
    placeholderData: keepPreviousData,
    refetchInterval: date ? false : 60_000,
  });
  const data = query.data;
  // Known before the answer: the day in the address, or this device's today. So the header never moves.
  const shown = data?.date ?? date ?? isoDay(new Date());
  const atToday = data ? data.date === data.today : !date;
  const stepSx = { minWidth: 44, minHeight: 44, px: 0 } as const;

  return (
    <Box sx={{ p: { xs: 0.5, sm: 2.5 }, pb: 4, minHeight: '101vh' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', columnGap: 2, rowGap: 1, mb: 1 }}>
        <Box sx={{ minWidth: 0, '& > div': { mb: 0 } }}>
          <PageHeader
            dense
            title={mine || (data && !data.can_see_everyone) ? 'My numbers' : 'Processing Command Center'}
            subtitle={longDay(shown)}
          />
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, maxWidth: '100%' }}>
          <Button variant="outlined" aria-label="Day before" onClick={() => setDate(shiftDay(shown, -1))} sx={stepSx}>
            <ChevronLeft />
          </Button>
          <TextField
            type="date"
            size="small"
            value={shown}
            onChange={(event) => setDate(event.target.value && event.target.value !== data?.today ? event.target.value : undefined)}
            slotProps={{ htmlInput: { max: data?.today, 'aria-label': 'Day' } }}
            sx={{ minWidth: 0, flex: '0 1 170px', '& .MuiInputBase-root': { minHeight: 44 } }}
          />
          <Button variant="outlined" aria-label="Day after" disabled={atToday} onClick={() => setDate(shiftDay(shown, 1) >= (data?.today ?? '') ? undefined : shiftDay(shown, 1))} sx={stepSx}>
            <ChevronRight />
          </Button>
          <Button variant="outlined" disabled={atToday} onClick={() => setDate(undefined)} sx={{ minHeight: 44 }}>
            Today
          </Button>
        </Box>
      </Box>
      {query.isFetching ? <LinearProgress sx={{ mb: 1.5 }} /> : <Box sx={{ height: 4, mb: 1.5 }} />}
      {query.isError ? (
        <Typography color="error" sx={{ mb: 1.5 }}>Could not load the numbers. Try again in a moment.</Typography>
      ) : null}
      {data ? <CommandCenterView data={data} period={period} onPeriod={setPeriod} /> : query.isError ? null : <Holding />}
    </Box>
  );
}

function PageWithAddress({ mine }: { mine: boolean }) {
  const [date, setDate] = useDayInAddress();
  return <PageBody mine={mine} date={date} setDate={setDate} />;
}

function PageWithState({ mine }: { mine: boolean }) {
  const [date, setDate] = useState<string | undefined>(undefined);
  return <PageBody mine={mine} date={date} setDate={setDate} />;
}

/** `mine`: the My numbers page, only the signed-in person's line even for a lead. */
export default function ProcessingCommandCenterPage({ mine = false }: { mine?: boolean }) {
  return useInRouterContext() ? <PageWithAddress mine={mine} /> : <PageWithState mine={mine} />;
}
