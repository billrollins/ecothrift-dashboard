import { Box, Button, Typography } from '@mui/material';
import { format, parseISO } from 'date-fns';
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import type { QaNudgeRow } from '../../api/routines.api';
import { useAuth } from '../../hooks/useAuth';
import { useDeviceConfig } from '../../hooks/useDeviceConfig';
import { useAckQaNudge, usePendingQaNudges } from '../../hooks/useRetailQa';
import { t } from '../../i18n/routines';
import { GroupHeader } from '../duty/GroupHeader';
import { dutyColors } from '../duty/tokens';

function deviceLabel(config: { registerName?: string } | null) {
  return config?.registerName?.trim() || 'Browser';
}

/** One card per routine: a manager may nudge the same run twice before it is heard. */
function uniqueByRun(rows: QaNudgeRow[]): QaNudgeRow[] {
  const seen = new Set<number>();
  const unique: QaNudgeRow[] = [];
  for (const row of rows) {
    const key = row.run_id ?? row.id;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(row);
  }
  return unique;
}

/**
 * Messages waiting for this person: nudges today (from a manager, or from the app at a hard
 * deadline). They live in the nag drawer with the routines. Only the person clears one:
 * Heard dismisses the message; a nudge on a routine leaves its note on that routine.
 * "I'm not <name>" signs out a shared register someone else left signed in.
 */
export function useNagMessages() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { config } = useDeviceConfig();
  const pending = usePendingQaNudges(Boolean(user));
  const ack = useAckQaNudge();
  const rows = useMemo(() => pending.data?.nudges ?? [], [pending.data]);
  const messages = useMemo(() => uniqueByRun(rows), [rows]);

  async function respond(kind: 'heard' | 'not_me', message?: QaNudgeRow) {
    const targets = message
      ? rows.filter((row) => (row.run_id ?? row.id) === (message.run_id ?? message.id))
      : rows;
    for (const row of targets) {
      await ack.mutateAsync({ id: row.id, kind, device: deviceLabel(config) });
    }
    if (kind === 'not_me') {
      await logout();
      navigate('/login');
    }
  }

  return {
    messages,
    busy: ack.isPending,
    heard: (message: QaNudgeRow) => respond('heard', message),
    notMe: () => respond('not_me'),
    firstName: user?.first_name?.trim() || '',
  };
}

export function NagMessages({
  messages,
  onHeard,
  onNotMe,
  busy,
  firstName,
  lang,
}: {
  messages: QaNudgeRow[];
  onHeard: (message: QaNudgeRow) => void;
  onNotMe: () => void;
  busy: boolean;
  firstName: string;
  lang: string;
}) {
  if (!messages.length) return null;
  return (
    <Box sx={{ mb: 1 }}>
      <GroupHeader title={t('messages', lang)} count={messages.length} />
      {messages.map((message) => (
        <Box
          key={message.id}
          sx={{
            mx: 1.5,
            mb: 0.75,
            px: 1.5,
            py: 1.25,
            borderRadius: '12px',
            border: `1.5px solid ${dutyColors.red}`,
            bgcolor: dutyColors.card,
            display: 'flex',
            flexDirection: 'column',
            gap: 0.75,
          }}
        >
          <Typography sx={{ fontSize: 14.5, fontWeight: 700, color: dutyColors.ink }}>
            {message.message || t('pleaseFinish', lang)}
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography sx={{ flex: 1, fontSize: 12.5, color: dutyColors.ink60 }}>
              {message.created_by?.name ? `${t('from', lang)} ${message.created_by.name}` : t('fromApp', lang)}
              {' · '}
              {format(parseISO(message.created_at), 'h:mm a')}
            </Typography>
            <Button variant="contained" size="small" disabled={busy} onClick={() => onHeard(message)} sx={{ height: 36, px: 2, fontWeight: 800 }}>
              {t('heard', lang)}
            </Button>
          </Box>
        </Box>
      ))}
      {firstName ? (
        <Button size="small" disabled={busy} onClick={onNotMe} sx={{ mx: 1.5, color: dutyColors.ink60 }}>
          {t('notMe', lang)} {firstName}
        </Button>
      ) : null}
    </Box>
  );
}
