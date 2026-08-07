import { Autocomplete, Box, Button, TextField, Typography } from '@mui/material';
import type { PreprocessingQueueOrder } from '../../../types/inventory.types';
import { preprocessingFonts } from './preprocessingTokens';

interface PreprocessingPageHeaderProps {
  orders: PreprocessingQueueOrder[];
  selectedOrderId: number;
  onSelectOrderId: (id: number) => void;
  vendorName?: string;
  orderTitle?: string;
  totalUnits: number;
  estimatedRetailLabel: string;
  onBackToOrder: () => void;
}

/** Processing-header-style fact: tiny uppercase label over an ellipsized value.
    Hover shows the full value; with href the value is a link (e.g. to the order). */
function HeaderFact({ label, value, maxWidth, href }: { label: string; value: string; maxWidth: number; href?: string }) {
  if (!value) return null;
  return (
    <Box sx={{ minWidth: 0, maxWidth }}>
      <Typography sx={{ fontSize: 10, fontWeight: 700, color: '#999', textTransform: 'uppercase', letterSpacing: 0.05, lineHeight: 1.2 }}>
        {label}
      </Typography>
      <Typography
        component={href ? 'a' : 'p'}
        href={href}
        title={value}
        sx={{
          display: 'block',
          fontSize: 13,
          color: href ? '#2D6A4F' : '#333',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          lineHeight: 1.3,
          textDecoration: 'none',
          '&:hover': href ? { textDecoration: 'underline' } : undefined,
        }}
      >
        {value}
      </Typography>
    </Box>
  );
}

export function PreprocessingPageHeader({
  orders,
  selectedOrderId,
  onSelectOrderId,
  vendorName = '',
  orderTitle = '',
  totalUnits,
  estimatedRetailLabel,
  onBackToOrder,
}: PreprocessingPageHeaderProps) {
  const selected = orders.find((o) => o.id === selectedOrderId) ?? null;

  return (
    <Box
      sx={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 2,
        flexWrap: 'wrap',
        py: '14px',
        px: '24px',
        bgcolor: '#fff',
        borderBottom: '1px solid #DDD5C9',
        mb: 0,
        fontFamily: preprocessingFonts.sans,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap', minWidth: 0, flex: 1 }}>
        <Typography component="h1" sx={{ fontSize: 18, fontWeight: 700, color: '#1B4332', m: 0 }}>
          Preprocessing
        </Typography>
        <Autocomplete
          size="small"
          sx={{ width: 250, flexShrink: 0 }}
          options={orders}
          value={selected}
          onChange={(_e, v) => {
            if (v) onSelectOrderId(v.id);
          }}
          getOptionLabel={(o) => o.order_number}
          isOptionEqualToValue={(a, b) => a.id === b.id}
          renderOption={(props, option) => {
            const { key, ...rest } = props as { key?: string };
            const active = option.id === selectedOrderId;
            return (
              <Box
                component="li"
                key={key ?? option.id}
                {...rest}
                sx={{
                  py: 1,
                  px: 1.75,
                  borderBottom: '1px solid #f0ece4',
                  ...(active ? { bgcolor: '#F0F7F4', borderLeft: '3px solid #2D6A4F', pl: 1.5 } : {}),
                }}
              >
                <Typography sx={{ fontWeight: 700, fontSize: 13 }}>{option.order_number}</Typography>
                <Typography sx={{ fontSize: 12, color: '#666' }}>{option.vendor_name}</Typography>
                <Typography sx={{ fontSize: 11, color: '#888' }}>
                  {option.preprocessing_row_count ? `${option.preprocessing_row_count} staged` : '-'}
                </Typography>
              </Box>
            );
          }}
          renderInput={(params) => (
            <TextField
              {...params}
              placeholder="Select order…"
              sx={{
                '& .MuiOutlinedInput-root': {
                  borderRadius: '6px',
                  bgcolor: '#fff',
                  fontSize: 14,
                  fontWeight: 600,
                },
              }}
            />
          )}
        />
        <HeaderFact label="Vendor" value={vendorName} maxWidth={160} />
        <HeaderFact
          label="Load description"
          value={orderTitle}
          maxWidth={520}
          href={selectedOrderId ? `/inventory/orders/${selectedOrderId}` : undefined}
        />
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
        <Typography sx={{ fontSize: 13, color: '#888' }}>
          {Number(totalUnits ?? 0).toLocaleString()} units · Est. {estimatedRetailLabel}
        </Typography>
        <Button
          variant="outlined"
          size="small"
          onClick={onBackToOrder}
          sx={{
            borderColor: '#DDD5C9',
            color: '#2D6A4F',
            borderRadius: '6px',
            fontSize: 12,
            fontWeight: 600,
            textTransform: 'none',
            py: '6px',
            px: '14px',
          }}
        >
          Back to Order
        </Button>
      </Box>
    </Box>
  );
}
