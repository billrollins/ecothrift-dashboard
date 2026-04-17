import { Box, Tooltip, Typography } from '@mui/material';
import type { BuyingCategoryDistribution } from '../../types/buying.types';
import {
  NOT_YET_CATEGORIZED_BAR_BG,
  NOT_YET_CATEGORIZED_HATCH,
  colorForTaxonomyCategory,
} from '../../constants/taxonomyV1';

type Seg = {
  key: string;
  label: string;
  pct: number;
  fill: 'solid' | 'hatch';
  color: string;
};

function buildSegments(dist: BuyingCategoryDistribution): Seg[] {
  const segments: Seg[] = [];
  dist.top.forEach((t) => {
    segments.push({
      key: t.canonical_category,
      label: t.canonical_category,
      pct: t.pct,
      fill: 'solid',
      color: colorForTaxonomyCategory(t.canonical_category),
    });
  });
  if (dist.not_yet_categorized.pct > 0) {
    segments.push({
      key: '__not_yet__',
      label: 'Not yet categorized',
      pct: dist.not_yet_categorized.pct,
      fill: 'hatch',
      color: NOT_YET_CATEGORIZED_BAR_BG,
    });
  }
  return segments;
}

/** Maps bar segment keys to `category` query values for manifest row filtering. */
function manifestFilterValueFromDistributionSegmentKey(segmentKey: string): string {
  if (segmentKey === '__not_yet__') return '__uncategorized__';
  return segmentKey;
}

type CategoryDistributionBarProps = {
  dist: BuyingCategoryDistribution;
  /** When set, bar segments and legend rows apply this manifest filter (Fast category). */
  onCategoryClick?: (filterValue: string) => void;
};

/**
 * Full-width stacked bar: one segment per category (no "Other" rollup).
 */
export default function CategoryDistributionBar({ dist, onCategoryClick }: CategoryDistributionBarProps) {
  if (!dist || dist.total_rows === 0) return null;

  const segments = buildSegments(dist);

  return (
    <Box sx={{ mb: 2, width: '100%' }}>
      <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.75, fontWeight: 600 }}>
        Category Mix
      </Typography>
      <Box
        sx={{
          display: 'flex',
          height: 12,
          borderRadius: 1,
          overflow: 'hidden',
          border: 1,
          borderColor: 'divider',
        }}
      >
        {segments.map((s) => {
          const interactive = Boolean(onCategoryClick);
          const filterVal = manifestFilterValueFromDistributionSegmentKey(s.key);
          const tip = interactive
            ? `${s.label}: ${s.pct}% — click to filter manifest rows`
            : `${s.label}: ${s.pct}%`;
          return (
            <Tooltip key={s.key} title={tip} placement="top">
              <Box
                component={interactive ? 'button' : 'div'}
                type={interactive ? 'button' : undefined}
                onClick={interactive ? () => onCategoryClick?.(filterVal) : undefined}
                sx={{
                  flexGrow: s.pct,
                  flexShrink: 1,
                  flexBasis: 0,
                  minWidth: s.pct > 0 ? 2 : 0,
                  alignSelf: 'stretch',
                  minHeight: 12,
                  border: 'none',
                  p: 0,
                  display: 'block',
                  ...(interactive
                    ? {
                        cursor: 'pointer',
                        '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 1 },
                      }
                    : {}),
                  ...(s.fill === 'hatch'
                    ? {
                        backgroundImage: NOT_YET_CATEGORIZED_HATCH,
                        backgroundColor: NOT_YET_CATEGORIZED_BAR_BG,
                      }
                    : { bgcolor: s.color }),
                }}
              />
            </Tooltip>
          );
        })}
      </Box>
      <Box
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '4px 12px',
          mt: 1,
        }}
      >
        {segments.map((s) => {
          const interactive = Boolean(onCategoryClick);
          const filterVal = manifestFilterValueFromDistributionSegmentKey(s.key);
          return (
            <Box
              key={s.key}
              component={interactive ? 'button' : 'div'}
              type={interactive ? 'button' : undefined}
              onClick={interactive ? () => onCategoryClick?.(filterVal) : undefined}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 0.5,
                border: 'none',
                p: 0,
                m: 0,
                background: 'none',
                font: 'inherit',
                textAlign: 'left',
                ...(interactive
                  ? {
                      cursor: 'pointer',
                      borderRadius: 0.5,
                      '&:hover': { bgcolor: 'action.hover' },
                      '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 1 },
                    }
                  : {}),
              }}
            >
              <Box
                sx={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  flexShrink: 0,
                  bgcolor: s.fill === 'solid' ? s.color : NOT_YET_CATEGORIZED_BAR_BG,
                  ...(s.fill === 'hatch'
                    ? {
                        backgroundImage: NOT_YET_CATEGORIZED_HATCH,
                        backgroundColor: NOT_YET_CATEGORIZED_BAR_BG,
                        border: '1px solid',
                        borderColor: 'divider',
                      }
                    : {}),
                }}
              />
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.75rem', whiteSpace: 'nowrap' }}>
                {s.label}: {s.pct}%
              </Typography>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
