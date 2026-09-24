import { Box, Chip, Paper, Stack, Tooltip, Typography } from '@mui/material';
import type { ManifestAnalysis } from '../../types/buying.types';
import { formatCurrencyWhole } from '../../utils/format';
import { HAZARD_LONG, HAZARD_SHORT, hazardTone, sortHazards } from './manifestHazards';

const METHOD_LABEL: Record<string, string> = { upc: 'UPC', title: 'same title', near: 'similar title' };
/** Past this share of the value in 10 lines, the truck rides on a few items: check them first. */
const CONCENTRATED_PCT = 60;

/** Share of the value in the 10 best lines (stored, or worked out from them on older analyses). */
export function topLinesPct(analysis: ManifestAnalysis): number | null {
  if (analysis.lines <= 10) return null;
  if (analysis.top_lines_value_pct != null) return analysis.top_lines_value_pct;
  const revenue = parseFloat(analysis.revenue);
  if (!(revenue > 0) || !analysis.top_lines?.length) return null;
  const top = analysis.top_lines.reduce((sum, line) => sum + (parseFloat(line.value) || 0), 0);
  return Math.round((top / revenue) * 1000) / 10;
}

/**
 * Buying Phase 4 on the auction page: what the truck really holds. Truck value v2 (line by
 * line, from our own sales where a line matched a product) next to the category-only value,
 * how much matched, how much rides on the 10 best lines, the hazards (click one to filter
 * the rows below), and bulk items.
 */
export default function ManifestAnalysisCard({
  analysis,
  hazard,
  onHazard,
}: {
  analysis: ManifestAnalysis;
  hazard: string;
  onHazard: (code: string) => void;
}) {
  const methods = Object.entries(analysis.match_methods || {})
    .filter(([, n]) => n > 0)
    .map(([m, n]) => `${n} by ${METHOD_LABEL[m] ?? m}`)
    .join(', ');
  const hazards = sortHazards(Object.keys(analysis.hazards || {}));
  const delta = parseFloat(analysis.revenue) - parseFloat(analysis.revenue_by_category);
  const topPct = topLinesPct(analysis);

  return (
    <Paper variant="outlined" sx={{ p: 1.5, mb: 2 }}>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={{ xs: 1.25, md: 3 }} alignItems={{ md: 'flex-start' }}>
        <Box sx={{ minWidth: 200 }}>
          <Typography variant="overline" sx={{ fontWeight: 800, letterSpacing: '0.1em', display: 'block', lineHeight: 1.4 }}>
            Truck value
          </Typography>
          <Typography variant="h5" sx={{ fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
            {formatCurrencyWhole(analysis.revenue)}
          </Typography>
          {analysis.retail_mismatch ? (
            <Typography variant="body2" color="warning.dark" sx={{ fontWeight: 700 }}>
              Manifest retail {formatCurrencyWhole(analysis.retail_mismatch.manifest_retail)} is far over the listing&apos;s{' '}
              {formatCurrencyWhole(analysis.retail_mismatch.listing_retail)}: scaled back to the listing.
            </Typography>
          ) : null}
          <Typography variant="body2" color="text.secondary">
            By category only: {formatCurrencyWhole(analysis.revenue_by_category)}
            {Math.abs(delta) >= 1 ? ` (${delta > 0 ? '+' : '−'}${formatCurrencyWhole(String(Math.abs(delta)))})` : ''}
          </Typography>
        </Box>

        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="body2">
            <b>{analysis.matched_lines}</b> of {analysis.lines} lines matched a product we know
            {methods ? ` (${methods})` : ''}: <b>{analysis.matched_retail_pct}%</b> of retail.
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Priced from our own sales for {analysis.product_basis_retail_pct}% of retail; the rest uses the category rate.
          </Typography>
          <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap">
            {topPct != null ? (
              <Tooltip
                title={
                  topPct >= CONCENTRATED_PCT
                    ? 'Most of the value is in a few lines: check those before you bid.'
                    : 'The value is spread across the truck.'
                }
              >
                <Chip
                  size="small"
                  color={topPct >= CONCENTRATED_PCT ? 'warning' : 'default'}
                  variant="outlined"
                  label={`Top 10 lines: ${Math.round(topPct)}% of value`}
                />
              </Tooltip>
            ) : null}
            {hazards.length === 0 ? (
              <Chip size="small" label="No hazards found" color="success" variant="outlined" />
            ) : null}
            {hazards.map((code) => {
              const h = analysis.hazards[code];
              return (
                <Tooltip key={code} describeChild title={`${HAZARD_LONG[code] ?? code} · ${h.retail_pct}% of retail`}>
                  <Chip
                    size="small"
                    color={hazardTone(code)}
                    variant={hazard === code ? 'filled' : 'outlined'}
                    label={`${HAZARD_SHORT[code] ?? code} · ${h.lines}`}
                    onClick={() => onHazard(hazard === code ? '' : code)}
                  />
                </Tooltip>
              );
            })}
          </Stack>
        </Box>

        {analysis.high_volume?.length ? (
          <Box sx={{ minWidth: 240, maxWidth: 360 }}>
            <Typography variant="overline" sx={{ fontWeight: 800, letterSpacing: '0.1em', display: 'block', lineHeight: 1.4 }}>
              Bulk items
            </Typography>
            {analysis.high_volume.slice(0, 4).map((item) => (
              <Typography key={item.product_id} variant="body2" noWrap title={item.title}>
                <b>{item.units}×</b> {item.title}
                <Typography component="span" variant="caption" color="text.secondary">
                  {' '}· sold {item.sold}
                  {item.avg_days != null ? ` · ${item.avg_days} d` : ''}
                  {item.on_hand ? ` · ${item.on_hand} on hand` : ''}
                </Typography>
              </Typography>
            ))}
          </Box>
        ) : null}
      </Stack>
    </Paper>
  );
}
