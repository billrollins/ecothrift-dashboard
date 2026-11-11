/**
 * Close the truck (Dash Updates #88): one guided step for one order's truck, in the standard window.
 * Opened from the top of Processing, the Order window, the Truck page and the count-down on the Orders list.
 *
 * 1. What came: not received, broken, damaged, added, each with retail.
 * 2. The claim, by the same rule as the Processing header, and the list to copy into B-Stock.
 * 3. Filed on / amount asked, then amount back / the date. A person files on B-Stock; Dash only keeps the record.
 * 4. Close the truck (Finalize). It stamps the order and freezes the totals; no item is changed or removed.
 * A truck with nothing to claim shows one button.
 * Data: GET /api/inventory/orders/<id>/truck-close/ and POST .../truck-close/<step>/ (services/truck_close.py).
 */
import { useEffect, useState } from 'react';
import {
  Alert, Box, Button, Chip, CircularProgress, Link, Stack, Step, StepLabel, Stepper, Table, TableBody, TableCell,
  TableHead, TableRow, TextField, Typography,
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import type { TruckCloseDTO } from '../../api/truckClose.api';
import { useTruckClose, useTruckCloseStep } from '../../hooks/useTruckClose';
import { activeStep, dueWords, standing } from '../../pages/inventory/truck/closeTruckDisplay';
import { count, money, shortDay, worthSum } from '../../pages/inventory/processing/truckSummaryDisplay';
import { itemCardWhen } from './itemCardData';
import { useObjectModal } from './ObjectModal';
import { Facts, Section, Stat } from './windowParts';

const STEPS = ['What came', 'The claim', 'Filed', 'Money back', 'Closed'];

function errorText(e: unknown): string {
  const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
  return typeof detail === 'string' && detail ? detail : 'That could not be saved.';
}

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
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
}

function ClaimList({ data }: { data: TruckCloseDTO }) {
  const [open, setOpen] = useState(false);
  if (!data.lines.length) return null;
  const shown = open ? data.lines : data.lines.slice(0, 8);
  return (
    <Stack spacing={1}>
      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
        <Typography sx={{ fontSize: 13, fontWeight: 700, flex: 1 }}>
          The claim list: {count(data.lines.length)} {data.lines.length === 1 ? 'line' : 'lines'}
          {data.claim.filed ? ' (as filed)' : ''}
        </Typography>
        <CopyButton text={data.copy_text} label="Copy the list" />
        {data.public_url ? <CopyButton text={data.public_url} label="Copy the link" /> : null}
        {data.public_url ? (
          <Button size="small" component="a" href={`${data.public_url}?from=dash`} target="_blank" rel="noreferrer">
            Open the page
          </Button>
        ) : null}
      </Stack>
      <Box sx={{ overflowX: 'auto' }}>
        <Table size="small" sx={{ '& td, & th': { fontSize: 12.5, py: 0.4 } }}>
          <TableHead>
            <TableRow>
              <TableCell>Line</TableCell>
              <TableCell>Item</TableCell>
              <TableCell align="right">Units</TableCell>
              <TableCell align="right">Retail</TableCell>
              <TableCell>Reason</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {shown.map((line) => (
              <TableRow key={`${line.row_number}-${line.reason}`}>
                <TableCell>{line.row_number}</TableCell>
                <TableCell sx={{ maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={line.title}>
                  {line.title}
                </TableCell>
                <TableCell align="right">{count(line.units)}</TableCell>
                <TableCell align="right">{money(line.total_retail)}</TableCell>
                <TableCell>{line.reason}</TableCell>
              </TableRow>
            ))}
            <TableRow>
              <TableCell colSpan={3} sx={{ fontWeight: 800 }}>Total</TableCell>
              <TableCell align="right" sx={{ fontWeight: 800 }}>{money(data.numbers.retail)}</TableCell>
              <TableCell />
            </TableRow>
          </TableBody>
        </Table>
      </Box>
      {data.lines.length > 8 ? (
        <Link component="button" type="button" underline="hover" onClick={() => setOpen((v) => !v)} sx={{ fontSize: 13, alignSelf: 'flex-start' }}>
          {open ? 'Show fewer lines' : `Show all ${data.lines.length} lines`}
        </Link>
      ) : null}
    </Stack>
  );
}

function FiledForm({ orderId, data }: { orderId: number; data: TruckCloseDTO }) {
  const step = useTruckCloseStep(orderId);
  const c = data.claim;
  const [filedOn, setFiledOn] = useState(c.filed_on ?? today());
  const [asked, setAsked] = useState(c.amount_asked ?? data.numbers.worth ?? '');
  const [bstockId, setBstockId] = useState(c.bstock_dispute_id);
  const [back, setBack] = useState(c.amount_back ?? '');
  const [backOn, setBackOn] = useState(c.back_on ?? today());
  useEffect(() => {
    setFiledOn(c.filed_on ?? today());
    setAsked(c.amount_asked ?? data.numbers.worth ?? '');
    setBstockId(c.bstock_dispute_id);
    setBack(c.amount_back ?? '');
    setBackOn(c.back_on ?? today());
  }, [c.filed_on, c.amount_asked, c.bstock_dispute_id, c.amount_back, c.back_on, data.numbers.worth]);
  const closed = Boolean(data.finalized.at);

  return (
    <Stack spacing={1.5}>
      <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>
        File the claim on B-Stock yourself, then write here what you did. Dash does not send anything to B-Stock.
      </Typography>
      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap alignItems="flex-start">
        <TextField
          label="Filed on" type="date" size="small" value={filedOn} onChange={(e) => setFiledOn(e.target.value)}
          slotProps={{ inputLabel: { shrink: true } }} sx={{ width: 170 }}
        />
        <TextField
          label="Amount asked" size="small" value={asked} onChange={(e) => setAsked(e.target.value)}
          slotProps={{ htmlInput: { inputMode: 'decimal', 'aria-label': 'Amount asked' } }} sx={{ width: 150 }}
        />
        <TextField
          label="B-Stock dispute number" size="small" value={bstockId} onChange={(e) => setBstockId(e.target.value)}
          sx={{ width: 200 }}
        />
        <Button
          variant={c.filed ? 'outlined' : 'contained'}
          disabled={step.isPending}
          onClick={() => step.mutate({ step: 'filed', body: { filed_on: filedOn, amount_asked: asked, bstock_dispute_id: bstockId } })}
        >
          {c.filed ? 'Save' : 'Mark it filed'}
        </Button>
        {c.filed && !closed ? (
          <Button disabled={step.isPending} onClick={() => step.mutate({ step: 'not-filed' })}>Not filed after all</Button>
        ) : null}
      </Stack>
      {c.filed ? (
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap alignItems="flex-start">
          <TextField
            label="Amount back" size="small" value={back} onChange={(e) => setBack(e.target.value)}
            helperText="Type 0 if B-Stock said no."
            slotProps={{ htmlInput: { inputMode: 'decimal', 'aria-label': 'Amount back' } }} sx={{ width: 170 }}
          />
          <TextField
            label="On" type="date" size="small" value={backOn} onChange={(e) => setBackOn(e.target.value)}
            slotProps={{ inputLabel: { shrink: true } }} sx={{ width: 170 }}
          />
          <Button
            variant={c.answered ? 'outlined' : 'contained'}
            disabled={step.isPending || (!String(back).trim() && !c.answered)}
            onClick={() => step.mutate({ step: 'money-back', body: { amount_back: String(back).trim(), back_on: backOn } })}
          >
            {c.answered ? 'Save' : 'Record the money back'}
          </Button>
          {c.answered ? <Chip size="small" label={c.status_label} variant="outlined" sx={{ mt: 0.75 }} /> : null}
        </Stack>
      ) : null}
      {step.isError ? <Alert severity="error">{errorText(step.error)}</Alert> : null}
    </Stack>
  );
}

function CloseView({ orderId, data }: { orderId: number; data: TruckCloseDTO }) {
  const { openObject, closeObject } = useObjectModal();
  const navigate = useNavigate();
  const finalize = useTruckCloseStep(orderId);
  const n = data.numbers;
  const p = n.parts;
  const closed = Boolean(data.finalized.at);
  const due = dueWords(data.due.days_left);
  const nothing = data.state === 'nothing';

  return (
    <Stack spacing={2} sx={{ p: { xs: 1.5, md: 2.5 } }}>
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
        <Stack direction="row" spacing={{ xs: 2, md: 3 }} sx={{ pt: 0.5 }} flexWrap="wrap" useFlexGap>
          <Stat label="Did not come or damaged" value={money(n.retail)} />
          <Stat label="The claim" value={money(n.worth)} />
          <Stat label="Asked" value={money(data.claim.amount_asked)} muted />
          <Stat label="Back" value={money(data.claim.amount_back)} muted />
        </Stack>
      </Stack>

      <Stepper activeStep={activeStep(data)} alternativeLabel sx={{ display: { xs: 'none', sm: 'flex' } }}>
        {STEPS.map((label, i) => (
          <Step key={label} completed={i < activeStep(data) || closed}>
            <StepLabel>{label}</StepLabel>
          </Step>
        ))}
      </Stepper>

      <Box sx={{ display: 'grid', gap: 2, alignItems: 'start', gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1fr) minmax(0, 1.25fr)' } }}>
        <Stack spacing={2} sx={{ minWidth: 0 }}>
          <Section title="1. What came">
            <Facts rows={[
              ['Not received', `${count(p.not_received.units)} ${p.not_received.units === 1 ? 'unit' : 'units'}, ${money(p.not_received.retail)} retail`],
              ['Broken', `${count(p.broken.units)} ${p.broken.units === 1 ? 'unit' : 'units'}, ${money(p.broken.retail)} retail`],
              ['Damaged', `${count(p.damaged.units)} ${p.damaged.units === 1 ? 'item' : 'items'}, ${money(p.damaged.retail)} retail`],
              ['Added', `${count(data.added.units)} ${data.added.units === 1 ? 'item' : 'items'} not on the manifest, ${money(data.added.retail)} retail`],
              ['Delivered', data.order.delivered ? shortDay(data.order.delivered) : null],
              ['Dispute due', data.due.date ? `${shortDay(data.due.date)} (${due.text})` : null],
            ]} />
            <Button size="small" sx={{ mt: 1 }} onClick={() => { closeObject(); navigate(`/inventory/orders/${orderId}/truck`); }}>
              See every line on the Truck page
            </Button>
          </Section>
          <Section title="2. The claim">
            <Facts rows={[
              ['Disputed retail', `${money(n.retail)}${n.retail_pct != null ? ` (${n.retail_pct}% of the truck)` : ''}`],
              ['5% line', n.threshold_retail != null ? `${money(n.threshold_retail)} of ${money(n.truck_retail)} truck retail` : null],
              ['The claim', <b key="claim">{money(n.worth)}</b>],
              ['The sum', worthSum(n)],
            ]} />
            <Typography sx={{ mt: 1, fontSize: 13, color: 'text.secondary' }}>
              The same rule as the top of Processing. Shipping is not in it. Everything not checked in counts as not received.
            </Typography>
          </Section>
        </Stack>

        <Stack spacing={2} sx={{ minWidth: 0 }}>
          {nothing && !data.lines.length ? null : (
            <Section title="The list to copy into B-Stock"><ClaimList data={data} /></Section>
          )}
          {nothing && !data.claim.filed ? null : (
            <Section title="3. Filed and money back"><FiledForm orderId={orderId} data={data} /></Section>
          )}
          <Section title={nothing ? 'Close the truck' : '4. Close the truck'}>
            {closed ? (
              <Typography sx={{ fontSize: 14 }}>
                Closed{data.finalized.by ? ` by ${data.finalized.by}` : ''}, {itemCardWhen(data.finalized.at)}. A manager
                can reopen it on the Truck page.
              </Typography>
            ) : (
              <Stack spacing={1.25}>
                {data.warnings.map((w) => <Alert key={w} severity="warning" sx={{ py: 0 }}>{w}</Alert>)}
                <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>
                  Closing marks the truck Finalized and keeps today&apos;s totals. It does not change or remove any item.
                </Typography>
                {finalize.isError ? <Alert severity="error">{errorText(finalize.error)}</Alert> : null}
                <Box>
                  <Button
                    variant="contained"
                    color={data.state === 'to_file' ? 'inherit' : 'success'}
                    disabled={finalize.isPending}
                    onClick={() => finalize.mutate({ step: 'finalize' })}
                  >
                    {data.state === 'to_file' ? 'Close without filing' : 'Close the truck'}
                  </Button>
                </Box>
              </Stack>
            )}
          </Section>
        </Stack>
      </Box>
    </Stack>
  );
}

/** The Close the truck window body; `orderId` is the order whose truck it closes. */
export function CloseTruckCardBody({ orderId }: { orderId: number }) {
  const { data, isLoading, isError } = useTruckClose(orderId);
  if (isLoading) return <CircularProgress size={28} sx={{ m: 4 }} />;
  if (isError || !data) return <Typography sx={{ p: 3 }}>This truck could not be loaded.</Typography>;
  return <CloseView orderId={orderId} data={data} />;
}
