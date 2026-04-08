import { Box, Button, Chip, Tooltip, Typography } from '@mui/material';
import InfoOutlined from '@mui/icons-material/InfoOutlined';
import type { BuyingMarketplace } from '../../types/buying.types';

export type AuctionMarketplaceChipsProps = {
  marketplaces: BuyingMarketplace[];
  /** Counts from global summary (static; do not change per toggle). */
  countBySlug: Record<string, number>;
  activeSlugs: Set<string> | null;
  onToggle: (slug: string, event: React.MouseEvent) => void;
  onResetAll: () => void;
};

/**
 * Marketplace filters: normal click from “all” selects one vendor; one selected + same click → all;
 * one selected + other click → only other; Ctrl/⌘+click toggles membership for multi-select.
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

  const allActive =
    activeSlugs != null &&
    activeSlugs.size === sorted.length &&
    sorted.every((m) => activeSlugs.has(m.slug));

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
      <Tooltip title="Click to filter one vendor. From all vendors, one click isolates that marketplace. Click again (when only one is selected) clears back to all. Hold Ctrl (Windows) or ⌘ (Mac) while clicking to select or deselect multiple.">
        <InfoOutlined sx={{ fontSize: 16, color: 'text.secondary', cursor: 'help', mr: 0.25 }} />
      </Tooltip>
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
            onClick={(e) => onToggle(m.slug, e)}
            sx={{ opacity: on ? 1 : 0.65 }}
          />
        );
      })}
      <Button size="small" variant="text" onClick={onResetAll} sx={{ ml: 0.5 }} disabled={allActive}>
        All
      </Button>
      <Typography variant="caption" color="text.secondary" sx={{ width: '100%', mt: 0.25 }}>
        Tip: Ctrl+click (⌘+click on Mac) to combine marketplaces.
      </Typography>
    </Box>
  );
}
