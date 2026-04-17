import { Box, Tooltip, Typography } from '@mui/material';
import type { BuyingAuctionListItem } from '../../types/buying.types';
import {
  firstWordCategory,
  getCategoryMixHeading,
  getRetailWeightedCategoryEntries,
} from '../../utils/buyingCategoryList';

type AuctionCategoryListBlockProps = {
  row: BuyingAuctionListItem;
  /** Slightly smaller on mobile cards. */
  dense?: boolean;
};

/**
 * Single line: first word of the top retail-weighted category + its share % (manifest mix, else AI).
 */
export default function AuctionCategoryListBlock({ row, dense }: AuctionCategoryListBlockProps) {
  const entries = getRetailWeightedCategoryEntries(row);
  const fontSize = dense ? '0.68rem' : '0.75rem';

  if (entries.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary" noWrap sx={{ fontSize }}>
        —
      </Typography>
    );
  }

  const top = entries[0];
  const label = firstWordCategory(top.name);
  const pct = Math.round(top.pct);
  const displayText = `${label} ${pct}%`;
  const heading = getCategoryMixHeading(row);

  const tooltipContent = (
    <Box sx={{ py: 0.25, maxWidth: 380 }}>
      <Typography
        component="div"
        variant="subtitle2"
        fontWeight={700}
        sx={{ mb: 0.75, lineHeight: 1.3 }}
      >
        {heading}
      </Typography>
      {entries.map((e, i) => (
        <Typography
          key={`${e.name}-${i}`}
          component="div"
          variant="caption"
          sx={{ display: 'block', lineHeight: 1.55, fontVariantNumeric: 'tabular-nums' }}
        >
          {`(${Math.round(e.pct)}%) ${e.name}`}
        </Typography>
      ))}
    </Box>
  );

  const text = (
    <Typography
      variant="body2"
      component="span"
      noWrap
      sx={{
        fontSize,
        fontWeight: 600,
        display: 'block',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        lineHeight: 1.43,
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      {displayText}
    </Typography>
  );

  return (
    <Tooltip
      title={tooltipContent}
      placement="top"
      enterDelay={350}
      slotProps={{
        tooltip: {
          sx: { maxWidth: 400 },
        },
      }}
    >
      <Box component="span" sx={{ display: 'block', minWidth: 0, width: '100%' }}>
        {text}
      </Box>
    </Tooltip>
  );
}
