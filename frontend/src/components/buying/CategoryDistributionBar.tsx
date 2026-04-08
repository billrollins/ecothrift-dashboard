import { Box, Stack, Tooltip, Typography, useTheme } from '@mui/material';
import type { BuyingCategoryDistribution } from '../../types/buying.types';

/**
 * Full-width stacked bar: one segment per category (no "Other" rollup).
 */
export default function CategoryDistributionBar({ dist }: { dist: BuyingCategoryDistribution }) {
  const theme = useTheme();
  if (!dist || dist.total_rows === 0) return null;

  const barColors = [
    theme.palette.primary.main,
    theme.palette.secondary.main,
    theme.palette.success.main,
    theme.palette.warning.main,
    theme.palette.info.main,
  ];

  type Seg = { label: string; pct: number; color: string };
  const segments: Seg[] = [];
  dist.top.forEach((t, i) => {
    segments.push({
      label: t.canonical_category,
      pct: t.pct,
      color: barColors[i % barColors.length],
    });
  });
  if (dist.not_yet_categorized.pct > 0) {
    segments.push({
      label: 'Not yet categorized',
      pct: dist.not_yet_categorized.pct,
      color: theme.palette.action.disabledBackground,
    });
  }

  return (
    <Box sx={{ mb: 2 }}>
      <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.75 }}>
        Category mix (manifest lines)
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
        {segments.map((s, i) => (
          <Tooltip key={i} title={`${s.label}: ${s.pct}%`} placement="top">
            <Box
              sx={{
                flexGrow: s.pct,
                flexShrink: 1,
                flexBasis: 0,
                minWidth: s.pct > 0 ? 2 : 0,
                bgcolor: s.color,
              }}
            />
          </Tooltip>
        ))}
      </Box>
      <Stack direction="row" flexWrap="wrap" gap={1.5} sx={{ mt: 1 }} useFlexGap>
        {dist.top.map((t) => (
          <Typography key={t.canonical_category} variant="caption" color="text.secondary">
            {t.canonical_category}: {t.pct}%
          </Typography>
        ))}
        {dist.not_yet_categorized.count > 0 ? (
          <Typography variant="caption" color="text.secondary" sx={{ opacity: 0.85 }}>
            Not yet categorized: {dist.not_yet_categorized.pct}%
          </Typography>
        ) : null}
      </Stack>
    </Box>
  );
}
