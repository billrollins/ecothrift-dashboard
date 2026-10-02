/**
 * Bulk work from Inventory search: what is selected, the tag print queue, the price change dialog, and the
 * drawer that shows progress and the recent price changes (with undo and "reprint these tags").
 *
 * House rule for containers: the dialog is the quick decision; the drawer is the thing you close and reopen to see
 * how a running job is doing.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Close from '@mui/icons-material/Close';
import {
  Alert, Box, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, Divider, Drawer, IconButton,
  LinearProgress, MenuItem, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography,
} from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import {
  applyBulkPrice, getBulkLabels, getBulkPriceChange, getBulkPriceChanges, previewBulkPrice, undoBulkPrice,
  type BulkPriceChange, type BulkPriceItem, type BulkPriceMode, type BulkPriceRounding, type BulkPriceRule,
  type BulkSelection,
} from '../../api/inventorySearch.api';
import { printProcessingLabelsAndMarkPrinted } from '../../pages/inventory/processing/printProcessingLabel';
import { formatCurrency } from '../../utils/format';

// ── Selection ──────────────────────────────────────────────────────────────────

interface SelectionValue {
  itemIds: ReadonlySet<number>;
  productIds: ReadonlySet<number>;
  toggleItem: (id: number) => void;
  toggleProduct: (id: number) => void;
  /** Tick or untick several products at once (the header box). */
  setProducts: (ids: number[], on: boolean) => void;
  clear: () => void;
  selection: BulkSelection;
  size: number;
}

const SelectionContext = createContext<SelectionValue | null>(null);

/** The selection, or null on a page that has none (the product page shows the same items table without it). */
export function useOptionalSelection(): SelectionValue | null {
  return useContext(SelectionContext);
}

export function SelectionProvider({ children }: { children: ReactNode }) {
  const [itemIds, setItemIds] = useState<ReadonlySet<number>>(new Set());
  const [productIds, setProductIds] = useState<ReadonlySet<number>>(new Set());
  const toggle = (set: ReadonlySet<number>, id: number) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  };
  const toggleItem = useCallback((id: number) => setItemIds((s) => toggle(s, id)), []);
  const toggleProduct = useCallback((id: number) => setProductIds((s) => toggle(s, id)), []);
  const setProducts = useCallback((ids: number[], on: boolean) => {
    setProductIds((s) => {
      const next = new Set(s);
      ids.forEach((id) => (on ? next.add(id) : next.delete(id)));
      return next;
    });
  }, []);
  const clear = useCallback(() => {
    setItemIds(new Set());
    setProductIds(new Set());
  }, []);
  const value = useMemo(
    () => ({
      itemIds, productIds, toggleItem, toggleProduct, setProducts, clear,
      selection: { item_ids: [...itemIds], product_ids: [...productIds] },
      size: itemIds.size + productIds.size,
    }),
    [itemIds, productIds, toggleItem, toggleProduct, setProducts, clear],
  );
  return <SelectionContext.Provider value={value}>{children}</SelectionContext.Provider>;
}

export function SelectBox({ kind, id, label, forced = false }: { kind: 'item' | 'product'; id: number; label: string; forced?: boolean }) {
  const sel = useOptionalSelection();
  if (!sel) return null;
  const checked = forced || (kind === 'item' ? sel.itemIds.has(id) : sel.productIds.has(id));
  return (
    <Checkbox
      size="small"
      checked={checked}
      disabled={forced}
      onClick={(e) => e.stopPropagation()}
      onChange={() => (kind === 'item' ? sel.toggleItem(id) : sel.toggleProduct(id))}
      inputProps={{ 'aria-label': label }}
      sx={{ p: 0.25 }}
    />
  );
}

// ── Tag print queue ────────────────────────────────────────────────────────────

export interface PrintJob {
  label: string;
  total: number;
  done: number;
  failed: number;
  running: boolean;
}

const PRINT_CHUNK = 10;

export function usePrintQueue() {
  const [job, setJob] = useState<PrintJob | null>(null);
  const stop = useRef(false);

  const print = useCallback(async (label: string, items: BulkPriceItem[]) => {
    stop.current = false;
    let done = 0;
    let failed = 0;
    setJob({ label, total: items.length, done, failed, running: true });
    for (let i = 0; i < items.length && !stop.current; i += PRINT_CHUNK) {
      const chunk = items.slice(i, i + PRINT_CHUNK);
      const result = await printProcessingLabelsAndMarkPrinted(
        chunk.map((r) => ({
          id: r.id, sku: r.sku, price: r.new, product_title: r.title, product_brand: r.brand, product_number: r.product_number,
        })),
      );
      done += result.succeeded;
      failed += result.failed;
      setJob({ label, total: items.length, done, failed, running: true });
      // The print server is not answering: don't grind through the rest.
      if (result.succeeded === 0) break;
    }
    setJob({ label, total: items.length, done, failed: items.length - done, running: false });
  }, []);

  const cancel = useCallback(() => {
    stop.current = true;
  }, []);
  return { job, print, cancel };
}

// ── The price change dialog ────────────────────────────────────────────────────

const MODE_LABEL: Record<BulkPriceMode, string> = {
  percent_off: 'Percent off',
  amount_off: 'Dollars off',
  set: 'Set the price to',
};

export function BulkPriceDialog({
  open, selection, onClose, onApplied,
}: {
  open: boolean;
  selection: BulkSelection;
  onClose: () => void;
  onApplied: (change: BulkPriceChange) => void;
}) {
  const [mode, setMode] = useState<BulkPriceMode>('percent_off');
  const [value, setValue] = useState('25');
  const [round, setRound] = useState<BulkPriceRounding>('none');
  const [rule, setRule] = useState<BulkPriceRule | null>(null);
  const { enqueueSnackbar } = useSnackbar();

  useEffect(() => {
    const n = Number.parseFloat(value);
    const timer = window.setTimeout(() => setRule(Number.isFinite(n) && n > 0 ? { mode, value, round } : null), 300);
    return () => window.clearTimeout(timer);
  }, [mode, value, round]);

  const preview = useQuery({
    queryKey: ['bulk-price-preview', selection, rule],
    queryFn: async ({ signal }) => (await previewBulkPrice(selection, rule as BulkPriceRule, signal)).data,
    enabled: open && rule !== null,
    retry: false,
  });
  const apply = useMutation({
    mutationFn: async () => (await applyBulkPrice(selection, rule as BulkPriceRule)).data,
    onSuccess: (change) => onApplied(change),
    onError: () => enqueueSnackbar('The prices were not changed.', { variant: 'error' }),
  });
  const p = preview.data;
  const problem = (preview.error as { response?: { data?: { detail?: string } } } | null)?.response?.data?.detail;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>Change prices</DialogTitle>
      <DialogContent dividers>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 2 }}>
          <TextField select size="small" label="How" value={mode} onChange={(e) => setMode(e.target.value as BulkPriceMode)} sx={{ minWidth: 190 }}>
            {(Object.keys(MODE_LABEL) as BulkPriceMode[]).map((m) => <MenuItem key={m} value={m}>{MODE_LABEL[m]}</MenuItem>)}
          </TextField>
          <TextField
            size="small" label={mode === 'percent_off' ? 'Percent' : 'Amount'} value={value} autoFocus
            onChange={(e) => setValue(e.target.value)} inputProps={{ inputMode: 'decimal' }} sx={{ width: 140 }}
          />
          <TextField select size="small" label="Then round" value={round} onChange={(e) => setRound(e.target.value as BulkPriceRounding)} sx={{ minWidth: 190 }}>
            <MenuItem value="none">No rounding</MenuItem>
            <MenuItem value="99">To .99</MenuItem>
            <MenuItem value="dollar">To the dollar</MenuItem>
          </TextField>
        </Stack>
        {preview.isFetching && <LinearProgress sx={{ mb: 1 }} />}
        {problem && <Alert severity="warning" sx={{ mb: 1 }}>{problem}</Alert>}
        {p && (
          <Box>
            <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
              {p.count.toLocaleString()} item{p.count === 1 ? '' : 's'}: {formatCurrency(p.total_before)} to {formatCurrency(p.total_after)}
            </Typography>
            <Typography variant="caption" color="text.secondary" component="div" sx={{ mb: 1 }}>
              Only items on the shelf change.
              {p.unchanged > 0 && ` ${p.unchanged.toLocaleString()} already at that price.`}
              {p.at_floor > 0 && ` ${p.at_floor.toLocaleString()} stop at the $0.50 floor.`}
              {p.over_cap && ` More than ${p.cap.toLocaleString()} are selected; narrow the selection.`}
            </Typography>
            <Table size="small" aria-label="Preview of the price change">
              <TableHead>
                <TableRow>
                  <TableCell>SKU</TableCell>
                  <TableCell>Item</TableCell>
                  <TableCell align="right">Now</TableCell>
                  <TableCell align="right">New</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {p.sample.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>{r.sku}</TableCell>
                    <TableCell>{r.title}</TableCell>
                    <TableCell align="right">{formatCurrency(r.old)}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>{formatCurrency(r.new)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {p.count > p.sample.length && (
              <Typography variant="caption" color="text.secondary">And {(p.count - p.sample.length).toLocaleString()} more.</Typography>
            )}
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          disabled={!p || p.count === 0 || p.over_cap || preview.isFetching || apply.isPending}
          onClick={() => apply.mutate()}
        >
          {p && p.count > 0 ? `Change ${p.count.toLocaleString()} price${p.count === 1 ? '' : 's'}` : 'Change prices'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ── The drawer: tag progress and recent price changes ──────────────────────────

function when(iso: string): string {
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function BulkDrawer({
  open, onClose, job, onCancelPrint, onPrint, canPrice,
}: {
  open: boolean;
  onClose: () => void;
  job: PrintJob | null;
  onCancelPrint: () => void;
  onPrint: (label: string, items: BulkPriceItem[]) => void;
  canPrice: boolean;
}) {
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const changes = useQuery({
    queryKey: ['bulk-price-changes'],
    queryFn: async () => (await getBulkPriceChanges()).data.results,
    enabled: open && canPrice,
  });
  const undo = useMutation({
    mutationFn: async (id: number) => (await undoBulkPrice(id)).data,
    onSuccess: (change) => {
      const r = change.undo_result;
      enqueueSnackbar(
        r ? `${r.restored.toLocaleString()} price${r.restored === 1 ? '' : 's'} put back${r.left_alone ? `; ${r.left_alone.toLocaleString()} left alone (sold or changed since)` : ''}.` : 'Undone.',
        { variant: 'success' },
      );
      void queryClient.invalidateQueries({ queryKey: ['bulk-price-changes'] });
      void queryClient.invalidateQueries({ queryKey: ['inventory-search'] });
      void queryClient.invalidateQueries({ queryKey: ['inventory-search-items'] });
    },
    onError: () => enqueueSnackbar('The change was not undone.', { variant: 'error' }),
  });
  const reprint = async (change: BulkPriceChange) => {
    const full = (await getBulkPriceChange(change.id)).data;
    onPrint(`Tags for "${change.description}"`, full.items ?? []);
  };

  return (
    <Drawer anchor="right" open={open} onClose={onClose} PaperProps={{ sx: { width: { xs: '100%', sm: 420 }, p: 2 } }}>
      <Stack direction="row" alignItems="center" sx={{ mb: 1 }}>
        <Typography variant="h6" sx={{ flex: 1 }}>Bulk work</Typography>
        <IconButton onClick={onClose} aria-label="Close"><Close /></IconButton>
      </Stack>

      <Typography variant="subtitle2">Tags</Typography>
      {job ? (
        <Box sx={{ mb: 2 }}>
          <Typography variant="body2">{job.label}</Typography>
          <LinearProgress variant="determinate" value={job.total ? (100 * (job.done + (job.running ? 0 : job.failed))) / job.total : 0} sx={{ my: 0.75 }} />
          <Typography variant="caption" color={job.failed && !job.running ? 'error' : 'text.secondary'} component="div">
            {job.running ? `Printing ${job.done.toLocaleString()} of ${job.total.toLocaleString()}` : `Printed ${job.done.toLocaleString()} of ${job.total.toLocaleString()}`}
            {!job.running && job.failed > 0 && `; ${job.failed.toLocaleString()} did not print. Check the print server on this computer.`}
          </Typography>
          {job.running && <Button size="small" onClick={onCancelPrint} sx={{ mt: 0.5 }}>Stop printing</Button>}
        </Box>
      ) : (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>Nothing is printing.</Typography>
      )}

      {canPrice && (
        <>
          <Divider sx={{ mb: 1.5 }} />
          <Typography variant="subtitle2" sx={{ mb: 0.5 }}>Recent price changes</Typography>
          {changes.isLoading && <LinearProgress />}
          {changes.data?.length === 0 && <Typography variant="body2" color="text.secondary">None yet.</Typography>}
          <Stack spacing={1.25} sx={{ overflowY: 'auto' }}>
            {changes.data?.map((c) => (
              <Box key={c.id} sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 1.25, opacity: c.undone_at ? 0.65 : 1 }}>
                <Typography variant="body2" sx={{ fontWeight: 700 }}>{c.description}</Typography>
                <Typography variant="caption" color="text.secondary" component="div">
                  {c.item_count.toLocaleString()} item{c.item_count === 1 ? '' : 's'} · {formatCurrency(c.total_before)} to {formatCurrency(c.total_after)}
                </Typography>
                <Typography variant="caption" color="text.secondary" component="div">
                  {c.created_by || 'Someone'} · {when(c.created_at)}
                </Typography>
                {c.undone_at ? (
                  <Typography variant="caption" component="div" sx={{ mt: 0.5 }}>
                    Undone by {c.undone_by || 'someone'}, {when(c.undone_at)}
                    {c.undo_result ? ` (${c.undo_result.restored.toLocaleString()} put back)` : ''}
                  </Typography>
                ) : (
                  <Stack direction="row" spacing={1} sx={{ mt: 0.75 }}>
                    <Button size="small" variant="outlined" disabled={!!job?.running} onClick={() => void reprint(c)}>Reprint tags</Button>
                    <Button size="small" color="warning" disabled={undo.isPending} onClick={() => undo.mutate(c.id)}>Undo</Button>
                  </Stack>
                )}
              </Box>
            ))}
          </Stack>
        </>
      )}
    </Drawer>
  );
}

/** The tags of the current selection (bulk reprint). */
export async function labelsForSelection(selection: BulkSelection): Promise<BulkPriceItem[]> {
  return (await getBulkLabels(selection)).data.items;
}
