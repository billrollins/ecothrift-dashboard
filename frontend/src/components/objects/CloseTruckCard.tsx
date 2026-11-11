/**
 * Close the truck (Dash Updates #88): one guided step for one order's truck, in the standard window.
 * Opened from the top of Processing, the Order window, the Truck page and the count-down on the Orders list.
 *
 * 1. What came: not received, broken, damaged, added, each with retail.
 * 2. The dispute, by the same rule as the Processing header.
 * 3. File it: the list to copy into B-Stock, then filed on / amount asked. A person files on B-Stock; Dash only
 *    keeps the record.
 * 4. Money back: the amount and the date.
 * 5. Close the truck (Finalize). It stamps the order and freezes the totals; no item is changed or removed.
 * A truck with nothing to dispute shows the sentence and one button; the facts fold away under it.
 * Data: GET /api/inventory/orders/<id>/truck-close/ and POST .../truck-close/<step>/ (services/truck_close.py).
 */
import { useEffect, useState } from 'react';
import {
  Alert, Box, Button, Chip, CircularProgress, Link, Stack, Step, StepLabel, Stepper, Table, TableBody, TableCell,
  TableHead, TableRow, TextField, Tooltip, Typography,
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import type { TruckCloseDTO } from '../../api/truckClose.api';
import { useTruckClose, useTruckCloseStep } from '../../hooks/useTruckClose';
import { activeStep, dueWords, isStillWorking, standing } from '../../pages/inventory/truck/closeTruckDisplay';
import { count, money, shortDay, worthSum } from '../../pages/inventory/processing/truckSummaryDisplay';
import { itemCardWhen } from './itemCardData';
import { useObjectModal } from './ObjectModal';
import { Facts, Section, Stat } from './windowParts';

const STEPS = ['What came', 'The dispute', 'Filed', 'Money back', 'Closed'];

function errorText(e: unknown): string {
  const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
  return typeof detail === 'string' && detail ? detail : 'That could not be saved.';
}

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const isAmount = (v: string) => /^\$?\d[\d,]*(\.\d{1,2})?$/.test(v.trim());
const amountOf = (v: string) => Number(v.replace(/[$,\s]/g, ''));

function CopyButton({ text, label, hint }: { text: string; label: string; hint?: string }) {
  const [copied, setCopied] = useState(false);
  const button = (
    <Button
      size="small"
      variant="outlined"
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => setCopied(true));
        window.setTimeout(() => setCopied(false), 1600);
      }}
    >
      {copied ? 'Copied' : label}
    </Button>
  );
  return hint ? <Tooltip title={hint} enterDelay={300}>{button}</Tooltip> : button;
}

function ClaimList({ data }: { data: TruckCloseDTO }) {
  const [open, setOpen] = useState(false);
  if (!data.lines.length) return null;
  const shown = open ? data.lines : data.lines.slice(0, 6);
  return (
    <Stack spacing={1}>
      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
        <Typography sx={{ fontSize: 13, fontWeight: 700, flex: '1 1 200px' }}>
          The dispute list: {count(data.lines.length)} {data.lines.length === 1 ? 'line' : 'lines'}
          {data.claim.filed ? ' (as filed)' : ''}
        </Typography>
        <CopyButton
          text={data.copy_text}
          label={`Copy all ${count(data.lines.length)} ${data.lines.length === 1 ? 'line' : 'lines'}`}
          hint="Copies every line with its units, retail and reason, the total and the amount to ask. Paste it into the B-Stock dispute."
        />
        {data.public_url ? (
          <CopyButton text={data.public_url} label="Copy the link" hint="A link to a page with these lines, to give B-Stock as proof." />
        ) : null}
        {data.public_url ? (
          <Button size="small" component="a" href={`${data.public_url}?from=dash`} target="_blank" rel="noreferrer">
            See that page
          </Button>
        ) : null}
      </Stack>
      {/* The long list scrolls in its own box, so the next step stays close. */}
      <Box sx={{ maxHeight: open ? 320 : undefined, overflowY: open ? 'auto' : 'visible', border: open ? 1 : 0, borderColor: 'divider', borderRadius: 1 }}>
        <Table size="small" stickyHeader={open} sx={{ tableLayout: 'fixed', width: '100%', '& td, & th': { fontSize: 12.5, py: 0.4, px: 0.75 } }}>
          <TableHead>
            <TableRow>
              <TableCell sx={{ width: 52, display: { xs: 'none', sm: 'table-cell' } }}>Line</TableCell>
              <TableCell>Item</TableCell>
              <TableCell align="right" sx={{ width: 52 }}>Units</TableCell>
              <TableCell align="right" sx={{ width: 92 }}>Retail</TableCell>
              <TableCell sx={{ width: 104, display: { xs: 'none', sm: 'table-cell' } }}>Reason</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {shown.map((line) => (
              <TableRow key={`${line.row_number}-${line.reason}`}>
                <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>{line.row_number}</TableCell>
                <TableCell title={line.title}>
                  <Box sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{line.title}</Box>
                  <Box sx={{ display: { xs: 'block', sm: 'none' }, color: 'text.secondary', fontSize: 11.5 }}>
                    Line {line.row_number} · {line.reason}
                  </Box>
                </TableCell>
                <TableCell align="right">{count(line.units)}</TableCell>
                <TableCell align="right">{money(line.total_retail)}</TableCell>
                <TableCell sx={{ whiteSpace: 'nowrap', display: { xs: 'none', sm: 'table-cell' } }}>{line.reason}</TableCell>
              </TableRow>
            ))}
            <TableRow>
              <TableCell sx={{ fontWeight: 800, display: { xs: 'none', sm: 'table-cell' } }} />
              <TableCell colSpan={2} sx={{ fontWeight: 800 }}>Total</TableCell>
              <TableCell align="right" sx={{ fontWeight: 800 }}>{money(data.numbers.retail)}</TableCell>
              <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }} />
            </TableRow>
          </TableBody>
        </Table>
      </Box>
      {data.lines.length > 6 ? (
        <Link component="button" type="button" underline="hover" onClick={() => setOpen((v) => !v)} sx={{ fontSize: 13, alignSelf: 'flex-start' }}>
          {open ? 'Show fewer lines' : `Show all ${count(data.lines.length)} lines`}
        </Link>
      ) : null}
    </Stack>
  );
}

/** Filed on / amount asked / B-Stock's number. Empty or wrong boxes say so at the box; nothing is filled in silently. */
function FiledForm({ orderId, data }: { orderId: number; data: TruckCloseDTO }) {
  const step = useTruckCloseStep(orderId);
  const c = data.claim;
  const [filedOn, setFiledOn] = useState(c.filed_on ?? today());
  const [asked, setAsked] = useState(c.amount_asked ?? data.numbers.worth ?? '');
  const [bstockId, setBstockId] = useState(c.bstock_dispute_id);
  const [tried, setTried] = useState(false);
  const [sure, setSure] = useState(false);
  useEffect(() => {
    setFiledOn(c.filed_on ?? today());
    setAsked(c.amount_asked ?? data.numbers.worth ?? '');
    setBstockId(c.bstock_dispute_id);
    setTried(false);
    setSure(false);
  }, [c.filed_on, c.amount_asked, c.bstock_dispute_id, data.numbers.worth]);
  const closed = Boolean(data.finalized.at);
  const delivered = data.order.delivered;
  const late = !c.filed && data.due.days_left != null && data.due.days_left < 0;
  const dayError = !filedOn ? 'Pick the day it was filed.'
    : filedOn > today() ? 'This day has not come yet.'
    : delivered && filedOn < delivered ? `Before the truck came (${shortDay(delivered)}).`
    : '';
  const askedOver = isAmount(String(asked)) && data.numbers.worth != null && amountOf(String(asked)) > Number(data.numbers.worth) + 0.005;
  const askedError = !String(asked).trim() ? 'Type the amount asked.' : !isAmount(String(asked)) ? 'Use a dollar amount, like 39.20.' : '';
  const serverError = step.isError ? errorText(step.error) : '';
  const same = c.filed && filedOn === (c.filed_on ?? '') && String(asked) === (c.amount_asked ?? '') && bstockId === c.bstock_dispute_id;
  const change = <T,>(set: (v: T) => void) => (v: T) => { set(v); if (step.isError) step.reset(); };

  return (
    <Stack spacing={1}>
      <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>
        {late
          ? `Dispute day passed (${shortDay(data.due.date)}), so this is not to file now. Only if someone filed it on B-Stock in time, write it down here. Otherwise close the truck in step 5.`
          : 'File the dispute on B-Stock yourself, then write here what you did. Dash does not send anything to B-Stock.'}
      </Typography>
      <Box sx={{ display: 'grid', gap: 1, gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, minmax(0, 1fr))' }, alignItems: 'start' }}>
        <TextField
          label="Filed on" type="date" size="small" value={filedOn} disabled={closed}
          onChange={(e) => change(setFiledOn)(e.target.value)}
          error={tried && Boolean(dayError)} helperText={(tried && dayError) || ' '}
          slotProps={{ inputLabel: { shrink: true } }}
        />
        <TextField
          label="Amount asked" size="small" value={asked} disabled={closed}
          onChange={(e) => { change(setAsked)(e.target.value); setSure(false); }}
          error={tried && Boolean(askedError)}
          helperText={(tried && askedError) || (askedOver ? `More than the ${money(data.numbers.worth)} dispute. Check it.` : `The dispute is worth ${money(data.numbers.worth)}.`)}
          slotProps={{
            htmlInput: { inputMode: 'decimal', 'aria-label': 'Amount asked' },
            formHelperText: { sx: askedOver && !(tried && askedError) ? { color: 'warning.dark', fontWeight: 600 } : undefined },
          }}
        />
        <TextField
          label="B-Stock number" size="small" value={bstockId} disabled={closed}
          onChange={(e) => change(setBstockId)(e.target.value)}
          helperText="If B-Stock gave one."
        />
      </Box>
      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap alignItems="center" sx={{ minHeight: 36 }}>
        {!closed ? (
          <Button
            variant={c.filed || late ? 'outlined' : 'contained'}
            disabled={step.isPending || same}
            onClick={() => {
              setTried(true);
              if (dayError || askedError) return;
              if (askedOver && !sure) { setSure(true); return; }
              step.mutate({ step: 'filed', body: { filed_on: filedOn, amount_asked: String(amountOf(String(asked))), bstock_dispute_id: bstockId } });
            }}
          >
            {askedOver && sure ? 'Yes, save that amount' : c.filed ? 'Save the change' : late ? 'It was filed in time' : 'Mark it filed'}
          </Button>
        ) : null}
        {c.filed && !closed && !c.answered ? (
          <Button disabled={step.isPending} onClick={() => step.mutate({ step: 'not-filed' })}>Not filed after all</Button>
        ) : null}
        <Typography role="status" sx={{ fontSize: 13, color: serverError ? 'error.main' : 'text.secondary', fontWeight: serverError ? 600 : 400 }}>
          {serverError || (c.filed ? `Filed ${shortDay(c.filed_on)} for ${money(c.amount_asked)}.` : '')}
        </Typography>
      </Stack>
    </Stack>
  );
}

/** What B-Stock sent back. An amount above what was asked is questioned once before it saves. */
function MoneyBackForm({ orderId, data }: { orderId: number; data: TruckCloseDTO }) {
  const step = useTruckCloseStep(orderId);
  const c = data.claim;
  const [back, setBack] = useState(c.amount_back ?? '');
  const [backOn, setBackOn] = useState(c.back_on ?? today());
  const [tried, setTried] = useState(false);
  const [sure, setSure] = useState(false);
  useEffect(() => {
    setBack(c.amount_back ?? '');
    setBackOn(c.back_on ?? today());
    setTried(false);
    setSure(false);
  }, [c.amount_back, c.back_on]);
  if (!c.filed) {
    return <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>Comes after the dispute is filed.</Typography>;
  }
  const backError = !String(back).trim() ? 'Type the amount. 0 if B-Stock said no.' : !isAmount(String(back)) ? 'Use a dollar amount, like 39.20.' : '';
  const dayError = !backOn ? 'Pick the day.'
    : backOn > today() ? 'This day has not come yet.'
    : c.filed_on && backOn < c.filed_on ? `Before the dispute was filed (${shortDay(c.filed_on)}).`
    : '';
  const over = !backError && c.amount_asked != null && amountOf(String(back)) > Number(c.amount_asked);
  const serverError = step.isError ? errorText(step.error) : '';
  const same = c.answered && String(back) === (c.amount_back ?? '') && backOn === (c.back_on ?? '');

  return (
    <Stack spacing={1}>
      <Box sx={{ display: 'grid', gap: 1, gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' }, alignItems: 'start' }}>
        <TextField
          label="Amount back" size="small" value={back}
          onChange={(e) => { setBack(e.target.value); setSure(false); if (step.isError) step.reset(); }}
          error={tried && Boolean(backError)}
          helperText={(tried && backError) || (over ? `More than the ${money(c.amount_asked)} asked. Check it.` : 'Type 0 if B-Stock said no.')}
          slotProps={{
            htmlInput: { inputMode: 'decimal', 'aria-label': 'Amount back' },
            formHelperText: { sx: over && !(tried && backError) ? { color: 'warning.dark', fontWeight: 600 } : undefined },
          }}
        />
        <TextField
          label="Came back on" type="date" size="small" value={backOn}
          onChange={(e) => { setBackOn(e.target.value); if (step.isError) step.reset(); }}
          error={tried && Boolean(dayError)} helperText={(tried && dayError) || ' '}
          slotProps={{ inputLabel: { shrink: true } }}
        />
      </Box>
      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap alignItems="center" sx={{ minHeight: 36 }}>
        <Button
          variant={c.answered ? 'outlined' : 'contained'}
          disabled={step.isPending || same}
          onClick={() => {
            setTried(true);
            if (backError || dayError) return;
            if (over && !sure) { setSure(true); return; }
            step.mutate({ step: 'money-back', body: { amount_back: String(amountOf(String(back))), back_on: backOn } });
          }}
        >
          {over && sure ? 'Yes, save that amount' : c.answered ? 'Save the change' : 'Record the money back'}
        </Button>
        {c.answered ? (
          <Button disabled={step.isPending} onClick={() => step.mutate({ step: 'money-back', body: { amount_back: '' } })}>
            No answer yet after all
          </Button>
        ) : null}
        {c.answered ? <Chip size="small" label={c.status_label} variant="outlined" /> : null}
        <Typography role="status" sx={{ fontSize: 13, color: serverError ? 'error.main' : 'text.secondary', fontWeight: serverError ? 600 : 400 }}>
          {serverError || (over && sure ? `That is more than the ${money(c.amount_asked)} asked.` : !c.answered ? 'When the money comes, even after the truck is closed, write it here.' : '')}
        </Typography>
      </Stack>
    </Stack>
  );
}

/** The last step. With anything still open it asks once, in plain words, before it closes. */
function CloseStep({ orderId, data }: { orderId: number; data: TruckCloseDTO }) {
  const finalize = useTruckCloseStep(orderId);
  const [asking, setAsking] = useState(false);
  const closed = Boolean(data.finalized.at);
  if (closed) {
    return (
      <Typography sx={{ fontSize: 14 }}>
        Closed{data.finalized.by ? ` by ${data.finalized.by}` : ''}, {itemCardWhen(data.finalized.at)}. A manager can reopen
        it on the Truck page.
      </Typography>
    );
  }
  const needsAsk = data.warnings.length > 0;
  const late = data.due.days_left != null && data.due.days_left < 0;
  const label = data.state === 'to_file' ? 'Close without filing' : 'Close the truck';
  return (
    <Stack spacing={1.25}>
      {data.warnings.map((w) => <Alert key={w} severity="warning" sx={{ py: 0 }}>{w}</Alert>)}
      <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>
        Closing marks the truck Finalized and keeps today&apos;s totals. It does not change or remove any item. A manager
        can reopen it on the Truck page.
      </Typography>
      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap sx={{ minHeight: 36 }}>
        {asking ? (
          <>
            <Typography sx={{ fontSize: 14, fontWeight: 700 }}>Close it as it stands?</Typography>
            <Button variant="contained" color="warning" disabled={finalize.isPending} onClick={() => finalize.mutate({ step: 'finalize' })}>
              Yes, close the truck
            </Button>
            <Button disabled={finalize.isPending} onClick={() => setAsking(false)}>Not yet</Button>
          </>
        ) : (
          <Button
            variant="contained"
            color={data.state === 'to_file' && !late ? 'inherit' : 'success'}
            disabled={finalize.isPending}
            onClick={() => (needsAsk ? setAsking(true) : finalize.mutate({ step: 'finalize' }))}
          >
            {label}
          </Button>
        )}
        {finalize.isError ? (
          <Typography role="status" sx={{ fontSize: 13, fontWeight: 600, color: 'error.main' }}>{errorText(finalize.error)}</Typography>
        ) : null}
      </Stack>
    </Stack>
  );
}

function WhatCame({ orderId, data, bare }: { orderId: number; data: TruckCloseDTO; bare?: boolean }) {
  const { closeObject } = useObjectModal();
  const navigate = useNavigate();
  const p = data.numbers.parts;
  const due = dueWords(data.due.days_left);
  const closed = Boolean(data.finalized.at);
  const w = data.working;
  const body = (
    <>
      <Facts rows={[
        ['Not received', `${count(p.not_received.units)} ${p.not_received.units === 1 ? 'unit' : 'units'}, ${money(p.not_received.retail)} retail`],
        ['Broken', `${count(p.broken.units)} ${p.broken.units === 1 ? 'unit' : 'units'}, ${money(p.broken.retail)} retail`],
        ['Damaged', `${count(p.damaged.units)} ${p.damaged.units === 1 ? 'item' : 'items'}, ${money(p.damaged.retail)} retail`],
        ['Added', `${count(data.added.units)} ${data.added.units === 1 ? 'item' : 'items'} not on the manifest, ${money(data.added.retail)} retail`],
        ['Delivered', data.order.delivered ? shortDay(data.order.delivered) : null],
        ['Dispute due', !bare && !closed && data.due.date ? (
          <Box component="span" sx={{ color: due.tone === 'error' ? 'error.main' : undefined, fontWeight: due.tone === 'error' ? 700 : 500 }}>
            {shortDay(data.due.date)} ({due.text})
          </Box>
        ) : null],
      ]} />
      {!closed && isStillWorking(data) ? (
        <Alert severity="warning" sx={{ mt: 1, py: 0 }}>
          {w.pallets_open > 0 ? `${count(w.pallets_open)} of ${count(w.pallets_total)} pallets are not marked done. ` : ''}
          {w.pending_items > 0 ? `${count(w.pending_items)} items are still waiting. ` : ''}
          Until the work is done, &quot;not received&quot; also holds what is only not checked in yet.
        </Alert>
      ) : null}
      <Button size="small" sx={{ mt: 1 }} onClick={() => { closeObject(); navigate(`/inventory/orders/${orderId}/truck`); }}>
        See every line on the Truck page
      </Button>
    </>
  );
  return bare ? body : <Section title="1. What came">{body}</Section>;
}

function CloseView({ orderId, data }: { orderId: number; data: TruckCloseDTO }) {
  const { openObject } = useObjectModal();
  const [showFacts, setShowFacts] = useState(false);
  const [showSum, setShowSum] = useState(false);
  const n = data.numbers;
  const closed = Boolean(data.finalized.at);
  // Nothing to dispute and nothing filed: the sentence and one button. The facts fold away under it.
  const simple = data.state === 'nothing' && !data.claim.filed;
  const soFar = Number(data.so_far_worth ?? 0);
  const differs = !closed && data.so_far_worth != null && n.worth != null && Math.abs(soFar - Number(n.worth)) >= 0.005;

  const top = (
    <Stack spacing={0.5}>
      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
        <Link
          component="button" type="button" underline="hover"
          onClick={() => openObject({ type: 'order', id: orderId })}
          sx={{ fontFamily: 'monospace', fontWeight: 900, fontSize: { xs: 14, md: 15 } }}
        >
          {data.order.order_number}
        </Link>
        {data.order.vendor ? <Chip size="small" label={data.order.vendor} variant="outlined" /> : null}
        {closed ? <Chip size="small" color="success" label="Closed" /> : null}
      </Stack>
      <Typography component="h2" sx={{ fontWeight: 800, fontSize: { xs: 18, md: 22 }, lineHeight: 1.2 }}>
        {standing(data)}
      </Typography>
    </Stack>
  );

  if (simple) {
    return (
      <Stack spacing={2} sx={{ p: { xs: 1.5, md: 2.5 } }}>
        {top}
        <Section title="Close the truck"><CloseStep orderId={orderId} data={data} /></Section>
        <Box>
          <Link component="button" type="button" underline="hover" onClick={() => setShowFacts((v) => !v)} sx={{ fontSize: 13 }}>
            {showFacts ? 'Hide what came' : 'See what came on this truck'}
          </Link>
          {showFacts ? <Box sx={{ mt: 1 }}><WhatCame orderId={orderId} data={data} bare /></Box> : null}
        </Box>
      </Stack>
    );
  }

  return (
    <Stack spacing={2} sx={{ p: { xs: 1.5, md: 2.5 } }}>
      <Stack spacing={0.5}>
        {top}
        {data.claim.filed ? (
          <Stack direction="row" spacing={{ xs: 2, md: 3 }} sx={{ pt: 0.5 }} flexWrap="wrap" useFlexGap>
            <Stat label="Asked" value={money(data.claim.amount_asked)} />
            <Stat label="Back" value={money(data.claim.amount_back)} muted={!data.claim.answered} />
          </Stack>
        ) : null}
      </Stack>

      <Stepper activeStep={activeStep(data)} alternativeLabel sx={{ display: { xs: 'none', sm: 'flex' } }}>
        {STEPS.map((label, i) => (
          <Step key={label} completed={i < activeStep(data) || closed}>
            <StepLabel>{label}</StepLabel>
          </Step>
        ))}
      </Stepper>

      <Box sx={{ display: 'grid', gap: 2, alignItems: 'start', gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1fr) minmax(0, 1fr)' } }}>
        <WhatCame orderId={orderId} data={data} />
        <Section title="2. The dispute">
          <Typography sx={{ fontSize: 28, fontWeight: 900, lineHeight: 1.1 }}>{money(n.worth)}</Typography>
          <Typography sx={{ fontSize: 13, color: 'text.secondary', mt: 0.25 }}>
            {money(n.retail)} did not come or came broken, {n.retail_pct != null ? `${n.retail_pct}% of the truck` : 'of the truck'}.
            {differs ? ` The top of Processing shows ${money(data.so_far_worth)} until the truck is closed.` : ''}
          </Typography>
          <Link component="button" type="button" underline="hover" onClick={() => setShowSum((v) => !v)} sx={{ mt: 0.75, fontSize: 13 }}>
            {showSum ? 'Hide how it is worked out' : 'How it is worked out'}
          </Link>
          {showSum ? (
            <Box sx={{ mt: 1 }}>
              <Facts rows={[
                ['Disputed retail', `${money(n.retail)}${n.retail_pct != null ? ` (${n.retail_pct}% of the truck)` : ''}`],
                ['5% line', n.threshold_retail != null ? `${money(n.threshold_retail)} of ${money(n.truck_retail)} truck retail` : null],
                ['Price + fees', n.price_plus_fees != null ? `${money(n.price_plus_fees)} (shipping is not in it)` : null],
                ['The sum', worthSum(n)],
              ]} />
              <Typography sx={{ mt: 1, fontSize: 13, color: 'text.secondary' }}>
                {differs
                  ? `The top of Processing counts only what is marked not received so far (${money(data.so_far_worth)}). Closing counts everything not checked in.`
                  : 'The same rule and the same number as the top of Processing.'}
              </Typography>
            </Box>
          ) : null}
        </Section>
      </Box>

      <Section title="3. File it on B-Stock">
        <Stack spacing={2}>
          <ClaimList data={data} />
          <FiledForm orderId={orderId} data={data} />
        </Stack>
      </Section>

      <Box sx={{ display: 'grid', gap: 2, alignItems: 'start', gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1fr) minmax(0, 1fr)' } }}>
        <Section title="4. Money back"><MoneyBackForm orderId={orderId} data={data} /></Section>
        <Section title="5. Close the truck"><CloseStep orderId={orderId} data={data} /></Section>
      </Box>
    </Stack>
  );
}

/** The Close the truck window body; `orderId` is the order whose truck it closes. */
export function CloseTruckCardBody({ orderId }: { orderId: number }) {
  const { data, isLoading, isError } = useTruckClose(orderId);
  // The waiting box is about the size of the window, so it does not jump when the truck arrives.
  if (isLoading) return <Box sx={{ minHeight: { xs: 420, md: 560 }, p: 4 }}><CircularProgress size={28} /></Box>;
  if (isError || !data) return <Typography sx={{ p: 3 }}>This truck could not be loaded.</Typography>;
  return <CloseView orderId={orderId} data={data} />;
}
