import { useEffect, useMemo, useState } from 'react';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import {
  Box,
  Button,
  Card,
  Chip,
  Divider,
  IconButton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableFooter,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import BuyingDetailSectionTitle from './BuyingDetailSectionTitle';
import { useBuyingCategoryNeed } from '../../hooks/useBuyingCategoryNeed';
import { useBuyingValuationInputsMutation } from '../../hooks/useBuyingValuationInputsMutation';
import type { BuyingAuctionDetail } from '../../types/buying.types';
import { formatCurrency, formatCurrencyWhole } from '../../utils/format';
import { parseDec } from '../../utils/valuationParse';

const DEFAULT_PROFIT_TARGET_RATIO = 2;
const DEFAULT_METRIC_COLOR = '#9A8866';
const TABLE_BODY_MAX_HEIGHT_PX = 280;

/** Single-line rows/headers: ellipsis + fixed layout column weights. */
const CATEGORY_MIX_COL_SX = {
  py: 0.5,
  px: 1,
  whiteSpace: 'nowrap' as const,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  lineHeight: 1.2,
  verticalAlign: 'middle' as const,
};

const CATEGORY_TABLE_COLGROUP = (
  <colgroup>
    <col style={{ width: '22%' }} />
    <col style={{ width: '8%' }} />
    <col style={{ width: '10%' }} />
    <col style={{ width: '9%' }} />
    <col style={{ width: '13%' }} />
    <col style={{ width: '11%' }} />
    <col style={{ width: '27%' }} />
  </colgroup>
);

function derivedAppliedShrinkageRatio(detail: BuyingAuctionDetail): number | null {
  const eff = parseDec(detail.effective_revenue_after_shrink);
  const base = parseDec(detail.revenue_override ?? detail.estimated_revenue ?? '');
  if (eff == null || base == null || base === 0) return null;
  const s = 1 - eff / base;
  if (!Number.isFinite(s) || s < 0 || s > 1) return null;
  return s;
}

function needScoreColor(score: number | null): string {
  if (score == null) return 'text.secondary';
  if (score >= 60) return 'success.main';
  if (score >= 30) return 'warning.main';
  return 'text.secondary';
}

type LocalOverrides = {
  fees: string;
  ship: string;
  shrink: string;
  profitT: string;
  revenue: string;
};

type EditField = 'fees' | 'ship' | 'shrink' | 'profitT' | 'revenue' | 'effPost';

type ValuationInlineFieldProps = {
  label: string;
  caption?: string;
  isOverride: boolean;
  display: string;
  isEditing: boolean;
  draft: string;
  onDraftChange: (v: string) => void;
  onStartEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
  disabled?: boolean;
  inputMode?: 'none' | 'text' | 'tel' | 'url' | 'email' | 'numeric' | 'decimal' | 'search';
};

function ValuationInlineField({
  label,
  caption,
  isOverride,
  display,
  isEditing,
  draft,
  onDraftChange,
  onStartEdit,
  onSave,
  onCancel,
  disabled,
  inputMode,
}: ValuationInlineFieldProps) {
  const valueSx = {
    cursor: disabled ? 'default' : 'pointer',
    pl: isOverride ? 0.75 : 0,
    borderLeft: isOverride ? '2px solid' : 'none',
    borderLeftColor: 'primary.main',
    minHeight: 24,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    color: isOverride ? 'text.primary' : DEFAULT_METRIC_COLOR,
    fontWeight: isOverride ? 600 : 500,
    fontVariantNumeric: 'tabular-nums' as const,
  };

  const labelEl = (
    <Typography variant="caption" color="text.secondary" display="block" lineHeight={1.2}>
      {label}
    </Typography>
  );

  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0,1fr) auto',
        alignItems: 'start',
        gap: 0.5,
        columnGap: 1,
      }}
    >
      <Box>
        {caption ? (
          <Tooltip title={caption} placement="top" enterDelay={200} arrow>
            <Box sx={{ display: 'inline-block', cursor: 'help' }}>{labelEl}</Box>
          </Tooltip>
        ) : (
          labelEl
        )}
      </Box>
      <Stack direction="row" alignItems="center" spacing={0.25} justifyContent="flex-end">
        {isEditing ? (
          <>
            <TextField
              size="small"
              value={draft}
              onChange={(e) => onDraftChange(e.target.value)}
              autoFocus
              disabled={disabled}
              inputProps={{ inputMode }}
              onFocus={(e) => (e.target as HTMLInputElement).select()}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  onSave();
                }
                if (e.key === 'Escape') {
                  e.preventDefault();
                  onCancel();
                }
              }}
              sx={{
                width: 128,
                '& .MuiInputBase-root': { py: 0, fontSize: '0.8125rem' },
              }}
            />
            <IconButton
              size="small"
              aria-label="Save"
              color="success"
              onMouseDown={(e) => e.preventDefault()}
              onClick={onSave}
            >
              <CheckIcon sx={{ fontSize: 18 }} />
            </IconButton>
            <IconButton
              size="small"
              aria-label="Cancel"
              onMouseDown={(e) => e.preventDefault()}
              onClick={onCancel}
            >
              <CloseIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </>
        ) : (
          <Stack
            direction="row"
            alignItems="center"
            spacing={0.25}
            onClick={() => {
              if (!disabled) onStartEdit();
            }}
            onKeyDown={(e) => {
              if (disabled) return;
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onStartEdit();
              }
            }}
            tabIndex={disabled ? -1 : 0}
            role={disabled ? undefined : 'button'}
            sx={{ cursor: disabled ? 'default' : 'pointer', '&:hover .edit-hint': { opacity: 1 } }}
          >
            <Typography variant="body2" sx={valueSx}>
              {display}
            </Typography>
            {!disabled ? (
              <EditOutlinedIcon
                className="edit-hint"
                sx={{ fontSize: 14, color: 'action.active', opacity: 0.4, transition: 'opacity 0.15s' }}
              />
            ) : null}
          </Stack>
        )}
      </Stack>
    </Box>
  );
}

function useValuationBreakdownRows(detail: BuyingAuctionDetail) {
  const { data: needData } = useBuyingCategoryNeed();

  const recoveryRateByCat = useMemo(() => {
    const m = new Map<string, number>();
    needData?.categories.forEach((c) => {
      const r = parseDec(c.recovery_rate);
      if (r != null) m.set(c.category, r);
    });
    return m;
  }, [needData]);

  const needScoreByCat = useMemo(() => {
    const m = new Map<string, number>();
    needData?.categories.forEach((c) => {
      const n = c.need_score_1to99;
      if (typeof n === 'number' && Number.isFinite(n)) m.set(c.category, n);
    });
    return m;
  }, [needData]);

  const mix =
    detail.valuation_source === 'manifest'
      ? detail.manifest_category_distribution
      : detail.ai_category_estimates;

  const retailBase = parseDec(detail.total_retail_value) ?? 0;

  const unitByCategory = useMemo(() => {
    const m = new Map<string, number>();
    const top = detail.category_distribution?.top;
    if (!top?.length) return m;
    for (const t of top) {
      m.set(t.canonical_category, t.count);
    }
    return m;
  }, [detail.category_distribution]);

  const breakdownRows = useMemo(() => {
    if (!mix || typeof mix !== 'object') return [];
    const entries = Object.entries(mix as Record<string, number>);
    const parsed: { category: string; n: number }[] = [];
    for (const [category, raw] of entries) {
      const n = typeof raw === 'number' ? raw : Number.parseFloat(String(raw));
      if (!Number.isFinite(n) || n <= 0) continue;
      parsed.push({ category, n });
    }
    const total = parsed.reduce((s, x) => s + x.n, 0);
    if (total <= 0) return [];
    const rows = parsed.map(({ category, n }) => {
      const fraction = n / total;
      const pctDisplay = fraction * 100;
      const rate = recoveryRateByCat.get(category) ?? 0;
      const attributed = retailBase * fraction;
      const estRev = attributed * rate;
      const needMetric = needScoreByCat.get(category);
      const units = unitByCategory.get(category);
      return {
        category,
        fraction,
        pctDisplay,
        attributed,
        rate,
        estRev,
        needMetric: needMetric != null && Number.isFinite(needMetric) ? needMetric : null,
        units: units != null && Number.isFinite(units) ? units : null,
      };
    });
    rows.sort((a, b) => b.pctDisplay - a.pctDisplay);
    return rows;
  }, [mix, retailBase, recoveryRateByCat, needScoreByCat, unitByCategory]);

  const tableTotals = useMemo(() => {
    if (breakdownRows.length === 0) return null;
    const anyMissingNeed = breakdownRows.some((r) => r.needMetric == null);
    const sumProductNeed = anyMissingNeed
      ? null
      : breakdownRows.reduce((s, r) => s + (r.needMetric as number) * r.fraction, 0);
    const totalRetail = breakdownRows.reduce((s, r) => s + r.attributed, 0);
    const totalEstRev = breakdownRows.reduce((s, r) => s + r.estRev, 0);
    const distTotal = detail.category_distribution?.total_rows;
    const totalUnits =
      typeof distTotal === 'number' && distTotal > 0
        ? distTotal
        : typeof detail.manifest_row_count === 'number' && detail.manifest_row_count > 0
          ? detail.manifest_row_count
          : null;
    return { sumProductNeed, totalRetail, totalEstRev, totalUnits };
  }, [breakdownRows, detail.category_distribution?.total_rows, detail.manifest_row_count]);

  return { breakdownRows, tableTotals };
}

type CostsProps = { detail: BuyingAuctionDetail; isAdmin: boolean };

/** Cell 2,1 — costs and revenue overrides. */
export function ValuationCostsCard({ detail, isAdmin }: CostsProps) {
  const valuationMutation = useBuyingValuationInputsMutation();
  const { tableTotals } = useValuationBreakdownRows(detail);

  const [local, setLocal] = useState<LocalOverrides>({
    fees: detail.fees_override ?? '',
    ship: detail.shipping_override ?? '',
    shrink: detail.shrinkage_override ?? '',
    profitT: detail.profit_target_override ?? '',
    revenue: detail.revenue_override ?? '',
  });

  const [editField, setEditField] = useState<EditField | null>(null);
  const [editDraft, setEditDraft] = useState('');

  useEffect(() => {
    setLocal({
      fees: detail.fees_override ?? '',
      ship: detail.shipping_override ?? '',
      shrink: detail.shrinkage_override ?? '',
      profitT: detail.profit_target_override ?? '',
      revenue: detail.revenue_override ?? '',
    });
  }, [
    detail.id,
    detail.fees_override,
    detail.shipping_override,
    detail.shrinkage_override,
    detail.profit_target_override,
    detail.revenue_override,
  ]);

  useEffect(() => {
    setEditField(null);
    setEditDraft('');
  }, [detail.id]);

  const flushOverrides = (next?: Partial<LocalOverrides>) => {
    if (!isAdmin) return;
    const L: LocalOverrides = { ...local, ...next };
    setLocal(L);
    valuationMutation.mutate({
      auctionId: detail.id,
      body: {
        fees_override: L.fees.trim() || null,
        shipping_override: L.ship.trim() || null,
        shrinkage_override: L.shrink.trim() || null,
        profit_target_override: L.profitT.trim() || null,
        revenue_override: L.revenue.trim() || null,
      },
    });
  };

  const beginEdit = (field: EditField) => {
    switch (field) {
      case 'fees': {
        const seed =
          detail.fees_override != null && String(detail.fees_override).trim() !== ''
            ? String(detail.fees_override)
            : detail.estimated_fees ?? '';
        setEditDraft(seed);
        break;
      }
      case 'ship': {
        const seed =
          detail.shipping_override != null && String(detail.shipping_override).trim() !== ''
            ? String(detail.shipping_override)
            : detail.estimated_shipping ?? '';
        setEditDraft(seed);
        break;
      }
      case 'revenue': {
        const seed =
          detail.revenue_override != null && String(detail.revenue_override).trim() !== ''
            ? String(detail.revenue_override)
            : detail.estimated_revenue ?? '';
        setEditDraft(seed);
        break;
      }
      case 'effPost': {
        setEditDraft(detail.effective_revenue_after_shrink ?? '');
        break;
      }
      case 'shrink': {
        const o = detail.shrinkage_override;
        if (o != null && String(o).trim() !== '') {
          setEditDraft(String(o));
        } else {
          const d = derivedAppliedShrinkageRatio(detail);
          setEditDraft(d != null ? d.toFixed(4) : '');
        }
        break;
      }
      case 'profitT': {
        const o = detail.profit_target_override;
        if (o != null && String(o).trim() !== '') {
          setEditDraft(String(o));
        } else {
          setEditDraft(String(DEFAULT_PROFIT_TARGET_RATIO));
        }
        break;
      }
      default:
        break;
    }
    setEditField(field);
  };

  const cancelEdit = () => {
    setEditField(null);
    setEditDraft('');
  };

  const commitEdit = (field: EditField) => {
    const d = editDraft.trim();
    switch (field) {
      case 'fees':
        flushOverrides({ fees: d });
        break;
      case 'ship':
        flushOverrides({ ship: d });
        break;
      case 'revenue':
        flushOverrides({ revenue: d });
        break;
      case 'shrink':
        flushOverrides({ shrink: d });
        break;
      case 'profitT':
        flushOverrides({ profitT: d });
        break;
      case 'effPost': {
        const eff = parseDec(editDraft);
        let s: number | null =
          detail.shrinkage_override != null && String(detail.shrinkage_override).trim() !== ''
            ? parseDec(detail.shrinkage_override)
            : derivedAppliedShrinkageRatio(detail);
        if (s == null) s = 0.1;
        if (eff == null || !Number.isFinite(eff) || s >= 1 || s < 0) break;
        const pre = eff / (1 - s);
        flushOverrides({ revenue: pre.toFixed(2) });
        break;
      }
      default:
        break;
    }
    setEditField(null);
    setEditDraft('');
  };

  const feesIsOverride =
    detail.fees_override != null && String(detail.fees_override).trim() !== '';
  const shipIsOverride =
    detail.shipping_override != null && String(detail.shipping_override).trim() !== '';
  const revenueIsOverride =
    detail.revenue_override != null && String(detail.revenue_override).trim() !== '';
  const shrinkIsOverride =
    detail.shrinkage_override != null && String(detail.shrinkage_override).trim() !== '';
  const profitTIsOverride =
    detail.profit_target_override != null && String(detail.profit_target_override).trim() !== '';

  const inputsPending = valuationMutation.isPending;

  const feesDisplay = (() => {
    if (inputsPending) {
      if (local.fees.trim() !== '') return formatCurrency(local.fees);
      return formatCurrency(detail.estimated_fees);
    }
    return feesIsOverride
      ? formatCurrency(detail.fees_override)
      : formatCurrency(detail.estimated_fees);
  })();
  const shipDisplay = (() => {
    if (inputsPending) {
      if (local.ship.trim() !== '') return formatCurrency(local.ship);
      return formatCurrency(detail.estimated_shipping);
    }
    return shipIsOverride
      ? formatCurrency(detail.shipping_override)
      : formatCurrency(detail.estimated_shipping);
  })();
  const revenueDisplay = (() => {
    if (inputsPending) {
      if (local.revenue.trim() !== '') return formatCurrency(local.revenue);
      return formatCurrency(detail.estimated_revenue);
    }
    return revenueIsOverride
      ? formatCurrency(detail.revenue_override)
      : formatCurrency(detail.estimated_revenue);
  })();

  const appliedShrinkRatio = (() => {
    if (inputsPending) {
      const t = local.shrink.trim();
      if (t === '') return null;
      return parseDec(t);
    }
    return shrinkIsOverride
      ? parseDec(detail.shrinkage_override)
      : derivedAppliedShrinkageRatio(detail);
  })();
  const shrinkDisplay =
    appliedShrinkRatio != null && Number.isFinite(appliedShrinkRatio)
      ? `${(appliedShrinkRatio * 100).toFixed(1)}%`
      : '—';

  const appliedProfitTarget = (() => {
    if (inputsPending) {
      const t = local.profitT.trim();
      if (t === '') return null;
      return parseDec(t);
    }
    return profitTIsOverride
      ? parseDec(detail.profit_target_override)
      : DEFAULT_PROFIT_TARGET_RATIO;
  })();
  const profitTDisplay =
    appliedProfitTarget != null && Number.isFinite(appliedProfitTarget)
      ? `${appliedProfitTarget.toFixed(2)}x`
      : '—';

  const effPostDisplay = formatCurrency(detail.effective_revenue_after_shrink);
  const preShrinkFromTable = tableTotals?.totalEstRev ?? null;
  const preShrinkResolved = parseDec(detail.revenue_override ?? detail.estimated_revenue ?? '');
  const hasRevenueOverride = detail.revenue_override != null && String(detail.revenue_override).trim() !== '';
  const showPreReset =
    isAdmin &&
    (hasRevenueOverride ||
      (preShrinkFromTable != null &&
        preShrinkResolved != null &&
        Math.abs(preShrinkResolved - preShrinkFromTable) > 0.01));

  const resetPreShrinkToTable = () => {
    if (!isAdmin) return;
    flushOverrides({ revenue: '' });
  };

  const estProfit = parseDec(detail.est_profit);
  const totalCost = parseDec(detail.estimated_total_cost);
  const marginPct =
    estProfit != null && totalCost != null && totalCost > 0
      ? (estProfit / totalCost) * 100
      : null;

  return (
    <Card variant="outlined" sx={{ p: 1.25, height: '100%', display: 'flex', flexDirection: 'column', overflow: 'visible' }}>
      <BuyingDetailSectionTitle first>Costs &amp; revenue</BuyingDetailSectionTitle>

      {/* Inputs section */}
      <Box sx={{ bgcolor: 'action.hover', borderRadius: 1, p: 1.25, mb: 1.25 }}>
        <Typography variant="caption" color="text.secondary" fontWeight={700} display="block" sx={{ mb: 0.75, fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: 0.5 }}>
          Inputs
        </Typography>
        <Stack spacing={1}>
          <Stack direction="row" justifyContent="space-between" alignItems="baseline">
            <Typography variant="body2" color="text.secondary">
              Current price
            </Typography>
            <Typography variant="body2" fontWeight={600} sx={{ fontVariantNumeric: 'tabular-nums' }}>
              {formatCurrency(detail.current_price)}
            </Typography>
          </Stack>
          {isAdmin ? (
            <>
              <ValuationInlineField
                label="Fees"
                caption="Override ($); default = rate x price"
                isOverride={feesIsOverride}
                display={feesDisplay}
                isEditing={editField === 'fees'}
                draft={editDraft}
                onDraftChange={setEditDraft}
                onStartEdit={() => beginEdit('fees')}
                onSave={() => commitEdit('fees')}
                onCancel={cancelEdit}
                inputMode="decimal"
              />
              <ValuationInlineField
                label="Shipping"
                caption="Override ($); default = rate x price"
                isOverride={shipIsOverride}
                display={shipDisplay}
                isEditing={editField === 'ship'}
                draft={editDraft}
                onDraftChange={setEditDraft}
                onStartEdit={() => beginEdit('ship')}
                onSave={() => commitEdit('ship')}
                onCancel={cancelEdit}
                inputMode="decimal"
              />
              <ValuationInlineField
                label="Shrinkage (loss share)"
                caption="Decimal 0-1; effective = (1 - shrink) x pre-shrink"
                isOverride={shrinkIsOverride}
                display={shrinkDisplay}
                isEditing={editField === 'shrink'}
                draft={editDraft}
                onDraftChange={setEditDraft}
                onStartEdit={() => beginEdit('shrink')}
                onSave={() => commitEdit('shrink')}
                onCancel={cancelEdit}
                inputMode="decimal"
              />
              <ValuationInlineField
                label="Profit goal"
                caption="Min revenue / cost (ratio)"
                isOverride={profitTIsOverride}
                display={profitTDisplay}
                isEditing={editField === 'profitT'}
                draft={editDraft}
                onDraftChange={setEditDraft}
                onStartEdit={() => beginEdit('profitT')}
                onSave={() => commitEdit('profitT')}
                onCancel={cancelEdit}
                inputMode="decimal"
              />
            </>
          ) : (
            <>
              <Stack direction="row" justifyContent="space-between">
                <Typography variant="caption" color="text.secondary">Fees</Typography>
                <Typography variant="body2" sx={{ color: DEFAULT_METRIC_COLOR, fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(detail.estimated_fees)}</Typography>
              </Stack>
              <Stack direction="row" justifyContent="space-between">
                <Typography variant="caption" color="text.secondary">Shipping</Typography>
                <Typography variant="body2" sx={{ color: DEFAULT_METRIC_COLOR, fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(detail.estimated_shipping)}</Typography>
              </Stack>
              <Stack direction="row" justifyContent="space-between">
                <Typography variant="caption" color="text.secondary">Shrinkage</Typography>
                <Typography variant="body2" sx={{ fontVariantNumeric: 'tabular-nums' }}>{shrinkDisplay}</Typography>
              </Stack>
              <Stack direction="row" justifyContent="space-between">
                <Typography variant="caption" color="text.secondary">Profit goal</Typography>
                <Typography variant="body2" sx={{ fontVariantNumeric: 'tabular-nums' }}>{profitTDisplay}</Typography>
              </Stack>
            </>
          )}
          <Box>
            <Stack direction="row" alignItems="flex-start" justifyContent="space-between" gap={0.5}>
              <Tooltip
                title={`From table: ${preShrinkFromTable != null ? formatCurrencyWhole(String(preShrinkFromTable)) : '—'}. Edit to override.`}
                placement="top"
                enterDelay={200}
                arrow
              >
                <Typography variant="caption" color="text.secondary" display="block" fontWeight={600} sx={{ cursor: 'help' }}>
                  Revenue (pre-shrink)
                </Typography>
              </Tooltip>
              {showPreReset ? (
                <Button
                  type="button"
                  size="small"
                  onClick={resetPreShrinkToTable}
                  sx={{ color: 'error.light', textTransform: 'none', fontSize: '0.7rem', minWidth: 0, px: 0.5, flexShrink: 0 }}
                >
                  Reset
                </Button>
              ) : null}
            </Stack>
            {isAdmin ? (
              <ValuationInlineField
                label="Pre-shrink total"
                isOverride={revenueIsOverride}
                display={revenueDisplay}
                isEditing={editField === 'revenue'}
                draft={editDraft}
                onDraftChange={setEditDraft}
                onStartEdit={() => beginEdit('revenue')}
                onSave={() => commitEdit('revenue')}
                onCancel={cancelEdit}
                inputMode="decimal"
              />
            ) : (
              <Typography variant="body2" sx={{ mt: 0.5, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                {revenueDisplay}
              </Typography>
            )}
          </Box>
        </Stack>
      </Box>

      <Divider sx={{ mb: 1.25 }} />

      {/* Calculated outputs section */}
      <Typography variant="caption" color="text.secondary" fontWeight={700} display="block" sx={{ mb: 0.75, fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: 0.5 }}>
        Calculated
      </Typography>
      <Stack spacing={1} sx={{ flex: 1 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="baseline">
          <Typography variant="body2" fontWeight={700}>Total cost</Typography>
          <Typography variant="body2" fontWeight={700} sx={{ fontVariantNumeric: 'tabular-nums' }}>
            {formatCurrency(detail.estimated_total_cost)}
          </Typography>
        </Stack>
        {isAdmin ? (
          <ValuationInlineField
            label="Expected revenue (after shrink)"
            caption="Editing adjusts pre-shrink; ties to shrink"
            isOverride={Boolean(detail.has_revenue_override)}
            display={effPostDisplay}
            isEditing={editField === 'effPost'}
            draft={editDraft}
            onDraftChange={setEditDraft}
            onStartEdit={() => beginEdit('effPost')}
            onSave={() => commitEdit('effPost')}
            onCancel={cancelEdit}
            inputMode="decimal"
          />
        ) : (
          <Stack direction="row" justifyContent="space-between">
            <Typography variant="caption" color="text.secondary">Expected revenue (after shrink)</Typography>
            <Typography variant="body2" fontWeight={600} sx={{ fontVariantNumeric: 'tabular-nums' }}>{effPostDisplay}</Typography>
          </Stack>
        )}
        <Stack direction="row" justifyContent="space-between" alignItems="baseline">
          <Typography variant="body2" fontWeight={600}>Est. profit</Typography>
          <Typography
            variant="body2"
            fontWeight={700}
            sx={{
              fontVariantNumeric: 'tabular-nums',
              color: estProfit != null ? (estProfit >= 0 ? 'success.main' : 'error.main') : 'text.primary',
            }}
          >
            {estProfit != null ? formatCurrency(estProfit) : '—'}
          </Typography>
        </Stack>
        <Stack direction="row" justifyContent="space-between" alignItems="baseline">
          <Typography variant="body2" fontWeight={600}>Margin</Typography>
          <Typography
            variant="body2"
            fontWeight={700}
            sx={{
              fontVariantNumeric: 'tabular-nums',
              color: marginPct != null ? (marginPct >= 0 ? 'success.main' : 'error.main') : 'text.primary',
            }}
          >
            {marginPct != null ? `${marginPct.toFixed(1)}%` : '—'}
          </Typography>
        </Stack>
      </Stack>

      {valuationMutation.isPending ? (
        <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
          Saving...
        </Typography>
      ) : null}
    </Card>
  );
}

type TableProps = {
  detail: BuyingAuctionDetail;
  /** Sets manifest "Fast category" filter to this mix row's category (matches API `category` param). */
  onCategoryRowClick?: (filterValue: string) => void;
};

/** Cell 3,1 — category mix table (scroll body only). */
export function ValuationCategoryTableCard({ detail, onCategoryRowClick }: TableProps) {
  const { breakdownRows, tableTotals } = useValuationBreakdownRows(detail);

  if (breakdownRows.length === 0) {
    return (
      <Card variant="outlined" sx={{ p: 1.25, height: '100%' }}>
        <BuyingDetailSectionTitle first>Category mix</BuyingDetailSectionTitle>
        <Typography variant="body2" color="text.secondary">
          No category mix yet.
        </Typography>
      </Card>
    );
  }

  return (
    <Card variant="outlined" sx={{ p: 1.25, height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <BuyingDetailSectionTitle first>Category mix</BuyingDetailSectionTitle>
      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          borderRadius: 1,
          border: 1,
          borderColor: 'divider',
          overflow: 'hidden',
        }}
      >
        <Table size="small" sx={{ tableLayout: 'fixed', width: '100%' }}>
          {CATEGORY_TABLE_COLGROUP}
          <TableHead>
            <TableRow sx={{ bgcolor: 'action.hover' }}>
              <TableCell sx={CATEGORY_MIX_COL_SX}>Category</TableCell>
              <TableCell align="right" sx={CATEGORY_MIX_COL_SX}>
                Units
              </TableCell>
              <TableCell align="right" sx={CATEGORY_MIX_COL_SX}>
                Need metric
              </TableCell>
              <TableCell align="right" sx={CATEGORY_MIX_COL_SX}>
                % retail
              </TableCell>
              <TableCell align="right" sx={CATEGORY_MIX_COL_SX}>
                Retail $
              </TableCell>
              <TableCell align="right" sx={CATEGORY_MIX_COL_SX}>
                Recovery
              </TableCell>
              <TableCell align="right" sx={CATEGORY_MIX_COL_SX}>
                Est. revenue
              </TableCell>
            </TableRow>
          </TableHead>
        </Table>
        <TableContainer
          sx={{
            flex: 1,
            minHeight: 0,
            maxHeight: TABLE_BODY_MAX_HEIGHT_PX,
            overflowY: 'auto',
            overflowX: 'hidden',
            boxShadow: (theme) =>
              `inset 0 4px 6px -4px ${theme.palette.mode === 'dark' ? 'rgba(0,0,0,0.25)' : 'rgba(0,0,0,0.06)'}`,
          }}
        >
          <Table size="small" sx={{ tableLayout: 'fixed', width: '100%' }}>
            {CATEGORY_TABLE_COLGROUP}
            <TableBody>
              {breakdownRows.map((r) => (
                <TableRow
                  key={r.category}
                  hover={Boolean(onCategoryRowClick)}
                  title={onCategoryRowClick ? 'Filter manifest rows by this category' : undefined}
                  onClick={onCategoryRowClick ? () => onCategoryRowClick(r.category) : undefined}
                  sx={onCategoryRowClick ? { cursor: 'pointer' } : undefined}
                >
                  <TableCell sx={{ ...CATEGORY_MIX_COL_SX, maxWidth: 0 }} title={r.category}>
                    {r.category}
                  </TableCell>
                  <TableCell align="right" sx={{ ...CATEGORY_MIX_COL_SX, fontVariantNumeric: 'tabular-nums' }}>
                    {r.units != null ? r.units.toLocaleString() : '—'}
                  </TableCell>
                  <TableCell
                    align="right"
                    sx={{
                      ...CATEGORY_MIX_COL_SX,
                      fontVariantNumeric: 'tabular-nums',
                      color: needScoreColor(r.needMetric),
                    }}
                  >
                    {r.needMetric != null ? Math.round(r.needMetric) : '—'}
                  </TableCell>
                  <TableCell align="right" sx={{ ...CATEGORY_MIX_COL_SX, fontVariantNumeric: 'tabular-nums' }}>
                    {r.pctDisplay.toFixed(1)}%
                  </TableCell>
                  <TableCell align="right" sx={{ ...CATEGORY_MIX_COL_SX, fontVariantNumeric: 'tabular-nums' }}>
                    {formatCurrencyWhole(String(r.attributed))}
                  </TableCell>
                  <TableCell
                    align="right"
                    sx={{
                      ...CATEGORY_MIX_COL_SX,
                      fontVariantNumeric: 'tabular-nums',
                      color:
                        r.rate >= 0.35
                          ? 'success.main'
                          : r.rate >= 0.2
                            ? 'warning.main'
                            : 'error.main',
                      fontWeight: 600,
                    }}
                  >
                    {(r.rate * 100).toFixed(1)}%
                  </TableCell>
                  <TableCell align="right" sx={{ ...CATEGORY_MIX_COL_SX, fontVariantNumeric: 'tabular-nums' }}>
                    {formatCurrencyWhole(String(r.estRev))}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
        {tableTotals ? (
          <Table size="small" sx={{ tableLayout: 'fixed', width: '100%' }}>
            {CATEGORY_TABLE_COLGROUP}
            <TableFooter sx={{ '& td': { borderBottom: 'none' } }}>
              <TableRow>
                <TableCell
                  sx={{
                    ...CATEGORY_MIX_COL_SX,
                    fontWeight: 700,
                    borderTop: 1,
                    borderColor: 'divider',
                  }}
                >
                  Total
                </TableCell>
                <TableCell
                  align="right"
                  sx={{
                    ...CATEGORY_MIX_COL_SX,
                    fontWeight: 700,
                    borderTop: 1,
                    borderColor: 'divider',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {tableTotals.totalUnits != null ? tableTotals.totalUnits.toLocaleString() : '—'}
                </TableCell>
                <TableCell
                  align="right"
                  sx={{
                    ...CATEGORY_MIX_COL_SX,
                    fontWeight: 700,
                    borderTop: 1,
                    borderColor: 'divider',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {tableTotals.sumProductNeed != null ? tableTotals.sumProductNeed.toFixed(1) : '—'}
                </TableCell>
                <TableCell
                  align="right"
                  sx={{ ...CATEGORY_MIX_COL_SX, fontWeight: 700, borderTop: 1, borderColor: 'divider' }}
                >
                  100.0%
                </TableCell>
                <TableCell
                  align="right"
                  sx={{
                    ...CATEGORY_MIX_COL_SX,
                    fontWeight: 700,
                    borderTop: 1,
                    borderColor: 'divider',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {formatCurrencyWhole(String(tableTotals.totalRetail))}
                </TableCell>
                <TableCell
                  align="right"
                  sx={{
                    ...CATEGORY_MIX_COL_SX,
                    fontWeight: 700,
                    borderTop: 1,
                    borderColor: 'divider',
                    color: 'text.disabled',
                  }}
                >
                  —
                </TableCell>
                <TableCell
                  align="right"
                  sx={{
                    ...CATEGORY_MIX_COL_SX,
                    fontWeight: 700,
                    borderTop: 1,
                    borderColor: 'divider',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {formatCurrencyWhole(String(tableTotals.totalEstRev))}
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        ) : null}
      </Box>
    </Card>
  );
}
