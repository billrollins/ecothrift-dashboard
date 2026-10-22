/**
 * Add item (Find item > Add item, owner 2026-10-22): add something we sell that came with no purchase order (a Misfit).
 * Built like Processing's check-in and on its parts: the retail check (`RetailCheckDialog`), the tag printing
 * (`printProcessingLabelsAndMarkPrinted`), the large-quantity confirm and the Restoration grade dialog.
 * Steps: find the product → (not found: copy a near match, AI fill, or type it) → check in → done.
 */
import { useCallback, useEffect, useState } from 'react';
import CheckCircleOutline from '@mui/icons-material/CheckCircleOutline';
import {
  Box, Button, Chip, Dialog, IconButton, Stack, Typography, useMediaQuery, useTheme,
} from '@mui/material';
import { useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import {
  addItemCheckIn, type AddItemCheckInResult, type AddItemProduct, type NewProductSpec,
} from '../../../api/addItem.api';
import { apiErrorDetail } from '../../../hooks/useProductSearch';
import { printedPreviewToLabelInputs } from '../../../hooks/useProcessingWorkspace';
import { IconClose, IconPrint } from '../../../icons/ecoIcons';
import { LargeCheckInConfirmDialog } from '../processing/LargeCheckInConfirmDialog';
import { isLargeCheckIn } from '../processing/largeCheckIn';
import { printProcessingLabelsAndMarkPrinted } from '../processing/printProcessingLabel';
import { useRetailCheckPrompt, withRetailCheck } from '../processing/RetailCheckDialog';
import { TarsQuickGradeDialog } from '../../restoration/tars/TarsQuickGradeDialog';
import { AddItemCheckInStep } from './AddItemCheckInStep';
import { AddItemFindStep } from './AddItemFindStep';
import { AddItemNewProductStep } from './AddItemNewProductStep';
import {
  buildCheckInPayload, emptySpec, initialCheckIn, quantityOf, specFromProduct,
  type CheckInForm, type PickedProduct,
} from './addItemModel';

type Step = 'find' | 'new' | 'checkin' | 'done';

const STEP_TITLE: Record<Step, string> = {
  find: 'Find the product',
  new: 'Make the product',
  checkin: 'Check in',
  done: 'Done',
};

interface DoneState {
  result: AddItemCheckInResult;
  printed: string;
  printFailed: boolean;
  /** Whether a print was tried (the button then says "again"). */
  triedPrint: boolean;
}

/** A product just made here, as a search row, so "Same product again" skips the search. */
function pickedAsRow(picked: PickedProduct, productId: number): AddItemProduct {
  if (picked.kind === 'existing') return picked.product;
  const s = picked.spec;
  return {
    product_id: productId, product_number: '', title: s.title, short_name: s.short_name ?? '', brand: s.brand,
    model: s.model, category: s.category, subcategory: s.subcategory, photo_url: null, typical_price: null,
    typical_price_from: '', typical_retail: s.retail_estimate ?? null, sold: 0, on_shelf: 0, items: 0, match: 'text',
    matched_sku: '',
  };
}

export function AddItemDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const theme = useTheme();
  const phone = useMediaQuery(theme.breakpoints.down('sm'));
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const retailCheck = useRetailCheckPrompt();

  const [step, setStep] = useState<Step>('find');
  const [query, setQuery] = useState('');
  const [spec, setSpec] = useState<NewProductSpec>(() => emptySpec('typed'));
  const [copiedFrom, setCopiedFrom] = useState<AddItemProduct | null>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [picked, setPicked] = useState<PickedProduct | null>(null);
  const [form, setForm] = useState<CheckInForm | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<DoneState | null>(null);
  const [volumeConfirm, setVolumeConfirm] = useState<boolean | null>(null);
  const [gradeJobId, setGradeJobId] = useState<number | null>(null);

  const restart = useCallback((keepQuery = false) => {
    setStep('find');
    if (!keepQuery) setQuery('');
    setSpec(emptySpec('typed'));
    setCopiedFrom(null);
    setPhoto(null);
    setPicked(null);
    setForm(null);
    setDone(null);
  }, []);

  useEffect(() => {
    if (open) restart();
  }, [open, restart]);

  const toCheckIn = (next: PickedProduct) => {
    setPicked(next);
    setForm(initialCheckIn(next));
    setStep('checkin');
  };

  const startNew = (next: NewProductSpec, from: AddItemProduct | null, q: string) => {
    setQuery(q);
    setSpec(next);
    setCopiedFrom(from);
    setPhoto(null);
    setStep('new');
  };

  async function runCheckIn(printLabels: boolean) {
    if (!picked || !form) return;
    setBusy(true);
    try {
      const data = await withRetailCheck(
        buildCheckInPayload(picked, form),
        (body) => addItemCheckIn(body, picked.kind === 'new' ? picked.photo : null),
        retailCheck.ask,
      );
      if (!data) return;
      let printed = 'Tags not printed.';
      let printFailed = false;
      if (printLabels) {
        const labels = printedPreviewToLabelInputs(data.printed_items_preview);
        const result = await printProcessingLabelsAndMarkPrinted(labels);
        printFailed = result.failed > 0;
        printed = printFailed
          ? `Printed ${result.succeeded} of ${labels.length} tags. Is the print server on?`
          : `Printed ${result.succeeded} tag${result.succeeded === 1 ? '' : 's'}.`;
        if (result.markFailed) printed += ' (Printed, but the printed mark was not saved.)';
      }
      void queryClient.invalidateQueries({ queryKey: ['inventory-search'] });
      void queryClient.invalidateQueries({ queryKey: ['inventory-search-items'] });
      void queryClient.invalidateQueries({ queryKey: ['add-item-find'] });
      setDone({ result: data, printed, printFailed, triedPrint: printLabels });
      setStep('done');
      if (data.restoration_job_id) setGradeJobId(data.restoration_job_id);
    } catch (err) {
      enqueueSnackbar(apiErrorDetail(err, 'Check-in failed.'), { variant: 'error' });
    } finally {
      setBusy(false);
    }
  }

  function submit(printLabels: boolean) {
    if (form && isLargeCheckIn(quantityOf(form))) {
      setVolumeConfirm(printLabels);
      return;
    }
    void runCheckIn(printLabels);
  }

  async function printAgain() {
    if (!done) return;
    const labels = printedPreviewToLabelInputs(done.result.printed_items_preview);
    const result = await printProcessingLabelsAndMarkPrinted(labels);
    setDone({ ...done, printFailed: result.failed > 0, triedPrint: true,
      printed: result.failed ? `Printed ${result.succeeded} of ${labels.length} tags.` : `Printed ${result.succeeded} tags.` });
  }

  const sameAgain = () => {
    if (!picked || !done) return;
    toCheckIn({ kind: 'existing', product: pickedAsRow(picked, done.result.product_id) });
    setDone(null);
  };

  return (
    <>
      <Dialog
        open={open}
        onClose={busy ? undefined : onClose}
        fullScreen={phone}
        fullWidth
        maxWidth="lg"
        PaperProps={{ sx: phone ? {} : { height: 'min(780px, calc(100vh - 64px))', maxWidth: 1080 } }}
        aria-labelledby="add-item-title"
      >
        <Stack direction="row" alignItems="center" spacing={1}
          sx={{ px: { xs: 2, sm: 3 }, py: 1.25, borderBottom: 1, borderColor: 'divider', flexShrink: 0 }}>
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography id="add-item-title" variant="h6" sx={{ fontWeight: 800, lineHeight: 1.15 }}>Add item</Typography>
            <Typography variant="caption" color="text.secondary">
              {STEP_TITLE[step]} · Misfit: no purchase order
            </Typography>
          </Box>
          <IconButton aria-label="Close Add item" onClick={onClose} disabled={busy}><IconClose /></IconButton>
        </Stack>

        <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          {step === 'find' && (
            <AddItemFindStep
              initialQuery={query}
              onUse={(row, q) => {
                setQuery(q);
                toCheckIn({ kind: 'existing', product: row });
              }}
              onCopy={(row, q) => startNew(specFromProduct(row), row, q)}
              onAiFill={(q) => startNew(emptySpec('ai'), null, q)}
              onTypeIt={(q) => startNew(emptySpec('typed', q), null, q)}
            />
          )}
          {step === 'new' && (
            <AddItemNewProductStep
              spec={spec}
              onSpecChange={setSpec}
              photo={photo}
              onPhotoChange={setPhoto}
              copiedFrom={copiedFrom}
              roughTitle={query}
              onBack={() => setStep('find')}
              onNext={() => toCheckIn({ kind: 'new', spec, photo })}
            />
          )}
          {step === 'checkin' && picked && form && (
            <AddItemCheckInStep
              picked={picked}
              form={form}
              onFormChange={setForm}
              busy={busy}
              onChangeProduct={() => setStep(picked.kind === 'new' ? 'new' : 'find')}
              onSubmit={submit}
            />
          )}
          {step === 'done' && done && (
            <Box sx={{ flex: 1, overflowY: 'auto', px: { xs: 2, sm: 3 }, py: 4, textAlign: 'center' }}>
              <CheckCircleOutline color="success" sx={{ fontSize: 56 }} />
              <Typography variant="h6" sx={{ fontWeight: 800 }}>
                Checked in {done.result.created_count} item{done.result.created_count === 1 ? '' : 's'}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                Misfit items on {done.result.order_number}. {done.printed}
              </Typography>
              <Stack direction="row" spacing={0.75} justifyContent="center" flexWrap="wrap" useFlexGap sx={{ mb: 3 }}>
                {done.result.skus.slice(0, 12).map((sku) => <Chip key={sku} size="small" label={sku} />)}
                {done.result.skus.length > 12 && <Chip size="small" label={`+${done.result.skus.length - 12} more`} />}
              </Stack>
              {done.result.restoration_job_id && (
                <Typography variant="body2" sx={{ mb: 2 }}>
                  It is in the Restoration queue with your estimates.{' '}
                  <Button size="small" onClick={() => setGradeJobId(done.result.restoration_job_id)}>Grade it now</Button>
                </Typography>
              )}
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} justifyContent="center">
                <Button variant={done.printFailed ? 'contained' : 'outlined'} startIcon={<IconPrint />} onClick={() => void printAgain()}>
                  {done.triedPrint ? 'Print the tags again' : 'Print the tags'}
                </Button>
                <Button variant="outlined" onClick={sameAgain}>More of the same</Button>
                <Button variant="contained" onClick={() => restart()}>Add another item</Button>
                <Button onClick={onClose}>Close</Button>
              </Stack>
            </Box>
          )}
        </Box>
      </Dialog>

      <LargeCheckInConfirmDialog
        open={volumeConfirm != null}
        quantity={form ? quantityOf(form) : 1}
        printLabels={volumeConfirm === true}
        loading={busy}
        onCancel={() => setVolumeConfirm(null)}
        onConfirm={() => {
          const printLabels = volumeConfirm === true;
          setVolumeConfirm(null);
          void runCheckIn(printLabels);
        }}
      />
      {retailCheck.dialog}
      <TarsQuickGradeDialog open={gradeJobId != null} jobId={gradeJobId} onClose={() => setGradeJobId(null)} />
    </>
  );
}
