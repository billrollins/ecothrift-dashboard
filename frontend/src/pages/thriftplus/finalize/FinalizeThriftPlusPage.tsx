import ArrowBackRounded from '@mui/icons-material/ArrowBackRounded';
import DescriptionRounded from '@mui/icons-material/DescriptionRounded';
import PhotoCameraRounded from '@mui/icons-material/PhotoCameraRounded';
import QrCode2Rounded from '@mui/icons-material/QrCode2Rounded';
import QrCodeScannerRounded from '@mui/icons-material/QrCodeScannerRounded';
import RefreshRounded from '@mui/icons-material/RefreshRounded';
import SearchRounded from '@mui/icons-material/SearchRounded';
import {
  Alert,
  Box,
  Button,
  ButtonBase,
  Checkbox,
  CircularProgress,
  FormControlLabel,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { format, parseISO } from 'date-fns';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  finishThriftJoin,
  findPendingOrMember,
  thriftErrorMessage,
  type ThriftCodeMember,
  type ThriftPendingPerson,
} from '../../../api/thriftplusRegister.api';
import { phoneDigits, phoneReadBack } from '../../../components/pos/ThriftPlusFinishJoinDialog';
import { pendingName } from '../../../components/pos/ThriftPlusPendingFind';
import { compressImageToJpeg } from '../../../services/receiving/receivingClient';
import { thriftCardCode } from '../../../utils/thriftPlusCard';
import { isStandalone } from '../scanner/installApp';
import { useQrCamera } from '../scanner/useQrCamera';
import { JoinQrDialog, TermsDialog, useFinalizeAppHead, useStayOnPage } from './finalizeParts';
import ThriftSignaturePad, { type ThriftSignaturePadHandle } from './ThriftSignaturePad';

/** J5: the words the customer signs under. The terms open in a popup here, never a link (J13). */
export const SIGNATURE_WORDS = 'I agree to the Thrift+ terms and photo release. I can read them at ecothrift.us/terms.';

type Step = 'find' | 'phone' | 'readback' | 'id' | 'photo' | 'sign' | 'done';

/** The numbered steps after the member is found (the read-back belongs to the phone step). */
const STEP_NUMBER: Partial<Record<Step, number>> = { find: 1, phone: 2, readback: 2, id: 3, photo: 4, sign: 5 };
const STEPS = 5;

/** What the cashier hears when a scanned QR is no pending join. */
export function codeMemberMessage(member: ThriftCodeMember | undefined): string {
  if (!member || member.status === 'unknown') return "That QR isn't a Thrift+ member code we know. Search by name or email.";
  const name = member.first_name || 'They';
  if (member.status === 'active') return `${name} is already a Thrift+ member. Nothing to finalize: they can shop as a member now.`;
  return `${name}'s membership is not active. Ask a manager.`;
}

function joinedOn(iso: string): string {
  try {
    return format(parseISO(iso), 'MMM d, h:mm a');
  } catch {
    return '';
  }
}

const big = { minHeight: 56, fontSize: '1.1rem', fontWeight: 700, borderRadius: 2 } as const;

/** A phone photo, made small enough to send quickly (falls back to the original when the browser can't). */
async function smallPhoto(file: File): Promise<Blob> {
  try {
    return await compressImageToJpeg(file, 1280, 0.85);
  } catch {
    return file;
  }
}

function objectUrl(blob: Blob | null): string | null {
  if (!blob || typeof URL.createObjectURL !== 'function') return null;
  try {
    return URL.createObjectURL(blob);
  } catch {
    return null;
  }
}

/** The phone camera reading the member QR in the customer's Thrift+ app. */
function QrScan({ onCode, onClose, busy }: { onCode: (raw: string) => void; onClose: () => void; busy: boolean }) {
  const { videoRef, status, error, restart } = useQrCamera({ enabled: true, paused: busy, onDecode: (raw) => onCode(raw) });
  return (
    <Stack spacing={1.5}>
      <Box
        sx={{
          position: 'relative', width: '100%', aspectRatio: '1 / 1', bgcolor: '#000', borderRadius: 3, overflow: 'hidden',
        }}
      >
        <video
          ref={videoRef}
          playsInline
          muted
          data-testid="finalize-camera"
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
        <Box
          aria-hidden
          sx={{ position: 'absolute', inset: '18%', border: '3px solid rgba(255,255,255,0.85)', borderRadius: 3, pointerEvents: 'none' }}
        />
        {status === 'starting' || busy ? (
          <Box sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
            <CircularProgress sx={{ color: '#fff' }} />
          </Box>
        ) : null}
        {/* A black or stuck picture (owner 2026-10-16): tap it, or the round button, to start the camera again. */}
        {status === 'stalled' || status === 'resting' ? (
          <ButtonBase onClick={restart} sx={{ position: 'absolute', inset: 0, color: '#fff', flexDirection: 'column', gap: 1 }}>
            <RefreshRounded sx={{ fontSize: 56 }} />
            <Typography fontWeight={800} fontSize="1.2rem">Tap to restart the camera</Typography>
          </ButtonBase>
        ) : null}
        {status !== 'unsupported' ? (
          <ButtonBase
            onClick={restart}
            aria-label="Restart the camera"
            data-testid="finalize-camera-restart"
            sx={{ position: 'absolute', top: 10, right: 10, width: 40, height: 40, borderRadius: 99, bgcolor: 'rgba(0,0,0,0.5)', color: '#fff' }}
          >
            <RefreshRounded />
          </ButtonBase>
        ) : null}
      </Box>
      {status === 'blocked' || status === 'unsupported' ? (
        <Alert severity="warning">
          {status === 'unsupported' ? 'This phone has no camera the page can use.' : error || "The camera didn't start."}{' '}
          Search by name or email instead.
        </Alert>
      ) : (
        <Typography color="text.secondary">Point the camera at the member QR in their Thrift+ app.</Typography>
      )}
      <Button variant="outlined" size="large" onClick={onClose} sx={big}>
        Search by name or email instead
      </Button>
    </Stack>
  );
}

/**
 * Finalize Thrift+ (owner 2026-10-16): a cashier finishes a membership started online on a phone beside her, away
 * from the register, even with people in line. One step per screen: find the member (their member QR or a name or
 * email), the phone number read back, the photo ID (seen, never kept, J3), a photo (J4), and the customer's signature
 * under the J5 words. Then the membership is ready (J2). No sale here, so it works on any register, training too.
 *
 * Owner 2026-10-16 (J13): a home-screen app on the store phones, full screen. The Join QR shows a customer who hasn't
 * joined; the terms open in a popup; Back, a swipe, a pull-down or a long press can't take a customer off the page.
 */
export default function FinalizeThriftPlusPage() {
  const [step, setStep] = useState<Step>('find');
  const [person, setPerson] = useState<ThriftPendingPerson | null>(null);
  const [scanning, setScanning] = useState(false);
  const [q, setQ] = useState('');
  const [people, setPeople] = useState<ThriftPendingPerson[] | null>(null);
  const [searched, setSearched] = useState('');
  const [findNote, setFindNote] = useState('');
  const [finding, setFinding] = useState(false);
  const [phone, setPhone] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [idChecked, setIdChecked] = useState(false);
  const [over18, setOver18] = useState(false);
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [signed, setSigned] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [joinQr, setJoinQr] = useState(false);
  const [terms, setTerms] = useState(false);
  const navigate = useNavigate();
  const pad = useRef<ThriftSignaturePadHandle | null>(null);
  const photoInput = useRef<HTMLInputElement | null>(null);
  const lastScan = useRef('');
  const digits = phoneDigits(phone);

  useFinalizeAppHead();
  useStayOnPage({
    // The phone's Back closes a popup, or does nothing: the on-screen Back moves between steps.
    onBack: () => {
      setJoinQr(false);
      setTerms(false);
    },
    midway: step !== 'find' && step !== 'done',
  });

  async function search(query: string) {
    setFinding(true);
    setFindNote('');
    try {
      // Nothing typed: the newest 50 online joins, finished ones too (owner 2026-10-16).
      const found = await findPendingOrMember(query.trim(), { recent: !query.trim() });
      setPeople(found.people);
      setSearched(query.trim());
    } catch (err) {
      setFindNote(thriftErrorMessage(err, 'Could not search. Try again.'));
    } finally {
      setFinding(false);
    }
  }

  // The newest joins, before anything is typed: often the person in front of you.
  useEffect(() => {
    void search('');
    // Once, when the page opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => () => {
    if (photoUrl && typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(photoUrl);
  }, [photoUrl]);

  function pick(p: ThriftPendingPerson) {
    setPerson(p);
    setScanning(false);
    setStep('phone');
  }

  async function onScan(raw: string) {
    const code = thriftCardCode(raw, true);
    if (!code) {
      setFindNote("That's not a member QR. Scan the QR in their Thrift+ app.");
      return;
    }
    if (finding || code === lastScan.current) return;
    lastScan.current = code;
    setFinding(true);
    setFindNote('');
    try {
      const found = await findPendingOrMember(`TP${code}`);
      if (found.people.length > 0) {
        pick(found.people[0]);
      } else {
        setScanning(false);
        setFindNote(codeMemberMessage(found.member));
      }
    } catch (err) {
      setFindNote(thriftErrorMessage(err, 'Could not look that up. Try again.'));
    } finally {
      setFinding(false);
      // The same QR can be read again after a moment (a second try after a network error).
      window.setTimeout(() => {
        if (lastScan.current === code) lastScan.current = '';
      }, 2500);
    }
  }

  async function onPhoto(file: File | null) {
    if (!file) return;
    setPhotoBusy(true);
    try {
      const small = await smallPhoto(file);
      setPhoto(small);
      setPhotoUrl(objectUrl(small));
    } finally {
      setPhotoBusy(false);
    }
  }

  function retake() {
    setPhoto(null);
    setPhotoUrl(null);
    if (photoInput.current) {
      photoInput.current.value = '';
      photoInput.current.click();
    }
  }

  async function finish() {
    if (!person || !digits || !idChecked || !signed) return;
    setBusy(true);
    setError('');
    try {
      const signature = await pad.current?.toBlob();
      if (!signature) {
        setError('The signature did not save. Clear it and sign again.');
        return;
      }
      await finishThriftJoin({
        person: person.person_id, phone: digits, id_checked: true, verified_18: over18, photo, signature, finalize: true,
      });
      setStep('done');
    } catch (err) {
      const code = (err as { response?: { data?: { code?: string } } })?.response?.data?.code;
      if (code === 'PHONE_TAKEN' || code === 'PHONE_BAD') {
        setPhoneError(thriftErrorMessage(err));
        setStep('phone');
      } else if (code === 'NOT_PENDING' || code === 'MEMBER_UNKNOWN' || code === 'CARD_NOT_ACTIVE') {
        setError(thriftErrorMessage(err));
      } else {
        setError(thriftErrorMessage(err, 'Could not finish. Check the connection and try again.'));
      }
    } finally {
      setBusy(false);
    }
  }

  function startOver() {
    setStep('find');
    setPerson(null);
    setScanning(false);
    setQ('');
    setFindNote('');
    setPhone('');
    setPhoneError('');
    setIdChecked(false);
    setOver18(false);
    setPhoto(null);
    setPhotoUrl(null);
    setSigned(false);
    setError('');
    lastScan.current = '';
    void search('');
  }

  const back: Partial<Record<Step, Step>> = { phone: 'find', readback: 'phone', id: 'readback', photo: 'id', sign: 'photo' };
  const number = STEP_NUMBER[step];
  const joinButton = (
    <Button variant="outlined" size="large" startIcon={<QrCode2Rounded />} onClick={() => setJoinQr(true)} sx={big} data-testid="finalize-show-join">
      Not joined yet? Show the Join QR
    </Button>
  );

  return (
    <Box
      data-testid="finalize-thriftplus"
      sx={{
        maxWidth: 560, mx: 'auto', px: 2, pt: 'calc(env(safe-area-inset-top, 0px) + 16px)', pb: 'calc(env(safe-area-inset-bottom, 0px) + 48px)',
        minHeight: '100dvh',
        // A long press opens no menu and selects nothing (typing still works).
        userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none',
        '& input, & textarea': { userSelect: 'text', WebkitUserSelect: 'text' },
      }}
    >
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
        {back[step] && !busy ? (
          <Button
            startIcon={<ArrowBackRounded />}
            onClick={() => {
              setError('');
              if (step === 'phone') startOver();
              else setStep(back[step]!);
            }}
            sx={{ minHeight: 44 }}
          >
            Back
          </Button>
        ) : null}
        <Typography variant="h5" fontWeight={800} sx={{ flex: 1 }}>Finalize Thrift+</Typography>
        {number ? <Typography color="text.secondary" fontWeight={700}>{`${number} of ${STEPS}`}</Typography> : null}
        {/* In a browser tab (not the home-screen app), the way back to Dash: only before anyone is picked. */}
        {step === 'find' && !isStandalone() ? (
          <Button size="small" onClick={() => navigate('/dashboard')} sx={{ minHeight: 44 }}>Dash</Button>
        ) : null}
      </Stack>
      {person && step !== 'find' && step !== 'done' ? (
        <Box sx={{ mb: 2, p: 1.5, borderRadius: 2, bgcolor: 'action.hover' }} data-testid="finalize-person">
          <Typography fontWeight={800} fontSize="1.15rem">{pendingName(person)}</Typography>
          {person.email ? <Typography variant="body2" color="text.secondary">{person.email}</Typography> : null}
        </Box>
      ) : null}

      {step === 'find' ? (
        <Stack spacing={2}>
          <Typography color="text.secondary">
            For someone who joined online. Check their photo ID and phone, and have them sign.
          </Typography>
          {findNote ? <Alert severity="info" data-testid="finalize-find-note">{findNote}</Alert> : null}
          {!scanning ? joinButton : null}
          {scanning ? (
            <QrScan busy={finding} onCode={(raw) => void onScan(raw)} onClose={() => setScanning(false)} />
          ) : (
            <>
              <Button
                variant="contained"
                size="large"
                startIcon={<QrCodeScannerRounded />}
                onClick={() => {
                  setFindNote('');
                  setScanning(true);
                }}
                sx={{ ...big, minHeight: 72 }}
              >
                Scan their member QR
              </Button>
              <Typography color="text.secondary" textAlign="center">or search by name or email</Typography>
              <Stack direction="row" spacing={1}>
                <TextField
                  label="Name or email"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void search(q);
                    }
                  }}
                  fullWidth
                  slotProps={{ htmlInput: { enterKeyHint: 'search', autoCapitalize: 'none' } }}
                />
                <Button variant="outlined" onClick={() => void search(q)} disabled={finding} aria-label="Find" sx={{ minWidth: 64 }}>
                  {finding ? <CircularProgress size={22} /> : <SearchRounded />}
                </Button>
              </Stack>
              {people && people.length === 0 ? (
                <Typography color="text.secondary">
                  {searched ? 'No one who joined online by that name or email.' : 'No one has joined online yet.'}
                </Typography>
              ) : null}
              {people && people.length > 0 ? (
                <Box>
                  {!searched ? (
                    <Typography variant="overline" color="text.secondary" component="div">
                      {`Joined online, newest first · ${people.filter((p) => p.status !== 'active').length} to finish`}
                    </Typography>
                  ) : null}
                  {/* The newest 50, in their own scrolling box (owner 2026-10-16); a finished one is shown, not picked. */}
                  <Stack
                    spacing={1}
                    data-testid="finalize-people"
                    sx={{ maxHeight: '58dvh', overflowY: 'auto', overscrollBehavior: 'contain', pr: 0.5, py: 0.5 }}
                  >
                    {people.map((p) => {
                      const done = p.status === 'active';
                      return (
                        <ButtonBase
                          key={p.person_id}
                          onClick={() => pick(p)}
                          disabled={done}
                          data-testid={done ? 'finalize-person-done' : 'finalize-person-pending'}
                          sx={{
                            display: 'flex', alignItems: 'center', gap: 1, textAlign: 'left', p: 2, borderRadius: 2, border: 1,
                            borderColor: 'divider', minHeight: 64, flexShrink: 0, ...(done ? { bgcolor: 'action.hover', opacity: 0.75 } : {}),
                          }}
                        >
                          <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Typography fontWeight={800} fontSize="1.1rem">{pendingName(p)}</Typography>
                            <Typography variant="body2" color="text.secondary" noWrap>
                              {[p.email, p.joined_at ? `joined ${joinedOn(p.joined_at)}` : ''].filter(Boolean).join(' · ')}
                            </Typography>
                          </Box>
                          <Typography
                            variant="body2"
                            fontWeight={800}
                            sx={{ color: done ? 'success.main' : 'warning.dark', whiteSpace: 'nowrap' }}
                          >
                            {done ? 'Finished' : 'To finish'}
                          </Typography>
                        </ButtonBase>
                      );
                    })}
                  </Stack>
                </Box>
              ) : null}
            </>
          )}
        </Stack>
      ) : null}

      {step === 'phone' ? (
        <Stack spacing={2}>
          <Typography fontSize="1.1rem">Ask their phone number.</Typography>
          {phoneError ? <Alert severity="error" data-testid="finalize-phone-error">{phoneError}</Alert> : null}
          <TextField
            label="Phone number"
            type="tel"
            value={phone}
            autoFocus
            onChange={(e) => {
              setPhone(e.target.value);
              setPhoneError('');
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && digits) {
                e.preventDefault();
                setStep('readback');
              }
            }}
            helperText={phone && !digits ? 'The whole number: 10 digits.' : ' '}
            slotProps={{ htmlInput: { inputMode: 'tel', autoComplete: 'off', style: { fontSize: '1.4rem' } } }}
          />
          <Button variant="contained" size="large" disabled={!digits} onClick={() => setStep('readback')} sx={big}>
            Next
          </Button>
        </Stack>
      ) : null}

      {step === 'readback' ? (
        <Stack spacing={2} data-testid="finalize-readback">
          <Typography variant="h4" fontWeight={800}>{`${phoneReadBack(digits)} — read it back to them`}</Typography>
          <Typography color="text.secondary">Their phone finds them at the register from now on.</Typography>
          <Button variant="contained" size="large" onClick={() => setStep('id')} sx={big}>That&apos;s right</Button>
          <Button variant="outlined" size="large" onClick={() => setStep('phone')} sx={big}>Change it</Button>
        </Stack>
      ) : null}

      {step === 'id' ? (
        <Stack spacing={1.5}>
          <Typography fontSize="1.1rem">Look at their photo ID: the name, the face and the age.</Typography>
          <FormControlLabel
            sx={{ border: 1, borderColor: 'divider', borderRadius: 2, m: 0, p: 1, minHeight: 64 }}
            control={
              <Checkbox
                checked={idChecked}
                onChange={(e) => {
                  setIdChecked(e.target.checked);
                  if (!e.target.checked) setOver18(false);
                }}
                sx={{ '& .MuiSvgIcon-root': { fontSize: 32 } }}
              />
            }
            label={<Typography fontWeight={700} fontSize="1.1rem">I checked their photo ID</Typography>}
          />
          <FormControlLabel
            sx={{ border: 1, borderColor: 'divider', borderRadius: 2, m: 0, p: 1, minHeight: 64 }}
            control={
              <Checkbox
                checked={over18}
                disabled={!idChecked}
                onChange={(e) => setOver18(e.target.checked)}
                sx={{ '& .MuiSvgIcon-root': { fontSize: 32 } }}
              />
            }
            label={<Typography fontWeight={700} fontSize="1.1rem">The ID shows 18 or older</Typography>}
          />
          <Typography variant="body2" color="text.secondary">
            Never scan or keep the ID itself: only the name, phone, email, photo and the 18+ flag are stored.
          </Typography>
          <Button variant="contained" size="large" disabled={!idChecked} onClick={() => setStep('photo')} sx={big}>
            Next
          </Button>
        </Stack>
      ) : null}

      {step === 'photo' ? (
        <Stack spacing={2}>
          <Typography fontSize="1.1rem">Take their photo. Staff use it only to confirm it&apos;s them.</Typography>
          <input
            ref={photoInput}
            hidden
            type="file"
            accept="image/*"
            capture="environment"
            data-testid="finalize-photo-input"
            onChange={(e) => void onPhoto(e.target.files?.[0] ?? null)}
          />
          {photo ? (
            <>
              {photoUrl ? (
                <Box
                  component="img"
                  src={photoUrl}
                  alt="Their photo"
                  draggable={false}
                  sx={{ width: '100%', maxHeight: 360, objectFit: 'contain', borderRadius: 2, bgcolor: 'action.hover' }}
                />
              ) : (
                <Alert severity="success">Photo taken.</Alert>
              )}
              <Button variant="contained" size="large" onClick={() => setStep('sign')} sx={big}>Next</Button>
              <Button variant="outlined" size="large" startIcon={<PhotoCameraRounded />} onClick={retake} sx={big}>
                Retake
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="contained"
                size="large"
                startIcon={photoBusy ? <CircularProgress size={22} color="inherit" /> : <PhotoCameraRounded />}
                disabled={photoBusy}
                onClick={() => photoInput.current?.click()}
                sx={{ ...big, minHeight: 72 }}
              >
                Take their photo
              </Button>
              <Button size="large" onClick={() => setStep('sign')} sx={{ minHeight: 48 }}>
                No photo today
              </Button>
            </>
          )}
        </Stack>
      ) : null}

      {step === 'sign' ? (
        <Stack spacing={1.5}>
          <Typography fontWeight={700} color="text.secondary">Hand the phone to the customer to sign.</Typography>
          <Typography variant="h6" fontWeight={800} data-testid="finalize-sign-words">{SIGNATURE_WORDS}</Typography>
          <Button
            variant="outlined"
            size="large"
            startIcon={<DescriptionRounded />}
            onClick={() => setTerms(true)}
            disabled={busy}
            sx={big}
            data-testid="finalize-read-terms"
          >
            Read the terms
          </Button>
          <ThriftSignaturePad ref={pad} onInk={setSigned} disabled={busy} />
          {error ? <Alert severity="error" data-testid="finalize-error">{error}</Alert> : null}
          <Button
            variant="contained"
            size="large"
            color="success"
            disabled={!signed || busy}
            onClick={() => void finish()}
            sx={{ ...big, minHeight: 64 }}
          >
            {busy ? <CircularProgress size={26} color="inherit" /> : 'Finish'}
          </Button>
          {!signed ? <Typography variant="body2" color="text.secondary" textAlign="center">They sign first.</Typography> : null}
        </Stack>
      ) : null}

      {step === 'done' ? (
        <Stack spacing={2} data-testid="finalize-done">
          <Alert severity="success" sx={{ fontSize: '1.15rem', '& .MuiAlert-message': { width: '100%' } }}>
            <Typography fontWeight={800} fontSize="1.25rem">{`${person?.first_name ?? 'They'} is a Thrift+ member.`}</Typography>
            <Typography sx={{ mt: 0.5 }}>They can show their member QR or give their phone at the register.</Typography>
          </Alert>
          <Button variant="contained" size="large" onClick={startOver} sx={{ ...big, minHeight: 64 }}>
            Finalize another
          </Button>
          {joinButton}
        </Stack>
      ) : null}

      <JoinQrDialog open={joinQr} onClose={() => setJoinQr(false)} />
      <TermsDialog open={terms} onClose={() => setTerms(false)} />
    </Box>
  );
}
