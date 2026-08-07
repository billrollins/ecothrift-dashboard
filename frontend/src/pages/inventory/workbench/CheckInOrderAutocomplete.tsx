import { useState, useEffect } from 'react';
import { Autocomplete, Box, TextField, Typography } from '@mui/material';
import type { ProductCheckInOrderOption } from '../../../api/inventory.api';
import { useDebouncedValue } from '../../../hooks/useDebouncedValue';
import { useProductCheckInOrders } from '../../../hooks/useInventory';
import { processingTokens } from '../processing/processingTokens';
import { checkInMetricLabelSx, checkInMetricShellSx } from './checkInMetricFieldSx';
import {
  workbenchPaneAutocompleteInputSx,
} from './workbenchSearchFieldSx';
import { WorkbenchSearchFieldShell } from './WorkbenchSearchFieldShell';

export function formatOrderOrderedDate(value: string | null | undefined): string {
  if (!value) return 'date unknown';
  const d = new Date(value.includes('T') ? value : `${value}T12:00:00`);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function orderOptionLabel(option: ProductCheckInOrderOption): string {
  const suffix = option.is_default ? ' (default)' : '';
  return `${option.order_number} · ${formatOrderOrderedDate(option.ordered_date)}${suffix}`;
}

export interface CheckInOrderAutocompleteProps {
  value: ProductCheckInOrderOption | null;
  onChange: (value: ProductCheckInOrderOption | null) => void;
  disabled?: boolean;
  compact?: boolean;
  fullWidth?: boolean;
  autoSelectDefault?: boolean;
  /** White pane shell - matches workbench product search (order tone). */
  paneShell?: boolean;
  /** Amber outline when required and no value selected. */
  highlightIfEmpty?: boolean;
}

export function CheckInOrderAutocomplete({
  value,
  onChange,
  disabled,
  compact = false,
  fullWidth = false,
  autoSelectDefault = false,
  paneShell = false,
  highlightIfEmpty = false,
}: CheckInOrderAutocompleteProps) {
  const [orderSearch, setOrderSearch] = useState('');
  const debouncedOrderSearch = useDebouncedValue(orderSearch, 300);
  const ordersQuery = useProductCheckInOrders(debouncedOrderSearch, !disabled);
  const orderOptions = ordersQuery.data ?? [];

  const mergedOptions = (() => {
    if (!value) return orderOptions;
    if (orderOptions.some((o) => o.id === value.id)) return orderOptions;
    return [value, ...orderOptions];
  })();

  useEffect(() => {
    if (!autoSelectDefault || value || !orderOptions.length) return;
    const defaultOrder = orderOptions.find((o) => o.is_default) ?? orderOptions[0];
    if (defaultOrder) onChange(defaultOrder);
  }, [autoSelectDefault, orderOptions, value, onChange]);

  const autocomplete = (
    <Autocomplete
      disabled={disabled}
      fullWidth={fullWidth || paneShell}
      sx={paneShell ? { m: 0, width: '100%' } : undefined}
      options={mergedOptions}
      value={value}
      onChange={(_, next) => onChange(next)}
      inputValue={orderSearch}
      onInputChange={(_, next, reason) => {
        if (reason === 'reset') return;
        setOrderSearch(next);
      }}
      getOptionLabel={orderOptionLabel}
      isOptionEqualToValue={(a, b) => a.id === b.id}
      loading={ordersQuery.isFetching}
      renderInput={(params) => (
        <TextField
          {...params}
          placeholder="Search orders…"
          variant={compact ? 'standard' : 'outlined'}
          size={compact ? undefined : 'small'}
          label={compact ? undefined : 'Order'}
          required={!compact}
          slotProps={compact ? { input: { ...params.InputProps, disableUnderline: true } } : undefined}
          sx={
            compact ?
              paneShell ?
                workbenchPaneAutocompleteInputSx
              : {
                m: 0,
                '& input': {
                  fontSize: '0.8125rem',
                  fontWeight: 700,
                  py: 0,
                  color: processingTokens.textStrong,
                },
                '& .MuiAutocomplete-inputRoot': {
                  py: 0,
                  pr: '28px !important',
                },
              }
            : {
                '& .MuiInputBase-root': { bgcolor: '#fff' },
                '& .MuiInputLabel-root': { fontSize: '0.75rem' },
              }
          }
        />
      )}
      renderOption={(props, option) => (
        <li {...props} key={option.id}>
          <Box sx={{ py: 0.15 }}>
            <Typography variant="body2" sx={{ fontWeight: 700, fontSize: '0.8125rem', lineHeight: 1.25 }}>
              {option.order_number}
              {option.is_default ? ' (default)' : ''}
            </Typography>
            <Typography variant="caption" sx={{ color: processingTokens.textMute, fontSize: '0.6875rem' }}>
              Ordered {formatOrderOrderedDate(option.ordered_date)}
              {option.description?.trim() ?
                ` · ${option.description.trim()}`
              : option.vendor_name ?
                ` · ${option.vendor_name}`
              : ''}
            </Typography>
          </Box>
        </li>
      )}
    />
  );

  if (!compact) return autocomplete;

  if (paneShell) {
    return (
      <WorkbenchSearchFieldShell tone="order" label="Order" required incomplete={highlightIfEmpty && !value}>
        {autocomplete}
      </WorkbenchSearchFieldShell>
    );
  }

  return (
    <Box sx={{ ...checkInMetricShellSx, minWidth: 0, width: fullWidth ? '100%' : undefined }}>
      <Typography variant="caption" sx={checkInMetricLabelSx}>
        Order *
      </Typography>
      {autocomplete}
    </Box>
  );
}
