import Add from '@mui/icons-material/Add';
import LocalPrintshop from '@mui/icons-material/LocalPrintshop';
import OpenInFull from '@mui/icons-material/OpenInFull';
import Remove from '@mui/icons-material/Remove';
import { Box, Button, IconButton, MenuItem, TextField, Typography } from '@mui/material';
import { useEffect, useState, type ReactNode, type WheelEvent } from 'react';
import { preventWheelChangeNumber } from '../../../utils/formInputs';
import { manifestToolbarLabelSx } from './ManifestToolbarPill';
import {
  PROCESSING_ROW_FIELD_HEIGHT,
  PROCESSING_ROW_VALUE_FONT,
  PROCESSING_ROW_VALUE_FONT_WEIGHT,
} from './processingRowFieldTokens';
import { ProcessingRowSection } from './ProcessingRowSection';
import { processingRowSectionBodyFitSx, processingRowToolbarRowSx } from './processingRowToolbarLayout';
import { processingTokens } from './processingTokens';

const CONDITION_OPTIONS = ['New', 'Like New', 'Very Good', 'Used Good', 'Used Fair', 'Salvage'];

const DISPATCH_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'on_shelf', label: 'On shelf / floor' },
  { value: 'restoration', label: 'Restoration' },
  { value: 'back_storage', label: 'Back storage' },
  { value: 'online_sales', label: 'Online sales' },
  { value: 'salvage', label: 'Salvage' },
];

const CONTROL_HEIGHT = PROCESSING_ROW_FIELD_HEIGHT;
const MAX_CHECK_IN_QTY = 500;

function parseCheckInQuantity(raw: string): number {
  return Math.max(1, Math.min(MAX_CHECK_IN_QTY, Number.parseInt(raw, 10) || 1));
}

const shellInputSx = {
  flex: 1,
  minWidth: 0,
  m: 0,
  '& .MuiOutlinedInput-root': {
    height: CONTROL_HEIGHT,
    fontSize: PROCESSING_ROW_VALUE_FONT,
    fontWeight: PROCESSING_ROW_VALUE_FONT_WEIGHT,
    borderRadius: 0,
    bgcolor: 'transparent',
    '& fieldset': { border: 0 },
  },
  '& .MuiOutlinedInput-input': {
    py: 0,
    px: 0.75,
    fontSize: PROCESSING_ROW_VALUE_FONT,
  },
  '& .MuiSelect-select': {
    display: 'flex',
    alignItems: 'center',
    minHeight: 'unset !important',
    py: '0 !important',
    fontSize: PROCESSING_ROW_VALUE_FONT,
  },
};

const actionButtonSx = {
  height: CONTROL_HEIGHT,
  minHeight: CONTROL_HEIGHT,
  px: 1,
  whiteSpace: 'nowrap',
  flexShrink: 0,
  fontSize: '0.6875rem',
  '& .MuiButton-startIcon': {
    marginRight: 0.35,
    '& > svg': { fontSize: 14 },
  },
};

function QuickCheckInField({
  label,
  children,
  sx,
}: {
  label: string;
  children: ReactNode;
  sx?: object;
}) {
  return (
    <Box sx={{ minWidth: 0, py: 0.35, px: 0, ...sx }}>
      <Typography variant="caption" color="text.secondary" fontWeight={400} sx={manifestToolbarLabelSx}>
        {label}
      </Typography>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'stretch',
          minHeight: CONTROL_HEIGHT,
          borderRadius: 1,
          border: '1px solid',
          borderColor: processingTokens.border,
          bgcolor: processingTokens.checkInShellBg,
          overflow: 'hidden',
        }}
      >
        {children}
      </Box>
    </Box>
  );
}

export interface ProcessingQuickCheckInFooterProps {
  qtyRemaining: number;
  checkInLoading: boolean;
  conditionUi: string;
  dispatch: string;
  price: string;
  salvageLocked: boolean;
  onConditionChange: (value: string) => void;
  onDispatchChange: (value: string) => void;
  onPriceChange: (value: string) => void;
  onCheckInPrint: (quantity: number) => void;
  onCheckInNoPrint: (quantity: number) => void;
  onDetailedCheckIn: () => void;
  variant?: 'header' | 'section';
  sectionTitle?: string;
  sectionNote?: ReactNode;
}

export function ProcessingQuickCheckInFooter({
  qtyRemaining,
  checkInLoading,
  conditionUi,
  dispatch,
  price,
  salvageLocked,
  onConditionChange,
  onDispatchChange,
  onPriceChange,
  onCheckInPrint,
  onCheckInNoPrint,
  onDetailedCheckIn,
  variant = 'section',
  sectionTitle,
  sectionNote,
}: ProcessingQuickCheckInFooterProps) {
  const [quantity, setQuantity] = useState('1');

  useEffect(() => {
    setQuantity('1');
  }, [qtyRemaining]);

  const qtyValue = quantity.trim() === '' ? 0 : parseCheckInQuantity(quantity);
  const disabled = checkInLoading || qtyRemaining <= 0 || qtyValue < 1;
  const leftAfter = Math.max(0, qtyRemaining - qtyValue);
  const isHeader = variant === 'header';

  function handleQuantityChange(raw: string) {
    const digits = raw.replace(/[^0-9]/g, '');
    setQuantity(digits);
  }

  function handleQuantityBlur() {
    if (!quantity.trim()) {
      setQuantity('1');
      return;
    }
    setQuantity(String(parseCheckInQuantity(quantity)));
  }

  function bumpQuantity(delta: number) {
    setQuantity(String(parseCheckInQuantity(String(Math.max(0, qtyValue || 1) + delta))));
  }

  function submitCheckIn(printLabels: boolean) {
    if (qtyValue < 1) return;
    if (printLabels) onCheckInPrint(qtyValue);
    else onCheckInNoPrint(qtyValue);
  }

  const controls = (
    <Box sx={processingRowToolbarRowSx}>
        <QuickCheckInField label="Qty" sx={{ flex: '0 0 92px', minWidth: 88, maxWidth: 102 }}>
          <IconButton
            size="small"
            aria-label="Decrease quantity"
            disabled={disabled || qtyValue <= 1}
            onClick={() => bumpQuantity(-1)}
            sx={{
              width: 22,
              height: CONTROL_HEIGHT,
              borderRadius: 0,
              borderRight: '1px solid',
              borderColor: processingTokens.border,
            }}
          >
            <Remove sx={{ fontSize: 13 }} />
          </IconButton>
          <TextField
            size="small"
            value={quantity}
            aria-label="Quantity"
            onChange={(e) => handleQuantityChange(e.target.value)}
            onBlur={handleQuantityBlur}
            onWheel={(e: WheelEvent<HTMLInputElement>) => preventWheelChangeNumber(e)}
            sx={{
              ...shellInputSx,
              '& .MuiOutlinedInput-input': {
                py: 0,
                px: 0.25,
                textAlign: 'center',
                fontVariantNumeric: 'tabular-nums',
              },
            }}
          />
          <IconButton
            size="small"
            aria-label="Increase quantity"
            disabled={disabled || qtyValue >= MAX_CHECK_IN_QTY}
            onClick={() => bumpQuantity(1)}
            sx={{
              width: 22,
              height: CONTROL_HEIGHT,
              borderRadius: 0,
              borderLeft: '1px solid',
              borderColor: processingTokens.border,
            }}
          >
            <Add sx={{ fontSize: 13 }} />
          </IconButton>
        </QuickCheckInField>

        <QuickCheckInField label="Condition" sx={{ flex: '1 1 118px', minWidth: 108, maxWidth: 168 }}>
          <TextField
            select
            size="small"
            value={conditionUi}
            aria-label="Condition"
            onChange={(e) => onConditionChange(e.target.value)}
            sx={shellInputSx}
            SelectProps={{ displayEmpty: true }}
          >
            {CONDITION_OPTIONS.map((c) => (
              <MenuItem key={c} value={c}>
                {c}
              </MenuItem>
            ))}
          </TextField>
        </QuickCheckInField>

        <QuickCheckInField label="Price" sx={{ flex: '0 1 80px', minWidth: 74, maxWidth: 96 }}>
          <TextField
            size="small"
            placeholder="—"
            value={price}
            aria-label="Shelf price"
            onChange={(e) => onPriceChange(e.target.value)}
            sx={shellInputSx}
          />
        </QuickCheckInField>

        <QuickCheckInField label="Dispatch" sx={{ flex: '1 1 128px', minWidth: 116, maxWidth: 176 }}>
          <TextField
            select
            size="small"
            value={dispatch}
            aria-label="Dispatch"
            disabled={salvageLocked}
            onChange={(e) => onDispatchChange(e.target.value)}
            sx={shellInputSx}
            SelectProps={{ displayEmpty: true }}
          >
            {DISPATCH_OPTIONS.map((o) => (
              <MenuItem key={o.value} value={o.value}>
                {o.label}
              </MenuItem>
            ))}
          </TextField>
        </QuickCheckInField>

        <Box
          sx={{
            display: 'flex',
            alignItems: 'flex-end',
            flexWrap: 'wrap',
            gap: 0.5,
            py: 0.35,
            flex: '1 1 280px',
            minWidth: 0,
          }}
        >
          <Button
            size="small"
            variant="contained"
            color="success"
            startIcon={<LocalPrintshop fontSize="small" />}
            disabled={disabled}
            onClick={() => submitCheckIn(true)}
            sx={actionButtonSx}
          >
            Check in
          </Button>
          <Button
            size="small"
            variant="outlined"
            disabled={disabled}
            onClick={() => submitCheckIn(false)}
            sx={{
              ...actionButtonSx,
              borderColor: processingTokens.accentGreen,
              color: processingTokens.accentGreen,
              '&:hover': {
                borderColor: processingTokens.primaryDark,
                bgcolor: processingTokens.greenSoft,
              },
            }}
          >
            Check in
          </Button>
          <Button
            size="small"
            variant="outlined"
            startIcon={<OpenInFull fontSize="small" />}
            onClick={onDetailedCheckIn}
            sx={{
              ...actionButtonSx,
              borderColor: processingTokens.cardboardBrown,
              color: processingTokens.cardboardBrownDark,
              '&:hover': {
                borderColor: processingTokens.cardboardBrownDark,
                bgcolor: processingTokens.cardboardBrownHover,
              },
            }}
          >
            Detailed check-in
          </Button>
        </Box>
      </Box>
  );

  const leftAfterLabel = (
    <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.625rem', lineHeight: 1.35, whiteSpace: 'nowrap' }}>
      Left after: <strong>{leftAfter}</strong>
    </Typography>
  );

  if (sectionTitle) {
    return (
      <ProcessingRowSection
        title={sectionTitle}
        note={sectionNote}
        trailing={leftAfterLabel}
        surface="quickCheckIn"
        sx={{ minWidth: 0, width: '100%' }}
        bodySx={{ px: 0.75, py: 0.85, ...processingRowSectionBodyFitSx }}
      >
        {controls}
      </ProcessingRowSection>
    );
  }

  return (
    <Box
      sx={{
        mb: 0,
        overflow: 'hidden',
        border: '1px solid',
        borderColor: processingTokens.cardboardBrownBorder,
        bgcolor: processingTokens.cardboardBrownSoft,
        borderRadius: 1,
        px: 0.75,
        py: 0.65,
        width: '100%',
        maxWidth: '100%',
        minWidth: 0,
        flex: isHeader ? { md: '0 1 auto' } : undefined,
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'flex-start',
          flexWrap: 'wrap',
          gap: 1,
          mb: 0.35,
          px: 0.25,
          width: '100%',
          minWidth: 0,
        }}
      >
        <Typography
          variant="caption"
          fontWeight={700}
          sx={{
            letterSpacing: 0.5,
            textTransform: 'uppercase',
            color: processingTokens.cardboardBrownDark,
            fontSize: '0.5875rem',
            lineHeight: 1.2,
          }}
        >
          Quick check-in
        </Typography>
        {leftAfterLabel}
      </Box>
      {controls}
    </Box>
  );
}
