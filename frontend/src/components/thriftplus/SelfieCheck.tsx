import PhotoCameraRounded from '@mui/icons-material/PhotoCameraRounded';
import { Box, Button, Checkbox, FormControlLabel, Stack, Typography } from '@mui/material';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { ThriftPendingPerson } from '../../api/thriftplusRegister.api';

/**
 * Join v2 (owner 2026-10-19): a selfie and a signature from the app, so staff only check the photo ID against the
 * selfie and tap Verified (no phone, photo or signature at the register).
 */
export function readyToVerify(person: ThriftPendingPerson | null | undefined): boolean {
  return Boolean(person && person.status !== 'active' && person.selfie && person.signed);
}

/** What staff checked on the photo ID. */
export interface FaceChecks {
  name: boolean;
  face: boolean;
  over18: boolean;
}

export const NO_CHECKS: FaceChecks = { name: false, face: false, over18: false };

/** Verified needs the name and the face. 18+ is only for an ID that was checked (the IdCheckFields rule). */
export function checksDone(c: FaceChecks): boolean {
  return c.name && c.face;
}

function objectUrl(blob: Blob | null): string | null {
  if (!blob || typeof URL.createObjectURL !== 'function') return null;
  try {
    return URL.createObjectURL(blob);
  } catch {
    return null;
  }
}

const box = { border: 1, borderColor: 'divider', borderRadius: 2, m: 0, p: 1, minHeight: 60 } as const;

function BigCheck({ label, checked, disabled, onChange }: {
  label: string; checked: boolean; disabled?: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <FormControlLabel
      sx={box}
      control={
        <Checkbox
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          sx={{ '& .MuiSvgIcon-root': { fontSize: 32 } }}
        />
      }
      label={<Typography fontWeight={700} fontSize="1.1rem">{label}</Typography>}
    />
  );
}

/**
 * The one screen for someone who took a selfie and signed in the app (owner 2026-10-19): their selfie big, their name
 * big, how they joined small, then "Check their photo ID" with Name matches, Face matches the selfie and 18 or older.
 * A bad selfie: Retake photo (the new photo replaces the selfie when they are verified). Used by Finalize on the store
 * phone and by the register's Finish joining. The parent shows the Verified button (Finalize passes it as children).
 */
export default function SelfieCheck({
  person, checks, onChecks, retake, onRetake, disabled = false, capture = 'environment', imageMaxHeight = 360, children,
}: {
  person: ThriftPendingPerson;
  /** Shown above Retake photo: Finalize's Verified button and any message. */
  children?: ReactNode;
  checks: FaceChecks;
  onChecks: (c: FaceChecks) => void;
  /** A new photo taken here, shown in place of the selfie. */
  retake: Blob | null;
  onRetake: (file: File) => void;
  disabled?: boolean;
  /** The store phone points its back camera at the customer; the register uses its own camera. */
  capture?: 'environment' | 'user';
  imageMaxHeight?: number;
}) {
  const input = useRef<HTMLInputElement | null>(null);
  const [retakeUrl, setRetakeUrl] = useState<string | null>(null);
  useEffect(() => {
    const url = objectUrl(retake);
    setRetakeUrl(url);
    return () => {
      if (url && typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(url);
    };
  }, [retake]);

  // A retaken photo always replaces the selfie on screen (a note when the browser can't show it).
  const src = retake ? retakeUrl : person.photo_url ?? null;
  const name = `${person.first_name} ${person.last_name}`.trim();
  const contact = person.contact || person.email;
  // 18+ goes with a checked ID: it waits for the name and the face, and clears when either is unchecked.
  const idDone = checksDone(checks);
  const set = (next: Partial<FaceChecks>) => {
    const c = { ...checks, ...next };
    onChecks(checksDone(c) ? c : { ...c, over18: false });
  };

  return (
    <Stack spacing={1.5} data-testid="selfie-check">
      {src ? (
        <Box
          component="img"
          src={src}
          alt={retake ? 'The new photo' : `${name}'s selfie`}
          draggable={false}
          data-testid="selfie-check-photo"
          sx={{ width: '100%', maxHeight: imageMaxHeight, objectFit: 'contain', borderRadius: 3, bgcolor: 'action.hover', display: 'block' }}
        />
      ) : (
        <Box sx={{ p: 3, borderRadius: 3, bgcolor: 'action.hover', textAlign: 'center' }}>
          <Typography color="text.secondary">{retake ? 'New photo taken.' : 'No photo yet. Take their photo below.'}</Typography>
        </Box>
      )}
      <Box>
        <Typography variant="h4" fontWeight={800} sx={{ overflowWrap: 'anywhere', lineHeight: 1.15 }} data-testid="selfie-check-name">
          {name}
        </Typography>
        {contact ? <Typography variant="body2" color="text.secondary">{contact}</Typography> : null}
      </Box>
      <Typography variant="h6" fontWeight={800}>Check their photo ID</Typography>
      <BigCheck label="Name matches" checked={checks.name} disabled={disabled} onChange={(v) => set({ name: v })} />
      <BigCheck label="Face matches the photo" checked={checks.face} disabled={disabled} onChange={(v) => set({ face: v })} />
      <BigCheck label="18 or older" checked={checks.over18} disabled={disabled || !idDone} onChange={(v) => set({ over18: v })} />
      <Typography variant="body2" color="text.secondary">Never scan or keep the ID itself.</Typography>
      {children}
      <input
        ref={input}
        hidden
        type="file"
        accept="image/*"
        capture={capture}
        data-testid="selfie-check-retake-input"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onRetake(file);
          e.target.value = '';
        }}
      />
      <Button
        size={src || retake ? 'small' : 'large'}
        variant={src || retake ? 'text' : 'contained'}
        startIcon={<PhotoCameraRounded />}
        disabled={disabled}
        onClick={() => input.current?.click()}
        sx={{ alignSelf: src || retake ? 'center' : 'stretch', minHeight: src || retake ? 44 : 64 }}
        data-testid="selfie-check-retake"
      >
        {src || retake ? 'Retake photo' : 'Take their photo'}
      </Button>
    </Stack>
  );
}
