/**
 * Finish joining (Join v2, owner 2026-10-19: "SMOOTH and CLEAR and SIMPLE"): right after a join's sign-in, and from the
 * Member QR's "Finish joining", a pending member does in the app what the register used to: a selfie, then a signature
 * on the terms. One screen per step, "Step 1 of 2". Then "You're all set": at the register staff only check the photo
 * ID against the selfie. Required (owner 2026-10-20): no skip and no ×; a pending member with steps left always lands
 * here. Only Sign out leaves it. The register can still take both (as today).
 * The server's member payload says what is left (`finish_steps`).
 */
import { useEffect, useRef, useState } from 'react';
import { Box, ButtonBase, CircularProgress } from '@mui/material';
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';
import FaceRounded from '@mui/icons-material/FaceRounded';
import type { FinishStep, ThriftPlusMember } from '../../../api/thriftPlusScanner.api';
import { compressImageToJpeg } from '../../../services/receiving/receivingClient';
import ThriftSignaturePad, { type ThriftSignaturePadHandle } from '../finalize/ThriftSignaturePad';
import ThriftPlusTermsText from '../../../components/thriftplus/ThriftPlusTermsText';
import { ErrorLine } from './signInParts';
import { sc, u } from './scannerTheme';
import { BigButton } from './tripUi';
import { useFinishJoining } from './useThriftPlus';
import SelfieCamera, { selfieCameraAvailable } from './SelfieCamera';

/** The terms' version, as the server records it (apps/thriftplus/services/register.py TERMS_VERSION). */
export const TERMS_VERSION = '2026-10-19'; // matches the server's register.TERMS_VERSION (the terms of 10-19, J17)

function words(e: unknown, fallback: string): string {
  return e instanceof Error && e.message ? e.message : fallback;
}

/**
 * The phone's photo, always redrawn as a JPEG at most 1280 px on its long side (quality 0.85): small to send, and never
 * HEIC, which the server refuses. Null when this browser can't read it.
 */
async function selfieJpeg(file: File): Promise<Blob | null> {
  try {
    return await compressImageToJpeg(file, 1280, 0.85);
  } catch {
    return null;
  }
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('read'));
    reader.readAsDataURL(blob);
  });
}

/** The photo on screen; null where the browser can't show a blob (it still sends). */
function usePreview(blob: Blob | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!blob || typeof URL.createObjectURL !== 'function') {
      setUrl(null);
      return undefined;
    }
    let made: string | null = null;
    try {
      made = URL.createObjectURL(blob);
    } catch {
      made = null;
    }
    setUrl(made);
    return () => {
      if (made) URL.revokeObjectURL(made);
    };
  }, [blob]);
  return url;
}

const heading = { m: 0, fontFamily: sc.condensed, fontWeight: 700, fontSize: u(56), color: sc.titleGreen, lineHeight: 1.1 } as const;
const line = { mt: u(12), fontSize: u(31), color: sc.ink2, lineHeight: 1.4 } as const;

export function FinishJoining({ member, onDone, onSignOut }: {
  member: ThriftPlusMember;
  /** "Done": the Member QR. */
  onDone: () => void;
  /** Sign out: the only way off this screen while steps are left. */
  onSignOut: () => void;
}) {
  const left: FinishStep[] = member.ready === false ? member.finish_steps ?? [] : [];
  // How many there were when the screen opened, so "Step 2 of 2" stays right as each one is done.
  const [total] = useState(() => left.length);
  const count = Math.max(total, left.length);
  const step = left[0] ?? null;
  const n = count - left.length + 1;

  return (
    <Box
      data-testid="finish-joining"
      sx={{
        position: 'absolute', inset: 0, zIndex: 40, display: 'flex', flexDirection: 'column', fontFamily: sc.font,
        background: `radial-gradient(ellipse at 50% 30%, ${sc.pageLight} 0%, ${sc.page} 70%)`,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: u(20), px: u(40), pt: `calc(env(safe-area-inset-top, 0px) + ${u(30)})`, pb: u(10), flexShrink: 0 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          {step && (
            <>
              <Box data-testid="finish-progress" sx={{ fontSize: u(28), fontWeight: 700, color: sc.greenDeep, letterSpacing: '0.04em' }}>
                Step {n} of {count}
              </Box>
              <Box aria-hidden sx={{ display: 'flex', gap: u(10), mt: u(10) }}>
                {Array.from({ length: count }, (_, i) => (
                  <Box key={i} sx={{ flex: 1, height: u(12), borderRadius: 99, bgcolor: i < n ? sc.green : sc.line }} />
                ))}
              </Box>
            </>
          )}
        </Box>
        {step && (
          <ButtonBase onClick={onSignOut} data-testid="finish-sign-out"
            sx={{ flexShrink: 0, px: u(16), minHeight: u(76), borderRadius: u(20), fontSize: u(28), fontWeight: 600, color: sc.ink2, textDecoration: 'underline' }}>
            Sign out
          </ButtonBase>
        )}
      </Box>
      <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', px: u(40), pt: u(24), pb: `calc(${u(44)} + env(safe-area-inset-bottom, 0px))` }}>
        {n === 1 && count === 2 && (
          <Box data-testid="finish-intro" sx={{ mb: u(26), p: u(24), borderRadius: u(24), bgcolor: sc.greenTint, color: sc.greenDeep, fontSize: u(29), lineHeight: 1.4, fontWeight: 600 }}>
            Two quick steps: 1. Selfie 2. Sign. Then show your QR at the register.
          </Box>
        )}
        {step === 'selfie' ? <SelfieStep key="selfie" /> : step === 'sign' ? <SignStep key="sign" /> : <AllSet onDone={onDone} />}
      </Box>
    </Box>
  );
}

/**
 * Step: the selfie. The front camera opens in the app with an oval to fit the face in (owner 2026-10-19: close enough
 * for staff to match it to the ID); where it can't open here, the phone's own camera.
 */
function SelfieStep() {
  const finish = useFinishJoining();
  const input = useRef<HTMLInputElement | null>(null);
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [err, setErr] = useState('');
  const [camera, setCamera] = useState(false);
  // The in-app camera failed once (blocked or unsupported): use the phone's own camera from then on.
  const [native, setNative] = useState(false);
  const preview = usePreview(photo);

  const openNative = () => {
    if (input.current) {
      input.current.value = ''; // the same photo again still counts as a new one
      input.current.click();
    }
  };

  const open = () => {
    setErr('');
    if (!native && selfieCameraAvailable()) setCamera(true);
    else openNative();
  };

  const use = async () => {
    if (!photo) return;
    setErr('');
    try {
      await finish.selfie.mutateAsync(photo);
    } catch (e) {
      setErr(words(e, 'Could not save your photo. Try again.'));
    }
  };

  return (
    <Box data-testid="finish-selfie">
      <Box component="h1" sx={heading}>Your selfie</Box>
      <Box sx={line}>So the cashier knows it's you.</Box>
      <input
        ref={input}
        hidden
        type="file"
        accept="image/*"
        capture="user"
        data-testid="selfie-input"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          void selfieJpeg(file).then((jpeg) => {
            if (jpeg) setPhoto(jpeg);
            else setErr("That photo didn't work. Take your selfie again.");
          });
        }}
      />
      {camera ? (
        <SelfieCamera
          onPhoto={(blob) => {
            setCamera(false);
            setPhoto(blob);
          }}
          onFail={() => {
            setCamera(false);
            setNative(true);
            setErr("The camera didn't open here. Tap Take my selfie to use your phone's camera.");
          }}
        />
      ) : (
      <>
      <Box
        sx={{
          mt: u(30), mx: 'auto', width: u(560), maxWidth: '100%', aspectRatio: '3 / 4', borderRadius: u(36), overflow: 'hidden',
          bgcolor: sc.card, border: `${u(3)} solid ${photo ? sc.green : sc.cardEdge}`, display: 'grid', placeItems: 'center', boxShadow: sc.tileShadow,
        }}
      >
        {preview ? (
          <Box component="img" src={preview} alt="Your selfie" draggable={false} sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        ) : photo ? (
          <Box sx={{ fontSize: u(32), fontWeight: 700, color: sc.greenDeep }}>Photo taken.</Box>
        ) : (
          <FaceRounded aria-hidden sx={{ fontSize: u(260), color: sc.greenWash }} />
        )}
      </Box>
      <Box data-testid="selfie-tip" sx={{ mt: u(22), textAlign: 'center', fontSize: u(30), color: sc.ink2 }}>
        Fit your face in the oval. No hat or sunglasses.
      </Box>
      {err && <ErrorLine sx={{ textAlign: 'center' }}>{err}</ErrorLine>}
      <Box sx={{ mt: u(30), display: 'flex', flexDirection: 'column', gap: u(18) }}>
        {photo ? (
          <>
            <BigButton primary onClick={() => void use()} disabled={finish.selfie.isPending} testId="selfie-use">
              {finish.selfie.isPending ? <CircularProgress size={22} sx={{ color: '#fff' }} /> : 'Use this photo'}
            </BigButton>
            <BigButton onClick={open} disabled={finish.selfie.isPending} testId="selfie-retake">Retake</BigButton>
          </>
        ) : (
          <BigButton primary onClick={open} testId="selfie-take">Take my selfie</BigButton>
        )}
      </Box>
      </>
      )}
    </Box>
  );
}

/** The terms, word for word (the same text Finalize shows), in a box that scrolls. */
function TermsBox() {
  return (
    <Box
      data-testid="finish-terms"
      tabIndex={0}
      role="region"
      aria-label="Thrift+ terms"
      sx={{
        mt: u(24), height: u(520), overflowY: 'auto', overscrollBehavior: 'contain', p: u(28), borderRadius: u(24),
        bgcolor: sc.card, border: `${u(3)} solid ${sc.cardEdge}`, color: sc.ink,
      }}
    >
      <ThriftPlusTermsText size={u(27)} gap={u(12)} muted={sc.ink2} />
    </Box>
  );
}

/** Step: read the terms, sign with a finger. */
function SignStep() {
  const finish = useFinishJoining();
  const pad = useRef<ThriftSignaturePadHandle | null>(null);
  const [inked, setInked] = useState(false);
  const [err, setErr] = useState('');

  const sign = async () => {
    setErr('');
    const png = await pad.current?.toBlob();
    if (!png) {
      setErr('The signature did not save. Clear it and sign again.');
      return;
    }
    try {
      const signature = await blobToDataUrl(png);
      await finish.sign.mutateAsync({ signature, termsVersion: TERMS_VERSION });
    } catch (e) {
      setErr(words(e, 'Could not save your signature. Try again.'));
    }
  };

  return (
    <Box data-testid="finish-sign">
      <Box component="h1" sx={heading}>Sign the terms</Box>
      <Box sx={line}>Read the Thrift+ terms, then sign with your finger.</Box>
      <TermsBox />
      <Box sx={{ mt: u(30), fontSize: u(28), fontWeight: 700, color: sc.ink }}>Your signature</Box>
      <Box sx={{ mt: u(12) }}>
        <ThriftSignaturePad ref={pad} onInk={setInked} disabled={finish.sign.isPending} />
      </Box>
      <Box sx={{ mt: u(8), fontSize: u(26), color: sc.ink2, lineHeight: 1.4 }}>By signing, you agree to the Thrift+ terms.</Box>
      {err && <ErrorLine>{err}</ErrorLine>}
      <Box sx={{ mt: u(30), display: 'flex' }}>
        <BigButton primary onClick={() => void sign()} disabled={!inked || finish.sign.isPending} testId="sign-submit">
          {finish.sign.isPending ? <CircularProgress size={22} sx={{ color: '#fff' }} /> : 'Sign'}
        </BigButton>
      </Box>
    </Box>
  );
}

/** Done: nothing left in the app; the register checks the photo ID. */
function AllSet({ onDone }: { onDone: () => void }) {
  return (
    <Box data-testid="finish-done" sx={{ textAlign: 'center', pt: u(60) }}>
      <CheckCircleRounded aria-hidden sx={{ fontSize: u(150), color: sc.green }} />
      <Box component="h1" sx={{ ...heading, mt: u(14) }}>You're all set</Box>
      <Box sx={{ ...line, fontSize: u(34), color: sc.ink }}>Show this QR at the register with your photo ID.</Box>
      <Box sx={{ mt: u(44), display: 'flex' }}>
        <BigButton primary onClick={onDone} testId="finish-done-button">Done</BigButton>
      </Box>
    </Box>
  );
}
