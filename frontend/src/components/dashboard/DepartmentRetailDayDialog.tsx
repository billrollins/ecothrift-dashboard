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
  return score == null ? '\u2014' : `${Math.round(score)}%`;
}

export function formatDueDate(iso: string | null | undefined): string {
  if (!iso) return '';
  return format(parseISO(iso), 'EEE MMM d');
}

export function crossPendingLabel(dueDate: string | null | undefined): string {
  const when = formatDueDate(dueDate);
  return when ? `Cross pending until ${when}` : 'Cross pending';
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

  const weekKey = week || (date ? isoWeekKey(new Date(`${date}T12:00:00`)) : '');
  const ccTo = mode === 'week' && weekKey
    ? `/admin/retail-qa?week=${encodeURIComponent(weekKey)}`
    : date
      ? `/admin/retail-qa?week=${encodeURIComponent(weekKey)}&day=${encodeURIComponent(date)}`
      : '/admin/retail-qa';

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth fullScreen={fullScreen}>
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
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
            {data.do ? (
              <Typography>
                Do {formatSummaryScore(data.do.score)} · Section checks {data.do.section_checks.done} of{' '}
                {data.do.section_checks.expected} · Open/Day/Close {data.do.open_day_close.done} of{' '}
                {data.do.open_day_close.expected}
              </Typography>
            ) : null}
            {data.spot ? (
              data.spot.state === 'done' ? (
                <Typography>
                  Spot {formatSummaryScore(data.spot.score)} · {data.spot.walks.done} walk
                  {data.spot.walks.done === 1 ? '' : 's'}
                </Typography>
              ) : (
                <Typography color="text.secondary">Spot: no walk yet</Typography>
              )
            ) : null}
            {data.cross ? (
              data.cross.state === 'pending' ? (
                <Typography color="text.secondary">{crossPendingLabel(data.cross.due_date)}</Typography>
              ) : (
                <Typography>
                  Cross {formatSummaryScore(data.cross.score)} · {data.cross.done} of {data.cross.due}
                  {data.cross.due_date ? ` due ${formatDueDate(data.cross.due_date)}` : ''}
                </Typography>
              )
            ) : null}
            {showCommandCenterLink ? (
              <Link
                component={RouterLink}
                to={ccTo}
                sx={{ mt: 1, fontWeight: 800 }}
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
