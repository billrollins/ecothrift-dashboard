import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Alert, Box, Button, Chip, CircularProgress, Divider, Paper, Stack, TextField, Typography } from '@mui/material';
import {
  apiMessage,
  fixIssue,
  listFixIssues,
  reopenIssue,
  searchItems,
  type FixKind,
  type Issue,
  type ItemBrief,
  type TagLabel,
} from '../../../api/stocktake.api';
import { localPrintService } from '../../../services/localPrintService';
import QuickRepricePage from '../QuickRepricePage';
import { priceFromNote } from './countProblems';
import { clockTime } from './countTimer';
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

/** Big enough for a thumb, plain enough for a desk. */
const btn = { textTransform: 'none' as const, fontWeight: 700, whiteSpace: 'nowrap' as const, minHeight: 40 };
const field = { '& input': { fontSize: 16 } };

interface RowProps {
  issue: Issue;
  onChanged: (issue: Issue) => void;
}

/** One problem item and its fix: the fewest clicks that end with a good tag on the item. */
function FixCard({ issue, onChanged }: RowProps) {
  const item = issue.item;
  const [title, setTitle] = useState(issue.kind === 'wrong_title' && issue.detail ? issue.detail : item?.title ?? '');
  const [price, setPrice] = useState(
    ((issue.kind === 'price_high' || issue.kind === 'price_low') && priceFromNote(issue.detail)) || (item ? Number(item.price).toFixed(2) : ''),
  );
  const [q, setQ] = useState(issue.kind === 'no_tag' ? issue.detail : '');
  const [found, setFound] = useState<ItemBrief[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'success' | 'warning' | 'error'; text: string } | null>(null);
  const [label, setLabel] = useState<TagLabel | null>(issue.label ?? null);

  useEffect(() => {
    const text = q.trim();
    if (item || text.length < 3) {
      setFound(null);
      return undefined;
    }
    const id = window.setTimeout(() => {
      searchItems(text)
        .then(setFound)
        .catch(() => setFound([]));
    }, 300);
    return () => window.clearTimeout(id);
  }, [q, item]);

  const run = async (fix: FixKind, extra: Record<string, unknown> = {}, wantsPrint = true) => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fixIssue(issue.id, { fix, ...extra });
      setLabel(res.label);
      onChanged(res.issue);
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

  let fix;
  if (issue.fixed_at) {
    fix = (
      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
        <Chip size="small" color="success" label={issue.new_item ? `Fixed: new tag ${issue.new_item.sku}` : 'Fixed'} />
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
        <TextField
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Find the item: words, brand, or a SKU"
          size="small"
          fullWidth
          sx={field}
          inputProps={{ 'aria-label': 'Find the item' }}
        />
        {found?.map((f) => (
          <Stack key={f.id} direction="row" alignItems="center" spacing={1} sx={{ py: 0.75, borderBottom: 1, borderColor: 'divider' }}>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography noWrap sx={{ fontSize: 13, fontWeight: 700 }}>
                {f.title}
              </Typography>
              <Typography sx={{ fontSize: 12, color: 'text.secondary', fontFamily: 'monospace' }}>
                {f.sku} · {money(f.price)} · {f.status === 'on_shelf' ? 'on shelf' : f.status}
              </Typography>
            </Box>
            <Button size="small" variant="contained" disabled={busy} onClick={() => void run('use_item', { item_id: f.id })} sx={btn}>
              {f.status === 'sold' ? 'Print as new' : 'This one, print'}
            </Button>
          </Stack>
        ))}
        {found && found.length === 0 && <Typography sx={{ fontSize: 13, color: 'text.secondary', py: 0.5 }}>No match. Add it below.</Typography>}
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mt: 1 }}>
          <TextField value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Or add it: what is it?" size="small" sx={{ flex: 1, ...field }} inputProps={{ maxLength: 300, 'aria-label': 'New item title' }} />
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
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }}>
        {!asNew && !shelve && (
          <TextField value={title} onChange={(e) => setTitle(e.target.value)} size="small" sx={{ flex: 1, minWidth: { sm: 200 }, ...field }} inputProps={{ maxLength: 300, 'aria-label': 'Title' }} />
        )}
        <Stack direction="row" spacing={1}>
          {!shelve && (
            <TextField value={price} onChange={(e) => setPrice(e.target.value)} size="small" sx={{ width: 100, flexShrink: 0, ...field }} inputProps={{ inputMode: 'decimal', 'aria-label': 'Price' }} />
          )}
          {asNew && (
            <Button variant="contained" disabled={busy} onClick={() => void run('print_as_new', { price: price || undefined })} sx={{ ...btn, flex: { xs: 1, sm: 'none' } }}>
              Print as new
            </Button>
          )}
          {shelve && (
            <Button variant="contained" disabled={busy} onClick={() => void run('put_on_shelf')} sx={{ ...btn, width: { xs: '100%', sm: 'auto' } }}>
              Put on shelf, print
            </Button>
          )}
          {!asNew && !shelve && (
            <Button variant="contained" disabled={busy} onClick={() => void (changed ? run('edit', edits()) : run('reprint'))} sx={{ ...btn, flex: { xs: 1, sm: 'none' } }}>
              {changed ? 'Save, print tag' : 'Reprint tag'}
            </Button>
          )}
        </Stack>
      </Stack>
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

/**
 * PR Fix-it: the simple, quick fixes for floor items (owner, 2026-10-02).
 *
 * - Four tabs: To fix and To relocate (what a count put in carts), Fixed, and Quick reprice (scan, mark down, print).
 * - **One scan box, the same on every tab** (`ScanBar`): on the cart tabs a scan finds that item's row; on Quick
 *   reprice a scan marks the item down.
 * - Desktop first (three columns: problem, item, fix), and the same cards stack on a phone with thumb-size buttons.
 * - The tab is in the URL (`?tab=`).
 */
export default function PrFixitPage() {
  const [rows, setRows] = useState<Issue[] | null>(null);
  const [fixed, setFixed] = useState<Issue[] | null>(null);
  const [params, setParams] = useSearchParams();
  const tab: Tab = TABS.find((x) => x === params.get('tab')) ?? 'pr';
  const [filter, setFilter] = useState('');
  const [error, setError] = useState('');
  const [printer, setPrinter] = useState<boolean | null>(null);
  const scanRef = useRef<HTMLInputElement>(null);

  const setTab = (next: Tab, sku?: string) => {
    const q = new URLSearchParams(params);
    if (next === 'pr') q.delete('tab');
    else q.set('tab', next);
    if (next === 'reprice' && sku) q.set('sku', sku);
    else q.delete('sku');
    setParams(q, { replace: true });
    setFilter('');
  };

  const reload = useCallback(() => {
    setError('');
    listFixIssues('open')
      .then(setRows)
      .catch(() => setError('Could not load the list. Check the connection.'));
    listFixIssues('fixed')
      .then((list) => setFixed(list.slice(0, 100)))
      .catch(() => setFixed([]));
    void localPrintService.isAvailable().then(setPrinter);
  }, []);
  useEffect(reload, [reload]);
  useEffect(() => {
    if (tab !== 'reprice') scanRef.current?.focus();
  }, [tab]);

  // A fixed row stays where it is (greyed, with Print again and Undo) until the list is refreshed.
  const onChanged = (issue: Issue) => {
    setRows((list) => (list ? list.map((r) => (r.id === issue.id ? { ...issue, label: r.label } : r)) : list));
    setFixed((list) => (list ? list.map((r) => (r.id === issue.id ? { ...issue, label: r.label } : r)) : list));
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
            Quick fixes for floor items. Scan a tag, fix it, and it goes back out with a good tag.
          </Typography>
        </Box>
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
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
            onChange={setFilter}
            onSubmit={() => scanRef.current?.select()}
            label="Scan or type to find"
            placeholder="A SKU, a cart, a few words, or a person"
            actionLabel={filter ? 'Clear' : 'Find'}
            actionDisabled={!filter}
            onAction={() => {
              setFilter('');
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
                  <FixCard issue={issue} onChanged={onChanged} />
                </Box>
              ))}
            </Paper>
          )}
        </>
      )}
    </Box>
  );
}
