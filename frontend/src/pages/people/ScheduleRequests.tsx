/**
 * Schedule requests (Bill, Dash Updates #60 and #61, 2026-11-03): changes to the schedule are a conversation with a
 * manager. Anyone asks for unpaid days off (one day or a run of days) or new times on one day (a different start or
 * end, or a day they don't usually work), with a note; they see their own requests and can withdraw one while it waits.
 * Managers see everyone's waiting requests and approve or decline with a reply; approving changes the week.
 * English and Spanish.
 */
import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import { format, parseISO } from 'date-fns';
import { es as esLocale } from 'date-fns/locale';
import { useLanguage } from '../../i18n/useLanguage';
import {
  askScheduleChange,
  decideScheduleRequest,
  getScheduleRequests,
  withdrawScheduleRequest,
  type ScheduleRequest,
} from '../../api/schedule.api';
import { errorText, range } from './scheduleLayout';

const COPY = {
  ask: { en: 'Ask for a change', es: 'Pedir un cambio' },
  requests: { en: 'Requests', es: 'Solicitudes' },
  myRequests: { en: 'My requests', es: 'Mis solicitudes' },
  off: { en: 'Day off', es: 'Día libre' },
  times: { en: 'New times', es: 'Otro horario' },
  day: { en: 'Day', es: 'Día' },
  firstDay: { en: 'First day off', es: 'Primer día libre' },
  lastDay: { en: 'Last day off', es: 'Último día libre' },
  start: { en: 'Start', es: 'Entrada' },
  end: { en: 'End', es: 'Salida' },
  note: { en: 'Note for your manager', es: 'Nota para tu gerente' },
  unpaid: { en: 'Days off are unpaid.', es: 'Los días libres no se pagan.' },
  send: { en: 'Send', es: 'Enviar' },
  sent: { en: 'Sent to your manager', es: 'Enviado a tu gerente' },
  cancel: { en: 'Cancel', es: 'Cancelar' },
  close: { en: 'Close', es: 'Cerrar' },
  withdraw: { en: 'Withdraw', es: 'Retirar' },
  withdrawn: { en: 'Withdrawn', es: 'Retirada' },
  approve: { en: 'Approve', es: 'Aprobar' },
  decline: { en: 'Decline', es: 'Rechazar' },
  reply: { en: 'Reply (optional)', es: 'Respuesta (opcional)' },
  pending: { en: 'Waiting', es: 'En espera' },
  approved: { en: 'Approved', es: 'Aprobada' },
  declined: { en: 'Declined', es: 'Rechazada' },
  none: { en: 'No requests.', es: 'No hay solicitudes.' },
  noneWaiting: { en: 'Nothing waiting.', es: 'Nada en espera.' },
  asked: { en: 'Asked', es: 'Pidió' },
  couldNot: { en: 'Could not send', es: 'No se pudo enviar' },
} satisfies Record<string, { en: string; es: string }>;

export type RequestCopyKey = keyof typeof COPY;

export function useRequestCopy() {
  const lang = useLanguage();
  const locale = lang === 'es' ? { locale: esLocale } : undefined;
  const t = (key: RequestCopyKey) => COPY[key][lang];
  const date = (d: string, pattern = 'EEE MMM d') => format(parseISO(d), pattern, locale);
  /** 'Day off Thu Nov 5', 'Day off Nov 5-Nov 7', 'New times Thu Nov 5, 10-4'. */
  const describe = (r: Pick<ScheduleRequest, 'kind' | 'date' | 'end_date' | 'start_time' | 'end_time'>) => {
    if (r.kind === 'off') {
      return r.end_date && r.end_date !== r.date
        ? `${t('off')} ${date(r.date, 'MMM d')}-${date(r.end_date, 'MMM d')}`
        : `${t('off')} ${date(r.date)}`;
    }
    return `${t('times')} ${date(r.date)}, ${r.start_time && r.end_time ? range(r.start_time, r.end_time) : ''}`;
  };
  return { t, date, describe };
}

const statusColor = { pending: 'info', approved: 'success', declined: 'error', withdrawn: 'default' } as const;

function StatusChip({ status }: { status: ScheduleRequest['status'] }) {
  const { t } = useRequestCopy();
  return <Chip size="small" variant="outlined" color={statusColor[status]} label={t(status === 'withdrawn' ? 'withdrawn' : status)} />;
}

/** What someone is asking for: prefilled from the day they tapped (its shift, if any), or blank from the header. */
export interface AskStart {
  date: string;
  start_time?: string;
  end_time?: string;
}

export function AskDialog({ initial, today, onClose, onSent }: {
  initial: AskStart;
  today: string;
  onClose: () => void;
  onSent: () => void;
}) {
  const { t } = useRequestCopy();
  const { enqueueSnackbar } = useSnackbar();
  const [kind, setKind] = useState<ScheduleRequest['kind']>('off');
  const [date, setDate] = useState(initial.date);
  const [endDate, setEndDate] = useState(initial.date);
  const [start, setStart] = useState(initial.start_time ?? '09:00');
  const [end, setEnd] = useState(initial.end_time ?? '17:00');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const send = async () => {
    setBusy(true);
    try {
      await askScheduleChange(kind === 'off'
        ? { kind, date, end_date: endDate < date ? date : endDate, note }
        : { kind, date, start_time: start, end_time: end, note });
      enqueueSnackbar(t('sent'), { variant: 'success' });
      onSent();
      onClose();
    } catch (err) {
      enqueueSnackbar(errorText(err, t('couldNot')), { variant: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onClose={busy ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{t('ask')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 0.5 }}>
          <ToggleButtonGroup exclusive size="small" fullWidth value={kind} onChange={(_e, v) => v && setKind(v)}>
            <ToggleButton value="off">{t('off')}</ToggleButton>
            <ToggleButton value="times">{t('times')}</ToggleButton>
          </ToggleButtonGroup>
          {kind === 'off' ? (
            <Stack direction="row" spacing={1.5}>
              <TextField label={t('firstDay')} type="date" size="small" value={date} fullWidth InputLabelProps={{ shrink: true }}
                inputProps={{ min: today }} onChange={(e) => { setDate(e.target.value); if (endDate < e.target.value) setEndDate(e.target.value); }} />
              <TextField label={t('lastDay')} type="date" size="small" value={endDate} fullWidth InputLabelProps={{ shrink: true }}
                inputProps={{ min: date }} onChange={(e) => setEndDate(e.target.value)} />
            </Stack>
          ) : (
            <>
              <TextField label={t('day')} type="date" size="small" value={date} fullWidth InputLabelProps={{ shrink: true }}
                inputProps={{ min: today }} onChange={(e) => setDate(e.target.value)} />
              <Stack direction="row" spacing={1.5}>
                <TextField label={t('start')} type="time" size="small" value={start} onChange={(e) => setStart(e.target.value)} InputLabelProps={{ shrink: true }} inputProps={{ step: 300 }} fullWidth />
                <TextField label={t('end')} type="time" size="small" value={end} onChange={(e) => setEnd(e.target.value)} InputLabelProps={{ shrink: true }} inputProps={{ step: 300 }} fullWidth />
              </Stack>
            </>
          )}
          <TextField label={t('note')} size="small" value={note} onChange={(e) => setNote(e.target.value)} fullWidth multiline minRows={2}
            inputProps={{ maxLength: 300 }} helperText={kind === 'off' ? t('unpaid') : ' '} />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button disabled={busy} onClick={onClose}>{t('cancel')}</Button>
        <Button variant="contained" disabled={busy || !date || (kind === 'times' && (!start || !end))} onClick={send}>{t('send')}</Button>
      </DialogActions>
    </Dialog>
  );
}

/** A manager's answer to one waiting request: a reply, then approve or decline. */
export function DecideRow({ request, onDone }: { request: ScheduleRequest; onDone: () => void }) {
  const { t, describe } = useRequestCopy();
  const { enqueueSnackbar } = useSnackbar();
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const decide = async (approve: boolean) => {
    setBusy(true);
    try {
      await decideScheduleRequest(request.id, approve, reply);
      enqueueSnackbar(t(approve ? 'approved' : 'declined'), { variant: approve ? 'success' : 'info' });
      onDone();
    } catch (err) {
      enqueueSnackbar(errorText(err, t('couldNot')), { variant: 'error' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Box data-testid={`request-${request.id}`} sx={{ py: 1.25 }}>
      <Typography fontWeight={700}>{request.employee_name}</Typography>
      <Typography variant="body2">{describe(request)}</Typography>
      {request.note ? <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>“{request.note}”</Typography> : null}
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1 }}>
        <TextField size="small" placeholder={t('reply')} value={reply} onChange={(e) => setReply(e.target.value)} sx={{ flex: 1 }}
          inputProps={{ maxLength: 300, 'aria-label': t('reply') }} />
        <Button size="small" color="error" disabled={busy} onClick={() => decide(false)}>{t('decline')}</Button>
        <Button size="small" variant="contained" disabled={busy} onClick={() => decide(true)}>{t('approve')}</Button>
      </Stack>
    </Box>
  );
}

/**
 * The header's list. Managers: everyone's waiting requests, each to approve or decline. Staff: their own requests with
 * the manager's reply, a waiting one to withdraw, and a button to ask.
 */
export function RequestsDialog({ manager, onAsk, onClose, onChanged }: {
  manager: boolean;
  onAsk: () => void;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { t, describe, date } = useRequestCopy();
  const { enqueueSnackbar } = useSnackbar();
  const queryClient = useQueryClient();
  const list = useQuery({
    queryKey: ['scheduleRequests', manager ? 'pending' : 'mine'],
    queryFn: async () => (await getScheduleRequests(manager ? 'pending' : undefined)).data,
  });
  const done = () => {
    queryClient.invalidateQueries({ queryKey: ['scheduleRequests'] });
    onChanged();
  };
  const withdraw = async (id: number) => {
    try {
      await withdrawScheduleRequest(id);
      done();
    } catch (err) {
      enqueueSnackbar(errorText(err, t('couldNot')), { variant: 'error' });
    }
  };
  // Staff: newest first, withdrawn ones left out.
  const rows = (list.data ?? []).filter((r) => manager || r.status !== 'withdrawn');
  if (!manager) rows.sort((a, b) => b.created_at.localeCompare(a.created_at));

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{manager ? t('requests') : t('myRequests')}</DialogTitle>
      <DialogContent dividers>
        {list.isError ? <Alert severity="error">{t('couldNot')}</Alert> : null}
        {list.data && !rows.length ? <Typography color="text.secondary">{manager ? t('noneWaiting') : t('none')}</Typography> : null}
        {rows.map((r, i) => (
          <Box key={r.id}>
            {i ? <Divider /> : null}
            {manager ? <DecideRow request={r} onDone={done} /> : (
              <Box data-testid={`request-${r.id}`} sx={{ py: 1.25 }}>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Typography fontWeight={700} sx={{ flex: 1 }}>{describe(r)}</Typography>
                  <StatusChip status={r.status} />
                </Stack>
                {r.note ? <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>“{r.note}”</Typography> : null}
                {r.status !== 'pending' && (r.reply || r.decided_by_name) ? (
                  <Typography variant="body2" sx={{ mt: 0.5 }}>
                    {r.decided_by_name}{r.decided_at ? ` · ${date(r.decided_at.slice(0, 10), 'MMM d')}` : ''}{r.reply ? `: ${r.reply}` : ''}
                  </Typography>
                ) : null}
                {r.status === 'pending' ? (
                  <Button size="small" color="inherit" sx={{ mt: 0.5, color: 'text.secondary' }} onClick={() => withdraw(r.id)}>{t('withdraw')}</Button>
                ) : null}
              </Box>
            )}
          </Box>
        ))}
      </DialogContent>
      <DialogActions>
        {manager ? null : <Button onClick={onAsk} sx={{ mr: 'auto' }}>{t('ask')}</Button>}
        <Button onClick={onClose}>{t('close')}</Button>
      </DialogActions>
    </Dialog>
  );
}
