/**
 * Page kit (Dash Update #134, Design Lab phase 1; carried over from Dark Horse's kit): the standard building blocks
 * every page is assembled from, so pages look alike without anyone copying styles. Colours come from the active theme
 * (no hex codes here), so the kit works under today's theme and the Eco-Thrift theme (theme/eco.ts).
 *
 * One rule first: the top bar names the page (PageShell tells the shell it is there: kitSignal.ts; MainLayout then
 * shows the page's sidebar name in the top bar). A page body never repeats its title and never
 * opens with a tagline. It starts with the toolbar (if there is something to do) or the content.
 * A record page may open with the record's own name (an employee, a client): that is not the page title.
 *
 *   PageShell    width and rhythm of a page
 *   PageToolbar  first row: search / filters on the left, buttons on the right (no title)
 *   Section      a titled card
 *   StatTile     one number with its label and trend
 *   StatusPill   good / wait / problem / info / quiet
 *   FilterBar    search and filters above a list
 *   EmptyState   what an empty list says
 *   FieldRow     label and value pair on a record
 *
 * Each page template built from these is on show at /admin/design-lab, at desktop and phone size.
 */
import { Box, Card, Stack, Typography, type SxProps, type Theme } from '@mui/material';
import { alpha, darken, useTheme } from '@mui/material/styles';
import type { ComponentType, ReactNode } from 'react';
import type { SvgIconProps } from '@mui/material/SvgIcon';
import { useMarkKitPage } from './kitSignal';
import StackOnPhone from './StackOnPhone';

export type Tone = 'good' | 'wait' | 'problem' | 'info' | 'quiet';

const TONE_PALETTE = { good: 'success', wait: 'warning', problem: 'error', info: 'info' } as const;

function useToneColor(tone: Tone): string {
  const theme = useTheme();
  return tone === 'quiet' ? theme.palette.text.secondary : theme.palette[TONE_PALETTE[tone]].main;
}

/**
 * `narrow` for forms and settings, `wide` for reports and tables. Every table inside turns into cards on a phone
 * (StackOnPhone), and the shell names the page in the top bar while a PageShell is on screen.
 */
export function PageShell({ width = 'standard', children }: { width?: 'narrow' | 'standard' | 'wide'; children: ReactNode }) {
  useMarkKitPage();
  const maxWidth = { narrow: 760, standard: 1180, wide: 1480 }[width];
  return (
    <StackOnPhone sx={{ maxWidth, mx: 'auto', width: '100%' }}>
      <Stack spacing={{ xs: 2, md: 3 }}>{children}</Stack>
    </StackOnPhone>
  );
}

/**
 * The first row of a page: what you can do here. `lead` (left) is for search, filters or the
 * thing being browsed (a week, a month); `children` (right) are the buttons.
 * There is no title prop on purpose: the top bar already names the page.
 */
export function PageToolbar({ lead, children }: { lead?: ReactNode; children?: ReactNode }) {
  return (
    <Stack
      direction={{ xs: 'column', sm: 'row' }}
      spacing={{ xs: 1.25, sm: 2 }}
      alignItems={{ xs: 'stretch', sm: 'center' }}
      justifyContent="space-between"
    >
      <Box sx={{ minWidth: 0, flex: 1 }}>{lead}</Box>
      {children ? (
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ flexShrink: 0 }}>
          {children}
        </Stack>
      ) : null}
    </Stack>
  );
}

export function Section({
  title,
  hint,
  action,
  flush = false,
  children,
  sx,
}: {
  title?: string;
  hint?: string;
  action?: ReactNode;
  /** No inner padding: for tables and lists that run edge to edge. */
  flush?: boolean;
  children: ReactNode;
  sx?: SxProps<Theme>;
}) {
  return (
    <Card sx={sx}>
      {title ? (
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          spacing={2}
          sx={{ px: { xs: 2, md: 2.5 }, pt: 2, pb: flush ? 1.5 : 0.5 }}
        >
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="h6" component="h2">{title}</Typography>
            {hint ? <Typography variant="caption">{hint}</Typography> : null}
          </Box>
          {action}
        </Stack>
      ) : null}
      <Box sx={flush ? undefined : { px: { xs: 2, md: 2.5 }, py: 2 }}>{children}</Box>
    </Card>
  );
}

export function StatTile({
  label,
  value,
  detail,
  note,
  tone = 'quiet',
  Icon,
}: {
  label: string;
  value: string;
  /** What the number is made of, in plain type: never colored. */
  detail?: string;
  /** Trend or context under the number, colored by `tone`. */
  note?: string;
  tone?: Tone;
  Icon?: ComponentType<SvgIconProps>;
}) {
  const toneColor = useToneColor(tone);
  return (
    <Card sx={{ p: { xs: 1.75, md: 2.25 }, height: '100%' }}>
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
        <Typography variant="overline" color="text.secondary" sx={{ lineHeight: 1.4 }}>
          {label}
        </Typography>
        {Icon ? <Icon sx={{ fontSize: 22, color: 'text.secondary' }} /> : null}
      </Stack>
      <Typography variant="h2" component="p" sx={{ mt: 0.75, fontSize: { xs: '1.625rem', md: '2rem' } }}>
        {value}
      </Typography>
      {detail ? <Typography variant="caption" component="div">{detail}</Typography> : null}
      {note ? (
        <Typography variant="caption" sx={{ color: tone === 'quiet' ? toneColor : darken(toneColor, 0.1), fontWeight: 700 }}>
          {note}
        </Typography>
      ) : null}
    </Card>
  );
}

export function StatusPill({ tone, label }: { tone: Tone; label: string }) {
  const theme = useTheme();
  // The theme's status `light` is the soft wash and `dark` the text shade that reads on it (theme/eco.ts).
  const colors =
    tone === 'quiet'
      ? { text: theme.palette.text.secondary, wash: theme.palette.grey[100] }
      : { text: theme.palette[TONE_PALETTE[tone]].dark, wash: theme.palette[TONE_PALETTE[tone]].light };
  return (
    <Box
      component="span"
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.75,
        px: 1.1,
        height: 24,
        borderRadius: 999,
        fontSize: '0.75rem',
        fontWeight: 700,
        whiteSpace: 'nowrap',
        color: colors.text,
        bgcolor: colors.wash,
        '&::before': { content: '""', width: 6, height: 6, borderRadius: '50%', bgcolor: 'currentColor' },
      }}
    >
      {label}
    </Box>
  );
}

export function FilterBar({ children }: { children: ReactNode }) {
  return (
    <Stack
      direction={{ xs: 'column', sm: 'row' }}
      spacing={1.25}
      alignItems={{ xs: 'stretch', sm: 'center' }}
      flexWrap="wrap"
      useFlexGap
    >
      {children}
    </Stack>
  );
}

export function EmptyState({
  Icon,
  title,
  body,
  action,
}: {
  Icon?: ComponentType<SvgIconProps>;
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <Stack alignItems="center" spacing={1.25} sx={{ py: { xs: 4, md: 6 }, px: 2, textAlign: 'center' }}>
      {Icon ? (
        <Box
          sx={(theme) => ({
            width: 56,
            height: 56,
            borderRadius: '18px',
            display: 'grid',
            placeItems: 'center',
            bgcolor: alpha(theme.palette.secondary.main, 0.12),
            color: 'text.primary',
          })}
        >
          <Icon sx={{ fontSize: 30 }} />
        </Box>
      ) : null}
      <Typography variant="h5" component="p">{title}</Typography>
      {body ? (
        <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 380 }}>
          {body}
        </Typography>
      ) : null}
      {action}
    </Stack>
  );
}

export function FieldRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Stack
      direction="row"
      spacing={2}
      sx={{ py: 1.1, borderBottom: '1px solid', borderColor: 'divider', '&:last-of-type': { borderBottom: 0 } }}
    >
      <Typography variant="body2" color="text.secondary" sx={{ width: { xs: 110, md: 150 }, flexShrink: 0 }}>
        {label}
      </Typography>
      <Typography variant="body2" component="div" sx={{ minWidth: 0, fontWeight: 500 }}>
        {children}
      </Typography>
    </Stack>
  );
}
