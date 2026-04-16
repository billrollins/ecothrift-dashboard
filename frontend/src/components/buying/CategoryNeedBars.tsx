import { Box, Tooltip, Typography } from '@mui/material';
import { formatCurrency } from '../../utils/format';
import type { BuyingCategoryNeedRow } from '../../types/buying.types';

function pct(s: string | null | undefined): number {
  if (s == null || s === '') return 0;
  const n = Number.parseFloat(String(s));
  return Number.isFinite(n) ? n : 0;
}

function num(s: string | null | undefined): number | null {
  if (s == null || s === '') return null;
  const n = Number.parseFloat(String(s));
  return Number.isFinite(n) ? n : null;
}

type Props = {
  rows: BuyingCategoryNeedRow[];
  selectedCategory: string | null;
  onSelect: (category: string) => void;
};

export default function CategoryNeedBars({ rows, selectedCategory, onSelect }: Props) {
  const scale = rows[0] ? Math.max(pct(rows[0].bar_scale_max), 0.0001) : 20;

  return (
    <Box sx={{ flex: 1, minWidth: 0, overflow: 'auto' }}>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'minmax(120px,1fr) minmax(160px,2fr) 44px 44px 52px 40px 36px',
          gap: 0.5,
          alignItems: 'center',
          px: 0.5,
          py: 0.25,
          borderBottom: '1px solid',
          borderColor: 'divider',
        }}
      >
        {['Category', 'Distribution', 'Shelf', 'Sold', 'Avg $', 'Thru', 'N'].map((h) => (
          <Typography
            key={h}
            variant="caption"
            sx={{ fontSize: '0.55rem', textTransform: 'uppercase', letterSpacing: 0.04, fontWeight: 600 }}
          >
            {h}
          </Typography>
        ))}
      </Box>
      {rows.map((row) => {
        const shelfPct = pct(row.shelf_pct);
        const soldPct = pct(row.sold_pct);
        const shelfW = Math.min(100, (shelfPct / scale) * 100);
        const soldW = Math.min(100, (soldPct / scale) * 100);
        const ps = num(row.profit_sales_ratio);
        const profitLineW = ps != null ? Math.min(100, Math.max(0, ps * 100)) : 0;
        const selected = selectedCategory === row.category;
        const tip = [
          `Shelf: ${row.shelf_count} (${shelfPct.toFixed(1)}%)`,
          `Sold: ${row.sold_count} (${soldPct.toFixed(1)}%)`,
          `Avg sale ${formatCurrency(row.avg_sale)} · retail ${formatCurrency(row.avg_retail)} · cost ${formatCurrency(row.avg_cost)}`,
          `Profit/sales ${ps != null ? `${(ps * 100).toFixed(1)}%` : '—'}`,
          `Need 1–99 ${row.need_score_1to99}`,
          `Need gap ${num(row.need_gap)?.toFixed(1) ?? '—'}`,
        ].join('\n');

        return (
          <Tooltip key={row.category} title={<Box sx={{ whiteSpace: 'pre-line', fontSize: 12 }}>{tip}</Box>}>
            <Box
              onClick={() => onSelect(row.category)}
              sx={{
                display: 'grid',
                gridTemplateColumns: 'minmax(120px,1fr) minmax(160px,2fr) 44px 44px 52px 40px 36px',
                gap: 0.5,
                alignItems: 'center',
                py: 0.35,
                px: 0.5,
                cursor: 'pointer',
                bgcolor: selected ? 'success.light' : 'transparent',
                borderRadius: 0.5,
                '&:hover': { bgcolor: selected ? 'success.light' : 'action.hover' },
              }}
            >
              <Typography variant="body2" noWrap title={row.category}>
                {row.category}
              </Typography>
              <Box sx={{ minWidth: 0 }}>
                <Box sx={{ position: 'relative', height: 20, width: '100%' }}>
                  <Box
                    sx={{
                      position: 'absolute',
                      top: 2,
                      left: 0,
                      height: 12,
                      width: `${shelfW}%`,
                      bgcolor: '#90caf9',
                      borderRadius: 0.25,
                      zIndex: 1,
                    }}
                  />
                  <Box
                    sx={{
                      position: 'absolute',
                      top: 2,
                      left: 0,
                      height: 12,
                      width: `${soldW}%`,
                      bgcolor: 'rgba(239,154,154,0.7)',
                      borderRadius: 0.25,
                      zIndex: 2,
                    }}
                  />
                  <Box
                    sx={{
                      position: 'absolute',
                      bottom: 0,
                      left: 0,
                      height: 3,
                      width: `${profitLineW}%`,
                      borderRadius: 0.25,
                      background: (t) =>
                        `linear-gradient(90deg, ${t.palette.error.main}, ${t.palette.warning.main}, ${t.palette.success.main})`,
                    }}
                  />
                </Box>
              </Box>
              <Typography variant="caption" textAlign="right">
                {row.shelf_count}
              </Typography>
              <Typography variant="caption" textAlign="right" fontWeight={700}>
                {row.sold_count}
              </Typography>
              <Typography variant="caption" textAlign="right">
                {formatCurrency(row.avg_sale)}
              </Typography>
              <Typography variant="caption" textAlign="right">
                {`${pct(row.sell_through_pct).toFixed(0)}%`}
              </Typography>
              <Typography variant="caption" textAlign="right" fontWeight={700}>
                {row.need_score_1to99}
              </Typography>
            </Box>
          </Tooltip>
        );
      })}
    </Box>
  );
}
