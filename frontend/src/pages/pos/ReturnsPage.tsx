import ArrowBackRounded from '@mui/icons-material/ArrowBackRounded';
import SearchRounded from '@mui/icons-material/SearchRounded';
import {
  Alert,
  Avatar,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  List,
  ListItemAvatar,
  ListItemButton,
  ListItemText,
  Paper,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import { useSnackbar } from 'notistack';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { thriftErrorMessage } from '../../api/thriftplusRegister.api';
import {
  findReturns,
  getReturnsReceipt,
  type ReturnsDone,
  type ReturnsFind,
  type ReturnsPerson,
  type ReturnsReceipt,
  type ReturnsTicket,
} from '../../api/thriftplusReturns.api';
import { PageHeader } from '../../components/common/PageHeader';
import { tbNumber } from '../../components/thriftplus/ThriftBucks';
import { useAuth } from '../../contexts/AuthContext';
import { useDeviceConfig } from '../../hooks/useDeviceConfig';
import { formatCurrency } from '../../utils/format';
import LateReturnsTable from './returns/LateReturnsTable';
import ReturnsSummaryStep from './returns/ReturnsSummaryStep';
import { dayOnly, dayTime } from './returns/returnsText';
import { skuFromScan } from '../../utils/scanCode';

type Step = 'find' | 'receipt' | 'summary';

const big = { minHeight: 56, fontSize: '1.1rem', fontWeight: 700, borderRadius: 2 } as const;

function TicketRow({ t, onOpen }: { t: ReturnsTicket; onOpen: (cart: number) => void }) {
  return (
    <ListItemButton onClick={() => onOpen(t.cart)} data-ticket-row sx={{ minHeight: 64, borderRadius: 2 }}>
      <ListItemText
        primary={`${t.receipt_number} · ${formatCurrency(t.total)}`}
        secondary={`${dayTime(t.completed_at)}${t.items != null ? ` · ${t.items} ${t.items === 1 ? 'item' : 'items'}` : ''}${t.member ? ` · ${t.member}` : ' · not a member'}${t.practice ? ' · practice' : ''}`}
        slotProps={{ primary: { fontWeight: 700 } }}
      />
    </ListItemButton>
  );
}

function PersonRow({ p, onPick }: { p: ReturnsPerson; onPick: (id: number) => void }) {
  return (
    <ListItemButton onClick={() => onPick(p.person_id)} sx={{ minHeight: 64, borderRadius: 2 }}>
      <ListItemAvatar>
        <Avatar src={p.photo_url ?? undefined}>{p.first_name.slice(0, 1)}</Avatar>
      </ListItemAvatar>
      <ListItemText
        primary={p.name}
        secondary={[p.contact, p.phone_last4 ? `phone ••${p.phone_last4}` : '', p.status !== 'active' ? p.status : ''].filter(Boolean).join(' · ')}
        slotProps={{ primary: { fontWeight: 700 } }}
      />
    </ListItemButton>
  );
}

/**
 * Returns (owner 2026-10-20), its own page in the Cashier menu: SUPER FAST, keyboard and scanner first.
 * 1. Find the receipt by anything: the member (QR, name, phone, email, member #), the ticket (the receipt #, a date or the
 *    total) or an item (its tag, or words from it). A single ticket opens at once.
 * 2. Tick the lines coming back (scan an item tag to tick it). Returnable on top, AS IS greyed with the reason below.
 * 3. Summary and Confirm. Past the 3 days: the owner PIN and a reason (a mark against Retail).
 * 4. Done: the credit is on the member and their member card opens (`/pos/members?person=<id>`).
 * The server is `apps/thriftplus` `returns/find|receipt|preview|batch`. `?practice=1` is the training register: it works
 * the return out and writes nothing.
 */
export default function ReturnsPage() {
  const { enqueueSnackbar } = useSnackbar();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { user } = useAuth();
  const device = useDeviceConfig();
  const practice = params.get('practice') === '1';
  const registerCode = practice ? 'TRAIN' : (device.config?.registerCode ?? '');
  const canSeeLate = Boolean(user?.is_superuser || user?.role === 'Manager' || user?.role === 'Admin');

  const [tab, setTab] = useState<'return' | 'late'>('return');
  const [step, setStep] = useState<Step>('find');
  const [q, setQ] = useState('');
  const [found, setFound] = useState<ReturnsFind | null>(null);
  const [searching, setSearching] = useState(false);
  const [receipt, setReceipt] = useState<ReturnsReceipt | null>(null);
  const [ticked, setTicked] = useState<number[]>([]);
  const [scan, setScan] = useState('');
  const [scanNote, setScanNote] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const scanRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (tab === 'return' && step === 'find') searchRef.current?.focus();
    if (tab === 'return' && step === 'receipt') scanRef.current?.focus();
  }, [tab, step]);

  const openReceipt = useCallback((next: ReturnsReceipt) => {
    setReceipt(next);
    setTicked([]);
    setScan('');
    setScanNote('');
    setStep('receipt');
  }, []);

  async function search(text = q, person?: number) {
    const typed = text.trim();
    if (!typed && person == null) return;
    setSearching(true);
    try {
      const answer = await findReturns(typed, person != null ? { person, register: registerCode } : { register: registerCode });
      setFound(answer);
      if (answer.receipt) openReceipt(answer.receipt);
      else setQ('');
    } catch (err) {
      enqueueSnackbar(thriftErrorMessage(err, 'Could not search. Try again.'), { variant: 'error' });
    } finally {
      setSearching(false);
    }
  }

  async function open(cart: number) {
    setSearching(true);
    try {
      openReceipt(await getReturnsReceipt(cart, registerCode));
    } catch (err) {
      enqueueSnackbar(thriftErrorMessage(err, 'Could not open that ticket.'), { variant: 'error' });
    } finally {
      setSearching(false);
    }
  }

  function reset() {
    setStep('find');
    setReceipt(null);
    setFound(null);
    setTicked([]);
    setQ('');
  }

  const returnable = useMemo(() => (receipt?.lines ?? []).filter((l) => l.state === 'returnable'), [receipt]);
  const rest = useMemo(() => (receipt?.lines ?? []).filter((l) => l.state !== 'returnable'), [receipt]);

  function toggle(id: number) {
    setTicked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  }

  /** Scanning an item tag while the receipt is open ticks that line. */
  function scanned(raw: string) {
    const code = skuFromScan(raw).toLowerCase();
    setScan('');
    if (!code) {
      if (ticked.length) setStep('summary');
      return;
    }
    const line = receipt?.lines.find((l) => l.sku.toLowerCase() === code);
    if (!line) {
      setScanNote(`${skuFromScan(raw)} is not on this ticket.`);
      return;
    }
    if (line.state !== 'returnable') {
      setScanNote(`${line.title}: ${line.why || 'cannot come back'}`);
      return;
    }
    setScanNote('');
    toggle(line.cart_line);
  }

  function done(result: ReturnsDone) {
    if (result.training) {
      enqueueSnackbar('Practice: nothing was given.', { variant: 'info' });
      reset();
      return;
    }
    enqueueSnackbar(
      `Thrift+ credit added: ${formatCurrency(result.totals.credit)}${Number(result.totals.bucks_taken) > 0 ? ` · ThriftBucks taken back ${tbNumber(result.totals.bucks_taken)}` : ''}`,
      { variant: 'success' },
    );
    reset();
    navigate(`/pos/members?person=${result.person_id}`);
  }

  const tickedCredit = receipt ? receipt.lines.filter((l) => ticked.includes(l.cart_line)).reduce((sum, l) => sum + Number(l.refund), 0) : 0;

  return (
    <Box sx={{ maxWidth: 900 }}>
      <PageHeader title={practice ? 'Returns (practice)' : 'Returns'} subtitle="Thrift+ 3-day returns: 80% back as Thrift+ credit." />
      {canSeeLate ? (
        <Tabs value={tab} onChange={(_e, next: 'return' | 'late') => setTab(next)} sx={{ mb: 2 }}>
          <Tab value="return" label="Take a return" sx={{ textTransform: 'none', fontWeight: 700 }} />
          <Tab value="late" label="Late returns" sx={{ textTransform: 'none', fontWeight: 700 }} />
        </Tabs>
      ) : null}
      {tab === 'late' ? <LateReturnsTable /> : null}
      {tab === 'return' && practice ? (
        <Alert severity="warning" sx={{ mb: 2 }}>Practice: this works out what a return would give. Nothing is written.</Alert>
      ) : null}

      {tab === 'return' && step === 'find' ? (
        <Stack spacing={2}>
          <Stack direction="row" spacing={1}>
            <TextField
              inputRef={searchRef}
              autoFocus
              fullWidth
              label="Find the receipt: scan it or an item tag, or type a name, phone, ticket #, date, total or item"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void search();
                if (e.key === 'ArrowDown') resultsRef.current?.querySelector<HTMLElement>('[data-ticket-row],[role=button]')?.focus();
              }}
              slotProps={{ htmlInput: { 'data-testid': 'returns-search', autoComplete: 'off' } }}
            />
            <Button variant="contained" onClick={() => void search()} disabled={searching || !q.trim()} startIcon={<SearchRounded />} sx={{ ...big, px: 3 }}>
              Find
            </Button>
          </Stack>
          {searching ? <CircularProgress size={28} aria-label="Searching" /> : null}
          {found?.message ? <Alert severity="info" data-testid="returns-message">{found.message}</Alert> : null}
          <Box ref={resultsRef}>
            {found?.person ? (
              <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 1 }}>
                <Avatar src={found.person.photo_url ?? undefined} sx={{ width: 48, height: 48 }}>{found.person.first_name.slice(0, 1)}</Avatar>
                <Typography variant="h6" fontWeight={800}>{found.person.name}</Typography>
              </Stack>
            ) : null}
            {found?.people.length && !found.person ? (
              <>
                <Typography fontWeight={700} sx={{ mb: 0.5 }}>Who?</Typography>
                <List disablePadding>
                  {found.people.map((p) => (
                    <PersonRow key={p.person_id} p={p} onPick={(id) => void search('', id)} />
                  ))}
                </List>
              </>
            ) : null}
            {found?.tickets.length ? (
              <>
                <Typography fontWeight={700} sx={{ mb: 0.5 }}>{found.person ? 'Recent tickets, newest first' : 'Tickets'}</Typography>
                <List disablePadding data-testid="returns-tickets">
                  {found.tickets.map((t) => (
                    <TicketRow key={t.cart} t={t} onOpen={(cart) => void open(cart)} />
                  ))}
                </List>
              </>
            ) : null}
            {found && found.person && !found.tickets.length ? (
              <Alert severity="info">No sales on this membership lately.</Alert>
            ) : null}
          </Box>
        </Stack>
      ) : null}

      {tab === 'return' && step === 'receipt' && receipt ? (
        <Stack spacing={2}>
          <Button startIcon={<ArrowBackRounded />} onClick={reset} sx={{ alignSelf: 'flex-start' }}>Find another receipt</Button>
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Typography variant="h6" fontWeight={800} data-testid="receipt-head">
              {receipt.receipt_number} · {formatCurrency(receipt.total)}
            </Typography>
            <Typography color="text.secondary">
              {dayTime(receipt.completed_at)}{receipt.member ? ` · ${receipt.member.name}` : ' · not a Thrift+ member'}
              {receipt.cashier ? ` · rung by ${receipt.cashier}` : ''}
            </Typography>
            {receipt.late ? (
              <Alert severity="warning" sx={{ mt: 1 }} data-testid="receipt-late">
                The 3 days ended {dayOnly(receipt.deadline)}. A return now needs a manager's PIN and is marked against Retail.
              </Alert>
            ) : (
              <Typography sx={{ mt: 0.5 }} fontWeight={700}>Returns through {dayOnly(receipt.deadline)}.</Typography>
            )}
            {receipt.closed_note && !receipt.late ? <Typography variant="body2" color="text.secondary">{receipt.closed_note}</Typography> : null}
          </Paper>

          <TextField
            inputRef={scanRef}
            autoFocus
            size="small"
            label="Scan an item tag to tick it (Enter with nothing typed: summary)"
            value={scan}
            onChange={(e) => setScan(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && scanned(scan)}
            slotProps={{ htmlInput: { 'data-testid': 'returns-scan', autoComplete: 'off' } }}
          />
          {scanNote ? <Alert severity="warning" data-testid="returns-scan-note">{scanNote}</Alert> : null}

          <Box>
            <Stack direction="row" alignItems="center" justifyContent="space-between">
              <Typography fontWeight={800}>Returnable</Typography>
              {returnable.length > 1 ? (
                <Button size="small" onClick={() => setTicked(ticked.length === returnable.length ? [] : returnable.map((l) => l.cart_line))}>
                  {ticked.length === returnable.length ? 'Untick all' : 'Tick all'}
                </Button>
              ) : null}
            </Stack>
            {returnable.length === 0 ? <Alert severity="info">Nothing on this ticket can come back.</Alert> : null}
            <List disablePadding>
              {returnable.map((l) => (
                <ListItemButton key={l.cart_line} onClick={() => toggle(l.cart_line)} selected={ticked.includes(l.cart_line)}
                  sx={{ minHeight: 64, borderRadius: 2 }} data-testid={`line-${l.cart_line}`}>
                  <Checkbox edge="start" checked={ticked.includes(l.cart_line)} tabIndex={-1} disableRipple slotProps={{ input: { 'aria-label': `Return ${l.title}` } }} />
                  <ListItemText
                    primary={`${l.title}${l.late ? '  ·  LATE' : ''}`}
                    secondary={`${l.sku} · ${formatCurrency(l.price)} · back ${formatCurrency(l.refund)} Thrift+ credit`}
                    slotProps={{ primary: { fontWeight: 700, color: l.late ? 'warning.dark' : undefined } }}
                  />
                </ListItemButton>
              ))}
            </List>
          </Box>

          {rest.length ? (
            <Box>
              <Typography fontWeight={800} color="text.secondary">AS IS</Typography>
              <List disablePadding sx={{ opacity: 0.6 }} data-testid="returns-as-is">
                {rest.map((l) => (
                  <ListItemText
                    key={l.cart_line}
                    sx={{ px: 2, py: 0.75 }}
                    primary={l.title}
                    secondary={`${l.sku} · ${formatCurrency(l.price)} · ${l.why || 'Sold AS IS.'}`}
                  />
                ))}
              </List>
            </Box>
          ) : null}

          <Button
            variant="contained"
            disabled={!ticked.length}
            onClick={() => setStep('summary')}
            sx={big}
            data-testid="returns-next"
          >
            {ticked.length ? `Next: summary (${ticked.length} ${ticked.length === 1 ? 'item' : 'items'}, ${formatCurrency(tickedCredit)})` : 'Tick the items coming back'}
          </Button>
        </Stack>
      ) : null}

      {tab === 'return' && step === 'summary' && receipt ? (
        <ReturnsSummaryStep
          receipt={receipt}
          lines={ticked}
          registerCode={registerCode}
          practice={practice || receipt.practice}
          onBack={() => setStep('receipt')}
          onDone={done}
        />
      ) : null}
    </Box>
  );
}
