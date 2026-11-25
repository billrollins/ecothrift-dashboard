/**
 * Finding the product for a manifest row: two areas that never compete with each other or with the attached products
 * (Dash Updates #98, then #223; Bill 2026-11-24: "three NOT competing product areas: attached, likely (closable),
 * search (FAST FAST FAST)").
 *
 * - **Search** (`ProcessingProductSearch`): typed words or a code, answered after a short pause, the older request
 *   cancelled. The results float over the page (nothing below moves) with a photo, the title and the brand at a
 *   glance; arrow keys move, Enter uses, Esc closes.
 * - **Likely** (`ProcessingLikelyProducts`): one folded line with the best guess, whether it IS this product or only
 *   LIKE it and how sure. "Open all likely" shows the rest over the page; the X says "not this product" and is
 *   remembered on the row. Likely never changes Search or the attached products.
 *
 * Server: `services/product_find.py`.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  ClickAwayListener,
  IconButton,
  InputAdornment,
  Paper,
  Popper,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import { findProducts, getLikelyProducts, setNotProduct, type FoundProductDTO, type FoundProductsDTO } from '../../../api/productFind.api';
import { useDebouncedValue } from '../../../hooks/useDebouncedValue';
import { IconClose as Close, IconSearch as SearchIcon } from '../../../icons/ecoIcons';
import { processingTokens } from './processingTokens';

export const likelyProductsKey = (rowId: number) => ['likely-products', rowId] as const;

/** How long typing waits before it searches (ms). The server answers in well under 50 ms. */
export const SEARCH_PAUSE_MS = 120;
const LIST_MAX_HEIGHT = 380;
const PHOTO = 40;

function dollars(v: string | null): string {
  if (v == null) return '';
  const n = Number(v);
  return Number.isFinite(n) ? `$${n.toFixed(2)}` : '';
}

/** "12 sold, about $8.50 · 3 on the shelf" or "Never checked in". */
export function storeLine(p: FoundProductDTO): string {
  if (!p.items) return 'Never checked in';
  const parts = [];
  if (p.sold) parts.push(`${p.sold} sold${p.avg_sold ? `, about ${dollars(p.avg_sold)}` : ''}`);
  if (p.on_shelf) parts.push(`${p.on_shelf} on the shelf`);
  if (!parts.length) parts.push(`${p.items} checked in${p.last_price ? `, tag up to ${dollars(p.last_price)}` : ''}`);
  return parts.join(' · ');
}

/** "Hasbro · F1234 · UPC 0123 · #P-55 · Toys" with the empty parts left out. */
export function codesLine(p: FoundProductDTO): string {
  return [p.brand, p.model, p.upc ? `UPC ${p.upc}` : '', p.product_number ? `#${p.product_number}` : '', p.category]
    .filter((s) => s && s.trim()).join(' · ');
}

/** "Is this · 97%" or "Like this · 71%" (likely products only). */
export function matchLabel(p: Pick<FoundProductDTO, 'kind' | 'confidence'>): string {
  if (!p.kind) return '';
  const pct = p.confidence != null ? ` · ${p.confidence}%` : '';
  return `${p.kind === 'is' ? 'Is this' : 'Like this'}${pct}`;
}

function Photo({ src, title }: { src?: string | null; title: string }) {
  return (
    <Box
      sx={{
        width: PHOTO, height: PHOTO, flexShrink: 0, borderRadius: 0.75, overflow: 'hidden',
        border: 1, borderColor: processingTokens.border, bgcolor: processingTokens.surfaceTint,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      {src ?
        <Box component="img" src={src} alt={title} loading="lazy" sx={{ width: '100%', height: '100%', objectFit: 'contain' }} />
      : <Typography sx={{ fontSize: 9, fontWeight: 800, color: processingTokens.textMute }}>NO PHOTO</Typography>}
    </Box>
  );
}

function MatchChip({ p }: { p: FoundProductDTO }) {
  const label = matchLabel(p);
  if (!label) return null;
  return (
    <Chip
      size="small"
      label={label}
      color={p.kind === 'is' ? 'success' : 'default'}
      variant={p.kind === 'is' ? 'filled' : 'outlined'}
      sx={{ height: 20, fontSize: 10.5, fontWeight: 800, flexShrink: 0 }}
    />
  );
}

function FoundRow({ p, onUse, busy, attached, active = false, onHover, onNotThis }: {
  p: FoundProductDTO;
  onUse: (id: number) => void;
  busy: boolean;
  attached: boolean;
  active?: boolean;
  onHover?: () => void;
  onNotThis?: (p: FoundProductDTO) => void;
}) {
  const onRow = attached || Boolean(p.on_this_row);
  return (
    <Box
      role="option"
      aria-selected={active}
      onMouseEnter={onHover}
      sx={{
        display: 'flex', alignItems: 'center', gap: 0.85, px: 0.85, py: 0.55, minWidth: 0,
        bgcolor: active ? processingTokens.primarySoftStrong : 'transparent',
        borderBottom: 1, borderColor: processingTokens.border, '&:last-child': { borderBottom: 0 },
      }}
    >
      <Photo src={p.photo} title={p.title} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography noWrap title={p.title} sx={{ fontSize: 13, fontWeight: 800, lineHeight: 1.3 }}>{p.title}</Typography>
        <Typography noWrap title={codesLine(p)} sx={{ fontSize: 11.5, color: 'text.secondary', lineHeight: 1.3 }}>
          {codesLine(p) || 'No brand or codes'}
        </Typography>
        <Typography noWrap sx={{ fontSize: 11.5, color: 'text.secondary', lineHeight: 1.3 }}>
          {storeLine(p)}
        </Typography>
      </Box>
      {p.kind ? <MatchChip p={p} /> : (
        <Chip size="small" variant="outlined" label={p.why} sx={{ height: 20, fontSize: 10.5, flexShrink: 0, display: { xs: 'none', sm: 'inline-flex' } }} />
      )}
      {onRow ? (
        <Chip size="small" label="On this row" sx={{ height: 22, fontSize: 11, flexShrink: 0 }} />
      ) : (
        <Button
          size="small"
          variant="contained"
          disabled={busy}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onUse(p.id)}
          sx={{ flexShrink: 0, minWidth: 0, px: 1.25, py: 0.15, fontSize: 12 }}
        >
          Use
        </Button>
      )}
      {onNotThis ?
        <Tooltip title="Not this product" enterDelay={300} disableInteractive>
          <IconButton size="small" aria-label={`Not this product: ${p.title}`} onClick={() => onNotThis(p)} sx={{ p: 0.35, flexShrink: 0 }}>
            <Close sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>
      : null}
    </Box>
  );
}

/** The search box and its floating results. */
export function ProcessingProductSearch({ processingRowId, attachedProductIds, onUse, busy = false }: {
  processingRowId: number;
  attachedProductIds: Set<number>;
  onUse: (productId: number) => void;
  busy?: boolean;
}) {
  const [typed, setTyped] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const anchorRef = useRef<HTMLDivElement>(null);
  const debounced = useDebouncedValue(typed.trim(), SEARCH_PAUSE_MS);
  // Enter searches at once; typing searches after a short pause.
  const q = submitted && submitted === typed.trim() ? submitted : debounced;
  const searching = q.length >= 2;

  const found = useQuery({
    queryKey: ['product-find', q, processingRowId],
    queryFn: async ({ signal }) => (await findProducts(q, processingRowId, signal)).data,
    enabled: searching,
    staleTime: 60_000,
    placeholderData: (prev) => prev,
  });
  const list = useMemo(() => (searching ? found.data?.results ?? [] : []), [searching, found.data]);

  useEffect(() => setActive(0), [q]);

  function use(id: number) {
    onUse(id);
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, Math.max(0, list.length - 1)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const pick = open && list.length && q === typed.trim() ? list[active] : null;
      if (pick && !attachedProductIds.has(pick.id) && !pick.on_this_row) {
        use(pick.id);
        return;
      }
      setSubmitted(typed.trim());
      setOpen(true);
    } else if (e.key === 'Escape') {
      if (open) {
        e.preventDefault();
        e.stopPropagation();
        setOpen(false);
      }
    }
  }

  const showList = open && searching;
  const loading = found.isFetching && !found.data;

  return (
    <ClickAwayListener onClickAway={() => setOpen(false)}>
      <Box ref={anchorRef} sx={{ flexShrink: 0, minWidth: 0 }}>
        <TextField
          size="small"
          fullWidth
          value={typed}
          onChange={(e) => { setTyped(e.target.value); setOpen(true); }}
          onFocus={() => { if (typed.trim().length >= 2) setOpen(true); }}
          onKeyDown={onKeyDown}
          placeholder="Search products: code, title, brand, model or tag"
          slotProps={{
            htmlInput: {
              'aria-label': 'Search products',
              'data-scan-ok': true,
              role: 'combobox',
              'aria-expanded': showList,
              'aria-autocomplete': 'list',
            },
            input: {
              startAdornment: <InputAdornment position="start"><SearchIcon sx={{ fontSize: 17 }} /></InputAdornment>,
              endAdornment: found.isFetching && searching ? <InputAdornment position="end"><CircularProgress size={14} /></InputAdornment> : null,
            },
          }}
          sx={{ '& .MuiInputBase-root': { height: 32, fontSize: 13, bgcolor: 'background.paper' } }}
        />
        <Popper
          open={showList}
          anchorEl={anchorRef.current}
          placement="bottom-start"
          sx={{ zIndex: (t) => t.zIndex.modal + 1, width: anchorRef.current?.offsetWidth ?? 480, minWidth: 320 }}
        >
          <Paper elevation={6} role="listbox" aria-label={`Products for ${q}`} sx={{ mt: 0.5, maxHeight: LIST_MAX_HEIGHT, overflowY: 'auto', border: 1, borderColor: processingTokens.borderStrong }}>
            <Typography sx={{ px: 1, py: 0.5, fontSize: '0.625rem', fontWeight: 900, letterSpacing: 0.7, textTransform: 'uppercase', color: processingTokens.textMute, borderBottom: 1, borderColor: processingTokens.border }}>
              Products for "{q}"{found.data ? ` · ${list.length}` : ''}
            </Typography>
            {loading ? (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 1.25 }}>
                <CircularProgress size={14} />
                <Typography sx={{ fontSize: 12.5, color: 'text.secondary' }}>Searching</Typography>
              </Box>
            ) : list.length ? (
              list.map((p, i) => (
                <FoundRow
                  key={p.id}
                  p={p}
                  onUse={use}
                  busy={busy}
                  attached={attachedProductIds.has(p.id)}
                  active={i === active}
                  onHover={() => setActive(i)}
                />
              ))
            ) : (
              <Typography sx={{ p: 1.25, fontSize: 12.5, color: 'text.secondary' }}>
                Nothing found for "{q}". Try fewer words, a code, or New product.
              </Typography>
            )}
          </Paper>
        </Popper>
      </Box>
    </ClickAwayListener>
  );
}

/** One folded line: the best guess, IS or LIKE, how sure; "Open all likely" shows the rest over the page. */
export function ProcessingLikelyProducts({ processingRowId, attachedProductIds, onUse, busy = false }: {
  processingRowId: number;
  attachedProductIds: Set<number>;
  onUse: (productId: number) => void;
  busy?: boolean;
}) {
  const qc = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const [allOpen, setAllOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);
  const key = likelyProductsKey(processingRowId);
  const likely = useQuery({
    queryKey: key,
    queryFn: async ({ signal }) => (await getLikelyProducts(processingRowId, signal)).data,
    staleTime: 5 * 60_000,
  });
  const list = (likely.data?.results ?? []).filter((p) => !attachedProductIds.has(p.id));
  const top = list[0];

  const notThis = useMutation({
    mutationFn: ({ id, undo }: { id: number; undo: boolean }) => setNotProduct(processingRowId, id, undo),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: key }); },
    onError: () => enqueueSnackbar('Could not save that. Try again.', { variant: 'error' }),
  });

  function sayNotThis(p: FoundProductDTO) {
    // Off the list at once; the server remembers it for this row.
    qc.setQueryData<FoundProductsDTO>(key, (prev) => (prev ? { ...prev, results: prev.results.filter((r) => r.id !== p.id) } : prev));
    notThis.mutate({ id: p.id, undo: false });
    enqueueSnackbar(`Not this product: ${p.title}`, {
      variant: 'info',
      action: () => (
        <Button color="inherit" size="small" onClick={() => notThis.mutate({ id: p.id, undo: true })}>Undo</Button>
      ),
    });
  }

  function use(id: number) {
    onUse(id);
    setAllOpen(false);
  }

  return (
    <ClickAwayListener onClickAway={() => setAllOpen(false)}>
      <Box
        ref={anchorRef}
        sx={{
          flexShrink: 0, display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0, height: 30, px: 0.75,
          border: 1, borderColor: processingTokens.border, borderRadius: 1, bgcolor: processingTokens.surfaceTint,
        }}
      >
        <Typography sx={{ fontSize: '0.625rem', fontWeight: 900, letterSpacing: 0.7, textTransform: 'uppercase', color: processingTokens.textMute, flexShrink: 0 }}>
          Likely
        </Typography>
        {likely.isLoading ? (
          <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>Finding likely products</Typography>
        ) : top ? (
          <>
            <MatchChip p={top} />
            <Typography noWrap title={top.title} sx={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 700 }}>{top.title}</Typography>
            <Button size="small" variant="outlined" disabled={busy} onClick={() => use(top.id)} sx={{ flexShrink: 0, minWidth: 0, px: 1, py: 0, fontSize: 11.5, height: 22 }}>
              Use
            </Button>
            <Tooltip title="Not this product" enterDelay={300} disableInteractive>
              <IconButton size="small" aria-label={`Not this product: ${top.title}`} onClick={() => sayNotThis(top)} sx={{ p: 0.25, flexShrink: 0 }}>
                <Close sx={{ fontSize: 15 }} />
              </IconButton>
            </Tooltip>
          </>
        ) : (
          <Typography sx={{ flex: 1, fontSize: 12, color: 'text.secondary' }}>
            {likely.isError ? 'Likely products could not be loaded.' : 'No likely products.'}
          </Typography>
        )}
        <Button
          size="small"
          disabled={!list.length}
          onClick={() => setAllOpen((v) => !v)}
          aria-expanded={allOpen}
          aria-label={`Open all likely${list.length ? ` (${list.length})` : ''}`}
          sx={{ ml: 'auto', flexShrink: 0, minWidth: 0, px: 0.75, py: 0, fontSize: 11.5, height: 22, whiteSpace: 'nowrap' }}
        >
          <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>Open all likely</Box>
          <Box component="span" sx={{ display: { xs: 'inline', sm: 'none' } }}>All</Box>
          {list.length ? ` (${list.length})` : ''}
        </Button>
        <Popper
          open={allOpen && list.length > 0}
          anchorEl={anchorRef.current}
          placement="bottom-start"
          sx={{ zIndex: (t) => t.zIndex.modal + 1, width: anchorRef.current?.offsetWidth ?? 480, minWidth: 320 }}
        >
          <Paper elevation={6} role="listbox" aria-label="Likely products" sx={{ mt: 0.5, maxHeight: LIST_MAX_HEIGHT, overflowY: 'auto', border: 1, borderColor: processingTokens.borderStrong }}>
            {list.map((p) => (
              <FoundRow key={p.id} p={p} onUse={use} busy={busy} attached={false} onNotThis={sayNotThis} />
            ))}
          </Paper>
        </Popper>
      </Box>
    </ClickAwayListener>
  );
}
