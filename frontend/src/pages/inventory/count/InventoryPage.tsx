import { useCallback, useEffect, useState } from 'react';
import { Link as RouterLink, useParams, useSearchParams } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Tab,
  Tabs,
  Typography,
} from '@mui/material';
import { apiMessage, closeDay, getDay, reopenDay, type DayDetail } from '../../../api/stocktake.api';
import InventoryReportPage from './InventoryReportPage';
import InventorySessions from './InventorySessions';
import { StageChip } from './InventoriesPage';
import { inventoryName } from './inventoryNames';
import OrderEstimatesTab from './OrderEstimatesTab';
import ShrinkPage from './ShrinkPage';

type TabKey = 'summary' | 'shrinkage' | 'orders' | 'sessions';
const TABS: { key: TabKey; label: string }[] = [
  { key: 'summary', label: 'Summary' },
  { key: 'shrinkage', label: 'Shrinkage' },
  { key: 'orders', label: 'Order estimates' },
  { key: 'sessions', label: 'Sessions' },
];
const plain = { textTransform: 'none' as const };
const fmt = (iso: string) => new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

/**
 * One inventory (inventory_effort Phase 6, owner 2026-10-06): In progress, then Done. Tabs: Summary (the report),
 * Shrinkage (what it did not find, as shrink estimates), Order estimates, Sessions (one person in one section).
 * The latest one is still worked after it is done: its PR Fix-it problems and its shrink estimates.
 */
export default function InventoryPage() {
  const { id } = useParams<{ id: string }>();
  const countId = Number(id);
  const [params, setParams] = useSearchParams();
  const tab: TabKey = TABS.find((t) => t.key === params.get('tab'))?.key ?? 'summary';
  const [day, setDay] = useState<DayDetail | null>(null);
  const [error, setError] = useState('');
  const [ending, setEnding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [version, setVersion] = useState(0);

  const load = useCallback(() => {
    getDay(countId)
      .then(setDay)
      .catch((e) => setError(apiMessage(e, 'Could not load this inventory.')));
  }, [countId]);
  useEffect(load, [load]);

  const setTab = (next: TabKey) => {
    const q = new URLSearchParams();
    if (next !== 'summary') q.set('tab', next);
    setParams(q, { replace: true });
  };

  const endOrReopen = async () => {
    if (!day) return;
    setBusy(true);
    setError('');
    try {
      if (day.status === 'open') await closeDay(day.id);
      else await reopenDay(day.id);
      setEnding(false);
      load();
      setVersion((v) => v + 1);
    } catch (e) {
      setError(apiMessage(e, 'Could not save.'));
      setEnding(false);
    } finally {
      setBusy(false);
    }
  };

  if (error && !day) return <Alert severity="error" sx={{ m: 2 }}>{error}</Alert>;
  if (!day) {
    return (
      <Box sx={{ p: 6, textAlign: 'center' }}>
        <CircularProgress />
      </Box>
    );
  }
  const inProgress = day.status === 'open';

  return (
    <Box sx={{ p: { xs: 1, md: 2 }, width: '100%', minWidth: 0, maxWidth: 1500, mx: 'auto' }}>
      <Button component={RouterLink} to="/inventory/inventories" size="small" sx={{ ...plain, ml: -0.5 }} className="no-print">
        ‹ All inventories
      </Button>
      <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', md: 'center' }} gap={1} sx={{ mb: 1 }}>
        <Box sx={{ minWidth: 0 }}>
          <Stack direction="row" alignItems="center" spacing={1}>
            <Typography variant="h5" sx={{ fontWeight: 800 }}>
              {inventoryName(day)}
            </Typography>
            <StageChip row={day} />
          </Stack>
          <Typography sx={{ color: 'text.secondary', fontSize: 14 }}>
            Started {fmt(day.started_at)}
            {day.started_by ? ` by ${day.started_by}` : ''}
            {inProgress
              ? '. In progress: the numbers change as scans come in.'
              : `. Ended ${day.closed_at ? fmt(day.closed_at) : ''}${day.closed_by ? ` by ${day.closed_by}` : ''}.`}
            {!inProgress && day.latest ? ' The latest inventory: its PR Fix-it and shrink estimates are still worked.' : ''}
          </Typography>
        </Box>
        <Stack direction="row" gap={1} flexWrap="wrap" className="no-print">
          <Button
            component={RouterLink}
            to={`/inventory/pr-fixit?count=${day.id}`}
            variant="outlined"
            color={day.to_fix ? 'warning' : 'inherit'}
            sx={{ ...plain, whiteSpace: 'nowrap', borderColor: day.to_fix ? undefined : 'divider' }}
          >
            PR Fix-it{day.to_fix ? ` (${day.to_fix} in carts)` : ''}
          </Button>
          {inProgress && (
            <Button component={RouterLink} to="/inventory/count" variant="outlined" sx={{ ...plain, whiteSpace: 'nowrap' }}>
              Run count
            </Button>
          )}
          <Button variant={inProgress ? 'contained' : 'outlined'} disabled={busy} onClick={() => (inProgress ? setEnding(true) : void endOrReopen())} sx={{ ...plain, whiteSpace: 'nowrap' }}>
            {inProgress ? 'End inventory' : 'Reopen'}
          </Button>
        </Stack>
      </Stack>
      {error && (
        <Alert severity="error" sx={{ mb: 1.5 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      <Tabs value={tab} onChange={(_e, v: TabKey) => setTab(v)} variant="scrollable" allowScrollButtonsMobile sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }} className="no-print">
        {TABS.map((t) => (
          <Tab key={t.key} value={t.key} label={t.label} sx={{ ...plain, fontWeight: 700 }} />
        ))}
      </Tabs>

      {tab === 'summary' && <InventoryReportPage key={`s${version}`} countId={countId} />}
      {tab === 'shrinkage' && <ShrinkPage key={`k${version}`} countId={countId} />}
      {tab === 'orders' && <OrderEstimatesTab key={`o${version}`} countId={countId} />}
      {tab === 'sessions' && <InventorySessions key={`r${version}`} id={countId} />}

      <Dialog open={ending} onClose={() => setEnding(false)} fullWidth maxWidth="xs">
        <DialogTitle>End this inventory?</DialogTitle>
        <DialogContent>
          <Typography>Open sessions stop and its numbers are kept. Nothing changes on any item.</Typography>
          <Typography sx={{ mt: 1, color: 'text.secondary' }}>
            While it is the latest inventory you can still work its PR Fix-it problems and its shrink estimates. You can
            reopen it while no other inventory is in progress.
          </Typography>
          {day.sections_done < day.sections_total && (
            <Alert severity="warning" sx={{ mt: 1.5 }}>
              {day.sections_total - day.sections_done} of {day.sections_total} sections are not done yet.
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEnding(false)} sx={plain}>
            Keep going
          </Button>
          <Button variant="contained" disabled={busy} onClick={() => void endOrReopen()} sx={plain}>
            End inventory
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
