import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  FormControlLabel,
  LinearProgress,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import { useEffect, useState } from 'react';
import {
  getMyOnboarding,
  saveMyEmergencyContact,
  signMyHandbook,
  tickMyTask,
  type MyOnboarding,
} from '../../api/hiring.api';
import { ccTokens } from '../../theme';
import { Checklist, HandbookText, openHandbookPdf } from './onboardingUi';
import { dayText, errorText, shortDate } from './peopleUi';
import { SignaturePad } from './SignaturePad';

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Box sx={{ p: { xs: 2, sm: 2.5 }, mb: 2, borderRadius: ccTokens.r, border: `1px solid ${ccTokens.line}`, bgcolor: ccTokens.card }}>
      <Typography variant="h6" fontWeight={700} sx={{ mb: 1 }}>
        {title}
      </Typography>
      {children}
    </Box>
  );
}

function EmergencyContact({ data, onSaved }: { data: MyOnboarding; onSaved: (next: MyOnboarding) => void }) {
  const [name, setName] = useState(data.emergency_contact.name);
  const [phone, setPhone] = useState(data.emergency_contact.phone);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const saved = data.emergency_contact.name && data.emergency_contact.phone;
  return (
    <Card title="Emergency contact (ICE)">
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        Who should we call if something happens to you at work?
      </Typography>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
        <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} error={!!errors.name} helperText={errors.name} fullWidth />
        <TextField label="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} error={!!errors.phone} helperText={errors.phone}
          inputProps={{ inputMode: 'tel' }} fullWidth />
        <Button
          variant={saved ? 'outlined' : 'contained'}
          disabled={busy}
          sx={{ whiteSpace: 'nowrap', minWidth: 100 }}
          onClick={async () => {
            setBusy(true);
            setErrors({});
            try {
              onSaved((await saveMyEmergencyContact(name, phone)).data);
            } catch (err) {
              const body = (err as { response?: { data?: Record<string, string | string[]> } }).response?.data ?? {};
              setErrors(Object.fromEntries(Object.entries(body).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])));
            } finally {
              setBusy(false);
            }
          }}
        >
          {saved ? 'Update' : 'Save'}
        </Button>
      </Stack>
    </Card>
  );
}

function Handbook({ data, onSigned }: { data: MyOnboarding; onSigned: (next: MyOnboarding) => void }) {
  const { enqueueSnackbar } = useSnackbar();
  const book = data.handbook!;
  const [read, setRead] = useState(false);
  const [consent, setConsent] = useState(false);
  const [name, setName] = useState('');
  const [signature, setSignature] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  if (book.signed) {
    return (
      <Card title={`${book.title} (version ${book.version})`}>
        <Alert severity="success" action={
          <Button color="inherit" size="small" onClick={() => openHandbookPdf(book.signed!.id, (m) => enqueueSnackbar(m, { variant: 'error' }))}>
            Your copy
          </Button>
        }>
          Signed {shortDate(book.signed.signed_at)} by {book.signed.signer_name}.
        </Alert>
      </Card>
    );
  }

  async function sign() {
    const missing: Record<string, string> = {};
    if (!read) missing.acknowledged = 'Tick the box to say you read it.';
    if (!consent) missing.consent = 'Tick the box to sign electronically.';
    if (name.trim().length < 3) missing.name = 'Type your full legal name.';
    if (!signature) missing.signature = 'Sign in the box with your finger.';
    setErrors(missing);
    if (Object.keys(missing).length) return;
    setBusy(true);
    try {
      onSigned((await signMyHandbook({ name, signature, acknowledged: read, consent })).data);
      enqueueSnackbar('Handbook signed. Thank you!', { variant: 'success' });
    } catch (err) {
      const body = (err as { response?: { data?: Record<string, string | string[]> } }).response?.data ?? {};
      setErrors(Object.fromEntries(Object.entries(body).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Read and sign the handbook">
      <Box sx={{ maxHeight: 420, overflowY: 'auto', p: 2, mb: 2, borderRadius: '8px', bgcolor: '#fafaf7', border: `1px solid ${ccTokens.line}` }}>
        <HandbookText title={`${book.title} (version ${book.version})`} text={book.text} />
      </Box>
      <FormControlLabel control={<Checkbox checked={read} onChange={(e) => setRead(e.target.checked)} />} label={book.acknowledgment} />
      {errors.acknowledged && <Typography variant="caption" sx={{ color: '#a33027', display: 'block' }}>{errors.acknowledged}</Typography>}
      <FormControlLabel control={<Checkbox checked={consent} onChange={(e) => setConsent(e.target.checked)} />} label={book.consent} />
      {errors.consent && <Typography variant="caption" sx={{ color: '#a33027', display: 'block' }}>{errors.consent}</Typography>}
      <TextField label="Your full legal name" value={name} onChange={(e) => setName(e.target.value)} error={!!errors.name}
        helperText={errors.name} fullWidth sx={{ my: 2 }} />
      <SignaturePad
        error={errors.signature}
        onChange={(png) => {
          setSignature(png);
          if (png) setErrors((e) => ({ ...e, signature: '' }));
        }}
      />
      {errors.detail && <Alert severity="error" sx={{ mt: 2 }}>{errors.detail}</Alert>}
      <Button variant="contained" size="large" fullWidth sx={{ mt: 2 }} disabled={busy} onClick={sign}>
        {busy ? 'Signing…' : 'Sign the handbook'}
      </Button>
    </Card>
  );
}

/** My onboarding: the new hire's own checklist, the emergency contact, and the handbook to read and sign. */
export default function MyOnboardingPage() {
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const query = useQuery({ queryKey: ['hiring', 'my-onboarding'], queryFn: async () => (await getMyOnboarding()).data });
  const [busyId, setBusyId] = useState<number | null>(null);
  const [data, setData] = useState<MyOnboarding | null>(null);
  useEffect(() => {
    if (query.data) setData(query.data);
  }, [query.data]);

  function commit(next: MyOnboarding) {
    setData(next);
    queryClient.setQueryData(['hiring', 'my-onboarding'], next);
  }

  if (query.isLoading || !data) {
    return (
      <Box sx={{ p: 4, display: 'grid', placeItems: 'center' }}>
        {query.isError ? <Alert severity="error">Could not load your onboarding.</Alert> : <CircularProgress />}
      </Box>
    );
  }
  const o = data.onboarding;
  if (!o) {
    return (
      <Box sx={{ maxWidth: 720, mx: 'auto', p: 2 }}>
        <Alert severity="info">You have no onboarding in progress.</Alert>
        {data.handbook && <Box sx={{ mt: 2 }}><Handbook data={data} onSigned={commit} /></Box>}
      </Box>
    );
  }
  const first = o.user.name.split(' ')[0];

  return (
    <Box sx={{ maxWidth: 760, mx: 'auto', p: { xs: 1.5, sm: 2 } }}>
      <Typography variant="h4" fontWeight={700} sx={{ mb: 0.5 }}>
        Welcome to Eco-Thrift, {first}!
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 2 }}>
        Your first day: {dayText(o.start_date)}
        {o.start_time ? ` at ${o.start_time.slice(0, 5)}` : ''}, {data.place}.
        {o.manager ? ` Your manager is ${o.manager.name}.` : ''}
      </Typography>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2.5 }}>
        <LinearProgress variant="determinate" value={o.total ? (100 * o.done) / o.total : 0} sx={{ flex: 1, height: 8, borderRadius: 4 }} />
        <Typography variant="body2" sx={{ color: ccTokens.ink2 }}>
          {o.done} of {o.total} done
        </Typography>
      </Box>

      {!(data.emergency_contact.name && data.emergency_contact.phone) && <EmergencyContact data={data} onSaved={commit} />}
      {data.handbook ? (
        <Handbook data={data} onSigned={commit} />
      ) : (
        <Card title="The handbook">
          <Typography variant="body2" color="text.secondary">
            It isn&rsquo;t ready yet. Your manager will tell you when to read and sign it.
          </Typography>
        </Card>
      )}

      <Card title="Your checklist">
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          Tick yours as you do them. Your manager ticks theirs, and Dash ticks some by itself.
        </Typography>
        <Checklist
          tasks={o.tasks}
          busyId={busyId}
          canTick={(t) => t.owner === 'new_hire' && t.kind === 'tick'}
          onTick={async (task, done) => {
            setBusyId(task.id);
            try {
              commit((await tickMyTask(task.id, done ? 'done' : 'open')).data);
            } catch (err) {
              enqueueSnackbar(errorText(err, 'Could not save.'), { variant: 'error' });
            } finally {
              setBusyId(null);
            }
          }}
        />
      </Card>
      {data.emergency_contact.name && data.emergency_contact.phone && <EmergencyContact data={data} onSaved={commit} />}
    </Box>
  );
}
