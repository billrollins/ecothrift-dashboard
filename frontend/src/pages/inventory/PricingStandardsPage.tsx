/**
 * Pricing standards (Dash Update #180, owner 2026-11-16). Managers and the owner.
 *
 * - **Deep stock:** 24+ of the exact same item on the shelf. Every two weeks, a stack not on pace to sell out within
 *   8 weeks of its first day out is due one step (10% of retail off, floor 30% of retail, 45% for a commodity).
 *   Nothing changes until a manager ticks and approves; then the new tags print through the print server.
 * - **Stepped:** every step taken, how many of its units sold since, with Reprint and Undo.
 * - **Sat 60 days:** commodities still on the shelf after the sit days: was it a commodity?
 * - **Price a truck:** an order's lines not yet checked in that the commodity standard prices; Apply writes them.
 *
 * Numbers are owner settings (Settings → Inventory). Server: `apps/inventory/services/pricing_standards.py`.
 */
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Alert, Box, Button, Checkbox, Chip, Dialog, DialogActions, DialogContent, DialogTitle, LinearProgress, MenuItem,
  Stack, Tab, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Tabs, TextField, Typography,
} from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import { PageHeader } from '../../components/common/PageHeader';
import { usePrintQueue, type PrintJob } from '../../components/objects/bulkTools';
import { getBulkLabels, getBulkPriceChange, undoBulkPrice, type BulkPriceItem } from '../../api/inventorySearch.api';
import {
  applyTruck, getDeepStock, getSat, getStepped, getTruck, getTrucks, markProductStandard, pct, stepDeepStock,
  type DeepStockRow, type DeepStatus, type Standards,
} from '../../api/pricingStandards.api';
import { formatCurrency } from '../../utils/format';

type TabId = 'deep' | 'stepped' | 'sat' | 'truck';

const money = (v: string | null | undefined) => (v == null ? '' : formatCurrency(v));
const range = (lo: string | null, hi: string | null) => (lo == null ? '' : lo === hi ? money(lo) : `${money(lo)} to ${money(hi)}`);
const day = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString([], { month: 'short', day: 'numeric' });
const when = (iso: string) => new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });

const STATUS: Record<DeepStatus, { label: (r: DeepStockRow) => string; color: 'warning' | 'default' | 'success' }> = {
  due: { label: () => 'Due a step', color: 'warning' },
  waiting: { label: (r) => `Next check ${day(r.next_check)}`, color: 'default' },
  on_pace: { label: () => 'On pace', color: 'success' },
  at_floor: { label: () => 'At its floor', color: 'default' },
  no_retail: { label: () => 'No retail', color: 'default' },
  mixed: { label: () => 'Mixed tags: split it first', color: 'default' },
};

/** The defaults (the server's SETTINGS), so the rules line is there from the first paint and nothing moves. */
const DEFAULT_STANDARDS: Standards = {
  name_share: 0.65, store_share: 0.55, sit_days: 60, deep_min_units: 24, check_days: 14, sellout_days: 56,
  step_share: 0.1, floor_share: 0.3, floor_commodity_share: 0.45,
};

function rulesLine(s: Standards = DEFAULT_STANDARDS): string {
  return `Commodity ${pct(s.name_share)} name brand, ${pct(s.store_share)} store brand, never marked down · `
    + `Deep stock ${s.deep_min_units}+ units: every ${s.check_days} days, not on pace to sell out in ${Math.round(s.sellout_days / 7)} weeks `
    + `= ${pct(s.step_share)} of retail off, floor ${pct(s.floor_share)} (${pct(s.floor_commodity_share)} commodity)`;
}

/** The print progress, in a line that is always there so nothing moves when printing starts. */
function PrintLine({ job, onCancel }: { job: PrintJob | null; onCancel: () => void }) {
  return (
    <Box sx={{ minHeight: 40, mb: 1 }}>
      {job ? (
        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="caption" component="div" color={job.failed && !job.running ? 'error' : 'text.secondary'}>
              {job.label}: {job.running ? `printing ${job.done} of ${job.total}` : `printed ${job.done} of ${job.total}`}
              {!job.running && job.failed > 0 ? `; ${job.failed} did not print. Check the print server on this computer.` : ''}
            </Typography>
            <LinearProgress variant="determinate" value={job.total ? (100 * (job.done + (job.running ? 0 : job.failed))) / job.total : 0} />
          </Box>
          {job.running ? <Button size="small" onClick={onCancel}>Stop</Button> : null}
        </Stack>
      ) : null}
    </Box>
  );
}

export default function PricingStandardsPage() {
  const [params, setParams] = useSearchParams();
  const tab = (['deep', 'stepped', 'sat', 'truck'].includes(params.get('tab') ?? '') ? params.get('tab') : 'deep') as TabId;
  const deep = useQuery({ queryKey: ['pricing-standards', 'deep'], queryFn: async () => (await getDeepStock()).data });
  const { job, print, cancel } = usePrintQueue();
  const s = deep.data?.standards;
  return (
    <Box sx={{ maxWidth: 1400 }}>
      <PageHeader title="Pricing standards" dense subtitle={rulesLine(s)} />
      <Tabs value={tab} variant="scrollable" allowScrollButtonsMobile
        onChange={(_e, v: TabId) => setParams(v === 'deep' ? {} : { tab: v }, { replace: true })}
        sx={{ mb: 1, minHeight: 36, '& .MuiTab-root': { minHeight: 36 } }}>
        <Tab value="deep" label="Deep stock" />
        <Tab value="stepped" label="Stepped" />
        <Tab value="sat" label={`Sat ${s?.sit_days ?? 60} days`} />
        <Tab value="truck" label="Price a truck" />
      </Tabs>
      <PrintLine job={job} onCancel={cancel} />
      {tab === 'deep' && <DeepStockTab rows={deep.data?.rows} loading={deep.isLoading} printing={!!job?.running} print={print} />}
      {tab === 'stepped' && <SteppedTab printing={!!job?.running} print={print} />}
      {tab === 'sat' && <SatTab />}
      {tab === 'truck' && <TruckTab />}
    </Box>
  );
}

type Print = (label: string, items: BulkPriceItem[]) => Promise<void>;

/** The tags of a step's units still on the shelf at the given price (sold or since-changed units get none). */
async function shelfTags(changeId: number, which: 'old' | 'new'): Promise<BulkPriceItem[]> {
  const change = (await getBulkPriceChange(changeId)).data.items ?? [];
  const want = new Map(change.map((i) => [i.id, i[which]]));
  const now = (await getBulkLabels({ item_ids: [...want.keys()], product_ids: [] })).data.items;
  return now.filter((i) => Number.parseFloat(i.new) === Number.parseFloat(want.get(i.id) ?? ''));
}

function DeepStockTab({ rows, loading, printing, print }: { rows?: DeepStockRow[]; loading: boolean; printing: boolean; print: Print }) {
  const qc = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const [ticked, setTicked] = useState<Set<number>>(new Set());
  const [confirm, setConfirm] = useState(false);
  const due = useMemo(() => (rows ?? []).filter((r) => r.status === 'due'), [rows]);
  const picked = due.filter((r) => ticked.has(r.product_id));
  const step = useMutation({
    mutationFn: async () => (await stepDeepStock(picked.map((r) => r.product_id))).data,
    onSuccess: (data) => {
      setConfirm(false);
      setTicked(new Set());
      void qc.invalidateQueries({ queryKey: ['pricing-standards'] });
      const items = data.changes.flatMap((c) => c.items ?? []);
      enqueueSnackbar(`${data.changes.length} stepped, ${items.length} prices changed. Printing the new tags.`, { variant: 'success' });
      void print(`${items.length} new tag${items.length === 1 ? '' : 's'} (deep stock step)`, items);
    },
    onError: (e: { response?: { data?: { detail?: string } } }) =>
      enqueueSnackbar(e.response?.data?.detail ?? 'Nothing was changed.', { variant: 'error' }),
  });
  const toggle = (id: number) => setTicked((t) => {
    const n = new Set(t);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });
  const units = picked.reduce((a, r) => a + r.stepping, 0);
  return (
    <>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 1, minHeight: 32 }}>
        <Typography variant="body2" sx={{ flex: 1 }}>
          {rows ? `${due.length} due a step · ${rows.length} deep stacks on the shelf` : ''}
        </Typography>
        <Button size="small" variant="contained" disabled={picked.length === 0 || printing} onClick={() => setConfirm(true)}>
          Step {picked.length || ''} and print tags
        </Button>
      </Stack>
      {loading && <LinearProgress />}
      {rows && rows.length === 0 && <Typography variant="body2" color="text.secondary">No deep stock on the shelf.</Typography>}
      {rows && rows.length > 0 && (
        <TableContainer sx={{ overflowX: 'auto' }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell padding="checkbox">
                  <Checkbox size="small" disabled={due.length === 0} checked={due.length > 0 && picked.length === due.length}
                    indeterminate={picked.length > 0 && picked.length < due.length}
                    onChange={(e) => setTicked(e.target.checked ? new Set(due.map((r) => r.product_id)) : new Set())}
                    inputProps={{ 'aria-label': 'Tick every product due a step' }} />
                </TableCell>
                <TableCell>Product</TableCell>
                <TableCell align="right">On shelf</TableCell>
                <TableCell>Pace</TableCell>
                <TableCell>Tag now</TableCell>
                <TableCell>One step</TableCell>
                <TableCell>Status</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.product_id} hover>
                  <TableCell padding="checkbox">
                    {r.status === 'due' ? (
                      <Checkbox size="small" checked={ticked.has(r.product_id)} onChange={() => toggle(r.product_id)}
                        inputProps={{ 'aria-label': `Step ${r.title}` }} />
                    ) : null}
                  </TableCell>
                  <TableCell sx={{ maxWidth: 360, minWidth: 200 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap title={r.title}>{r.title}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {[r.brand, r.product_number, r.commodity ? 'commodity' : ''].filter(Boolean).join(' · ')}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">{r.units}</TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>
                    <Typography variant="body2">{r.sold} sold in {r.days} days</Typography>
                    <Typography variant="caption" color="text.secondary" component="div">
                      {r.sellout_days != null ? `out in ~${r.sellout_days.toLocaleString()} days` : 'no sales yet'}
                      {r.days_left > 0 ? ` · goal ${day(r.deadline)}` : ` · past ${day(r.deadline)}`}
                    </Typography>
                  </TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>
                    <Typography variant="body2">{range(r.price_low, r.price_high)}</Typography>
                    <Typography variant="caption" color="text.secondary" component="div">{r.pct_now != null ? `${r.pct_now}% of retail` : ''}</Typography>
                  </TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>
                    <Typography variant="body2">{range(r.new_low, r.new_high)}</Typography>
                    <Typography variant="caption" color="text.secondary" component="div">
                      {r.pct_after != null ? `${r.pct_after}% · floor ${pct(r.floor_share)}` : `floor ${pct(r.floor_share)}`}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Chip size="small" label={STATUS[r.status].label(r)} color={STATUS[r.status].color} variant={r.status === 'due' ? 'filled' : 'outlined'} />
                    {r.last_step ? (
                      <Typography variant="caption" color="text.secondary" component="div">last step {day(r.last_step)}</Typography>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
      <Dialog open={confirm} onClose={() => setConfirm(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Step {picked.length} product{picked.length === 1 ? '' : 's'} down?</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            {units} tag{units === 1 ? '' : 's'} change price, then print through the print server. Put the new tags on the
            shelf. Undo is on the Stepped tab.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirm(false)}>Cancel</Button>
          <Button variant="contained" disabled={step.isPending} onClick={() => step.mutate()}>Step and print</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

function SteppedTab({ printing, print }: { printing: boolean; print: Print }) {
  const qc = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const stepped = useQuery({ queryKey: ['pricing-standards', 'stepped'], queryFn: async () => (await getStepped()).data.results });
  const undo = useMutation({
    mutationFn: async (id: number) => (await undoBulkPrice(id)).data,
    onSuccess: (c) => {
      void qc.invalidateQueries({ queryKey: ['pricing-standards'] });
      enqueueSnackbar(`${c.undo_result?.restored ?? 0} prices put back. Printing their tags.`, { variant: 'success' });
      void shelfTags(c.id, 'old').then((back) => print(`${back.length} tag${back.length === 1 ? '' : 's'} (undo)`, back));
    },
    onError: () => enqueueSnackbar('Not undone.', { variant: 'error' }),
  });
  const reprint = async (id: number) => {
    const items = await shelfTags(id, 'new');
    void print(`${items.length} tag${items.length === 1 ? '' : 's'} (reprint)`, items);
  };
  const rows = stepped.data;
  if (stepped.isLoading) return <LinearProgress />;
  if (!rows?.length) return <Typography variant="body2" color="text.secondary">No steps yet.</Typography>;
  return (
    <TableContainer sx={{ overflowX: 'auto' }}>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Date</TableCell>
            <TableCell>Product</TableCell>
            <TableCell align="right">Units</TableCell>
            <TableCell>Tags</TableCell>
            <TableCell align="right">Sold since</TableCell>
            <TableCell>By</TableCell>
            <TableCell />
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id} sx={{ opacity: r.undone_at ? 0.55 : 1 }}>
              <TableCell sx={{ whiteSpace: 'nowrap' }}>{when(r.at)}</TableCell>
              <TableCell sx={{ maxWidth: 340 }}><Typography variant="body2" noWrap title={r.title}>{r.title}</Typography></TableCell>
              <TableCell align="right">{r.units}</TableCell>
              <TableCell sx={{ whiteSpace: 'nowrap' }}>
                {money(r.before)} to {money(r.after)}
                {r.pct_before != null && r.pct_after != null ? (
                  <Typography variant="caption" color="text.secondary" component="div">{r.pct_before}% to {r.pct_after}% of retail</Typography>
                ) : null}
              </TableCell>
              <TableCell align="right">{r.sold_since}</TableCell>
              <TableCell>{r.by}</TableCell>
              <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                {r.undone_at ? (
                  <Typography variant="caption">Undone {when(r.undone_at)}</Typography>
                ) : (
                  <>
                    <Button size="small" disabled={printing} onClick={() => void reprint(r.id)}>Reprint tags</Button>
                    <Button size="small" color="warning" disabled={undo.isPending || printing} onClick={() => undo.mutate(r.id)}>Undo</Button>
                  </>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

function SatTab() {
  const qc = useQueryClient();
  const sat = useQuery({ queryKey: ['pricing-standards', 'sat'], queryFn: async () => (await getSat()).data });
  const unmark = useMutation({
    mutationFn: async (productId: number) => (await markProductStandard(productId, 'no')).data,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['pricing-standards'] }),
  });
  const rows = sat.data?.results;
  if (sat.isLoading) return <LinearProgress />;
  if (!rows?.length) return <Typography variant="body2" color="text.secondary">No commodity has sat {sat.data?.standards.sit_days ?? 60} days.</Typography>;
  return (
    <TableContainer sx={{ overflowX: 'auto' }}>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Product</TableCell>
            <TableCell>Marked</TableCell>
            <TableCell align="right">Units that sat</TableCell>
            <TableCell align="right">Oldest</TableCell>
            <TableCell align="right">Tags</TableCell>
            <TableCell />
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.product_id}>
              <TableCell sx={{ maxWidth: 360 }}>
                <Typography variant="body2" noWrap title={r.title}>{r.title}</Typography>
                <Typography variant="caption" color="text.secondary">{[r.brand, r.product_number].filter(Boolean).join(' · ')}</Typography>
              </TableCell>
              <TableCell>{r.standard === 'store_brand' ? 'Store brand' : 'Name brand'}</TableCell>
              <TableCell align="right">{r.units}</TableCell>
              <TableCell align="right">{r.oldest_days} days</TableCell>
              <TableCell align="right">{money(r.price_total)}</TableCell>
              <TableCell align="right">
                <Button size="small" disabled={unmark.isPending} onClick={() => unmark.mutate(r.product_id)}>Not a commodity</Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

function TruckTab() {
  const qc = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const [poId, setPoId] = useState<number | ''>('');
  const [skip, setSkip] = useState<Set<number>>(new Set());
  const trucks = useQuery({ queryKey: ['pricing-standards', 'trucks'], queryFn: async () => (await getTrucks()).data.results });
  const truck = useQuery({
    queryKey: ['pricing-standards', 'truck', poId],
    queryFn: async () => (await getTruck(poId as number)).data,
    enabled: poId !== '',
  });
  const rows = truck.data?.rows ?? [];
  const picked = rows.filter((r) => r.changes && !skip.has(r.id));
  const apply = useMutation({
    mutationFn: async () => (await applyTruck(poId as number, picked.map((r) => r.id))).data,
    onSuccess: (d) => {
      void qc.invalidateQueries({ queryKey: ['pricing-standards', 'truck', poId] });
      setSkip(new Set());
      enqueueSnackbar(`${d.priced} line${d.priced === 1 ? '' : 's'} priced; ${d.confirmed} product${d.confirmed === 1 ? '' : 's'} marked commodity.`, { variant: 'success' });
    },
    onError: (e: { response?: { data?: { detail?: string } } }) =>
      enqueueSnackbar(e.response?.data?.detail ?? 'Nothing was priced.', { variant: 'error' }),
  });
  return (
    <>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ alignItems: { sm: 'center' }, mb: 1 }}>
        <TextField select size="small" label="Order" value={poId} sx={{ minWidth: 320 }}
          onChange={(e) => { setPoId(Number(e.target.value)); setSkip(new Set()); }}>
          {(trucks.data ?? []).map((t) => (
            <MenuItem key={t.id} value={t.id}>
              {t.order_number} · {t.vendor} · {t.open_rows} lines not checked in
            </MenuItem>
          ))}
        </TextField>
        <Box sx={{ flex: 1 }} />
        <Button size="small" variant="contained" disabled={picked.length === 0 || apply.isPending} onClick={() => apply.mutate()}>
          Price {picked.length || ''} line{picked.length === 1 ? '' : 's'}
        </Button>
      </Stack>
      {truck.isFetching && <LinearProgress />}
      {poId !== '' && truck.data && rows.length === 0 && (
        <Alert severity="info">No line on this order is a commodity, or every one is checked in.</Alert>
      )}
      {rows.length > 0 && (
        <TableContainer sx={{ overflowX: 'auto' }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell padding="checkbox" />
                <TableCell align="right">#</TableCell>
                <TableCell>Line</TableCell>
                <TableCell align="right">Qty</TableCell>
                <TableCell align="right">Retail</TableCell>
                <TableCell align="right">Price now</TableCell>
                <TableCell align="right">Standard</TableCell>
                <TableCell>Commodity</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id} sx={{ opacity: r.changes ? 1 : 0.6 }}>
                  <TableCell padding="checkbox">
                    {r.changes ? (
                      <Checkbox size="small" checked={!skip.has(r.id)} inputProps={{ 'aria-label': `Price line ${r.row_number}` }}
                        onChange={() => setSkip((s) => { const n = new Set(s); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); return n; })} />
                    ) : null}
                  </TableCell>
                  <TableCell align="right">{r.row_number}</TableCell>
                  <TableCell sx={{ maxWidth: 380 }}><Typography variant="body2" noWrap title={r.title}>{r.title}</Typography></TableCell>
                  <TableCell align="right">{r.quantity}</TableCell>
                  <TableCell align="right">{money(r.retail)}</TableCell>
                  <TableCell align="right">{money(r.price_now)}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>{money(r.price)}</TableCell>
                  <TableCell>
                    {r.standard === 'store_brand' ? 'Store brand' : 'Name brand'}
                    <Typography variant="caption" color="text.secondary" component="div">
                      {r.source === 'product' ? 'marked' : 'suggested'}
                    </Typography>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </>
  );
}
