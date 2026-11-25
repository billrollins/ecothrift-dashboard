/**
 * Finding the product for a manifest row: two areas that never compete with each other or with the attached products
 * (Dash Updates #98, #223, then #229; Bill 2026-11-24: "three NOT competing product areas: attached, likely, search
 * (FAST FAST FAST)"; 2026-11-25: "Product likely is an extra click. They don't like that").
 *
 * - **Search** (`ProcessingProductSearch`): typed words or a code, answered after a short pause, the older request
 *   cancelled. The results float over the page (nothing below moves) with a photo, the title and the brand at a
 *   glance; arrow keys move, Enter uses, Esc closes.
 * - **Likely** (`ProcessingLikelyProducts`): a list that is always open, beside the attached products, at a height
 *   that never changes. Each line is green ("Yes"), yellow ("Maybe") or grey ("Probably not") with how sure; the
 *   counts of each sit on top. The X says "not this product" and is remembered on the row. Likely never changes
 *   Search or the attached products.
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
import { PaneNote, ProductPane } from './ProcessingProductPane';
import { processingTokens } from './processingTokens';
import { useProcessingUndo } from './processingUndo';

export const likelyProductsKey = (rowId: number) => ['likely-products', rowId] as const;

/** How long typing waits before it searches (ms). The server answers in well under 50 ms. */
export const SEARCH_PAUSE_MS = 120;
const LIST_MAX_HEIGHT = 380;
const PHOTO = 40;
/** A likely line is two lines of text beside a photo of this size: eight of them fit the list on a 1080p screen. */
const LIKELY_PHOTO = 30;

/** The three colours of a likely product (Bill 2026-11-25: "green YES this is it; yellow maybe; or grey probably not"). */
export type LikelyBand = 'yes' | 'maybe' | 'no';
export const LIKELY_BANDS: LikelyBand[] = ['yes', 'maybe', 'no'];
export const BAND_WORDS: Record<LikelyBand, string> = { yes: 'Yes', maybe: 'Maybe', no: 'Probably not' };

const BAND_LOOK: Record<LikelyBand, { bar: string; bg: string; chipBg: string; chipText: string }> = {
  yes: { bar: processingTokens.accentGreen, bg: processingTokens.primarySoft, chipBg: processingTokens.accentGreen, chipText: '#ffffff' },
  maybe: { bar: '#eab308', bg: '#fefce8', chipBg: '#fde047', chipText: '#5f4600' },
  no: { bar: '#94a3b8', bg: 'transparent', chipBg: processingTokens.border, chipText: processingTokens.textSoft },
};

/** The server says the band; an answer without one (an older server) is read from its kind and confidence. */
export function bandOf(p: Pick<FoundProductDTO, 'band' | 'kind' | 'confidence'>): LikelyBand {
  if (p.band) return p.band;
  const sure = p.confidence ?? 0;
  if (p.kind === 'is' || sure >= 85) return 'yes';
  return sure >= 60 ? 'maybe' : 'no';
}

/** How many likely products of each colour: the counts on top of the list. */
export function bandCounts(list: Pick<FoundProductDTO, 'band' | 'kind' | 'confidence'>[]): Record<LikelyBand, number> {
  const out: Record<LikelyBand, number> = { yes: 0, maybe: 0, no: 0 };
  for (const p of list) out[bandOf(p)] += 1;
  return out;
}

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

/** "Yes · 97%", "Maybe · 71%" or "Probably not · 40%" (likely products only). */
export function matchLabel(p: Pick<FoundProductDTO, 'band' | 'kind' | 'confidence'>): string {
  if (!p.kind && !p.band) return '';
  const pct = p.confidence != null ? ` · ${p.confidence}%` : '';
  return `${BAND_WORDS[bandOf(p)]}${pct}`;
}

function Photo({ src, title, size = PHOTO }: { src?: string | null; title: string; size?: number }) {
  // A photo that will not load (the file is gone) reads "NO PHOTO" like a product without one, never a broken image.
  const [failed, setFailed] = useState<string | null>(null);
  const shown = src && failed !== src ? src : null;
  return (
    <Box
      sx={{
        width: size, height: size, flexShrink: 0, borderRadius: 0.75, overflow: 'hidden',
        border: 1, borderColor: processingTokens.border, bgcolor: processingTokens.surfaceTint,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      {shown ?
        <Box
          component="img"
          src={shown}
          alt={title}
          loading="lazy"
          onError={() => setFailed(shown)}
          sx={{ width: '100%', height: '100%', objectFit: 'contain' }}
        />
      : <Typography sx={{ fontSize: size < PHOTO ? 7.5 : 9, fontWeight: 800, color: processingTokens.textMute, textAlign: 'center', lineHeight: 1.1 }}>NO PHOTO</Typography>}
    </Box>
  );
}

function BandChip({ p }: { p: FoundProductDTO }) {
  const band = bandOf(p);
  const look = BAND_LOOK[band];
  return (
    <Box
      component="span"
      data-band={band}
      sx={{
        flexShrink: 0, height: 20, px: 0.85, display: 'inline-flex', alignItems: 'center', borderRadius: 10,
        fontSize: 10.5, fontWeight: 800, whiteSpace: 'nowrap', bgcolor: look.chipBg, color: look.chipText,
      }}
    >
      {matchLabel(p)}
    </Box>
  );
}

/** One likely product: its colour down the left edge, photo, what it is, how sure, Use, and "not this product". */
function LikelyRow({ p, onUse, busy, onNotThis }: {
  p: FoundProductDTO;
  onUse: (id: number) => void;
  busy: boolean;
  onNotThis: (p: FoundProductDTO) => void;
}) {
  const band = bandOf(p);
  const look = BAND_LOOK[band];
  const second = [codesLine(p), storeLine(p)].filter(Boolean).join(' · ');
  return (
    <Box
      role="listitem"
      data-band={band}
      data-testid="likely-row"
      sx={{
        display: 'flex', alignItems: 'center', gap: 0.75, pl: 0.6, pr: 0.4, py: 0.25, minWidth: 0,
        bgcolor: look.bg, borderLeft: '4px solid', borderLeftColor: look.bar,
        borderBottom: '1px solid', borderBottomColor: processingTokens.border,
      }}
    >
      <Photo src={p.photo} title={p.title} size={LIKELY_PHOTO} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography
          noWrap
          title={p.title}
          sx={{ fontSize: 12.5, fontWeight: 800, lineHeight: 1.3, color: band === 'no' ? processingTokens.textSoft : 'text.primary' }}
        >
          {p.title}
        </Typography>
        <Typography noWrap title={second} sx={{ fontSize: 11, color: 'text.secondary', lineHeight: 1.3 }}>{second}</Typography>
      </Box>
      <BandChip p={p} />
      <Button
        size="small"
        variant={band === 'yes' ? 'contained' : 'outlined'}
        disabled={busy}
        onClick={() => onUse(p.id)}
        aria-label={`Use ${p.title}`}
        sx={{ flexShrink: 0, minWidth: 0, px: 1.1, py: 0, height: 24, fontSize: 11.5 }}
      >
        Use
      </Button>
      <Tooltip title="Not this product" enterDelay={300} disableInteractive>
        <IconButton size="small" aria-label={`Not this product: ${p.title}`} onClick={() => onNotThis(p)} sx={{ p: 0.3, flexShrink: 0 }}>
          <Close sx={{ fontSize: 15 }} />
        </IconButton>
      </Tooltip>
    </Box>
  );
}

/** One count on top of the likely list: a dot of the colour, how many, the word. Always there, so nothing moves. */
function BandCount({ band, n }: { band: LikelyBand; n: number }) {
  return (
    <Box data-testid={`likely-count-${band}`} sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.4, flexShrink: 0, opacity: n ? 1 : 0.5 }}>
      <Box sx={{ width: 9, height: 9, borderRadius: '50%', bgcolor: BAND_LOOK[band].bar }} />
      <Typography sx={{ fontSize: 11, fontWeight: 800, color: processingTokens.textSoft, whiteSpace: 'nowrap' }}>
        {n} {BAND_WORDS[band].toLowerCase()}
      </Typography>
    </Box>
  );
}

function FoundRow({ p, onUse, busy, attached, active = false, onHover }: {
  p: FoundProductDTO;
  onUse: (id: number) => void;
  busy: boolean;
  attached: boolean;
  active?: boolean;
  onHover?: () => void;
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
      <Chip size="small" variant="outlined" label={p.why} sx={{ height: 20, fontSize: 10.5, flexShrink: 0, display: { xs: 'none', sm: 'inline-flex' } }} />
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

/**
 * The likely products for a row, always open: every line is on screen (the list scrolls inside its pane), coloured
 * green / yellow / grey, with the count of each on top.
 */
export function ProcessingLikelyProducts({ processingRowId, attachedProductIds, onUse, busy = false }: {
  processingRowId: number;
  attachedProductIds: Set<number>;
  onUse: (productId: number) => void;
  busy?: boolean;
}) {
  const qc = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const undoList = useProcessingUndo();
  const key = likelyProductsKey(processingRowId);
  const likely = useQuery({
    queryKey: key,
    queryFn: async ({ signal }) => (await getLikelyProducts(processingRowId, signal)).data,
    staleTime: 5 * 60_000,
  });
  const list = useMemo(
    () => (likely.data?.results ?? []).filter((p) => !attachedProductIds.has(p.id)),
    [likely.data, attachedProductIds],
  );
  const counts = useMemo(() => bandCounts(list), [list]);

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
    // Ctrl+Z takes it back too (#230), also after the message is gone.
    const mark = (off: boolean) =>
      setNotProduct(processingRowId, p.id, off).then(
        () => {
          void qc.invalidateQueries({ queryKey: key });
          return true;
        },
        () => false,
      );
    undoList?.record({ label: `Not this product: ${p.title}`, undo: () => mark(true), redo: () => mark(false) });
  }

  return (
    <ProductPane
      title="Likely products"
      testId="likely-pane"
      accent={processingTokens.accentBlue}
      headerBg={processingTokens.cardHeaderPastBg}
      titleColor={processingTokens.cardHeaderPastText}
      stats={LIKELY_BANDS.map((band) => <BandCount key={band} band={band} n={counts[band]} />)}
    >
      {likely.isLoading ? (
        <PaneNote>Finding likely products</PaneNote>
      ) : likely.isError ? (
        <PaneNote>Likely products could not be loaded.</PaneNote>
      ) : !list.length ? (
        <PaneNote>No likely products.</PaneNote>
      ) : (
        <Box role="list" aria-label="Likely products">
          {list.map((p) => (
            <LikelyRow key={p.id} p={p} onUse={onUse} busy={busy} onNotThis={sayNotThis} />
          ))}
        </Box>
      )}
    </ProductPane>
  );
}
