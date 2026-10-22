import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  Grid,
  InputLabel,
  MenuItem,
  Radio,
  RadioGroup,
  Select,
  TextField,
  Typography,
} from '@mui/material';
import { useQueryClient } from '@tanstack/react-query';
import LockReset from '@mui/icons-material/LockReset';
import SwapHoriz from '@mui/icons-material/SwapHoriz';
import MoveDown from '@mui/icons-material/MoveDown';
import ExpandMore from '@mui/icons-material/ExpandMore';
import ExpandLess from '@mui/icons-material/ExpandLess';
import { useSnackbar } from 'notistack';
import { PageHeader } from '../../components/common/PageHeader';
import { LoadingScreen } from '../../components/feedback/LoadingScreen';
import DenominationCounter, {
  EMPTY_BREAKDOWN,
  calculateTotal,
} from '../../components/forms/DenominationCounter';
import {
  useRegisters,
  useDrawers,
  useOpenDrawer,
  useCloseDrawer,
  useReopenDrawer,
  useDrawerHandoff,
} from '../../hooks/usePOS';
import { useCashDrop } from '../../hooks/useCashManagement';
import { useUsers } from '../../hooks/useEmployees';
import { useAuth } from '../../contexts/AuthContext';
import { useDeviceConfig } from '../../hooks/useDeviceConfig';
import type { DenominationBreakdown } from '../../types/pos.types';
import type { CountCheck, Drawer, SuspendedSaleTab } from '../../types/pos.types';
import CountCheckDialog from '../../components/pos/CountCheckDialog';
import { moveDrawerCash } from '../../api/pos.api';
import { tabDetail, tabLabel } from '../../components/pos/SuspendedSalesBar';
import { format } from 'date-fns';
import { IconAdd as Add, IconRemove as Remove } from '../../icons/ecoIcons';
import { TRAINING_REGISTER_LABEL, sortRegistersForSetup } from '../../utils/trainingRegister';

const DRAWER_LIST_PARAMS = { include_training: 1 };

function formatCurrency(value: string | number): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num ?? 0);
}

function movementTotal(drawer: Drawer, kind: 'paid_in' | 'paid_out'): number {
  return (drawer.movements ?? [])
    .filter((m) => m.kind === kind)
    .reduce((s, m) => s + (parseFloat(String(m.total)) || 0), 0);
}

const COINS_ONLY = { quarters: 0, dimes: 0, nickels: 0, pennies: 0 };

function apiDetail(err: unknown, fallback: string): string {
  return (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? fallback;
}

export default function DrawerListPage() {
  const { enqueueSnackbar } = useSnackbar();
  const { user, hasRole } = useAuth();
  const { config } = useDeviceConfig();
  const isManager = hasRole('Manager') || hasRole('Admin');
  const myRegisterId = config?.deviceType === 'register' ? config?.registerId : null;

  const queryClient = useQueryClient();
  const [openDialog, setOpenDialog] = useState<
    'open' | 'close' | 'handoff' | 'drop' | 'reopen' | 'paid_in' | 'paid_out' | null
  >(null);
  // A blind count's answer (2026-10-21): shown only after the count is in.
  const [check, setCheck] = useState<{ title: string; data: CountCheck } | null>(null);
  // The office close: bills by hand; coins by coin or the coin counter's total; a note when far off.
  const [coinsMode, setCoinsMode] = useState<'count' | 'total'>('count');
  const [coinCount, setCoinCount] = useState<DenominationBreakdown>(EMPTY_BREAKDOWN);
  const [coinsTotal, setCoinsTotal] = useState('');
  const [closeNote, setCloseNote] = useState('');
  // The server's answer when the count is too far off for no note (the owner's pos.close_note_over).
  const [noteNeeded, setNoteNeeded] = useState('');
  // Drops, paid in and paid out say why.
  const [reason, setReason] = useState('');
  const [moveDrawer, setMoveDrawer] = useState<number | null>(null);
  const [moving, setMoving] = useState(false);
  const [reopenDrawerId, setReopenDrawerId] = useState<number | null>(null);
  const [selectedRegister, setSelectedRegister] = useState<number | ''>('');
  const [selectedDrawer, setSelectedDrawer] = useState<Drawer | null>(null);
  const [handoffDrawer, setHandoffDrawer] = useState<number | null>(null);
  const [handoffCashier, setHandoffCashier] = useState<string>('');
  const [dropDrawer, setDropDrawer] = useState<number | null>(null);
  const [count, setCount] = useState<DenominationBreakdown>(EMPTY_BREAKDOWN);
  const [expandedCard, setExpandedCard] = useState<number | null>(null);
  // Sales set aside at the register (Suspend): closing warns, and the second try deletes them.
  const [setAside, setSetAside] = useState<SuspendedSaleTab[] | null>(null);

  const { data: registersData, isLoading: regLoading } = useRegisters();
  // The server leaves the training register's drawer out of lists unless asked; this page asks so it
  // can show that drawer on its own clearly labelled card (last, practice only, no cash drops).
  const { data: drawersData, isLoading: drawersLoading } = useDrawers(DRAWER_LIST_PARAMS);
  const openDrawerMutation = useOpenDrawer();
  const closeDrawerMutation = useCloseDrawer();
  const reopenDrawerMutation = useReopenDrawer();
  const handoffMutation = useDrawerHandoff();
  const cashDropMutation = useCashDrop();

  const registers = registersData?.results ?? [];
  const drawers = drawersData?.results ?? [];

  // Cashiers with no device config fall back to showing nothing - they need to configure
  // their device from the POS Terminal page first so we know which register they own.
  const cashierUnconfigured = !isManager && myRegisterId == null;
  const registersToShow = sortRegistersForSetup(
    isManager
      ? registers
      : registers.filter((r: { id: number }) => r.id === myRegisterId),
  );

  const { data: usersData } = useUsers({ page_size: 200 });
  const usersForHandoff = usersData?.results ?? [];

  const handleOpenDrawer = async () => {
    if (!selectedRegister || typeof selectedRegister !== 'number') return;
    const total = calculateTotal(count);
    try {
      const opened = await openDrawerMutation.mutateAsync({
        register: selectedRegister,
        opening_count: count,
        opening_total: total,
      });
      enqueueSnackbar('Drawer opened', { variant: 'success' });
      if (opened?.count_check) setCheck({ title: 'Opening count', data: opened.count_check });
      setOpenDialog(null);
      setSelectedRegister('');
      setCount(EMPTY_BREAKDOWN);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        'Failed to open drawer';
      enqueueSnackbar(msg, { variant: 'error' });
    }
  };

  const handleCloseDrawer = async (voidSuspended = false) => {
    if (!selectedDrawer) return;
    const bills = { ...count, ...COINS_ONLY };
    const closingCount = coinsMode === 'count' ? { ...bills, ...pickCoins(coinCount) } : bills;
    if (coinsMode === 'total' && coinsTotal.trim() === '') {
      enqueueSnackbar("Enter the coin counter's total.", { variant: 'warning' });
      return;
    }
    try {
      const closed = await closeDrawerMutation.mutateAsync({
        id: selectedDrawer.id,
        data: {
          closing_count: closingCount,
          ...(coinsMode === 'total' ? { coins_total: coinsTotal.trim() } : {}),
          ...(closeNote.trim() ? { note: closeNote.trim() } : {}),
          ...(voidSuspended ? { void_suspended: true } : {}),
        },
      });
      if (closed?.count_check) setCheck({ title: `${selectedDrawer.register_name}: closed`, data: closed.count_check });
      enqueueSnackbar(voidSuspended ? 'Drawer closed. Sales set aside were deleted.' : 'Drawer closed', {
        variant: 'success',
      });
      setSetAside(null);
      resetDialog();
    } catch (err: unknown) {
      const body = (err as {
        response?: { data?: { code?: string; detail?: string; suspended?: SuspendedSaleTab[] } };
      })?.response?.data;
      if (body?.code === 'SUSPENDED_SALES') {
        setSetAside(body.suspended ?? []);
        return;
      }
      if (body?.code === 'NOTE_REQUIRED') {
        // Still blind: only that it is too far off, not by how much.
        setNoteNeeded(body.detail ?? 'Add a note saying why.');
        return;
      }
      enqueueSnackbar(body?.detail ?? 'Failed to close drawer', { variant: 'error' });
    }
  };

  const handleHandoff = async () => {
    if (!handoffDrawer || !handoffCashier) return;
    try {
      const handed = await handoffMutation.mutateAsync({
        id: handoffDrawer,
        data: {
          incoming_cashier: Number(handoffCashier),
          count: { ...count, ...COINS_ONLY },
        },
      });
      enqueueSnackbar('Handoff completed', { variant: 'success' });
      const handCheck = (handed as unknown as { count_check?: CountCheck })?.count_check;
      if (handCheck) setCheck({ title: 'Handoff count (bills)', data: handCheck });
      setOpenDialog(null);
      setHandoffDrawer(null);
      setHandoffCashier('');
      setCount(EMPTY_BREAKDOWN);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        'Failed to complete handoff';
      enqueueSnackbar(msg, { variant: 'error' });
    }
  };

  const handleCashDrop = async () => {
    if (!dropDrawer) return;
    const total = calculateTotal(count);
    if (total <= 0) {
      enqueueSnackbar('Enter drop amount', { variant: 'warning' });
      return;
    }
    if (!reason.trim()) {
      enqueueSnackbar('Say why the cash is dropped.', { variant: 'warning' });
      return;
    }
    try {
      await cashDropMutation.mutateAsync({
        drawerId: dropDrawer,
        data: { amount: count, total: total.toFixed(2), reason: reason.trim() },
      });
      enqueueSnackbar('Cash drop recorded', { variant: 'success' });
      resetDialog();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        'Failed to record cash drop';
      enqueueSnackbar(msg, { variant: 'error' });
    }
  };

  const handleMoveCash = async () => {
    if (!moveDrawer || (openDialog !== 'paid_in' && openDialog !== 'paid_out')) return;
    const total = calculateTotal(count);
    if (total <= 0 || !reason.trim()) {
      enqueueSnackbar('Enter the cash and say what it is for.', { variant: 'warning' });
      return;
    }
    setMoving(true);
    try {
      await moveDrawerCash(moveDrawer, openDialog === 'paid_in' ? 'paid-in' : 'paid-out', {
        amount: count,
        total: total.toFixed(2),
        reason: reason.trim(),
      });
      enqueueSnackbar(openDialog === 'paid_in' ? 'Paid in recorded' : 'Paid out recorded', { variant: 'success' });
      void queryClient.invalidateQueries({ queryKey: ['drawers'] });
      resetDialog();
    } catch (err: unknown) {
      enqueueSnackbar(apiDetail(err, 'Could not record it'), { variant: 'error' });
    } finally {
      setMoving(false);
    }
  };

  const handleReopenDrawer = async () => {
    if (!reopenDrawerId) return;
    try {
      await reopenDrawerMutation.mutateAsync({ id: reopenDrawerId });
      enqueueSnackbar('Drawer reopened', { variant: 'success' });
      resetDialog();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        'Failed to reopen drawer';
      enqueueSnackbar(msg, { variant: 'error' });
    }
  };

  const resetDialog = () => {
    setOpenDialog(null);
    setSelectedRegister('');
    setSelectedDrawer(null);
    setHandoffDrawer(null);
    setHandoffCashier('');
    setDropDrawer(null);
    setReopenDrawerId(null);
    setCount(EMPTY_BREAKDOWN);
    setCoinCount(EMPTY_BREAKDOWN);
    setCoinsMode('count');
    setCoinsTotal('');
    setCloseNote('');
    setNoteNeeded('');
    setReason('');
    setMoveDrawer(null);
  };

  function pickCoins(c: DenominationBreakdown) {
    return { quarters: c.quarters, dimes: c.dimes, nickels: c.nickels, pennies: c.pennies };
  }

  if (regLoading || drawersLoading) return <LoadingScreen message="Loading drawers..." />;

  return (
    <Box>
      <PageHeader
        title="Drawers"
        subtitle={isManager ? 'Manage all register drawers' : 'Your register drawer'}
      />

      {cashierUnconfigured && (
        <Alert severity="info" sx={{ mb: 3 }}>
          This device hasn't been configured yet. Go to <strong>POS Terminal</strong> and click the
          settings icon to identify which register this device is. Once configured, you'll see your
          register drawer here.
        </Alert>
      )}

      <Grid container spacing={2}>
        {registersToShow.map((reg: { id: number; name: string; code: string; is_training?: boolean }) => {
          const drawer = drawers.find((d: { register: number }) => d.register === reg.id) as Drawer | undefined;
          const isOpen = drawer?.status === 'open';
          const mine = Boolean(drawer && user && String(drawer.current_cashier) === String(user.id));
          const expanded = expandedCard === reg.id;
          const training = Boolean(reg.is_training);

          return (
            <Grid key={reg.id} size={{ xs: 12, md: 6, lg: 4 }}>
              <Card sx={training ? { borderTop: 4, borderColor: 'warning.main' } : undefined}>
                <CardContent>
                  {training && (
                    <Typography variant="overline" color="warning.dark" sx={{ fontWeight: 700, display: 'block' }}>
                      {TRAINING_REGISTER_LABEL}
                    </Typography>
                  )}
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
                    <Typography variant="h6">
                      {reg.name} ({reg.code})
                    </Typography>
                    <Chip
                      size="small"
                      label={!drawer ? 'No session' : isOpen ? 'Open' : 'Closed'}
                      color={!drawer ? 'warning' : isOpen ? 'success' : 'default'}
                      variant={!drawer ? 'outlined' : 'filled'}
                    />
                  </Box>
                  {!drawer ? (
                    <Box sx={{ mt: 1 }}>
                      <Button
                        size="small"
                        variant="contained"
                        startIcon={<Add />}
                        onClick={() => {
                          setSelectedRegister(reg.id);
                          setOpenDialog('open');
                        }}
                        disabled={openDrawerMutation.isPending}
                      >
                        Open drawer
                      </Button>
                    </Box>
                  ) : (
                    <>
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                        Cashier: {drawer.current_cashier_name ?? '-'}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Opened: {drawer.opened_at ? format(new Date(drawer.opened_at), 'PPp') : '-'}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Opening: {formatCurrency(drawer.opening_total)}
                        {/* Counts are blind (2026-10-21): a cashier does not see the running cash total. */}
                        {(isManager || !isOpen) && <> · Cash sales: {formatCurrency(drawer.cash_sales_total)}</>}
                      </Typography>
                      {drawer.drops && drawer.drops.length > 0 && (
                        <Typography variant="body2" color="text.secondary">
                          Drops: {drawer.drops.length} ({formatCurrency(drawer.drops.reduce((s, d) => s + (parseFloat(String(d.total)) || 0), 0))})
                        </Typography>
                      )}
                      {(movementTotal(drawer, 'paid_in') > 0 || movementTotal(drawer, 'paid_out') > 0) && (
                        <Typography variant="body2" color="text.secondary">
                          Paid in: {formatCurrency(movementTotal(drawer, 'paid_in'))} · Paid out:{' '}
                          {formatCurrency(movementTotal(drawer, 'paid_out'))}
                        </Typography>
                      )}
                      {drawer.status === 'closed' && drawer.variance != null && (
                        <Typography variant="body2" color={Math.abs(parseFloat(drawer.variance)) > 5 ? 'error' : 'text.secondary'}>
                          Closed {parseFloat(drawer.variance) >= 0 ? 'over' : 'short'}{' '}
                          {formatCurrency(Math.abs(parseFloat(drawer.variance)))}
                          {drawer.close_note ? ` · ${drawer.close_note}` : ''}
                        </Typography>
                      )}
                      {training && (
                        <Typography variant="body2" color="warning.dark" sx={{ mt: 1 }}>
                          Practice drawer: not real cash. Cash drops are not recorded.
                        </Typography>
                      )}
                      {isOpen && (
                        <Box sx={{ display: 'flex', gap: 1, mt: 2, flexWrap: 'wrap' }}>
                          {!training && (
                            <Button
                              size="small"
                              variant="outlined"
                              startIcon={<MoveDown />}
                              onClick={() => {
                                setDropDrawer(drawer.id);
                                setOpenDialog('drop');
                              }}
                              disabled={cashDropMutation.isPending}
                            >
                              Cash drop
                            </Button>
                          )}
                          {!training && (
                            <>
                              <Button
                                size="small"
                                variant="outlined"
                                onClick={() => {
                                  setMoveDrawer(drawer.id);
                                  setOpenDialog('paid_in');
                                }}
                              >
                                Paid in
                              </Button>
                              <Button
                                size="small"
                                variant="outlined"
                                onClick={() => {
                                  setMoveDrawer(drawer.id);
                                  setOpenDialog('paid_out');
                                }}
                              >
                                Paid out
                              </Button>
                            </>
                          )}
                          {(isManager || mine) && (
                            <>
                              {isManager && (
                              <Button
                                size="small"
                                variant="outlined"
                                startIcon={<SwapHoriz />}
                                onClick={() => {
                                  setHandoffDrawer(drawer.id);
                                  setOpenDialog('handoff');
                                }}
                                disabled={handoffMutation.isPending}
                              >
                                Handoff
                              </Button>
                              )}
                              <Button
                                size="small"
                                variant="contained"
                                color="error"
                                startIcon={<Remove />}
                                onClick={() => {
                                  setSelectedDrawer(drawer);
                                  setOpenDialog('close');
                                }}
                                disabled={closeDrawerMutation.isPending}
                              >
                                Close drawer
                              </Button>
                            </>
                          )}
                        </Box>
                      )}
                      {!isOpen && drawer.status === 'closed' && isManager && (
                        <Box sx={{ mt: 2 }}>
                          <Button
                            size="small"
                            variant="outlined"
                            color="warning"
                            startIcon={<LockReset />}
                            onClick={() => {
                              setReopenDrawerId(drawer.id);
                              setOpenDialog('reopen');
                            }}
                            disabled={reopenDrawerMutation.isPending}
                          >
                            Reopen drawer
                          </Button>
                        </Box>
                      )}
                      {(drawer.handoffs?.length > 0 || drawer.drops?.length > 0 || (drawer.movements?.length ?? 0) > 0) && (
                        <>
                          <Button
                            size="small"
                            startIcon={expanded ? <ExpandLess /> : <ExpandMore />}
                            onClick={() => setExpandedCard(expanded ? null : reg.id)}
                            sx={{ mt: 1 }}
                          >
                            {expanded ? 'Hide' : 'View'} detail
                          </Button>
                          <Collapse in={expanded}>
                            <Box sx={{ mt: 1, pl: 1, borderLeft: 2, borderColor: 'divider' }}>
                              {drawer.handoffs && drawer.handoffs.length > 0 && (
                                <Typography variant="caption" color="text.secondary" display="block">
                                  Handoffs: {drawer.handoffs.map((h) => {
                                    const who = h.incoming_cashier_name ?? '';
                                    if (!isManager || h.variance == null) return who;
                                    const v = parseFloat(h.variance);
                                    return `${who} (${h.bills_only ? 'bills ' : ''}${v === 0 ? 'right on' : `${v > 0 ? 'over' : 'short'} ${formatCurrency(Math.abs(v))}`})`;
                                  }).join(', ')}
                                </Typography>
                              )}
                              {drawer.drops && drawer.drops.length > 0 && (
                                <Typography variant="caption" color="text.secondary" display="block">
                                  Drops: {drawer.drops.map((d) => `${formatCurrency(d.total)} @ ${format(new Date(d.dropped_at), 'HH:mm')}${d.reason ? ` (${d.reason})` : ''}`).join('; ')}
                                </Typography>
                              )}
                              {(drawer.movements ?? []).map((m) => (
                                <Typography key={m.id} variant="caption" color="text.secondary" display="block">
                                  {m.kind === 'paid_in' ? 'Paid in' : 'Paid out'} {formatCurrency(m.total)} @ {format(new Date(m.created_at), 'HH:mm')}: {m.reason}
                                  {m.performed_by_name ? ` · ${m.performed_by_name}` : ''}
                                </Typography>
                              ))}
                            </Box>
                          </Collapse>
                        </>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>
            </Grid>
          );
        })}
      </Grid>

      <Dialog open={openDialog === 'open'} onClose={resetDialog} maxWidth="sm" fullWidth>
        <DialogTitle>Open drawer</DialogTitle>
        <DialogContent>
          <Box sx={{ mt: 1 }}>
            <DenominationCounter value={count} onChange={setCount} label="Opening count" />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={resetDialog}>Cancel</Button>
          <Button variant="contained" onClick={handleOpenDrawer} disabled={openDrawerMutation.isPending}>
            Open
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={openDialog === 'close'} onClose={resetDialog} maxWidth="sm" fullWidth>
        <DialogTitle>Close drawer (office count)</DialogTitle>
        <DialogContent>
          <Box sx={{ mt: 1 }}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Count blind: what Dash expects shows after you submit. Bills by hand; coins from the coin counter.
              Everything counted goes into the office drawer.
            </Typography>
            <DenominationCounter value={count} onChange={setCount} only="bills" label="Bills (counted by hand)" />
            <Box sx={{ mt: 2 }}>
              <RadioGroup
                row
                value={coinsMode}
                onChange={(e) => setCoinsMode(e.target.value as 'count' | 'total')}
                aria-label="How the coins were counted"
              >
                <FormControlLabel value="count" control={<Radio />} label="Coins by coin" />
                <FormControlLabel value="total" control={<Radio />} label="Coin counter total" />
              </RadioGroup>
              {coinsMode === 'count' ? (
                <DenominationCounter value={coinCount} onChange={setCoinCount} only="coins" label="Coins" />
              ) : (
                <TextField
                  label="Coin counter total"
                  value={coinsTotal}
                  onChange={(e) => setCoinsTotal(e.target.value.replace(/[^0-9.]/g, ''))}
                  inputProps={{ inputMode: 'decimal' }}
                  fullWidth
                  sx={{ mt: 1 }}
                />
              )}
            </Box>
            {noteNeeded && (
              <Alert severity="warning" sx={{ mt: 2 }} data-testid="close-note-needed">
                {noteNeeded}
              </Alert>
            )}
            <TextField
              label={noteNeeded ? 'Note (needed)' : 'Note (needed when the count is far off)'}
              value={closeNote}
              onChange={(e) => setCloseNote(e.target.value)}
              error={Boolean(noteNeeded) && !closeNote.trim()}
              fullWidth
              multiline
              minRows={2}
              sx={{ mt: 2 }}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={resetDialog}>Cancel</Button>
          <Button
            variant="contained"
            color="error"
            onClick={() => handleCloseDrawer()}
            disabled={closeDrawerMutation.isPending}
          >
            Close drawer
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={openDialog === 'handoff'} onClose={resetDialog} maxWidth="sm" fullWidth>
        <DialogTitle>Drawer handoff</DialogTitle>
        <DialogContent>
          <FormControl fullWidth size="small" sx={{ mt: 2, mb: 2 }}>
            <InputLabel id="handoff-cashier-label">Incoming cashier</InputLabel>
            <Select
              labelId="handoff-cashier-label"
              value={handoffCashier}
              label="Incoming cashier"
              onChange={(e) => setHandoffCashier(e.target.value)}
            >
              <MenuItem value="">Select…</MenuItem>
              {usersForHandoff
                .filter((u: { id: number }) => !user || String(u.id) !== String(user.id))
                .map((u: { id: number; full_name: string }) => (
                  <MenuItem key={u.id} value={String(u.id)}>
                    {u.full_name}
                  </MenuItem>
                ))}
            </Select>
          </FormControl>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Count the bills only. Coins are counted in the office at the end of the day.
          </Typography>
          <DenominationCounter value={count} onChange={setCount} only="bills" label="Handoff count (bills)" />
        </DialogContent>
        <DialogActions>
          <Button onClick={resetDialog}>Cancel</Button>
          <Button variant="contained" onClick={handleHandoff} disabled={handoffMutation.isPending}>
            Handoff
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={openDialog === 'drop'} onClose={resetDialog} maxWidth="sm" fullWidth>
        <DialogTitle>Cash drop</DialogTitle>
        <DialogContent>
          <Box sx={{ mt: 1 }}>
            <DenominationCounter value={count} onChange={setCount} label="Drop amount" />
            <TextField
              label="Reason"
              placeholder="Too much cash in the drawer"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              fullWidth
              required
              sx={{ mt: 2 }}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={resetDialog}>Cancel</Button>
          <Button variant="contained" onClick={handleCashDrop} disabled={cashDropMutation.isPending}>
            {cashDropMutation.isPending ? 'Processing…' : 'Drop'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={openDialog === 'paid_in' || openDialog === 'paid_out'} onClose={resetDialog} maxWidth="sm" fullWidth>
        <DialogTitle>{openDialog === 'paid_in' ? 'Paid in' : 'Paid out'}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1, mb: 1 }}>
            {openDialog === 'paid_in'
              ? 'Cash put into the drawer that is not a sale, like change brought from the office.'
              : 'Cash taken out of the drawer that is not a sale or a drop, like a small purchase.'}
          </Typography>
          <DenominationCounter value={count} onChange={setCount} label="Amount" />
          <TextField
            label="What it is for"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            fullWidth
            required
            sx={{ mt: 2 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={resetDialog}>Cancel</Button>
          <Button variant="contained" onClick={() => void handleMoveCash()} disabled={moving}>
            {moving ? 'Saving…' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>

      <CountCheckDialog check={check?.data ?? null} title={check?.title ?? ''} onClose={() => setCheck(null)} />

      <Dialog open={setAside != null} onClose={() => setSetAside(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Sales are set aside</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 1 }}>
            {setAside?.length === 1 ? '1 sale is' : `${setAside?.length ?? 0} sales are`} set aside at this register.
            Closing the drawer deletes {setAside?.length === 1 ? 'it' : 'them'}, and the items go back on the shelf.
          </Typography>
          {(setAside ?? []).map((tab) => (
            <Typography key={tab.id} variant="body2" fontWeight={600}>
              {tabLabel(tab)}: {tabDetail(tab)}
            </Typography>
          ))}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSetAside(null)}>Go back</Button>
          <Button
            variant="contained"
            color="warning"
            onClick={() => handleCloseDrawer(true)}
            disabled={closeDrawerMutation.isPending}
          >
            Close and delete them
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={openDialog === 'reopen'} onClose={resetDialog} maxWidth="xs" fullWidth>
        <DialogTitle>Reopen drawer?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            This will reopen the closed drawer and allow sales to continue. The cashier who last
            held the drawer will be reassigned. Closing data is preserved for the audit record.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={resetDialog}>Cancel</Button>
          <Button
            variant="contained"
            color="warning"
            onClick={handleReopenDrawer}
            disabled={reopenDrawerMutation.isPending}
          >
            {reopenDrawerMutation.isPending ? 'Reopening…' : 'Reopen'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
