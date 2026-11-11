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
  Autocomplete, Box, Button, Chip, CircularProgress, InputAdornment, Link, Stack, TextField, Typography,
} from '@mui/material';
import type { TruckPlanDTO, TruckPlanWindowDTO } from '../../api/truckPlan.api';
import { useSaveTruckPlan, useSetTruckTarget, useTruckPlanWindow } from '../../hooks/useTruckPlan';
import {
  count, disputeDueLabel, money, moneyWhole, overUnder, shortDay, worthSum,
} from '../../pages/inventory/processing/truckSummaryDisplay';
import { itemCardWhen } from './itemCardData';
import { useObjectModal } from './ObjectModal';
import { Facts, Section } from './windowParts';

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

/** Typing that is not saved yet, kept per order so closing the window by mistake does not lose it. */
const draftKey = (orderId: number) => `truck-plan-draft:${orderId}`;
const drafts = {
  get(orderId: number): PlanForm | undefined {
    try {
      const raw = window.sessionStorage.getItem(draftKey(orderId));
      return raw ? (JSON.parse(raw) as PlanForm) : undefined;
    } catch {
      return undefined;
    }
  },
  has(orderId: number): boolean {
    return this.get(orderId) !== undefined;
  },
  set(orderId: number, form: PlanForm) {
    try { window.sessionStorage.setItem(draftKey(orderId), JSON.stringify(form)); } catch { /* typing still works */ }
  },
  delete(orderId: number) {
    try { window.sessionStorage.removeItem(draftKey(orderId)); } catch { /* nothing kept */ }
  },
};

/** True when the plan says nothing: it is shown as "No truck plan yet". */
function planIsEmpty(plan: TruckPlanDTO | null): boolean {
  return !plan || !(plan.pricing_start_pct || plan.watch_for.trim() || plan.known_issues.trim() || plan.crew.length || plan.dispute_due_date);
}

/** A pricing start far from where trucks usually start is most often a slip of the finger. */
function pricingStartHint(text: string): string | null {
  const n = Number(text.trim());
  if (!text.trim() || !Number.isFinite(n)) return null;
  if (n < 10) return `${text.trim()}% is very low. Most trucks start near 55%. Check it before you save.`;
  if (n > 200) return null; // the box itself says it must be between 0 and 200
  if (n > 100) return `${text.trim()}% is above retail. Most trucks start near 55%. Check it before you save.`;
  return null;
}

/** The saved plan as plain statements: what a processor reads before starting the truck. */
/** "Target $3,245 (2 x Paid). On track for $4,631, $1,386 over." The plan's first line, for everyone. */
function TargetLine({ data }: { data: TruckPlanWindowDTO }) {
  const t = data.target;
  const vs = overUnder(data.on_track.vs_target);
  return (
    <Box component="span">
      <b>{moneyWhole(t.total)}</b>{' '}
      <Box component="span" sx={{ color: 'text.secondary' }}>
        ({t.is_default ? '2 x Paid' : `set by ${t.set_by || 'a superuser'}${t.set_at ? `, ${shortDay(t.set_at)}` : ''}`})
      </Box>
      . On track for {moneyWhole(data.on_track.total)},{' '}
      <Box component="span" sx={{ fontWeight: 700, color: vs.tone === 'good' ? 'success.main' : vs.tone === 'warning' ? 'warning.dark' : undefined }}>
        {vs.text}
      </Box>
      .
    </Box>
  );
}

function PlanRead({ data, onEdit }: { data: TruckPlanWindowDTO; onEdit: () => void }) {
  const plan = data.plan;
  const due = disputeDueLabel(data.dates);
  const none = <Box component="span" sx={{ color: 'text.secondary', fontWeight: 400 }}>Nothing written</Box>;
  const text = (v: string | undefined) => (v && v.trim() ? <Box component="span" sx={{ whiteSpace: 'pre-wrap' }}>{v.trim()}</Box> : none);
  if (planIsEmpty(plan)) {
    // No plan yet: a calm note for everyone and one way to start. Nothing that looks like a form to fill in.
    return (
      <Section title="The plan">
        <Facts rows={[['Target', <TargetLine key="t" data={data} />]]} />
        <Typography sx={{ mt: 1.5, fontSize: 14 }}>
          No plan yet for this truck. Process it as normal.
        </Typography>
        <Button variant="outlined" size="small" sx={{ mt: 1.25 }} onClick={onEdit}>Write the plan</Button>
      </Section>
    );
  }
  return (
    <Section title="The plan" action={<Button size="small" variant="outlined" onClick={onEdit}>Change the plan</Button>}>
      <Facts rows={[
        ['Target', <TargetLine key="t" data={data} />],
        ['Known issues', text(plan?.known_issues)],
        ['Watch for', text(plan?.watch_for)],
        ['Pricing start', plan?.pricing_start_pct ? `${plan.pricing_start_pct}% of retail` : <Box component="span" sx={{ color: 'text.secondary', fontWeight: 400 }}>Not set. Estimates use this truck&apos;s prices so far.</Box>],
        ['Who is on it', plan?.crew.length ? plan.crew.map((c) => c.name).join(', ') : none],
        ['Dispute due', due.value !== '-' ? `${due.value} (${data.dates.dispute_due_from_plan ? 'set by hand in this plan' : `${data.dates.dispute_business_days} business days after delivery`})` : null],
      ]} />
      {plan?.updated_at ? (
        <Typography sx={{ mt: 1.25, fontSize: 13, color: 'text.secondary' }}>
          Saved{plan.updated_by ? ` by ${plan.updated_by}` : ''}, {itemCardWhen(plan.updated_at)}
        </Typography>
      ) : null}
    </Section>
  );
}

function PlanEditor({ orderId, data, onDone }: { orderId: number; data: TruckPlanWindowDTO; onDone: () => void }) {
  const save = useSaveTruckPlan(orderId);
  const draft = drafts.get(orderId);
  const [form, setForm] = useState<PlanForm>(() => draft ?? formFrom(data.plan));
  const [dirty, setDirty] = useState(Boolean(draft));
  const stamp = data.plan?.updated_at ?? '';
  // A save (here or by someone else) brings the saved plan back in, unless this person is mid-edit.
  useEffect(() => {
    if (!dirty) setForm(formFrom(data.plan));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the saved plan changes
  }, [stamp]);
  const set = <K extends keyof PlanForm>(key: K, value: PlanForm[K]) => {
    const next = { ...form, [key]: value };
    setForm(next);
    setDirty(true);
    drafts.set(orderId, next);
    if (save.isError) save.reset();
  };
  const discard = () => {
    drafts.delete(orderId);
    setForm(formFrom(data.plan));
    setDirty(false);
    save.reset();
    onDone();
  };
  const defaultDue = data.dates.dispute_due_from_plan ? null : data.dates.dispute_due;
  const firstPlan = planIsEmpty(data.plan);
  const error = save.isError ? errorText(save.error, 'The plan could not be saved.') : '';
  const pctNumber = Number(form.pricing_start_pct.trim());
  const pricingError = error.startsWith('Pricing start') ? error
    : form.pricing_start_pct.trim() && Number.isFinite(pctNumber) && (pctNumber < 0 || pctNumber > 200) ? 'Pricing start must be between 0 and 200 percent.'
    : '';
  const pricingHint = pricingStartHint(form.pricing_start_pct);
  const delivered = data.dates.delivered;
  const dueError = form.dispute_due_date && delivered && form.dispute_due_date < delivered
    ? `That is before the truck came (${shortDay(delivered)}).`
    : '';
  const [dropAsk, setDropAsk] = useState(false);

  return (
    <Section title={firstPlan ? 'The plan' : 'Change the plan'}>
      <Stack spacing={1.75} sx={{ pt: 0.5 }}>
        <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>
          {firstPlan
            ? 'No truck plan yet. Write what you know and save. Processing can start without it.'
            : 'Everyone who opens this truck sees the plan.'}
        </Typography>
        <TextField
          label="Known issues"
          size="small"
          multiline
          minRows={2}
          value={form.known_issues}
          onChange={(e) => set('known_issues', e.target.value)}
          helperText="Anything wrong with the truck or the order that everyone should know."
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
        <TextField
          label="Pricing start"
          size="small"
          value={form.pricing_start_pct}
          onChange={(e) => set('pricing_start_pct', e.target.value)}
          error={Boolean(pricingError)}
          helperText={
            pricingError || pricingHint
            || 'Where tags start on this truck. On track uses it to estimate lines that have no price yet. Empty: it uses this truck\'s prices so far.'
          }
          slotProps={{
            input: { endAdornment: <InputAdornment position="end">% of retail</InputAdornment> },
            htmlInput: { inputMode: 'decimal', 'aria-label': 'Pricing start, percent of retail' },
            formHelperText: { sx: pricingHint && !pricingError ? { color: 'warning.dark', fontWeight: 600 } : undefined },
          }}
          sx={{ '& .MuiInputBase-root': { maxWidth: 260 } }}
        />
        <Autocomplete
          multiple
          size="small"
          disableCloseOnSelect
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
          error={Boolean(dueError)}
          helperText={
            dueError ? dueError
            : defaultDue
              ? `Only if B-Stock gave another day. Empty: ${data.dates.dispute_business_days} business days after delivery (${shortDay(defaultDue)}).`
              : `Only if B-Stock gave another day. Empty: ${data.dates.dispute_business_days} business days after delivery.`
          }
          slotProps={{ inputLabel: { shrink: true } }}
          sx={{ '& .MuiInputBase-root': { maxWidth: 260 } }}
        />
        <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap sx={{ minHeight: 40 }}>
          <Button
            variant="contained"
            disabled={save.isPending || !dirty || Boolean(dueError) || (Boolean(pricingError) && !save.isError)}
            onClick={() =>
              save.mutate(
                {
                  pricing_start_pct: form.pricing_start_pct.trim() || null,
                  watch_for: form.watch_for,
                  known_issues: form.known_issues,
                  crew_ids: form.crew.map((c) => c.id),
                  dispute_due_date: form.dispute_due_date || null,
                },
                {
                  onSuccess: (saved) => {
                    drafts.delete(orderId);
                    setForm(formFrom(saved.plan));
                    setDirty(false);
                    onDone();
                  },
                },
              )
            }
          >
            {save.isPending ? 'Saving' : 'Save the plan'}
          </Button>
          <Button
            disabled={save.isPending}
            color={dropAsk ? 'warning' : 'primary'}
            onBlur={() => setDropAsk(false)}
            onClick={() => (dirty && !dropAsk ? setDropAsk(true) : discard())}
          >
            {!dirty ? 'Cancel' : dropAsk ? 'Yes, drop them' : 'Drop my changes'}
          </Button>
          <Typography role="status" sx={{ fontSize: 13, fontWeight: error && !pricingError ? 600 : 400, color: error && !pricingError ? 'error.main' : 'text.secondary' }}>
            {error && !pricingError ? error : dirty ? 'Not saved yet. Your typing is kept here until you save or drop it.' : ''}
          </Typography>
        </Stack>
      </Stack>
    </Section>
  );
}

/** The plan as statements for readers; the form to write it. A truck with no plan opens on the form. */
function PlanPanel({ orderId, data }: { orderId: number; data: TruckPlanWindowDTO }) {
  const [editing, setEditing] = useState(() => drafts.has(orderId));
  if (editing) return <PlanEditor orderId={orderId} data={data} onDone={() => setEditing(false)} />;
  return <PlanRead data={data} onEdit={() => setEditing(true)} />;
}

function TargetEditor({ orderId, data }: { orderId: number; data: TruckPlanWindowDTO }) {
  const setTarget = useSetTruckTarget(orderId);
  const t = data.target;
  const [text, setText] = useState('');
  const [said, setSaid] = useState('');
  useEffect(() => {
    setText('');
  }, [t.is_default, t.total]);
  const error = setTarget.isError ? errorText(setTarget.error, 'The target could not be saved.') : '';

  return (
    <Stack spacing={1} sx={{ mt: 1.5, pt: 1.5, borderTop: 1, borderColor: 'divider' }}>
      <Typography sx={{ fontSize: 13, fontWeight: 700 }}>Change the target (superuser only)</Typography>
      <Stack direction="row" spacing={1} alignItems="flex-start" flexWrap="wrap" useFlexGap>
        <TextField
          label="New target total"
          size="small"
          value={text}
          onChange={(e) => { setText(e.target.value); setSaid(''); if (setTarget.isError) setTarget.reset(); }}
          error={Boolean(error)}
          helperText={error || said || `Now ${money(t.total)}.`}
          slotProps={{
            input: { startAdornment: <InputAdornment position="start">$</InputAdornment> },
            htmlInput: { inputMode: 'decimal', 'aria-label': 'Target total' },
          }}
          sx={{ width: 230 }}
        />
        <Button
          variant="contained"
          disabled={setTarget.isPending || !text.trim()}
          onClick={() => setTarget.mutate(text.trim(), { onSuccess: () => setSaid('Target saved.') })}
        >
          Set target
        </Button>
        {!t.is_default ? (
          <Button disabled={setTarget.isPending} onClick={() => setTarget.mutate(null, { onSuccess: () => setSaid('Back to 2 x Paid.') })}>
            Back to 2 x Paid
          </Button>
        ) : null}
      </Stack>
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
  // A superuser goes straight to the target box from here; everyone else opens the sums when they want them.
  const [showSums, setShowSums] = useState(false);

  return (
    <Stack spacing={2} sx={{ p: { xs: 1.5, md: 2.5 }, minHeight: { md: 520 } }}>
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
        <Typography component="h2" sx={{ fontWeight: 800, fontSize: { xs: 17, md: 20 }, lineHeight: 1.25 }}>
          {data.order.description || 'Truck Plan'}
        </Typography>
      </Stack>

      <PlanPanel orderId={orderId} data={data} />
      {data.order.notes ? (
        <Section title="Order notes">
          <Typography sx={{ fontSize: 14, whiteSpace: 'pre-wrap' }}>{data.order.notes}</Typography>
        </Section>
      ) : null}

      <Box>
        <Link component="button" type="button" underline="hover" onClick={() => setShowSums((v) => !v)} sx={{ fontSize: 13.5, fontWeight: 600 }}>
          {showSums ? 'Hide the money and the dispute' : 'See the money and the dispute behind these numbers'}
        </Link>
      </Box>
      {showSums ? (
        <Box sx={{ display: 'grid', gap: 2, alignItems: 'start', gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1fr) minmax(0, 1fr)' } }}>
          <Section title="Money">
            <Facts rows={[
              ['Price', money(data.paid.price)],
              ['Fees', money(data.paid.fees)],
              ['Shipping', money(data.paid.shipping)],
              ['Paid', <b key="paid">{money(data.paid.total)}</b>],
              ['Target', <b key="target">{money(t.total)}</b>],
              ['Target from', t.is_default
                ? '2 x Paid'
                : `${t.set_by || 'A superuser'}${t.set_at ? `, ${shortDay(t.set_at)}` : ''}. 2 x Paid is ${money(t.default)}.`],
              ['Tags so far', `${money(on.priced_so_far)} on ${count(on.priced_items)} ${on.priced_items === 1 ? 'item' : 'items'} checked in (added items count too)`],
              ['Estimate for the rest', `${money(on.estimated_left)} for the ${count(on.units_left)} ${on.units_left === 1 ? 'unit' : 'units'} left`],
              ['Estimated from', [
                on.units_own_price ? `${count(on.units_own_price)} ${on.units_own_price === 1 ? 'unit' : 'units'} at the price on the manifest line` : '',
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
              ['Disputed', d.items > 0
                ? `${count(d.items)} ${d.items === 1 ? 'item' : 'items'}, ${money(d.retail)} retail`
                : 'Nothing so far'],
              ['5% line', d.threshold_retail != null ? `${money(d.threshold_retail)} of retail. B-Stock takes a dispute above it.` : null],
              ['Worth so far', <span key="worth"><b>{money(d.worth)}</b> (shipping is not in it)</span>],
            ]} />
            {d.items > 0 ? (
              <Typography sx={{ mt: 1, fontSize: 13, color: 'text.secondary' }}>{worthSum(d)}</Typography>
            ) : null}
          </Section>
        </Box>
      ) : null}
    </Stack>
  );
}

/** The Truck Plan window body; `orderId` is the order whose truck it plans. */
export function TruckPlanCardBody({ orderId }: { orderId: number }) {
  const { data, isLoading, isError } = useTruckPlanWindow(orderId);
  // The waiting box is about the size of the window, so it does not jump when the plan arrives.
  if (isLoading) return <Box sx={{ minHeight: { xs: 480, md: 520 }, p: 4 }}><CircularProgress size={28} /></Box>;
  if (isError || !data) return <Typography sx={{ p: 3 }}>This truck plan could not be loaded.</Typography>;
  return <PlanView orderId={orderId} data={data} />;
}
