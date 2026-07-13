import SaveIcon from '@mui/icons-material/Save';
import {
  Alert,
  Box,
  Button,
  Divider,
  Paper,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import { useSnackbar } from 'notistack';
import { useEffect, useMemo, useState } from 'react';
import { useGradeScales } from '../../../hooks/useGradeScales';
import { usePatchRestorationJob } from '../../../hooks/useRestorationJobs';
import type { ProcessingHandoff, ProcessingQuickTestResult, ProcessingTestedStatus, RestorationJobDTO } from '../../../types/inventory.types';
import {
  createEmptyGradeValuesForScale,
  gradeValuesComplete,
  TarsGradeValuesCard,
} from '../../restoration/tars/TarsGradeValuesCard';
import {
  normalizeProcessingHandoff,
  processingHandoffUnknownsText,
  PROCESSING_QUICK_TEST_PRESETS,
  PROCESSING_QUICK_TEST_RESULTS,
  PROCESSING_TESTED_STATUSES,
  setProcessingQuickTestResult,
} from '../processing/processingHandoff';
import { buildRestorationCardItemFromProcessing } from '../processing/ProcessingSendToRestorationDialog';
import { processingTokens } from '../processing/processingTokens';

export interface RestorationsToSetupPanelProps {
  job: RestorationJobDTO;
  onSaved?: (job: RestorationJobDTO) => void;
}

export function RestorationsToSetupPanel({ job, onSaved }: RestorationsToSetupPanelProps) {
  const { enqueueSnackbar } = useSnackbar();
  const { scales: gradeScales } = useGradeScales();
  const patchJob = usePatchRestorationJob();
  const [scale, setScale] = useState(job.scale || '');
  const [values, setValues] = useState<Record<string, number>>(() => ({ ...(job.grade_values || {}) }));
  const [handoff, setHandoff] = useState<ProcessingHandoff>(() =>
    normalizeProcessingHandoff(job.processing_handoff),
  );

  useEffect(() => {
    setScale(job.scale || '');
    setValues(
      job.scale
        ? createEmptyGradeValuesForScale(job.scale, gradeScales, job.grade_values || {})
        : { ...(job.grade_values || {}) },
    );
    setHandoff(normalizeProcessingHandoff(job.processing_handoff));
  }, [job.id, job.scale, job.grade_values, job.processing_handoff, gradeScales]);

  const canSave = useMemo(
    () => gradeValuesComplete(scale, values, gradeScales),
    [scale, values, gradeScales],
  );

  const cardItem = useMemo(
    () =>
      buildRestorationCardItemFromProcessing({
        productTitle: job.name,
        brand: job.brand,
        model: job.model,
        category: job.category,
        productNumber: job.product_number,
        upc: job.upc,
        retail: job.retail,
        price: job.price,
        condition: job.condition,
        sku: job.sku,
      }),
    [job],
  );

  async function handleSave() {
    if (!canSave) return;
    try {
      const saved = await patchJob.mutateAsync({
        id: job.id,
        payload: {
          scale,
          grade_values: { ...values },
          processing_handoff: normalizeProcessingHandoff(handoff),
        },
      });
      enqueueSnackbar(
        saved.needs_setup
          ? 'Saved — finish all grade values to clear the TARS request.'
          : saved.valuation_fulfilled_at
            ? 'Sent back to TARS — valuations complete.'
            : 'Ready for TARS.',
        { variant: saved.needs_setup ? 'warning' : 'success' },
      );
      onSaved?.(saved);
    } catch (err) {
      const detail =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { detail?: string; processing_handoff?: string } } }).response?.data
          : undefined;
      enqueueSnackbar(
        detail?.detail ||
          (typeof detail?.processing_handoff === 'string' ? detail.processing_handoff : null) ||
          (err instanceof Error ? err.message : 'Could not save restoration setup.'),
        { variant: 'error' },
      );
    }
  }

  return (
    <Stack spacing={1.25}>
      <Box>
        <Typography variant="overline" sx={{ fontWeight: 900, letterSpacing: '0.1em', color: 'primary.main' }}>
          TO restoration
        </Typography>
        <Typography variant="h6" sx={{ fontWeight: 800, lineHeight: 1.2 }}>
          Set grade scale & values
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Set grade scale and values for TARS. Incomplete values show as MISSING on the bench; Mike can request
          missing grades and keep assessing.
        </Typography>
      </Box>

      {job.valuation_pending ? (
        <Alert severity="warning" variant="outlined" sx={{ py: 0.5 }}>
          TARS requested
          {Array.isArray(job.valuation_requested_grades) && job.valuation_requested_grades.length
            ? `: ${job.valuation_requested_grades.join(', ')}`
            : ' grade values'}
          {job.valuation_request_notes ? ` — ${job.valuation_request_notes}` : ''}.
          Fill all grades and save to send back.
        </Alert>
      ) : null}

      {job.needs_setup && !job.valuation_pending ? (
        <Alert severity="info" variant="outlined" sx={{ py: 0.5 }}>
          Incomplete grades — TARS can still open the item; Done stays blocked until values are complete.
        </Alert>
      ) : null}

      <TarsGradeValuesCard
        item={cardItem}
        scale={scale}
        values={values}
        scales={gradeScales}
        onScaleChange={(next) => {
          setScale(next);
          setValues(createEmptyGradeValuesForScale(next, gradeScales, values));
        }}
        onGradeValueChange={(grade, value) => {
          setValues((prev) => ({ ...prev, [grade]: value }));
        }}
      />

      <Paper
        variant="outlined"
        sx={{ p: 1.25, borderColor: processingTokens.border, bgcolor: processingTokens.surfaceRaised }}
      >
        <Stack spacing={1.1}>
          <Box>
            <Typography sx={{ fontWeight: 800, fontSize: '0.9rem' }}>Processing handoff</Typography>
            <Typography variant="caption" color="text.secondary">
              What Processing observed before sending. Mike sees this read-only in TARS.
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

      <Stack direction="row" justifyContent="flex-end">
        <Button
          variant="contained"
          startIcon={<SaveIcon />}
          disabled={!canSave || patchJob.isPending}
          onClick={() => void handleSave()}
        >
          Save for TARS
        </Button>
      </Stack>
    </Stack>
  );
}
