/**
 * Finish here (owner 2026-11-05, Dash Update #79; J8, J13, J19): a join on the customer's own phone that got stuck (their
 * app would not let them finish) is finished on the store phone. Staff have already confirmed the mobile number in person
 * (Edit name or phone). Then the phone goes to the customer: **they take their own selfie and tap I agree themselves**
 * (J5; staff never tap it for them). Their tap on I agree is what finishes it. No ID check (that is Assisted join's, J22).
 */
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';
import DescriptionRounded from '@mui/icons-material/DescriptionRounded';
import PhotoCameraRounded from '@mui/icons-material/PhotoCameraRounded';
import { Alert, Box, Button, CircularProgress, Stack, Typography } from '@mui/material';
import { useEffect, useRef, useState } from 'react';
import { finishInStore, thriftErrorMessage, type ThriftPendingPerson } from '../../../api/thriftplusRegister.api';
import { compressImageToJpeg } from '../../../services/receiving/receivingClient';
import { AGREE_WORDS, SIGNATURE_WORDS } from './finalizeParts';

const big = { minHeight: 56, fontSize: '1.1rem', fontWeight: 700, borderRadius: 2 } as const;

/** A stuck online join that may be finished here: not finished, not an Assisted join, both names and a confirmed phone. */
export function canFinishHere(p: ThriftPendingPerson): boolean {
  return p.status !== 'active' && !p.assisted && !!p.phone_verified && !!p.first_name.trim() && !!p.last_name.trim();
}

export default function StoreFinish({ person, onDone, onReadTerms, onBusy }: {
  person: ThriftPendingPerson;
  onDone: (p: ThriftPendingPerson) => void;
  onReadTerms: () => void;
  onBusy?: (busy: boolean) => void;
}) {
  const [selfie, setSelfie] = useState<Blob | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const input = useRef<HTMLInputElement | null>(null);
  // Always their own selfie, taken now (J5): a photo on file never stands in.
  const photo = preview;

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  async function take(file: File) {
    let blob: Blob = file;
    try {
      blob = await compressImageToJpeg(file, 1280, 0.85);
    } catch {
      blob = file;
    }
    setSelfie(blob);
    setPreview(URL.createObjectURL(blob));
    setError('');
  }

  /** The customer's own tap: it agrees and finishes in one. */
  async function agree() {
    if (!selfie || busy) return;
    setBusy(true);
    onBusy?.(true);
    setError('');
    try {
      onDone(await finishInStore(person.person_id, { photo: selfie, agree: true }));
    } catch (err) {
      setError(thriftErrorMessage(err, 'Could not finish. Check the connection and try again.'));
    } finally {
      setBusy(false);
      onBusy?.(false);
    }
  }

  return (
    <Stack spacing={2} data-testid="finalize-store-finish">
      <Alert severity="info" data-testid="store-finish-hand">
        <span>{`Phone ending ${person.phone_last4 ?? ''} is confirmed. Hand this phone to ${person.first_name}: they take their own selfie and tap I agree.`}</span>
      </Alert>

      <Typography variant="h6" fontWeight={800}>1. Your selfie</Typography>
      {photo ? (
        <Box component="img" src={photo} alt="Your selfie" draggable={false} data-testid="store-finish-photo"
          sx={{ width: 180, height: 180, objectFit: 'cover', borderRadius: 3, display: 'block', mx: 'auto' }} />
      ) : null}
      <Button
        variant={photo ? 'outlined' : 'contained'}
        size="large"
        startIcon={<PhotoCameraRounded />}
        disabled={busy}
        onClick={() => input.current?.click()}
        sx={big}
        data-testid="store-finish-take"
      >
        <span>{photo ? 'Take it again' : 'Take my selfie'}</span>
      </Button>
      <input
        ref={input}
        type="file"
        accept="image/*"
        capture="user"
        hidden
        data-testid="store-finish-input"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) void take(file);
        }}
      />

      <Typography variant="h6" fontWeight={800}>2. Agree to the terms</Typography>
      <Typography fontWeight={700} data-testid="store-finish-words">{SIGNATURE_WORDS}</Typography>
      <Button variant="outlined" size="large" startIcon={<DescriptionRounded />} onClick={onReadTerms} disabled={busy} sx={big}
        data-testid="store-finish-terms">
        Read the terms
      </Button>
      {error ? <Alert severity="error" data-testid="store-finish-error">{error}</Alert> : null}
      <Button
        variant="contained"
        color="success"
        size="large"
        startIcon={busy ? undefined : <CheckCircleRounded />}
        disabled={!photo || busy}
        onClick={() => void agree()}
        sx={{ minHeight: 72, fontSize: '1.15rem', fontWeight: 800, textTransform: 'none', borderRadius: 3 }}
        data-testid="store-finish-agree"
      >
        {busy ? <CircularProgress size={26} color="inherit" /> : <span>{AGREE_WORDS}</span>}
      </Button>
      {!photo ? (
        <Typography variant="body2" color="text.secondary" textAlign="center"><span>Take your selfie first.</span></Typography>
      ) : null}
    </Stack>
  );
}
