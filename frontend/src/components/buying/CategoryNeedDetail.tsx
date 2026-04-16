import { useState, type ReactNode } from 'react';
import {
  Box,
  Collapse,
  Divider,
  IconButton,
  Stack,
  Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { formatCurrency } from '../../utils/format';
import type { BuyingCategoryNeedRow } from '../../types/buying.types';

function num(s: string | null | undefined): number | null {
  if (s == null || s === '') return null;
  const n = Number.parseFloat(String(s));
  return Number.isFinite(n) ? n : null;
}

function fmt2(s: string | null | undefined): string {
  const n = num(s);
  return n == null ? '—' : n.toFixed(2);
}

type Props = {
  row: BuyingCategoryNeedRow | null;
  needScoreRawGlobalMin: string | null | undefined;
  needScoreRawGlobalMax: string | null | undefined;
  needWindowDays: number | null | undefined;
  /** When true, omit fixed width / bordered card chrome (e.g. inside a drawer). */
  embeddedInDrawer?: boolean;
};

function Tile({
  label,
  primary,
  secondary,
}: {
  label: string;
  primary: ReactNode;
  secondary?: ReactNode;
}) {
  return (
    <Box
      sx={{
        p: 0.75,
        bgcolor: 'action.hover',
        borderRadius: 1,
        minWidth: 120,
        flex: '1 1 120px',
      }}
    >
      <Typography
        variant="caption"
        color="text.secondary"
        display="block"
        sx={{ fontSize: '0.65rem' }}
      >
        {label}
      </Typography>
      <Typography variant="body2" fontWeight={700} lineHeight={1.3}>
        {primary}
      </Typography>
      {secondary != null ? (
        <Typography
          variant="caption"
          color="text.secondary"
          display="block"
          sx={{ fontSize: '0.7rem', mt: 0.25 }}
        >
          {secondary}
        </Typography>
      ) : null}
    </Box>
  );
}

const MONO_FF =
  '"JetBrains Mono", "Fira Code", "SFMono-Regular", Menlo, Consolas, monospace';

type Variable = {
  name: string;
  value: string;
  note?: string;
};

function ExplainerBlock({
  title,
  value,
  vars,
  formula,
  substitution,
  result,
}: {
  title: string;
  value: string;
  vars: Variable[];
  formula: string;
  substitution: string;
  result: string;
}) {
  const nameCol = Math.max(...vars.map((v) => v.name.length));
  const valCol = Math.max(...vars.map((v) => v.value.length));
  return (
    <Box>
      <Stack direction="row" alignItems="baseline" spacing={0.75} sx={{ mb: 0.4 }}>
        <Typography
          variant="body2"
          fontWeight={700}
          sx={{ color: 'text.primary', lineHeight: 1.2 }}
        >
          {title}
        </Typography>
        <Typography
          variant="body2"
          sx={{ color: 'text.secondary', fontFamily: MONO_FF, lineHeight: 1.2 }}
        >
          =
        </Typography>
        <Typography
          variant="body2"
          fontWeight={700}
          sx={{
            color: 'primary.main',
            fontFamily: MONO_FF,
            lineHeight: 1.2,
          }}
        >
          {value}
        </Typography>
      </Stack>
      <Box
        sx={{
          fontFamily: MONO_FF,
          fontSize: '0.72rem',
          lineHeight: 1.55,
          color: 'text.primary',
          bgcolor: 'background.paper',
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 0.75,
          px: 0.75,
          py: 0.5,
        }}
      >
        {vars.map((v) => (
          <Box
            key={v.name}
            sx={{ display: 'flex', flexWrap: 'wrap', columnGap: 1, rowGap: 0 }}
          >
            <Box component="span" sx={{ color: 'primary.main', fontWeight: 600, whiteSpace: 'pre' }}>
              {v.name.padEnd(nameCol)}
            </Box>
            <Box component="span" sx={{ color: 'text.secondary' }}>
              =
            </Box>
            <Box component="span" sx={{ fontWeight: 600, whiteSpace: 'pre' }}>
              {v.value.padStart(valCol)}
            </Box>
            {v.note ? (
              <Box component="span" sx={{ color: 'text.secondary', fontStyle: 'italic' }}>
                — {v.note}
              </Box>
            ) : null}
          </Box>
        ))}
        <Box
          sx={{
            mt: 0.5,
            pt: 0.5,
            borderTop: '1px dashed',
            borderColor: 'divider',
            display: 'flex',
            flexWrap: 'wrap',
            columnGap: 0.75,
          }}
        >
          <Box component="span" sx={{ color: 'text.secondary' }}>[</Box>
          <Box component="span">{formula}</Box>
          <Box component="span" sx={{ color: 'text.secondary' }}>]  =  [</Box>
          <Box component="span">{substitution}</Box>
          <Box component="span" sx={{ color: 'text.secondary' }}>]  =</Box>
          <Box component="span" sx={{ color: 'primary.main', fontWeight: 700 }}>
            {result}
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

function soldWindowSinceLabel(days: number | null | undefined): string {
  if (days == null || !Number.isFinite(days) || days < 1) return '—';
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default function CategoryNeedDetail({
  row,
  needScoreRawGlobalMin,
  needScoreRawGlobalMax,
  needWindowDays,
  embeddedInDrawer = false,
}: Props) {
  const [explainerOpen, setExplainerOpen] = useState(false);

  if (!row) {
    if (embeddedInDrawer) return null;
    return (
      <Box
        sx={{
          width: 440,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: 200,
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 1,
          px: 2,
        }}
      >
        <Typography variant="body2" color="text.secondary" fontStyle="italic">
          Click a category
        </Typography>
      </Box>
    );
  }

  const windowDays = needWindowDays ?? null;
  const since = soldWindowSinceLabel(windowDays);
  const gap = num(row.need_gap);
  const unitLeg = fmt2(row.need_raw_unit_leg);
  const retailLeg = fmt2(row.need_raw_retail_leg);
  const combinedRaw = fmt2(row.need_raw_combined);
  const rawMin = fmt2(needScoreRawGlobalMin);
  const rawMax = fmt2(needScoreRawGlobalMax);
  const equalBounds =
    needScoreRawGlobalMin != null &&
    needScoreRawGlobalMax != null &&
    needScoreRawGlobalMin === needScoreRawGlobalMax;

  const outerSx = embeddedInDrawer
    ? {
        width: '100%',
        flexShrink: 0,
        p: 0,
        bgcolor: 'transparent',
      }
    : {
        width: 440,
        flexShrink: 0,
        position: 'sticky',
        top: 16,
        alignSelf: 'flex-start',
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 1,
        p: 1.5,
        bgcolor: 'background.paper',
      };

  return (
    <Box sx={outerSx}>
      {embeddedInDrawer ? null : (
        <Typography
          variant="subtitle2"
          fontWeight={700}
          color="text.secondary"
          sx={{ mb: 0.5, lineHeight: 1.2, letterSpacing: 0.3, textTransform: 'uppercase', fontSize: '0.7rem' }}
        >
          {row.category}
        </Typography>
      )}

      <Stack direction="row" alignItems="baseline" spacing={1} sx={{ mb: 0.25 }}>
        <Typography variant="h3" fontWeight={800} color="primary.main" sx={{ lineHeight: 1 }}>
          {row.need_score_1to99}
        </Typography>
        <Typography variant="body2" color="text.secondary" fontWeight={600}>
          / 99
        </Typography>
      </Stack>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
        Need score · higher means stronger need to restock
      </Typography>

      <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mb: 1 }}>
        <Typography
          variant="caption"
          color="primary.main"
          sx={{ cursor: 'pointer', fontWeight: 600 }}
          onClick={() => setExplainerOpen((v) => !v)}
        >
          {explainerOpen ? 'Hide' : 'How is this calculated?'}
        </Typography>
        <IconButton
          size="small"
          onClick={() => setExplainerOpen((v) => !v)}
          aria-label={explainerOpen ? 'Hide Need explainer' : 'Show Need explainer'}
          sx={{ p: 0.25 }}
        >
          <ExpandMoreIcon
            fontSize="small"
            sx={{
              transition: 'transform 0.2s',
              transform: explainerOpen ? 'rotate(180deg)' : 'rotate(0deg)',
            }}
          />
        </IconButton>
      </Stack>

      <Collapse in={explainerOpen} unmountOnExit>
        <Box
          sx={{
            mb: 1.25,
            p: 1,
            borderRadius: 1,
            bgcolor: 'action.hover',
            border: '1px solid',
            borderColor: 'divider',
          }}
        >
          <Stack spacing={1.25}>
            <ExplainerBlock
              title="Unit leg"
              value={unitLeg}
              vars={[
                {
                  name: 'shelf_units',
                  value: row.shelf_count.toLocaleString(),
                  note: 'items on shelf',
                },
                {
                  name: 'sold_units',
                  value: row.sold_count.toLocaleString(),
                  note: `sold in past ${windowDays ?? '—'} days`,
                },
              ]}
              formula="sold_units / shelf_units"
              substitution={`${row.sold_count.toLocaleString()} / ${row.shelf_count.toLocaleString()}`}
              result={unitLeg}
            />
            <ExplainerBlock
              title="Retail leg"
              value={retailLeg}
              vars={[
                {
                  name: 'shelf_retail',
                  value: formatCurrency(row.have_retail),
                  note: 'retail value on shelf',
                },
                {
                  name: 'sold_retail',
                  value: formatCurrency(row.want_retail),
                  note: `sold in past ${windowDays ?? '—'} days`,
                },
              ]}
              formula="sold_retail / shelf_retail"
              substitution={`${formatCurrency(row.want_retail)} / ${formatCurrency(row.have_retail)}`}
              result={retailLeg}
            />
            <ExplainerBlock
              title="Combined"
              value={combinedRaw}
              vars={[
                { name: 'unit_leg', value: unitLeg },
                { name: 'retail_leg', value: retailLeg },
              ]}
              formula="(unit_leg + retail_leg) / 2"
              substitution={`(${unitLeg} + ${retailLeg}) / 2`}
              result={combinedRaw}
            />
            <ExplainerBlock
              title="Need score"
              value={`${row.need_score_1to99} / 99`}
              vars={[
                { name: 'combined', value: combinedRaw, note: 'this category' },
                { name: 'min_raw', value: rawMin, note: 'lowest across categories' },
                { name: 'max_raw', value: rawMax, note: 'highest across categories' },
              ]}
              formula="(combined − min_raw) / (max_raw − min_raw) × 99"
              substitution={`(${combinedRaw} − ${rawMin}) / (${rawMax} − ${rawMin}) × 99`}
              result={`${row.need_score_1to99}`}
            />
            {equalBounds ? (
              <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.5 }}>
                All categories currently tie on the combined score, so every category maps to{' '}
                <strong>50</strong>.
              </Typography>
            ) : null}
          </Stack>
        </Box>
      </Collapse>

      <Divider sx={{ mb: 1 }} />

      <Typography
        variant="caption"
        fontWeight={700}
        color="text.secondary"
        sx={{ display: 'block', mb: 0.5, letterSpacing: 0.3 }}
      >
        Last {windowDays ?? '—'} days (since {since})
      </Typography>
      <Stack direction="row" flexWrap="wrap" gap={0.75} sx={{ mb: 1.25 }}>
        <Tile
          label="On shelf"
          primary={`${row.shelf_count.toLocaleString()} units`}
          secondary={formatCurrency(row.have_retail)}
        />
        <Tile
          label="Sold in window"
          primary={`${row.sold_count.toLocaleString()} units`}
          secondary={formatCurrency(row.want_retail)}
        />
      </Stack>

      <Divider sx={{ mb: 1 }} />

      <Typography
        variant="caption"
        fontWeight={700}
        color="text.secondary"
        sx={{ display: 'block', mb: 0.25, letterSpacing: 0.3 }}
      >
        Profitability
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
        Good data: all-time sold rows with sale, retail, and cost each $0.01–$9,999 (row count is the
        n column in the table)
      </Typography>
      <Stack direction="row" flexWrap="wrap" gap={0.75} sx={{ mb: 0.75 }}>
        <Tile label="Avg retail" primary={formatCurrency(row.avg_retail)} />
        <Tile label="Avg sale" primary={formatCurrency(row.avg_sale)} />
        <Tile
          label="Recovery rate"
          primary={`${num(row.recovery_pct)?.toFixed(1) ?? '—'}%`}
        />
      </Stack>
      <Stack direction="row" flexWrap="wrap" gap={0.75} sx={{ mb: 1.25 }}>
        <Tile label="Avg cost" primary={formatCurrency(row.avg_cost)} />
        <Tile label="Avg profit" primary={formatCurrency(row.avg_profit)} />
        <Tile
          label="Profit margin"
          primary={
            (() => {
              const m = num(row.profit_margin);
              return m == null ? '—' : `${(m * 100).toFixed(1)}%`;
            })()
          }
        />
      </Stack>

      <Divider sx={{ mb: 1 }} />

      <Typography
        variant="caption"
        fontWeight={700}
        color="text.secondary"
        sx={{ display: 'block', mb: 0.5, letterSpacing: 0.3 }}
      >
        Flow
      </Typography>
      <Stack direction="row" flexWrap="wrap" gap={0.75}>
        <Tile
          label="Distribution on shelf"
          primary={`${num(row.shelf_pct)?.toFixed(1) ?? '—'}%`}
        />
        <Tile
          label="Distribution of sold"
          primary={`${num(row.sold_pct)?.toFixed(1) ?? '—'}%`}
        />
        <Tile
          label="Gap"
          primary={
            <Box
              component="span"
              sx={{
                color:
                  gap == null
                    ? 'text.primary'
                    : gap > 0
                      ? 'success.main'
                      : gap < 0
                        ? 'error.main'
                        : 'text.primary',
              }}
            >
              {gap != null ? (gap > 0 ? `+${gap.toFixed(1)}` : gap.toFixed(1)) : '—'}
            </Box>
          }
        />
      </Stack>
    </Box>
  );
}
