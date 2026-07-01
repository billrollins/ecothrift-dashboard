import Close from '@mui/icons-material/Close';
import Send from '@mui/icons-material/Send';
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Typography,
} from '@mui/material';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  createEmptyGradeValuesForScale,
  gradeValuesComplete,
  TarsGradeValuesCard,
  type RestorationGradeConfig,
  type TarsGradeValuesCardItem,
} from '../../restoration/tars/TarsGradeValuesCard';
import { parseMoneyOpt } from '../../restoration/tars/tarsMoney';
import { useGradeScales } from '../../../hooks/useGradeScales';
import { processingTokens } from './processingTokens';

export interface ProcessingSendToRestorationDialogProps {
  open: boolean;
  quantity: number;
  item: TarsGradeValuesCardItem;
  initialConfig?: RestorationGradeConfig | null;
  loading?: boolean;
  onConfirm: (config: RestorationGradeConfig) => void;
  onCancel: () => void;
}

export function ProcessingSendToRestorationDialog({
  open,
  quantity,
  item,
  initialConfig = null,
  loading = false,
  onConfirm,
  onCancel,
}: ProcessingSendToRestorationDialogProps) {
  const { scales: gradeScales } = useGradeScales();
  const [scale, setScale] = useState('');
  const [values, setValues] = useState<Record<string, number>>({});

  // Read scales via a ref inside the reset effect so a grade-scale refetch
  // (new record identity) can't wipe values typed while the dialog is open.
  const gradeScalesRef = useRef(gradeScales);
  useEffect(() => {
    gradeScalesRef.current = gradeScales;
  }, [gradeScales]);

  useEffect(() => {
    if (!open) return;
    const nextScale = initialConfig?.scale ?? '';
    setScale(nextScale);
    setValues(
      nextScale ?
        createEmptyGradeValuesForScale(nextScale, gradeScalesRef.current, initialConfig?.values ?? {})
      : {},
    );
  }, [open, initialConfig?.scale, initialConfig?.values]);

  const canSend = useMemo(
    () => gradeValuesComplete(scale, values, gradeScales),
    [scale, values, gradeScales],
  );

  function handleScaleChange(nextScale: string) {
    setScale(nextScale);
    setValues(createEmptyGradeValuesForScale(nextScale, gradeScales, values));
  }

  function handleGradeValueChange(grade: string, value: number) {
    setValues((prev) => ({ ...prev, [grade]: value }));
  }

  function handleSend() {
    if (!canSend) return;
    onConfirm({ scale, values: { ...values } });
  }

  return (
    <Dialog
      open={open}
      onClose={loading ? undefined : onCancel}
      fullWidth
      maxWidth="md"
      PaperProps={{
        sx: {
          width: 'min(920px, calc(100vw - 32px))',
          maxHeight: 'calc(100vh - 48px)',
          overflow: 'hidden',
          borderRadius: 3,
        },
      }}
    >
      <DialogTitle sx={{ px: 2, py: 1.15, borderBottom: 1, borderColor: processingTokens.border }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography variant="h6" sx={{ fontWeight: 800, lineHeight: 1.15, fontSize: '1.05rem' }}>
              Send to Restoration
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25, fontWeight: 700 }}>
              Set grade values once for this check-in — applies to all {quantity.toLocaleString()} unit
              {quantity === 1 ? '' : 's'}.
            </Typography>
          </Box>
          <Chip
            label={`Qty ${quantity.toLocaleString()}`}
            size="small"
            color="success"
            sx={{ fontWeight: 800, flexShrink: 0 }}
          />
          <IconButton aria-label="Close" onClick={onCancel} disabled={loading} size="small">
            <Close />
          </IconButton>
        </Box>
      </DialogTitle>

      <DialogContent sx={{ px: 2, py: 1.5, bgcolor: processingTokens.cardDeckBg, overflow: 'auto' }}>
        <TarsGradeValuesCard
          item={item}
          scale={scale}
          values={values}
          scales={gradeScales}
          onScaleChange={handleScaleChange}
          onGradeValueChange={handleGradeValueChange}
        />
      </DialogContent>

      <DialogActions sx={{ px: 2, py: 1, gap: 0.75, borderTop: 1, borderColor: processingTokens.border }}>
        <Button onClick={onCancel} disabled={loading} sx={{ mr: 'auto' }}>
          Cancel
        </Button>
        <Button
          variant="contained"
          startIcon={<Send />}
          disabled={!canSend || loading}
          onClick={handleSend}
        >
          Send {quantity.toLocaleString()} to Restoration
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export function mapVendorNameToTarsSource(vendorName: string | null | undefined): string | undefined {
  const v = String(vendorName || '').trim().toLowerCase();
  if (!v) return undefined;
  if (v.includes('target')) return 'Target';
  if (v.includes('amazon') || v.includes('b-stock') || v.includes('bstock')) return 'Amazon';
  if (v.includes('walmart')) return 'Walmart';
  return undefined;
}

export function buildRestorationCardItemFromProcessing(input: {
  productTitle: string;
  brand?: string | null;
  model?: string | null;
  category?: string | number | null;
  productNumber?: string | null;
  upc?: string | null;
  retail?: string | number | null;
  price?: string | number | null;
  condition?: string | null;
  vendorName?: string | null;
  sku?: string | null;
}): TarsGradeValuesCardItem {
  return {
    sku: input.sku?.trim() || undefined,
    name: input.productTitle.trim() || 'Product',
    brand: input.brand?.trim() || undefined,
    model: input.model?.trim() || undefined,
    productNumber: input.productNumber?.trim() || undefined,
    upc: input.upc?.trim() || undefined,
    category: input.category != null ? String(input.category) : 'General',
    condition: input.condition?.trim() || undefined,
    retail: parseMoneyOpt(input.retail),
    price: parseMoneyOpt(input.price),
    source: mapVendorNameToTarsSource(input.vendorName),
  };
}
