import { Box, Button, Chip, Typography } from '@mui/material';
import type { BuyingMarketplace } from '../../types/buying.types';

export type AuctionMarketplaceChipsProps = {
  marketplaces: BuyingMarketplace[];
  /** Counts from global summary (static; do not change per toggle). */
  countBySlug: Record<string, number>;
  activeSlugs: Set<string> | null;
  onToggle: (slug: string) => void;
  onResetAll: () => void;
};

/**
 * Toggle filters for marketplace. Tapping the last active chip resets all to on.
 */
export default function AuctionMarketplaceChips({
  marketplaces,
  countBySlug,
  activeSlugs,
  onToggle,
  onResetAll,
}: AuctionMarketplaceChipsProps) {
  const sorted = [...marketplaces].sort((a, b) => a.name.localeCompare(b.name));
  if (!sorted.length) return null;

  return (
    <Box
      sx={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 0.75,
        mb: 1.5,
        alignItems: 'center',
        flexShrink: 0,
      }}
    >
      <Typography variant="caption" color="text.secondary" sx={{ mr: 0.5 }}>
        Marketplaces
      </Typography>
      {sorted.map((m) => {
        const on = activeSlugs?.has(m.slug) ?? false;
        const count = countBySlug[m.slug] ?? 0;
        return (
          <Chip
            key={m.id}
            size="small"
            label={`${m.name}: ${count}`}
            color={on ? 'primary' : 'default'}
            variant={on ? 'filled' : 'outlined'}
            onClick={() => onToggle(m.slug)}
            sx={{ opacity: on ? 1 : 0.65 }}
          />
        );
      })}
      <Button size="small" variant="text" onClick={onResetAll} sx={{ ml: 0.5 }}>
        All
      </Button>
    </Box>
  );
}
