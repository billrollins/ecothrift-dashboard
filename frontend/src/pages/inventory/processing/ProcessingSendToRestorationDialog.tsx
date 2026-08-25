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
  Divider,
  IconButton,
  Paper,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
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
import type {
  ProcessingHandoff,
  ProcessingQuickTestResult,
  ProcessingTestedStatus,
} from '../../../types/inventory.types';
import { processingTokens } from './processingTokens';
import { studio } from '../../restoration/tars/studio/tarsStudioTheme';
import {
  normalizeProcessingHandoff,
  processingHandoffUnknownsText,
  PROCESSING_QUICK_TEST_PRESETS,
  PROCESSING_QUICK_TEST_RESULTS,
  PROCESSING_TESTED_STATUSES,
  setProcessingQuickTestResult,
} from './processingHandoff';

export interface ProcessingRestorationConfig extends RestorationGradeConfig {
  handoff?: ProcessingHandoff;
}

export interface ProcessingSendToRestorationDialogProps {
  open: boolean;
  quantity: number;
  item: TarsGradeValuesCardItem;
  initialConfig?: ProcessingRestorationConfig | null;
  loading?: boolean;
  onConfirm: (config: ProcessingRestorationConfig & { handoff: ProcessingHandoff }) => void;
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
  const [handoff, setHandoff] = useState<ProcessingHandoff>(() => normalizeProcessingHandoff(null));

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
    setHandoff(normalizeProcessingHandoff(initialConfig?.handoff));
  }, [open, initialConfig?.scale, initialConfig?.values, initialConfig?.handoff]);

  const canSend = useMemo(
    () => gradeValuesComplete(scale, values, gradeScales),
    [scale, values, gradeScales],
  );

  function handleScaleChange(nextScale: string) {
    setScale(nextScale);
    setValues(createEmptyGradeValuesForScale(nextScale, gradeScales, values));
  }

  function handleGradeValueChange(grade: string, value: number | null) {
    setValues((prev) => {
      const next = { ...prev };
      if (value == null) delete next[grade];
      else next[grade] = value;
      return next;
    });
  }

  function handleSend() {
    if (!canSend) return;
    onConfirm({
      scale,
      values: { ...values },
      handoff: normalizeProcessingHandoff(handoff),
    });
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
          borderRadius: `${studio.radius.lg}px`,
          boxShadow: studio.panelShadow,
        },
      }}
    >
      <DialogTitle sx={{ px: 2.5, py: 1.5, borderBottom: 1, borderColor: processingTokens.border, bgcolor: '#0f172a', color: '#f8fafc' }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography variant="overline" sx={{ color: studio.accent, fontWeight: 900, letterSpacing: '0.12em' }}>
              TARS handoff
            </Typography>
            <Typography variant="h6" sx={{ fontWeight: 900, lineHeight: 1.15 }}>
              Send to Restoration
            </Typography>
            <Typography variant="caption" sx={{ display: 'block', mt: 0.25, fontWeight: 700, color: studio.subOnDark }}>
              Set grade values once for this check-in - applies to all {quantity.toLocaleString()} unit
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
        <Paper
          variant="outlined"
          sx={{ mt: 1.25, p: 1.25, borderColor: processingTokens.border, bgcolor: processingTokens.surfaceRaised }}
        >
          <Stack spacing={1.1}>
            <Box>
              <Typography sx={{ fontWeight: 800, fontSize: '0.9rem' }}>
                Processing handoff
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Record only what Processing observed. Grade values stay above.
              </Typography>
            </Box>

            <Box>
              <Typography
                variant="caption"
                sx={{ display: 'block', mb: 0.45, fontWeight: 800, textTransform: 'uppercase' }}
              >
                Tested status · required
              </Typography>
              <ToggleButtonGroup
                exclusive
                size="small"
                value={handoff.tested_status}
                onChange={(_, next: ProcessingTestedStatus | null) => {
                  if (next) setHandoff((prev) => ({ ...prev, tested_status: next }));
                }}
                aria-label="Tested status"
                sx={{ flexWrap: 'wrap' }}
              >
                {PROCESSING_TESTED_STATUSES.map(({ value, label }) => (
                  <ToggleButton key={value} value={value} sx={{ px: 1.5, py: 0.55, fontWeight: 700 }}>
                    {label}
                  </ToggleButton>
                ))}
              </ToggleButtonGroup>
            </Box>

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
              <TextField
                fullWidth
                size="small"
                label="Condition evidence (optional)"
                placeholder="Visible damage, missing parts, wear…"
                value={handoff.condition_evidence ?? ''}
                onChange={(event) => {
                  const value = event.target.value;
                  setHandoff((prev) => ({ ...prev, condition_evidence: value || undefined }));
                }}
                multiline
                minRows={2}
              />
              <TextField
                fullWidth
                size="small"
                label="Unknowns (optional)"
                placeholder="What Restoration still needs to verify…"
                value={processingHandoffUnknownsText(handoff)}
                onChange={(event) => {
                  const value = event.target.value;
                  setHandoff((prev) => ({ ...prev, unknowns: value || undefined }));
                }}
                multiline
                minRows={2}
              />
            </Stack>

            <Divider />
            <Box>
              <Typography
                variant="caption"
                sx={{ display: 'block', mb: 0.6, fontWeight: 800, textTransform: 'uppercase' }}
              >
                Quick tests · optional
              </Typography>
              <Stack spacing={0.55}>
                {PROCESSING_QUICK_TEST_PRESETS.map((test) => {
                  const result =
                    handoff.quick_tests?.find((row) => row.test_id === test.test_id)?.result ?? null;
                  return (
                    <Box
                      key={test.test_id}
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 1,
                        flexWrap: 'wrap',
                      }}
                    >
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>
                        {test.name}
                      </Typography>
                      <ToggleButtonGroup
                        exclusive
                        size="small"
                        value={result}
                        onChange={(_, next: ProcessingQuickTestResult | null) => {
                          setHandoff((prev) => setProcessingQuickTestResult(prev, test, next));
                        }}
                        aria-label={`${test.name} result`}
                      >
                        {PROCESSING_QUICK_TEST_RESULTS.map(({ value, label }) => (
                          <ToggleButton key={value} value={value} sx={{ py: 0.3, px: 1, fontSize: '0.7rem' }}>
                            {label}
                          </ToggleButton>
                        ))}
                      </ToggleButtonGroup>
                    </Box>
                  );
                })}
              </Stack>
            </Box>
          </Stack>
        </Paper>
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
