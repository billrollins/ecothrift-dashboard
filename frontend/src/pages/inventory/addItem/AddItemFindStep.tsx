import { useEffect, useRef, useState } from 'react';
import ImageOutlined from '@mui/icons-material/ImageOutlined';
import {
  Avatar, Box, Button, Chip, InputAdornment, LinearProgress, Link, Stack, TextField, Typography,
} from '@mui/material';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { findAddItemProducts, type AddItemProduct } from '../../../api/addItem.api';
import { IconAiAssist, IconCopy, IconSearch } from '../../../icons/ecoIcons';
import { EXACT_MATCHES, formatMoney, MATCH_LABEL, productName } from './addItemModel';

const DEBOUNCE_MS = 200;
const MIN_CHARS = 3;

export function ProductPhoto({ url, size = 56 }: { url: string | null | undefined; size?: number }) {
  return (
    <Avatar
      variant="rounded"
      src={url || undefined}
      alt=""
      sx={{ width: size, height: size, bgcolor: 'action.hover', color: 'text.disabled', flexShrink: 0 }}
    >
      <ImageOutlined fontSize={size > 48 ? 'medium' : 'small'} />
    </Avatar>
  );
}

function ResultRow({ row, onUse, onCopy }: { row: AddItemProduct; onUse: () => void; onCopy: () => void }) {
  const details = [row.short_name ? row.title : '', row.brand, row.model].filter(Boolean).join(' · ');
  const place = [row.category, row.subcategory].filter(Boolean).join(' › ');
  const matchLabel = MATCH_LABEL[row.match];
  return (
    <Box
      role="button"
      tabIndex={0}
      onClick={onUse}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onUse();
      }}
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '56px minmax(0, 1fr) auto', md: '56px minmax(0, 1fr) 92px 64px auto' },
        alignItems: 'center',
        columnGap: 1.5,
        rowGap: 0.5,
        px: { xs: 1, sm: 1.5 },
        py: 1,
        borderBottom: 1,
        borderColor: 'divider',
        cursor: 'pointer',
        '&:hover, &:focus-visible': { bgcolor: 'action.hover', outline: 'none' },
      }}
    >
      <ProductPhoto url={row.photo_url} />
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="body2" sx={{ fontWeight: 700 }} noWrap title={row.title}>
          {productName(row)}
          {matchLabel && <Chip size="small" color="primary" label={row.matched_sku || matchLabel} sx={{ ml: 1, height: 18 }} />}
        </Typography>
        {details && <Typography variant="caption" color="text.secondary" noWrap component="div">{details}</Typography>}
        {place && <Typography variant="caption" color="text.disabled" noWrap component="div">{place}</Typography>}
        {/* Phone: the numbers sit under the name. */}
        <Typography variant="caption" sx={{ display: { xs: 'block', md: 'none' }, fontWeight: 600 }}>
          {[row.typical_price ? `${formatMoney(row.typical_price)} ${row.typical_price_from === 'sold' ? 'typical' : 'on shelf'}` : '',
            row.sold ? `${row.sold} sold` : 'not sold yet'].filter(Boolean).join(' · ')}
        </Typography>
      </Box>
      <Box sx={{ display: { xs: 'none', md: 'block' }, textAlign: 'right' }}>
        <Typography variant="body2" sx={{ fontWeight: 700 }}>{formatMoney(row.typical_price)}</Typography>
        <Typography variant="caption" color="text.secondary">
          {row.typical_price ? (row.typical_price_from === 'sold' ? 'typical' : 'on shelf') : 'no price yet'}
        </Typography>
      </Box>
      <Box sx={{ display: { xs: 'none', md: 'block' }, textAlign: 'right' }}>
        <Typography variant="body2" sx={{ fontWeight: 700 }}>{row.sold}</Typography>
        <Typography variant="caption" color="text.secondary">sold</Typography>
      </Box>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={0.75} alignItems="stretch">
        <Button size="small" variant="contained" onClick={(e) => { e.stopPropagation(); onUse(); }}>Use</Button>
        <Button
          size="small"
          variant="text"
          startIcon={<IconCopy fontSize="small" />}
          onClick={(e) => { e.stopPropagation(); onCopy(); }}
          aria-label={`Copy ${productName(row)} into a new product`}
        >
          Copy
        </Button>
      </Stack>
    </Box>
  );
}

/** Step 1: one box, results as you type; exact identifiers first. */
export function AddItemFindStep({
  initialQuery,
  onUse,
  onCopy,
  onAiFill,
  onTypeIt,
}: {
  initialQuery: string;
  onUse: (row: AddItemProduct, query: string) => void;
  onCopy: (row: AddItemProduct, query: string) => void;
  onAiFill: (query: string) => void;
  onTypeIt: (query: string) => void;
}) {
  const [text, setText] = useState(initialQuery);
  const [q, setQ] = useState(initialQuery.trim());
  const pickOnArrival = useRef(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setQ(text.trim()), DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [text]);

  const enabled = q.length >= MIN_CHARS;
  const { data, isFetching, isError } = useQuery({
    queryKey: ['add-item-find', q],
    queryFn: ({ signal }) => findAddItemProducts(q, signal),
    enabled,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });
  const results = enabled ? data?.results ?? [] : [];
  const fresh = Boolean(data && data.q === text.trim());

  // A scanner types the code and presses Enter: pick the one exact match as soon as it is in.
  useEffect(() => {
    if (!pickOnArrival.current || !fresh || !data) return;
    pickOnArrival.current = false;
    const exact = data.results.filter((r) => EXACT_MATCHES.includes(r.match));
    if (exact.length === 1) onUse(exact[0], text.trim());
  }, [fresh, data, onUse, text]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}>
      <Box sx={{ px: { xs: 2, sm: 3 }, pt: 2, pb: 1 }}>
        <TextField
          autoFocus
          fullWidth
          placeholder="Name, brand or model, or scan a tag or barcode"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            pickOnArrival.current = true;
            setQ(text.trim());
          }}
          InputProps={{ startAdornment: <InputAdornment position="start"><IconSearch fontSize="small" /></InputAdornment> }}
          inputProps={{ 'aria-label': 'Find the product', autoComplete: 'off', enterKeyHint: 'search' }}
        />
        <Box sx={{ height: 4, mt: 0.5 }}>{isFetching && <LinearProgress />}</Box>
        <Typography variant="caption" color={isError ? 'error' : 'text.secondary'} component="div" sx={{ minHeight: 20 }}>
          {isError
            ? 'The search failed. Try again.'
            : !enabled
              ? 'Type at least 3 letters, or scan.'
              : data?.fuzzy
                ? 'Nothing matched exactly. These are the closest spellings.'
                : data
                  ? `${data.results.length}${data.results.length === 20 ? '+' : ''} product${data.results.length === 1 ? '' : 's'} · ${data.took_ms} ms`
                  : ''}
        </Typography>
      </Box>
      <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', borderTop: 1, borderColor: 'divider' }}>
        {results.map((row) => (
          <ResultRow
            key={row.product_id}
            row={row}
            onUse={() => onUse(row, text.trim())}
            onCopy={() => onCopy(row, text.trim())}
          />
        ))}
        {enabled && data && !isFetching && !results.length && (
          <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>Nothing found.</Typography>
        )}
        <Box sx={{ px: { xs: 2, sm: 3 }, py: 2.5, textAlign: 'center' }}>
          <Typography variant="body2" sx={{ fontWeight: 700, mb: 1 }}>Not here? Make the product.</Typography>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} justifyContent="center" alignItems="center">
            <Button variant="outlined" startIcon={<IconAiAssist />} onClick={() => onAiFill(text.trim())}>
              AI fill from a title or photo
            </Button>
            <Typography variant="caption" color="text.secondary">
              or tap Copy on a near match, or{' '}
              <Link component="button" type="button" onClick={() => onTypeIt(text.trim())}>type it in</Link>
            </Typography>
          </Stack>
        </Box>
      </Box>
    </Box>
  );
}
