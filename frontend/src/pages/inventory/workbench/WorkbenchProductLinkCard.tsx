import { Box, Button, Chip, Typography } from '@mui/material';
import SwapHorizOutlinedIcon from '@mui/icons-material/SwapHorizOutlined';
import { productDisplayParts, type ProductLike } from '../../../utils/productCatalog';
import { processingTokens } from '../processing/processingTokens';
import { workbenchDetailTokens } from './WorkbenchDetailShell';

export interface WorkbenchProductLinkCardProps {
  product: ProductLike & { model?: string | null; category_name?: string | null };
  /** @deprecated Layout is unified; kept for call-site compatibility. */
  compact?: boolean;
  /** Product ID badge - filter search on the current tab. */
  onProductIdClick?: () => void;
  /** Title / category area - open Products tab and filter to this product. */
  onOpenProduct?: () => void;
  onSwitchProduct?: () => void;
}

const productLabelSx = {
  flexShrink: 0,
  fontWeight: 800,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  color: processingTokens.textMute,
  fontSize: '0.625rem',
  lineHeight: 1.2,
} as const;

export function WorkbenchProductLinkCard({
  product,
  compact = false,
  onProductIdClick,
  onOpenProduct,
  onSwitchProduct,
}: WorkbenchProductLinkCardProps) {
  const parts = productDisplayParts(product);
  const title = (parts.title || 'Untitled product').trim();
  const category = (product.category_name || '').trim();

  return (
    <Box
      sx={{
        px: 1.25,
        py: 1,
        mb: compact ? 0.75 : 1,
        border: 1,
        borderColor: workbenchDetailTokens.borderSubtle,
        borderRadius: 1.5,
        bgcolor: workbenchDetailTokens.headerSurface,
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 1,
          minWidth: 0,
        }}
      >
        <Box
          role={onOpenProduct ? 'button' : undefined}
          tabIndex={onOpenProduct ? 0 : undefined}
          onClick={onOpenProduct}
          onKeyDown={
            onOpenProduct ?
              (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onOpenProduct();
                }
              }
            : undefined
          }
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.65,
            minWidth: 0,
            flex: 1,
            cursor: onOpenProduct ? 'pointer' : 'default',
            borderRadius: 1,
            ...(onOpenProduct ? {
              mx: -0.35,
              px: 0.35,
              py: 0.15,
              '&:hover': { bgcolor: '#f0f5f0' },
              '&:focus-visible': { outline: `2px solid ${processingTokens.primary}`, outlineOffset: 2 },
            } : {}),
          }}
        >
          <Typography component="span" variant="caption" sx={productLabelSx}>
            Product
          </Typography>
          <Typography
            component="span"
            noWrap
            sx={{
              fontWeight: 800,
              fontSize: '0.875rem',
              lineHeight: 1.2,
              color: processingTokens.textStrong,
              minWidth: 0,
            }}
          >
            {title}
          </Typography>
          {category ?
            <>
              <Typography
                component="span"
                sx={{ flexShrink: 0, color: processingTokens.textMute, fontSize: '0.75rem', lineHeight: 1 }}
              >
                ·
              </Typography>
              <Typography
                component="span"
                noWrap
                sx={{
                  fontSize: '0.75rem',
                  lineHeight: 1.2,
                  color: processingTokens.textMute,
                  minWidth: 0,
                }}
              >
                {category}
              </Typography>
            </>
          : null}
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexShrink: 0 }}>
          <Chip
            size="small"
            label={parts.productNumber}
            clickable={Boolean(onProductIdClick)}
            onClick={
              onProductIdClick ?
                (e) => {
                  e.stopPropagation();
                  onProductIdClick();
                }
              : undefined
            }
            sx={{
              height: 20,
              fontFamily: processingTokens.monoFontFamily,
              fontWeight: 800,
              fontSize: '0.68rem',
              bgcolor: '#fff',
              borderColor: workbenchDetailTokens.borderSubtle,
              ...(onProductIdClick ? { cursor: 'pointer', '&:hover': { bgcolor: '#f0f5f0' } } : {}),
            }}
            variant="outlined"
          />
          {onSwitchProduct ?
            <Button
              size="small"
              variant="text"
              onClick={(e) => {
                e.stopPropagation();
                onSwitchProduct();
              }}
              startIcon={<SwapHorizOutlinedIcon sx={{ fontSize: '0.75rem !important' }} />}
              sx={{
                minWidth: 0,
                px: 0.25,
                py: 0,
                fontSize: '0.625rem',
                fontWeight: 700,
                lineHeight: 1.2,
                textTransform: 'none',
                whiteSpace: 'nowrap',
                color: processingTokens.textMute,
                '&:hover': { bgcolor: 'transparent', color: processingTokens.primary },
                '& .MuiButton-startIcon': { mr: 0.25, ml: 0 },
              }}
            >
              Switch product
            </Button>
          : null}
        </Box>
      </Box>
    </Box>
  );
}
