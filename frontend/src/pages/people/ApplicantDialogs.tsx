import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useEffect, useRef, useState } from 'react';
import {
  addApplicant,
  createEmployee,
  getNotNowDraft,
  markNotNow,
  type ApplicationDetail,
  type Job,
  type Option,
} from '../../api/hiring.api';
import { errorText } from './peopleUi';

// ── Not now ─────────────────────────────────────────────────────────────────

export function NotNowDialog({
  open,
  application,
  reasons,
  initialReason = '',
  onClose,
  onDone,
}: {
  open: boolean;
  application: ApplicationDetail;
  reasons: Option[];
  /** Pre-picked reason, e.g. 'no_show' right after marking a no-show. */
  initialReason?: string;
  onClose: () => void;
  onDone: (updated: ApplicationDetail) => void;
}) {
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setReason(initialReason);
      setNote('');
      setSubject('');
      setBody('');
      setError('');
    }
  }, [open, initialReason]);

  useEffect(() => {
    if (!open || !reason) return;
    let alive = true;
    getNotNowDraft(application.id, reason)
      .then(({ data }) => {
        if (!alive) return;
        setSubject(data.subject);
        setBody(data.body);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [open, reason, application.id]);

  async function finish(send: boolean) {
    setError('');
    if (!reason) {
      setError('Pick a reason.');
      return;
    }
    setBusy(true);
    try {
      const { data } = await markNotNow(application.id, { reason, note, send, subject, body });
      onDone(data);
    } catch (err) {
      setError(errorText(err, 'Could not save.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Not now: {application.full_name}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField select label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} fullWidth>
            {reasons.map((r) => (
              <MenuItem key={r.key} value={r.key}>
                {r.label}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            label={reason === 'other' ? 'Why (required)' : 'Note (only staff see this)'}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            multiline
            minRows={2}
            fullWidth
          />
          {reason && (
            <>
              <Typography variant="subtitle2" sx={{ mt: 1 }}>
                Email to {application.email || 'the applicant (no email on file)'}
              </Typography>
              <TextField label="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} fullWidth />
              <TextField label="Message" value={body} onChange={(e) => setBody(e.target.value)} multiline minRows={7} fullWidth />
              <Typography variant="caption" color="text.secondary">
                The auto-reply already told them when to expect word from us. Don&rsquo;t send is fine
                for early stages. Either way the text is kept on their record.
              </Typography>
            </>
          )}
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ flexWrap: 'wrap', gap: 1 }}>
        <Button onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button onClick={() => finish(false)} disabled={busy || !reason}>
          Don&rsquo;t send
        </Button>
        <Button variant="contained" onClick={() => finish(true)} disabled={busy || !reason || !application.email}>
          Send email
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ── Create employee ─────────────────────────────────────────────────────────

function nextMonday(): string {
  const d = new Date();
  d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7));
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function CreateEmployeeDialog({
  open,
  application,
  onClose,
  onDone,
}: {
  open: boolean;
  application: ApplicationDetail;
  onClose: () => void;
  onDone: (updated: ApplicationDetail, note: string) => void;
}) {
  const [payRate, setPayRate] = useState('15.00');
  const [startDate, setStartDate] = useState(nextMonday());
  const [startTime, setStartTime] = useState('09:00');
  const [position, setPosition] = useState('');
  const [employmentType, setEmploymentType] = useState('part_time');
  const [startOnboarding, setStartOnboarding] = useState(true);
  const [sendFirstDay, setSendFirstDay] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // A signed offer fills the form with what they agreed to.
  const signed = application.offers?.find((o) => o.status === 'signed');

  useEffect(() => {
    if (open) {
      setPosition(signed?.position || application.jobs.map((j) => j.title).join(', '));
      if (signed) {
        setPayRate(signed.pay_rate);
        setStartDate(signed.start_date);
        if (signed.start_time) setStartTime(signed.start_time.slice(0, 5));
        setEmploymentType(signed.employment_type);
      }
      setError('');
    }
  }, [open, application]); // eslint-disable-line react-hooks/exhaustive-deps

  async function save() {
    setBusy(true);
    setError('');
    try {
      const { data } = await createEmployee(application.id, {
        pay_rate: payRate,
        start_date: startDate,
        position,
        employment_type: employmentType,
        department: null,
        start_onboarding: startOnboarding,
        send_first_day: startOnboarding && sendFirstDay,
        start_time: startTime,
      });
      onDone(
        data.application,
        `Dash account ${data.employee_number} made (sign-in: ${data.username}).` +
          (data.onboarding
            ? data.first_day_sent
              ? ` Onboarding started; the first-day email went to ${application.email}.`
              : ' Onboarding started.'
            : '') +
          ' On day one, show them the Set password code (People → Onboarding).',
      );
    } catch (err) {
      setError(errorText(err, 'Could not create the employee.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Create employee: {application.full_name}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Typography variant="body2" color="text.secondary">
            Makes their Dash account (Employee) and employee record. Nothing about passwords is emailed: on day one they
            scan a Set password code and pick their own.
            {signed ? ' Filled in from the offer they signed.' : ''}
          </Typography>
          <TextField label="Position" value={position} onChange={(e) => setPosition(e.target.value)} fullWidth />
          <Stack direction="row" spacing={2}>
            <TextField
              label="Pay rate ($/hr)"
              value={payRate}
              onChange={(e) => setPayRate(e.target.value)}
              inputProps={{ inputMode: 'decimal' }}
              fullWidth
            />
            <TextField
              label="Start date"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              InputLabelProps={{ shrink: true }}
              fullWidth
            />
          </Stack>
          <TextField
            label="First day starts at"
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            InputLabelProps={{ shrink: true }}
            fullWidth
          />
          <TextField select label="Type" value={employmentType} onChange={(e) => setEmploymentType(e.target.value)} fullWidth>
            <MenuItem value="part_time">Part time</MenuItem>
            <MenuItem value="full_time">Full time</MenuItem>
            <MenuItem value="seasonal">Seasonal</MenuItem>
          </TextField>
          <FormControlLabel
            control={<Checkbox checked={startOnboarding} onChange={(e) => setStartOnboarding(e.target.checked)} />}
            label="Start onboarding (the checklist)"
          />
          {startOnboarding && (
            <FormControlLabel
              sx={{ mt: -1.5 }}
              control={<Checkbox checked={sendFirstDay} onChange={(e) => setSendFirstDay(e.target.checked)} />}
              label={`Email the first-day note to ${application.email || 'them'}`}
            />
          )}
          <Alert severity="info" variant="outlined">
            Then add them in QuickBooks Payroll (name, phone, email). QuickBooks sends them the W-4 and direct
            deposit setup. It's the first item on their checklist.
          </Alert>
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button variant="contained" onClick={save} disabled={busy || !application.email}>
          Create employee
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ── Add applicant by hand ───────────────────────────────────────────────────

const SOURCES = [
  { key: 'walk_in', label: 'Walk-in / paper' },
  { key: 'email', label: 'Emailed resume' },
  { key: 'referral', label: 'Referral' },
  { key: 'other', label: 'Other' },
];

export function AddApplicantDialog({
  open,
  jobs,
  onClose,
  onDone,
}: {
  open: boolean;
  jobs: Job[];
  onClose: () => void;
  onDone: (created: ApplicationDetail) => void;
}) {
  const [fields, setFields] = useState({ first_name: '', last_name: '', phone: '', email: '', note: '' });
  const [roles, setRoles] = useState<number[]>([]);
  const [source, setSource] = useState('walk_in');
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setFields({ first_name: '', last_name: '', phone: '', email: '', note: '' });
      setRoles([]);
      setSource('walk_in');
      setFile(null);
      setError('');
    }
  }, [open]);

  async function save() {
    setBusy(true);
    setError('');
    const form = new FormData();
    Object.entries(fields).forEach(([k, v]) => form.append(k, v.trim()));
    form.append('jobs', roles.join(','));
    form.append('source', source);
    if (file) form.append('resume', file);
    try {
      const { data } = await addApplicant(form);
      onDone(data);
    } catch (err) {
      setError(errorText(err, 'Could not add the applicant.'));
    } finally {
      setBusy(false);
    }
  }

  const set = (key: keyof typeof fields) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setFields((f) => ({ ...f, [key]: e.target.value }));

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Add applicant</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Typography variant="body2" color="text.secondary">
            For a walk-in, a paper application or an emailed resume. No auto-reply is sent.
          </Typography>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField label="First name" value={fields.first_name} onChange={set('first_name')} fullWidth required />
            <TextField label="Last name" value={fields.last_name} onChange={set('last_name')} fullWidth />
          </Stack>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField label="Phone" value={fields.phone} onChange={set('phone')} fullWidth />
            <TextField label="Email" value={fields.email} onChange={set('email')} fullWidth />
          </Stack>
          <Box>
            <Typography variant="caption" color="text.secondary">
              Role
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 0.5 }}>
              {jobs.map((job) => {
                const on = roles.includes(job.id);
                return (
                  <Chip
                    key={job.id}
                    label={job.title}
                    color={on ? 'primary' : 'default'}
                    variant={on ? 'filled' : 'outlined'}
                    onClick={() => setRoles((r) => (on ? r.filter((id) => id !== job.id) : [...r, job.id]))}
                  />
                );
              })}
            </Box>
          </Box>
          <TextField select label="How they applied" value={source} onChange={(e) => setSource(e.target.value)} fullWidth>
            {SOURCES.map((s) => (
              <MenuItem key={s.key} value={s.key}>
                {s.label}
              </MenuItem>
            ))}
          </TextField>
          <TextField label="Note" value={fields.note} onChange={set('note')} multiline minRows={2} fullWidth />
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
            <Button variant="outlined" onClick={() => fileInput.current?.click()}>
              {file ? 'Different resume' : 'Add resume or photo'}
            </Button>
            {file && <Typography variant="body2">{file.name}</Typography>}
            <input
              ref={fileInput}
              type="file"
              hidden
              accept=".pdf,.doc,.docx,image/*"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                e.target.value = '';
              }}
            />
          </Box>
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button variant="contained" onClick={save} disabled={busy || !fields.first_name.trim() || roles.length === 0}>
          Add
        </Button>
      </DialogActions>
    </Dialog>
  );
}
