import { useEffect, useMemo } from 'react';
import {
  Box, Button, Chip, CircularProgress, InputAdornment, Link, Stack, TextField, Typography,
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { getAddItemPrice } from '../../../api/addItem.api';
import { IconPrint } from '../../../icons/ecoIcons';
import type { ItemCondition } from '../../../types/inventory.types';
import { CheckInQtyStepper, CompactMoneyField, SegmentedOptionButtons } from '../workbench/CheckInDetailsLayout';
import { PROCESSING_ITEM_CONDITION_OPTIONS } from '../processing/processingItemFormOptions';
import { MAX_CHECK_IN_QUANTITY } from '../processing/largeCheckIn';
import { ProductPhoto } from './AddItemFindStep';
import {
  checkInProblems, DESTINATION_OPTIONS, formatMoney, money, pctOfRetail, productName, quantityOf, WORK_OPTIONS,
  type CheckInForm, type PickedProduct,
} from './addItemModel';

// Salvage is not something we add for sale.
const CONDITIONS = PROCESSING_ITEM_CONDITION_OPTIONS.filter((o) => o.value !== 'salvage');

function Label({ children }: { children: React.ReactNode }) {
  return (
    <Typography variant="caption" sx={{ display: 'block', fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase',
      fontSize: '0.62rem', color: 'text.secondary', mb: 0.5 }}>
      {children}
    </Typography>
  );
}

function PickedSummary({ picked, onChange }: { picked: PickedProduct; onChange: () => void }) {
  const p = picked.kind === 'existing' ? picked.product : null;
  const spec = picked.kind === 'new' ? picked.spec : null;
  const photoUrl = useMemo(() => (picked.kind === 'new' && picked.photo ? URL.createObjectURL(picked.photo) : null), [picked]);
  useEffect(() => () => {
    if (photoUrl) URL.revokeObjectURL(photoUrl);
  }, [photoUrl]);
  const name = p ? productName(p) : spec?.short_name || spec?.title || '';
  const line = p ? [p.brand, p.model].filter(Boolean).join(' · ') : [spec?.brand, spec?.model].filter(Boolean).join(' · ');
  const place = p ? [p.category, p.subcategory].filter(Boolean).join(' › ') : [spec?.category, spec?.subcategory].filter(Boolean).join(' › ');
  return (
    <Stack direction="row" spacing={1.5} alignItems="center" sx={{ p: 1.25, borderRadius: 1.5, border: 1, borderColor: 'divider' }}>
      <ProductPhoto url={p ? p.photo_url : photoUrl} size={64} />
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography variant="body1" sx={{ fontWeight: 800, lineHeight: 1.2 }} noWrap title={p?.title ?? spec?.title}>{name}</Typography>
        {line && <Typography variant="caption" color="text.secondary" noWrap component="div">{line}</Typography>}
        {place && <Typography variant="caption" color="text.disabled" noWrap component="div">{place}</Typography>}
        <Stack direction="row" spacing={0.75} sx={{ mt: 0.5 }} flexWrap="wrap" useFlexGap>
          {spec && <Chip size="small" color="success" variant="outlined" label="New product" />}
          {p && <Chip size="small" variant="outlined" label={`${p.sold} sold · ${p.on_shelf} on shelf`} />}
          <Chip size="small" variant="outlined" label="Misfit · no order" />
        </Stack>
      </Box>
      <Link component="button" type="button" onClick={onChange} sx={{ alignSelf: 'flex-start', fontSize: 13 }}>Change</Link>
    </Stack>
  );
}

/**
 * Step 3: check in. Quantity, condition and where it goes (Floor, Back stock, Restoration); the price comes with what
 * this product, or similar ones, sold for; the retail goes through the same retail check as Processing.
 */
export function AddItemCheckInStep({
  picked,
  form,
  onFormChange,
  busy,
  onChangeProduct,
  onSubmit,
}: {
  picked: PickedProduct;
  form: CheckInForm;
  onFormChange: (next: CheckInForm) => void;
  busy: boolean;
  onChangeProduct: () => void;
  onSubmit: (printLabels: boolean) => void;
}) {
  const set = (patch: Partial<CheckInForm>) => onFormChange({ ...form, ...patch });
  const params = picked.kind === 'existing'
    ? { product: picked.product.product_id }
    : { title: picked.spec.title, category: picked.spec.category };
  const price = useQuery({
    queryKey: ['add-item-price', params],
    queryFn: ({ signal }) => getAddItemPrice(params, signal),
    staleTime: 60_000,
  });
  const suggested = price.data?.price ?? null;
  // The suggestion fills an empty price once; the person can always change it.
  useEffect(() => {
    if (suggested && !form.price) onFormChange({ ...form, price: Number(suggested).toFixed(2) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggested]);

  const restoration = form.destination === 'restoration';
  const qty = quantityOf(form);
  const problems = checkInProblems(form);
  const pct = pctOfRetail(form.price, form.retail);
  const retailNote = form.retailFrom === 'estimate'
    ? (picked.kind === 'new' && picked.spec.how === 'ai' ? 'The AI’s estimate: you will be asked to confirm it.' : 'An estimate from a similar product: you will be asked to confirm it.')
    : form.retailFrom === 'product' ? 'What this product usually carries.' : 'Optional. It prints on the tag when it passes the retail check.';
  const toggleWork = (value: CheckInForm['work'][number]) => set({
    work: form.work.includes(value) ? form.work.filter((w) => w !== value) : [...form.work, value],
  });

  return (
    <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', px: { xs: 2, sm: 3 }, py: 2 }}>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'minmax(0, 1fr) minmax(0, 1fr)' }, gap: { xs: 2, md: 3 } }}>
          <Stack spacing={2}>
            <PickedSummary picked={picked} onChange={onChangeProduct} />
            <Box>
              <Label>Goes to</Label>
              <SegmentedOptionButtons
                label=""
                value={form.destination}
                options={DESTINATION_OPTIONS}
                onChange={(v) => set({ destination: v as CheckInForm['destination'], ...(v === 'restoration' ? { quantity: '1' } : {}) })}
                disabled={busy}
                fill
              />
            </Box>
            <Stack direction="row" spacing={2} alignItems="flex-end">
              <Box>
                <Label>Quantity</Label>
                <CheckInQtyStepper
                  quantity={form.quantity}
                  disabled={busy || restoration}
                  onChange={(v) => set({ quantity: v })}
                  onBlur={() => set({ quantity: String(Math.min(MAX_CHECK_IN_QUANTITY, qty)) })}
                  onBump={(d) => set({ quantity: String(Math.max(1, Math.min(MAX_CHECK_IN_QUANTITY, qty + d))) })}
                />
              </Box>
              {restoration && <Typography variant="caption" color="text.secondary" sx={{ pb: 0.75 }}>Restoration is one at a time.</Typography>}
            </Stack>
            <Box>
              <Label>Condition</Label>
              <SegmentedOptionButtons
                label=""
                value={form.condition}
                options={CONDITIONS}
                onChange={(v) => set({ condition: v as ItemCondition })}
                disabled={busy}
              />
            </Box>
          </Stack>

          <Stack spacing={2}>
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
              <CompactMoneyField label="Price" required value={form.price} onChange={(v) => set({ price: v })}
                error={!form.price.trim() ? false : money(form.price) == null} disabled={busy} />
              <CompactMoneyField label="Retail" value={form.retail}
                onChange={(v) => set({ retail: v, retailFrom: v.trim() ? 'typed' : '' })} disabled={busy} />
            </Box>
            <Box sx={{ minHeight: 64 }}>
              {price.isFetching && !price.data ? (
                <Typography variant="caption" color="text.secondary"><CircularProgress size={10} sx={{ mr: 0.75 }} />Looking up what it sold for…</Typography>
              ) : suggested ? (
                <Typography variant="body2">
                  Suggested <b>{formatMoney(suggested)}</b>
                  <Typography component="span" variant="caption" color="text.secondary">
                    {' '}· median of {price.data?.sold_count} sold ({price.data?.basis})
                  </Typography>
                  {form.price !== Number(suggested).toFixed(2) && (
                    <Link component="button" type="button" sx={{ ml: 1, fontSize: 13 }}
                      onClick={() => set({ price: Number(suggested).toFixed(2) })}>Use it</Link>
                  )}
                </Typography>
              ) : (
                <Typography variant="caption" color="text.secondary">No sales of this or similar products yet: price it by eye.</Typography>
              )}
              {price.data?.basis === 'similar items' && price.data.comps.length > 0 && (
                <Typography variant="caption" color="text.secondary" component="div" noWrap
                  title={price.data.comps.map((c) => `${c.title} (${c.sold} sold)`).join('\n')}>
                  Like: {price.data.comps.slice(0, 3).map((c) => c.title).join('; ')}
                </Typography>
              )}
              <Typography variant="caption" color="text.secondary" component="div">
                {pct != null ? `Price is ${pct}% of retail. ` : ''}{retailNote}
              </Typography>
            </Box>

            {restoration && (
              <Box sx={{ p: 1.5, borderRadius: 1.5, border: 1, borderColor: 'warning.light', bgcolor: 'rgba(237, 108, 2, 0.04)' }}>
                <Typography variant="body2" sx={{ fontWeight: 800, mb: 1 }}>Restoration estimates (required)</Typography>
                <Label>Work it needs</Label>
                <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap sx={{ mb: 1.5 }}>
                  {WORK_OPTIONS.map((w) => (
                    <Chip
                      key={w.value}
                      label={w.label}
                      color={form.work.includes(w.value) ? 'primary' : 'default'}
                      variant={form.work.includes(w.value) ? 'filled' : 'outlined'}
                      onClick={() => toggleWork(w.value)}
                      disabled={busy}
                    />
                  ))}
                </Stack>
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: '1fr 1fr 1fr' }, gap: 1.25 }}>
                  <TextField size="small" label="Hours" value={form.hours} onChange={(e) => set({ hours: e.target.value })}
                    inputProps={{ inputMode: 'decimal' }} disabled={busy} />
                  <TextField size="small" label="Parts cost" value={form.partsCost} onChange={(e) => set({ partsCost: e.target.value })}
                    InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }}
                    inputProps={{ inputMode: 'decimal' }} disabled={busy} />
                  <TextField size="small" label="Worth after" required value={form.valueAfter}
                    onChange={(e) => set({ valueAfter: e.target.value })}
                    InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }}
                    inputProps={{ inputMode: 'decimal' }} disabled={busy} sx={{ gridColumn: { xs: '1 / -1', sm: 'auto' } }} />
                </Box>
                <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 0.75 }}>
                  Hours or parts cost (or both). It goes to the Restoration queue with these.
                </Typography>
              </Box>
            )}

            <TextField size="small" label="Notes" placeholder="Optional"
              value={form.notes} onChange={(e) => set({ notes: e.target.value })} multiline minRows={2} disabled={busy} />
          </Stack>
        </Box>
      </Box>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={1}
        alignItems={{ xs: 'stretch', sm: 'center' }}
        sx={{ px: { xs: 2, sm: 3 }, py: 1.25, borderTop: 1, borderColor: 'divider', bgcolor: 'background.paper' }}
      >
        <Typography variant="caption" color={problems.length ? 'warning.main' : 'text.secondary'} sx={{ flex: 1, minHeight: 18 }}>
          {problems[0] ?? `${qty} item${qty === 1 ? '' : 's'} · Misfit · tags print the Processing way`}
        </Typography>
        <Button variant="outlined" disabled={busy || problems.length > 0} onClick={() => onSubmit(false)}>
          Check in without printing
        </Button>
        <Button
          variant="contained"
          startIcon={busy ? <CircularProgress size={16} color="inherit" /> : <IconPrint />}
          disabled={busy || problems.length > 0}
          onClick={() => onSubmit(true)}
        >
          Check in & print
        </Button>
      </Stack>
    </Box>
  );
}
