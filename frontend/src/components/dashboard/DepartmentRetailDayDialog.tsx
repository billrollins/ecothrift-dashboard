import {
  Box,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Link,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import Close from '@mui/icons-material/Close';
import { useQuery } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { Link as RouterLink } from 'react-router-dom';
import { getQaDaySummary, type RetailDaySummary } from '../../api/routines.api';
import { isoWeekKey, weekRangeLabel } from '../../pages/admin/routines/gradeWeek';
import { ccTokens } from '../../theme';

export type RetailSummaryMode = 'day' | 'week';

export type LetterTileTone = 'green' | 'amber' | 'red' | 'grey';

const TILE_TONE: Record<LetterTileTone, { bg: string; fg: string }> = {
  green: { bg: '#dfeedb', fg: ccTokens.good },
  amber: { bg: '#f5eedc', fg: ccTokens.warnText },
  red: { bg: ccTokens.badTint, fg: ccTokens.bad },
  grey: { bg: ccTokens.neuTint, fg: ccTokens.neu },
};

/** A/B green, C/D amber, F red. Plus/minus follow the letter. F is never amber. */
export function letterTileTone(letter: string | null | undefined): LetterTileTone {
  const band = (letter || '').trim().toUpperCase().charAt(0);
  if (band === 'A' || band === 'B') return 'green';
  if (band === 'C' || band === 'D') return 'amber';
  if (band === 'F') return 'red';
  return 'grey';
}

export function formatSummaryScore(score: number | null | undefined): string {
  return score == null ? '\u2014' : String(Math.round(score));
}

export function formatDueDate(iso: string | null | undefined): string {
  if (!iso) return '';
  return format(parseISO(iso), 'EEE MMM d');
}

export function crossPendingLabel(dueDate: string | null | undefined): string {
  const when = formatDueDate(dueDate);
  return when ? `Pending until ${when}` : 'Pending';
}

export const DEFAULT_GRADE_SCALE = { a: 90, b: 80, c: 70, d: 60 };

export function goalThreshold(
  goalLetter: string | null | undefined,
  scale: { a: number; b: number; c: number; d: number } = DEFAULT_GRADE_SCALE,
): number {
  const band = (goalLetter || 'B').trim().toUpperCase().charAt(0);
  if (band === 'A') return scale.a;
  if (band === 'C') return scale.c;
  if (band === 'D') return scale.d;
  if (band === 'F') return 0;
  return scale.b;
}

export function isIdleState(state: string | null | undefined): boolean {
  return state === 'pending' || state === 'none' || state === 'not_yet';
}

export function thirdTone(
  score: number | null | undefined,
  state: string | null | undefined,
  threshold: number,
): LetterTileTone {
  if (isIdleState(state) || score == null) return 'grey';
  if (score <= 0) return 'red';
  if (score >= threshold) return 'green';
  return 'amber';
}

export function thirdScoreDisplay(
  score: number | null | undefined,
  state: string | null | undefined,
): string {
  if (isIdleState(state) || score == null) return '\u2014';
  return String(Math.round(score));
}

export function doDetailLine(row: NonNullable<RetailDaySummary['do']>): string {
  return `${row.section_checks.done} of ${row.section_checks.expected} section checks · ${row.open_day_close.done} of ${row.open_day_close.expected} open/day/close`;
}

export function spotDetailLine(row: NonNullable<RetailDaySummary['spot']>): string {
  const walks = row.walks.done;
  const score = row.score == null ? '\u2014' : Math.round(row.score);
  return `${walks} walk${walks === 1 ? '' : 's'} · ${score}`;
}

export function spotStatusCopy(state: string | null | undefined): string | null {
  if (state === 'none') return 'No walk that day';
  if (state === 'not_yet') return 'No walk yet';
  return null;
}

export function crossDetailLine(row: NonNullable<RetailDaySummary['cross']>): string {
  const due = row.due_date ? ` · due ${formatDueDate(row.due_date)}` : '';
  return `${row.done} of ${row.due}${due}`;
}

const CARD_TONE: Record<LetterTileTone, { bg: string; fg: string }> = {
  green: { bg: ccTokens.goodTint, fg: ccTokens.goodText },
  amber: { bg: ccTokens.warnTint, fg: ccTokens.warnText },
  red: { bg: ccTokens.badTint, fg: ccTokens.badText },
  grey: { bg: ccTokens.neuTint, fg: ccTokens.ink2 },
};

function ThirdCard({
  name,
  weight,
  score,
  state,
  threshold,
  description,
  detail,
  pending,
}: {
  name: string;
  weight: number;
  score: number | null | undefined;
  state?: string | null;
  threshold: number;
  description: string;
  detail: string;
  pending?: string | null;
}) {
  const tone = thirdTone(score, state, threshold);
  const colors = CARD_TONE[tone];
  const status = pending || spotStatusCopy(state);
  return (
    <Box
      data-testid={`retail-${name.toLowerCase()}-card`}
      data-tone={tone}
      sx={{
        flex: '1 1 0',
        minWidth: 0,
        minHeight: 248,
        p: '24px',
        borderRadius: '12px',
        bgcolor: colors.bg,
        display: 'flex',
        flexDirection: 'column',
        gap: 1,
      }}
    >
      <Typography sx={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', color: ccTokens.ink }}>
        {name} · {weight}%
      </Typography>
      <Typography sx={{ fontSize: 28, fontWeight: 700, lineHeight: 1, whiteSpace: 'nowrap', color: colors.fg }}>
        {thirdScoreDisplay(score, state)}
      </Typography>
      <Typography sx={{ fontSize: 13, fontWeight: 400, color: ccTokens.ink2, lineHeight: 1.35 }}>
        {description}
      </Typography>
      <Typography
        sx={{
          mt: 'auto',
          fontSize: 13,
          fontWeight: 600,
          whiteSpace: 'nowrap',
          color: status ? ccTokens.ink2 : ccTokens.ink,
        }}
      >
        {status || detail}
      </Typography>
    </Box>
  );
}

export function formatHeadingDate(iso: string): string {
  return format(parseISO(iso), 'EEE MMM d');
}

export function summaryHeading(
  mode: RetailSummaryMode,
  data: RetailDaySummary | null,
  date?: string,
  week?: string,
): string {
  if (mode === 'week') {
    const key = data?.week || week;
    return key ? weekRangeLabel(key) : 'This week';
  }
  const iso = data?.date || date;
  return iso ? formatHeadingDate(iso) : 'Retail';
}

interface DepartmentRetailDayDialogProps {
  open: boolean;
  onClose: () => void;
  mode: RetailSummaryMode;
  date?: string;
  week?: string;
  showCommandCenterLink?: boolean;
  /** Test/story override; when set, skips the network fetch. */
  data?: RetailDaySummary;
}

export function DepartmentRetailDayDialog({
  open,
  onClose,
  mode,
  date,
  week,
  showCommandCenterLink = false,
  data: dataOverride,
}: DepartmentRetailDayDialogProps) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));
  const query = useQuery({
    queryKey: ['qa', 'day-summary', mode, date, week],
    queryFn: async () => {
      const { data } = mode === 'week' && week
        ? await getQaDaySummary({ week })
        : await getQaDaySummary({ date: date || '' });
      return data;
    },
    enabled: open && dataOverride == null && (mode === 'week' ? Boolean(week) : Boolean(date)),
  });
  const data = dataOverride ?? query.data ?? null;
  const closedDay = mode === 'day' && data != null && data.open === false;
  const title = summaryHeading(mode, data, date, week);
  const tileTone = letterTileTone(data?.letter);
  const tile = TILE_TONE[tileTone];
  const threshold = goalThreshold(data?.goal_letter);

  const weekKey = week || (date ? isoWeekKey(new Date(`${date}T12:00:00`)) : '');
  const ccTo = mode === 'week' && weekKey
    ? `/admin/retail-qa?week=${encodeURIComponent(weekKey)}`
    : date
      ? `/admin/retail-qa?week=${encodeURIComponent(weekKey)}&day=${encodeURIComponent(date)}`
      : '/admin/retail-qa';

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth fullScreen={fullScreen}>
      <DialogTitle
        sx={{
          pb: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 1.5,
          minHeight: fullScreen ? 52 : undefined,
        }}
      >
        <Typography sx={{ fontSize: 16, fontWeight: 600, lineHeight: 1.2, minWidth: 0 }}>
          {title}
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0 }}>
          {data?.letter && !closedDay ? (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Box
                data-testid="retail-letter-tile"
                data-tone={tileTone}
                sx={{
                  width: 44,
                  height: 44,
                  borderRadius: '10px',
                  display: 'grid',
                  placeItems: 'center',
                  bgcolor: tile.bg,
                  color: tile.fg,
                  fontSize: 22,
                  fontWeight: 700,
                  lineHeight: 1,
                }}
              >
                {data.letter}
              </Box>
              <Box sx={{ minWidth: 0 }}>
                <Typography sx={{ fontSize: 22, fontWeight: 600, lineHeight: 1.1 }}>
                  {data.score == null ? '\u2014' : Math.round(data.score)}
                </Typography>
                <Typography
                  sx={{
                    mt: 0.25,
                    fontSize: 12,
                    fontWeight: 600,
                    lineHeight: 1.2,
                    whiteSpace: 'nowrap',
                    color: data.goal_letter
                      ? data.goal_met
                        ? ccTokens.goodText
                        : ccTokens.badText
                      : ccTokens.ink2,
                  }}
                >
                  {data.goal_letter
                    ? `Goal ${data.goal_letter} · ${data.goal_met ? 'met' : 'not met'}`
                    : 'Goal —'}
                </Typography>
              </Box>
            </Box>
          ) : null}
          {fullScreen ? (
            <IconButton onClick={onClose} aria-label="Close" sx={{ width: 40, height: 40 }}>
              <Close />
            </IconButton>
          ) : null}
        </Box>
      </DialogTitle>
      <DialogContent>
        {query.isError && dataOverride == null ? (
          <Typography color="text.secondary">Unable to load this day.</Typography>
        ) : closedDay ? (
          <Typography color="text.secondary" fontWeight={700}>
            Store closed
          </Typography>
        ) : data ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            <Box
              sx={{
                display: 'flex',
                flexDirection: { xs: 'column', sm: 'row' },
                gap: '12px',
                alignItems: 'stretch',
              }}
            >
              <ThirdCard
                name="Spot"
                weight={60}
                score={data.spot?.score}
                state={data.spot?.state}
                threshold={threshold}
                description="Owner walks a section and scores it. Biggest part of the grade."
                detail={data.spot ? spotDetailLine(data.spot) : ''}
              />
              <ThirdCard
                name="Do"
                weight={25}
                score={data.do?.score}
                state={null}
                threshold={threshold}
                description="Routines done over routines expected today."
                detail={data.do ? doDetailLine(data.do) : ''}
              />
              <ThirdCard
                name="Cross"
                weight={15}
                score={data.cross?.score}
                state={data.cross?.state}
                threshold={threshold}
                description="Sections checked by someone other than their owner, once a week."
                detail={data.cross ? crossDetailLine(data.cross) : ''}
                pending={
                  data.cross?.state === 'pending'
                    ? crossPendingLabel(data.cross.due_date)
                    : null
                }
              />
            </Box>
            {showCommandCenterLink ? (
              <Link
                component={RouterLink}
                to={ccTo}
                sx={{ mt: 0.5, fontWeight: 800 }}
              >
                Open in Command Center
              </Link>
            ) : null}
          </Box>
        ) : (
          <Typography color="text.secondary">Loading…</Typography>
        )}
      </DialogContent>
    </Dialog>
  );
}
