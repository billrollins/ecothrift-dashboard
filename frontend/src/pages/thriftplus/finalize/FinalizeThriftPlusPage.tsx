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
import { pendingName } from '../../../components/pos/ThriftPlusPendingFind';
import SelfieCheck, { NO_CHECKS, checksDone, type FaceChecks } from '../../../components/thriftplus/SelfieCheck';
import AddPersonPanel from '../../../components/thriftplus/AddPersonPanel';
import { compressImageToJpeg } from '../../../services/receiving/receivingClient';
import { thriftCardCode } from '../../../utils/thriftPlusCard';
import { isStandalone } from '../scanner/installApp';
import { useQrCamera } from '../scanner/useQrCamera';
import { JoinQrDialog, TermsDialog, useStayOnPage } from './finalizeParts';
import { PersonCard, PersonSheet } from './finalizePeople';
import { useAuth } from '../../../contexts/AuthContext';
import ThriftSignaturePad, { type ThriftSignaturePadHandle } from './ThriftSignaturePad';

/** J5: the words the customer signs under. The terms open in a popup here, never a link (J13). */
export const SIGNATURE_WORDS = 'I agree to the Thrift+ terms and photo release. I can read them at ecothrift.us/terms.';

/**
 * `verify`: the one screen for a selfie and a signature from the app (Join v2, owner 2026-10-19). Otherwise the store
 * phone takes them: the ID, a photo and the signature. No phone number is asked here since Join v2 (it is optional).
 */
type Step = 'find' | 'verify' | 'done' | 'add';

/** The numbered steps of the store-phone path (the selfie path is one screen, unnumbered). */
const STEP_NUMBER: Partial<Record<Step, number>> = { find: 1, verify: 2 };
const STEPS = 2;

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
 * email), the photo ID (seen, never kept, J3), a photo (J4), and the customer's signature under the J5 words. Then the
 * membership is ready (J2). No sale here, so it works on any register, training too.
 *
 * Join v2 (owner 2026-10-19, "SMOOTH and CLEAR and SIMPLE"): someone who took a selfie and signed in the app gets one
 * screen: their selfie, "Check their photo ID" (Name matches, Face matches the selfie, 18 or older) and Verified. The
 * phone number is no longer asked here (optional on the server).
 *
 * Owner 2026-10-16 (J13): a home-screen app on the store phones, full screen. The Join QR shows a customer who hasn't
 * joined; the terms open in a popup; Back, a swipe, a pull-down or a long press can't take a customer off the page.
 *
 * Owner 2026-10-16: it is the Finalize tab of the Thrift+ Staff app (/staff/finalize, StaffApp.tsx), which owns the
 * page head (the staff manifest). `onMidway` tells the app when someone is part way through, so it hides its bottom bar
 * and a customer holding the phone can't open another tab.
 */
export default function FinalizeThriftPlusPage({ onMidway }: { onMidway?: (midway: boolean) => void } = {}) {
  const [step, setStep] = useState<Step>('find');
  const [person, setPerson] = useState<ThriftPendingPerson | null>(null);
  const [scanning, setScanning] = useState(false);
  const [q, setQ] = useState('');
  const [people, setPeople] = useState<ThriftPendingPerson[] | null>(null);
  const [searched, setSearched] = useState('');
  const [findNote, setFindNote] = useState('');
  const [finding, setFinding] = useState(false);
  const [checks, setChecks] = useState<FaceChecks>(NO_CHECKS);
  const [newSelfie, setNewSelfie] = useState<Blob | null>(null);
  const [signed, setSigned] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [joinQr, setJoinQr] = useState(false);
  const [terms, setTerms] = useState(false);
  const [info, setInfo] = useState<ThriftPendingPerson | null>(null);
  const [added, setAdded] = useState('');
  const { user } = useAuth();
  const navigate = useNavigate();
  const pad = useRef<ThriftSignaturePadHandle | null>(null);
  const lastScan = useRef('');

  const midway = step !== 'find' && step !== 'done';
  useStayOnPage({
    // The phone's Back closes a popup, or does nothing: the on-screen Back moves between steps.
    onBack: () => {
      setJoinQr(false);
      setTerms(false);
      setInfo(null);
    },
    midway,
  });
  useEffect(() => {
    onMidway?.(midway);
  }, [midway, onMidway]);
  // Leaving the tab never leaves the app's bar hidden.
  useEffect(() => () => onMidway?.(false), [onMidway]);

  async function search(query: string) {
    setFinding(true);
    setFindNote('');
    try {
      // Nothing typed: the newest 50 online joins, finished ones too (owner 2026-10-16).
      const found = await findPendingOrMember(query.trim(), { recent: true });
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

  function pick(p: ThriftPendingPerson) {
    setPerson(p);
    setScanning(false);
    setStep('verify');
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

  async function send(body: Parameters<typeof finishThriftJoin>[0]) {
    setBusy(true);
    setError('');
    try {
      await finishThriftJoin(body);
      setStep('done');
    } catch (err) {
      setError(thriftErrorMessage(err, 'Could not finish. Check the connection and try again.'));
    } finally {
      setBusy(false);
    }
  }

  /**
   * Done (owner 2026-10-19): the photo ID checked against their photo. A retaken photo replaces it; with no photo on
   * file one is taken here; the signature is taken here only when they didn't sign in the app.
   */
  async function verified() {
    if (!person || !checksDone(checks) || !(person.photo_url || newSelfie)) return;
    let signature: Blob | null | undefined = null;
    if (!person.signed) {
      signature = await pad.current?.toBlob();
      if (!signature) {
        setError('The signature did not save. Clear it and sign again.');
        return;
      }
    }
    await send({
      person: person.person_id, id_checked: true, face_matches: true, verified_18: checks.over18, finalize: true,
      ...(newSelfie ? { photo: newSelfie } : {}),
      ...(signature ? { signature } : {}),
    });
  }

  async function onRetake(file: File) {
    setNewSelfie(await smallPhoto(file));
  }

  function startOver() {
    setStep('find');
    setPerson(null);
    setScanning(false);
    setQ('');
    setFindNote('');
    setChecks(NO_CHECKS);
    setNewSelfie(null);
    setSigned(false);
    setAdded('');
    setError('');
    lastScan.current = '';
    void search('');
  }

  const back: Partial<Record<Step, Step>> = { verify: 'find', add: 'done' };
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
              if (back[step] === 'find') startOver();
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
      {step === 'find' ? (
        <Stack spacing={2}>
          <Typography color="text.secondary">
            For someone who joined online: scan their member QR, then check their photo ID.
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
                    spacing={0.75}
                    data-testid="finalize-people"
                    sx={{ maxHeight: '58dvh', overflowY: 'auto', overscrollBehavior: 'contain', pr: 0.5, py: 0.5 }}
                  >
                    {people.map((p) => <PersonCard key={p.person_id} person={p} onOpen={() => setInfo(p)} />)}
                  </Stack>
                </Box>
              ) : null}
            </>
          )}
        </Stack>
      ) : null}

      {/* One screen for everyone (owner 2026-10-19): their photo, the ID check, the signature only if not signed in the app. */}
      {step === 'verify' && person ? (
        <Box data-testid="finalize-verify">
          <SelfieCheck person={person} checks={checks} onChecks={setChecks} retake={newSelfie} onRetake={(f) => void onRetake(f)} disabled={busy}>
            {person.signed ? (
              <Alert severity="success" data-testid="finalize-signed">Signed the terms in the app.</Alert>
            ) : (
              <Stack spacing={1.5} data-testid="finalize-sign">
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
              </Stack>
            )}
            {error ? <Alert severity="error" data-testid="finalize-error">{error}</Alert> : null}
            <Button
              variant="contained"
              size="large"
              color="success"
              disabled={!checksDone(checks) || !(person.photo_url || newSelfie) || (!person.signed && !signed) || busy}
              onClick={() => void verified()}
              sx={{ ...big, minHeight: 72, fontSize: '1.3rem' }}
              data-testid="finalize-done-button"
            >
              {busy ? <CircularProgress size={26} color="inherit" /> : 'Done'}
            </Button>
            {!(person.photo_url || newSelfie) ? (
              <Typography variant="body2" color="text.secondary" textAlign="center">Take their photo first.</Typography>
            ) : !person.signed && !signed ? (
              <Typography variant="body2" color="text.secondary" textAlign="center">They sign first.</Typography>
            ) : null}
          </SelfieCheck>
        </Box>
      ) : null}

      {step === 'done' ? (
        <Stack spacing={2} data-testid="finalize-done">
          <Alert severity="success" sx={{ fontSize: '1.15rem', '& .MuiAlert-message': { width: '100%' } }}>
            <Typography fontWeight={800} fontSize="1.25rem">{`${person?.first_name ?? 'They'} is a Thrift+ member.`}</Typography>
            <Typography sx={{ mt: 0.5 }}>They show their member QR in the Thrift+ app at the register.</Typography>
          </Alert>
          {added ? <Alert severity="success" data-testid="finalize-added">{`${added} is on the membership.`}</Alert> : null}
          {person && !added ? (
            <Button variant="outlined" size="large" onClick={() => setStep('add')} sx={big} data-testid="finalize-add-person">
              Add a person
            </Button>
          ) : null}
          <Button variant="contained" size="large" onClick={startOver} sx={{ ...big, minHeight: 64 }}>
            Finalize another
          </Button>
          {joinButton}
        </Stack>
      ) : null}

      {step === 'add' && person ? (
        <AddPersonPanel
          accountId={person.account_id}
          mainFirstName={person.first_name}
          onAdded={(name) => {
            setAdded(name);
            setStep('done');
          }}
          onCancel={() => setStep('done')}
        />
      ) : null}

      <PersonSheet
        person={info}
        owner={Boolean(user?.is_superuser)}
        onClose={() => setInfo(null)}
        onFinish={pick}
        onDeleted={() => void search(searched)}
      />
      <JoinQrDialog open={joinQr} onClose={() => setJoinQr(false)} />
      <TermsDialog open={terms} onClose={() => setTerms(false)} />
    </Box>
  );
}
