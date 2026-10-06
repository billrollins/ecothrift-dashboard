/**
 * Data quality (inventory_effort Phase 7, 2026-10-06): the data errors this inventory exposed, each with how many,
 * examples, and its fix. A bulk fix is a Request: staged here, approved by the Super User on Requests (with a
 * preview and an undo). The rest say how they are handled.
 */
import { useCallback, useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Collapse,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { apiMessage, getQualityFindings, stageQualityRequest, type QualityFinding } from '../../../api/stocktake.api';
import { useAuth } from '../../../contexts/AuthContext';

const plain = { textTransform: 'none' as const };
const money = (v: string | null | undefined) =>
  v == null || v === '' ? '' : `$${Number(v).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;

const REQUEST_WORDS: Record<string, string> = {
  pending: 'waiting for approval',
  approved: 'approved, starting',
  running: 'running',
  applied: 'done',
  failed: 'failed',
  rejected: 'turned down',
  undone: 'undone',
};

function FixLine({ f, countId, onStaged }: { f: QualityFinding; countId: number; onStaged: () => void }) {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const latest = f.requests?.[0];
  const open = latest && ['pending', 'approved', 'running'].includes(latest.status);

  if (f.fix.kind !== 'request') {
    return <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>{f.fix.how}</Typography>;
  }
  const stage = async () => {
    setBusy(true);
    setError('');
    try {
      await stageQualityRequest(countId, f.key);
      onStaged();
    } catch (e) {
      setError(apiMessage(e, 'Could not stage the fix.'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Stack direction="row" alignItems="center" flexWrap="wrap" useFlexGap gap={1}>
      {latest && (
        <Chip
          size="small"
          color={latest.status === 'applied' ? 'success' : latest.status === 'failed' ? 'error' : open ? 'warning' : 'default'}
          label={`Request #${latest.id}: ${REQUEST_WORDS[latest.status] ?? latest.status}`}
        />
      )}
      {user?.is_superuser && latest && (
        <Button component={RouterLink} to="/admin/requests" size="small" sx={plain}>
          Open Requests
        </Button>
      )}
      {!open && f.n > 0 && latest?.status !== 'applied' && (
        <Button variant="contained" size="small" disabled={busy} onClick={() => void stage()} sx={{ ...plain, fontWeight: 700 }}>
          {f.fix.label ?? 'Fix'}
        </Button>
      )}
      <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>
        {open || latest?.status === 'applied'
          ? 'The Super User approves it on Requests, with a preview and an undo.'
          : 'Stages a Request: nothing changes until the Super User approves it on Requests.'}
      </Typography>
      {error && <Alert severity="error" sx={{ width: '100%' }}>{error}</Alert>}
    </Stack>
  );
}

function FindingCard({ f, countId, onStaged }: { f: QualityFinding; countId: number; onStaged: () => void }) {
  const [show, setShow] = useState(false);
  const quiet = f.n === 0 || f.fix.kind === 'none';
  return (
    <Paper variant="outlined" sx={{ p: 1.5, opacity: quiet ? 0.8 : 1 }}>
      <Stack direction="row" alignItems="baseline" gap={1} flexWrap="wrap">
        <Typography sx={{ fontWeight: 900, fontSize: 22, minWidth: 64 }}>{f.n.toLocaleString()}</Typography>
        <Typography sx={{ fontWeight: 800, fontSize: 16, flex: 1, minWidth: 200 }}>{f.title}</Typography>
        {f.money && Number(f.money) > 0 && <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>{money(f.money)} at price</Typography>}
        {f.register && <Chip size="small" variant="outlined" label={f.register} title="Data-quality register ID" />}
      </Stack>
      <Typography sx={{ fontSize: 14, mt: 0.5, mb: 1 }}>{f.what}</Typography>
      <FixLine f={f} countId={countId} onStaged={onStaged} />
      {f.examples.length > 0 && (
        <>
          <Button size="small" onClick={() => setShow((s) => !s)} sx={{ ...plain, mt: 0.5, ml: -0.5 }}>
            {show ? 'Hide examples' : `Examples (${f.examples.length})`}
          </Button>
          <Collapse in={show} unmountOnExit>
            <Box sx={{ overflowX: 'auto' }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Tag</TableCell>
                    <TableCell>Item</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell align="right">Price</TableCell>
                    <TableCell align="right">Retail</TableCell>
                    <TableCell>Order</TableCell>
                    <TableCell>Detail</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {f.examples.map((e) => (
                    <TableRow key={`${e.sku}-${e.id ?? ''}`}>
                      <TableCell sx={{ fontFamily: 'monospace' }}>{e.sku}</TableCell>
                      <TableCell sx={{ maxWidth: 280 }}>{e.title}</TableCell>
                      <TableCell>{e.status}</TableCell>
                      <TableCell align="right">{e.price != null ? `$${Number(e.price).toFixed(2)}` : ''}</TableCell>
                      <TableCell align="right">{e.retail != null ? `$${Number(e.retail).toFixed(2)}` : ''}</TableCell>
                      <TableCell>{e.order}</TableCell>
                      <TableCell>{e.detail}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
          </Collapse>
        </>
      )}
    </Paper>
  );
}

export default function DataQualityTab({ countId }: { countId: number }) {
  const [rows, setRows] = useState<QualityFinding[] | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(() => {
    getQualityFindings(countId)
      .then((r) => setRows(r.findings))
      .catch((e) => setError(apiMessage(e, 'Could not load the data quality findings.')));
  }, [countId]);
  useEffect(load, [load]);

  if (error) return <Alert severity="error">{error}</Alert>;
  if (!rows) {
    return (
      <Box sx={{ p: 6, textAlign: 'center' }}>
        <CircularProgress />
      </Box>
    );
  }
  const fixes = rows.filter((f) => f.fix.kind === 'request' && f.n > 0);
  return (
    <Box sx={{ width: '100%', minWidth: 0 }}>
      <Typography sx={{ color: 'text.secondary', mb: 1.5 }}>
        What this inventory showed is wrong in the data, biggest first. {fixes.length} can be fixed in bulk: each button stages a Request
        the Super User approves on Requests, with a preview and an undo. The rest say how they are handled.
      </Typography>
      <Stack spacing={1.5}>
        {rows.map((f) => (
          <FindingCard key={f.key} f={f} countId={countId} onStaged={load} />
        ))}
      </Stack>
    </Box>
  );
}
