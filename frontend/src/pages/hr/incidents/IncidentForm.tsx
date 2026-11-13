/**
 * The incident report form (#131): full screen on a phone, filled in right after it happens. New or edit; an edit
 * sends only what changed and the server keeps the old text in the report's history.
 */
import { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  MenuItem,
  Stack,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import CloseRounded from '@mui/icons-material/CloseRounded';
import PlaceRounded from '@mui/icons-material/PlaceRounded';
import PersonAddAlt1Rounded from '@mui/icons-material/PersonAddAlt1Rounded';
import { format } from 'date-fns';
import { AddPhoto } from '../../../components/photos/AddPhoto';
import { PickedPhotos } from '../../../components/photos/PickedPhotos';
import { markPhotosUsed } from '../../../components/photos/photoFile';
import type {
  IncidentDetail,
  IncidentKind,
  IncidentPerson,
  IncidentPlace,
  IncidentRole,
  IncidentSpot,
  IncidentWrite,
} from '../../../api/incidents.api';
import { IncidentSpotPicker } from './IncidentMap';
import { KIND_COPY, PLACE_COPY, ROLE_COPY, useIncidentCopy } from './incidentCopy';

export const MAX_PHOTOS = 8;
const USED_WHERE = 'Incident report';
const KINDS = Object.keys(KIND_COPY) as IncidentKind[];
const PLACES = Object.keys(PLACE_COPY) as IncidentPlace[];
const ROLES = Object.keys(ROLE_COPY) as IncidentRole[];

type Draft = Omit<IncidentWrite, 'map' | 'occurred_at' | 'kind' | 'place'> & {
  occurred_local: string;
  kind: IncidentKind | '';
  place: IncidentPlace | '';
  spot: IncidentSpot | null;
};

const localNow = () => format(new Date(), "yyyy-MM-dd'T'HH:mm");

function blank(): Draft {
  return {
    occurred_local: localNow(), kind: '', place: '', place_detail: '', spot: null,
    people: [{ role: 'customer', name: '', contact: '' }],
    what_happened: '', injuries: '', first_aid: false, called_911: false, witnesses: '', cameras: '', follow_up: '',
  };
}

function fromReport(r: IncidentDetail): Draft {
  return {
    occurred_local: format(new Date(r.occurred_at), "yyyy-MM-dd'T'HH:mm"), kind: r.kind, place: r.place,
    place_detail: r.place_detail, spot: r.map_pin ? { plan: r.map_pin.plan, x: r.map_pin.x, y: r.map_pin.y } : null,
    people: r.people.length ? r.people : [{ role: 'customer', name: '', contact: '' }],
    what_happened: r.what_happened, injuries: r.injuries, first_aid: r.first_aid, called_911: r.called_911,
    witnesses: r.witnesses, cameras: r.cameras, follow_up: r.follow_up,
  };
}

export interface IncidentFormProps {
  open: boolean;
  /** Editing this report; none = a new report. */
  report?: IncidentDetail | null;
  busy: boolean;
  error: string;
  onClose: () => void;
  onSubmit: (payload: IncidentWrite, photos: File[]) => Promise<unknown>;
}

export function IncidentForm({ open, report, busy, error, onClose, onSubmit }: IncidentFormProps) {
  const { t, pick } = useIncidentCopy();
  const theme = useTheme();
  const phone = useMediaQuery(theme.breakpoints.down('sm'));
  const [draft, setDraft] = useState<Draft>(blank);
  const [photos, setPhotos] = useState<File[]>([]);
  const [picking, setPicking] = useState(false);
  const [missing, setMissing] = useState('');

  useEffect(() => {
    if (!open) return;
    setDraft(report ? fromReport(report) : blank());
    setPhotos([]);
    setMissing('');
  }, [open, report]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const setPerson = (index: number, patch: Partial<IncidentPerson>) =>
    set('people', draft.people.map((p, i) => (i === index ? { ...p, ...patch } : p)));

  const submit = async () => {
    const need = [!draft.kind && t('kind'), !draft.place && t('where'), !draft.what_happened.trim() && t('whatNeeded')]
      .filter(Boolean);
    if (need.length) {
      setMissing(need.join(' · '));
      return;
    }
    setMissing('');
    const original = report ? fromReport(report).spot : null;
    const spotChanged = JSON.stringify(original) !== JSON.stringify(draft.spot);
    const payload: IncidentWrite = {
      occurred_at: new Date(draft.occurred_local).toISOString(),
      kind: draft.kind as IncidentKind,
      place: draft.place as IncidentPlace,
      place_detail: draft.place_detail.trim(),
      people: draft.people.filter((p) => p.name.trim() || p.contact.trim() || draft.people.length === 1),
      what_happened: draft.what_happened.trim(),
      injuries: draft.injuries.trim(),
      first_aid: draft.first_aid,
      called_911: draft.called_911,
      witnesses: draft.witnesses.trim(),
      cameras: draft.cameras.trim(),
      follow_up: draft.follow_up.trim(),
      ...(report ? (spotChanged ? { map: draft.spot } : {}) : { map: draft.spot }),
    };
    try {
      await onSubmit(payload, photos);
      void markPhotosUsed(photos, USED_WHERE);
    } catch {
      // The page shows the error in its slot.
    }
  };

  const text = (key: keyof Draft, label: string, extra: Record<string, unknown> = {}) => (
    <TextField
      label={label}
      value={draft[key] as string}
      onChange={(e) => set(key, e.target.value as Draft[typeof key])}
      fullWidth
      slotProps={{ htmlInput: { 'data-testid': `incident-${String(key)}`, maxLength: 3000 } }}
      {...extra}
    />
  );

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} fullScreen={phone} fullWidth maxWidth="sm"
      data-testid="incident-form">
      <DialogTitle sx={{ fontWeight: 800 }}>{report ? t('editTitle') : t('report')}</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '8px !important' }}>
        <TextField
          type="datetime-local"
          label={t('when')}
          value={draft.occurred_local}
          onChange={(e) => set('occurred_local', e.target.value)}
          slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: localNow(), 'data-testid': 'incident-when' } }}
          fullWidth
        />
        <TextField select label={t('kind')} value={draft.kind} onChange={(e) => set('kind', e.target.value as IncidentKind)}
          fullWidth required slotProps={{ htmlInput: { 'data-testid': 'incident-kind' } }}>
          {KINDS.map((k) => <MenuItem key={k} value={k}>{pick(KIND_COPY[k])}</MenuItem>)}
        </TextField>
        <TextField select label={t('where')} value={draft.place} onChange={(e) => set('place', e.target.value as IncidentPlace)}
          fullWidth required slotProps={{ htmlInput: { 'data-testid': 'incident-place' } }}>
          {PLACES.map((p) => <MenuItem key={p} value={p}>{pick(PLACE_COPY[p])}</MenuItem>)}
        </TextField>
        {text('place_detail', t('whereDetail'), { slotProps: { htmlInput: { maxLength: 200, 'data-testid': 'incident-place_detail' } } })}
        {/* One fixed-height row: marking the spot swaps its words, nothing below moves. */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minHeight: 40 }}>
          {draft.spot ? (
            <>
              <PlaceRounded sx={{ color: '#dc2626' }} fontSize="small" />
              <Typography variant="body2" sx={{ flex: 1, fontWeight: 600 }} data-testid="incident-spot-marked">{t('spotMarked')}</Typography>
              <Button size="small" onClick={() => setPicking(true)}>{t('change')}</Button>
              <Button size="small" color="inherit" onClick={() => set('spot', null)}>{t('remove')}</Button>
            </>
          ) : (
            <Button variant="outlined" startIcon={<PlaceRounded />} onClick={() => setPicking(true)} data-testid="incident-mark-map">
              {t('markMap')}
            </Button>
          )}
        </Box>

        <Typography sx={{ fontWeight: 700, mt: 1 }}>{t('who')}</Typography>
        {draft.people.map((person, index) => (
          <Stack key={index} spacing={1} sx={{ p: 1.5, border: 1, borderColor: 'divider', borderRadius: 1 }}>
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
              <TextField select size="small" value={person.role} sx={{ flex: 1 }}
                onChange={(e) => setPerson(index, { role: e.target.value as IncidentRole })}
                slotProps={{ htmlInput: { 'aria-label': t('who'), 'data-testid': `incident-person-role-${index}` } }}>
                {ROLES.map((r) => <MenuItem key={r} value={r}>{pick(ROLE_COPY[r])}</MenuItem>)}
              </TextField>
              {/* The X keeps its room on the first row too, so the rows line up. */}
              <IconButton aria-label={t('removePerson')} disabled={draft.people.length === 1}
                sx={{ visibility: draft.people.length === 1 ? 'hidden' : 'visible' }}
                onClick={() => set('people', draft.people.filter((_, i) => i !== index))}>
                <CloseRounded fontSize="small" />
              </IconButton>
            </Box>
            <TextField size="small" label={t('name')} value={person.name}
              onChange={(e) => setPerson(index, { name: e.target.value })} slotProps={{ htmlInput: { maxLength: 120 } }} />
            <TextField size="small" label={t('contact')} value={person.contact}
              onChange={(e) => setPerson(index, { contact: e.target.value })} slotProps={{ htmlInput: { maxLength: 200 } }} />
          </Stack>
        ))}
        <Box>
          <Button startIcon={<PersonAddAlt1Rounded />} disabled={draft.people.length >= 20}
            onClick={() => set('people', [...draft.people, { role: 'customer', name: '', contact: '' }])}>
            {t('addPerson')}
          </Button>
        </Box>

        {text('what_happened', t('what'), { multiline: true, minRows: 4, required: true,
          slotProps: { htmlInput: { maxLength: 6000, 'data-testid': 'incident-what_happened' } } })}
        {text('injuries', t('injuries'), { multiline: true, minRows: 2 })}
        <Box sx={{ display: 'flex', flexWrap: 'wrap', columnGap: 2 }}>
          <FormControlLabel label={t('firstAid')}
            control={<Checkbox checked={draft.first_aid} onChange={(e) => set('first_aid', e.target.checked)} />} />
          <FormControlLabel label={t('called911')}
            control={<Checkbox checked={draft.called_911} onChange={(e) => set('called_911', e.target.checked)} />} />
        </Box>
        {text('witnesses', t('witnesses'), { multiline: true, minRows: 2 })}
        {text('cameras', t('cameras'), { slotProps: { htmlInput: { maxLength: 300, 'data-testid': 'incident-cameras' } } })}

        {!report ? (
          <>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
              <AddPhoto multiple max={MAX_PHOTOS - photos.length} disabled={photos.length >= MAX_PHOTOS}
                label={t('addPhoto')} usedWhere={USED_WHERE} usedOn="save" fileInputTestId="incident-photo"
                onPhotos={(picked) => setPhotos((current) => [...current, ...picked].slice(0, MAX_PHOTOS))} />
              <Typography sx={{ fontSize: 12.5, color: 'text.secondary' }}>{t('photosHint')}</Typography>
            </Box>
            <PickedPhotos photos={photos} disabled={busy}
              onRemove={(index) => setPhotos((current) => current.filter((_, i) => i !== index))}
              onChange={(index, file) => setPhotos((current) => current.map((old, i) => (i === index ? file : old)))} />
          </>
        ) : null}

        {text('follow_up', t('followUp'), { multiline: true, minRows: 2 })}
      </DialogContent>
      {/* The message slot keeps its height whether or not there is a message. */}
      <Box sx={{ px: 3, pt: 1, minHeight: 44, display: 'flex', alignItems: 'center' }}>
        {missing || error ? (
          <Alert severity="error" sx={{ py: 0, width: '100%' }} data-testid="incident-form-error">{missing || error}</Alert>
        ) : null}
      </Box>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={busy}>{t('cancel')}</Button>
        <Button variant="contained" color="error" onClick={() => void submit()} disabled={busy} data-testid="incident-send">
          {busy ? t('saving') : report ? t('saveEdit') : t('save')}
        </Button>
      </DialogActions>
      <IncidentSpotPicker open={picking} value={draft.spot} onClose={() => setPicking(false)}
        onPick={(spot) => set('spot', spot)} />
    </Dialog>
  );
}
