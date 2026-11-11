import { AddPhoto } from '../photos/AddPhoto';
import { useIsPhoneDevice } from '../photos/photoMethods';
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
  IconButton,
  InputAdornment,
  Stack,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import CameraAltOutlined from '@mui/icons-material/CameraAltOutlined';
import CloseRounded from '@mui/icons-material/CloseRounded';
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';
import { useSnackbar } from 'notistack';
import { useQueryClient } from '@tanstack/react-query';
import { BAD_TAG_REASONS, type BadTagReason, type BadTagWhere } from '../../api/badTags.api';
import {
  FLOOR_ITEM_REASONS,
  isFloorItemReason,
  lookupFloorIssue,
  reportFloorIssue,
  type FloorIssueLookup,
  type FloorIssueReason,
} from '../../api/floorIssues.api';
import { useLanguage } from '../../i18n/useLanguage';
import { apiErrorDetail } from '../../hooks/useProductSearch';
import { cameraSupported, useQrCamera } from '../../pages/thriftplus/scanner/useQrCamera';
import { skuFromScan } from '../../utils/scanCode';

const COPY = {
  title: { en: 'Report a problem', es: 'Reportar un problema' },
  scan: { en: 'Scan or type the tag', es: 'Escanea o escribe la etiqueta' },
  typeHint: { en: 'Typing it? The digits after ITM are enough.', es: 'Lo escribes? Bastan los digitos despues de ITM.' },
  slotNoTag: { en: 'No tag to scan. Say what the item is in the note.', es: 'Sin etiqueta. Di que es el articulo en la nota.' },
  keepGoing: { en: 'Keep going', es: 'Seguir' },
  closeAnyway: { en: 'Close without sending', es: 'Cerrar sin enviar' },
  reportAnother: { en: 'Report another', es: 'Reportar otro' },
  done: { en: 'Done', es: 'Listo' },
  sentAlready: { en: 'Already reported', es: 'Ya estaba reportado' },
  sentAlreadyNext: { en: 'It was already waiting in Processing. Nothing new was sent.', es: 'Ya estaba esperando en Processing. No se envio nada nuevo.' },
  close: { en: 'Close', es: 'Cerrar' },
  slotEmpty: { en: 'The item shows here once its tag is scanned or typed.', es: 'El articulo aparece aqui al escanear o escribir su etiqueta.' },
  slotCamera: { en: 'Point the camera at the square code on the tag.', es: 'Apunta la camara al codigo cuadrado de la etiqueta.' },
  cameraOff: { en: 'The camera is not on. Type the tag number above.', es: 'La camara no esta encendida. Escribe el numero de la etiqueta arriba.' },
  looking: { en: 'Looking it up.', es: 'Buscando.' },
  notFoundMissing: { en: 'No item has this number. The report goes with the number as you typed it and your note.', es: 'Ningun articulo tiene este numero. El reporte va con el numero como lo escribiste y tu nota.' },
  notFound: { en: 'No item has this tag. Check the number and try again. If the tag cannot be read, pick "Tag missing or unreadable" below.', es: 'Ningun articulo tiene esta etiqueta. Revisa el numero. Si no se puede leer, elige "Falta etiqueta o no se lee" abajo.' },
  sold: { en: 'The system says this item was sold.', es: 'El sistema dice que este articulo ya se vendio.' },
  waiting: { en: 'Already reported', es: 'Ya fue reportado' },
  waitingBy: { en: 'by', es: 'por' },
  waitingNext: { en: 'It is waiting in Processing. Nothing more to send. Put the item on the PR cart if it is still on the floor.', es: 'Esta esperando en Processing. No hay nada mas que enviar. Pon el articulo en el carrito PR si sigue en el piso.' },
  whatsWrong: { en: 'What is wrong?', es: 'Que esta mal?' },
  theItem: { en: 'The item', es: 'El articulo' },
  theTag: { en: 'The tag', es: 'La etiqueta' },
  rightPrice: { en: 'Right price, if known', es: 'Precio correcto, si lo sabes' },
  rightRetail: { en: 'Right retail, if known', es: 'Lista correcta, si la sabes' },
  clearTag: { en: 'Clear the tag', es: 'Borrar la etiqueta' },
  discardAsk: { en: 'Close without sending? The note and photo are lost.', es: 'Cerrar sin enviar? Se pierden la nota y la foto.' },
  tagNotItem: { en: 'No item has this tag. Check the number, or clear it and scan again.', es: 'Ningun articulo tiene esta etiqueta. Revisa el numero, o borralo y escanea otra vez.' },
  priceShouldBeLower: { en: 'The right price is not lower than the price on the tag. Check it.', es: 'El precio correcto no es mas bajo que el de la etiqueta. Revisalo.' },
  priceShouldBeHigher: { en: 'The right price is not higher than the price on the tag. Check it.', es: 'El precio correcto no es mas alto que el de la etiqueta. Revisalo.' },
  retailShouldBeLower: { en: 'The right retail is not lower than the retail on the tag. Check it.', es: 'La lista correcta no es mas baja que la de la etiqueta. Revisala.' },
  whatIsIt: { en: 'What is the item?', es: 'Que es el articulo?' },
  sayWhat: { en: 'What is wrong with it?', es: 'Que tiene de malo?' },
  note: { en: 'Note (optional)', es: 'Nota (opcional)' },
  addPhoto: { en: 'Add photo', es: 'Agregar foto' },
  removePhoto: { en: 'Remove photo', es: 'Quitar foto' },
  cancel: { en: 'Cancel', es: 'Cancelar' },
  save: { en: 'Send to Processing', es: 'Enviar a Processing' },
  saved: { en: 'Sent to Processing', es: 'Enviado a Processing' },
  noTagItem: { en: 'No tag', es: 'Sin etiqueta' },
  putOnCart: { en: 'Put the item on the PR cart.', es: 'Pon el articulo en el carrito PR.' },
  alreadySaved: { en: 'This item was already reported. It is waiting in Processing.', es: 'Este articulo ya fue reportado. Esta esperando en Processing.' },
  needTag: { en: 'First scan or type the tag.', es: 'Primero escanea o escribe la etiqueta.' },
  needReason: { en: 'Now pick what is wrong, then send.', es: 'Ahora elige que esta mal y envia.' },
  needSayWhat: { en: 'Say what is wrong in the note, then send.', es: 'Di que esta mal en la nota y envia.' },
  needWhatIsIt: { en: 'No tag: say what the item is in the note, then send.', es: 'Sin etiqueta: di que es el articulo en la nota y envia.' },
  soldPick: { en: 'It was sold, so this tag is on the wrong item. Pick "Wrong item".', es: 'Ya se vendio, asi que la etiqueta esta en otro articulo. Elige "Articulo equivocado".' },
  ready: { en: 'Ready to send.', es: 'Listo para enviar.' },
  readyMeans: { en: 'Ready to send.', es: 'Listo para enviar.' },
  tagLeaveEmpty: { en: 'No tag to scan? Leave this empty.', es: 'Sin etiqueta? Deja esto vacio.' },
} as const;

/** One plain line about a tag problem, shown once it is picked (a new hire cannot tell "retail" from "price"). */
const REASON_MEANS: Partial<Record<FloorIssueReason, { en: string; es: string }>> = {
  retail_high: { en: 'Retail overstated: the "Retail" on the tag is more than the item sells for new.', es: 'Lista inflada: el precio de lista en la etiqueta es mas de lo que cuesta nuevo.' },
  wrong_item: { en: 'Wrong item: the tag names a different item than the one it is on.', es: 'Articulo equivocado: la etiqueta nombra otro articulo.' },
  price_high: { en: 'Price too high: our price on the tag is more than it should be.', es: 'Precio muy alto: nuestro precio en la etiqueta es mas de lo debido.' },
  price_low: { en: 'Price too low: our price on the tag is less than it should be.', es: 'Precio muy bajo: nuestro precio en la etiqueta es menos de lo debido.' },
};

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

/** A tag typed as digits only ("226270") is the item number without its letters. */
export function typedTag(raw: string): string {
  const value = skuFromScan(raw).trim();
  return /^\d{1,7}$/.test(value) ? `ITM${value.padStart(7, '0')}` : value;
}

/** The phone's camera, reading the tag's code. Mounted only while the window waits for a tag on a phone. */
function TagCamera({ onCode, lang }: { onCode: (raw: string) => void; lang: Lang }) {
  const cam = useQrCamera({ enabled: true, paused: false, onDecode: (raw) => onCode(raw) });
  const off = cam.status === 'blocked' || cam.status === 'unsupported';
  return (
    <Box sx={{ position: 'relative', flex: 1, borderRadius: 1, overflow: 'hidden', bgcolor: off ? 'action.hover' : '#111' }}>
      {off ? null : (
        <Box component="video" ref={cam.videoRef} muted playsInline autoPlay data-testid="tag-camera"
          sx={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
      )}
      <Typography
        variant="body2"
        onClick={off ? undefined : cam.wake}
        sx={{
          position: 'absolute', left: 0, right: 0, bottom: 0, px: 1, py: 0.5, textAlign: 'center',
          color: off ? 'text.secondary' : '#fff', bgcolor: off ? 'transparent' : 'rgba(0,0,0,0.55)',
          ...(off ? { top: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' } : {}),
        }}
      >
        {COPY[off ? 'cameraOff' : 'slotCamera'][lang]}
      </Typography>
    </Box>
  );
}

/**
 * Report a problem (Dash Update #84): the one report for anything wrong on the floor. Scan the tag, pick what is
 * wrong with the item (broken, missing parts, ...) or with its tag (wrong price, wrong item, ...), send it. The item
 * keeps its status and waits on Processing > Floor issues. A tag problem is still a bad tag, traced to who checked
 * the item in, the truck and the manifest row (retail_tags_and_social Phase 1).
 * Used from Today, the section walks, the register, Search and the item window.
 *
 * Built for a phone in one hand: the camera reads the tag, the choices are thumb sized, and nothing moves once the
 * window is open (the item has its own fixed spot; the line above Send always says what is still needed).
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
  const phoneDevice = useIsPhoneDevice();
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
  const [asking, setAsking] = useState(false);
  const [sent, setSent] = useState<{ title: string; already: boolean } | null>(null);
  /** The item the report is about: a different item scanned after it starts a clean report. */
  const itemIdRef = useRef<number | null>(null);
  const codeRef = useRef<HTMLInputElement | null>(null);

  /** A clean report: nothing from the last item rides along. */
  function startOver(tag: string) {
    setCode(tag);
    setFound(null);
    setReason(initialReason ?? '');
    setRightPrice('');
    setRightRetail('');
    setDetail('');
    setPhoto(null);
    setAsking(false);
    setSent(null);
    itemIdRef.current = null;
    if (tag) void look(tag);
  }

  useEffect(() => {
    if (!open) return;
    startOver(initialCode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialCode, initialReason]);

  async function look(raw: string) {
    const value = typedTag(raw);
    if (!value) return;
    setLooking(true);
    try {
      const hit = await lookupFloorIssue(value);
      // A different item than the one this report was about: a new report, so nothing from the last one rides along.
      const id = hit.item?.id ?? null;
      if (id != null && itemIdRef.current != null && id !== itemIdRef.current) {
        setReason(initialReason ?? '');
        setRightPrice('');
        setRightRetail('');
        setDetail('');
        setPhoto(null);
      }
      if (id != null) itemIdRef.current = id;
      setFound(hit);
      if (hit.found && hit.code) setCode(hit.code);
      // A phone's keyboard would sit on top of the choices: put it away once the tag is read.
      if (hit.found && phoneDevice) codeRef.current?.blur();
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
  const priceReason = reason === 'price_high' || reason === 'price_low';
  const retailReason = reason === 'retail_high';
  const needsItem = !missing;
  const item = found?.item;
  const waiting = found?.floor_issue ?? null;
  const sold = item?.status === 'sold';
  const soldNeedsTagReason = !!sold && !!reason && isFloorItemReason(reason);
  const haveTag = needsItem ? !!found?.found : !!(found?.found || detail.trim());
  const canSave = !!reason && !saving && !waiting && haveTag && (!other || !!detail.trim()) && !soldNeedsTagReason;
  const dirty = !!detail.trim() || !!photo;

  // The line above Send: what is still needed, or what the picked tag problem means.
  let hint: string;
  if (missing && !found?.found && !detail.trim()) hint = tr('needWhatIsIt');
  else if (!missing && found && !found.found) hint = tr('tagNotItem');
  else if (!missing && !found?.found) hint = tr('needTag');
  else if (!reason) hint = tr('needReason');
  else if (soldNeedsTagReason) hint = tr('soldPick');
  else if (other && !detail.trim()) hint = tr('needSayWhat');
  else if (reason === 'price_high' && rightPrice && item && Number(rightPrice) >= Number(item.price)) hint = tr('priceShouldBeLower');
  else if (reason === 'price_low' && rightPrice && item && Number(rightPrice) <= Number(item.price)) hint = tr('priceShouldBeHigher');
  else if (retailReason && rightRetail && item?.retail && Number(rightRetail) >= Number(item.retail)) hint = tr('retailShouldBeLower');
  else hint = REASON_MEANS[reason] ? `${tr('ready')} ${REASON_MEANS[reason]?.[lang]}` : tr('ready');
  if (asking) hint = tr('discardAsk');

  // Cancel, the X and Escape: with a note or a photo in the window, it asks first (Keep going, or Close without
  // sending, which sits where Send was, away from where Cancel was tapped). After sending there is nothing to lose.
  function leave() {
    if (sent || !dirty) onClose();
    else setAsking(true);
  }

  async function save() {
    if (!reason) return;
    setSaving(true);
    try {
      const result = await reportFloorIssue({
        code: found?.found ? found.code : code.trim(),
        reason,
        where,
        note: detail.trim() || undefined,
        right_price: priceReason && rightPrice ? rightPrice : undefined,
        right_retail: retailReason && rightRetail ? rightRetail : undefined,
        photo: photo ?? undefined,
      });
      const name = result.floor_issue?.item.title || item?.title || (detail.trim() ? `${tr('noTagItem')}: ${detail.trim()}` : '');
      const sku = result.floor_issue?.item.sku || item?.sku || '';
      setSent({ title: sku && name ? `${name} (${sku})` : name, already: result.already });
      void queryClient.invalidateQueries({ queryKey: ['stocktake', 'bad-tags'] });
      void queryClient.invalidateQueries({ queryKey: ['floor-issues'] });
      void queryClient.invalidateQueries({ queryKey: ['reentries'] });
      void queryClient.invalidateQueries({ queryKey: ['reentry-find'] });
      if (result.floor_issue) void queryClient.invalidateQueries({ queryKey: ['item-card', result.floor_issue.item.id] });
      onSaved?.();
    } catch (err) {
      enqueueSnackbar(apiErrorDetail(err, 'Could not send the report'), { variant: 'error' });
    } finally {
      setSaving(false);
    }
  }

  const chips = (list: { key: FloorIssueReason; label: string; label_es: string }[]) => (
    <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 1 }}>
      {list.map((r) => (
        <Chip
          key={r.key}
          label={lang === 'es' ? r.label_es : r.label}
          color={reason === r.key ? 'primary' : 'default'}
          variant={reason === r.key ? 'filled' : 'outlined'}
          onClick={() => setReason(r.key)}
          aria-pressed={reason === r.key}
          sx={{
            height: 44, fontSize: { xs: 13, sm: 14 }, borderRadius: 2, width: '100%',
            '& .MuiChip-label': { whiteSpace: 'normal', lineHeight: 1.15, textAlign: 'center', px: 0.75 },
          }}
        />
      ))}
    </Box>
  );
  const groupLabel = { fontSize: 13, fontWeight: 800, color: 'text.secondary', mb: 0.75 } as const;
  const cameraHere = phoneDevice && !initialCode && cameraSupported();
  const useCamera = open && cameraHere && !found?.found && !looking;
  // The item's spot keeps one height, whatever it shows, so the choices under it never move.
  const slotHeight = 104;
  const extraBox = priceReason || retailReason;

  return (
    <Dialog
      open={open}
      // A tap outside does not throw away a typed note or a photo; Cancel, the X and Escape still close.
      onClose={(_e, why) => { if (why === 'backdropClick' && dirty) return; leave(); }}
      fullScreen={phone}
      maxWidth="sm"
      fullWidth
      // Top-aligned on a computer: when the window has more to show it grows down, it never jumps up.
      sx={phone ? undefined : { '& .MuiDialog-container': { alignItems: 'flex-start' }, '& .MuiDialog-paper': { my: 2, maxHeight: 'calc(100% - 32px)' } }}
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pr: 1.5, py: 1 }}>
        {tr('title')}
        <IconButton aria-label={tr('close')} onClick={leave} edge="end" sx={{ width: 44, height: 44 }}>
          <CloseRounded />
        </IconButton>
      </DialogTitle>
      {sent ? (
        <>
          <DialogContent sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 1, py: 4 }} data-testid="report-sent">
            <CheckCircleRounded sx={{ fontSize: 64, color: sent.already ? 'info.main' : 'success.main' }} />
            <Typography variant="h6" sx={{ fontWeight: 800 }}>{tr(sent.already ? 'sentAlready' : 'saved')}</Typography>
            {sent.title ? <Typography sx={{ fontWeight: 700, overflowWrap: 'anywhere' }}>{sent.title}</Typography> : null}
            <Typography>{sent.already ? tr('sentAlreadyNext') : tr('putOnCart')}</Typography>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2, justifyContent: 'space-between', gap: 2 }}>
            <Button variant="outlined" onClick={() => startOver('')} sx={{ minHeight: 48 }}>{tr('reportAnother')}</Button>
            <Button variant="contained" onClick={onClose} sx={{ minHeight: 48, minWidth: 120 }} autoFocus>{tr('done')}</Button>
          </DialogActions>
        </>
      ) : (<>
      <DialogContent sx={{ pb: 0 }}>
        <Stack spacing={1.25} sx={{ pt: 0.75 }}>
          <TextField
            inputRef={codeRef}
            // On a phone the camera reads the tag; a keyboard up front would cover the choices.
            autoFocus={!initialCode && !phoneDevice}
            label={tr('scan')}
            value={code}
            onChange={(e) => {
              setCode(e.target.value);
              setFound(null);
            }}
            // Enter (a scanner sends one) looks the tag up and marks it, so the next scan replaces it.
            onKeyDown={(e) => {
              if (e.key === 'Enter') { void look(code); (e.target as HTMLInputElement).select(); }
            }}
            // Tapping back into the box after a tag is read: the next thing typed replaces it.
            onFocus={(e) => { if (found) e.target.select(); }}
            onBlur={() => {
              if (code.trim() && !found) void look(code);
            }}
            helperText={found?.found ? ' ' : missing && !code.trim() ? tr('tagLeaveEmpty') : tr('typeHint')}
            slotProps={{
              input: {
                endAdornment: (
                  <InputAdornment position="end">
                    {looking ? <CircularProgress size={18} sx={{ mr: 1.5 }} /> : (
                      <IconButton
                        aria-label={tr('clearTag')}
                        edge="end"
                        onClick={() => { setCode(''); setFound(null); codeRef.current?.focus(); }}
                        sx={{ visibility: code ? 'visible' : 'hidden', width: 44, height: 44 }}
                      >
                        <CloseRounded fontSize="small" />
                      </IconButton>
                    )}
                  </InputAdornment>
                ),
              },
              htmlInput: {
                spellCheck: false, autoComplete: 'off', autoCapitalize: 'characters', autoCorrect: 'off', enterKeyHint: 'search',
                // A phone types the digits only (they are enough); a scanner still types the whole tag.
                ...(phoneDevice ? { inputMode: 'numeric' as const } : {}),
              },
            }}
          />

          <Box sx={{ height: slotHeight, display: 'flex' }} data-testid="report-item-slot">
            {item ? (
              <Box sx={{ flex: 1, minWidth: 0, p: 1.25, borderRadius: 1, border: 1, borderColor: 'divider', bgcolor: 'background.default', overflow: 'hidden' }}>
                <Typography sx={{ fontWeight: 700, lineHeight: 1.25, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                  {item.title}
                </Typography>
                <Typography variant="body2" color="text.secondary" noWrap>
                  {[item.brand, item.sku].filter(Boolean).join(' · ')}
                </Typography>
                <Typography variant="body2" noWrap>
                  Price {money(item.price)} · Retail {money(item.retail)}
                </Typography>
                {sold ? (
                  <Typography variant="body2" color="warning.main" noWrap>{tr('sold')}</Typography>
                ) : !phone && (found?.checked_in_by || found?.order_number) ? (
                  // Desktop only: on a phone the card's fixed height holds a two-line name, and this line is for the back room.
                  <Typography variant="caption" color="text.secondary" noWrap component="div">
                    Checked in {found?.checked_in_by ? `by ${found.checked_in_by}` : ''}
                    {found?.order_number ? ` · ${found.order_number}` : ''}
                  </Typography>
                ) : null}
              </Box>
            ) : found && !found.found ? (
              <Alert severity="warning" sx={{ flex: 1, alignItems: 'center' }}>{tr(missing ? 'notFoundMissing' : 'notFound')}</Alert>
            ) : useCamera && !missing ? (
              <TagCamera lang={lang} onCode={(raw) => { setCode(skuFromScan(raw)); void look(raw); }} />
            ) : (
              <Box sx={{ flex: 1, borderRadius: 1, border: '1px dashed', borderColor: 'divider', display: 'flex', alignItems: 'center', justifyContent: 'center', px: 2 }}>
                <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center' }}>
                  {looking ? tr('looking') : missing ? tr('slotNoTag') : tr('slotEmpty')}
                </Typography>
              </Box>
            )}
          </Box>

          {waiting ? (
            <Alert severity="info">
              <strong>{`${tr('waiting')}: ${waiting.reason_label}`}</strong>
              {waiting.reported_by ? ` (${tr('waitingBy')} ${waiting.reported_by})` : ''}
              {`. ${tr('waitingNext')}`}
            </Alert>
          ) : (
            <>
              <Box>
                <Typography variant="subtitle1" sx={{ fontWeight: 800, mb: 0.75 }}>{tr('whatsWrong')}</Typography>
                {itemOptions.length > 0 && (
                  <Box sx={{ mb: 1.5 }}>
                    <Typography sx={groupLabel}>{tr('theItem')}</Typography>
                    {chips(itemOptions)}
                  </Box>
                )}
                {itemOptions.length > 0 && <Typography sx={groupLabel}>{tr('theTag')}</Typography>}
                {chips(tagOptions)}
              </Box>

              <TextField
                fullWidth
                label={missing && !found?.found ? tr('whatIsIt') : other ? tr('sayWhat') : tr('note')}
                value={detail}
                onChange={(e) => { setDetail(e.target.value); setAsking(false); }}
                slotProps={{ htmlInput: { maxLength: 300 } }}
              />

              {/* One row that is always there: the right price when a price problem is picked, and the photo. Picking
                  a problem or adding a photo fills it in; nothing above or below moves. */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, height: 56 }}>
                {photo ? (
                  <>
                    <Box component="img" src={photo} alt="" sx={{ width: 52, height: 52, objectFit: 'cover', borderRadius: 1, border: 1, borderColor: 'divider', flexShrink: 0 }} />
                    <Button color="inherit" onClick={() => setPhoto(null)} sx={{ minHeight: 44, textTransform: 'none', whiteSpace: 'nowrap' }}>{tr('removePhoto')}</Button>
                  </>
                ) : (
                  <AddPhoto
                    startIcon={<CameraAltOutlined />}
                    variant="outlined"
                    color="inherit"
                    sx={{ minHeight: 48, flexShrink: 0, whiteSpace: 'nowrap' }}
                    label={tr('addPhoto')}
                    usedWhere="Report a problem"
                    onPhotos={async ([file]) => {
                      try {
                        setPhoto(await shrinkPhoto(file));
                        setAsking(false);
                      } catch {
                        enqueueSnackbar('Could not read the photo', { variant: 'warning' });
                      }
                    }}
                  />
                )}
                {extraBox ? (
                  <TextField
                    label={priceReason ? tr('rightPrice') : tr('rightRetail')}
                    value={priceReason ? rightPrice : rightRetail}
                    onChange={(e) => (priceReason ? setRightPrice : setRightRetail)(e.target.value.replace(/[^0-9.]/g, ''))}
                    sx={{ width: 150, flexShrink: 0 }}
                    slotProps={{
                      inputLabel: { shrink: true },
                      input: { startAdornment: <InputAdornment position="start">$</InputAdornment> },
                      htmlInput: { inputMode: 'decimal' },
                    }}
                  />
                ) : null}
              </Box>
            </>
          )}
        </Stack>
      </DialogContent>
      {waiting ? (
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button variant="contained" onClick={onClose} sx={{ minHeight: 44 }}>{tr('close')}</Button>
        </DialogActions>
      ) : (
        <DialogActions sx={{ px: 3, pb: 2, pt: 1, flexDirection: 'column', alignItems: 'stretch', gap: 1, '& > :not(style) ~ :not(style)': { ml: 0 } }}>
          <Typography variant="body2" role="status" sx={{ minHeight: '2.9em', color: asking ? 'error.main' : canSave ? 'text.secondary' : 'text.primary', fontWeight: canSave && !asking ? 400 : 700 }}>
            {hint}
          </Typography>
          {asking ? (
            <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
              <Button variant="contained" onClick={() => setAsking(false)} sx={{ minHeight: 44, whiteSpace: 'nowrap' }} autoFocus>{tr('keepGoing')}</Button>
              <Button color="error" onClick={onClose} sx={{ minHeight: 44, minWidth: 190, whiteSpace: 'nowrap' }}>{tr('closeAnyway')}</Button>
            </Box>
          ) : (
            <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
              <Button onClick={leave} sx={{ minHeight: 44, whiteSpace: 'nowrap' }}>{tr('cancel')}</Button>
              <Button variant="contained" disabled={!canSave} onClick={() => void save()} sx={{ minHeight: 44, minWidth: 190, whiteSpace: 'nowrap' }}>
                {saving ? <CircularProgress size={18} color="inherit" /> : tr('save')}
              </Button>
            </Box>
          )}
        </DialogActions>
      )}
      </>)}
    </Dialog>
  );
}
