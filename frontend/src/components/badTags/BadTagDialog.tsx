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
import {
  BAD_TAG_REASONS,
  lookupBadTag,
  recordBadTag,
  type BadTag,
  type BadTagLookup,
  type BadTagReason,
  type BadTagWhere,
} from '../../api/badTags.api';
import { useAuth } from '../../hooks/useAuth';
import { apiErrorDetail } from '../../hooks/useProductSearch';
import { skuFromScan } from '../../utils/scanCode';

const COPY = {
  title: { en: 'Bad tag', es: 'Etiqueta mala' },
  scan: { en: 'Scan or type the tag', es: 'Escanea o escribe la etiqueta' },
  notFound: { en: 'No item has this tag.', es: 'Ningun articulo tiene esta etiqueta.' },
  whatsWrong: { en: 'What is wrong?', es: 'Que esta mal?' },
  rightPrice: { en: 'Right price (if you know it)', es: 'Precio correcto (si lo sabes)' },
  rightRetail: { en: 'Right retail (if you know it)', es: 'Precio de lista correcto (si lo sabes)' },
  whatIsIt: { en: 'What is the item?', es: 'Que es el articulo?' },
  note: { en: 'Note (optional)', es: 'Nota (opcional)' },
  photo: { en: 'Photo (optional)', es: 'Foto (opcional)' },
  photoTaken: { en: 'Photo taken', es: 'Foto tomada' },
  cancel: { en: 'Cancel', es: 'Cancelar' },
  save: { en: 'Send to PR Fix-it', es: 'Enviar a PR Fix-it' },
  saved: { en: 'Bad tag sent to PR Fix-it. Put the item in the PR cart.', es: 'Enviado a PR Fix-it. Pon el articulo en el carrito PR.' },
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
 * Scan a wrong tag, say why, send it to PR Fix-it (retail_tags_and_social Phase 1). Used from Today, the section
 * walks, and the register. The server traces it to who checked the item in, the truck and the manifest row.
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
  onSaved?: (bad: BadTag) => void;
  initialCode?: string;
  initialReason?: BadTagReason;
  /** Limit the choices (e.g. a "Tag missing" counter offers only that one). */
  reasons?: BadTagReason[];
}) {
  const theme = useTheme();
  const phone = useMediaQuery(theme.breakpoints.down('sm'));
  const { enqueueSnackbar } = useSnackbar();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const lang: Lang = user?.language === 'es' ? 'es' : 'en';
  const tr = (key: keyof typeof COPY) => COPY[key][lang];

  const [code, setCode] = useState(initialCode);
  const [found, setFound] = useState<BadTagLookup | null>(null);
  const [looking, setLooking] = useState(false);
  const [reason, setReason] = useState<BadTagReason | ''>(initialReason ?? '');
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
      setFound(await lookupBadTag(value));
    } catch (err) {
      enqueueSnackbar(apiErrorDetail(err, 'Could not look up the tag'), { variant: 'error' });
    } finally {
      setLooking(false);
    }
  }

  const options = BAD_TAG_REASONS.filter((r) => !reasons || reasons.includes(r.key));
  const missing = reason === 'missing';
  const needsItem = !missing;
  const canSave =
    !!reason && !saving && (needsItem ? !!found?.found : !!(found?.found || detail.trim()));

  async function save() {
    if (!reason) return;
    setSaving(true);
    try {
      const bad = await recordBadTag({
        code: found?.found ? found.code : code.trim(),
        reason,
        where,
        detail: detail.trim() || undefined,
        right_price: (reason === 'price_high' || reason === 'price_low') && rightPrice ? rightPrice : undefined,
        right_retail: reason === 'retail_high' && rightRetail ? rightRetail : undefined,
        photo: photo ?? undefined,
      });
      enqueueSnackbar(tr('saved'), { variant: 'success' });
      void queryClient.invalidateQueries({ queryKey: ['stocktake', 'bad-tags'] });
      onSaved?.(bad);
      onClose();
    } catch (err) {
      enqueueSnackbar(apiErrorDetail(err, 'Could not save the bad tag'), { variant: 'error' });
    } finally {
      setSaving(false);
    }
  }

  const item = found?.item;
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

          <Box>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>{tr('whatsWrong')}</Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              {options.map((r) => (
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
            label={missing && !found?.found ? tr('whatIsIt') : tr('note')}
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            multiline
            minRows={1}
            maxRows={4}
          />
          <Button
            component="label"
            variant="outlined"
            startIcon={<CameraAltOutlined />}
            color={photo ? 'success' : 'inherit'}
            sx={{ alignSelf: 'flex-start' }}
          >
            {photo ? tr('photoTaken') : tr('photo')}
            <input
              hidden
              type="file"
              accept="image/*"
              capture="environment"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (!file) return;
                try {
                  setPhoto(await shrinkPhoto(file));
                } catch {
                  enqueueSnackbar('Could not read the photo', { variant: 'warning' });
                }
              }}
            />
          </Button>
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
