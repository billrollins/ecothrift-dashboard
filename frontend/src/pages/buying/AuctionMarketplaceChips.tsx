import { Box, Button, Chip, Tooltip } from '@mui/material';
import { useMemo, type MouseEvent } from 'react';
import type { BuyingMarketplace } from '../../types/buying.types';
import { multiSelectChipTooltip } from '../../utils/multiSelectChipTooltip';

export type AuctionMarketplaceChipsProps = {
  marketplaces: BuyingMarketplace[];
  /** Counts from global summary (static; do not change per toggle). */
  countBySlug: Record<string, number>;
  activeSlugs: Set<string> | null;
  onToggle: (slug: string, event: MouseEvent) => void;
  onResetAll: () => void;
};

/**
 * Marketplace filters: “All” first, then vendors. Plain / Ctrl+⌘ behavior matches AuctionListPage.
 */
export default function AuctionMarketplaceChips({
  marketplaces,
  countBySlug,
  activeSlugs,
  onToggle,
  onResetAll,
}: AuctionMarketplaceChipsProps) {
  const tooltipTitle = useMemo(() => multiSelectChipTooltip(), []);
  const sorted = [...marketplaces].sort((a, b) => a.name.localeCompare(b.name));
  if (!sorted.length) return null;

  const allActive =
    activeSlugs != null &&
    activeSlugs.size === sorted.length &&
    sorted.every((m) => activeSlugs.has(m.slug));

  return (
    <Box
      sx={{
        display: 'inline-flex',
        flexWrap: 'wrap',
        gap: 0.5,
        alignItems: 'center',
        rowGap: 0.5,
        maxWidth: '100%',
      }}
    >
      <Tooltip title={tooltipTitle} enterDelay={400} placement="top">
        <Button
          size="small"
          variant="text"
          onClick={onResetAll}
          sx={{ minWidth: 0, px: 0.75, height: 26, fontSize: '0.75rem' }}
          disabled={allActive}
        >
          All
        </Button>
      </Tooltip>
      {sorted.map((m) => {
        const on = activeSlugs?.has(m.slug) ?? false;
        const count = countBySlug[m.slug] ?? 0;
        return (
          <Tooltip key={m.id} title={tooltipTitle} enterDelay={400} placement="top">
            <Chip
              size="small"
              label={`${m.name}: ${count}`}
              color={on ? 'primary' : 'default'}
              variant={on ? 'filled' : 'outlined'}
              onClick={(e) => onToggle(m.slug, e)}
              sx={{
                opacity: on ? 1 : 0.65,
                height: { xs: 24, sm: 26 },
                fontSize: { xs: '0.7rem', sm: '0.75rem' },
              }}
            />
          </Tooltip>
        );
      })}
    </Box>
  );
}
