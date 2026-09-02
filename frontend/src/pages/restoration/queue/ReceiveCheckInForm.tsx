/**
 * The one thing that changes as the processor works: the check-in for whatever is in hand.
 *
 * Slots stay the same size when someone taps Salvage - only the copy inside them changes.
 */
import { Box, TextField, Typography } from '@mui/material';
import type { ReactNode } from 'react';
import { formatConditionLabel } from '../../../constants/inventory.constants';
import type { ItemCondition } from '../../../types/inventory.types';
import {
  PROCESSING_ITEM_CONDITION_OPTIONS,
  PROCESSING_ITEM_DISPATCH_OPTIONS,
} from '../../inventory/processing/processingItemFormOptions';
import { CompactMoneyField, SegmentedOptionButtons } from '../../inventory/workbench/CheckInDetailsLayout';
import { ItemSpecificationsEditor } from '../../inventory/workbench/ItemSpecificationsEditor';
import {
  RetailPriceLockToggle,
  RetailPricePctButton,
  useRetailPriceLock,
} from '../../inventory/workbench/RetailPriceLockControls';
import { ReceiveProductPicker, type ReceiveProductPickerProps } from './ReceiveProductPicker';

const HEAD_HEIGHT = 20;
const LOCK_SLOT = 34;
const PCT_SLOT = 44;
const MONEY_ROW_HEIGHT = 56;

const CONDITION_OPTIONS = PROCESSING_ITEM_CONDITION_OPTIONS.map((option) => ({
  value: option.value,
  label: formatConditionLabel(option.value),
}));

const WASH = {
  condition: { bgcolor: '#f3f2ee', border: '#d8d4cc' },
  dispatch: { bgcolor: '#f4ebe3', border: '#dcc9b6' },
  price: { bgcolor: '#e8f1e8', border: '#b7ceb9' },
  notes: { bgcolor: '#eef1f4', border: '#c9d2db' },
};

const DISPATCH_OPTIONS = PROCESSING_ITEM_DISPATCH_OPTIONS.map((option) =>
  option.value === 'on_shelf' ? { ...option, label: 'On Shelf' } : option,
);

function restorationSaidLabel(raw: string): string {
  return /on shelf/i.test(raw) ? 'On Shelf' : raw;
}

export function ReceiveCheckInForm({
  title,
  picker,
  condition,
  onConditionChange,
  dispatch,
  onDispatchChange,
  saidDispatch,
  retail,
  onRetailChange,
  price,
  onPriceChange,
  notes,
  onNotesChange,
  specifications,
  onSpecificationsChange,
  skipCatalog,
  skipMoney,
  salvageHint,
  disabled,
}: {
  title: string;
  picker: ReceiveProductPickerProps;
  condition: ItemCondition;
  onConditionChange: (value: ItemCondition) => void;
  dispatch: string;
  onDispatchChange: (value: string) => void;
  saidDispatch: string;
  retail: string;
  onRetailChange: (value: string) => void;
  price: string;
  onPriceChange: (value: string) => void;
  notes: string;
  onNotesChange: (value: string) => void;
  specifications: Record<string, string>;
  onSpecificationsChange: (value: Record<string, string>) => void;
  skipCatalog?: boolean;
  skipMoney?: boolean;
  salvageHint: string;
  disabled?: boolean;
}) {
  const lock = useRetailPriceLock();
  const salvageLocked = condition === 'salvage';

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 1,
          height: HEAD_HEIGHT,
          minHeight: HEAD_HEIGHT,
        }}
      >
        <Typography noWrap title={title} sx={{ fontWeight: 800, fontSize: '0.86rem', color: '#172033', flexShrink: 0 }}>
          {title}
        </Typography>
      </Box>

      <ReceiveProductPicker {...picker} skipCatalog={skipCatalog} />

      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
        <StepCard title="Condition" wash={WASH.condition}>
          <SegmentedOptionButtons
            label=""
            fill
            value={condition}
            options={CONDITION_OPTIONS}
            onChange={(value) => {
              const next = value as ItemCondition;
              onConditionChange(next);
              if (next === 'salvage') onDispatchChange('salvage');
            }}
            disabled={disabled}
          />
        </StepCard>

        <StepCard
          title="Dispatch"
          hint={salvageLocked ? 'held at Salvage by the condition' : `restoration said ${restorationSaidLabel(saidDispatch)}`}
          wash={WASH.dispatch}
        >
          <SegmentedOptionButtons
            label=""
            fill
            value={salvageLocked ? 'salvage' : dispatch}
            options={DISPATCH_OPTIONS}
            onChange={onDispatchChange}
            disabled={disabled || salvageLocked}
          />
        </StepCard>
      </Box>

      <StepCard title="Retail & price" wash={WASH.price}>
        <Box sx={{ minHeight: MONEY_ROW_HEIGHT }}>
          {skipMoney || skipCatalog ? (
            <Typography
              sx={{
                height: MONEY_ROW_HEIGHT,
                display: 'flex',
                alignItems: 'center',
                fontSize: '0.84rem',
                fontWeight: 800,
                color: '#355c3a',
              }}
            >
              {salvageHint}
            </Typography>
          ) : (
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: `minmax(0, 1fr) ${LOCK_SLOT}px minmax(0, 1fr) ${PCT_SLOT}px`,
                gap: 1,
                alignItems: 'center',
                minHeight: MONEY_ROW_HEIGHT,
              }}
            >
              <CompactMoneyField
                label="Retail"
                value={retail}
                disabled={disabled}
                onChange={(next) => {
                  onRetailChange(next);
                  const nextPrice = lock.priceForRetail(next, { retail, price });
                  if (nextPrice) {
                    onPriceChange(nextPrice);
                    lock.syncPctFromPrice(next, nextPrice);
                  }
                }}
              />
              <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                <RetailPriceLockToggle
                  locked={lock.locked}
                  pct={lock.effectivePct(retail, price)}
                  size="small"
                  disabled={disabled}
                  onToggle={() => lock.toggleLock(retail, price)}
                />
              </Box>
              <CompactMoneyField
                label="Price"
                value={price}
                required
                disabled={disabled}
                onChange={(next) => {
                  onPriceChange(next);
                  lock.syncPctFromPrice(retail, next);
                }}
              />
              <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                <RetailPricePctButton
                  retail={retail}
                  price={price}
                  pct={lock.effectivePct(retail, price)}
                  isFallback={lock.isPctFallback(retail, price)}
                  size="small"
                  disabled={disabled}
                  onCommitPct={(nextPct, nextPrice) => {
                    lock.setPct(nextPct);
                    onPriceChange(nextPrice);
                  }}
                />
              </Box>
            </Box>
          )}
        </Box>
      </StepCard>

      <StepCard
        title="Notes"
        wash={WASH.notes}
        extra={
          <Box sx={{ minWidth: 160, maxWidth: 240 }}>
            <ItemSpecificationsEditor
              value={specifications}
              onChange={onSpecificationsChange}
              disabled={disabled || skipCatalog}
              helperText={null}
            />
          </Box>
        }
      >
        <TextField
          fullWidth
          size="small"
          placeholder="Anything the floor needs to know about this one"
          value={notes}
          disabled={disabled}
          onChange={(event) => onNotesChange(event.target.value)}
          sx={{ '& .MuiOutlinedInput-root': { fontSize: '0.84rem', bgcolor: '#fff' } }}
        />
      </StepCard>
    </Box>
  );
}

function StepCard({
  title,
  hint,
  extra,
  extraFill,
  wash,
  children,
}: {
  title: string;
  hint?: string;
  extra?: ReactNode;
  extraFill?: boolean;
  wash: { bgcolor: string; border: string };
  children?: ReactNode;
}) {
  return (
    <Box
      sx={{
        px: 1.25,
        py: 0.85,
        border: `1px solid ${wash.border}`,
        borderRadius: 2,
        bgcolor: wash.bgcolor,
        minWidth: 0,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minHeight: extra ? 36 : 18, mb: children ? 0.75 : 0 }}>
        <Typography
          sx={{
            flexShrink: 0,
            fontSize: '0.62rem',
            fontWeight: 800,
            letterSpacing: 0.6,
            textTransform: 'uppercase',
            color: '#5c6b70',
          }}
        >
          {title}
        </Typography>
        {hint ? (
          <Typography
            noWrap
            title={hint}
            sx={{
              ml: 'auto',
              minWidth: 0,
              fontSize: '0.72rem',
              fontWeight: 800,
              color: '#7a3e14',
            }}
          >
            {hint}
          </Typography>
        ) : null}
        {extra ? (
          <Box sx={{ ml: extraFill ? 0 : 'auto', flex: extraFill ? 1 : undefined, minWidth: 0, display: 'flex' }}>
            {extra}
          </Box>
        ) : null}
      </Box>
      {children}
    </Box>
  );
}
