import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
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
import { priceFromNote } from './countProblems';
import { clockTime } from './countTimer';

type Tab = 'pr' | 'relocate' | 'fixed';

const money = (v: string | null | undefined) => (v == null || v === '' ? '' : `$${Number(v).toFixed(2)}`);

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

interface RowProps {
  issue: Issue;
  onChanged: (issue: Issue) => void;
}

/** One problem item and its fix: the fewest clicks that end with a good tag on the item. */
function FixRow({ issue, onChanged }: RowProps) {
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
  const btn = { textTransform: 'none' as const, fontWeight: 700, whiteSpace: 'nowrap' as const };

  let fixCell;
  if (issue.fixed_at) {
    fixCell = (
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
    fixCell = (
      <Button variant="contained" size="small" disabled={busy} onClick={() => void run('moved', {}, false)} sx={btn}>
        Moved{issue.target_section ? ` to ${issue.target_section}` : ''}
      </Button>
    );
  } else if (!item) {
    fixCell = (
      <Box sx={{ minWidth: 340 }}>
        <TextField
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Find the item: words, brand, or a SKU"
          size="small"
          fullWidth
          inputProps={{ 'aria-label': 'Find the item' }}
        />
        {found?.map((f) => (
          <Stack key={f.id} direction="row" alignItems="center" spacing={1} sx={{ py: 0.5, borderBottom: 1, borderColor: 'divider' }}>
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
        <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
          <TextField value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Or add it: what is it?" size="small" sx={{ flex: 1 }} inputProps={{ maxLength: 300, 'aria-label': 'New item title' }} />
          <TextField value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Price" size="small" sx={{ width: 90 }} inputProps={{ inputMode: 'decimal', 'aria-label': 'New item price' }} />
          <Button size="small" variant="outlined" disabled={busy || !title.trim() || !price} onClick={() => void run('quick_add', { title: title.trim(), price })} sx={btn}>
            Add, print
          </Button>
        </Stack>
      </Box>
    );
  } else {
    const asNew = issue.kind === 'already_scanned' || item.status === 'sold';
    const shelve = !asNew && item.status !== 'on_shelf';
    fixCell = (
      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
        {!asNew && !shelve && (
          <TextField value={title} onChange={(e) => setTitle(e.target.value)} size="small" sx={{ minWidth: 220, flex: 1 }} inputProps={{ maxLength: 300, 'aria-label': 'Title' }} />
        )}
        {!shelve && (
          <TextField value={price} onChange={(e) => setPrice(e.target.value)} size="small" sx={{ width: 90 }} inputProps={{ inputMode: 'decimal', 'aria-label': 'Price' }} />
        )}
        {asNew && (
          <Button variant="contained" size="small" disabled={busy} onClick={() => void run('print_as_new', { price: price || undefined })} sx={btn}>
            Print as new
          </Button>
        )}
        {shelve && (
          <Button variant="contained" size="small" disabled={busy} onClick={() => void run('put_on_shelf')} sx={btn}>
            Put on shelf, print
          </Button>
        )}
        {!asNew && !shelve && (
          <Button variant="contained" size="small" disabled={busy} onClick={() => void (changed ? run('edit', edits()) : run('reprint'))} sx={btn}>
            {changed ? 'Save, print tag' : 'Reprint tag'}
          </Button>
        )}
      </Stack>
    );
  }

  return (
    <TableRow sx={{ verticalAlign: 'top', opacity: issue.fixed_at ? 0.75 : 1 }}>
      <TableCell sx={{ whiteSpace: 'nowrap', fontWeight: 700 }}>{issue.cart}</TableCell>
      <TableCell>
        <Typography sx={{ fontWeight: 700, fontSize: 14 }}>{issue.kind_label}</Typography>
        {issue.detail && <Typography sx={{ fontSize: 13, color: 'warning.dark' }}>&quot;{issue.detail}&quot;</Typography>}
      </TableCell>
      <TableCell>
        <Typography sx={{ fontFamily: 'monospace', fontSize: 13 }}>{item?.sku || issue.code || 'No tag'}</Typography>
        <Typography sx={{ fontSize: 14 }}>{item?.title}</Typography>
        {item && item.status !== 'on_shelf' && <Typography sx={{ fontSize: 12, color: 'error.main' }}>System says {item.status}</Typography>}
      </TableCell>
      <TableCell align="right">{money(item?.price)}</TableCell>
      <TableCell align="right">{money(item?.retail)}</TableCell>
      <TableCell sx={{ fontSize: 13 }}>
        {issue.by}
        <br />
        {issue.section} · {clockTime(issue.created_at)}
      </TableCell>
      <TableCell>
        {fixCell}
        {message && (
          <Alert severity={message.kind} sx={{ mt: 0.5, py: 0 }}>
            {message.text}
          </Alert>
        )}
        {!issue.fixed_at && (
          <Button size="small" color="inherit" disabled={busy} onClick={() => void run('dismiss', {}, false)} sx={{ ...btn, fontWeight: 400, mt: 0.25, color: 'text.secondary' }}>
            Nothing to fix
          </Button>
        )}
      </TableCell>
    </TableRow>
  );
}

/** PR Fix-it: the problem items a count put in carts, each with the quickest fix. Desktop first. */
export default function PrFixitPage() {
  const [rows, setRows] = useState<Issue[] | null>(null);
  const [fixed, setFixed] = useState<Issue[] | null>(null);
  const [tab, setTab] = useState<Tab>('pr');
  const [filter, setFilter] = useState('');
  const [error, setError] = useState('');
  const [printer, setPrinter] = useState<boolean | null>(null);

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

  // A fixed row stays where it is (greyed, with Print again and Undo) until the list is refreshed.
  const onChanged = (issue: Issue) => {
    setRows((list) => (list ? list.map((r) => (r.id === issue.id ? { ...issue, label: r.label } : r)) : list));
    setFixed((list) => (list ? list.map((r) => (r.id === issue.id ? { ...issue, label: r.label } : r)) : list));
  };

  const shown = useMemo(() => {
    const source = tab === 'fixed' ? fixed ?? [] : (rows ?? []).filter((r) => (tab === 'pr' ? r.action === 'pr_cart' : r.action === 'relocate'));
    const words = filter.trim().toLowerCase();
    const list = words
      ? source.filter((r) => [r.code, r.cart, r.kind_label, r.item?.sku, r.item?.title, r.by, r.section, r.detail].some((v) => (v || '').toLowerCase().includes(words)))
      : source;
    return tab === 'fixed' ? list : [...list].sort((a, b) => a.cart.localeCompare(b.cart) || a.id - b.id);
  }, [rows, fixed, tab, filter]);

  const open = (kind: 'pr_cart' | 'relocate') => (rows ?? []).filter((r) => r.action === kind && !r.fixed_at).length;

  return (
    <Box sx={{ p: 2, width: '100%', minWidth: 0, maxWidth: 1500, mx: 'auto' }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1} sx={{ mb: 1.5 }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 800 }}>
            PR Fix-it
          </Typography>
          <Typography sx={{ color: 'text.secondary' }}>Items the inventory count sent back in a cart. Fix each one, tag it, and it goes back out.</Typography>
        </Box>
        <Stack direction="row" spacing={1} alignItems="center">
          {printer != null && <Chip size="small" color={printer ? 'success' : 'warning'} label={printer ? 'Tag printer ready' : 'Print server not found on this computer'} />}
          <Button onClick={reload} sx={{ textTransform: 'none' }}>
            Refresh
          </Button>
          <Button component={RouterLink} to="/inventory/count" sx={{ textTransform: 'none' }}>
            Count
          </Button>
        </Stack>
      </Stack>

      <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mb: 1.5 }}>
        <ToggleButtonGroup size="small" exclusive value={tab} onChange={(_, v: Tab | null) => v && setTab(v)}>
          <ToggleButton value="pr" sx={{ textTransform: 'none' }}>
            To fix ({open('pr_cart')})
          </ToggleButton>
          <ToggleButton value="relocate" sx={{ textTransform: 'none' }}>
            To relocate ({open('relocate')})
          </ToggleButton>
          <ToggleButton value="fixed" sx={{ textTransform: 'none' }}>
            Fixed
          </ToggleButton>
        </ToggleButtonGroup>
        <TextField
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Scan a tag or type to find a row (cart, item, person)"
          size="small"
          sx={{ flex: 1, minWidth: 260, maxWidth: 480 }}
          inputProps={{ 'aria-label': 'Find a row' }}
        />
      </Stack>

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
        <Typography sx={{ color: 'text.secondary', py: 3 }}>{filter ? 'No row matches.' : tab === 'fixed' ? 'Nothing fixed yet.' : 'Nothing waiting. Good.'}</Typography>
      )}
      {rows && shown.length > 0 && (
        <Box sx={{ overflowX: 'auto' }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Cart</TableCell>
                <TableCell>Problem</TableCell>
                <TableCell>Item</TableCell>
                <TableCell align="right">Price</TableCell>
                <TableCell align="right">Retail</TableCell>
                <TableCell>From</TableCell>
                <TableCell sx={{ minWidth: 380 }}>Fix</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {shown.map((issue) => (
                <FixRow key={issue.id} issue={issue} onChanged={onChanged} />
              ))}
            </TableBody>
          </Table>
        </Box>
      )}
    </Box>
  );
}
