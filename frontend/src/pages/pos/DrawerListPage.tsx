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
  Grid,
  InputLabel,
  MenuItem,
  Select,
  Typography,
} from '@mui/material';
import Add from '@mui/icons-material/Add';
import LockReset from '@mui/icons-material/LockReset';
import Remove from '@mui/icons-material/Remove';
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
import type { Drawer } from '../../types/pos.types';
import { format } from 'date-fns';

function formatCurrency(value: string | number): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num ?? 0);
}

function expectedCash(drawer: Drawer): number {
  const opening = parseFloat(String(drawer.opening_total)) || 0;
  const sales = parseFloat(String(drawer.cash_sales_total)) || 0;
  const dropsTotal = (drawer.drops ?? []).reduce((s, d) => s + (parseFloat(String(d.total)) || 0), 0);
  return opening + sales - dropsTotal;
}

function varianceColor(variance: number): 'success' | 'warning' | 'error' {
  const abs = Math.abs(variance);
  if (abs <= 1) return 'success';
  if (abs <= 5) return 'warning';
  return 'error';
}

export default function DrawerListPage() {
  const { enqueueSnackbar } = useSnackbar();
  const { user, hasRole } = useAuth();
  const { config } = useDeviceConfig();
  const isManager = hasRole('Manager') || hasRole('Admin');
  const myRegisterId = config?.deviceType === 'register' ? config?.registerId : null;

  const [openDialog, setOpenDialog] = useState<'open' | 'close' | 'handoff' | 'drop' | 'reopen' | null>(null);
  const [reopenDrawerId, setReopenDrawerId] = useState<number | null>(null);
  const [selectedRegister, setSelectedRegister] = useState<number | ''>('');
  const [selectedDrawer, setSelectedDrawer] = useState<Drawer | null>(null);
  const [handoffDrawer, setHandoffDrawer] = useState<number | null>(null);
  const [handoffCashier, setHandoffCashier] = useState<string>('');
  const [dropDrawer, setDropDrawer] = useState<number | null>(null);
  const [count, setCount] = useState<DenominationBreakdown>(EMPTY_BREAKDOWN);
  const [expandedCard, setExpandedCard] = useState<number | null>(null);

  const { data: registersData, isLoading: regLoading } = useRegisters();
  const { data: drawersData, isLoading: drawersLoading } = useDrawers();
  const openDrawerMutation = useOpenDrawer();
  const closeDrawerMutation = useCloseDrawer();
  const reopenDrawerMutation = useReopenDrawer();
  const handoffMutation = useDrawerHandoff();
  const cashDropMutation = useCashDrop();

  const registers = registersData?.results ?? [];
  const drawers = drawersData?.results ?? [];

  // Cashiers with no device config fall back to showing nothing — they need to configure
  // their device from the POS Terminal page first so we know which register they own.
  const cashierUnconfigured = !isManager && myRegisterId == null;
  const registersToShow = isManager
    ? registers
    : registers.filter((r: { id: number }) => r.id === myRegisterId);

  const { data: usersData } = useUsers({ page_size: 200 });
  const usersForHandoff = usersData?.results ?? [];

  const handleOpenDrawer = async () => {
    if (!selectedRegister || typeof selectedRegister !== 'number') return;
    const total = calculateTotal(count);
    try {
      await openDrawerMutation.mutateAsync({
        register: selectedRegister,
        opening_count: count,
        opening_total: total,
      });
      enqueueSnackbar('Drawer opened', { variant: 'success' });
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

  const handleCloseDrawer = async () => {
    if (!selectedDrawer) return;
    const closingTotal = calculateTotal(count);
    const expected = expectedCash(selectedDrawer);
    const variance = closingTotal - expected;
    try {
      await closeDrawerMutation.mutateAsync({
        id: selectedDrawer.id,
        data: { closing_count: count, closing_total: closingTotal },
      });
      enqueueSnackbar('Drawer closed', { variant: 'success' });
      setOpenDialog(null);
      setSelectedDrawer(null);
      setCount(EMPTY_BREAKDOWN);
    } catch {
      enqueueSnackbar('Failed to close drawer', { variant: 'error' });
    }
  };

  const handleHandoff = async () => {
    if (!handoffDrawer || !handoffCashier) return;
    try {
      await handoffMutation.mutateAsync({
        id: handoffDrawer,
        data: {
          incoming_cashier: Number(handoffCashier),
          count,
          counted_total: calculateTotal(count),
        },
      });
      enqueueSnackbar('Handoff completed', { variant: 'success' });
      setOpenDialog(null);
      setHandoffDrawer(null);
      setHandoffCashier('');
      setCount(EMPTY_BREAKDOWN);
    } catch {
      enqueueSnackbar('Failed to complete handoff', { variant: 'error' });
    }
  };

  const handleCashDrop = async () => {
    if (!dropDrawer) return;
    const total = calculateTotal(count);
    if (total <= 0) {
      enqueueSnackbar('Enter drop amount', { variant: 'warning' });
      return;
    }
    try {
      await cashDropMutation.mutateAsync({
        drawerId: dropDrawer,
        data: { amount: count, total: total.toFixed(2) },
      });
      enqueueSnackbar('Cash drop recorded', { variant: 'success' });
      resetDialog();
    } catch {
      enqueueSnackbar('Failed to record cash drop', { variant: 'error' });
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
  };

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
        {registersToShow.map((reg: { id: number; name: string; code: string }) => {
          const drawer = drawers.find((d: { register: number }) => d.register === reg.id) as Drawer | undefined;
          const isOpen = drawer?.status === 'open';
          const expected = drawer ? expectedCash(drawer) : 0;
          const expanded = expandedCard === reg.id;

          return (
            <Grid key={reg.id} size={{ xs: 12, md: 6, lg: 4 }}>
              <Card>
                <CardContent>
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
                        Cashier: {drawer.current_cashier_name ?? '—'}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Opened: {drawer.opened_at ? format(new Date(drawer.opened_at), 'PPp') : '—'}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Opening: {formatCurrency(drawer.opening_total)} · Cash sales: {formatCurrency(drawer.cash_sales_total)}
                      </Typography>
                      {drawer.drops && drawer.drops.length > 0 && (
                        <Typography variant="body2" color="text.secondary">
                          Drops: {drawer.drops.length} ({formatCurrency(drawer.drops.reduce((s, d) => s + (parseFloat(String(d.total)) || 0), 0))})
                        </Typography>
                      )}
                      {isOpen && (
                        <Box sx={{ display: 'flex', gap: 1, mt: 2, flexWrap: 'wrap' }}>
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
                          {isManager && (
                            <>
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
                      {(drawer.handoffs?.length > 0 || drawer.drops?.length > 0) && (
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
                                  Handoffs: {drawer.handoffs.map((h: { incoming_cashier_name: string | null }) => h.incoming_cashier_name ?? '').join(', ')}
                                </Typography>
                              )}
                              {drawer.drops && drawer.drops.length > 0 && (
                                <Typography variant="caption" color="text.secondary" display="block">
                                  Drops: {drawer.drops.map((d: { total: string; dropped_at: string }) => `${formatCurrency(d.total)} @ ${format(new Date(d.dropped_at), 'HH:mm')}`).join('; ')}
                                </Typography>
                              )}
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
        <DialogTitle>Close drawer</DialogTitle>
        <DialogContent>
          <Box sx={{ mt: 1 }}>
            {selectedDrawer && (
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Expected cash (opening + sales − drops): {formatCurrency(expectedCash(selectedDrawer))}
              </Typography>
            )}
            <DenominationCounter
              value={count}
              onChange={setCount}
              expectedTotal={selectedDrawer ? expectedCash(selectedDrawer) : undefined}
              label="Closing count"
            />
            {selectedDrawer && (
              (() => {
                const closingTotal = calculateTotal(count);
                const exp = expectedCash(selectedDrawer);
                const variance = closingTotal - exp;
                if (exp === 0) return null;
                return (
                  <Typography variant="body2" sx={{ mt: 2 }} color={varianceColor(variance)}>
                    Variance: {variance >= 0 ? '+' : ''}{formatCurrency(variance)}
                  </Typography>
                );
              })()
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={resetDialog}>Cancel</Button>
          <Button
            variant="contained"
            color="error"
            onClick={handleCloseDrawer}
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
            <InputLabel>Incoming cashier</InputLabel>
            <Select
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
          <DenominationCounter value={count} onChange={setCount} label="Handoff count" />
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
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={resetDialog}>Cancel</Button>
          <Button variant="contained" onClick={handleCashDrop} disabled={cashDropMutation.isPending}>
            {cashDropMutation.isPending ? 'Processing…' : 'Drop'}
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
