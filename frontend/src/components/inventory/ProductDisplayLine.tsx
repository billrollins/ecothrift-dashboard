import { Box, Typography } from '@mui/material';
import { productDisplayParts, type ProductLike } from '../../utils/productCatalog';

interface ProductDisplayLineProps {
  product: ProductLike;
  /** Autocomplete dropdown uses slightly tighter typography. */
  variant?: 'option' | 'selected';
}

/**
 * Styled Product identity line for search results.
 * Pulls individual fields so callers can tune weight/color without a single toString.
 */
export function ProductDisplayLine({ product, variant = 'option' }: ProductDisplayLineProps) {
  const parts = productDisplayParts(product);
  const showBrand = !!parts.brand && parts.brand.toLowerCase() !== 'generic';
  const titleVariant = variant === 'selected' ? 'body2' : 'body2';

  return (
    <Box
      component="span"
      sx={{
        display: 'inline-flex',
        alignItems: 'baseline',
        gap: 0.5,
        minWidth: 0,
        maxWidth: '100%',
        overflow: 'hidden',
      }}
    >
      <Typography
        component="span"
        variant={titleVariant}
        sx={{ fontWeight: 700, flexShrink: 0, fontFamily: 'monospace', fontSize: '0.8rem' }}
      >
        {parts.productNumber}
      </Typography>
      {showBrand ?
        <Typography component="span" variant={titleVariant} color="text.secondary" sx={{ flexShrink: 0 }}>
          {parts.brand}
        </Typography>
      : null}
      <Typography
        component="span"
        variant={titleVariant}
        sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}
      >
        {parts.title}
      </Typography>
      {parts.primaryIdentifier ?
        <Typography
          component="span"
          variant="caption"
          color="text.secondary"
          sx={{ flexShrink: 0, fontFamily: 'monospace' }}
        >
          {parts.primaryIdentifier}
        </Typography>
      : null}
    </Box>
  );
}
