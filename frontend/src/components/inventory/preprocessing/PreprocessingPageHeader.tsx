import { Autocomplete, Box, Button, TextField, Typography } from '@mui/material';
import type { PreprocessingQueueOrder } from '../../../types/inventory.types';
import { preprocessingFonts } from './preprocessingTokens';

interface PreprocessingPageHeaderProps {
  orders: PreprocessingQueueOrder[];
  selectedOrderId: number;
  onSelectOrderId: (id: number) => void;
  totalUnits: number;
  estimatedRetailLabel: string;
  onBackToOrder: () => void;
}

export function PreprocessingPageHeader({
  orders,
  selectedOrderId,
  onSelectOrderId,
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
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap', minWidth: 0 }}>
        <Typography component="h1" sx={{ fontSize: 18, fontWeight: 700, color: '#1B4332', m: 0 }}>
          Preprocessing
        </Typography>
        <Autocomplete
          size="small"
          sx={{ minWidth: 280, maxWidth: '100%' }}
          options={orders}
          value={selected}
          onChange={(_e, v) => {
            if (v) onSelectOrderId(v.id);
          }}
          getOptionLabel={(o) => `${o.order_number} — ${o.vendor_name}`}
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
                  {option.preprocessing_row_count ? `${option.preprocessing_row_count} staged` : '—'}
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
                },
              }}
            />
          )}
        />
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
        <Typography sx={{ fontSize: 13, color: '#888' }}>
          {totalUnits} units · Est. {estimatedRetailLabel}
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
