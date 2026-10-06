import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { apiMessage, listInventories, startInventory, type InventoryRow } from '../../../api/stocktake.api';
import { CountNav } from './CountNav';
import { inventoryName } from './inventoryNames';

const plain = { textTransform: 'none' as const };
const money = (v: string | null | undefined) =>
  v == null || v === '' ? '-' : `$${Number(v).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
const n = (v: number) => v.toLocaleString();

export function StageChip({ row }: { row: { stage?: string; latest?: boolean } }) {
  if (row.stage === 'in_progress') return <Chip size="small" color="info" label="In progress" />;
  return <Chip size="small" color={row.latest ? 'success' : 'default'} variant={row.latest ? 'filled' : 'outlined'} label="Done" />;
}

function when(row: InventoryRow): string {
  const fmt = (iso: string) => new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const start = `Started ${fmt(row.started_at)}${row.started_by ? ` by ${row.started_by}` : ''}`;
  if (row.stage === 'in_progress') return start;
  return `${start} · ended ${row.closed_at ? fmt(row.closed_at) : ''}${row.closed_by ? ` by ${row.closed_by}` : ''}`;
}

/** Start an inventory, from the list (managers). */
function StartDialog({ open, onClose, onStarted }: { open: boolean; onClose: () => void; onStarted: (id: number) => void }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const go = async () => {
    setBusy(true);
    setError('');
    try {
      const d = await startInventory(name.trim() || undefined);
      onStarted(d.id);
    } catch (e) {
      setError(apiMessage(e, 'Could not start the inventory.'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>Start an inventory?</DialogTitle>
      <DialogContent>
        <Typography>
          It notes every item the system says is on the shelf right now. Sales and new stock after this moment are not counted as missing.
          Then everyone counts on Run count, section by section, over as many days as it takes.
        </Typography>
        <TextField
          value={name}
          onChange={(e) => setName(e.target.value)}
          label="Name (optional)"
          placeholder="Inventory and the day it starts"
          size="small"
          fullWidth
          sx={{ mt: 2 }}
          inputProps={{ maxLength: 120 }}
        />
        {error && (
          <Alert severity="error" sx={{ mt: 1.5 }}>
            {error}
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} sx={plain}>
          Not yet
        </Button>
        <Button variant="contained" disabled={busy} onClick={() => void go()} sx={{ ...plain, fontWeight: 700 }}>
          Start inventory
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/** Inventories (inventory_effort Phase 6): every inventory with its key numbers; a row opens it. Managers. */
export default function InventoriesPage() {
  const theme = useTheme();
  const narrow = useMediaQuery(theme.breakpoints.down('md'));
  const navigate = useNavigate();
  const [rows, setRows] = useState<InventoryRow[] | null>(null);
  const [error, setError] = useState('');
  const [startOpen, setStartOpen] = useState(false);
  const load = useCallback(() => {
    listInventories()
      .then(setRows)
      .catch((e) => setError(apiMessage(e, 'Could not load the inventories. This page is for managers.')));
  }, []);
  useEffect(load, [load]);

  const inProgress = rows?.some((r) => r.stage === 'in_progress');
  const open = (r: InventoryRow) => navigate(`/inventory/inventories/${r.id}`);

  return (
    <Box sx={{ p: { xs: 1, md: 2 }, width: '100%', minWidth: 0, maxWidth: 1400, mx: 'auto', display: 'flex', flexDirection: 'column' }}>
      <CountNav current="inventories" />
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'flex-end' }} gap={1} sx={{ mb: 2 }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 800 }}>
            Inventories
          </Typography>
          <Typography sx={{ color: 'text.secondary' }}>
            Every inventory and what it found. Open one for its summary, shrinkage, order estimates and sessions.
          </Typography>
        </Box>
        {rows && !inProgress && (
          <Button variant="contained" onClick={() => setStartOpen(true)} sx={{ ...plain, fontWeight: 700, whiteSpace: 'nowrap' }}>
            Start inventory
          </Button>
        )}
      </Stack>
      {error && <Alert severity="error">{error}</Alert>}
      {!rows && !error && (
        <Box sx={{ p: 4, textAlign: 'center' }}>
          <CircularProgress />
        </Box>
      )}
      {rows && rows.length === 0 && (
        <Box sx={{ p: { xs: 2.5, md: 4 }, textAlign: 'center', border: 1, borderColor: 'divider', borderRadius: 2 }}>
          <Typography sx={{ fontWeight: 800, fontSize: 20 }}>No inventories yet</Typography>
          <Typography sx={{ color: 'text.secondary', mt: 0.5 }}>Start one when the team is ready to count.</Typography>
        </Box>
      )}
      {rows && rows.length > 0 && narrow && (
        <Stack spacing={1.5}>
          {rows.map((r) => (
            <Box key={r.id} role="button" onClick={() => open(r)} sx={{ p: 1.5, border: 1, borderColor: r.stage === 'in_progress' ? 'info.main' : 'divider', borderRadius: 2, cursor: 'pointer', '&:active': { bgcolor: 'action.hover' } }}>
              <Stack direction="row" alignItems="center" spacing={1}>
                <Typography noWrap sx={{ fontWeight: 800, fontSize: 16, flex: 1, minWidth: 0 }}>
                  {inventoryName(r)}
                </Typography>
                <StageChip row={r} />
              </Stack>
              <Typography sx={{ fontSize: 14, mt: 0.5 }}>
                <b>{n(r.counted.n)}</b> counted ({money(r.counted.price)}) · <b>{n(r.not_found.n)}</b> not found ({money(r.not_found.price)})
              </Typography>
              <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>
                {r.coverage_pct != null ? `${r.coverage_pct}% of expected` : ''} · {r.sections_done} of {r.sections_total} sections · {r.sessions} sessions
                {r.to_fix ? ` · ${r.to_fix} in PR Fix-it` : ''}
              </Typography>
            </Box>
          ))}
        </Stack>
      )}
      {rows && rows.length > 0 && !narrow && (
        <Box sx={{ overflowX: 'auto', border: 1, borderColor: 'divider', borderRadius: 2, bgcolor: 'background.paper' }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Inventory</TableCell>
                <TableCell>Stage</TableCell>
                <TableCell align="right">Counted</TableCell>
                <TableCell align="right">At price</TableCell>
                <TableCell align="right">Price % of retail</TableCell>
                <TableCell align="right">Not found</TableCell>
                <TableCell align="right">At price</TableCell>
                <TableCell align="right">Coverage</TableCell>
                <TableCell align="right">Sections</TableCell>
                <TableCell align="right">Sessions</TableCell>
                <TableCell align="right">Hours</TableCell>
                <TableCell>Who counted</TableCell>
                <TableCell align="right">PR Fix-it</TableCell>
                <TableCell align="right">Estimated</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id} hover onClick={() => open(r)} sx={{ cursor: 'pointer', ...(r.stage === 'in_progress' ? { bgcolor: 'action.selected' } : {}) }}>
                  <TableCell>
                    <Typography sx={{ fontWeight: 700, fontSize: 14 }}>{inventoryName(r)}</Typography>
                    <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>{when(r)}</Typography>
                  </TableCell>
                  <TableCell>
                    <StageChip row={r} />
                  </TableCell>
                  <TableCell align="right">{n(r.counted.n)}</TableCell>
                  <TableCell align="right">{money(r.counted.price)}</TableCell>
                  <TableCell align="right">{r.counted.price_pct_of_retail != null ? `${r.counted.price_pct_of_retail}%` : '-'}</TableCell>
                  <TableCell align="right">{n(r.not_found.n)}</TableCell>
                  <TableCell align="right">{money(r.not_found.price)}</TableCell>
                  <TableCell align="right">{r.coverage_pct != null ? `${r.coverage_pct}%` : '-'}</TableCell>
                  <TableCell align="right">
                    {r.sections_done} of {r.sections_total}
                  </TableCell>
                  <TableCell align="right">{r.sessions}</TableCell>
                  <TableCell align="right">{r.hours}</TableCell>
                  <TableCell sx={{ maxWidth: 200 }}>{r.people.join(', ')}</TableCell>
                  <TableCell align="right">{r.to_fix || ''}</TableCell>
                  <TableCell align="right" title="Not-found items with an estimate (back stock, owner took, ...)">
                    {r.estimated ? `${n(r.estimated)} of ${n(r.not_found.n)}` : ''}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      )}
      <StartDialog open={startOpen} onClose={() => setStartOpen(false)} onStarted={(id) => navigate(`/inventory/inventories/${id}?tab=sessions`)} />
    </Box>
  );
}
