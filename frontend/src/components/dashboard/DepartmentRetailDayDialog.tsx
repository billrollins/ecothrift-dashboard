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

export function spotDetailLine(
  row: NonNullable<RetailDaySummary['spot']>,
  mode: RetailSummaryMode = 'day',
): string {
  const walks = row.walks.done;
  const score = row.score == null ? '\u2014' : Math.round(row.score);
  if (mode === 'week') {
    return `${walks} walk${walks === 1 ? '' : 's'} · avg ${score}`;
  }
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

export const THIRD_WEIGHTS = { spot: 60, do: 25, cross: 15 } as const;

export interface ContributionSegment {
  key: 'spot' | 'do' | 'cross';
  weight: number;
  points: number;
  pending: boolean;
  tone: LetterTileTone;
}

export function contributionSegments(
  data: RetailDaySummary,
  threshold: number,
): ContributionSegment[] {
  const rows: Array<{
    key: ContributionSegment['key'];
    weight: number;
    score: number | null | undefined;
    state?: string | null;
  }> = [
    { key: 'spot', weight: THIRD_WEIGHTS.spot, score: data.spot?.score, state: data.spot?.state },
    { key: 'do', weight: THIRD_WEIGHTS.do, score: data.do?.score, state: null },
    { key: 'cross', weight: THIRD_WEIGHTS.cross, score: data.cross?.score, state: data.cross?.state },
  ];
  return rows.map((row) => {
    const pending = isIdleState(row.state) || row.score == null;
    return {
      key: row.key,
      weight: row.weight,
      points: pending ? row.weight : (row.weight * Number(row.score)) / 100,
      pending,
      tone: thirdTone(row.score, row.state, threshold),
    };
  });
}

export function scoredContributionTotal(segments: ContributionSegment[]): number {
  return segments.reduce((sum, seg) => sum + (seg.pending ? 0 : seg.points), 0);
}

const HATCH = `repeating-linear-gradient(-45deg, ${ccTokens.neuTint} 0 4px, ${ccTokens.line2} 4px 8px)`;

function ContributionBar({
  segments,
  score,
}: {
  segments: ContributionSegment[];
  score: number | null;
}) {
  return (
    <Box
      data-testid="retail-contribution-bar"
      sx={{ display: 'flex', alignItems: 'center', gap: 1.25, width: '100%' }}
    >
      <Box
        sx={{
          flex: 1,
          minWidth: 0,
          height: 10,
          borderRadius: '999px',
          overflow: 'hidden',
          display: 'flex',
          bgcolor: ccTokens.neuTint,
        }}
      >
        {segments.map((seg) => (
          <Box
            key={seg.key}
            data-segment={seg.key}
            data-pending={seg.pending ? 'true' : 'false'}
            sx={{
              flexGrow: seg.points,
              flexShrink: 0,
              flexBasis: 0,
              minWidth: 0,
              height: '100%',
              bgcolor: seg.pending ? undefined : CARD_TONE[seg.tone].fg,
              background: seg.pending ? HATCH : undefined,
            }}
          />
        ))}
      </Box>
      <Typography sx={{ fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap', color: ccTokens.ink }}>
        {score == null ? '\u2014' : Math.round(score)}
      </Typography>
    </Box>
  );
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

export function formatGradeScale(
  scale?: { a: number; b: number; c: number; d: number } | null,
): string {
  if (!scale) return '';
  return `A ${scale.a} · B ${scale.b} · C ${scale.c} · D ${scale.d} · F below ${scale.d}`;
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
  const threshold = goalThreshold(data?.goal_letter, data?.grade_scale ?? DEFAULT_GRADE_SCALE);

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
                detail={data.spot ? spotDetailLine(data.spot, mode) : ''}
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
            <ContributionBar
              segments={contributionSegments(data, threshold)}
              score={data.score}
            />
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 1.5,
                mt: 0.5,
              }}
            >
              <Typography
                data-testid="retail-grade-scale"
                sx={{ fontSize: 12, fontWeight: 400, color: ccTokens.ink3, whiteSpace: 'nowrap', minWidth: 0 }}
              >
                {formatGradeScale(data.grade_scale)}
              </Typography>
              {showCommandCenterLink ? (
                <Link
                  component={RouterLink}
                  to={ccTo}
                  sx={{ fontWeight: 700, fontSize: 13, whiteSpace: 'nowrap', flexShrink: 0 }}
                >
                  Open in Command Center
                </Link>
              ) : null}
            </Box>
          </Box>
        ) : (
          <Typography color="text.secondary">Loading…</Typography>
        )}
      </DialogContent>
    </Dialog>
  );
}
