/**
 * The Truck Plan window (Dash Updates #81): the plan for one order's truck, filled in before processing starts.
 * Opened from the load description at the top of Processing and from the Order window. It never blocks processing.
 *
 * Left: the plan (pricing start, what to watch for, who is on it, dispute due, known issues), saved by any staff.
 * Right: the money (Paid, Target, On track) and the disputes so far, the same numbers as the top of Processing.
 * Only a superuser can change the Target Price total; everyone sees it.
 * Data: GET / PUT /api/inventory/orders/<id>/truck-plan/ and POST .../truck-plan/target/ (services/truck_plan.py).
 */
import { useEffect, useState } from 'react';
import {
  Alert, Autocomplete, Box, Button, Chip, CircularProgress, InputAdornment, Link, Stack, TextField, Typography,
} from '@mui/material';
import type { TruckPlanDTO, TruckPlanWindowDTO } from '../../api/truckPlan.api';
import { useSaveTruckPlan, useSetTruckTarget, useTruckPlanWindow } from '../../hooks/useTruckPlan';
import {
  count, disputeDetail, disputeDueLabel, money, overUnder, shortDay, worthSum,
} from '../../pages/inventory/processing/truckSummaryDisplay';
import { itemCardWhen } from './itemCardData';
import { useObjectModal } from './ObjectModal';
import { Facts, Section, Stat } from './windowParts';

interface PlanForm {
  pricing_start_pct: string;
  watch_for: string;
  known_issues: string;
  crew: { id: number; name: string }[];
  dispute_due_date: string;
}

function formFrom(plan: TruckPlanDTO | null): PlanForm {
  return {
    pricing_start_pct: plan?.pricing_start_pct ?? '',
    watch_for: plan?.watch_for ?? '',
    known_issues: plan?.known_issues ?? '',
    crew: plan?.crew ?? [],
    dispute_due_date: plan?.dispute_due_date ?? '',
  };
}

function errorText(e: unknown, fallback: string): string {
  const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
  return typeof detail === 'string' && detail ? detail : fallback;
}

function PlanEditor({ orderId, data }: { orderId: number; data: TruckPlanWindowDTO }) {
  const save = useSaveTruckPlan(orderId);
  const [form, setForm] = useState<PlanForm>(() => formFrom(data.plan));
  const [dirty, setDirty] = useState(false);
  const stamp = data.plan?.updated_at ?? '';
  // A save (here or by someone else) brings the saved plan back in, unless this person is mid-edit.
  useEffect(() => {
    if (!dirty) setForm(formFrom(data.plan));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the saved plan changes
  }, [stamp]);
  const set = <K extends keyof PlanForm>(key: K, value: PlanForm[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setDirty(true);
  };
  const defaultDue = data.dates.dispute_due_from_plan ? null : data.dates.dispute_due;

  return (
    <Section title="The plan">
      <Stack spacing={1.75}>
        {!data.plan ? (
          <Alert severity="info" sx={{ py: 0 }}>
            No truck plan yet. Write what you know and save. Processing can start without it.
          </Alert>
        ) : null}
        <TextField
          label="Pricing start"
          size="small"
          value={form.pricing_start_pct}
          onChange={(e) => set('pricing_start_pct', e.target.value)}
          helperText="Where tags start on this truck, as a share of retail. It prices lines that have no price yet."
          slotProps={{
            input: { endAdornment: <InputAdornment position="end">% of retail</InputAdornment> },
            htmlInput: { inputMode: 'decimal', 'aria-label': 'Pricing start, percent of retail' },
          }}
          sx={{ maxWidth: 260 }}
        />
        <TextField
          label="Watch for"
          size="small"
          multiline
          minRows={2}
          value={form.watch_for}
          onChange={(e) => set('watch_for', e.target.value)}
          helperText="What a processor should look out for on this truck."
        />
        <Autocomplete
          multiple
          size="small"
          options={data.staff}
          value={form.crew}
          onChange={(_e, value) => set('crew', value)}
          getOptionLabel={(o) => o.name}
          isOptionEqualToValue={(a, b) => a.id === b.id}
          renderInput={(params) => <TextField {...params} label="Who is on it" />}
        />
        <TextField
          label="Dispute due"
          size="small"
          type="date"
          value={form.dispute_due_date}
          onChange={(e) => set('dispute_due_date', e.target.value)}
          helperText={
            defaultDue
              ? `Leave empty for ${data.dates.dispute_business_days} business days after delivery (${shortDay(defaultDue)}).`
              : `Leave empty for ${data.dates.dispute_business_days} business days after delivery.`
          }
          slotProps={{ inputLabel: { shrink: true } }}
          sx={{ maxWidth: 260 }}
        />
        <TextField
          label="Known issues"
          size="small"
          multiline
          minRows={2}
          value={form.known_issues}
          onChange={(e) => set('known_issues', e.target.value)}
          helperText="Anything wrong with the truck or the order that everyone should know."
        />
        {save.isError ? <Alert severity="error">{errorText(save.error, 'The plan could not be saved.')}</Alert> : null}
        <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap>
          <Button
            variant="contained"
            disabled={save.isPending || (!dirty && Boolean(data.plan))}
            onClick={() =>
              save.mutate(
                {
                  pricing_start_pct: form.pricing_start_pct.trim() || null,
                  watch_for: form.watch_for,
                  known_issues: form.known_issues,
                  crew_ids: form.crew.map((c) => c.id),
                  dispute_due_date: form.dispute_due_date || null,
                },
                { onSuccess: (saved) => { setForm(formFrom(saved.plan)); setDirty(false); } },
              )
            }
          >
            {save.isPending ? 'Saving' : 'Save the plan'}
          </Button>
          {data.plan?.updated_at ? (
            <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>
              Saved{data.plan.updated_by ? ` by ${data.plan.updated_by}` : ''}, {itemCardWhen(data.plan.updated_at)}
            </Typography>
          ) : null}
        </Stack>
      </Stack>
    </Section>
  );
}

function TargetEditor({ orderId, data }: { orderId: number; data: TruckPlanWindowDTO }) {
  const setTarget = useSetTruckTarget(orderId);
  const t = data.target;
  const [text, setText] = useState(t.is_default ? '' : t.total ?? '');
  useEffect(() => {
    setText(t.is_default ? '' : t.total ?? '');
  }, [t.is_default, t.total]);

  return (
    <Stack spacing={1} sx={{ mt: 1.5, pt: 1.5, borderTop: 1, borderColor: 'divider' }}>
      <Typography sx={{ fontSize: 13, fontWeight: 700 }}>Change the target (superuser)</Typography>
      <Stack direction="row" spacing={1} alignItems="flex-start" flexWrap="wrap" useFlexGap>
        <TextField
          label="Target total"
          size="small"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t.default ?? ''}
          slotProps={{
            input: { startAdornment: <InputAdornment position="start">$</InputAdornment> },
            htmlInput: { inputMode: 'decimal', 'aria-label': 'Target total' },
          }}
          sx={{ width: 180 }}
        />
        <Button variant="contained" disabled={setTarget.isPending || !text.trim()} onClick={() => setTarget.mutate(text.trim())}>
          Set target
        </Button>
        {!t.is_default ? (
          <Button disabled={setTarget.isPending} onClick={() => setTarget.mutate(null)}>
            Back to 2 x Paid
          </Button>
        ) : null}
      </Stack>
      {setTarget.isError ? <Alert severity="error">{errorText(setTarget.error, 'The target could not be saved.')}</Alert> : null}
    </Stack>
  );
}

function PlanView({ orderId, data }: { orderId: number; data: TruckPlanWindowDTO }) {
  const { openObject } = useObjectModal();
  const t = data.target;
  const on = data.on_track;
  const d = data.disputes;
  const vs = overUnder(on.vs_target);
  const due = disputeDueLabel(data.dates);
  const rateFrom = on.rate_basis === 'plan' ? "the plan's pricing start" : 'this truck so far';

  return (
    <Stack spacing={2} sx={{ p: { xs: 1.5, md: 2.5 } }}>
      <Stack spacing={0.5}>
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
          <Link
            component="button"
            type="button"
            underline="hover"
            onClick={() => openObject({ type: 'order', id: orderId })}
            sx={{ fontFamily: 'monospace', fontWeight: 900, fontSize: { xs: 14, md: 15 } }}
          >
            {data.order.order_number}
          </Link>
          {data.order.vendor ? <Chip size="small" label={data.order.vendor} variant="outlined" /> : null}
        </Stack>
        <Typography component="h2" sx={{ fontWeight: 800, fontSize: { xs: 18, md: 22 }, lineHeight: 1.2 }}>
          {data.order.description || 'Truck plan'}
        </Typography>
        <Stack direction="row" spacing={{ xs: 2, md: 3 }} sx={{ pt: 0.5 }} flexWrap="wrap" useFlexGap>
          <Stat label="Paid" value={money(data.paid.total)} />
          <Stat label="Target" value={money(t.total)} />
          <Stat label="On track" value={money(on.total)} muted />
          <Stat
            label="Against the target"
            value={<Box component="span" sx={{ color: vs.tone === 'good' ? 'success.main' : vs.tone === 'warning' ? 'warning.dark' : undefined }}>{vs.text}</Box>}
          />
        </Stack>
      </Stack>

      <Box sx={{ display: 'grid', gap: 2, alignItems: 'start', gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1.1fr) minmax(0, 1fr)' } }}>
        <Stack spacing={2} sx={{ minWidth: 0 }}>
          <PlanEditor orderId={orderId} data={data} />
          {data.order.notes ? (
            <Section title="Order notes">
              <Typography sx={{ fontSize: 14, whiteSpace: 'pre-wrap' }}>{data.order.notes}</Typography>
            </Section>
          ) : null}
        </Stack>
        <Stack spacing={2} sx={{ minWidth: 0 }}>
          <Section title="Money">
            <Facts rows={[
              ['Price', money(data.paid.price)],
              ['Fees', money(data.paid.fees)],
              ['Shipping', money(data.paid.shipping)],
              ['Paid', <b key="paid">{money(data.paid.total)}</b>],
              ['Target', (
                <span key="target">
                  <b>{money(t.total)}</b>{' '}
                  {t.is_default
                    ? '(2 x Paid)'
                    : `(set by ${t.set_by || 'a superuser'}${t.set_at ? `, ${shortDay(t.set_at)}` : ''}; 2 x Paid is ${money(t.default)})`}
                </span>
              )],
              ['Tags so far', `${money(on.priced_so_far)} on ${count(on.priced_items)} ${on.priced_items === 1 ? 'item' : 'items'}`],
              ['The rest', `${money(on.estimated_left)} estimated for ${count(on.units_left)} ${on.units_left === 1 ? 'unit' : 'units'} on lines still open`],
              ['How', [
                on.units_own_price ? `${count(on.units_own_price)} at the price on the line` : '',
                on.units_by_rate && on.rate_pct != null ? `${count(on.units_by_rate)} at retail x ${on.rate_pct}% (${rateFrom})` : '',
                on.units_no_estimate ? `${count(on.units_no_estimate)} with no estimate yet` : '',
              ].filter(Boolean).join(', ') || null],
              ['On track', <b key="on">{money(on.total)}, {vs.text}</b>],
            ]} />
            {data.can_set_target ? <TargetEditor orderId={orderId} data={data} /> : null}
          </Section>
          <Section title="Disputes so far">
            <Facts rows={[
              ['Delivered', data.dates.delivered ? shortDay(data.dates.delivered) : null],
              ['Dispute due', due.value !== '-' ? due.value : null],
              ['Disputed', `${count(d.items)} ${d.items === 1 ? 'item' : 'items'}, ${money(d.retail)} retail`],
              ['5% line', d.threshold_retail != null ? `${money(d.threshold_retail)} (${count(d.threshold_pct)}% of ${money(d.truck_retail)} truck retail)` : null],
              ['Worth so far', <b key="worth">{money(d.worth)}</b>],
              ['The sum', worthSum(d)],
            ]} />
            <Box component="ul" sx={{ m: 0, mt: 1, pl: 2.25, fontSize: 13, color: 'text.secondary', '& li': { mb: 0.25 } }}>
              {disputeDetail(d).slice(0, 3).map((line) => <li key={line}>{line}</li>)}
              <li>Shipping is not in what a dispute is worth.</li>
            </Box>
          </Section>
        </Stack>
      </Box>
    </Stack>
  );
}

/** The Truck Plan window body; `orderId` is the order whose truck it plans. */
export function TruckPlanCardBody({ orderId }: { orderId: number }) {
  const { data, isLoading, isError } = useTruckPlanWindow(orderId);
  if (isLoading) return <CircularProgress size={28} sx={{ m: 4 }} />;
  if (isError || !data) return <Typography sx={{ p: 3 }}>This truck plan could not be loaded.</Typography>;
  return <PlanView orderId={orderId} data={data} />;
}
