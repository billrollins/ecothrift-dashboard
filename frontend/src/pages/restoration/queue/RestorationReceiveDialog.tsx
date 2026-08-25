/**
 * Processing taking a Done restoration item — and any extra parts — back in.
 *
 * The Receive tab is split: static above (what restoration handed over and the grade
 * ladder they were priced against) and the check-in for whatever is in hand below it.
 * Notes and Actions are full-dialog tabs, the same pair the Finish form has.
 *
 * Check-in work is tinted cards so each task is its own block. Every row has
 * a reserved size so stepping between the main item and a salvaged part never
 * moves a control. Nothing inside the dialog scrolls.
 */
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Tab,
  Tabs,
  Typography,
} from '@mui/material';
import { useEffect, useMemo, useState } from 'react';
import type { PrintedItemPreview } from '../../../api/inventory.api';
import { printedPreviewToLabelInputs } from '../../../hooks/useProcessingWorkspace';
import type {
  ItemCondition,
  Product,
  RestorationJobDTO,
  RestorationJobProcessingCheckInPayload,
} from '../../../types/inventory.types';
import { printProcessingLabelsAndMarkPrinted } from '../../inventory/processing/printProcessingLabel';
import {
  normalizeProcessingCondition,
  normalizeProcessingDispatch,
  processingDispatchLabel,
} from '../../inventory/processing/processingItemFormOptions';
import { ReceiveCheckInForm } from './ReceiveCheckInForm';
import { ReceiveGradesCard } from './ReceiveGradesCard';
import { ReceiveHistoryPanes, type ReceiveTab } from './ReceiveHistoryPanes';
import { ReceiveItemCard } from './ReceiveItemCard';
import { type ReceiveProductMode } from './ReceiveProductPicker';
import {
  buildReceivePartPayloads,
  destinationToDispatch,
  emptyNewProductDraft,
  familyAfterReceive,
  money,
  receiveDefaultPrice,
  receiveDefaultRetail,
  receiveIsSalvage,
  receivePriceReady,
  receiveProductReady,
  receiveReady,
  receiveStartingRetail,
  splitBalances,
  type ReceiveNewProductDraft,
  type ReceiveProductChoice,
  type RestorationReceiveSubmit,
} from './restorationReceive';

const STATIC_CARD_HEIGHT = 186;
const STEP_RAIL_HEIGHT = 26;
/** Tall enough for the receive form. The dialog grows; nothing inside it scrolls. */
const BODY_HEIGHT = 'min(760px, calc(100vh - 108px))';
const TAB_SX = { textTransform: 'none' as const, fontWeight: 800, minHeight: 40 };

type PartDraft = {
  outputId: number;
  label: string;
  description: string;
  mode: ReceiveProductMode;
  product: Product | null;
  draft: ReceiveNewProductDraft;
  price: string;
  retail: string;
  condition: ItemCondition;
  dispatch: string;
  saidDispatch: string;
  notes: string;
  specifications: Record<string, string>;
};

function defaultDispatch(job: RestorationJobDTO): string {
  return normalizeProcessingDispatch(destinationToDispatch(job.bench_disposition));
}

function mainItemIds(job: RestorationJobDTO): number[] {
  const mains = job.items.filter((item) => !item.parent_item_id);
  return (mains.length > 0 ? mains : job.items).map((item) => item.id);
}

function choiceFrom(
  mode: ReceiveProductMode,
  product: Product | null,
  draft: ReceiveNewProductDraft,
): ReceiveProductChoice {
  if (mode === 'keep') return { mode: 'keep' };
  if (mode === 'none') return { mode: 'none' };
  if (mode === 'existing') return { mode: 'existing', productId: product?.id ?? 0 };
  return { mode: 'new', ...draft };
}

function jobProductSummary(job: RestorationJobDTO) {
  return {
    id: job.product_id ?? undefined,
    product_number: job.product_number,
    title: job.name,
    brand: job.brand,
    model: job.model,
  };
}

export function RestorationReceiveDialog({
  open,
  job,
  busy,
  onCancel,
  onSubmit,
}: {
  open: boolean;
  job: RestorationJobDTO | null;
  busy?: boolean;
  onCancel: () => void;
  onSubmit: (submit: RestorationReceiveSubmit) => Promise<void>;
}) {
  const [tab, setTab] = useState<ReceiveTab>('receive');
  const [step, setStep] = useState(0);
  const [price, setPrice] = useState('');
  const [retail, setRetail] = useState('');
  const [condition, setCondition] = useState<ItemCondition>('good');
  const [dispatch, setDispatch] = useState('on_shelf');
  const [notes, setNotes] = useState('');
  const [specifications, setSpecifications] = useState<Record<string, string>>({});
  const [mainMode, setMainMode] = useState<ReceiveProductMode>('keep');
  const [mainProduct, setMainProduct] = useState<Product | null>(null);
  const [mainDraft, setMainDraft] = useState<ReceiveNewProductDraft>(emptyNewProductDraft());
  const [parts, setParts] = useState<PartDraft[]>([]);

  useEffect(() => {
    if (!open || !job) return;
    const pending = (job.outputs ?? []).filter((row) => row.seq > 0 && !row.item_id);
    const mainDispatch = defaultDispatch(job);
    const mainSalvage = receiveIsSalvage(mainDispatch, job.condition);
    const saidList = pending.map((row) =>
      normalizeProcessingDispatch(destinationToDispatch(row.destination || job.bench_disposition)),
    );
    setTab('receive');
    setStep(0);
    setPrice(mainSalvage ? '0.00' : receiveDefaultPrice(job));
    setRetail(mainSalvage ? '0.00' : receiveDefaultRetail(job));
    setCondition(normalizeProcessingCondition(job.condition));
    setDispatch(mainDispatch);
    setNotes('');
    setSpecifications({});
    setMainMode('keep');
    setMainProduct(null);
    setMainDraft(emptyNewProductDraft());
    setParts(
      pending.map((row, index) => {
        const said = saidList[index] ?? 'on_shelf';
        const salvage = receiveIsSalvage(said);
        return {
          outputId: row.id,
          label: row.label,
          description: row.notes,
          mode: salvage ? ('none' as const) : ('existing' as const),
          product: null,
          draft: emptyNewProductDraft(),
          price: salvage ? '0.00' : receiveDefaultPrice(job),
          retail: salvage ? '0.00' : receiveDefaultRetail(job),
          condition: salvage ? 'salvage' : normalizeProcessingCondition(job.condition),
          dispatch: said,
          saidDispatch: said,
          notes: row.notes,
          specifications: {},
        };
      }),
    );
  }, [open, job]);

  const start = job ? receiveStartingRetail(job) : 0;
  const mainChoice = choiceFrom(mainMode, mainProduct, mainDraft);
  const partChoices = parts.map((part) => ({
    product: choiceFrom(part.mode, part.product, part.draft),
    price: part.price,
    retail: part.retail,
    dispatch: part.dispatch,
  }));
  const canSubmit = receiveReady({
    mainPrice: price,
    mainProduct: mainChoice,
    mainDispatch: dispatch,
    parts: partChoices,
    startingRetail: start,
  });
  const currentPart = step > 0 ? parts[step - 1] : null;
  const currentChoice = currentPart
    ? choiceFrom(currentPart.mode, currentPart.product, currentPart.draft)
    : mainChoice;
  const currentSalvage = currentPart
    ? receiveIsSalvage(currentPart.dispatch, currentPart.condition)
    : receiveIsSalvage(dispatch, condition);
  const currentPriceReady = currentSalvage
    ? true
    : currentPart
      ? receivePriceReady(currentPart.price)
      : receivePriceReady(price);
  const currentProductReady = currentSalvage ? true : receiveProductReady(currentChoice);
  const stepReady = currentSalvage
    ? true
    : currentPart
      ? currentProductReady && currentPriceReady && money(currentPart.retail) > 0
      : currentProductReady && currentPriceReady;

  const labels = useMemo(
    () => ['Main item', ...parts.map((part) => part.label || 'Additional')],
    [parts],
  );

  if (!job) return null;

  const submitting = Boolean(busy);
  const lastStep = parts.length;
  const hasAdditionals = parts.length > 0;

  function patchPart(index: number, partial: Partial<PartDraft>) {
    setParts((prev) => prev.map((row, i) => (i === index ? { ...row, ...partial } : row)));
  }

  function applyGradePrice(next: string) {
    if (currentSalvage) return;
    if (step === 0) {
      setPrice(next);
      return;
    }
    patchPart(step - 1, { price: next });
  }

  async function submit(print: boolean) {
    if (!job || !canSubmit || submitting) return;
    const mainSalvage = receiveIsSalvage(dispatch, condition);
    const main: RestorationJobProcessingCheckInPayload = {
      price: mainSalvage ? '0.00' : price,
      retail: mainSalvage ? '0.00' : retail.trim() || null,
      condition,
      dispatch: mainSalvage ? 'salvage' : dispatch,
      notes: notes.trim(),
      specifications,
    };
    await onSubmit({
      main,
      mainProduct: mainChoice,
      mainItemIds: mainItemIds(job),
      parts: buildReceivePartPayloads(
        start,
        parts.map((part) => ({
          outputId: part.outputId,
          product: choiceFrom(part.mode, part.product, part.draft),
          retail: part.retail,
          price: part.price,
          condition: part.condition,
          dispatch: part.dispatch,
          notes: part.notes,
          specifications: part.specifications,
        })),
      ),
      print,
    });
  }

  return (
    <Dialog
      open={open}
      onClose={submitting ? undefined : onCancel}
      maxWidth={false}
      fullWidth
      PaperProps={{
        sx: {
          width: 'min(940px, calc(100vw - 16px))',
          maxHeight: 'calc(100vh - 8px)',
          overflow: 'hidden',
          borderRadius: 3,
        },
      }}
    >
      <DialogTitle sx={{ px: 2, py: 0.75, borderBottom: '1px solid #e2e8f0' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, height: 28, minHeight: 28 }}>
          <Typography sx={{ flexShrink: 0, fontWeight: 900, fontSize: '1.02rem', lineHeight: '28px' }}>
            Check in from Restoration
          </Typography>
          {hasAdditionals ? (
            <Box sx={{ ml: 'auto', flex: 1, minWidth: 0, maxWidth: 620 }}>
              <StepPills labels={labels} step={step} onStep={setStep} />
            </Box>
          ) : (
            <Typography noWrap sx={{ ml: 'auto', fontSize: '0.78rem', fontWeight: 800, color: '#65748a' }}>
              One item to receive
            </Typography>
          )}
        </Box>
      </DialogTitle>

      <DialogContent sx={{ p: 0, overflow: 'hidden' }}>
        <Box sx={{ px: 2, borderBottom: '1px solid #e2e8f0' }}>
          <Tabs
            value={tab}
            onChange={(_event, next: ReceiveTab) => setTab(next)}
            aria-label="Receive sections"
            sx={{ minHeight: 40 }}
          >
            <Tab value="receive" label="Receive" sx={TAB_SX} />
            <Tab value="notes" label="Notes" sx={TAB_SX} />
            <Tab value="actions" label="Actions" sx={TAB_SX} />
          </Tabs>
        </Box>

        <Box sx={{ height: BODY_HEIGHT, minHeight: BODY_HEIGHT, px: 2, py: 1.25, overflow: 'hidden' }}>
          <Box
            role="tabpanel"
            hidden={tab !== 'receive'}
            sx={{
              height: '100%',
              minHeight: 0,
              overflow: 'hidden',
              display: tab === 'receive' ? 'block' : 'none',
            }}
          >
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: 'minmax(0, 1.15fr) minmax(0, 1fr)',
                gap: 1,
                mb: 1,
              }}
            >
              <ReceiveItemCard job={job} height={STATIC_CARD_HEIGHT} />
              <ReceiveGradesCard
                job={job}
                height={STATIC_CARD_HEIGHT}
                onUsePrice={applyGradePrice}
                disabled={submitting}
              />
            </Box>
            {currentPart ? (
              <ReceiveCheckInForm
                key={`part-${currentPart.outputId}`}
                title={currentPart.label || 'Additional'}
                picker={{
                  kind: 'part',
                  scope: `restoration-receive-part-${currentPart.outputId}`,
                  current: null,
                  mode: currentPart.mode,
                  onModeChange: (mode) => patchPart(step - 1, { mode }),
                  existing: currentPart.product,
                  onExistingChange: (product) => patchPart(step - 1, { product }),
                  draft: currentPart.draft,
                  onDraftChange: (draft) => patchPart(step - 1, { draft }),
                  disabled: submitting,
                }}
                condition={currentPart.condition}
                onConditionChange={(value) =>
                  patchPart(
                    step - 1,
                    value === 'salvage'
                      ? { condition: value, dispatch: 'salvage', mode: 'none', price: '0.00', retail: '0.00' }
                      : { condition: value },
                  )
                }
                dispatch={currentPart.dispatch}
                onDispatchChange={(value) =>
                  patchPart(
                    step - 1,
                    receiveIsSalvage(value)
                      ? { dispatch: 'salvage', mode: 'none', price: '0.00', retail: '0.00' }
                      : {
                          dispatch: value,
                          mode: currentPart.mode === 'none' ? 'existing' : currentPart.mode,
                        },
                  )
                }
                saidDispatch={processingDispatchLabel(currentPart.saidDispatch)}
                retail={currentPart.retail}
                onRetailChange={(value) => patchPart(step - 1, { retail: value })}
                price={currentPart.price}
                onPriceChange={(value) => patchPart(step - 1, { price: value })}
                notes={currentPart.notes}
                onNotesChange={(value) => patchPart(step - 1, { notes: value })}
                specifications={currentPart.specifications}
                onSpecificationsChange={(value) => patchPart(step - 1, { specifications: value })}
                skipCatalog={currentSalvage}
                skipMoney={currentSalvage}
                salvageHint="$0.00 · retail stays on the main item"
                disabled={submitting}
              />
            ) : (
              <ReceiveCheckInForm
                key="main"
                title="Main item"
                picker={{
                  kind: 'main',
                  scope: `restoration-receive-main-${job.id}`,
                  current: jobProductSummary(job),
                  mode: mainMode,
                  onModeChange: setMainMode,
                  existing: mainProduct,
                  onExistingChange: setMainProduct,
                  draft: mainDraft,
                  onDraftChange: setMainDraft,
                  disabled: submitting,
                }}
                condition={condition}
                onConditionChange={(value) => {
                  setCondition(value);
                  if (value === 'salvage') {
                    setDispatch('salvage');
                    setPrice('0.00');
                    setRetail('0.00');
                  }
                }}
                dispatch={dispatch}
                onDispatchChange={(value) => {
                  setDispatch(value);
                  if (receiveIsSalvage(value)) {
                    setPrice('0.00');
                    setRetail('0.00');
                  }
                }}
                saidDispatch={processingDispatchLabel(defaultDispatch(job))}
                retail={retail}
                onRetailChange={setRetail}
                price={price}
                onPriceChange={setPrice}
                notes={notes}
                onNotesChange={setNotes}
                specifications={specifications}
                onSpecificationsChange={setSpecifications}
                skipMoney={currentSalvage}
                salvageHint="$0.00 · no shelf price"
                disabled={submitting}
              />
            )}
          </Box>

          <ReceiveHistoryPanes job={job} open={open} tab={tab} />
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 2, py: 1, gap: 1, borderTop: '1px solid #e2e8f0' }}>
        <Button onClick={onCancel} disabled={submitting}>
          Cancel
        </Button>
        {hasAdditionals ? (
          <>
            <ReceiveSplitRail
              starting={start}
              mainRetail={money(retail)}
              parts={parts.map((part) => ({ label: part.label, retail: money(part.retail) }))}
            />
            <Button disabled={submitting || step === 0} onClick={() => setStep((prev) => Math.max(0, prev - 1))}>
              Back
            </Button>
            <Button
              disabled={submitting || step === lastStep || !stepReady}
              onClick={() => setStep((prev) => Math.min(lastStep, prev + 1))}
            >
              Next
            </Button>
          </>
        ) : (
          <Box sx={{ flex: 1 }} />
        )}
        <Button variant="outlined" disabled={!canSubmit || submitting} onClick={() => void submit(false)}>
          Receive
        </Button>
        <Button variant="contained" disabled={!canSubmit || submitting} onClick={() => void submit(true)}>
          Receive &amp; print
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function StepPills({
  labels,
  step,
  onStep,
}: {
  labels: string[];
  step: number;
  onStep: (index: number) => void;
}) {
  return (
    <Box sx={{ display: 'flex', gap: 0.5, height: STEP_RAIL_HEIGHT, minHeight: STEP_RAIL_HEIGHT }}>
      {labels.map((label, index) => {
        const active = index === step;
        const finished = index < step;
        return (
          <Box
            key={index === 0 ? 'main' : `part-${index}`}
            component="button"
            type="button"
            disabled={index > step}
            onClick={() => onStep(index)}
            title={label}
            sx={{
              flex: 1,
              minWidth: 0,
              px: 1,
              height: STEP_RAIL_HEIGHT,
              borderRadius: 999,
              border: `1px solid ${active ? '#2e7d32' : finished ? '#86a789' : '#d5ddd6'}`,
              bgcolor: active ? '#2e7d32' : finished ? '#eef6ef' : '#f4f7f5',
              color: active ? '#fff' : finished ? '#355c3a' : '#64748b',
              fontWeight: 800,
              fontSize: '0.72rem',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              cursor: index <= step ? 'pointer' : 'default',
            }}
          >
            {label}
          </Box>
        );
      })}
    </Box>
  );
}

/** How the item's retail is being carved up, sat in the footer so it costs no height. */
function ReceiveSplitRail({
  starting,
  mainRetail,
  parts,
}: {
  starting: number;
  mainRetail: number;
  parts: Array<{ label: string; retail: number }>;
}) {
  const partRetails = parts.map((part) => part.retail);
  const family = familyAfterReceive(mainRetail, partRetails);
  const balanced = splitBalances(starting, mainRetail, partRetails);
  const scale = Math.max(starting, family, 0.01);
  const drift = Math.round((family - starting) * 100) / 100;
  const segments = [
    { label: 'Main', amount: mainRetail, color: '#2e7d32' },
    ...parts.map((part, index) => ({
      label: part.label || 'Additional',
      amount: part.retail,
      color: index % 2 === 0 ? '#1d4ed8' : '#0f766e',
    })),
  ];
  const tip = balanced
    ? segments.map((segment) => `${segment.label} $${segment.amount.toFixed(2)}`).join(' · ')
    : drift > 0
      ? `Over the item's retail by $${drift.toFixed(2)}`
      : `Under the item's retail by $${Math.abs(drift).toFixed(2)}`;

  return (
    <Box
      title={tip}
      sx={{ flex: 1, minWidth: 160, display: 'flex', alignItems: 'center', gap: 1.25, mx: 1.5 }}
    >
      <Box
        sx={{
          flex: 1,
          minWidth: 48,
          height: 12,
          borderRadius: 999,
          overflow: 'hidden',
          bgcolor: '#e8eee9',
          display: 'flex',
        }}
      >
        {segments.map((segment, index) => (
          <Box
            key={`${segment.label}-${index}`}
            sx={{
              width: `${(Math.max(segment.amount, 0) / scale) * 100}%`,
              bgcolor: segment.color,
              minWidth: segment.amount > 0 ? 4 : 0,
            }}
          />
        ))}
      </Box>
      <Typography
        noWrap
        sx={{
          flexShrink: 0,
          fontSize: '0.76rem',
          fontWeight: 800,
          fontVariantNumeric: 'tabular-nums',
          color: balanced ? '#334155' : '#c2410c',
        }}
      >
        {`$${family.toFixed(2)} of $${starting.toFixed(2)} retail`}
      </Typography>
    </Box>
  );
}

export async function printRestorationReceiveLabels(preview: PrintedItemPreview[]) {
  if (preview.length === 0) return;
  await printProcessingLabelsAndMarkPrinted(printedPreviewToLabelInputs(preview));
}
