import { Box, Stack, Typography } from '@mui/material';
import type { BuyingAuctionDetail } from '../../types/buying.types';

type Props = {
  detail: BuyingAuctionDetail;
};

/** Shown when both AI title mix and manifest mix exist. */
export default function AiManifestComparisonStrip({ detail }: Props) {
  const ai = detail.ai_category_estimates;
  const man = detail.manifest_category_distribution;
  if (!ai || !man || typeof ai !== 'object' || typeof man !== 'object') return null;
  if (Object.keys(ai).length === 0 || Object.keys(man).length === 0) return null;

  const keys = new Set([...Object.keys(ai), ...Object.keys(man)]);
  const rows = [...keys].filter((k) => (ai[k] ?? 0) > 0 || (man[k] ?? 0) > 0).slice(0, 8);

  if (rows.length === 0) return null;

  return (
    <Box sx={{ mb: 2, p: 1.25, bgcolor: 'action.hover', borderRadius: 1 }}>
      <Typography variant="caption" color="text.secondary" fontWeight={700} display="block" sx={{ mb: 1 }}>
        AI estimate vs manifest (category %)
      </Typography>
      <Stack spacing={0.5}>
        {rows.map((k) => (
          <Stack key={k} direction="row" justifyContent="space-between" alignItems="baseline" gap={1}>
            <Typography variant="body2" noWrap sx={{ flex: 1, minWidth: 0 }} title={k}>
              {k}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              AI {typeof ai[k] === 'number' ? `${Math.round(ai[k])}%` : '—'}
            </Typography>
            <Typography variant="caption" fontWeight={600}>
              Mf {typeof man[k] === 'number' ? `${Math.round(man[k])}%` : '—'}
            </Typography>
          </Stack>
        ))}
      </Stack>
    </Box>
  );
}
