import { useState, type ReactNode } from 'react';
import {
  Box,
  Collapse,
  Divider,
  IconButton,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { formatCurrency } from '../../utils/format';
import { useAuth } from '../../hooks/useAuth';
import { useBuyingCategoryGoalMutation } from '../../hooks/useBuyingCategoryNeed';
import type { BuyingCategoryGoal, BuyingCategoryNeedRow } from '../../types/buying.types';

function num(s: string | null | undefined): number | null {
  if (s == null || s === '') return null;
  const n = Number.parseFloat(String(s));
  return Number.isFinite(n) ? n : null;
}


type Props = {
  row: BuyingCategoryNeedRow | null;
  needScoreRawGlobalMin: string | null | undefined;
  needScoreRawGlobalMax: string | null | undefined;
  needWindowDays: number | null | undefined;
  /** Assumptions target weeks; 0 = auto (store average cover). */
  targetCoverWeeks?: number | null;
  pipelineMaxAgeDays?: number | null;
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
                - {v.note}
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

const GOAL_MULTIPLIER: Record<BuyingCategoryGoal, number> = { more: 1.5, normal: 1, less: 0.5, stop: 1 };
const GOAL_LABEL: Record<BuyingCategoryGoal, string> = {
  more: 'want more: 1.5x the target',
  normal: 'normal',
  less: 'want less: half the target',
  stop: 'stop buying: Need 1',
};

/** Manager goal for a category (Admin can change it; others see it). */
function CategoryGoalPicker({ category, goal }: { category: string; goal: BuyingCategoryGoal }) {
  const { hasRole } = useAuth();
  const canEdit = hasRole('Admin');
  const mutation = useBuyingCategoryGoalMutation();
  return (
    <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
      <Typography variant="caption" color="text.secondary" fontWeight={600}>
        Goal
      </Typography>
      <ToggleButtonGroup
        size="small"
        exclusive
        value={goal}
        disabled={!canEdit || mutation.isPending}
        onChange={(_e, next: BuyingCategoryGoal | null) => {
          if (next && next !== goal) mutation.mutate({ category, goal: next });
        }}
        aria-label={`Buying goal for ${category}`}
      >
        {(['more', 'normal', 'less', 'stop'] as const).map((g) => (
          <Tooltip key={g} title={GOAL_LABEL[g]} placement="top">
            <ToggleButton value={g} sx={{ py: 0.25, px: 1, fontSize: '0.7rem', textTransform: 'none' }}>
              {g === 'more' ? 'More' : g === 'normal' ? 'Normal' : g === 'less' ? 'Less' : 'Stop'}
            </ToggleButton>
          </Tooltip>
        ))}
      </ToggleButtonGroup>
    </Stack>
  );
}

function soldWindowSinceLabel(days: number | null | undefined): string {
  if (days == null || !Number.isFinite(days) || days < 1) return '-';
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
  needWindowDays,
  targetCoverWeeks,
  pipelineMaxAgeDays,
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
  const inBuilding = row.in_building_units ?? 0;
  const onOrder = row.on_order_units ?? 0;
  const supply = row.shelf_count + inBuilding + onOrder;
  const weekly = num(row.weekly_sales_units);
  const cover = num(row.cover_weeks);
  const target = num(row.target_weeks);
  const goal: BuyingCategoryGoal = row.goal ?? 'normal';
  const autoTarget = (targetCoverWeeks ?? 0) === 0;
  const baseTarget = target != null ? target / (GOAL_MULTIPLIER[goal] ?? 1) : null;
  const wk = (n: number | null) => (n == null ? '-' : n.toFixed(1));
  const noSales = weekly == null || weekly <= 0;
  const gap = num(row.need_gap);

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
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.75 }}>
        Need · 50 = on target, higher = short on stock, lower = overstocked
      </Typography>

      <CategoryGoalPicker category={row.category} goal={goal} />

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
              title="Supply"
              value={supply.toLocaleString()}
              vars={[
                { name: 'shelf', value: row.shelf_count.toLocaleString(), note: 'items on shelf' },
                { name: 'in_building', value: inBuilding.toLocaleString(), note: 'intake + processing' },
                {
                  name: 'on_order',
                  value: onOrder.toLocaleString(),
                  note: `open POs from the last ${pipelineMaxAgeDays ?? '-'} days, not processed`,
                },
              ]}
              formula="shelf + in_building + on_order"
              substitution={`${row.shelf_count.toLocaleString()} + ${inBuilding.toLocaleString()} + ${onOrder.toLocaleString()}`}
              result={supply.toLocaleString()}
            />
            <ExplainerBlock
              title="Weekly sales"
              value={wk(weekly)}
              vars={[
                { name: 'sold', value: row.sold_count.toLocaleString(), note: `sold in past ${windowDays ?? '-'} days` },
                { name: 'weeks', value: windowDays != null ? (windowDays / 7).toFixed(1) : '-' },
              ]}
              formula="sold / weeks"
              substitution={`${row.sold_count.toLocaleString()} / ${windowDays != null ? (windowDays / 7).toFixed(1) : '-'}`}
              result={wk(weekly)}
            />
            <ExplainerBlock
              title="Weeks of cover"
              value={wk(cover)}
              vars={[
                { name: 'supply', value: supply.toLocaleString() },
                { name: 'weekly_sales', value: wk(weekly) },
              ]}
              formula="supply / weekly_sales"
              substitution={`${supply.toLocaleString()} / ${wk(weekly)}`}
              result={noSales ? 'none sold' : wk(cover)}
            />
            <ExplainerBlock
              title="Target"
              value={`${wk(target)} wk`}
              vars={[
                {
                  name: 'base',
                  value: wk(baseTarget),
                  note: autoTarget ? "the store's average cover" : 'Admin > Assumptions',
                },
                { name: 'goal', value: `x${GOAL_MULTIPLIER[goal] ?? 1}`, note: GOAL_LABEL[goal] },
              ]}
              formula="base x goal"
              substitution={`${wk(baseTarget)} x ${GOAL_MULTIPLIER[goal] ?? 1}`}
              result={wk(target)}
            />
            <ExplainerBlock
              title="Need"
              value={`${row.need_score_1to99} / 99`}
              vars={[
                { name: 'cover', value: wk(cover) },
                { name: 'target', value: wk(target) },
              ]}
              formula="100 x (1 - cover / target / 2), 1 to 99"
              substitution={`100 x (1 - ${wk(cover)} / ${wk(target)} / 2)`}
              result={`${row.need_score_1to99}`}
            />
            {goal === 'stop' ? (
              <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.5 }}>
                The goal is <strong>Stop</strong>, so Need is always 1.
              </Typography>
            ) : noSales ? (
              <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.5 }}>
                Nothing sold in the window: Need is 1 while we hold stock, and 50 when we hold none.
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
        Stock and pipeline · sales since {since}
      </Typography>
      <Stack direction="row" flexWrap="wrap" gap={0.75} sx={{ mb: 0.75 }}>
        <Tile
          label="On shelf"
          primary={`${row.shelf_count.toLocaleString()} units`}
          secondary={formatCurrency(row.have_retail)}
        />
        <Tile label="In the building" primary={`${inBuilding.toLocaleString()} units`} secondary="intake + processing" />
        <Tile label="On order" primary={`${onOrder.toLocaleString()} units`} secondary="open POs, not processed" />
      </Stack>
      <Stack direction="row" flexWrap="wrap" gap={0.75} sx={{ mb: 1.25 }}>
        <Tile
          label="Sold in window"
          primary={`${row.sold_count.toLocaleString()} units`}
          secondary={`${wk(weekly)} a week · ${formatCurrency(row.want_retail)}`}
        />
        <Tile
          label="Weeks of cover"
          primary={noSales ? 'none sold' : `${wk(cover)} wk`}
          secondary={`target ${wk(target)} wk`}
        />
        <Tile
          label="Days to sell"
          primary={row.median_days_to_sell != null ? `${row.median_days_to_sell} days` : '-'}
          secondary={
            row.sold_within_90_pct != null ? `median · ${num(row.sold_within_90_pct)?.toFixed(0)}% within 90 days` : 'median'
          }
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
        Good data: all-time sold rows with sale, retail, and cost each $0.01-$9,999 (row count is the
        n column in the table)
      </Typography>
      <Stack direction="row" flexWrap="wrap" gap={0.75} sx={{ mb: 0.75 }}>
        <Tile label="Avg retail" primary={formatCurrency(row.avg_retail)} />
        <Tile label="Avg sale" primary={formatCurrency(row.avg_sale)} />
        <Tile
          label="Recovery rate"
          primary={`${num(row.recovery_pct)?.toFixed(1) ?? '-'}%`}
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
              return m == null ? '-' : `${(m * 100).toFixed(1)}%`;
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
          primary={`${num(row.shelf_pct)?.toFixed(1) ?? '-'}%`}
        />
        <Tile
          label="Distribution of sold"
          primary={`${num(row.sold_pct)?.toFixed(1) ?? '-'}%`}
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
              {gap != null ? (gap > 0 ? `+${gap.toFixed(1)}` : gap.toFixed(1)) : '-'}
            </Box>
          }
        />
      </Stack>
    </Box>
  );
}
