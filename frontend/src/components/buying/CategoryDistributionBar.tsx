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

/**
 * Full-width stacked bar: one segment per category (no "Other" rollup).
 */
export default function CategoryDistributionBar({ dist }: { dist: BuyingCategoryDistribution }) {
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
        {segments.map((s) => (
          <Tooltip key={s.key} title={`${s.label}: ${s.pct}%`} placement="top">
            <Box
              sx={{
                flexGrow: s.pct,
                flexShrink: 1,
                flexBasis: 0,
                minWidth: s.pct > 0 ? 2 : 0,
                ...(s.fill === 'hatch'
                  ? {
                      backgroundImage: NOT_YET_CATEGORIZED_HATCH,
                      backgroundColor: NOT_YET_CATEGORIZED_BAR_BG,
                    }
                  : { bgcolor: s.color }),
              }}
            />
          </Tooltip>
        ))}
      </Box>
      <Box
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '4px 12px',
          mt: 1,
        }}
      >
        {segments.map((s) => (
          <Box
            key={s.key}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 0.5,
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
        ))}
      </Box>
    </Box>
  );
}
