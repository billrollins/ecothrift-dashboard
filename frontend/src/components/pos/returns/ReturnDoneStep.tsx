import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';
import PrintRounded from '@mui/icons-material/PrintRounded';
import { Alert, Box, Button, CircularProgress, Paper, Stack, Typography } from '@mui/material';
import { useEffect, useRef } from 'react';
import type { ReturnsDone, ReturnsReceipt } from '../../../api/thriftplusReturns.api';
import { formatCurrency } from '../../../utils/format';
import { MemberName } from '../../thriftplus/MemberName';
import { tbNumber } from '../../thriftplus/ThriftBucks';
import StepFrame from './StepFrame';
import { BIG, FOCUS_RING, dayOnly } from './returnsText';

/** Where the return receipt is: on its way, out, failed (with the printer's reason), or not made at all. */
export interface ReturnPrint {
  status: 'printing' | 'printed' | 'failed' | 'none';
  error: string;
}

/** One line of what came back, as the done screen lists it. */
export interface ReturnDoneLine {
  cart_line: number;
  title: string;
  why: string;
  credit: string;
}

interface Props {
  receipt: ReturnsReceipt;
  done: ReturnsDone;
  lines: ReturnDoneLine[];
  print: ReturnPrint;
  onPrintAgain: () => void;
  /** Their next ticket: its own return, its own receipt. */
  onAnother: () => void;
  onMember: () => void;
  onClose: () => void;
  narrow: boolean;
}

/**
 * Step 4, "Return complete" (#90; Carrie 2026-11-10: "having a receipt be printed or having something shown up saying
 * that the return went through would be good"). It says, big, that the return went through and what the customer
 * got; the return receipt prints by itself, one per sale (Bill 2026-11-10), with Print again. A receipt that does not
 * print is said here and never undoes the return. "Another return for this customer" goes to their next ticket.
 */
export default function ReturnDoneStep({ receipt, done, lines, print, onPrintAgain, onAnother, onMember, onClose, narrow }: Props) {
  const practice = done.training;
  const doneRef = useRef<HTMLButtonElement>(null);
  // The Enter (or the scanner's) that confirmed the return must not also close this screen unseen.
  const armedAt = useRef(Date.now() + 600);
  useEffect(() => {
    doneRef.current?.focus();
  }, []);

  const net = Number(done.totals.bucks_taken) - Number(done.totals.bucks_back);
  const bucks = Math.abs(net) < 0.005
    ? ''
    : net > 0
      ? `${tbNumber(net)} ThriftBucks came off their balance.`
      : `${tbNumber(-net)} ThriftBucks went back to them.`;
  const who = receipt.member ? <MemberName personId={receipt.member.person_id}>{receipt.member.name}</MemberName> : 'The customer';

  return (
    <StepFrame
      bottom={
        <Stack direction={narrow ? 'column' : 'row'} spacing={1.5}>
          <Button
            variant="outlined"
            startIcon={<PrintRounded />}
            onClick={onPrintAgain}
            disabled={print.status === 'printing' || print.status === 'none'}
            sx={BIG}
            data-testid="return-print-again"
          >
            Print again
          </Button>
          <Button variant="outlined" onClick={onAnother} sx={{ ...BIG, flex: 1 }} data-testid="return-another">
            Another return for this customer
          </Button>
          <Button
            ref={doneRef}
            variant="contained"
            color="success"
            onClick={onClose}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && Date.now() < armedAt.current) e.preventDefault();
            }}
            disableFocusRipple
            sx={{ ...BIG, minWidth: 140, ...FOCUS_RING }}
            data-testid="return-done"
          >
            Done
          </Button>
        </Stack>
      }
    >
      <Stack spacing={2} alignItems="center" sx={{ textAlign: 'center', pt: narrow ? 0 : 1 }}>
        <CheckCircleRounded color="success" sx={{ fontSize: narrow ? 56 : 72 }} />
        <Box>
          <Typography variant="h4" component="h2" fontWeight={800} data-testid="return-complete">
            {practice ? 'Practice return complete' : 'Return complete'}
          </Typography>
          <Typography variant="h6" data-testid="return-got" sx={{ mt: 0.5 }}>
            {practice
              ? <>Practice: nothing was given. A real one gives {formatCurrency(done.totals.credit)} Thrift+ credit.</>
              : <>{who} got {formatCurrency(done.totals.credit)} Thrift+ credit.</>}
          </Typography>
          {bucks && !practice ? <Typography color="text.secondary" data-testid="return-bucks">{bucks}</Typography> : null}
          {!practice && done.credit != null ? (
            <Typography color="text.secondary" data-testid="return-balance">Their Thrift+ credit is now {formatCurrency(done.credit)}.</Typography>
          ) : null}
        </Box>

        {/* The receipt's line: always there, the same height while it prints and after, so nothing below it moves. */}
        <Box role="status" sx={{ width: '100%', minHeight: 56, display: 'flex', alignItems: 'center', justifyContent: 'center' }} data-testid="return-print">
          {print.status === 'printing' ? (
            <Stack direction="row" spacing={1.5} alignItems="center">
              <CircularProgress size={22} aria-label="Printing" />
              <Typography fontWeight={700}>Printing the return receipt…</Typography>
            </Stack>
          ) : print.status === 'printed' ? (
            <Stack direction="row" spacing={1} alignItems="center">
              <PrintRounded color="success" />
              <Typography fontWeight={700}>The return receipt printed. Hand it to the customer.</Typography>
            </Stack>
          ) : print.status === 'failed' ? (
            <Alert severity="warning" sx={{ width: '100%', textAlign: 'left', fontWeight: 600 }} data-testid="return-print-failed">
              The return receipt did not print. {print.error} The return itself went through. Tap Print again.
            </Alert>
          ) : (
            <Alert severity="warning" sx={{ width: '100%', textAlign: 'left', fontWeight: 600 }} data-testid="return-print-none">
              The return went through, but its receipt could not be made. It is listed in Transactions, Returns.
            </Alert>
          )}
        </Box>

        <Paper variant="outlined" sx={{ p: 2, width: '100%', textAlign: 'left' }} data-testid="return-done-lines">
          <Typography color="text.secondary">
            From ticket <Box component="span" sx={{ whiteSpace: 'nowrap' }}>{receipt.receipt_number}</Box> · {dayOnly(receipt.completed_at)} ·{' '}
            {lines.length === 1 ? '1 item came back' : `${lines.length} items came back`}
          </Typography>
          {lines.map((l) => (
            <Stack key={l.cart_line} direction="row" spacing={1} alignItems="baseline" sx={{ pt: 0.75 }}>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography fontWeight={700}>{l.title}</Typography>
                {l.why ? <Typography variant="body2" color="text.secondary">{l.why}</Typography> : null}
              </Box>
              <Typography sx={{ whiteSpace: 'nowrap' }}>{formatCurrency(l.credit)}</Typography>
            </Stack>
          ))}
        </Paper>

        {receipt.member ? (
          <Button onClick={onMember} sx={{ minHeight: 44 }} data-testid="return-member">
            See their member window
          </Button>
        ) : null}
      </Stack>
    </StepFrame>
  );
}
