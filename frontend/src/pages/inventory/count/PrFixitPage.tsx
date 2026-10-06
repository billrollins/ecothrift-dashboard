import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Alert, Box, Button, Chip, CircularProgress, Divider, MenuItem, Paper, Stack, TextField, Typography } from '@mui/material';
import {
  apiMessage,
  fixIssue,
  fixitProducts,
  listFixIssues,
  listFixitInventories,
  reopenIssue,
  scanFix,
  type FixitInventory,
  type FixKind,
  type Issue,
  type ItemBrief,
  type ProductOption,
  type ScanFixResult,
  type ShrinkReason,
  type TagLabel,
} from '../../../api/stocktake.api';
import { localPrintService } from '../../../services/localPrintService';
import QuickRepricePage from '../QuickRepricePage';
import { priceFromNote } from './countProblems';
import { clockTime } from './countTimer';
import { inventoryName } from './inventoryNames';
import { ScanBar } from './ScanBar';

type Tab = 'pr' | 'relocate' | 'fixed' | 'reprice';
const TABS: Tab[] = ['pr', 'relocate', 'fixed', 'reprice'];

const money = (v: string | null | undefined) => (v == null || v === '' ? '' : `$${Number(v).toFixed(2)}`);

/** "$14.00 · retail $70.00 (20%)": the price next to what it retails for, the quickest pricing cue. */
function priceLine(item: ItemBrief): string {
  const retail = Number(item.retail);
  const price = Number(item.price);
  if (!(retail > 0)) return money(item.price);
  return `${money(item.price)} · retail ${money(item.retail)} (${Math.round((100 * price) / retail)}%)`;
}

async function printTag(label: TagLabel | null | undefined): Promise<boolean> {
  if (!label) return false;
  try {
    await localPrintService.printLabel({
      qr_data: label.qr_data,
      text: label.text,
      product_title: label.product_title,
      product_brand: label.product_brand || undefined,
      product_model: label.product_model || undefined,
      include_text: true,
    });
    return true;
  } catch {
    return false;
  }
}

/** A scanned code, not words: one token of letters and digits with at least one digit ("lamp" stays a search). */
const looksLikeCode = (v: string) => /^[A-Za-z0-9-]{3,}$/.test(v.trim()) && /\d/.test(v);

/** Big enough for a thumb, plain enough for a desk. */
const btn = { textTransform: 'none' as const, fontWeight: 700, whiteSpace: 'nowrap' as const, minHeight: 40 };
const field = { '& input': { fontSize: 16 } };

/** Products for a "no tag" or "wrong title" answer, each with its not-found items (claim one in one tap). */
function ProductPicker({
  issueId,
  initial,
  busy,
  mode,
  onClaim,
  onNew,
  onPick,
  autoFocus,
}: {
  issueId: number;
  initial: string;
  busy: boolean;
  mode: 'no_tag' | 'right_product';
  onClaim?: (o: ProductOption) => void;
  onNew?: (o: ProductOption) => void;
  onPick?: (o: ProductOption) => void;
  autoFocus?: boolean;
}) {
  const [q, setQ] = useState(initial);
  const [found, setFound] = useState<ProductOption[] | null>(null);
  useEffect(() => {
    const text = q.trim();
    if (text.length < 3) {
      setFound(null);
      return undefined;
    }
    const id = window.setTimeout(() => {
      fixitProducts(text, issueId)
        .then(setFound)
        .catch(() => setFound([]));
    }, 300);
    return () => window.clearTimeout(id);
  }, [q, issueId]);
  return (
    <Box>
      <TextField
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={mode === 'no_tag' ? 'What is it? A few words, a brand' : 'Find the right product'}
        size="small"
        fullWidth
        autoFocus={autoFocus}
        sx={field}
        inputProps={{ 'aria-label': mode === 'no_tag' ? 'Find the product' : 'Find the right product' }}
      />
      {found?.map((o) => (
        <Stack key={o.product_id} direction="row" alignItems="center" spacing={1} sx={{ py: 0.75, borderBottom: 1, borderColor: 'divider' }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography noWrap sx={{ fontSize: 13, fontWeight: 700 }}>
              {o.title}
            </Typography>
            <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>
              {[o.brand, o.price ? money(o.price) : '', o.not_found ? `${o.not_found} not found in this inventory` : ''].filter(Boolean).join(' · ')}
            </Typography>
          </Box>
          {mode === 'no_tag' && o.claim_item_id && (
            <Button size="small" variant="contained" disabled={busy} onClick={() => onClaim?.(o)} sx={btn} title={`This is ${o.claim_sku}, one the inventory has not found`}>
              It&apos;s {o.claim_sku}, print
            </Button>
          )}
          {mode === 'no_tag' && o.can_copy && (
            <Button size="small" variant={o.claim_item_id ? 'outlined' : 'contained'} disabled={busy} onClick={() => onNew?.(o)} sx={btn}>
              New {o.price ? money(o.price) : ''}, print
            </Button>
          )}
          {mode === 'right_product' && (
            <Button size="small" variant="contained" disabled={busy} onClick={() => onPick?.(o)} sx={btn}>
              This one, print
            </Button>
          )}
        </Stack>
      ))}
      {found && found.length === 0 && <Typography sx={{ fontSize: 13, color: 'text.secondary', py: 0.5 }}>No product matches.</Typography>}
    </Box>
  );
}

/** Stolen, broken or scrap; broken and scrap can be salvaged as a new item at a price. */
function ShrinkPanel({ busy, onSave, onCancel }: { busy: boolean; onSave: (reason: ShrinkReason, salvage: string) => void; onCancel: () => void }) {
  const [reason, setReason] = useState<ShrinkReason | null>(null);
  const [salvage, setSalvage] = useState('');
  return (
    <Box sx={{ mt: 1, p: 1, border: 1, borderColor: 'divider', borderRadius: 1.5 }}>
      <Typography sx={{ fontSize: 13, fontWeight: 700, mb: 0.75 }}>Shrink: why?</Typography>
      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
        {(['stolen', 'broken', 'scrap'] as ShrinkReason[]).map((r) => (
          <Button key={r} size="small" variant={reason === r ? 'contained' : 'outlined'} color="warning" onClick={() => setReason(r)} sx={btn}>
            {r === 'stolen' ? 'Stolen' : r === 'broken' ? 'Broken' : 'Scrap'}
          </Button>
        ))}
      </Stack>
      {reason && reason !== 'stolen' && (
        <TextField
          value={salvage}
          onChange={(e) => setSalvage(e.target.value)}
          placeholder="Salvage price (optional)"
          size="small"
          sx={{ mt: 1, width: 200, ...field }}
          inputProps={{ inputMode: 'decimal', 'aria-label': 'Salvage price' }}
          helperText="A price makes a new salvage item and prints its tag."
        />
      )}
      <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
        <Button variant="contained" color="warning" disabled={busy || !reason} onClick={() => reason && onSave(reason, salvage)} sx={btn}>
          Save shrink
        </Button>
        <Button color="inherit" disabled={busy} onClick={onCancel} sx={btn}>
          Cancel
        </Button>
      </Stack>
    </Box>
  );
}

interface RowProps {
  issue: Issue;
  onChanged: (issue: Issue) => void;
  /** The scan just landed on this card: put the cursor in its first box. */
  focus?: boolean;
}

/** One problem item and its fix: the fewest clicks that end with a good tag on the item. */
function FixCard({ issue, onChanged, focus }: RowProps) {
  const item = issue.item;
  const [title, setTitle] = useState(issue.kind === 'wrong_title' && issue.detail ? issue.detail : item?.title ?? '');
  const [price, setPrice] = useState(
    ((issue.kind === 'price_high' || issue.kind === 'price_low') && priceFromNote(issue.detail)) || (item ? Number(item.price).toFixed(2) : ''),
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'success' | 'warning' | 'error'; text: string } | null>(null);
  const [label, setLabel] = useState<TagLabel | null>(issue.label ?? null);
  const [shrink, setShrink] = useState(false);
  const [pickProduct, setPickProduct] = useState(false);
  const priceRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (focus && priceRef.current) priceRef.current.select();
  }, [focus]);

  const run = async (fix: FixKind, extra: Record<string, unknown> = {}, wantsPrint = true) => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fixIssue(issue.id, { fix, ...extra });
      setLabel(res.label);
      onChanged(res.issue);
      setShrink(false);
      if (wantsPrint && res.label) {
        const ok = await printTag(res.label);
        setMessage(ok ? { kind: 'success', text: `Tag printed: ${res.label.qr_data} ${res.label.text}` } : { kind: 'warning', text: 'Fixed, but the tag did not print. Check the print server, then Print again.' });
      }
    } catch (e) {
      setMessage({ kind: 'error', text: apiMessage(e, 'Could not save the fix.') });
    } finally {
      setBusy(false);
    }
  };

  const reprint = async () => {
    setBusy(true);
    const ok = await printTag(label);
    setMessage(ok ? { kind: 'success', text: 'Tag printed.' } : { kind: 'warning', text: 'The tag did not print. Check the print server.' });
    setBusy(false);
  };

  const undo = async () => {
    setBusy(true);
    try {
      onChanged(await reopenIssue(issue.id));
      setMessage(null);
    } catch (e) {
      setMessage({ kind: 'error', text: apiMessage(e, 'Could not undo.') });
    } finally {
      setBusy(false);
    }
  };

  const changed = !!item && (title.trim() !== item.title || (price !== '' && Number(price) !== Number(item.price)));
  const edits = () => ({
    title: item && title.trim() !== item.title ? title.trim() : undefined,
    price: item && price !== '' && Number(price) !== Number(item.price) ? price : undefined,
  });
  const shrinkSave = (reason: ShrinkReason, salvage: string) =>
    void run('shrink', { reason, salvage_price: salvage.trim() || undefined }, !!salvage.trim());

  let fix;
  if (issue.fixed_at) {
    fix = (
      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
        <Chip size="small" color="success" label={issue.fix === 'move_sale' ? `Kept; old sale is now ${issue.new_item?.sku ?? 'a new item'}` : issue.new_item ? `Fixed: new tag ${issue.new_item.sku}` : issue.fix === 'shrink' ? 'Shrink recorded' : 'Fixed'} />
        {label && issue.fix !== 'dismiss' && issue.fix !== 'moved' && (
          <Button size="small" disabled={busy} onClick={() => void reprint()} sx={btn}>
            Print again
          </Button>
        )}
        <Button size="small" color="inherit" disabled={busy} onClick={() => void undo()} sx={btn}>
          Undo
        </Button>
      </Stack>
    );
  } else if (issue.action === 'relocate') {
    fix = (
      <Button variant="contained" disabled={busy} onClick={() => void run('moved', {}, false)} sx={{ ...btn, width: { xs: '100%', sm: 'auto' } }}>
        Moved{issue.target_section ? ` to ${issue.target_section}` : ''}
      </Button>
    );
  } else if (!item) {
    fix = (
      <Box>
        <ProductPicker
          issueId={issue.id}
          initial={issue.kind === 'no_tag' ? issue.detail : ''}
          busy={busy}
          mode="no_tag"
          autoFocus={focus}
          onClaim={(o) => void run('use_item', { item_id: o.claim_item_id ?? undefined })}
          onNew={(o) => void run('new_from_product', { product_id: o.product_id, price: price || o.price || undefined })}
        />
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mt: 1 }}>
          <TextField value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Not a product we have? What is it?" size="small" sx={{ flex: 1, ...field }} inputProps={{ maxLength: 300, 'aria-label': 'New item title' }} />
          <Stack direction="row" spacing={1}>
            <TextField value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Price" size="small" sx={{ width: { xs: '100%', sm: 100 }, ...field }} inputProps={{ inputMode: 'decimal', 'aria-label': 'New item price' }} />
            <Button variant="outlined" disabled={busy || !title.trim() || !price} onClick={() => void run('quick_add', { title: title.trim(), price })} sx={btn}>
              Add, print
            </Button>
          </Stack>
        </Stack>
      </Box>
    );
  } else {
    const asNew = issue.kind === 'already_scanned' || item.status === 'sold';
    const shelve = !asNew && item.status !== 'on_shelf';
    fix = (
      <Box>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }}>
          {!asNew && !shelve && (
            <TextField value={title} onChange={(e) => setTitle(e.target.value)} size="small" sx={{ flex: 1, minWidth: { sm: 200 }, ...field }} inputProps={{ maxLength: 300, 'aria-label': 'Title' }} />
          )}
          <Stack direction="row" spacing={1}>
            {!shelve && (
              <TextField
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !asNew) void (changed ? run('edit', edits()) : run('reprint'));
                }}
                inputRef={priceRef}
                size="small"
                sx={{ width: 100, flexShrink: 0, ...field }}
                inputProps={{ inputMode: 'decimal', 'aria-label': 'Price' }}
              />
            )}
            {asNew && item.status === 'sold' && (
              <Button variant="contained" disabled={busy} onClick={() => void run('move_sale', {}, false)} sx={{ ...btn, flex: { xs: 1, sm: 'none' } }} title="Two items shared this tag. This one stays with its tag; the old sale moves to a new number. Nothing to print.">
                Keep this tag
              </Button>
            )}
            {asNew && (
              <Button variant={item.status === 'sold' ? 'outlined' : 'contained'} disabled={busy} onClick={() => void run('print_as_new', { price: price || undefined })} sx={{ ...btn, flex: { xs: 1, sm: 'none' } }}>
                Print as new
              </Button>
            )}
            {shelve && (
              <Button variant="contained" disabled={busy} onClick={() => void run('put_on_shelf', {}, false)} sx={{ ...btn, width: { xs: '100%', sm: 'auto' } }}>
                Back on shelf
              </Button>
            )}
            {!asNew && !shelve && (
              <Button variant="contained" disabled={busy} onClick={() => void (changed ? run('edit', edits()) : run('reprint'))} sx={{ ...btn, flex: { xs: 1, sm: 'none' } }}>
                {changed ? 'Save, print tag' : 'Reprint tag'}
              </Button>
            )}
          </Stack>
        </Stack>
        {issue.kind === 'wrong_title' && !pickProduct && (
          <Button size="small" onClick={() => setPickProduct(true)} sx={{ textTransform: 'none', mt: 0.5 }}>
            Or pick the right product
          </Button>
        )}
        {issue.kind === 'wrong_title' && pickProduct && (
          <Box sx={{ mt: 1 }}>
            <ProductPicker issueId={issue.id} initial={issue.detail || ''} busy={busy} mode="right_product" autoFocus onPick={(o) => void run('set_product', { product_id: o.product_id })} />
          </Box>
        )}
        {item.status !== 'sold' && !shrink && (
          <Button size="small" color="warning" onClick={() => setShrink(true)} sx={{ textTransform: 'none', mt: 0.5, ml: issue.kind === 'wrong_title' && !pickProduct ? 1 : 0 }}>
            Shrink (stolen, broken, scrap)
          </Button>
        )}
        {shrink && <ShrinkPanel busy={busy} onSave={shrinkSave} onCancel={() => setShrink(false)} />}
      </Box>
    );
  }

  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', md: '210px minmax(0, 1fr) minmax(360px, 1.15fr)' },
        gap: { xs: 1, md: 2 },
        p: { xs: 1.5, md: 2 },
        alignItems: 'start',
        opacity: issue.fixed_at ? 0.75 : 1,
        outline: focus ? 2 : 0,
        outlineColor: 'primary.main',
        borderRadius: 1,
      }}
    >
      <Box>
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
          <Chip size="small" color={issue.action === 'relocate' ? 'info' : 'warning'} label={issue.kind_label} sx={{ fontWeight: 700 }} />
          <Typography sx={{ fontWeight: 700, fontSize: 13 }}>{issue.cart}</Typography>
        </Stack>
        {issue.detail && <Typography sx={{ fontSize: 13, color: 'warning.dark', mt: 0.5 }}>&quot;{issue.detail}&quot;</Typography>}
        <Typography sx={{ fontSize: 12, color: 'text.secondary', mt: 0.25 }}>
          {issue.by} · {issue.section} · {clockTime(issue.created_at)}
        </Typography>
      </Box>

      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ fontSize: 15, fontWeight: 600 }}>{item?.title || (issue.code ? 'Tag not recognized' : 'No tag')}</Typography>
        <Typography sx={{ fontFamily: 'monospace', fontSize: 13, color: 'text.secondary' }}>{item?.sku || issue.code || ''}</Typography>
        {item && <Typography sx={{ fontSize: 13 }}>{priceLine(item)}</Typography>}
        {item && item.status !== 'on_shelf' && <Typography sx={{ fontSize: 12, color: 'error.main' }}>System says {item.status}</Typography>}
      </Box>

      <Box>
        {fix}
        {message && (
          <Alert severity={message.kind} sx={{ mt: 0.75, py: 0 }}>
            {message.text}
          </Alert>
        )}
        {!issue.fixed_at && (
          <Button size="small" color="inherit" disabled={busy} onClick={() => void run('dismiss', {}, false)} sx={{ textTransform: 'none', mt: 0.25, color: 'text.secondary' }}>
            Nothing to fix
          </Button>
        )}
      </Box>
    </Box>
  );
}

type ScanNote = { kind: 'success' | 'info' | 'warning' | 'error'; text: string; label?: TagLabel | null; sku?: string };

/**
 * PR Fix-it: the simple, quick fixes for floor items (owner, 2026-10-02).
 *
 * - **One scan, one answer** (inventory_effort Phase 2, 2026-10-06): scanning a tag on the To fix tab fixes it when
 *   the fix is certain and prints the new tag with no click (duplicate tag, back on the shelf, bad tag, a price the
 *   counter wrote down). Anything that needs an answer opens its card with the cursor in it.
 * - No tag: find the product; claim one of its items the inventory has not found (it leaves the potential shrink),
 *   or print a new one. Wrong title: pick the right product. Shrink: stolen, broken or scrap, with salvage.
 * - Four tabs: To fix and To relocate (what a count put in carts), Fixed, and Quick reprice. The tab is in the URL.
 * - One inventory at a time (inventory_effort Phase 6): the latest by default; pick an earlier one for a pile found
 *   later (``?count=<id>``, or ``all``). A scanned tag still finds its problem in any inventory.
 */
export default function PrFixitPage() {
  const [rows, setRows] = useState<Issue[] | null>(null);
  const [fixed, setFixed] = useState<Issue[] | null>(null);
  const [params, setParams] = useSearchParams();
  const tab: Tab = TABS.find((x) => x === params.get('tab')) ?? 'pr';
  const [filter, setFilter] = useState('');
  const [error, setError] = useState('');
  const [printer, setPrinter] = useState<boolean | null>(null);
  const [scanNote, setScanNote] = useState<ScanNote | null>(null);
  const [focusId, setFocusId] = useState<number | null>(null);
  const [scanning, setScanning] = useState(false);
  const scanRef = useRef<HTMLInputElement>(null);
  const [inventories, setInventories] = useState<FixitInventory[]>([]);
  const countParam = params.get('count');
  const count: number | 'all' | undefined = countParam === 'all' ? 'all' : countParam && /^\d+$/.test(countParam) ? Number(countParam) : undefined;
  const latest = inventories.find((i) => i.latest);
  const countId = typeof count === 'number' ? count : count === 'all' ? undefined : latest?.id;
  const setCount = (next: string) => {
    const q = new URLSearchParams(params);
    if (!next || (latest && next === String(latest.id))) q.delete('count');
    else q.set('count', next);
    setParams(q, { replace: true });
  };

  const setTab = (next: Tab, sku?: string) => {
    const q = new URLSearchParams(params);
    if (next === 'pr') q.delete('tab');
    else q.set('tab', next);
    if (next === 'reprice' && sku) q.set('sku', sku);
    else q.delete('sku');
    setParams(q, { replace: true });
    setFilter('');
    setScanNote(null);
  };

  const reload = useCallback(() => {
    setError('');
    listFixIssues('open', count)
      .then(setRows)
      .catch(() => setError('Could not load the list. Check the connection.'));
    listFixIssues('fixed', count)
      .then((list) => setFixed(list.slice(0, 200)))
      .catch(() => setFixed([]));
    listFixitInventories().then(setInventories).catch(() => setInventories([]));
    void localPrintService.isAvailable().then(setPrinter);
  }, [count]);
  useEffect(reload, [reload]);
  useEffect(() => {
    if (tab !== 'reprice') scanRef.current?.focus();
  }, [tab]);

  // A fixed row stays where it is (greyed, with Print again and Undo) until the list is refreshed.
  const onChanged = (issue: Issue) => {
    setRows((list) => (list ? list.map((r) => (r.id === issue.id ? { ...issue, label: r.label } : r)) : list));
    setFixed((list) => (list ? list.map((r) => (r.id === issue.id ? { ...issue, label: r.label } : r)) : list));
  };

  /** Scan on the To fix tab: the server fixes what is certain; the rest opens its card. */
  const onScan = async () => {
    const code = filter.trim();
    if (tab !== 'pr' || !looksLikeCode(code)) {
      scanRef.current?.select();
      return;
    }
    setScanning(true);
    setFocusId(null);
    try {
      const res: ScanFixResult = await scanFix(code, countId);
      if (res.status === 'fixed') {
        if (res.issue) onChanged(res.issue);
        let text = res.message;
        let kind: ScanNote['kind'] = 'success';
        if (res.print && res.label) {
          const ok = await printTag(res.label);
          if (!ok) {
            kind = 'warning';
            text = `${res.message} The tag did not print: check the print server, then Print again.`;
          }
        }
        setScanNote({ kind, text: `${res.issue?.item?.title ?? code}: ${text}`, label: res.label ?? null });
        setFilter('');
      } else if (res.status === 'needs_input' && res.issue) {
        setScanNote({ kind: 'info', text: `${res.issue.kind_label}: ${res.message}` });
        setFocusId(res.issue.id);
        setFilter(code);
        return;
      } else if (res.status === 'no_problem') {
        setScanNote({ kind: 'info', text: `${res.item?.title ?? code}: ${res.message}`, label: res.label ?? null, sku: res.item?.sku });
        setFilter('');
      } else {
        setScanNote({ kind: 'warning', text: `${code}: ${res.message}` });
        setFilter('');
      }
    } catch (e) {
      setScanNote({ kind: 'error', text: apiMessage(e, 'Could not check that tag.') });
    } finally {
      setScanning(false);
      window.setTimeout(() => scanRef.current?.focus(), 0);
    }
  };

  const source = useMemo(
    () => (tab === 'fixed' ? fixed ?? [] : (rows ?? []).filter((r) => (tab === 'pr' ? r.action === 'pr_cart' : r.action === 'relocate'))),
    [rows, fixed, tab],
  );
  const shown = useMemo(() => {
    const words = filter.trim().toLowerCase();
    const list = words
      ? source.filter((r) => [r.code, r.cart, r.kind_label, r.item?.sku, r.item?.title, r.by, r.section, r.detail].some((v) => (v || '').toLowerCase().includes(words)))
      : source;
    return tab === 'fixed' ? list : [...list].sort((a, b) => a.cart.localeCompare(b.cart) || a.id - b.id);
  }, [source, tab, filter]);

  const open = (kind: 'pr_cart' | 'relocate') => (rows ?? []).filter((r) => r.action === kind && !r.fixed_at).length;
  const carts = new Set(source.filter((r) => !r.fixed_at).map((r) => r.cart)).size;
  const looksLikeSku = /^itm\d+$/i.test(filter.trim());
  const todayIso = new Date().toDateString();
  const fixedToday = (fixed ?? []).filter((r) => r.fixed_at && new Date(r.fixed_at).toDateString() === todayIso).length
    + (rows ?? []).filter((r) => r.fixed_at && new Date(r.fixed_at).toDateString() === todayIso).length;

  const tabs: { id: Tab; label: string }[] = [
    { id: 'pr', label: `To fix (${open('pr_cart')})` },
    { id: 'relocate', label: `To relocate (${open('relocate')})` },
    { id: 'fixed', label: 'Fixed' },
    { id: 'reprice', label: 'Quick reprice' },
  ];

  return (
    <Box sx={{ p: { xs: 0.5, sm: 2 }, width: '100%', minWidth: 0, maxWidth: 1400, mx: 'auto' }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1} sx={{ mb: 1.5 }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h5" sx={{ fontWeight: 800 }}>
            PR Fix-it
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            Scan a tag: most fixes happen on the scan and the new tag prints by itself.
          </Typography>
        </Box>
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
          {inventories.length > 0 && (
            <TextField
              select
              size="small"
              label="Inventory"
              value={count === 'all' ? 'all' : String(countId ?? '')}
              onChange={(e) => setCount(e.target.value)}
              sx={{ minWidth: 240 }}
            >
              {inventories.map((i) => (
                <MenuItem key={i.id} value={String(i.id)}>
                  {inventoryName(i)} · {i.stage === 'in_progress' ? 'in progress' : 'done'}
                  {i.open ? ` · ${i.open} open` : ''}
                </MenuItem>
              ))}
              <MenuItem value="all">All inventories</MenuItem>
            </TextField>
          )}
          {fixedToday > 0 && <Chip size="small" color="success" variant="outlined" label={`${fixedToday} fixed today`} />}
          {printer != null && <Chip size="small" color={printer ? 'success' : 'warning'} label={printer ? 'Tag printer ready' : 'No print server on this device'} />}
          <Button size="small" onClick={reload} sx={{ textTransform: 'none' }}>
            Refresh
          </Button>
        </Stack>
      </Stack>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(4, max-content)' }, gap: 1, mb: 1.5 }}>
        {tabs.map((t) => (
          <Button
            key={t.id}
            variant={tab === t.id ? 'contained' : 'outlined'}
            color={tab === t.id ? 'primary' : 'inherit'}
            onClick={() => setTab(t.id)}
            aria-pressed={tab === t.id}
            sx={{ ...btn, px: 2, borderColor: 'divider' }}
          >
            {t.label}
          </Button>
        ))}
      </Box>

      {tab === 'reprice' ? (
        <QuickRepricePage embedded />
      ) : (
        <>
          <ScanBar
            inputRef={scanRef}
            value={filter}
            onChange={(v) => {
              setFilter(v);
              if (!v) setFocusId(null);
            }}
            onSubmit={() => void onScan()}
            label={tab === 'pr' ? 'Scan a tag to fix it' : 'Scan or type to find'}
            placeholder={tab === 'pr' ? 'Scan a tag, or type words, a cart or a person to find' : 'A SKU, a cart, a few words, or a person'}
            actionLabel={scanning ? 'Checking…' : filter ? 'Clear' : 'Find'}
            actionDisabled={!filter || scanning}
            onAction={() => {
              setFilter('');
              setFocusId(null);
              scanRef.current?.focus();
            }}
            helper={
              rows && !filter
                ? tab === 'fixed'
                  ? `${source.length} fixed recently.`
                  : source.length
                    ? `${source.filter((r) => !r.fixed_at).length} waiting in ${carts} cart${carts === 1 ? '' : 's'}.`
                    : undefined
                : filter && rows
                  ? `Showing ${shown.length} of ${source.length}.`
                  : undefined
            }
          />

          {scanNote && (
            <Alert
              severity={scanNote.kind}
              onClose={() => setScanNote(null)}
              sx={{ mb: 1.5 }}
              action={
                <Stack direction="row" spacing={1}>
                  {scanNote.label && (
                    <Button size="small" color="inherit" onClick={() => void printTag(scanNote.label)} sx={{ textTransform: 'none' }}>
                      Print again
                    </Button>
                  )}
                  {scanNote.sku && (
                    <Button size="small" color="inherit" onClick={() => setTab('reprice', scanNote.sku)} sx={{ textTransform: 'none' }}>
                      Quick reprice
                    </Button>
                  )}
                </Stack>
              }
            >
              {scanNote.text}
            </Alert>
          )}
          {error && (
            <Alert severity="error" sx={{ mb: 1.5 }}>
              {error}
            </Alert>
          )}
          {!rows && !error && (
            <Box sx={{ p: 4, textAlign: 'center' }}>
              <CircularProgress />
            </Box>
          )}
          {rows && shown.length === 0 && (
            <Paper variant="outlined" sx={{ p: 3, textAlign: 'center' }}>
              <Typography sx={{ color: 'text.secondary' }}>
                {filter ? 'Nothing here matches.' : tab === 'fixed' ? 'Nothing fixed yet.' : 'Nothing waiting. Good.'}
              </Typography>
              {filter && looksLikeSku && (
                <Button variant="contained" onClick={() => setTab('reprice', filter.trim().toUpperCase())} sx={{ ...btn, mt: 1.5 }}>
                  Quick reprice {filter.trim().toUpperCase()}
                </Button>
              )}
            </Paper>
          )}
          {rows && shown.length > 0 && (
            <Paper variant="outlined">
              {shown.map((issue, i) => (
                <Box key={issue.id}>
                  {i > 0 && <Divider />}
                  <FixCard issue={issue} onChanged={onChanged} focus={focusId === issue.id} />
                </Box>
              ))}
            </Paper>
          )}
        </>
      )}
    </Box>
  );
}
