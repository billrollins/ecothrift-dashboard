import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Drawer,
  FormControlLabel,
  IconButton,
  MenuItem,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import { useEffect, useState } from 'react';
import { Link as RouterLink, useSearchParams } from 'react-router-dom';
import {
  getCheckin,
  getCheckins,
  getOnboardingPeople,
  saveCheckin,
  scheduleCheckins,
  signCheckin,
  skipCheckin,
  type CheckInAnswers,
  type CheckInDetail,
  type CheckInPay,
  type CheckInRow,
} from '../../api/hiring.api';
import { PageHeader } from '../../components/common/PageHeader';
import { useAuth } from '../../hooks/useAuth';
import { ccTokens } from '../../theme';
import { CheckInReadout, openCheckinPdf } from './checkinUi';
import { dayText, errorText, shortDate } from './peopleUi';
import { SignaturePad } from './SignaturePad';
import { IconClose as CloseIcon } from '../../icons/ecoIcons';

function Row({ row, selected, onOpen }: { row: CheckInRow; selected: boolean; onOpen: () => void }) {
  return (
    <Box
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onOpen()}
      sx={{
        px: 2,
        py: 1.5,
        cursor: 'pointer',
        bgcolor: selected ? ccTokens.goodTint : ccTokens.card,
        borderBottom: `1px solid ${ccTokens.line}`,
        '&:hover': { bgcolor: selected ? ccTokens.goodTint : '#fafaf7' },
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Typography fontWeight={700} sx={{ flex: 1 }} noWrap>
          {row.user.name}: {row.day}-day check-in
        </Typography>
        {row.overdue && <Chip size="small" color="error" label="Overdue" sx={{ height: 20, fontSize: 11 }} />}
        {row.status !== 'scheduled' && <Chip size="small" label={row.status_label} sx={{ height: 20, fontSize: 11 }} />}
      </Box>
      <Typography variant="caption" color="text.secondary">
        {row.status === 'done' ? `Signed ${shortDate(row.signed_at)}` : `Due ${dayText(row.due_date)}`}
        {row.manager ? ` · with ${row.manager.name}` : ''}
        {row.status === 'scheduled' && row.started ? ' · started' : ''}
      </Typography>
    </Box>
  );
}

const EMPTY: CheckInAnswers = { questions: {}, areas: {} };
const EMPTY_PAY: CheckInPay = { decision: '', current: '', new_rate: '', effective: '', note: '' };

/** The pay decision on a pay-review check-in (the 90-day one): a raise from a date, or no change yet. */
function PayReview({ pay, current, onChange, error }: {
  pay: CheckInPay;
  current: string;
  onChange: (next: CheckInPay) => void;
  error?: string;
}) {
  const set = (part: Partial<CheckInPay>) => onChange({ ...pay, ...part });
  return (
    <Box sx={{ p: 2, borderRadius: ccTokens.r, border: `1px solid ${error ? '#e2b4ae' : '#c4dcbd'}`, bgcolor: ccTokens.goodTint }}>
      <Typography sx={{ fontWeight: 700 }}>Pay review</Typography>
      <Typography variant="body2" sx={{ color: ccTokens.ink2, mb: 1.25 }}>
        Today: {current ? `$${current} an hour` : 'no rate in Dash'}. Decide it together before signing.
      </Typography>
      <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', mb: 1.5 }}>
        <Chip label="Give a raise" color={pay.decision === 'raise' ? 'primary' : 'default'}
          variant={pay.decision === 'raise' ? 'filled' : 'outlined'} onClick={() => set({ decision: 'raise' })} />
        <Chip label="No change yet" color={pay.decision === 'no_change' ? 'primary' : 'default'}
          variant={pay.decision === 'no_change' ? 'filled' : 'outlined'} onClick={() => set({ decision: 'no_change' })} />
      </Box>
      {pay.decision === 'raise' && (
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mb: 1.5 }}>
          <TextField size="small" label="New rate ($ an hour)" value={pay.new_rate} inputMode="decimal"
            onChange={(e) => set({ new_rate: e.target.value })} sx={{ bgcolor: '#fff' }} />
          <TextField size="small" type="date" label="Starts" value={pay.effective} InputLabelProps={{ shrink: true }}
            onChange={(e) => set({ effective: e.target.value })} sx={{ bgcolor: '#fff' }} />
        </Stack>
      )}
      {pay.decision && (
        <TextField
          size="small"
          label={pay.decision === 'raise' ? 'What the raise is for' : 'What would earn a raise'}
          value={pay.note}
          onChange={(e) => set({ note: e.target.value })}
          multiline
          minRows={2}
          fullWidth
          sx={{ bgcolor: '#fff' }}
        />
      )}
      {pay.decision === 'raise' && (
        <Typography variant="caption" sx={{ display: 'block', mt: 1, color: ccTokens.ink2 }}>
          Signing updates the rate in Dash. Change it in QuickBooks too, which runs payroll.
        </Typography>
      )}
      {error && <Alert severity="error" sx={{ mt: 1.5 }}>{error}</Alert>}
    </Box>
  );
}

function Panel({ id, onClose }: { id: number; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const { user } = useAuth();
  const detail = useQuery({ queryKey: ['hiring', 'checkin', id], queryFn: async () => (await getCheckin(id)).data });
  const c = detail.data;
  const [answers, setAnswers] = useState<CheckInAnswers>(EMPTY);
  const [comments, setComments] = useState('');
  const [close, setClose] = useState(false);
  const [signing, setSigning] = useState(false);
  const [ack, setAck] = useState(false);
  const [managerName, setManagerName] = useState('');
  const [employeeName, setEmployeeName] = useState('');
  const [managerSig, setManagerSig] = useState('');
  const [employeeSig, setEmployeeSig] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [skipReason, setSkipReason] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!c) return;
    setAnswers({
      questions: { ...(c.answers.questions ?? {}) },
      areas: { ...(c.answers.areas ?? {}) },
      ...(c.form.pay_review ? { pay: { ...EMPTY_PAY, ...(c.answers.pay ?? {}) } } : {}),
    });
    setComments(c.employee_comments);
    setClose(c.close_onboarding);
    setManagerName(c.manager?.name || user?.full_name || '');
    setEmployeeName(c.user.name);
  }, [c?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function commit(next: CheckInDetail) {
    queryClient.setQueryData(['hiring', 'checkin', id], next);
    await queryClient.invalidateQueries({ queryKey: ['hiring', 'checkins'] });
  }

  function errorsFrom(err: unknown): Record<string, string> {
    const body = (err as { response?: { data?: Record<string, string | string[]> } }).response?.data ?? {};
    return Object.fromEntries(Object.entries(body).map(([k, v]) => [k, Array.isArray(v) ? v[0] : String(v)]));
  }

  async function save() {
    setBusy(true);
    try {
      await commit((await saveCheckin(id, { answers, employee_comments: comments, close_onboarding: close })).data);
      enqueueSnackbar('Saved', { variant: 'success' });
    } catch (err) {
      enqueueSnackbar(Object.values(errorsFrom(err)).join(' ') || errorText(err, 'Could not save.'), { variant: 'error' });
    } finally {
      setBusy(false);
    }
  }

  async function sign() {
    setBusy(true);
    setErrors({});
    try {
      const { data } = await signCheckin(id, {
        answers,
        employee_comments: comments,
        close_onboarding: close,
        manager_name: managerName,
        manager_signature: managerSig,
        employee_name: employeeName,
        employee_signature: employeeSig,
        acknowledged: ack,
      });
      await commit(data);
      setSigning(false);
      if (data.answers.pay?.decision === 'raise') {
        enqueueSnackbar(`Raise to $${data.answers.pay.new_rate} saved in Dash. Change it in QuickBooks too.`, { variant: 'info' });
      }
      enqueueSnackbar('Check-in signed. They can read it in Dash under My check-ins.', { variant: 'success' });
    } catch (err) {
      const found = errorsFrom(err);
      setErrors(found);
      if (found.pay) setSigning(false); // the pay box is on the form, under the dialog
    } finally {
      setBusy(false);
    }
  }

  if (detail.isLoading || !c) {
    return (
      <Box sx={{ p: 4, display: 'grid', placeItems: 'center' }}>
        {detail.isError ? <Alert severity="error">Could not load this check-in.</Alert> : <CircularProgress />}
      </Box>
    );
  }
  const open = c.status === 'scheduled';
  const setQ = (key: string, value: string) => setAnswers((a) => ({ ...a, questions: { ...a.questions, [key]: value } }));
  const setArea = (area: string, part: 'rating' | 'note', value: string) =>
    setAnswers((a) => ({
      ...a,
      areas: { ...a.areas, [area]: { rating: a.areas[area]?.rating ?? '', note: a.areas[area]?.note ?? '', [part]: value } },
    }));

  return (
    <Box sx={{ p: { xs: 2, sm: 3 }, pb: 6 }}>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
        <Box sx={{ flex: 1 }}>
          <Typography variant="h5" fontWeight={700}>
            {c.user.name}: {c.day}-day check-in
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Due {dayText(c.due_date)}
            {c.manager ? ` · with ${c.manager.name}` : ''} · {c.status_label}
          </Typography>
        </Box>
        <IconButton onClick={onClose} aria-label="Close">
          <CloseIcon />
        </IconButton>
      </Box>

      {c.status === 'done' && (
        <Box sx={{ mt: 2 }}>
          <Alert
            severity="success"
            sx={{ mb: 2 }}
            action={
              c.has_pdf ? (
                <Button color="inherit" size="small" onClick={() => openCheckinPdf(c.id, (m) => enqueueSnackbar(m, { variant: 'error' }))}>
                  PDF
                </Button>
              ) : undefined
            }
          >
            Signed {shortDate(c.signed_at)} by {c.manager_name} and {c.employee_name}.
            {c.close_onboarding ? ' It closed onboarding.' : ''}
          </Alert>
          <CheckInReadout form={c.form} answers={c.answers} employeeComments={c.employee_comments} />
        </Box>
      )}
      {c.status === 'skipped' && <Alert severity="info" sx={{ mt: 2 }}>Skipped: {c.skipped_reason}</Alert>}

      {open && (
        <Stack spacing={2} sx={{ mt: 2 }}>
          <Typography variant="body2" color="text.secondary">
            Fill it in together in the meeting, on this phone or tablet. Save as you go; both sign at the end.
          </Typography>
          {c.form.questions.map((q) => (
            <TextField
              key={q.key}
              label={q.label}
              value={answers.questions[q.key] ?? ''}
              onChange={(e) => setQ(q.key, e.target.value)}
              multiline={q.type === 'long_text'}
              minRows={q.type === 'long_text' ? 3 : undefined}
              fullWidth
            />
          ))}
          {c.form.areas.length > 0 && (
            <Box>
              <Typography variant="overline" sx={{ color: ccTokens.ink2, fontWeight: 700 }}>
                Areas
              </Typography>
              {c.form.areas.map((area) => (
                <Box key={area} sx={{ py: 1, borderBottom: `1px solid ${ccTokens.line}` }}>
                  <Typography sx={{ fontSize: 14.5, fontWeight: 600, mb: 0.75 }}>{area}</Typography>
                  <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', mb: 0.75 }}>
                    {c.form.area_ratings.map((r) => (
                      <Chip
                        key={r}
                        label={r}
                        color={answers.areas[area]?.rating === r ? 'primary' : 'default'}
                        variant={answers.areas[area]?.rating === r ? 'filled' : 'outlined'}
                        onClick={() => setArea(area, 'rating', answers.areas[area]?.rating === r ? '' : r)}
                      />
                    ))}
                  </Box>
                  <TextField
                    size="small"
                    placeholder="A note (optional)"
                    value={answers.areas[area]?.note ?? ''}
                    onChange={(e) => setArea(area, 'note', e.target.value)}
                    fullWidth
                  />
                </Box>
              ))}
            </Box>
          )}
          {c.form.pay_review && (
            <PayReview
              pay={answers.pay ?? EMPTY_PAY}
              current={c.current_pay}
              error={errors.pay}
              onChange={(pay) => {
                setAnswers((a) => ({ ...a, pay }));
                setErrors((e) => ({ ...e, pay: '' }));
              }}
            />
          )}
          <TextField
            label="The employee's comments (they say or write these)"
            value={comments}
            onChange={(e) => setComments(e.target.value)}
            multiline
            minRows={2}
            fullWidth
          />
          {c.can_close_onboarding && (
            <FormControlLabel
              control={<Checkbox checked={close} onChange={(e) => setClose(e.target.checked)} />}
              label="This check-in closes onboarding (anything still open is marked not needed)"
            />
          )}
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <Button variant="outlined" disabled={busy} onClick={save}>
              Save
            </Button>
            <Button variant="contained" disabled={busy} onClick={() => setSigning(true)}>
              Sign together
            </Button>
            <Button color="inherit" disabled={busy} onClick={() => setSkipReason('')} sx={{ ml: 'auto' }}>
              Skip
            </Button>
          </Box>
        </Stack>
      )}

      <Dialog open={signing} onClose={busy ? undefined : () => setSigning(false)} fullWidth maxWidth="sm">
        <DialogTitle>Sign the {c.day}-day check-in</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <TextField label="Manager's full name" value={managerName} onChange={(e) => setManagerName(e.target.value)}
              error={!!errors.manager_name} helperText={errors.manager_name} fullWidth />
            <SignaturePad error={errors.manager_signature} onChange={setManagerSig} />
            <Typography variant="body2" sx={{ pt: 1 }}>
              Now hand the device to {c.user.name.split(' ')[0]}.
            </Typography>
            <FormControlLabel control={<Checkbox checked={ack} onChange={(e) => setAck(e.target.checked)} />} label={c.form.employee_statement} />
            {errors.acknowledged && <Typography variant="caption" sx={{ color: '#a33027' }}>{errors.acknowledged}</Typography>}
            <TextField label="Employee's full name" value={employeeName} onChange={(e) => setEmployeeName(e.target.value)}
              error={!!errors.employee_name} helperText={errors.employee_name} fullWidth />
            <SignaturePad error={errors.employee_signature} onChange={setEmployeeSig} />
            {(errors.answers || errors.detail) && <Alert severity="error">{errors.answers || errors.detail}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSigning(false)} disabled={busy}>
            Back
          </Button>
          <Button variant="contained" onClick={sign} disabled={busy}>
            {busy ? 'Signing…' : 'Sign and lock'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={skipReason !== null} onClose={() => setSkipReason(null)} fullWidth maxWidth="xs">
        <DialogTitle>Skip this check-in?</DialogTitle>
        <DialogContent>
          <TextField autoFocus fullWidth label="Why (for example: they left)" value={skipReason ?? ''} onChange={(e) => setSkipReason(e.target.value)} sx={{ mt: 1 }} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSkipReason(null)}>Cancel</Button>
          <Button
            variant="contained"
            disabled={!skipReason?.trim()}
            onClick={async () => {
              try {
                await commit((await skipCheckin(id, skipReason ?? '')).data);
                setSkipReason(null);
              } catch (err) {
                enqueueSnackbar(errorText(err, 'Could not skip.'), { variant: 'error' });
              }
            }}
          >
            Skip it
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

function ScheduleDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const people = useQuery({ queryKey: ['hiring', 'onboarding-people'], queryFn: async () => (await getOnboardingPeople()).data, enabled: open });
  const [user, setUser] = useState<number | ''>('');
  const [start, setStart] = useState('');
  const [manager, setManager] = useState<number | ''>('');
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>Schedule check-ins</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Typography variant="body2" color="text.secondary">
            For someone hired before onboarding was in Dash. New hires get theirs when onboarding starts.
          </Typography>
          <TextField select label="Employee" value={user} onChange={(e) => setUser(Number(e.target.value))} fullWidth>
            {(people.data ?? []).map((p) => <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>)}
          </TextField>
          <TextField label="Their first day" type="date" value={start} onChange={(e) => setStart(e.target.value)} InputLabelProps={{ shrink: true }} fullWidth />
          <TextField select label="Who meets with them" value={manager} onChange={(e) => setManager(Number(e.target.value))} fullWidth>
            {(people.data ?? []).filter((p) => p.role !== 'Employee').map((p) => <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>)}
          </TextField>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          disabled={user === '' || !start}
          onClick={async () => {
            try {
              const { data } = await scheduleCheckins({ user: Number(user), start_date: start, manager: manager === '' ? null : manager });
              await queryClient.invalidateQueries({ queryKey: ['hiring', 'checkins'] });
              enqueueSnackbar(data.length ? `${data.length} check-ins scheduled` : 'They already have these check-ins', { variant: 'success' });
              onClose();
            } catch (err) {
              enqueueSnackbar(errorText(err, 'Could not schedule.'), { variant: 'error' });
            }
          }}
        >
          Schedule
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default function CheckInsPage() {
  const theme = useTheme();
  const wide = useMediaQuery(theme.breakpoints.up('md'));
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState<'due' | 'upcoming' | 'done'>('due');
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const openId = Number(params.get('id')) || null;
  const list = useQuery({ queryKey: ['hiring', 'checkins', tab], queryFn: async () => (await getCheckins(tab)).data });

  function open(id: number | null) {
    const next = new URLSearchParams(params);
    if (id) next.set('id', String(id));
    else next.delete('id');
    setParams(next, { replace: true });
  }

  const rows = list.data ?? [];
  const panel = openId ? <Panel key={openId} id={openId} onClose={() => open(null)} /> : null;
  return (
    <Box>
      <PageHeader
        title="Check-ins"
        subtitle="30, 60 and 90 days after a new hire starts: met in person, filled in together, signed by both. They read it in Dash."
        action={
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button component={RouterLink} to="/people/onboarding">Onboarding</Button>
            <Button variant="outlined" onClick={() => setScheduleOpen(true)}>Schedule check-ins</Button>
          </Box>
        }
      />
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ borderBottom: `1px solid ${ccTokens.line}`, mb: 2 }}>
        <Tab value="due" label="Due (this week)" />
        <Tab value="upcoming" label="Coming up" />
        <Tab value="done" label="Done" />
      </Tabs>
      <Box sx={{ display: 'grid', gridTemplateColumns: wide && openId ? 'minmax(0, 1fr) 560px' : '1fr', gap: 2 }}>
        <Box sx={{ border: `1px solid ${ccTokens.line}`, borderRadius: ccTokens.r, overflow: 'hidden', bgcolor: ccTokens.card, alignSelf: 'start' }}>
          {list.isLoading && <Typography sx={{ p: 3 }} color="text.secondary">Loading…</Typography>}
          {!list.isLoading && rows.length === 0 && (
            <Typography sx={{ p: 3 }} color="text.secondary">
              {tab === 'due' ? 'No check-ins due this week.' : tab === 'upcoming' ? 'None scheduled.' : 'None yet.'}
            </Typography>
          )}
          {rows.map((row) => <Row key={row.id} row={row} selected={row.id === openId} onOpen={() => open(row.id)} />)}
        </Box>
        {wide && openId && (
          <Box sx={{ border: `1px solid ${ccTokens.line}`, borderRadius: ccTokens.r, bgcolor: ccTokens.card, alignSelf: 'start', position: 'sticky', top: 16, maxHeight: 'calc(100vh - 32px)', overflowY: 'auto' }}>
            {panel}
          </Box>
        )}
      </Box>
      {!wide && (
        <Drawer anchor="bottom" open={!!openId} onClose={() => open(null)} PaperProps={{ sx: { height: '94vh', borderRadius: '16px 16px 0 0' } }}>
          {panel}
        </Drawer>
      )}
      <ScheduleDialog open={scheduleOpen} onClose={() => setScheduleOpen(false)} />
    </Box>
  );
}
