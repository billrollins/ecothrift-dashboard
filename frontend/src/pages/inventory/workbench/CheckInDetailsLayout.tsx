import type { WheelEvent } from 'react';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { Add, Remove } from '@mui/icons-material';
import {
  Box,
  Button,
  IconButton,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import type { ItemCondition, ItemStatus } from '../../../types/inventory.types';
import { formatConditionLabel } from '../../../constants/inventory.constants';
import {
  PROCESSING_ITEM_CONDITION_OPTIONS,
  PROCESSING_ITEM_DISPATCH_OPTIONS,
} from '../processing/processingItemFormOptions';
import { MAX_CHECK_IN_QUANTITY } from '../processing/largeCheckIn';
import { processingTokens } from '../processing/processingTokens';
import {
  formatMoneyDisplay,
  formatMoneyInput,
  normalizeMoneyInput,
  preventWheelChangeNumber,
  sanitizeDecimalPaste,
  selectInputContentsOnFocus,
} from '../../../utils/formInputs';
import { workbenchDetailTokens } from './WorkbenchDetailShell';
import { workbenchRequiredIncompleteBorder } from './workbenchSearchFieldSx';
import { ItemSpecificationsEditor } from './ItemSpecificationsEditor';
import { checkInMetricLabelSx, checkInMetricShellSx } from './checkInMetricFieldSx';
import {
  CheckInOrderAutocomplete,
  type CheckInOrderAutocompleteProps,
} from './CheckInOrderAutocomplete';

function parseCheckInQuantity(raw: string): number {
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(MAX_CHECK_IN_QUANTITY, n);
}

export { parseCheckInQuantity as parseCheckInQty };

const metricShellSx = checkInMetricShellSx;

const fieldLabelSx = checkInMetricLabelSx;

export function SegmentedOptionButtons({
  label,
  value,
  options,
  onChange,
  disabled,
  readOnly,
  helperText,
  dense,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string; hint?: string }>;
  onChange?: (value: string) => void;
  disabled?: boolean;
  readOnly?: boolean;
  helperText?: string;
  dense?: boolean;
}) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography
        variant="caption"
        sx={{
          display: 'block',
          fontWeight: 800,
          letterSpacing: '0.05em',
          textTransform: 'uppercase',
          fontSize: '0.58rem',
          color: processingTokens.textMute,
          mb: 0.35,
          lineHeight: 1,
        }}
      >
        {label}
      </Typography>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: dense ? 0.35 : 0.5 }}>
        {options.map((option) => {
          const active = option.value === value;
          return (
            <Button
              key={option.value}
              size="small"
              disabled={disabled || readOnly}
              onClick={() => onChange?.(option.value)}
              disableElevation
              variant={active ? 'contained' : 'outlined'}
              color={active ? 'primary' : 'inherit'}
              sx={{
                px: dense ? 0.65 : 0.85,
                py: dense ? 0.15 : 0.25,
                minWidth: 0,
                minHeight: dense ? 24 : 28,
                textTransform: 'none',
                fontWeight: active ? 800 : 600,
                fontSize: dense ? '0.68rem' : '0.72rem',
                lineHeight: 1.2,
                borderColor: active ? undefined : workbenchDetailTokens.borderSubtle,
                color: active ? undefined : processingTokens.textSoft,
                bgcolor: active ? undefined : '#fff',
                ...(readOnly && !active ? { opacity: 0.5 } : {}),
              }}
            >
              {option.label}
            </Button>
          );
        })}
      </Box>
      {helperText ?
        <Typography variant="caption" sx={{ display: 'block', mt: 0.25, color: processingTokens.textMute, fontSize: '0.65rem', lineHeight: 1.2 }}>
          {helperText}
        </Typography>
      : null}
    </Box>
  );
}

function formatQuantityInput(raw: string): string {
  const cleaned = raw.replace(/[^0-9]/g, '');
  return cleaned.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function CompactQuantityStepper({
  quantity,
  disabled,
  onChange,
  onBlur,
  onBump,
}: {
  quantity: string;
  disabled?: boolean;
  onChange: (value: string) => void;
  onBlur?: () => void;
  onBump: (delta: number) => void;
}) {
  const qtyValue = quantity.trim() === '' ? 0 : parseCheckInQuantity(quantity);

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'stretch',
        width: '100%',
        minWidth: 0,
        borderRadius: 1.25,
        border: '1.5px solid',
        borderColor: processingTokens.primarySoftStrong,
        overflow: 'hidden',
        bgcolor: '#fff',
      }}
    >
      <IconButton
        size="small"
        aria-label="Decrease quantity"
        disabled={disabled || qtyValue <= 1}
        onClick={() => onBump(-1)}
        sx={{ width: 28, flexShrink: 0, borderRadius: 0, borderRight: 1, borderColor: processingTokens.primarySoftStrong, p: 0.25 }}
      >
        <Remove sx={{ fontSize: 15 }} />
      </IconButton>
      <TextField
        fullWidth
        value={formatQuantityInput(quantity)}
        aria-label="Quantity"
        disabled={disabled}
        onChange={(event) => onChange(event.target.value.replace(/[^0-9]/g, '').slice(0, 5))}
        onBlur={onBlur}
        onFocus={selectInputContentsOnFocus}
        onWheel={(event: WheelEvent<HTMLInputElement>) => preventWheelChangeNumber(event)}
        variant="standard"
        slotProps={{ input: { disableUnderline: true } }}
        sx={{
          flex: 1,
          minWidth: 0,
          m: 0,
          '& input': {
            textAlign: 'center',
            fontSize: '1.05rem',
            fontWeight: 900,
            py: 0,
            px: 0.25,
            fontVariantNumeric: 'tabular-nums',
            color: processingTokens.textStrong,
          },
        }}
      />
      <IconButton
        size="small"
        aria-label="Increase quantity"
        disabled={disabled || qtyValue >= MAX_CHECK_IN_QUANTITY}
        onClick={() => onBump(1)}
        sx={{ width: 28, flexShrink: 0, borderRadius: 0, borderLeft: 1, borderColor: processingTokens.primarySoftStrong, p: 0.25 }}
      >
        <Add sx={{ fontSize: 15 }} />
      </IconButton>
    </Box>
  );
}

export function CompactReadOnlyMetricField({
  label,
  value,
  mono,
  onClick,
}: {
  label: string;
  value: string;
  mono?: boolean;
  onClick?: () => void;
}) {
  return (
    <Box
      onClick={onClick}
      sx={{
        ...metricShellSx,
        minWidth: 0,
        ...(onClick ? { cursor: 'pointer', '&:hover': { filter: 'brightness(0.98)' } } : {}),
      }}
    >
      <Typography variant="caption" sx={fieldLabelSx}>
        {label}
      </Typography>
      <Typography
        noWrap
        sx={{
          fontSize: '0.8125rem',
          fontWeight: 700,
          color: processingTokens.textStrong,
          fontFamily: mono ? processingTokens.monoFontFamily : undefined,
        }}
      >
        {value || '—'}
      </Typography>
    </Box>
  );
}

export function CompactMetricSelectField({
  label,
  value,
  onChange,
  options,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  disabled?: boolean;
}) {
  return (
    <Box sx={{ ...metricShellSx, minWidth: 0 }}>
      <Typography variant="caption" sx={fieldLabelSx}>
        {label}
      </Typography>
      <TextField
        select
        fullWidth
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        variant="standard"
        slotProps={{ input: { disableUnderline: true } }}
        sx={{
          m: 0,
          '& .MuiSelect-select': {
            fontSize: '1.05rem',
            fontWeight: 900,
            py: 0,
            px: 0,
            color: processingTokens.textStrong,
          },
        }}
      >
        {options.map((option) => (
          <MenuItem key={option.value} value={option.value}>
            {option.label}
          </MenuItem>
        ))}
      </TextField>
    </Box>
  );
}

export function CompactMetricTextField({
  label,
  value,
  onChange,
  disabled,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  return (
    <Box sx={{ ...metricShellSx, minWidth: 0 }}>
      <Typography variant="caption" sx={fieldLabelSx}>
        {label}
      </Typography>
      <TextField
        fullWidth
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        placeholder={placeholder}
        variant="standard"
        slotProps={{ input: { disableUnderline: true } }}
        sx={{
          m: 0,
          '& input': {
            fontSize: '1.05rem',
            fontWeight: 900,
            py: 0,
            px: 0,
            color: processingTokens.textStrong,
          },
          '& input::placeholder': {
            color: processingTokens.textMute,
            opacity: 0.75,
          },
        }}
      />
    </Box>
  );
}

export function CompactMoneyField({
  label,
  value,
  onChange,
  required,
  error,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  error?: boolean;
  disabled?: boolean;
}) {
  const displayValue = formatMoneyInput(value);

  return (
    <Box sx={{ ...metricShellSx, minWidth: 0 }}>
      <Typography variant="caption" sx={fieldLabelSx}>
        {label}{required ? ' *' : ''}
      </Typography>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.35, minWidth: 0 }}>
        <Typography
          component="span"
          sx={{
            fontSize: '1.05rem',
            fontWeight: 900,
            lineHeight: 1,
            color: processingTokens.textStrong,
            flexShrink: 0,
          }}
        >
          $
        </Typography>
        <TextField
          fullWidth
          value={displayValue}
          disabled={disabled}
          onChange={(e) => onChange(sanitizeDecimalPaste(e.target.value))}
          onBlur={() => {
            if (!value.trim()) return;
            const normalized = normalizeMoneyInput(value);
            if (normalized !== value.trim()) onChange(normalized);
          }}
          onFocus={selectInputContentsOnFocus}
          onWheel={(event) => event.preventDefault()}
          onPaste={(e) => {
            e.preventDefault();
            onChange(sanitizeDecimalPaste(e.clipboardData.getData('text')));
          }}
          error={error}
          placeholder="0.00"
          inputProps={{ inputMode: 'decimal' }}
          variant="standard"
          slotProps={{ input: { disableUnderline: true } }}
          sx={{
            minWidth: 0,
            '& input': {
              fontSize: '1.05rem',
              fontWeight: 900,
              fontVariantNumeric: 'tabular-nums',
              color: processingTokens.textStrong,
              py: 0,
              px: 0,
            },
            '& input::placeholder': {
              color: processingTokens.textMute,
              opacity: 0.75,
            },
          }}
        />
      </Box>
    </Box>
  );
}

export function CheckInQtyStepper({
  quantity,
  disabled,
  onChange,
  onBlur,
  onBump,
  qtyDelta = 0,
}: {
  quantity: string;
  disabled?: boolean;
  onChange: (value: string) => void;
  onBlur?: () => void;
  onBump: (delta: number) => void;
  qtyDelta?: number;
}) {
  return (
    <>
      <CompactQuantityStepper
        quantity={quantity}
        disabled={disabled}
        onChange={onChange}
        onBlur={onBlur}
        onBump={onBump}
      />
      {qtyDelta !== 0 ?
        <Typography variant="caption" sx={{ display: 'block', mt: 0.35, fontWeight: 700, fontSize: '0.62rem', color: qtyDelta > 0 ? processingTokens.accentGreen : processingTokens.accentRed }}>
          {qtyDelta > 0 ? `+${qtyDelta} on save` : `${qtyDelta} on save`}
        </Typography>
      : null}
    </>
  );
}

export interface CheckInFlatFieldsEditorProps {
  price: string;
  onPriceChange: (value: string) => void;
  retail: string;
  onRetailChange: (value: string) => void;
  condition: ItemCondition;
  onConditionChange: (value: ItemCondition) => void;
  dispatch: string;
  onDispatchChange: (value: string) => void;
  disabled?: boolean;
}

const compactFieldSx = workbenchDetailTokens.compactField;

export function isValidCheckInPrice(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  const n = Number(trimmed);
  return Number.isFinite(n) && n >= 0;
}

const requiredFieldOutlineSx = {
  '& .MuiOutlinedInput-notchedOutline': {
    borderColor: workbenchRequiredIncompleteBorder,
    borderWidth: 2,
  },
  '& .MuiInputLabel-root': {
    color: workbenchRequiredIncompleteBorder,
    fontWeight: 700,
  },
};

const checkInMoneyFieldsRowSx = {
  gridColumn: '1 / -1',
  display: 'grid',
  gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
  gap: 1.5,
  p: 1.25,
  borderRadius: 1.5,
  border: '1.5px solid',
  borderColor: `${processingTokens.primary}44`,
  bgcolor: processingTokens.primarySoft,
  boxShadow: '0 1px 3px rgba(15, 23, 42, 0.06)',
};

const checkInMoneyFieldSx = {
  ...compactFieldSx,
  '& .MuiInputBase-root': {
    fontSize: '1.125rem',
    fontWeight: 800,
    bgcolor: '#fff',
    fontVariantNumeric: 'tabular-nums',
    fontFamily: processingTokens.monoFontFamily,
  },
  '& .MuiOutlinedInput-notchedOutline': {
    borderColor: `${processingTokens.primary}66`,
    borderWidth: 1.5,
  },
  '& .MuiInputLabel-root': {
    fontSize: '0.8125rem',
    fontWeight: 800,
    color: processingTokens.primaryDark,
    letterSpacing: '0.03em',
  },
  '& .MuiInputBase-root:hover .MuiOutlinedInput-notchedOutline': {
    borderColor: processingTokens.primary,
  },
  '& .MuiInputBase-root.Mui-focused .MuiOutlinedInput-notchedOutline': {
    borderColor: processingTokens.primary,
    borderWidth: 2,
  },
};

const checkInMoneyAdornmentSx = {
  mr: 0.5,
  color: processingTokens.primaryDark,
  fontWeight: 900,
  fontSize: '1.125rem',
  lineHeight: 1,
  fontFamily: processingTokens.monoFontFamily,
  flexShrink: 0,
};

const checkInMoneyInputSx = {
  fontSize: '1.125rem',
  fontWeight: 800,
  fontVariantNumeric: 'tabular-nums',
  fontFamily: processingTokens.monoFontFamily,
  letterSpacing: '0.02em',
};

function CheckInMoneyField({
  label,
  value,
  onChange,
  disabled,
  required,
  highlightMissing,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  required?: boolean;
  highlightMissing?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const displayValue =
    focused ?
      (value.trim() ? formatMoneyInput(value) : '')
    : formatMoneyDisplay(value);

  return (
    <TextField
      fullWidth
      size="small"
      label={label}
      required={required}
      value={displayValue}
      placeholder="0.00"
      disabled={disabled}
      onFocus={(event) => {
        setFocused(true);
        selectInputContentsOnFocus(event);
      }}
      onBlur={() => {
        setFocused(false);
        onChange(normalizeMoneyInput(value));
      }}
      onChange={(event) => onChange(sanitizeDecimalPaste(event.target.value))}
      onPaste={(event) => {
        event.preventDefault();
        onChange(sanitizeDecimalPaste(event.clipboardData.getData('text')));
      }}
      inputProps={{ inputMode: 'decimal' }}
      sx={{
        ...checkInMoneyFieldSx,
        ...(highlightMissing ? requiredFieldOutlineSx : {}),
        '& .MuiInputBase-input': checkInMoneyInputSx,
        '& .MuiInputBase-input::placeholder': {
          color: processingTokens.textMute,
          opacity: 0.85,
          fontWeight: 700,
        },
      }}
      slotProps={{
        input: {
          startAdornment: (
            <Typography component="span" sx={checkInMoneyAdornmentSx}>
              $
            </Typography>
          ),
        },
      }}
    />
  );
}

/** Fixed-height row above the bordered form — left/right slots with spacer between. */
export function CheckInFormActionRow({ left, right }: { left?: ReactNode; right?: ReactNode }) {
  return (
    <Stack
      direction="row"
      spacing={0.75}
      alignItems="center"
      sx={{ mb: 1.25, minHeight: 30.75 }}
    >
      {left}
      <Box sx={{ flex: 1, minWidth: 8 }} />
      {right}
    </Stack>
  );
}

export function CheckInFinalizeHint() {
  return (
    <Typography
      variant="body2"
      sx={{
        color: processingTokens.textMute,
        fontSize: '0.8125rem',
        fontWeight: 600,
        lineHeight: 1.35,
        letterSpacing: '0.01em',
        flexShrink: 0,
      }}
    >
      Fill in below to finalize check-in
    </Typography>
  );
}

/** Flat row fields (used outside the product-style section). */
export function CheckInFlatFieldsEditor({
  price,
  onPriceChange,
  retail,
  onRetailChange,
  condition,
  onConditionChange,
  dispatch,
  onDispatchChange,
  disabled,
}: CheckInFlatFieldsEditorProps) {
  const salvageLocked = condition === 'salvage';

  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '1fr 1fr', lg: '1fr 1fr 1fr 1fr' },
        gap: 1,
        alignItems: 'start',
      }}
    >
      <TextField
        select
        fullWidth
        size="small"
        label="Status"
        value={salvageLocked ? 'salvage' : dispatch}
        onChange={(event) => onDispatchChange(event.target.value)}
        disabled={disabled || salvageLocked}
        sx={compactFieldSx}
      >
        {PROCESSING_ITEM_DISPATCH_OPTIONS.map((option) => (
          <MenuItem key={option.value} value={option.value}>
            {option.label}
          </MenuItem>
        ))}
      </TextField>
      <TextField
        select
        fullWidth
        size="small"
        label="Condition"
        value={condition}
        onChange={(event) => {
          const next = event.target.value as ItemCondition;
          onConditionChange(next);
          if (next === 'salvage') onDispatchChange('salvage');
        }}
        disabled={disabled}
        sx={compactFieldSx}
      >
        {PROCESSING_ITEM_CONDITION_OPTIONS.map((option) => (
          <MenuItem key={option.value} value={option.value}>
            {formatConditionLabel(option.value)}
          </MenuItem>
        ))}
      </TextField>
      <TextField
        fullWidth
        size="small"
        label="Retail"
        value={formatMoneyInput(retail)}
        onChange={(event) => onRetailChange(sanitizeDecimalPaste(event.target.value))}
        onBlur={() => onRetailChange(normalizeMoneyInput(retail))}
        onFocus={selectInputContentsOnFocus}
        onPaste={(event) => {
          event.preventDefault();
          onRetailChange(sanitizeDecimalPaste(event.clipboardData.getData('text')));
        }}
        disabled={disabled}
        sx={compactFieldSx}
        slotProps={{
          input: {
            startAdornment: (
              <Typography component="span" sx={{ mr: 0.35, color: processingTokens.textMute, fontWeight: 700 }}>
                $
              </Typography>
            ),
          },
        }}
      />
      <TextField
        fullWidth
        size="small"
        label="Price"
        value={formatMoneyInput(price)}
        onChange={(event) => onPriceChange(sanitizeDecimalPaste(event.target.value))}
        onBlur={() => onPriceChange(normalizeMoneyInput(price))}
        onFocus={selectInputContentsOnFocus}
        onPaste={(event) => {
          event.preventDefault();
          onPriceChange(sanitizeDecimalPaste(event.clipboardData.getData('text')));
        }}
        disabled={disabled}
        sx={compactFieldSx}
        slotProps={{
          input: {
            startAdornment: (
              <Typography component="span" sx={{ mr: 0.35, color: processingTokens.textMute, fontWeight: 700 }}>
                $
              </Typography>
            ),
          },
        }}
      />
    </Box>
  );
}

export interface CheckInDetailFieldsSectionProps {
  price: string;
  onPriceChange: (value: string) => void;
  retail: string;
  onRetailChange: (value: string) => void;
  condition: ItemCondition;
  onConditionChange: (value: ItemCondition) => void;
  /** Item edit only — hidden on check-in flows (status is system-driven). */
  status?: ItemStatus;
  onStatusChange?: (value: ItemStatus) => void;
  dispatch: string;
  onDispatchChange: (value: string) => void;
  specifications: Record<string, string>;
  onSpecificationsChange: (value: Record<string, string>) => void;
  notes: string;
  onNotesChange: (value: string) => void;
  specsHelperText?: string | null;
  disabled?: boolean;
  /** Amber outline on required fields (price) until valid — for new/duplicate check-in. */
  highlightRequired?: boolean;
}

/** Bordered form section — matches product edit detail layout. */
export function CheckInDetailFieldsSection({
  price,
  onPriceChange,
  retail,
  onRetailChange,
  condition,
  onConditionChange,
  status,
  onStatusChange,
  dispatch,
  onDispatchChange,
  specifications,
  onSpecificationsChange,
  notes,
  onNotesChange,
  specsHelperText,
  disabled,
  highlightRequired = false,
}: CheckInDetailFieldsSectionProps) {
  const salvageLocked = condition === 'salvage';
  const priceMissing = highlightRequired && !isValidCheckInPrice(price);
  const showStatus = status != null && onStatusChange != null;

  return (
    <Box sx={workbenchDetailTokens.formSection}>
      <Box sx={workbenchDetailTokens.formGrid}>
        <Box
          sx={{
            gridColumn: '1 / -1',
            display: 'grid',
            gridTemplateColumns: {
              xs: '1fr',
              sm: showStatus ? '1fr 1fr 1fr' : '1fr 1fr',
              lg: showStatus ? '1fr 1fr 1fr' : '1fr 1fr',
            },
            gap: 1.5,
            alignItems: 'start',
          }}
        >
          <TextField
            select
            fullWidth
            size="small"
            label="Condition"
            value={condition}
            onChange={(event) => {
              const next = event.target.value as ItemCondition;
              onConditionChange(next);
              if (next === 'salvage') onDispatchChange('salvage');
            }}
            disabled={disabled}
            sx={compactFieldSx}
          >
            {PROCESSING_ITEM_CONDITION_OPTIONS.map((option) => (
              <MenuItem key={option.value} value={option.value}>
                {option.label}
              </MenuItem>
            ))}
          </TextField>
          {showStatus ?
            <TextField
              select
              fullWidth
              size="small"
              label="Status"
              value={status}
              onChange={(event) => onStatusChange(event.target.value as ItemStatus)}
              disabled={disabled}
              sx={compactFieldSx}
            >
              {(['intake', 'processing', 'on_shelf', 'returned', 'scrapped', 'lost'] as ItemStatus[]).map((value) => (
                <MenuItem key={value} value={value}>
                  {value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                </MenuItem>
              ))}
            </TextField>
          : null}
          <TextField
            select
            fullWidth
            size="small"
            label="Dispatch"
            value={salvageLocked ? 'salvage' : dispatch}
            onChange={(event) => onDispatchChange(event.target.value)}
            disabled={disabled || salvageLocked}
            sx={compactFieldSx}
          >
            {PROCESSING_ITEM_DISPATCH_OPTIONS.map((option) => (
              <MenuItem key={option.value} value={option.value}>
                {option.label}
              </MenuItem>
            ))}
          </TextField>
        </Box>
        <Box sx={checkInMoneyFieldsRowSx}>
          <CheckInMoneyField
            label="Retail"
            value={retail}
            onChange={onRetailChange}
            disabled={disabled}
          />
          <CheckInMoneyField
            label="Price"
            value={price}
            onChange={onPriceChange}
            disabled={disabled}
            required={highlightRequired}
            highlightMissing={priceMissing}
          />
        </Box>
        <Box sx={{ gridColumn: '1 / -1' }}>
          <ItemSpecificationsEditor
            value={specifications}
            onChange={onSpecificationsChange}
            disabled={disabled}
            helperText={specsHelperText}
          />
        </Box>
        <TextField
          fullWidth
          size="small"
          label="Notes"
          value={notes}
          onChange={(event) => onNotesChange(event.target.value)}
          placeholder="Optional"
          multiline
          minRows={2}
          disabled={disabled}
          sx={{ gridColumn: '1 / -1', ...compactFieldSx }}
        />
      </Box>
    </Box>
  );
}

export interface CheckInFieldsEditorProps {
  price: string;
  onPriceChange: (value: string) => void;
  retail: string;
  onRetailChange: (value: string) => void;
  condition: ItemCondition;
  onConditionChange: (value: ItemCondition) => void;
  dispatch: string;
  onDispatchChange: (value: string) => void;
  notes: string;
  onNotesChange: (value: string) => void;
  priceRequired?: boolean;
  priceError?: boolean;
  disabled?: boolean;
  /** Notes fills remaining pane height (check-in edit detail). */
  notesFlex?: boolean;
}

export function CheckInFieldsEditor({
  price,
  onPriceChange,
  retail,
  onRetailChange,
  condition,
  onConditionChange,
  dispatch,
  onDispatchChange,
  notes,
  onNotesChange,
  priceRequired,
  priceError,
  disabled,
  notesFlex = false,
}: CheckInFieldsEditorProps) {
  const salvageLocked = condition === 'salvage';

  return (
    <Box
      sx={{
        border: 1,
        borderColor: workbenchDetailTokens.borderSubtle,
        borderRadius: 1.5,
        bgcolor: workbenchDetailTokens.headerSurface,
        p: 1,
        display: 'flex',
        flexDirection: 'column',
        gap: 0.85,
        ...(notesFlex ? { flex: 1, minHeight: 0, overflow: 'hidden' } : {}),
      }}
    >
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr 1fr', md: '1fr 1fr' },
          gap: 0.75,
          alignItems: 'start',
        }}
      >
        <CompactMoneyField label="Price" value={price} onChange={onPriceChange} required={priceRequired} error={priceError} disabled={disabled} />
        <CompactMoneyField label="Retail" value={retail} onChange={onRetailChange} disabled={disabled} />
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 0.75 }}>
        <SegmentedOptionButtons
          label="Condition"
          value={condition}
          disabled={disabled}
          dense
          options={PROCESSING_ITEM_CONDITION_OPTIONS.map((opt) => ({
            value: opt.value,
            label: formatConditionLabel(opt.value),
          }))}
          onChange={(next) => {
            onConditionChange(next as ItemCondition);
            if (next === 'salvage') onDispatchChange('salvage');
          }}
        />
        <SegmentedOptionButtons
          label="Dispatch"
          value={salvageLocked ? 'salvage' : dispatch}
          disabled={disabled || salvageLocked}
          dense
          helperText={salvageLocked ? 'Salvage → salvage.' : undefined}
          options={PROCESSING_ITEM_DISPATCH_OPTIONS}
          onChange={onDispatchChange}
        />
      </Box>

      <TextField
        fullWidth
        size="small"
        label="Notes"
        value={notes}
        onChange={(e) => onNotesChange(e.target.value)}
        disabled={disabled}
        placeholder="Optional"
        multiline
        minRows={notesFlex ? 3 : 1}
        InputLabelProps={{ sx: { fontSize: '0.75rem' } }}
        sx={{
          ...(notesFlex ? { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' } : {}),
          '& .MuiInputBase-root': {
            fontSize: '0.8125rem',
            bgcolor: '#fff',
            py: 0.25,
            ...(notesFlex ? { flex: 1, alignItems: 'flex-start', overflow: 'auto', maxHeight: '100%' } : {}),
          },
          '& .MuiOutlinedInput-notchedOutline': { borderColor: workbenchDetailTokens.borderSubtle },
          '& textarea': notesFlex ? { minHeight: '4.5rem !important' } : {},
        }}
      />
    </Box>
  );
}

export interface CheckInDetailsEditorProps {
  quantity: string;
  onQuantityChange: (value: string) => void;
  selectedOrder: CheckInOrderAutocompleteProps['value'];
  onOrderChange: CheckInOrderAutocompleteProps['onChange'];
  price: string;
  onPriceChange: (value: string) => void;
  retail: string;
  onRetailChange: (value: string) => void;
  condition: ItemCondition;
  onConditionChange: (value: ItemCondition) => void;
  dispatch: string;
  onDispatchChange: (value: string) => void;
  notes: string;
  onNotesChange: (value: string) => void;
  qtyDelta?: number;
  priceRequired?: boolean;
  priceError?: boolean;
  disabled?: boolean;
  autoSelectDefaultOrder?: boolean;
}

export function CheckInDetailsEditor({
  quantity,
  onQuantityChange,
  selectedOrder,
  onOrderChange,
  price,
  onPriceChange,
  retail,
  onRetailChange,
  condition,
  onConditionChange,
  dispatch,
  onDispatchChange,
  notes,
  onNotesChange,
  qtyDelta = 0,
  priceRequired,
  priceError,
  disabled,
  autoSelectDefaultOrder,
}: CheckInDetailsEditorProps) {
  const salvageLocked = condition === 'salvage';

  const bumpQuantity = (delta: number) => {
    const next = Math.max(1, Math.min(MAX_CHECK_IN_QUANTITY, parseCheckInQuantity(quantity) + delta));
    onQuantityChange(String(next));
  };

  return (
    <Box
      sx={{
        border: 1,
        borderColor: workbenchDetailTokens.borderSubtle,
        borderRadius: 1.5,
        bgcolor: workbenchDetailTokens.headerSurface,
        p: 1,
        display: 'flex',
        flexDirection: 'column',
        gap: 0.85,
      }}
    >
      <CheckInOrderAutocomplete
        value={selectedOrder}
        onChange={onOrderChange}
        disabled={disabled}
        compact
        fullWidth
        autoSelectDefault={autoSelectDefaultOrder}
      />

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(3, minmax(0, 1fr))' },
          gap: 0.75,
          alignItems: 'start',
        }}
      >
        <Box sx={{ ...metricShellSx, minWidth: 0 }}>
          <Typography variant="caption" sx={fieldLabelSx}>Qty</Typography>
          <CheckInQtyStepper
            quantity={quantity}
            disabled={disabled}
            onChange={onQuantityChange}
            onBlur={() => onQuantityChange(String(parseCheckInQuantity(quantity)))}
            onBump={bumpQuantity}
            qtyDelta={qtyDelta}
          />
        </Box>
        <CompactMoneyField label="Price" value={price} onChange={onPriceChange} required={priceRequired} error={priceError} disabled={disabled} />
        <CompactMoneyField label="Retail" value={retail} onChange={onRetailChange} disabled={disabled} />
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 0.75 }}>
        <SegmentedOptionButtons
          label="Condition"
          value={condition}
          disabled={disabled}
          dense
          options={PROCESSING_ITEM_CONDITION_OPTIONS.map((opt) => ({
            value: opt.value,
            label: formatConditionLabel(opt.value),
          }))}
          onChange={(next) => {
            onConditionChange(next as ItemCondition);
            if (next === 'salvage') onDispatchChange('salvage');
          }}
        />
        <SegmentedOptionButtons
          label="Dispatch"
          value={salvageLocked ? 'salvage' : dispatch}
          disabled={disabled || salvageLocked}
          dense
          helperText={salvageLocked ? 'Salvage → salvage.' : undefined}
          options={PROCESSING_ITEM_DISPATCH_OPTIONS}
          onChange={onDispatchChange}
        />
      </Box>

      <TextField
        fullWidth
        size="small"
        label="Notes"
        value={notes}
        onChange={(e) => onNotesChange(e.target.value)}
        disabled={disabled}
        placeholder="Optional"
        InputLabelProps={{ sx: { fontSize: '0.75rem' } }}
        sx={{
          '& .MuiInputBase-root': { fontSize: '0.8125rem', bgcolor: '#fff', py: 0.25 },
          '& .MuiOutlinedInput-notchedOutline': { borderColor: workbenchDetailTokens.borderSubtle },
        }}
      />
    </Box>
  );
}
