import { Autocomplete, TextField } from '@mui/material';
import { useEffect, useMemo, useState } from 'react';
import { useProductSearch } from '../../hooks/useProductSearch';
import type { Product } from '../../types/inventory.types';
import { PRODUCT_SEARCH_MIN_CHARS, productDisplayLabel } from '../../utils/productCatalog';
import { ProductDisplayLine } from './ProductDisplayLine';
import { WorkbenchSearchFieldShell } from '../../pages/inventory/workbench/WorkbenchSearchFieldShell';
import { workbenchPaneAutocompleteInputSx } from '../../pages/inventory/workbench/workbenchSearchFieldSx';

export interface ProductSearchAutocompleteProps {
  scope: string;
  enabled?: boolean;
  label?: string;
  placeholder?: string;
  /** Currently loaded product (form selection), if any. */
  value: Product | null;
  onSelect: (product: Product | null) => void;
  disabled?: boolean;
  pageSize?: number;
  /**
   * Load-into-form mode: field stays empty after pick; never pins a selected option
   * (otherwise Autocomplete hides server results while a product is loaded).
   */
  searchOnly?: boolean;
  /** Default helper when idle; pass empty string to hide. */
  helperText?: string;
  /** White pane shell - matches workbench order search (product tone). */
  paneShell?: boolean;
  /** Amber outline when required and no value selected. */
  highlightIfEmpty?: boolean;
}

/**
 * Universal quick Product search - same mechanism everywhere (debounced API search + compact results).
 */
export function ProductSearchAutocomplete({
  scope,
  enabled = true,
  label = 'Search products',
  placeholder = 'Type product #, title, brand, model, UPC…',
  value,
  onSelect,
  disabled = false,
  pageSize = 25,
  searchOnly = false,
  helperText = 'Quick search - pick a product to load into the form',
  paneShell = false,
  highlightIfEmpty = false,
}: ProductSearchAutocompleteProps) {
  const [inputValue, setInputValue] = useState('');
  const searchEnabled = enabled && inputValue.trim().length >= PRODUCT_SEARCH_MIN_CHARS;
  const { products, isFetching } = useProductSearch(scope, inputValue, searchEnabled, pageSize);

  const selectedLabel = useMemo(() => (value ? productDisplayLabel(value) : ''), [value]);
  const pinnedValue = searchOnly ? null : value;

  useEffect(() => {
    if (!enabled) setInputValue('');
  }, [enabled]);

  const autocomplete = (
    <Autocomplete
      size="small"
      fullWidth
      disabled={disabled}
      sx={{ m: 0, width: paneShell ? '100%' : undefined }}
      options={products}
      value={pinnedValue}
      loading={isFetching}
      inputValue={searchOnly ? inputValue : (inputValue || selectedLabel)}
      filterOptions={(options) => options}
      onInputChange={(_event, next, reason) => {
        if (reason === 'input') {
          setInputValue(next);
          if (!searchOnly && value) onSelect(null);
        }
        if (reason === 'clear') {
          setInputValue('');
          onSelect(null);
        }
      }}
      onChange={(_event, next) => {
        onSelect(next);
        setInputValue('');
      }}
      isOptionEqualToValue={(a, b) => a.id === b.id}
      getOptionLabel={productDisplayLabel}
      renderOption={(props, option) => (
        <li {...props} key={option.id}>
          <ProductDisplayLine product={option} variant="option" />
        </li>
      )}
      renderInput={(params) => (
        <TextField
          {...params}
          margin="none"
          label={paneShell ? undefined : label}
          placeholder={paneShell ? 'Search products…' : placeholder}
          variant={paneShell ? 'standard' : 'outlined'}
          slotProps={paneShell ? { input: { ...params.InputProps, disableUnderline: true } } : undefined}
          helperText={
            paneShell || !helperText ? undefined
            : inputValue.trim().length > 0 && inputValue.trim().length < PRODUCT_SEARCH_MIN_CHARS
              ? `Type at least ${PRODUCT_SEARCH_MIN_CHARS} characters`
              : helperText || undefined
          }
          FormHelperTextProps={{ sx: { mt: 0.25, mx: 0 } }}
          sx={paneShell ? workbenchPaneAutocompleteInputSx : undefined}
        />
      )}
      noOptionsText={
        inputValue.trim().length < PRODUCT_SEARCH_MIN_CHARS
          ? `Type ${PRODUCT_SEARCH_MIN_CHARS}+ characters`
          : 'No products found'
      }
    />
  );

  if (paneShell) {
    return (
      <WorkbenchSearchFieldShell tone="product" label={label || 'Product'} required incomplete={highlightIfEmpty && !value}>
        {autocomplete}
      </WorkbenchSearchFieldShell>
    );
  }

  return autocomplete;
}
