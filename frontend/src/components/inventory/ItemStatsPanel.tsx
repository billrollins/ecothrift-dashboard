import { Box, Grid, Skeleton, Typography } from '@mui/material';
import type { ItemStatsBlock } from '../../types/inventory.types';
import { useItemStats } from '../../hooks/useInventory';

function fmtPct(rate: string): string {
  const n = parseFloat(rate);
  if (Number.isNaN(n)) return '—';
  return `${(n * 100).toFixed(2)}%`;
}

const STAT_CARD_MIN_HEIGHT = 140;

function StatColumnContent({
  title,
  block,
}: {
  title: string;
  block: ItemStatsBlock;
}) {
  return (
    <Box
      sx={{
        p: 1.5,
        borderRadius: 1,
        bgcolor: 'action.hover',
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        minHeight: STAT_CARD_MIN_HEIGHT,
        width: '100%',
      }}
    >
      <Typography variant="subtitle2" fontWeight={600} gutterBottom noWrap title={block.label}>
        {title}: {block.label}
      </Typography>
      <Typography variant="caption" color="text.secondary">
        On shelf / Sold / Lost / Scrapped
      </Typography>
      <Typography variant="body2" sx={{ mb: 1 }}>
        {block.on_shelf} / {block.sold} / {block.lost} / {block.scrapped}{' '}
        <Typography component="span" variant="caption" color="text.secondary">
          (total {block.total})
        </Typography>
      </Typography>
      <Typography variant="caption" color="text.secondary">
        Avg retail / Avg sold
      </Typography>
      <Typography variant="body2" sx={{ mb: 1 }}>
        ${block.avg_retail} / ${block.avg_sold}
      </Typography>
      <Typography variant="caption" color="text.secondary">
        Loss rate
      </Typography>
      <Typography variant="body2">{fmtPct(block.loss_rate)}</Typography>
    </Box>
  );
}

function EmptyStatCard({ title, message }: { title: string; message: string }) {
  return (
    <Box
      sx={{
        p: 1.5,
        borderRadius: 1,
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        minHeight: STAT_CARD_MIN_HEIGHT,
        width: '100%',
        bgcolor: 'action.hover',
        border: 1,
        borderColor: 'divider',
        borderStyle: 'dashed',
        opacity: 0.72,
      }}
    >
      <Typography variant="subtitle2" fontWeight={600} gutterBottom color="text.secondary">
        {title}
      </Typography>
      <Typography variant="body2" color="text.secondary">
        {message}
      </Typography>
    </Box>
  );
}

export type ItemStatsPanelProps = {
  productId?: number | null;
  category?: string | null;
  enabled?: boolean;
};

/** Three-column inventory aggregates: Product | Category | Global (empty/muted when no context). */
export default function ItemStatsPanel({ productId, category, enabled = true }: ItemStatsPanelProps) {
  const { data, isLoading } = useItemStats({
    productId: productId ?? undefined,
    category: category ?? undefined,
    enabled,
  });

  const showProduct = productId != null && productId > 0;
  const showCategory = Boolean(category?.trim());

  return (
    <Box sx={{ mt: 2, pt: 2, px: 1, pb: 1, borderTop: 1, borderColor: 'divider' }}>
      <Typography
        variant="caption"
        fontWeight={600}
        letterSpacing={0.06}
        color="text.secondary"
        display="block"
        sx={{ mb: 1 }}
      >
        INVENTORY STATS
      </Typography>
      <Grid container spacing={2} alignItems="stretch">
        {isLoading ? (
          <>
            <Grid size={{ xs: 12, sm: 4 }} sx={{ display: 'flex' }}>
              <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, width: '100%' }}>
                <Typography variant="caption" color="text.secondary" display="block" gutterBottom>
                  Product
                </Typography>
                <Skeleton variant="rounded" sx={{ flex: 1, minHeight: STAT_CARD_MIN_HEIGHT }} />
              </Box>
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }} sx={{ display: 'flex' }}>
              <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, width: '100%' }}>
                <Typography variant="caption" color="text.secondary" display="block" gutterBottom>
                  Category
                </Typography>
                <Skeleton variant="rounded" sx={{ flex: 1, minHeight: STAT_CARD_MIN_HEIGHT }} />
              </Box>
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }} sx={{ display: 'flex' }}>
              <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, width: '100%' }}>
                <Typography variant="caption" color="text.secondary" display="block" gutterBottom>
                  All items
                </Typography>
                <Skeleton variant="rounded" sx={{ flex: 1, minHeight: STAT_CARD_MIN_HEIGHT }} />
              </Box>
            </Grid>
          </>
        ) : (
          <>
            <Grid size={{ xs: 12, sm: 4 }} sx={{ display: 'flex' }}>
              {showProduct && data?.product ? (
                <StatColumnContent title="Product" block={data.product} />
              ) : (
                <EmptyStatCard
                  title="Product"
                  message={showProduct ? 'No product stats available.' : 'No product linked to this item.'}
                />
              )}
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }} sx={{ display: 'flex' }}>
              {showCategory && data?.category ? (
                <StatColumnContent title="Category" block={data.category} />
              ) : (
                <EmptyStatCard
                  title="Category"
                  message={showCategory ? 'No category stats available.' : 'No category on this item.'}
                />
              )}
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }} sx={{ display: 'flex' }}>
              {data?.global ? (
                <StatColumnContent title="All items" block={data.global} />
              ) : (
                <EmptyStatCard title="All items" message="Stats unavailable." />
              )}
            </Grid>
          </>
        )}
      </Grid>
    </Box>
  );
}
