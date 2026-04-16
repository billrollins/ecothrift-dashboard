import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Box, Stack, Tooltip, Typography, useTheme } from '@mui/material';
import ArrowDropDown from '@mui/icons-material/ArrowDropDown';
import ArrowDropUp from '@mui/icons-material/ArrowDropUp';
import { measureTextWidth } from '../../utils/measureTextWidth';
import type { BuyingCategoryNeedRow } from '../../types/buying.types';

function pct(s: string | null | undefined): number {
  if (s == null || s === '') return 0;
  const n = Number.parseFloat(String(s));
  return Number.isFinite(n) ? n : 0;
}

function num(s: string | null | undefined): number | null {
  if (s == null || s === '') return null;
  const n = Number.parseFloat(String(s));
  return Number.isFinite(n) ? n : 0;
}

type Props = {
  rows: BuyingCategoryNeedRow[];
  selectedCategory: string | null;
  onSelect: (category: string) => void;
};

type SortKey = 'cat' | 'dist' | 'shelf' | 'sold' | 'ndata' | 'margin' | 'recov' | 'need';
type SortDir = 'asc' | 'desc';

function sortValue(row: BuyingCategoryNeedRow, key: SortKey): number | string {
  switch (key) {
    case 'cat':
      return row.category.toLowerCase();
    case 'dist':
      return pct(row.shelf_pct);
    case 'shelf':
      return row.shelf_count ?? 0;
    case 'sold':
      return row.sold_count ?? 0;
    case 'ndata':
      return row.good_data_sample_size ?? 0;
    case 'margin':
      return num(row.profit_margin) ?? Number.NEGATIVE_INFINITY;
    case 'recov':
      return pct(row.recovery_pct);
    case 'need':
      return row.need_score_1to99 ?? 0;
  }
}

function defaultDir(key: SortKey): SortDir {
  return key === 'cat' ? 'asc' : 'desc';
}

const DIST_MIN_PX = 120;
const CAT_IDEAL_MAX_PX = 200;

function ceilPad(px: number, pad: number): number {
  return Math.ceil(px + pad);
}

type Layout = {
  gridTemplateColumns: string;
  showDistribution: boolean;
};

function computeLayout(
  rows: BuyingCategoryNeedRow[],
  containerWidth: number,
  themeFonts: { body2: string; caption: string; header: string },
  gridGapPx: number,
  containerPadX: number
): Layout {
  const { body2, caption, header } = themeFonts;

  if (rows.length === 0 || containerWidth <= 0) {
    return {
      gridTemplateColumns: '1fr minmax(120px, 1fr) auto auto auto auto auto auto auto',
      showDistribution: true,
    };
  }

  const hdrShelf = 'Shelf';
  const hdrSold = 'Sold';
  const hdrNdata = 'n';
  const hdrMargin = 'Margin';
  const hdrRecov = 'Recovery';
  const hdrNeed = 'Need';

  const sortArrowPx = 14;
  let shelfW = measureTextWidth(hdrShelf, header) + sortArrowPx;
  let soldW = measureTextWidth(hdrSold, header) + sortArrowPx;
  let ndataW = measureTextWidth(hdrNdata, header) + sortArrowPx;
  let marginW = measureTextWidth(hdrMargin, header) + sortArrowPx;
  let recovW = measureTextWidth(hdrRecov, header) + sortArrowPx;
  let needW = measureTextWidth(hdrNeed, header) + sortArrowPx;

  for (const row of rows) {
    shelfW = Math.max(shelfW, measureTextWidth(String(row.shelf_count), caption));
    soldW = Math.max(soldW, measureTextWidth(String(row.sold_count), caption));
    ndataW = Math.max(ndataW, measureTextWidth(String(row.good_data_sample_size), caption));
    {
      const pm = num(row.profit_margin);
      const marginLabel = pm == null ? '—' : `${(pm * 100).toFixed(0)}%`;
      marginW = Math.max(marginW, measureTextWidth(marginLabel, caption));
    }
    recovW = Math.max(recovW, measureTextWidth(`${pct(row.recovery_pct).toFixed(0)}%`, caption));
    needW = Math.max(needW, measureTextWidth(String(row.need_score_1to99), caption));
  }

  const colPad = 12;
  const shelfPx = ceilPad(shelfW, colPad);
  const soldPx = ceilPad(soldW, colPad);
  const ndataPx = ceilPad(ndataW, colPad);
  const marginPx = ceilPad(marginW, colPad);
  const recovPx = ceilPad(recovW, colPad);
  const needPx = ceilPad(needW, colPad);

  const fixedRest =
    shelfPx + soldPx + ndataPx + marginPx + recovPx + needPx;

  const longestCat = rows.reduce(
    (longest, r) => (r.category.length > longest.length ? r.category : longest),
    rows[0].category
  );
  const categoryIdealW = measureTextWidth(longestCat, body2);
  const categoryPad = 12;
  const rawCatIdeal = ceilPad(categoryIdealW, categoryPad);
  const categoryIdealPx = Math.min(rawCatIdeal, CAT_IDEAL_MAX_PX);
  const categoryMinPx = Math.max(Math.ceil(categoryIdealPx * 0.5), 1);

  const inner = Math.max(0, containerWidth - containerPadX);
  const gapCountWithDist = 8;
  const gapCountNoDist = 7;
  const gapsWhen8 = gapCountWithDist * gridGapPx;
  const gapsWhen7 = gapCountNoDist * gridGapPx;

  const availCatDist7 = inner - fixedRest - gapsWhen8;
  const availCatOnly6 = inner - fixedRest - gapsWhen7;

  let showDistribution = true;
  let catPx: number;
  let distPx: number;

  if (availCatDist7 >= categoryIdealPx + DIST_MIN_PX) {
    catPx = categoryIdealPx;
    distPx = availCatDist7 - categoryIdealPx;
  } else if (availCatDist7 >= categoryMinPx + DIST_MIN_PX) {
    catPx = Math.max(
      categoryMinPx,
      Math.min(categoryIdealPx, availCatDist7 - DIST_MIN_PX)
    );
    distPx = availCatDist7 - catPx;
  } else {
    showDistribution = false;
    catPx = Math.min(categoryIdealPx, availCatOnly6);
    catPx = Math.max(1, catPx);
    distPx = 0;
  }

  const cols: string[] = [`${catPx}px`];
  if (showDistribution) {
    cols.push(`${distPx}px`);
  }
  cols.push(
    `${shelfPx}px`,
    `${soldPx}px`,
    `${ndataPx}px`,
    `${marginPx}px`,
    `${recovPx}px`,
    `${needPx}px`
  );

  return {
    gridTemplateColumns: cols.join(' '),
    showDistribution,
  };
}

export default function CategoryNeedBars({ rows, selectedCategory, onSelect }: Props) {
  const theme = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir } | null>(null);

  const gridGapPx = 4;
  const containerPadX = 8;

  const themeFonts = useMemo(() => {
    const ff = theme.typography.fontFamily ?? 'sans-serif';
    const bw = theme.typography.body2.fontWeight ?? 400;
    const cw = theme.typography.caption.fontWeight ?? 400;
    const bs = theme.typography.body2.fontSize;
    const cs = theme.typography.caption.fontSize;
    return {
      body2: `${bw} ${bs} ${ff}`,
      caption: `${cw} ${cs} ${ff}`,
      header: `600 0.55rem ${ff}`,
    };
  }, [theme]);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const apply = () => setContainerWidth(el.getBoundingClientRect().width);
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const scale = rows[0] ? Math.max(pct(rows[0].bar_scale_max), 0.0001) : 20;

  const layout = useMemo(
    () =>
      computeLayout(rows, containerWidth, themeFonts as { body2: string; caption: string; header: string }, gridGapPx, containerPadX),
    [rows, containerWidth, themeFonts, gridGapPx, containerPadX]
  );

  const { gridTemplateColumns, showDistribution } = layout;

  const sortedRows = useMemo(() => {
    if (!sort) return rows;
    const { key, dir } = sort;
    const sign = dir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = sortValue(a, key);
      const bv = sortValue(b, key);
      if (typeof av === 'string' && typeof bv === 'string') {
        return av.localeCompare(bv) * sign;
      }
      const an = Number(av);
      const bn = Number(bv);
      if (an === bn) return 0;
      return an < bn ? -1 * sign : 1 * sign;
    });
  }, [rows, sort]);

  const handleHeaderClick = (key: SortKey) => {
    setSort((prev) => {
      if (prev && prev.key === key) {
        return { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' };
      }
      return { key, dir: defaultDir(key) };
    });
  };

  const headerLabels: { key: SortKey; label: string }[] = [
    { key: 'cat', label: 'Category' },
    ...(showDistribution ? [{ key: 'dist' as SortKey, label: 'Distribution' }] : []),
    { key: 'shelf', label: 'Shelf' },
    { key: 'sold', label: 'Sold' },
    { key: 'ndata', label: 'n' },
    { key: 'margin', label: 'Margin' },
    { key: 'recov', label: 'Recovery' },
    { key: 'need', label: 'Need' },
  ];

  return (
    <Box ref={containerRef} sx={{ flex: 1, minWidth: 0, overflow: 'hidden', width: '100%' }}>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns,
          gap: '4px',
          alignItems: 'center',
          px: 0.5,
          py: 0.25,
          borderBottom: '1px solid',
          borderColor: 'divider',
          position: 'sticky',
          top: 0,
          zIndex: 1,
          bgcolor: 'background.paper',
        }}
      >
        {headerLabels.map(({ key, label }) => {
          const active = sort?.key === key;
          const centerAlign =
            key === 'ndata' ||
            key === 'margin' ||
            key === 'recov' ||
            key === 'need' ||
            key === 'shelf' ||
            key === 'sold';
          return (
            <Stack
              key={key}
              direction="row"
              spacing={0}
              alignItems="center"
              onClick={() => handleHeaderClick(key)}
              sx={{
                cursor: 'pointer',
                userSelect: 'none',
                justifyContent: centerAlign ? 'center' : 'flex-start',
                minWidth: 0,
                color: active ? 'text.primary' : 'text.secondary',
                '&:hover': { color: 'text.primary' },
              }}
            >
              <Typography
                variant="caption"
                noWrap
                title={
                  key === 'ndata'
                    ? 'Good-data row count (all-time sold: sale, retail, cost each in $0.01–$9,999)'
                    : undefined
                }
                sx={{
                  fontSize: '0.55rem',
                  textTransform: 'uppercase',
                  letterSpacing: 0.04,
                  fontWeight: 600,
                }}
              >
                {label}
              </Typography>
              <Box
                sx={{
                  width: 12,
                  height: 12,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  visibility: active ? 'visible' : 'hidden',
                }}
              >
                {active && sort?.dir === 'asc' ? (
                  <ArrowDropUp sx={{ fontSize: 14 }} />
                ) : (
                  <ArrowDropDown sx={{ fontSize: 14 }} />
                )}
              </Box>
            </Stack>
          );
        })}
      </Box>
      {sortedRows.map((row) => {
        const shelfPct = pct(row.shelf_pct);
        const soldPct = pct(row.sold_pct);
        const shelfW = Math.min(100, (shelfPct / scale) * 100);
        const soldW = Math.min(100, (soldPct / scale) * 100);
        const selected = selectedCategory === row.category;

        return (
          <Box
            key={row.category}
            onClick={() => onSelect(row.category)}
            sx={{
              display: 'grid',
              gridTemplateColumns,
              gap: '4px',
              alignItems: 'center',
              py: 0.35,
              px: 0.5,
              cursor: 'pointer',
              bgcolor: selected ? 'success.light' : 'transparent',
              borderRadius: 0.5,
              '&:hover': { bgcolor: selected ? 'success.light' : 'action.hover' },
            }}
          >
            <Typography variant="body2" noWrap sx={{ minWidth: 0, pr: 0.75 }}>
              {row.category}
            </Typography>
            {showDistribution ? (
              <Box sx={{ minWidth: 0, width: '100%', justifySelf: 'stretch' }}>
                <Tooltip
                  placement="top"
                  enterDelay={250}
                  title={
                    <Stack spacing={0.35} sx={{ py: 0.15 }}>
                      <Typography variant="caption" display="block" sx={{ fontWeight: 600 }}>
                        Shelf (blue): {pct(row.shelf_pct).toFixed(1)}%
                      </Typography>
                      <Typography variant="caption" display="block" sx={{ fontWeight: 600 }}>
                        Sold (red): {pct(row.sold_pct).toFixed(1)}%
                      </Typography>
                      <Typography variant="caption" display="block" color="text.secondary">
                        Bar widths use max {scale.toFixed(1)}% across categories
                      </Typography>
                    </Stack>
                  }
                  slotProps={{
                    tooltip: {
                      sx: {
                        maxWidth: 280,
                        bgcolor: 'background.paper',
                        color: 'text.primary',
                        border: 1,
                        borderColor: 'divider',
                        boxShadow: 2,
                        p: 1,
                      },
                    },
                  }}
                >
                  <Box sx={{ position: 'relative', height: 16, width: '100%' }}>
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
                  </Box>
                </Tooltip>
              </Box>
            ) : null}
            <Typography variant="caption" textAlign="center">
              {row.shelf_count}
            </Typography>
            <Typography variant="caption" textAlign="center" fontWeight={700}>
              {row.sold_count}
            </Typography>
            <Typography variant="caption" textAlign="center">
              {row.good_data_sample_size.toLocaleString()}
            </Typography>
            <Typography variant="caption" textAlign="center">
              {(() => {
                const pm = num(row.profit_margin);
                return pm == null ? '—' : `${(pm * 100).toFixed(0)}%`;
              })()}
            </Typography>
            <Typography variant="caption" textAlign="center">
              {`${pct(row.recovery_pct).toFixed(0)}%`}
            </Typography>
            <Typography variant="caption" textAlign="center" fontWeight={700}>
              {row.need_score_1to99}
            </Typography>
          </Box>
        );
      })}
    </Box>
  );
}
