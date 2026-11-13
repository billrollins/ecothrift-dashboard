/**
 * The rich kit (Dash Update #134, Design Lab round 3): the pieces Dash's most worked pages already share, written down
 * once so the Data table, Command center and Station page types are built from the same parts. Taken from Orders
 * (OrderListPage), Processing (ProcessingWorkspaceHeader, ProcessingQueueTable, ProcessingScanBar), Preprocessing
 * (RichStatCard, the review toolbar) and the restoration bench (TarsWorkstation, BenchPaneHeader, benchScale).
 * No colours of their own: everything comes from the theme (theme/eco.ts), tones from the status palette.
 *
 *   MicroLabel      the small uppercase label over every number on those pages
 *   KpiStrip/Kpi    a row of compact number cards; a caption coloured by its band (Orders' summary strip)
 *   StatBand/StatBlock  grouped clickable numbers with a tone bar, on a quiet band (Processing's header)
 *   FactStrip/Fact  label-over-value cells split by hairlines (Processing's order strip, the bench deck)
 *   ScanBar         the scanner-first input: always focused, Enter acts, a status slot that never moves things
 *   ChipRail        a row of filter or recent chips that scrolls sideways
 *   BulkBar         the dark bar that appears for selected rows (Processing)
 *   Pane/PaneHeader a full-height card whose body scrolls, with a fixed-height header (the bench)
 *   TwoLine         a table cell: a bold number over a coloured caption (Orders)
 *   bandTone        a value -> tone by thresholds (recovery, coverage)
 *   denseTableSx    the dense queue table look: 28 px rows, striped, micro headers, selected row with a bar
 *   dataGridSx      the same look for MUI DataGrid (Orders)
 *
 * Rule from those pages: nothing moves when data changes. Slots have fixed heights, numbers are tabular.
 */
import { Box, ButtonBase, InputBase, Stack, Typography, type SxProps, type Theme } from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import type { SvgIconProps } from '@mui/material/SvgIcon';
import { forwardRef, type ComponentType, type ReactNode } from 'react';
import type { Tone } from './PageKit';

const TONE_KEY = { good: 'success', wait: 'warning', problem: 'error', info: 'info' } as const;

/** The text colour of a tone, readable on white (the status palette's `dark`). */
export function useToneText(tone: Tone | undefined): string {
  const theme = useTheme();
  if (!tone || tone === 'quiet') return theme.palette.text.secondary;
  return theme.palette[TONE_KEY[tone]].dark;
}

/** Thresholds -> a tone: bandTone(142, [[100, 'problem'], [150, 'wait'], [Infinity, 'good']]). */
export function bandTone(value: number | null | undefined, bands: [number, Tone][]): Tone {
  if (value == null || Number.isNaN(value)) return 'quiet';
  for (const [below, tone] of bands) if (value < below) return tone;
  return bands[bands.length - 1]?.[1] ?? 'quiet';
}

export function MicroLabel({ children, sx }: { children: ReactNode; sx?: SxProps<Theme> }) {
  return (
    <Typography
      component="div"
      sx={[{ fontSize: '0.6875rem', fontWeight: 800, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'text.secondary', lineHeight: 1.3, whiteSpace: 'nowrap' }, ...(Array.isArray(sx) ? sx : [sx])]}
    >
      {children}
    </Typography>
  );
}

// ---- KPI strip ----------------------------------------------------------------------------------------------

export function KpiStrip({ children, columns = { xs: 2, sm: 3, md: 4, lg: 7 } }: { children: ReactNode; columns?: Partial<Record<'xs' | 'sm' | 'md' | 'lg' | 'xl', number>> }) {
  const cols = Object.fromEntries(Object.entries(columns).map(([k, n]) => [k, `repeat(${n}, minmax(0, 1fr))`]));
  return <Box sx={{ display: 'grid', gap: 1.25, gridTemplateColumns: cols }}>{children}</Box>;
}

export function Kpi({ label, value, caption, tone, Icon, selected }: {
  label: string;
  value: string;
  caption?: string;
  tone?: Tone;
  Icon?: ComponentType<SvgIconProps>;
  /** Shown while rows are selected: the strip counts only those. */
  selected?: boolean;
}) {
  const toneText = useToneText(tone);
  return (
    <Box sx={{ p: 1.25, borderRadius: '10px', border: 1, borderColor: selected ? 'secondary.main' : 'divider', bgcolor: 'background.paper', minWidth: 0 }}>
      <Stack direction="row" spacing={0.75} alignItems="center">
        {Icon ? <Icon sx={{ fontSize: 15, color: 'text.secondary' }} /> : null}
        <MicroLabel>{label}</MicroLabel>
      </Stack>
      <Typography sx={{ fontSize: '1.25rem', fontWeight: 800, fontVariantNumeric: 'tabular-nums', lineHeight: 1.35 }} noWrap>{value}</Typography>
      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: toneText, minHeight: 18 }} noWrap>{caption ?? ''}</Typography>
    </Box>
  );
}

// ---- Stat band ----------------------------------------------------------------------------------------------

export function StatBand({ children }: { children: ReactNode }) {
  return (
    <Stack
      direction="row"
      sx={{ bgcolor: 'grey.50', borderBottom: 1, borderColor: 'divider', minHeight: 76, overflowX: 'auto', px: 1, '&::-webkit-scrollbar': { height: 5 } }}
    >
      {children}
    </Stack>
  );
}

export function StatGroup({ label, children, last }: { label: string; children: ReactNode; last?: boolean }) {
  return (
    <Box sx={{ px: 1.25, py: 0.75, borderRight: last ? 0 : 2, borderColor: 'grey.300', flexShrink: 0 }}>
      <MicroLabel sx={{ mb: 0.25, color: 'text.disabled' }}>{label}</MicroLabel>
      <Stack direction="row" spacing={0.5}>{children}</Stack>
    </Box>
  );
}

export function StatBlock({ label, value, suffix, helper, tone = 'quiet', onClick }: {
  label: string;
  value: string;
  suffix?: string;
  helper?: string;
  tone?: Tone;
  onClick?: () => void;
}) {
  const theme = useTheme();
  const bar = tone === 'quiet' ? theme.palette.grey[300] : theme.palette[TONE_KEY[tone]].main;
  return (
    <ButtonBase
      onClick={onClick}
      sx={{ display: 'block', textAlign: 'left', pl: 1.25, pr: 1.5, py: 0.5, borderRadius: '6px', borderLeft: `3px solid ${bar}`, minWidth: 92, '&:hover': { bgcolor: 'action.hover' } }}
    >
      <MicroLabel>{label}</MicroLabel>
      <Typography component="div" sx={{ fontSize: '1.125rem', fontWeight: 900, fontVariantNumeric: 'tabular-nums', lineHeight: 1.3 }}>
        {value}
        {suffix ? <Box component="span" sx={{ fontSize: '0.8125rem', fontWeight: 700, color: 'text.secondary', ml: 0.25 }}>{suffix}</Box> : null}
      </Typography>
      <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary', minHeight: 17 }} noWrap>{helper ?? ''}</Typography>
    </ButtonBase>
  );
}

// ---- Facts --------------------------------------------------------------------------------------------------

export function FactStrip({ children, sx }: { children: ReactNode; sx?: SxProps<Theme> }) {
  return <Stack direction="row" sx={[{ minWidth: 0, overflowX: 'auto' }, ...(Array.isArray(sx) ? sx : [sx])]}>{children}</Stack>;
}

export function Fact({ label, value, mono, onDeck }: { label: string; value: ReactNode; mono?: boolean; onDeck?: boolean }) {
  return (
    <Box sx={(t) => ({ px: 1.5, py: 0.5, borderRight: 1, borderColor: onDeck ? alpha(t.palette.deck?.ink ?? '#fff', 0.12) : 'divider', minWidth: 0, flexShrink: 0 })}>
      <MicroLabel sx={onDeck ? { color: 'deck.label' } : undefined}>{label}</MicroLabel>
      <Typography
        noWrap
        sx={{ fontSize: '0.8125rem', fontWeight: 700, fontVariantNumeric: 'tabular-nums', fontFamily: mono ? 'ui-monospace, Consolas, monospace' : undefined, color: onDeck ? 'deck.ink' : 'text.primary' }}
      >
        {value}
      </Typography>
    </Box>
  );
}

// ---- Scan bar -----------------------------------------------------------------------------------------------

export const ScanBar = forwardRef<HTMLInputElement, {
  value: string;
  onChange: (v: string) => void;
  onEnter: (v: string) => void;
  placeholder?: string;
  Icon?: ComponentType<SvgIconProps>;
  /** The answer to the last scan; its slot keeps its width so the bar never shifts. */
  status?: { tone: Tone; text: string } | null;
  /** Take focus when shown (default): a scan page is always ready for the scanner. Off for previews. */
  autoFocus?: boolean;
}>(function ScanBar({ value, onChange, onEnter, placeholder = 'Scan or type a SKU', Icon, status, autoFocus = true }, ref) {
  const statusColor = useToneText(status?.tone);
  return (
    <Stack direction="row" spacing={1.5} alignItems="center" sx={{ minWidth: 0 }}>
      <Stack
        direction="row"
        alignItems="center"
        spacing={1}
        sx={(t) => ({
          flex: '1 1 420px', maxWidth: 620, height: 38, px: 1.25, borderRadius: '10px', border: 1, borderColor: 'grey.400', bgcolor: 'background.paper',
          '&:focus-within': { borderColor: 'secondary.main', boxShadow: `0 0 0 3px ${alpha(t.palette.secondary.main, 0.25)}` },
        })}
      >
        {Icon ? <Icon sx={{ fontSize: 20, color: 'text.secondary' }} /> : null}
        <InputBase
          inputRef={ref}
          autoFocus={autoFocus}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') onEnter(value); if (e.key === 'Escape') onChange(''); }}
          sx={{ flex: 1, fontSize: '0.9375rem', fontWeight: 600, '& input': { p: 0 } }}
          inputProps={{ 'aria-label': placeholder }}
        />
        <Typography variant="caption" sx={{ visibility: value ? 'visible' : 'hidden', fontWeight: 700 }}>Enter</Typography>
      </Stack>
      <Typography sx={{ width: { xs: 'auto', md: 300 }, flexShrink: 0, fontSize: '0.8125rem', fontWeight: 700, color: statusColor, minHeight: 20 }} noWrap>
        {status?.text ?? ''}
      </Typography>
    </Stack>
  );
});

// ---- Chip rail ----------------------------------------------------------------------------------------------

export function ChipRail({ label, children, end }: { label?: string; children: ReactNode; end?: ReactNode }) {
  return (
    <Stack direction="row" spacing={1} alignItems="center" sx={{ minHeight: 40, minWidth: 0 }}>
      {label ? <MicroLabel sx={{ flexShrink: 0 }}>{label}</MicroLabel> : null}
      <Stack direction="row" spacing={0.75} sx={{ overflowX: 'auto', flex: 1, minWidth: 0, py: 0.5, '&::-webkit-scrollbar': { height: 4 } }}>{children}</Stack>
      {end ? <Box sx={{ flexShrink: 0 }}>{end}</Box> : null}
    </Stack>
  );
}

// ---- Bulk bar -----------------------------------------------------------------------------------------------

export function BulkBar({ count, onClear, children }: { count: number; onClear: () => void; children: ReactNode }) {
  if (!count) return null;
  return (
    <Stack
      direction="row"
      spacing={1.5}
      alignItems="center"
      sx={{ position: 'sticky', bottom: 0, zIndex: 2, px: 2, py: 1, bgcolor: 'grey.900', color: 'common.white', '& .MuiButton-root': { color: 'common.white', borderColor: 'grey.600' } }}
    >
      <Typography sx={{ fontWeight: 800, fontSize: '0.875rem' }}>{count} selected</Typography>
      <ButtonBase onClick={onClear} sx={{ fontSize: '0.8125rem', fontWeight: 700, textDecoration: 'underline', color: 'grey.300' }}>Clear</ButtonBase>
      <Box sx={{ flex: 1 }} />
      <Stack direction="row" spacing={1}>{children}</Stack>
    </Stack>
  );
}

// ---- Panes --------------------------------------------------------------------------------------------------

export function Pane({ children, sx }: { children: ReactNode; sx?: SxProps<Theme> }) {
  return (
    <Box
      sx={[{
        display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden', borderRadius: '10px',
        border: 1, borderColor: 'divider', bgcolor: 'background.paper', boxShadow: 1,
      }, ...(Array.isArray(sx) ? sx : [sx])]}
    >
      {children}
    </Box>
  );
}

export function PaneHeader({ kicker, value, meta, action }: { kicker: string; value?: ReactNode; meta?: string; action?: ReactNode }) {
  return (
    <Stack direction="row" alignItems="center" spacing={1} sx={{ height: 52, px: 1.5, bgcolor: 'grey.50', borderBottom: 1, borderColor: 'divider', flexShrink: 0 }}>
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <MicroLabel>{kicker}</MicroLabel>
        <Typography noWrap sx={{ fontSize: '0.875rem', fontWeight: 700 }}>
          {value}
          {meta ? <Box component="span" sx={{ ml: 1, fontWeight: 500, color: 'text.secondary', fontSize: '0.75rem' }}>{meta}</Box> : null}
        </Typography>
      </Box>
      <Box sx={{ flexShrink: 0 }}>{action}</Box>
    </Stack>
  );
}

export function PaneBody({ children, sx }: { children: ReactNode; sx?: SxProps<Theme> }) {
  return <Box sx={[{ flex: 1, minHeight: 0, overflowY: 'auto', '&::-webkit-scrollbar': { width: 6 }, '&::-webkit-scrollbar-thumb': { bgcolor: 'grey.300', borderRadius: 3 } }, ...(Array.isArray(sx) ? sx : [sx])]}>{children}</Box>;
}

// ---- Cells and table looks ------------------------------------------------------------------------------------

export function TwoLine({ value, caption, tone, align = 'left' }: { value: ReactNode; caption?: ReactNode; tone?: Tone; align?: 'left' | 'right' }) {
  const toneText = useToneText(tone);
  return (
    <Box sx={{ textAlign: align, lineHeight: 1.25, minWidth: 0 }}>
      <Typography component="div" noWrap sx={{ fontSize: '0.8125rem', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{value}</Typography>
      {caption ? <Typography component="div" noWrap sx={{ fontSize: '0.75rem', fontWeight: 700, color: toneText }}>{caption}</Typography> : null}
    </Box>
  );
}

/** The dense queue table: put on a <Table size="small" stickyHeader>. Rows 28 px, striped, micro headers. */
export const denseTableSx: SxProps<Theme> = (t) => ({
  tableLayout: 'fixed',
  '& th': {
    height: 30, py: 0, px: 1, fontSize: '0.6875rem', fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase',
    color: 'text.secondary', bgcolor: t.palette.grey[50], borderBottom: `2px solid ${t.palette.grey[300]}`, whiteSpace: 'nowrap',
  },
  '& td': { height: 30, py: 0, px: 1, fontSize: '0.8125rem', borderBottomColor: t.palette.grey[100], whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  '& tbody tr:nth-of-type(even)': { bgcolor: t.palette.grey[50] },
  '& tbody tr:hover': { bgcolor: t.palette.action.hover },
  '& tbody tr.Mui-selected, & tbody tr.Mui-selected:hover': { bgcolor: alpha(t.palette.secondary.main, 0.12), boxShadow: `inset 3px 0 0 ${t.palette.secondary.main}` },
});

/** The same look on an MUI DataGrid (Orders): micro headers, hairline rows, a mint selected row. */
export const dataGridSx: SxProps<Theme> = (t) => ({
  border: 0,
  '--DataGrid-rowBorderColor': t.palette.grey[100],
  '& .MuiDataGrid-columnHeaders': { bgcolor: t.palette.grey[50] },
  '& .MuiDataGrid-columnHeaderTitle': { fontSize: '0.6875rem', fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: t.palette.text.secondary },
  '& .MuiDataGrid-cell': { display: 'flex', alignItems: 'center', fontSize: '0.8125rem' },
  '& .MuiDataGrid-cell:focus, & .MuiDataGrid-cell:focus-within, & .MuiDataGrid-columnHeader:focus': { outline: 'none' },
  '& .MuiDataGrid-row': { cursor: 'pointer' },
  '& .MuiDataGrid-row.Mui-selected, & .MuiDataGrid-row.Mui-selected:hover': { bgcolor: alpha(t.palette.secondary.main, 0.12) },
  '& .MuiDataGrid-footerContainer': { borderTopColor: t.palette.divider },
});
