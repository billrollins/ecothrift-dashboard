/**
 * Processing Command Center (Dash Update #87): who did what on a day and in its week, and how the room is doing
 * against the goal. Read only, one server call. Leads and the owner see every processor; anyone else sees their own
 * line ("My numbers") with the room beside it. Hours come from the time clock: no punch, no per-hour number.
 */
import {
  Box,
  Button,
  Chip,
  LinearProgress,
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
import { useState } from 'react';
import {
  getProcessingCommandCenter,
  type ProcessingCommandCenter,
  type ProcessingNumbers,
  type ProcessingPace,
  type ProcessingPerson,
} from '../../../api/processingCommandCenter.api';
import { PageHeader } from '../../../components/common/PageHeader';
import { ccTokens } from '../../../theme';
import { formatCurrency, formatCurrencyWhole } from '../../../utils/format';

export type Period = 'day' | 'week';

function longDay(iso: string): string {
  const date = new Date(`${iso}T12:00:00`);
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
}

function shortDay(iso: string): string {
  const date = new Date(`${iso}T12:00:00`);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function shiftDay(iso: string, days: number): string {
  const date = new Date(`${iso}T12:00:00`);
  date.setDate(date.getDate() + days);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function oneDecimal(value: string | null): string {
  return value == null ? '' : Number(value).toFixed(1);
}

/** "12 (64% of dollars)", or just the count when there are no dollars to share. */
export function bigItemsText(numbers: ProcessingNumbers): string {
  if (!numbers.big_items) return '0';
  return numbers.big_share == null ? String(numbers.big_items) : `${numbers.big_items} (${numbers.big_share}% of dollars)`;
}

function GoalCard({ label, actual, goal, note }: { label: string; actual: string; goal: string | null; note: string }) {
  const share = goal && Number(goal) > 0 ? Math.min(Number(actual) / Number(goal), 1) : null;
  return (
    <Paper variant="outlined" sx={{ p: 2, flex: '1 1 240px', minWidth: 0, borderRadius: ccTokens.r }}>
      <Typography sx={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: ccTokens.ink2 }}>
        {label}
      </Typography>
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
          aria-label={`${label}: ${Math.round(share * 100)}% of the goal`}
          sx={{ mt: 1, height: 8, borderRadius: 4 }}
        />
      ) : null}
      <Typography sx={{ fontSize: 13, color: ccTokens.ink2, mt: 0.75 }}>{note}</Typography>
    </Paper>
  );
}

function PaceCard({ label, pace }: { label: string; pace: ProcessingPace }) {
  const known = pace.items_per_hour != null && pace.dollars_per_hour != null;
  return (
    <Paper variant="outlined" sx={{ p: 2, flex: '1 1 240px', minWidth: 0, borderRadius: ccTokens.r }}>
      <Typography sx={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: ccTokens.ink2 }}>
        {label}
      </Typography>
      {known ? (
        <Typography sx={{ fontSize: 26, fontWeight: 750, lineHeight: 1.2, mt: 0.5 }}>
          {formatCurrency(pace.dollars_per_hour)}
          <Box component="span" sx={{ fontSize: 15, fontWeight: 500, color: ccTokens.ink2 }}> an hour</Box>
        </Typography>
      ) : (
        <Typography sx={{ fontSize: 15, color: ccTokens.ink2, mt: 1 }}>No clocked Processing hours yet</Typography>
      )}
      <Typography sx={{ fontSize: 13, color: ccTokens.ink2, mt: 0.75 }}>
        {known ? `${oneDecimal(pace.items_per_hour)} items an hour, people checking in on the clock` : 'Pace needs a clock entry'}
      </Typography>
    </Paper>
  );
}

/** A per-hour cell: the person's number, and for a new hire the room's number beside it. */
function PaceCell({ value, room, isNew, money }: { value: string | null; room: string | null; isNew: boolean; money?: boolean }) {
  const show = (v: string) => (money ? formatCurrency(v) : oneDecimal(v));
  return (
    <TableCell align="right">
      {value == null ? '' : show(value)}
      {isNew && value != null && room != null ? (
        <Typography component="div" sx={{ fontSize: 12, color: ccTokens.ink2 }}>room {show(room)}</Typography>
      ) : null}
    </TableCell>
  );
}

export function CommandCenterTable({
  people,
  period,
  pace,
  me,
  bigItemPrice,
}: {
  people: ProcessingPerson[];
  period: Period;
  pace: ProcessingPace;
  me: number;
  bigItemPrice: string;
}) {
  return (
    <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: ccTokens.r }}>
      <Table size="small" aria-label="Processing numbers by person">
        <TableHead>
          <TableRow>
            <TableCell>Person</TableCell>
            <TableCell align="right">Items</TableCell>
            <TableCell align="right">Tag dollars</TableCell>
            <TableCell align="right">Hours</TableCell>
            <TableCell align="right">Items an hour</TableCell>
            <TableCell align="right">Dollars an hour</TableCell>
            <TableCell align="right">Average tag</TableCell>
            <TableCell align="right">Big items ({formatCurrencyWhole(bigItemPrice)} and up)</TableCell>
            <TableCell align="right">Tag errors</TableCell>
            <TableCell align="right">To Restoration</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {people.length === 0 ? (
            <TableRow>
              <TableCell colSpan={10} sx={{ color: ccTokens.ink2 }}>
                Nobody checked in or clocked Processing hours in this period.
              </TableCell>
            </TableRow>
          ) : null}
          {people.map((person) => {
            const numbers = person[period];
            return (
              <TableRow key={person.user_id} hover data-testid={`processor-${person.user_id}`}>
                <TableCell>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                    <Typography sx={{ fontWeight: 650 }}>
                      {person.name}{person.user_id === me ? ' (you)' : ''}
                    </Typography>
                    {person.is_new ? (
                      <Chip
                        size="small"
                        label="New"
                        sx={{ height: 22, bgcolor: ccTokens.warnTint, color: ccTokens.warnText, fontWeight: 700 }}
                      />
                    ) : null}
                  </Box>
                  {person.is_new && person.first_check_in ? (
                    <Typography sx={{ fontSize: 12, color: ccTokens.ink2 }}>
                      First check-in {shortDay(person.first_check_in)}
                    </Typography>
                  ) : null}
                </TableCell>
                <TableCell align="right">{numbers.items}</TableCell>
                <TableCell align="right">{formatCurrency(numbers.dollars)}</TableCell>
                <TableCell align="right">
                  {numbers.hours == null ? (
                    <Typography component="span" sx={{ fontSize: 12, color: ccTokens.ink3 }}>No clock entry</Typography>
                  ) : oneDecimal(numbers.hours)}
                </TableCell>
                <PaceCell value={numbers.items_per_hour} room={pace.items_per_hour} isNew={person.is_new} />
                <PaceCell value={numbers.dollars_per_hour} room={pace.dollars_per_hour} isNew={person.is_new} money />
                <TableCell align="right">{numbers.average_tag == null ? '' : formatCurrency(numbers.average_tag)}</TableCell>
                <TableCell align="right">{bigItemsText(numbers)}</TableCell>
                <TableCell align="right" sx={numbers.tag_errors ? { color: ccTokens.badText, fontWeight: 700 } : undefined}>
                  {numbers.tag_errors}
                </TableCell>
                <TableCell align="right">{numbers.to_restoration}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableContainer>
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
  const isToday = data.date === data.today;
  const dayLabel = isToday ? 'On the floor today' : `On the floor ${shortDay(data.date)}`;
  const dayNote = data.goal.day
    ? `The day's share of the ${formatCurrencyWhole(data.goal.week)} week goal`
    : data.goal.week
      ? 'Not a Processing day, so no goal'
      : 'No weekly goal set';
  return (
    <>
      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mb: 2.5 }}>
        <GoalCard label={dayLabel} actual={data.room.day_dollars} goal={data.goal.day} note={dayNote} />
        <GoalCard
          label="Week so far"
          actual={data.room.week_dollars}
          goal={data.goal.week}
          note={`Monday ${shortDay(data.week_start)} to ${shortDay(data.date)}. The same number as the Dashboard.`}
        />
        <PaceCard
          label={period === 'day' ? 'Room pace, the day' : 'Room pace, the week'}
          pace={period === 'day' ? data.room.day_average : data.room.week_average}
        />
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap', mb: 1.25 }}>
        <Typography sx={{ fontSize: 16, fontWeight: 750, flex: 1, minWidth: 160 }}>
          {data.can_see_everyone ? 'By person' : 'My numbers'}
        </Typography>
        <ToggleButtonGroup
          size="small"
          exclusive
          value={period}
          onChange={(_, next: Period | null) => { if (next) onPeriod(next); }}
          aria-label="Period"
        >
          <ToggleButton value="day">{isToday ? 'Today' : 'The day'}</ToggleButton>
          <ToggleButton value="week">The week</ToggleButton>
        </ToggleButtonGroup>
      </Box>
      <CommandCenterTable
        people={data.people}
        period={period}
        pace={period === 'day' ? data.room.day_average : data.room.week_average}
        me={data.me}
        bigItemPrice={data.big_item_price}
      />
      <Typography sx={{ fontSize: 13, color: ccTokens.ink2, mt: 1.25, maxWidth: 860 }}>
        An item counts for the person signed in when it was checked in. Hours are Processing punches on the time
        clock; with no punch the per-hour cells stay blank. New means a first check-in in the last {data.new_hire_days} days;
        a new person's pace shows the room's beside it. Tag errors count on the day they were found. The room's
        dollars are the Dashboard's Processing number, so they can differ a little from the lines added up.
      </Typography>
    </>
  );
}

/** `mine`: the My numbers page, only the signed-in person's line even for a lead. */
export default function ProcessingCommandCenterPage({ mine = false }: { mine?: boolean }) {
  const [date, setDate] = useState<string | undefined>(undefined);
  const [period, setPeriod] = useState<Period>('day');
  const query = useQuery({
    queryKey: ['processing-command-center', date ?? 'today', mine],
    queryFn: () => getProcessingCommandCenter(date, mine),
    placeholderData: keepPreviousData,
    refetchInterval: date ? false : 60_000,
  });
  const data = query.data;
  const shown = data?.date ?? date ?? '';
  const atToday = !data || data.date === data.today;

  return (
    <Box sx={{ p: 2.5, pb: 4 }}>
      <PageHeader
        title={data && !data.can_see_everyone ? 'My Processing numbers' : 'Processing Command Center'}
        subtitle={shown ? longDay(shown) : undefined}
        action={(
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <Button size="small" variant="outlined" disabled={!shown} onClick={() => setDate(shiftDay(shown, -1))}>
              Day before
            </Button>
            <TextField
              type="date"
              size="small"
              value={shown}
              onChange={(event) => setDate(event.target.value || undefined)}
              slotProps={{ htmlInput: { max: data?.today, 'aria-label': 'Day' } }}
            />
            <Button size="small" variant="outlined" disabled={atToday} onClick={() => setDate(shiftDay(shown, 1))}>
              Day after
            </Button>
            <Button size="small" variant="contained" disabled={atToday} onClick={() => setDate(undefined)}>
              Today
            </Button>
          </Box>
        )}
      />
      {query.isFetching ? <LinearProgress sx={{ mb: 1 }} /> : <Box sx={{ height: 4, mb: 1 }} />}
      {query.isError ? (
        <Typography color="error">Could not load the numbers. Try again in a moment.</Typography>
      ) : null}
      {data ? <CommandCenterView data={data} period={period} onPeriod={setPeriod} /> : null}
    </Box>
  );
}
