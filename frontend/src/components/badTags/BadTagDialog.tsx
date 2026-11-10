import { AddPhoto } from '../photos/AddPhoto';
import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  InputAdornment,
  Stack,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import CameraAltOutlined from '@mui/icons-material/CameraAltOutlined';
import { useSnackbar } from 'notistack';
import { useQueryClient } from '@tanstack/react-query';
import { BAD_TAG_REASONS, type BadTagReason, type BadTagWhere } from '../../api/badTags.api';
import {
  FLOOR_ITEM_REASONS,
  lookupFloorIssue,
  reportFloorIssue,
  type FloorIssueLookup,
  type FloorIssueReason,
} from '../../api/floorIssues.api';
import { useLanguage } from '../../i18n/useLanguage';
import { apiErrorDetail } from '../../hooks/useProductSearch';
import { skuFromScan } from '../../utils/scanCode';

const COPY = {
  title: { en: 'Report a problem', es: 'Reportar un problema' },
  scan: { en: 'Scan or type the tag', es: 'Escanea o escribe la etiqueta' },
  notFound: { en: 'No item has this tag.', es: 'Ningun articulo tiene esta etiqueta.' },
  waiting: { en: 'Already on its way to Processing', es: 'Ya va en camino a Processing' },
  whatsWrong: { en: 'What is wrong?', es: 'Que esta mal?' },
  theItem: { en: 'The item', es: 'El articulo' },
  theTag: { en: 'The tag', es: 'La etiqueta' },
  rightPrice: { en: 'Right price (if you know it)', es: 'Precio correcto (si lo sabes)' },
  rightRetail: { en: 'Right retail (if you know it)', es: 'Precio de lista correcto (si lo sabes)' },
  whatIsIt: { en: 'What is the item?', es: 'Que es el articulo?' },
  sayWhat: { en: 'What is wrong with it?', es: 'Que tiene de malo?' },
  note: { en: 'Note (optional)', es: 'Nota (opcional)' },
  photo: { en: 'Photo (optional)', es: 'Foto (opcional)' },
  photoTaken: { en: 'Photo taken', es: 'Foto tomada' },
  cancel: { en: 'Cancel', es: 'Cancelar' },
  save: { en: 'Send to Processing', es: 'Enviar a Processing' },
  saved: { en: 'Sent to Processing. Put the item on the PR cart.', es: 'Enviado a Processing. Pon el articulo en el carrito PR.' },
  savedNoItem: { en: 'Sent to PR Fix-it. Put the item on the PR cart.', es: 'Enviado a PR Fix-it. Pon el articulo en el carrito PR.' },
  alreadySaved: { en: 'This item is already on its way to Processing.', es: 'Este articulo ya va en camino a Processing.' },
} as const;

type Lang = 'en' | 'es';

function money(value: string | null | undefined): string {
  const n = value == null ? Number.NaN : Number.parseFloat(value);
  return Number.isFinite(n) ? `$${n.toFixed(2)}` : '-';
}

/** A phone photo shrunk to a JPEG data URL (long side 1280 px) so the upload stays small. */
async function shrinkPhoto(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = url;
    });
    const scale = Math.min(1, 1280 / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.8);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Report a problem (Dash Update #84): the one report for anything wrong on the floor. Scan the tag, pick what is
 * wrong with the item (broken, missing parts, ...) or with its tag (wrong price, wrong item, ...), send it. The item
 * keeps its status and waits on Processing > Floor issues. A tag problem is still a bad tag, traced to who checked
 * the item in, the truck and the manifest row (retail_tags_and_social Phase 1).
 * Used from Today, the section walks, the register, Search and the item window.
 */
export default function BadTagDialog({
  open,
  where,
  onClose,
  onSaved,
  initialCode = '',
  initialReason,
  reasons,
}: {
  open: boolean;
  where: BadTagWhere;
  onClose: () => void;
  onSaved?: () => void;
  initialCode?: string;
  initialReason?: BadTagReason;
  /** Limit the choices to these tag problems (e.g. a "Tag missing" counter offers only that one). */
  reasons?: BadTagReason[];
}) {
  const theme = useTheme();
  const phone = useMediaQuery(theme.breakpoints.down('sm'));
  const { enqueueSnackbar } = useSnackbar();
  const queryClient = useQueryClient();
  const lang: Lang = useLanguage();
  const tr = (key: keyof typeof COPY) => COPY[key][lang];

  const [code, setCode] = useState(initialCode);
  const [found, setFound] = useState<FloorIssueLookup | null>(null);
  const [looking, setLooking] = useState(false);
  const [reason, setReason] = useState<FloorIssueReason | ''>(initialReason ?? '');
  const [rightPrice, setRightPrice] = useState('');
  const [rightRetail, setRightRetail] = useState('');
  const [detail, setDetail] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const codeRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setCode(initialCode);
    setFound(null);
    setReason(initialReason ?? '');
    setRightPrice('');
    setRightRetail('');
    setDetail('');
    setPhoto(null);
    if (initialCode) void look(initialCode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialCode, initialReason]);

  async function look(raw: string) {
    const value = skuFromScan(raw);
    if (!value) return;
    setLooking(true);
    try {
      setFound(await lookupFloorIssue(value));
    } catch (err) {
      enqueueSnackbar(apiErrorDetail(err, 'Could not look up the tag'), { variant: 'error' });
    } finally {
      setLooking(false);
    }
  }

  // A walk's counter limits the list to its own tag problems; everywhere else the item's problems come first.
  const itemOptions = reasons ? [] : FLOOR_ITEM_REASONS;
  const tagOptions = BAD_TAG_REASONS.filter((r) => !reasons || reasons.includes(r.key));
  const missing = reason === 'missing';
  const other = reason === 'other';
  const needsItem = !missing;
  const waiting = found?.floor_issue ?? null;
  const canSave =
    !!reason && !saving && !waiting
    && (needsItem ? !!found?.found : !!(found?.found || detail.trim()))
    && (!other || !!detail.trim());

  async function save() {
    if (!reason) return;
    setSaving(true);
    try {
      const result = await reportFloorIssue({
        code: found?.found ? found.code : code.trim(),
        reason,
        where,
        note: detail.trim() || undefined,
        right_price: (reason === 'price_high' || reason === 'price_low') && rightPrice ? rightPrice : undefined,
        right_retail: reason === 'retail_high' && rightRetail ? rightRetail : undefined,
        photo: photo ?? undefined,
      });
      if (result.already) enqueueSnackbar(tr('alreadySaved'), { variant: 'info' });
      else enqueueSnackbar(tr(result.floor_issue ? 'saved' : 'savedNoItem'), { variant: 'success' });
      void queryClient.invalidateQueries({ queryKey: ['stocktake', 'bad-tags'] });
      void queryClient.invalidateQueries({ queryKey: ['floor-issues'] });
      void queryClient.invalidateQueries({ queryKey: ['reentries'] });
      if (result.floor_issue) void queryClient.invalidateQueries({ queryKey: ['item-card', result.floor_issue.item.id] });
      onSaved?.();
      onClose();
    } catch (err) {
      enqueueSnackbar(apiErrorDetail(err, 'Could not send the report'), { variant: 'error' });
    } finally {
      setSaving(false);
    }
  }

  const item = found?.item;
  const chips = (list: { key: FloorIssueReason; label: string; label_es: string }[]) => (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
      {list.map((r) => (
        <Chip
          key={r.key}
          label={lang === 'es' ? r.label_es : r.label}
          color={reason === r.key ? 'primary' : 'default'}
          variant={reason === r.key ? 'filled' : 'outlined'}
          onClick={() => setReason(r.key)}
          sx={{ height: 40, fontSize: 14 }}
        />
      ))}
    </Box>
  );
  const groupLabel = { fontSize: 12, fontWeight: 700, color: 'text.secondary', mb: 0.5 } as const;
  return (
    <Dialog open={open} onClose={onClose} fullScreen={phone} maxWidth="sm" fullWidth>
      <DialogTitle>{tr('title')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 0.5 }}>
          <TextField
            inputRef={codeRef}
            autoFocus={!initialCode}
            label={tr('scan')}
            value={code}
            onChange={(e) => {
              setCode(e.target.value);
              setFound(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void look(code);
            }}
            onBlur={() => {
              if (code.trim() && !found) void look(code);
            }}
            InputProps={{
              endAdornment: looking ? (
                <InputAdornment position="end"><CircularProgress size={18} /></InputAdornment>
              ) : undefined,
            }}
          />
          {found && !found.found && <Alert severity="info">{tr('notFound')}</Alert>}
          {item && (
            <Box sx={{ p: 1.5, borderRadius: 1, border: 1, borderColor: 'divider', bgcolor: 'background.default' }}>
              <Typography sx={{ fontWeight: 700 }}>{item.title}</Typography>
              <Typography variant="body2" color="text.secondary">
                {[item.brand, item.sku].filter(Boolean).join(' · ')}
              </Typography>
              <Typography variant="body2" sx={{ mt: 0.5 }}>
                Price {money(item.price)} · Retail {money(item.retail)}
                {found?.tag_retail ? ' (on the tag)' : ''}
              </Typography>
              {(found?.checked_in_by || found?.order_number) && (
                <Typography variant="caption" color="text.secondary">
                  Checked in {found?.checked_in_by ? `by ${found.checked_in_by}` : ''}
                  {found?.order_number ? ` · ${found.order_number}` : ''}
                </Typography>
              )}
            </Box>
          )}
          {waiting && (
            <Alert severity="info">
              {tr('waiting')}: {waiting.reason_label}
              {waiting.reported_by ? ` (${waiting.reported_by})` : ''}
            </Alert>
          )}

          <Box>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>{tr('whatsWrong')}</Typography>
            {itemOptions.length > 0 && (
              <Box sx={{ mb: 1.5 }}>
                <Typography sx={groupLabel}>{tr('theItem')}</Typography>
                {chips(itemOptions)}
              </Box>
            )}
            {itemOptions.length > 0 && <Typography sx={groupLabel}>{tr('theTag')}</Typography>}
            {chips(tagOptions)}
          </Box>

          {(reason === 'price_high' || reason === 'price_low') && (
            <TextField
              label={tr('rightPrice')}
              value={rightPrice}
              onChange={(e) => setRightPrice(e.target.value.replace(/[^0-9.]/g, ''))}
              inputProps={{ inputMode: 'decimal' }}
              InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }}
            />
          )}
          {reason === 'retail_high' && (
            <TextField
              label={tr('rightRetail')}
              value={rightRetail}
              onChange={(e) => setRightRetail(e.target.value.replace(/[^0-9.]/g, ''))}
              inputProps={{ inputMode: 'decimal' }}
              InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }}
            />
          )}
          <TextField
            label={missing && !found?.found ? tr('whatIsIt') : other ? tr('sayWhat') : tr('note')}
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            multiline
            minRows={1}
            maxRows={4}
          />
          <AddPhoto
            startIcon={<CameraAltOutlined />}
            color={photo ? 'success' : 'inherit'}
            sx={{ alignSelf: 'flex-start' }}
            label={photo ? tr('photoTaken') : tr('photo')}
            usedWhere="Bad tag"
            onPhotos={async ([file]) => {
              try {
                setPhoto(await shrinkPhoto(file));
              } catch {
                enqueueSnackbar('Could not read the photo', { variant: 'warning' });
              }
            }}
          />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>{tr('cancel')}</Button>
        <Button variant="contained" disabled={!canSave} onClick={() => void save()}>
          {saving ? <CircularProgress size={18} color="inherit" /> : tr('save')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
