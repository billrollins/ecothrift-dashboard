import {

  Box,

  Button,

  Card,

  Dialog,

  DialogContent,

  DialogTitle,

  Stack,

  Typography,

} from '@mui/material';

import { useState } from 'react';

import { Link as RouterLink } from 'react-router-dom';

import { productCatalogWorkbenchUrl } from '../../../utils/richInventorySearch';

import type { TarsItem } from './tarsTypes';

import { fmtUsd } from './tarsProfit';
import { tarsTimerHeaderSx } from './tarsTokens';

function HeaderChevron() {
  return (
    <Typography
      component="span"
      aria-hidden
      sx={{
        fontWeight: 900,
        fontSize: 20,
        lineHeight: 1,
        px: 0.55,
        color: 'inherit',
        opacity: 0.5,
        userSelect: 'none',
        flexShrink: 0,
      }}
    >
      {'>'}
    </Typography>
  );
}

const headerLinkSx = {
  color: 'inherit',
  fontWeight: 800,
  fontSize: 13,
  fontFamily: 'monospace',
  textDecoration: 'none',
  whiteSpace: 'nowrap',
  flexShrink: 0,
  '&:hover': { textDecoration: 'none', opacity: 0.82 },
} as const;

const headerTextSx = {
  fontWeight: 800,
  fontSize: 13,
  lineHeight: 1.25,
  color: 'inherit',
} as const;



interface TarsBenchItemCardProps {

  item: TarsItem;

  showActions?: boolean;

  isSelected?: boolean;

  timerItemStatus?: 'running' | 'paused' | 'mismatch' | null;

  onMoveBack?: () => void;

  onHold?: () => void;

  onDone?: () => void;

  onResume?: () => void;

  onCheckIn?: () => void;

  actionsBusy?: boolean;

}



export function TarsBenchItemCard({

  item,

  showActions = true,

  isSelected = false,

  timerItemStatus = null,

  onMoveBack,

  onHold,

  onDone,

  onResume,

  onCheckIn,

  actionsBusy,

}: TarsBenchItemCardProps) {

  const [detailsOpen, setDetailsOpen] = useState(false);

  const orderNumber = item.orderNumber ?? '—';
  const productNumber = item.productNumber ?? '—';
  const itemNumber = item.skuLabel ?? item.sku;
  const timerHeader = timerItemStatus ? tarsTimerHeaderSx(timerItemStatus) : null;



  const productFacts = [

    { label: 'Brand', value: item.brand ?? '—' },

    { label: 'Category', value: item.category ?? '—' },

    { label: 'Condition', value: item.condition?.replace(/_/g, ' ') ?? '—' },

    { label: 'Source', value: item.source },

    { label: 'Scale', value: item.scale },

    { label: 'UPC', value: item.upc ?? '—' },

    { label: 'Retail', value: item.retail != null ? fmtUsd(item.retail) : '—' },

    { label: 'Price', value: item.price != null ? fmtUsd(item.price) : '—' },

  ];



  const showBenchActions = showActions && (onMoveBack || onHold || onDone || onResume || onCheckIn);



  return (
    <>
      <Card
        variant="outlined"
        sx={{
          bgcolor: isSelected ? '#f8fafc' : '#fff',
          borderColor: isSelected ? 'primary.main' : '#e2e8f0',
          borderWidth: 1,
          flexShrink: 0,
          minWidth: 0,
          width: '100%',
        }}
      >
        <Box sx={{ px: 1, py: 0.65 }}>
          <Stack
            direction="row"
            alignItems="center"
            justifyContent="space-between"
            spacing={1}
            sx={{ width: '100%', mb: 0.35, minHeight: 34 }}
          >
            <Box
              role="button"
              tabIndex={0}
              onClick={() => setDetailsOpen(true)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') setDetailsOpen(true);
              }}
              sx={{
                flex: 1,
                minWidth: 0,
                px: 1,
                py: 0.6,
                borderRadius: 1,
                border: '1px solid',
                borderColor: timerHeader?.borderColor ?? '#e2e8f0',
                bgcolor: timerHeader?.bgcolor ?? '#f8fafc',
                color: timerHeader?.color ?? '#0f172a',
                boxShadow: timerHeader?.boxShadow ?? 'none',
                cursor: 'pointer',
              }}
            >
              <Stack
                direction="row"
                alignItems="baseline"
                sx={{ minWidth: 0, flexWrap: 'wrap', rowGap: 0.25 }}
              >
                {item.orderId ?
                  <Box
                    component={RouterLink}
                    to={`/inventory/orders/${item.orderId}`}
                    onClick={(e: React.MouseEvent) => e.stopPropagation()}
                    title={`Order ${orderNumber}`}
                    sx={headerLinkSx}
                  >
                    {orderNumber}
                  </Box>
                : <Typography component="span" sx={{ ...headerTextSx, fontFamily: 'monospace', flexShrink: 0 }}>
                    {orderNumber}
                  </Typography>
                }

                <HeaderChevron />

                {item.productId ?
                  <Box
                    component={RouterLink}
                    to={productCatalogWorkbenchUrl(item.productId, item.productNumber)}
                    onClick={(e: React.MouseEvent) => e.stopPropagation()}
                    title={`Product ${productNumber}`}
                    sx={headerLinkSx}
                  >
                    {productNumber}
                  </Box>
                : <Typography component="span" sx={{ ...headerTextSx, fontFamily: 'monospace', flexShrink: 0 }}>
                    {productNumber}
                  </Typography>
                }

                <HeaderChevron />

                <Typography
                  component="span"
                  title={item.name}
                  sx={{
                    ...headerTextSx,
                    minWidth: 0,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    flex: '1 1 8rem',
                  }}
                >
                  {item.name}
                </Typography>

                <HeaderChevron />

                <Typography
                  component="span"
                  title={itemNumber}
                  sx={{
                    ...headerTextSx,
                    fontFamily: 'monospace',
                    whiteSpace: 'nowrap',
                    flexShrink: 0,
                  }}
                >
                  {itemNumber}
                </Typography>
              </Stack>

              {timerItemStatus === 'mismatch' ?
                <Typography
                  variant="caption"
                  fontWeight={800}
                  sx={{ display: 'block', mt: 0.35, color: 'inherit', opacity: 0.95 }}
                >
                  This is not the item being timed right now.
                </Typography>
              : null}
            </Box>

            {showBenchActions ?
              <Stack
                direction="row"
                spacing={0.5}
                flexShrink={0}
                justifyContent="flex-end"
                alignItems="center"
                flexWrap="wrap"
                useFlexGap
                sx={{ ml: 'auto' }}
              >
                {onCheckIn ?
                  <Button
                    size="small"
                    variant="contained"
                    color="primary"
                    disabled={actionsBusy}
                    onClick={onCheckIn}
                    sx={{ minHeight: 26, py: 0.25, px: 0.9, fontSize: 11, fontWeight: 700 }}
                  >
                    CHECK IN TO BENCH
                  </Button>
                : null}
                {onMoveBack ?
                  <Button
                    size="small"
                    variant="outlined"
                    color="inherit"
                    disabled={actionsBusy}
                    onClick={onMoveBack}
                    sx={{ minHeight: 26, py: 0.25, px: 0.9, fontSize: 11, fontWeight: 700 }}
                  >
                    TO QUEUE
                  </Button>
                : null}
                {onHold ?
                  <Button
                    size="small"
                    variant="outlined"
                    color="warning"
                    disabled={actionsBusy}
                    onClick={onHold}
                    sx={{ minHeight: 26, py: 0.25, px: 0.9, fontSize: 11, fontWeight: 700 }}
                  >
                    HOLD
                  </Button>
                : null}
                {onDone ?
                  <Button
                    size="small"
                    variant="contained"
                    color="primary"
                    disabled={actionsBusy}
                    onClick={onDone}
                    sx={{ minHeight: 26, py: 0.25, px: 0.9, fontSize: 11, fontWeight: 700 }}
                  >
                    DISPOSITION
                  </Button>
                : null}
                {onResume ?
                  <Button
                    size="small"
                    variant="contained"
                    color="primary"
                    disabled={actionsBusy}
                    onClick={onResume}
                    sx={{ minHeight: 26, py: 0.25, px: 0.9, fontSize: 11, fontWeight: 700 }}
                  >
                    RESUME
                  </Button>
                : null}
              </Stack>
            : null}
          </Stack>

        </Box>
      </Card>



      <Dialog open={detailsOpen} onClose={() => setDetailsOpen(false)} maxWidth="sm" fullWidth>

        <DialogTitle sx={{ pb: 1 }}>{item.name}</DialogTitle>

        <DialogContent>

          <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>

            {productFacts.map(({ label, value }) => (

              <Box

                key={label}

                sx={{ px: 1, py: 0.65, borderRadius: 1, border: '1px solid #e2e8f0', minWidth: 120 }}

              >

                <Typography variant="caption" color="text.secondary" fontWeight={800} display="block">

                  {label}

                </Typography>

                <Typography variant="body2" fontWeight={700}>

                  {value}

                </Typography>

              </Box>

            ))}

          </Stack>

        </DialogContent>

      </Dialog>

    </>

  );

}


