import { Box, Paper, Tooltip, Typography } from '@mui/material';
import type { ReactNode } from 'react';
import { useMemo } from 'react';
import type { ItemCheckInDTO, ProcessingWorkspaceItemDTO } from '../../../types/inventory.types';
import { inventoryWorkbenchItemsUrl } from '../../../utils/richInventorySearch';
import { checkInPrintedDisplay } from './checkedInPrintedAggregate';
import { processingTokens } from './processingTokens';

const borderSubtle = processingTokens.border;
const headerSurface = processingTokens.surfaceRaised;

export type CheckInProductSummary = {
  id?: number;
  product_number?: string | null;
  title?: string | null;
  brand?: string | null;
  model?: string | null;
};

function formatNumber(value: number): string {
  return value.toLocaleString();
}

function openWorkbenchItems(filters: Record<string, string | number>) {
  window.open(inventoryWorkbenchItemsUrl({ filters }), '_blank', 'noopener,noreferrer');
}

function ProductField({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography
        variant="caption"
        sx={{
          display: 'block',
          color: processingTokens.textMute,
          fontSize: '0.58rem',
          fontWeight: 800,
          letterSpacing: 0.6,
          textTransform: 'uppercase',
          lineHeight: 1.1,
        }}
      >
        {label}
      </Typography>
      <Typography
        noWrap
        sx={{
          mt: 0.2,
          fontSize: '0.8125rem',
          fontWeight: 700,
          lineHeight: 1.2,
          color: processingTokens.textStrong,
          fontFamily: mono ? processingTokens.monoFontFamily : undefined,
        }}
        title={value !== '-' ? value : undefined}
      >
        {value}
      </Typography>
    </Box>
  );
}

export function ProductSummaryCard({ product }: { product: CheckInProductSummary | null }) {
  const productNumber = product?.product_number?.trim() || (product?.id ? `#${product.id}` : '-');
  const title = product?.title?.trim() || '-';
  const brand = product?.brand?.trim() || '-';
  const model = product?.model?.trim() || '-';

  return (
    <Paper
      variant="outlined"
      sx={{
        p: 1,
        borderColor: borderSubtle,
        bgcolor: processingTokens.statsHeaderBg ?? headerSurface,
      }}
    >
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ display: 'block', fontWeight: 800, textTransform: 'uppercase', mb: 0.6, px: 0.15, fontSize: '0.58rem' }}
      >
        Product
      </Typography>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr 1fr', sm: 'minmax(88px, 0.7fr) minmax(0, 1.6fr) minmax(0, 0.9fr) minmax(0, 0.9fr)' },
          gap: { xs: 0.75, sm: 1.25 },
          alignItems: 'start',
        }}
      >
        <ProductField label="Product #" value={productNumber} mono />
        <ProductField label="Title" value={title} />
        <ProductField label="Brand" value={brand} />
        <ProductField label="Model" value={model} />
      </Box>
    </Paper>
  );
}

function StatCell({
  label,
  value,
  helper,
  tone = 'default',
  tooltip,
  onClick,
}: {
  label: string;
  value: string;
  helper?: string;
  tone?: 'default' | 'good' | 'warning' | 'muted';
  tooltip?: ReactNode;
  onClick?: () => void;
}) {
  const valueColor =
    tone === 'warning'
      ? processingTokens.accentAmber
      : tone === 'good'
        ? processingTokens.primaryDark
        : tone === 'muted'
          ? processingTokens.textMute
          : processingTokens.textStrong;

  const cell = (
    <Box
      sx={{
        minWidth: 0,
        px: 1,
        py: 0.75,
        border: 1,
        borderColor: borderSubtle,
        borderRadius: 1.25,
        bgcolor: headerSurface,
        cursor: onClick ? 'pointer' : 'default',
        transition: 'border-color 120ms ease, box-shadow 120ms ease, transform 120ms ease',
        '&:hover': onClick
          ? {
              borderColor: processingTokens.primary,
              boxShadow: '0 2px 8px rgba(15, 23, 42, 0.10)',
              transform: 'translateY(-1px)',
            }
          : undefined,
      }}
      onClick={onClick}
    >
      <Typography
        variant="caption"
        sx={{
          display: 'block',
          color: processingTokens.textMute,
          fontSize: '0.58rem',
          fontWeight: 800,
          letterSpacing: 0.6,
          textTransform: 'uppercase',
          lineHeight: 1.1,
        }}
      >
        {label}
      </Typography>
      <Typography
        noWrap
        sx={{
          mt: 0.25,
          fontSize: '0.875rem',
          fontWeight: 800,
          lineHeight: 1.2,
          color: valueColor,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
      </Typography>
      {helper ?
        <Typography
          variant="caption"
          noWrap
          sx={{ display: 'block', mt: 0.15, color: processingTokens.textMute, fontSize: '0.62rem', lineHeight: 1.1 }}
        >
          {helper}
        </Typography>
      : null}
    </Box>
  );

  if (!tooltip) return cell;
  return (
    <Tooltip title={tooltip} enterDelay={350} placement="bottom-start">
      {cell}
    </Tooltip>
  );
}

function checkInItemCounts(items: ProcessingWorkspaceItemDTO[]) {
  return {
    total: items.length,
    onShelf: items.filter((item) => item.status === 'on_shelf').length,
    sold: items.filter((item) => item.status === 'sold').length,
    printed: items.filter((item) => item.label_printed).length,
  };
}

export interface ProcessingCheckInEditStatsProps {
  checkIn: ItemCheckInDTO;
  product: CheckInProductSummary | null;
}

export function ProcessingCheckInEditStats({ checkIn, product }: ProcessingCheckInEditStatsProps) {
  const items = checkIn.items ?? [];
  const counts = useMemo(() => checkInItemCounts(items), [items]);
  const printedMeta = checkInPrintedDisplay(items, counts.total);

  const openCheckInItems = (extra?: { status?: string; printed?: boolean }) => {
    const filters: Record<string, string | number> = { checkin: checkIn.id };
    if (extra?.status) filters.status = extra.status;
    if (extra?.printed === true) filters.printed = 'true';
    if (extra?.printed === false) filters.printed = 'false';
    openWorkbenchItems(filters);
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
      <ProductSummaryCard product={product} />
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
          gap: 0.75,
        }}
      >
        <StatCell
          label="# Items"
          value={formatNumber(counts.total)}
          helper="This check-in"
          tone={counts.total ? 'default' : 'muted'}
          tooltip={`${counts.total} item(s) in check-in #${checkIn.id}`}
          onClick={() => openCheckInItems()}
        />
        <StatCell
          label="On Shelf"
          value={formatNumber(counts.onShelf)}
          helper="Click to view"
          tone={counts.onShelf ? 'good' : 'muted'}
          tooltip={`${counts.onShelf} on-shelf item(s) in this check-in`}
          onClick={() => openCheckInItems({ status: 'on_shelf' })}
        />
        <StatCell
          label="Sold"
          value={formatNumber(counts.sold)}
          helper="Click to view"
          tone={counts.sold ? 'default' : 'muted'}
          tooltip={`${counts.sold} sold item(s) in this check-in`}
          onClick={() => openCheckInItems({ status: 'sold' })}
        />
        <StatCell
          label="Printed"
          value={printedMeta.text}
          helper={printedMeta.allPrinted ? 'All printed' : 'Click unprinted'}
          tone={printedMeta.allPrinted ? 'good' : counts.printed ? 'warning' : 'muted'}
          tooltip={
            printedMeta.unprintedSkus.length > 0 ?
              `Unprinted: ${printedMeta.unprintedSkus.join(', ')}`
            : printedMeta.allPrinted ?
              'All labels printed'
            : 'No labels printed yet'}
          onClick={() => {
            if (printedMeta.unprintedSkus.length > 0) {
              openCheckInItems({ printed: false });
            } else {
              openCheckInItems({ printed: true });
            }
          }}
        />
      </Box>
    </Box>
  );
}
