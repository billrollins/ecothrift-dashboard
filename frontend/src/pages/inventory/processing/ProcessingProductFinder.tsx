/**
 * Find the product for a manifest row (Dash Updates #98, D29). The likely products show the moment the row opens
 * (fetched as it opens and kept); typing searches codes, words, tags and meaning at once, ranked, and a missing or
 * extra word does not empty the list. Each result says enough to choose it, and "Use" attaches it to the row.
 * Server: `services/product_find.py`.
 */
import { useState } from 'react';
import { Box, Button, Chip, CircularProgress, InputAdornment, Link, TextField, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { findProducts, getLikelyProducts, type FoundProductDTO } from '../../../api/productFind.api';
import { useDebouncedValue } from '../../../hooks/useDebouncedValue';
import { IconSearch as SearchIcon } from '../../../icons/ecoIcons';
import { processingTokens } from './processingTokens';

export const likelyProductsKey = (rowId: number) => ['likely-products', rowId] as const;

const LIST_HEIGHT = 196;

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

function FoundRow({ p, onUse, busy, attached }: {
  p: FoundProductDTO; onUse: (id: number) => void; busy: boolean; attached: boolean;
}) {
  const onRow = attached || Boolean(p.on_this_row);
  return (
    <Box
      sx={{
        display: 'flex', alignItems: 'center', gap: 0.75, px: 0.75, py: 0.5, minWidth: 0,
        borderBottom: 1, borderColor: processingTokens.border, '&:last-child': { borderBottom: 0 },
      }}
    >
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography noWrap title={p.title} sx={{ fontSize: 12.5, fontWeight: 700, lineHeight: 1.3 }}>{p.title}</Typography>
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
        <Button size="small" variant="contained" disabled={busy} onClick={() => onUse(p.id)} sx={{ flexShrink: 0, minWidth: 0, px: 1.25, py: 0.15, fontSize: 12 }}>
          Use
        </Button>
      )}
    </Box>
  );
}

export function ProcessingProductFinder({ processingRowId, attachedProductIds, onUse, busy = false }: {
  processingRowId: number;
  attachedProductIds: Set<number>;
  onUse: (productId: number) => void;
  busy?: boolean;
}) {
  const [typed, setTyped] = useState('');
  // A row that already has its product keeps the likely list folded, so the attached products stay in view.
  const [likelyOpen, setLikelyOpen] = useState(attachedProductIds.size === 0);
  const [submitted, setSubmitted] = useState('');
  const debounced = useDebouncedValue(typed.trim(), 150);
  // Enter or the button searches at once; typing searches after a short pause.
  const q = submitted && submitted === typed.trim() ? submitted : debounced;
  const searching = q.length >= 2;

  const likely = useQuery({
    queryKey: likelyProductsKey(processingRowId),
    queryFn: async () => (await getLikelyProducts(processingRowId)).data,
    staleTime: 5 * 60_000,
  });
  const found = useQuery({
    queryKey: ['product-find', q, processingRowId],
    queryFn: async () => (await findProducts(q, processingRowId)).data,
    enabled: searching,
    staleTime: 60_000,
    placeholderData: (prev) => prev,
  });

  const list = searching ? found.data?.results ?? [] : (likely.data?.results ?? []).filter((p) => !attachedProductIds.has(p.id));
  const loading = searching ? found.isFetching && !found.data : likely.isLoading;
  const heading = searching ? `Products for "${q}"` : 'Likely products';
  const empty = searching
    ? `Nothing found for "${q}". Try fewer words, a code, or New product.`
    : likely.isError ? 'Likely products could not be loaded. Search above.' : 'No likely products for this row. Search above.';

  return (
    <Box sx={{ flexShrink: 0, border: 1, borderColor: processingTokens.border, borderRadius: 1, bgcolor: processingTokens.surfaceRaised, minWidth: 0 }}>
      <Box
        component="form"
        onSubmit={(e) => { e.preventDefault(); setSubmitted(typed.trim()); }}
        sx={{ display: 'flex', gap: 0.75, alignItems: 'center', px: 0.75, pt: 0.75, pb: 0.5 }}
      >
        <TextField
          size="small"
          fullWidth
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder="Code, title, brand, model or tag"
          slotProps={{
            htmlInput: { 'aria-label': 'Search products', 'data-scan-ok': true },
            input: {
              startAdornment: <InputAdornment position="start"><SearchIcon sx={{ fontSize: 17 }} /></InputAdornment>,
              endAdornment: found.isFetching && searching ? <InputAdornment position="end"><CircularProgress size={14} /></InputAdornment> : null,
            },
          }}
          sx={{ '& .MuiInputBase-root': { height: 32, fontSize: 13 } }}
        />
        <Button type="submit" variant="outlined" size="small" sx={{ flexShrink: 0, height: 32, whiteSpace: 'nowrap' }}>
          Search products
        </Button>
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1, pb: 0.35 }}>
        <Typography sx={{ fontSize: '0.625rem', fontWeight: 900, letterSpacing: 0.7, textTransform: 'uppercase', color: processingTokens.textMute }}>
          {heading}{!searching && !likelyOpen && likely.data ? ` (${list.length})` : ''}
        </Typography>
        {!searching ? (
          <Link component="button" type="button" underline="hover" onClick={() => setLikelyOpen((v) => !v)} sx={{ fontSize: 12 }}>
            {likelyOpen ? 'Hide' : 'Show'}
          </Link>
        ) : null}
      </Box>
      {/* A fixed height while open: results coming and going move nothing below. */}
      {searching || likelyOpen ? (
      <Box sx={{ height: LIST_HEIGHT, overflowY: 'auto', borderTop: 1, borderColor: processingTokens.border }}>
        {loading ? (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 1.25 }}>
            <CircularProgress size={14} />
            <Typography sx={{ fontSize: 12.5, color: 'text.secondary' }}>{searching ? 'Searching' : 'Finding likely products'}</Typography>
          </Box>
        ) : list.length ? (
          list.map((p) => (
            <FoundRow key={p.id} p={p} onUse={onUse} busy={busy} attached={attachedProductIds.has(p.id)} />
          ))
        ) : (
          <Typography sx={{ p: 1.25, fontSize: 12.5, color: 'text.secondary' }}>{empty}</Typography>
        )}
      </Box>
      ) : null}
    </Box>
  );
}
