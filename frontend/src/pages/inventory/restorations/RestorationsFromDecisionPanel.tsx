import PrintIcon from '@mui/icons-material/Print';
import {
  Box,
  Button,
  Chip,
  Divider,
  InputAdornment,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useSnackbar } from 'notistack';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { processingPatchItem } from '../../../api/inventory.api';
import {
  restorationsFromDeskQueryKey,
  useMarkRestorationJobHandled,
} from '../../../hooks/useRestorationBench';
import type { RestorationJobDTO } from '../../../types/inventory.types';
import { printProcessingLabelsAndMarkPrinted } from '../processing/printProcessingLabel';

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? d.toLocaleString() : '—';
}

function unitKindLabel(kind: string | undefined): string {
  if (kind === 'part') return 'Part';
  if (kind === 'added') return 'Added-by-Restoration';
  return 'Whole item';
}

export interface RestorationsFromDecisionPanelProps {
  job: RestorationJobDTO;
  onHandled?: () => void;
}

export function RestorationsFromDecisionPanel({ job, onHandled }: RestorationsFromDecisionPanelProps) {
  const { enqueueSnackbar } = useSnackbar();
  const queryClient = useQueryClient();
  const markHandled = useMarkRestorationJobHandled();
  const [price, setPrice] = useState(job.price ?? '');
  const [printing, setPrinting] = useState(false);
  const [savingPrice, setSavingPrice] = useState(false);

  useEffect(() => {
    setPrice(job.price ?? '');
  }, [job.id, job.price]);

  const labelItems = useMemo(
    () =>
      job.items.map((it) => ({
        id: it.id,
        sku: it.sku,
        price: price || job.price || '',
        product_title: job.name,
        product_brand: job.brand,
        product_number: job.product_number,
      })),
    [job, price],
  );

  const skuLabel = job.items.length
    ? job.items.map((it) => it.sku).join(', ')
    : (job.sku ?? '—');
  const family = job.from_family ?? 'worked';
  const grade = job.final_grade || job.return_grade || '—';
  const handoff = job.processing_handoff;
  const returnedAt = job.dispositioned_at ?? job.returned_at;

  async function handlePrint() {
    if (!labelItems.length) {
      enqueueSnackbar('No items to print for this return.', { variant: 'warning' });
      return;
    }
    setPrinting(true);
    try {
      const result = await printProcessingLabelsAndMarkPrinted(labelItems, price || undefined);
      if (result.failed > 0) {
        enqueueSnackbar(
          `Printed ${result.succeeded}, failed ${result.failed}. Check the label printer.`,
          { variant: 'warning' },
        );
      } else {
        enqueueSnackbar(`Printed ${result.succeeded} tag(s).`, { variant: 'success' });
      }
    } catch (err) {
      enqueueSnackbar(
        err instanceof Error ? err.message : 'Could not print tags. Check the label printer.',
        { variant: 'error' },
      );
    } finally {
      setPrinting(false);
    }
  }

  async function handleSavePrice() {
    const itemId = job.items[0]?.id;
    if (!itemId) {
      enqueueSnackbar('No item linked to update price.', { variant: 'warning' });
      return;
    }
    setSavingPrice(true);
    try {
      await processingPatchItem(itemId, { price: price || null });
      await queryClient.invalidateQueries({ queryKey: restorationsFromDeskQueryKey });
      enqueueSnackbar('Price saved.', { variant: 'success' });
    } catch (err) {
      enqueueSnackbar(err instanceof Error ? err.message : 'Could not save price.', {
        variant: 'error',
      });
    } finally {
      setSavingPrice(false);
    }
  }

  async function handleMarkHandled() {
    try {
      await markHandled.mutateAsync(job.id);
      enqueueSnackbar('Marked handled.', { variant: 'success' });
      onHandled?.();
    } catch (err) {
      enqueueSnackbar(err instanceof Error ? err.message : 'Could not mark handled.', {
        variant: 'error',
      });
    }
  }

  return (
    <Stack spacing={1.5} sx={{ p: 1.5 }}>
      <Box>
        <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap sx={{ mb: 0.75 }}>
          <Chip size="small" label="FROM" color="primary" sx={{ fontWeight: 900 }} />
          <Chip
            size="small"
            label={family === 'untouched' ? 'Untouched' : 'Worked'}
            color={family === 'untouched' ? 'warning' : 'success'}
            sx={{ fontWeight: 900 }}
          />
          <Chip size="small" variant="outlined" label={unitKindLabel(job.unit_kind)} sx={{ fontWeight: 700 }} />
          {(job.work_verbs ?? []).map((verb) => (
            <Chip key={verb} size="small" label={verb} sx={{ fontWeight: 700 }} />
          ))}
        </Stack>
        <Typography variant="h6" sx={{ fontWeight: 800, lineHeight: 1.2 }}>
          {job.name || 'Untitled product'}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {skuLabel} · returned {fmtDate(returnedAt)}
        </Typography>
      </Box>

      <Box>
        <Typography variant="overline" sx={{ fontWeight: 900, letterSpacing: '0.08em' }}>
          Context
        </Typography>
        <Stack spacing={0.65} sx={{ mt: 0.35 }}>
          <Typography variant="body2">
            <strong>Grade / outcome:</strong> {grade}
            {job.sale_state ? ` · sale ${job.sale_state}` : ''}
          </Typography>
          {job.decision_reason ? (
            <Typography variant="body2">
              <strong>Decision reason:</strong> {job.decision_reason}
            </Typography>
          ) : null}
          {job.disposition_notes || job.return_notes ? (
            <Typography variant="body2">
              <strong>Notes:</strong> {job.disposition_notes || job.return_notes}
            </Typography>
          ) : null}
          {family === 'untouched' && job.return_reason ? (
            <Typography variant="body2">
              <strong>Untouched reason:</strong> {job.return_reason}
            </Typography>
          ) : null}
          {handoff ? (
            <Box sx={{ pl: 1, borderLeft: 3, borderColor: 'divider' }}>
              <Typography variant="caption" sx={{ fontWeight: 800, display: 'block' }}>
                Processing handoff
              </Typography>
              <Typography variant="body2">Tested: {handoff.tested_status}</Typography>
              {handoff.condition_evidence ? (
                <Typography variant="body2">Evidence: {handoff.condition_evidence}</Typography>
              ) : null}
              {handoff.unknowns ? (
                <Typography variant="body2">
                  Unknowns:{' '}
                  {Array.isArray(handoff.unknowns) ? handoff.unknowns.join('; ') : String(handoff.unknowns)}
                </Typography>
              ) : null}
            </Box>
          ) : null}
        </Stack>
      </Box>

      <Divider />

      <Box>
        <Typography variant="overline" sx={{ fontWeight: 900, letterSpacing: '0.08em' }}>
          Processor actions
        </Typography>
        <Stack spacing={1} sx={{ mt: 0.75 }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }}>
            <TextField
              size="small"
              label="Price"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              InputProps={{
                startAdornment: <InputAdornment position="start">$</InputAdornment>,
              }}
              sx={{ maxWidth: 160 }}
            />
            <Button variant="outlined" disabled={savingPrice} onClick={() => void handleSavePrice()}>
              Save price
            </Button>
            <Button
              variant="outlined"
              startIcon={<PrintIcon />}
              disabled={printing || !labelItems.length}
              onClick={() => void handlePrint()}
            >
              Print tags
            </Button>
          </Stack>
          <Button
            variant="contained"
            disabled={markHandled.isPending}
            onClick={() => void handleMarkHandled()}
            sx={{ alignSelf: 'flex-start' }}
          >
            Mark handled
          </Button>
        </Stack>
      </Box>
    </Stack>
  );
}
