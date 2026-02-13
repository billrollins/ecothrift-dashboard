import { useState } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
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
import Remove from '@mui/icons-material/Remove';
import SwapHoriz from '@mui/icons-material/SwapHoriz';
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
  useDrawerHandoff,
} from '../../hooks/usePOS';
import { useUsers } from '../../hooks/useEmployees';
import { useAuth } from '../../contexts/AuthContext';
import type { DenominationBreakdown } from '../../types/pos.types';
import { format } from 'date-fns';

function formatCurrency(value: string | number): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num ?? 0);
}

export default function DrawerListPage() {
  const { enqueueSnackbar } = useSnackbar();
  const { user } = useAuth();
  const [openDialog, setOpenDialog] = useState<'open' | 'close' | 'handoff' | null>(null);
  const [selectedRegister, setSelectedRegister] = useState<number | ''>('');
  const [selectedDrawer, setSelectedDrawer] = useState<{ id: number; opening_total: string } | null>(
    null
  );
  const [handoffDrawer, setHandoffDrawer] = useState<number | null>(null);
  const [handoffCashier, setHandoffCashier] = useState<string>('');
  const [count, setCount] = useState<DenominationBreakdown>(EMPTY_BREAKDOWN);

  const { data: registersData, isLoading: regLoading } = useRegisters();
  const { data: drawersData, isLoading: drawersLoading } = useDrawers();
  const openDrawerMutation = useOpenDrawer();
  const closeDrawerMutation = useCloseDrawer();
  const handoffMutation = useDrawerHandoff();

  const registers = registersData?.results ?? [];
  const drawers = drawersData?.results ?? [];
  const { data: usersData } = useUsers({ page_size: 200 });
  const usersForHandoff = usersData?.results ?? [];

  const handleOpenDrawer = async () => {
    if (!selectedRegister || typeof selectedRegister !== 'number') return;
    const total = calculateTotal(count);
    try {
      await openDrawerMutation.mutateAsync({
        register: selectedRegister,
        cashier: user?.id,
        opening_count: count,
        opening_total: total,
      });
      enqueueSnackbar('Drawer opened', { variant: 'success' });
      setOpenDialog(null);
      setSelectedRegister('');
      setCount(EMPTY_BREAKDOWN);
    } catch {
      enqueueSnackbar('Failed to open drawer', { variant: 'error' });
    }
  };

  const handleCloseDrawer = async () => {
    if (!selectedDrawer) return;
    try {
      await closeDrawerMutation.mutateAsync({
        id: selectedDrawer.id,
        data: { closing_count: count, closing_total: calculateTotal(count) },
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

  const resetDialog = () => {
    setOpenDialog(null);
    setSelectedRegister('');
    setSelectedDrawer(null);
    setHandoffDrawer(null);
    setHandoffCashier('');
    setCount(EMPTY_BREAKDOWN);
  };

  if (regLoading || drawersLoading) return <LoadingScreen message="Loading drawers..." />;

  return (
    <Box>
      <PageHeader title="Drawers" subtitle="Manage register drawers" />

      <Grid container spacing={2}>
        {registers.map((reg: { id: number; name: string; code: string }) => {
          const drawer = drawers.find((d: { register: number }) => d.register === reg.id);
          const isOpen = drawer?.status === 'open';

          return (
            <Grid key={reg.id} size={{ xs: 12, md: 6, lg: 4 }}>
              <Card>
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    {reg.name} ({reg.code})
                  </Typography>
                  {!drawer ? (
                    <Box>
                      <Typography variant="body2" color="text.secondary" gutterBottom>
                        No drawer session
                      </Typography>
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
                        Open Drawer
                      </Button>
                    </Box>
                  ) : isOpen ? (
                    <Box>
                      <Typography variant="body2" color="text.secondary">
                        Cashier: {drawer.current_cashier_name ?? '—'}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Opened: {drawer.opened_at ? format(new Date(drawer.opened_at), 'PPp') : '—'}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Opening: {formatCurrency(drawer.opening_total)}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Cash sales: {formatCurrency(drawer.cash_sales_total)}
                      </Typography>
                      <Box sx={{ display: 'flex', gap: 1, mt: 2, flexWrap: 'wrap' }}>
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
                            setSelectedDrawer({
                              id: drawer.id,
                              opening_total: drawer.opening_total,
                            });
                            setOpenDialog('close');
                          }}
                          disabled={closeDrawerMutation.isPending}
                        >
                          Close Drawer
                        </Button>
                      </Box>
                    </Box>
                  ) : (
                    <Typography variant="body2" color="text.secondary">
                      Closed
                    </Typography>
                  )}
                </CardContent>
              </Card>
            </Grid>
          );
        })}
      </Grid>

      <Dialog open={openDialog === 'open'} onClose={resetDialog} maxWidth="sm" fullWidth>
        <DialogTitle>Open Drawer</DialogTitle>
        <DialogContent>
          <Box sx={{ mt: 1 }}>
            <DenominationCounter
              value={count}
              onChange={setCount}
              label="Opening Count"
            />
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
        <DialogTitle>Close Drawer</DialogTitle>
        <DialogContent>
          <Box sx={{ mt: 1 }}>
            <DenominationCounter
              value={count}
              onChange={setCount}
              expectedTotal={
                selectedDrawer ? parseFloat(selectedDrawer.opening_total) : undefined
              }
              label="Closing Count"
            />
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
            Close
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={openDialog === 'handoff'} onClose={resetDialog} maxWidth="sm" fullWidth>
        <DialogTitle>Drawer Handoff</DialogTitle>
        <DialogContent>
          <FormControl fullWidth size="small" sx={{ mt: 2, mb: 2 }}>
            <InputLabel>Incoming Cashier</InputLabel>
            <Select
              value={handoffCashier}
              label="Incoming Cashier"
              onChange={(e) => setHandoffCashier(e.target.value)}
            >
              <MenuItem value="">Select...</MenuItem>
              {usersForHandoff
                .filter((u: { id: number }) => !user || String(u.id) !== String(user.id))
                .map((u: { id: number; full_name: string }) => (
                  <MenuItem key={u.id} value={String(u.id)}>
                    {u.full_name}
                  </MenuItem>
                ))}
            </Select>
          </FormControl>
          <DenominationCounter value={count} onChange={setCount} label="Handoff Count" />
        </DialogContent>
        <DialogActions>
          <Button onClick={resetDialog}>Cancel</Button>
          <Button variant="contained" onClick={handleHandoff} disabled={handoffMutation.isPending}>
            Handoff
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
