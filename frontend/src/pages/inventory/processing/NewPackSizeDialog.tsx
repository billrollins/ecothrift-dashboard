/**
 * "New pack size" (Dash Update #224, Bill 2026-11-24; takes in the parked #207 "Sell as"). From the product being
 * checked in: its own count is filled in and can be corrected ("it was really 10, a typo"; then Yes / No to fix the
 * product's own details); say the pack you want; a new product linked to its base is made with price and retail
 * scaled from the base ("100 for $1, so 3 boxes of 200 is $6"), free to edit at check-in. Nothing else changes.
 *
 * "Make more": change the base product (search any product) and type the product to create; they are linked.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Link,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import { useMutation, useQuery } from '@tanstack/react-query';
import { getProductPack, makeNewPack, type NewPackResult } from '../../../api/productPacks.api';
import { findProducts } from '../../../api/productFind.api';
import { useDebouncedValue } from '../../../hooks/useDebouncedValue';
import { apiErrorDetail } from '../../../hooks/useProductSearch';
import { formatCurrency } from '../../../utils/format';
import { packLabel, retitle, scaleAmount, singular, totalPieces, wholeCount } from './packWords';
import { processingTokens } from './processingTokens';

interface BaseProduct {
  id: number;
  title: string;
}

function CountBox({ label, value, onChange, width = 108, ariaLabel }: {
  label: string; value: string; onChange: (v: string) => void; width?: number; ariaLabel: string;
}) {
  return (
    <TextField
      size="small"
      label={label}
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/[^0-9]/g, ''))}
      slotProps={{ htmlInput: { inputMode: 'numeric', 'aria-label': ariaLabel } }}
      sx={{ width }}
    />
  );
}

function NameBox({ value, onChange, ariaLabel }: { value: string; onChange: (v: string) => void; ariaLabel: string }) {
  return (
    <TextField
      size="small"
      label="Unit (box, roll…)"
      value={value}
      onChange={(e) => onChange(e.target.value.slice(0, 40))}
      slotProps={{ htmlInput: { 'aria-label': ariaLabel } }}
      sx={{ width: 140 }}
    />
  );
}

export function NewPackSizeDialog({ open, product, basePrice, baseRetail, onClose, onMade }: {
  open: boolean;
  product: BaseProduct | null;
  /** The base's price and retail to scale from (the check-in window's values). */
  basePrice?: string;
  baseRetail?: string;
  onClose: () => void;
  onMade: (result: NewPackResult) => void;
}) {
  const [base, setBase] = useState<BaseProduct | null>(product);
  const [changingBase, setChangingBase] = useState(false);
  const [baseQuery, setBaseQuery] = useState('');
  const [baseCount, setBaseCount] = useState('');
  const [baseName, setBaseName] = useState('');
  const [baseUnits, setBaseUnits] = useState('1');
  const [fixBase, setFixBase] = useState<'yes' | 'no' | null>(null);
  const [newUnits, setNewUnits] = useState('1');
  const [newName, setNewName] = useState('');
  const [newCount, setNewCount] = useState('');
  const [title, setTitle] = useState('');
  const [titleTyped, setTitleTyped] = useState(false);

  useEffect(() => {
    if (!open) return;
    setBase(product);
    setChangingBase(false);
    setBaseQuery('');
  }, [open, product]);

  const pack = useQuery({
    queryKey: ['product-pack', base?.id],
    queryFn: async () => (await getProductPack(base!.id)).data,
    enabled: open && base != null,
  });
  const guess = pack.data?.guess;

  // Each base starts from its own count (Bill: "it auto populates Current product (100)"); the new pack starts the same.
  useEffect(() => {
    if (!guess) return;
    const count = guess.unit_count ? String(guess.unit_count) : '';
    setBaseCount(count);
    setBaseName(guess.unit_name || '');
    setBaseUnits(String(guess.pack_units || 1));
    setFixBase(null);
    setNewCount(count);
    setNewName(guess.unit_name || '');
    setNewUnits('1');
    setTitleTyped(false);
  }, [guess, pack.data?.id]);

  const bCount = wholeCount(baseCount);
  const bUnits = wholeCount(baseUnits) ?? 1;
  const nCount = wholeCount(newCount);
  const nUnits = wholeCount(newUnits) ?? 1;
  const baseChanged = guess != null && (
    bCount !== (guess.unit_count ?? null)
    || bUnits !== (guess.pack_units || 1)
    || singular(baseName) !== singular(guess.unit_name || '')
  );
  const label = packLabel(nCount, singular(newName), nUnits);
  const autoTitle = base ? retitle(base.title, label) : '';
  useEffect(() => {
    if (!titleTyped) setTitle(autoTitle);
  }, [autoTitle, titleTyped]);

  const basePieces = totalPieces(bCount, bUnits);
  const newPieces = totalPieces(nCount, nUnits);
  const price = scaleAmount(basePrice, basePieces, newPieces);
  const retail = scaleAmount(baseRetail, basePieces, newPieces);

  const debouncedBaseQuery = useDebouncedValue(baseQuery.trim(), 150);
  const baseSearch = useQuery({
    queryKey: ['product-find', debouncedBaseQuery, 'new-pack-base'],
    queryFn: async ({ signal }) => (await findProducts(debouncedBaseQuery, undefined, signal)).data,
    enabled: changingBase && debouncedBaseQuery.length >= 2,
    placeholderData: (prev) => prev,
  });

  const make = useMutation({
    mutationFn: async () => (await makeNewPack(base!.id, {
      unit_count: nCount!,
      unit_name: singular(newName),
      pack_units: nUnits,
      title: title.trim() || undefined,
      base_unit_count: bCount ?? undefined,
      base_unit_name: singular(baseName),
      base_pack_units: bUnits,
      fix_base: baseChanged && fixBase === 'yes',
      base_price: basePrice || undefined,
      base_retail: baseRetail || undefined,
    })).data,
    onSuccess: (data) => onMade(data),
  });

  const problem =
    !base ? 'Pick the base product.'
    : !bCount ? 'Say how many are in this product.'
    : !nCount ? 'Say how many are in each unit of the new pack.'
    : baseChanged && fixBase == null ? 'Fix this product too? Answer Yes or No.'
    : nCount === bCount && nUnits === bUnits && singular(newName) === singular(baseName) ? 'The new pack is the same as this product.'
    : '';

  return (
    <Dialog open={open} onClose={make.isPending ? undefined : onClose} fullWidth maxWidth="sm" disableRestoreFocus>
      <DialogTitle sx={{ pb: 0.5 }}>
        <Typography sx={{ fontWeight: 800, fontSize: '1.05rem' }}>New pack size</Typography>
        <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>
          Sell as a different pack, made from this product and linked to it.
        </Typography>
      </DialogTitle>
      <DialogContent sx={{ pt: '8px !important' }}>
        <Stack spacing={1.5}>
          <Box>
            <Typography sx={{ fontSize: '0.625rem', fontWeight: 900, letterSpacing: 0.7, textTransform: 'uppercase', color: processingTokens.textMute }}>
              Base product
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
              <Typography noWrap sx={{ fontWeight: 800, fontSize: 13.5, flex: 1, minWidth: 0 }} title={base?.title}>
                {base?.title ?? 'None'}
              </Typography>
              <Link component="button" type="button" underline="hover" onClick={() => setChangingBase((v) => !v)} sx={{ fontSize: 12.5, flexShrink: 0 }}>
                {changingBase ? 'Keep this one' : 'Another base'}
              </Link>
            </Box>
            {changingBase ?
              <Box sx={{ mt: 0.75 }}>
                <TextField
                  size="small"
                  fullWidth
                  autoFocus
                  placeholder="Search the base product (code, title, brand)"
                  value={baseQuery}
                  onChange={(e) => setBaseQuery(e.target.value)}
                  slotProps={{ htmlInput: { 'aria-label': 'Search the base product' } }}
                />
                <Box sx={{ maxHeight: 180, overflowY: 'auto', mt: 0.5, border: 1, borderColor: processingTokens.border, borderRadius: 1 }}>
                  {(baseSearch.data?.results ?? []).slice(0, 10).map((p) => (
                    <Box
                      key={p.id}
                      component="button"
                      type="button"
                      onClick={() => { setBase({ id: p.id, title: p.title }); setChangingBase(false); }}
                      sx={{ display: 'block', width: '100%', textAlign: 'left', border: 0, borderBottom: 1, borderColor: processingTokens.border, bgcolor: 'background.paper', px: 1, py: 0.6, cursor: 'pointer', font: 'inherit', '&:hover': { bgcolor: processingTokens.primarySoft } }}
                    >
                      <Typography noWrap sx={{ fontSize: 13, fontWeight: 700 }}>{p.title}</Typography>
                      <Typography noWrap sx={{ fontSize: 11.5, color: 'text.secondary' }}>{[p.brand, p.product_number && `#${p.product_number}`].filter(Boolean).join(' · ')}</Typography>
                    </Box>
                  ))}
                </Box>
              </Box>
            : null}
          </Box>

          {pack.isLoading ? <CircularProgress size={18} /> : (
            <>
              <Box>
                <Typography sx={{ fontSize: '0.625rem', fontWeight: 900, letterSpacing: 0.7, textTransform: 'uppercase', color: processingTokens.textMute, mb: 0.75 }}>
                  This product is {packLabel(bCount, singular(baseName), bUnits) || 'not counted yet'}
                </Typography>
                <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap">
                  <CountBox label="Units" value={baseUnits} onChange={setBaseUnits} width={72} ariaLabel="This product: units in the pack" />
                  <NameBox value={baseName} onChange={setBaseName} ariaLabel="This product: unit name" />
                  <Typography sx={{ fontWeight: 800 }}>×</Typography>
                  <CountBox label="Count each" value={baseCount} onChange={setBaseCount} ariaLabel="This product: count per unit" />
                </Stack>
                {/* Room held for the question, so nothing below moves when it shows. */}
                <Box sx={{ minHeight: 34, display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
                  {baseChanged ?
                    <>
                      <Typography variant="caption" sx={{ fontWeight: 800 }}>
                        Fix this product's own details to {packLabel(bCount, singular(baseName), bUnits)}?
                      </Typography>
                      <ToggleButtonGroup exclusive size="small" value={fixBase} onChange={(_e, v) => v && setFixBase(v)}>
                        <ToggleButton value="yes" sx={{ py: 0.1, px: 1.25, fontWeight: 800 }}>Yes</ToggleButton>
                        <ToggleButton value="no" sx={{ py: 0.1, px: 1.25, fontWeight: 800 }}>No</ToggleButton>
                      </ToggleButtonGroup>
                    </>
                  : guess?.from_title && guess.unit_count ?
                    <Typography variant="caption" color="text.secondary">Read from its title.</Typography>
                  : null}
                </Box>
              </Box>

              <Box>
                <Typography sx={{ fontSize: '0.625rem', fontWeight: 900, letterSpacing: 0.7, textTransform: 'uppercase', color: processingTokens.textMute, mb: 0.75 }}>
                  The new pack
                </Typography>
                <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap">
                  <CountBox label="Units" value={newUnits} onChange={setNewUnits} width={72} ariaLabel="New pack: units in the pack" />
                  <NameBox value={newName} onChange={setNewName} ariaLabel="New pack: unit name" />
                  <Typography sx={{ fontWeight: 800 }}>×</Typography>
                  <CountBox label="Count each" value={newCount} onChange={setNewCount} ariaLabel="New pack: count per unit" />
                </Stack>
                <TextField
                  size="small"
                  fullWidth
                  label="New product title"
                  value={title}
                  onChange={(e) => { setTitle(e.target.value); setTitleTyped(true); }}
                  sx={{ mt: 1.25 }}
                />
                <Typography sx={{ mt: 1, fontSize: 13, fontWeight: 700 }} data-testid="new-pack-preview">
                  {label || '-'}
                  {newPieces ? ` = ${newPieces.toLocaleString()} pieces` : ''}
                  {price ? ` · price ${formatCurrency(price)}` : ''}
                  {retail ? ` · retail ${formatCurrency(retail)}` : ''}
                </Typography>
                {basePrice && basePieces ?
                  <Typography variant="caption" color="text.secondary">
                    From {formatCurrency(basePrice)} for {basePieces.toLocaleString()}. Free to change at check-in.
                  </Typography>
                : null}
              </Box>
            </>
          )}
          {make.isError ? <Alert severity="error">{apiErrorDetail(make.error, 'Could not make the new pack.')}</Alert> : null}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Typography variant="caption" color="warning.main" sx={{ mr: 'auto' }}>{problem}</Typography>
        <Button onClick={onClose} disabled={make.isPending}>Cancel</Button>
        <Button variant="contained" disabled={Boolean(problem) || make.isPending} onClick={() => make.mutate()}>
          Make it and check in
        </Button>
      </DialogActions>
    </Dialog>
  );
}
