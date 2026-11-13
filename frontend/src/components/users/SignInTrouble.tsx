/**
 * Cannot sign in (Dash Update #121, Bill 2026-11-13): who is locked out or has no password, in plain words, with
 * one-tap help.
 *
 * Ray was locked out twice (too many wrong passwords) and Bill did not know where he went. Each row says what happened
 * and when ("Locked out at 9:35 am today after 5 wrong passwords. Ray set a new password at 9:37 am.") and offers:
 * - Unlock (the owner): he can sign in again now, without waiting the 15 minutes.
 * - Email reset link: a one-hour link to the email on file.
 * - Text or show link: a 48-hour set-password link to text from this phone, copy, or scan as a QR. A manager gets it
 *   only for an Employee (whoever holds the link can set the password).
 *
 * The owner sees the full list in Users → Employees → Cannot sign in. Managers see a one-line bar on HR → Requests
 * (``SignInTroubleBar``), always painted at the same height so nothing below it moves.
 */
import { useState } from 'react';
import { Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Typography } from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import {
  emailSignInLink,
  getSignInTrouble,
  getSignInTroubleLink,
  unlockSignIn,
  type SignInTroubleRow,
} from '../../api/accounts.api';
import { SetPasswordLinkDialog } from './SetPasswordLinkDialog';

export const SIGN_IN_TROUBLE_KEY = ['sign-in-trouble'] as const;

export function useSignInTrouble(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: SIGN_IN_TROUBLE_KEY,
    queryFn: async () => (await getSignInTrouble()).data,
    enabled: options?.enabled ?? true,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

const STATE_CHIP: Record<SignInTroubleRow['state'], { label: string; color: 'error' | 'warning' | 'default' }> = {
  locked: { label: 'Locked out now', color: 'error' },
  was_locked: { label: 'Locked out today', color: 'warning' },
  no_password: { label: 'No password', color: 'default' },
};

function errorText(err: unknown, fallback: string): string {
  const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  return typeof detail === 'string' && detail ? detail : fallback;
}

function useHelpActions() {
  const qc = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: SIGN_IN_TROUBLE_KEY });
    void qc.invalidateQueries({ queryKey: ['users', 'stats'] });
  };
  const unlock = useMutation({
    mutationFn: async (id: number) => (await unlockSignIn(id)).data,
    onSuccess: (data) => {
      enqueueSnackbar(data.detail, { variant: 'success' });
      refresh();
    },
    onError: (err) => enqueueSnackbar(errorText(err, 'Could not unlock.'), { variant: 'error' }),
  });
  const email = useMutation({
    mutationFn: async (id: number) => (await emailSignInLink(id)).data,
    onSuccess: (data) => {
      enqueueSnackbar(data.detail, { variant: 'success' });
      refresh();
    },
    onError: (err) => enqueueSnackbar(errorText(err, 'Could not send the reset email.'), { variant: 'error' }),
  });
  return { unlock, email, refresh };
}

function TroubleRow({
  row,
  onLink,
  actions,
}: {
  row: SignInTroubleRow;
  onLink: (row: SignInTroubleRow) => void;
  actions: ReturnType<typeof useHelpActions>;
}) {
  const chip = STATE_CHIP[row.state];
  const busy = actions.unlock.isPending || actions.email.isPending;
  return (
    <Box
      data-testid={`sign-in-trouble-${row.user_id}`}
      sx={{
        p: 1.5,
        border: '1.5px solid',
        borderColor: row.state === 'locked' ? 'error.light' : 'divider',
        borderRadius: 2.5,
        bgcolor: 'background.paper',
      }}
    >
      <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: 'wrap', rowGap: 0.5 }}>
        <Typography sx={{ fontWeight: 700 }}>{row.name}</Typography>
        <Chip size="small" label={chip.label} color={chip.color} variant={row.state === 'locked' ? 'filled' : 'outlined'} />
        <Typography variant="caption" color="text.secondary">
          {[row.role, row.employee_number].filter(Boolean).join(' · ')}
        </Typography>
      </Stack>
      <Typography variant="body2" sx={{ mt: 0.75 }}>
        {row.headline}
      </Typography>
      {row.after.map((line) => (
        <Typography key={line} variant="body2" color="text.secondary">
          {line}
        </Typography>
      ))}
      <Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap: 'wrap', rowGap: 1 }}>
        {row.can_unlock && row.locked_now ? (
          <Button
            size="small"
            variant="contained"
            disabled={busy}
            onClick={() => actions.unlock.mutate(row.user_id)}
            sx={{ textTransform: 'none' }}
          >
            Unlock
          </Button>
        ) : null}
        {row.can_link ? (
          <Button
            size="small"
            variant={row.can_unlock && row.locked_now ? 'outlined' : 'contained'}
            disabled={busy}
            onClick={() => onLink(row)}
            sx={{ textTransform: 'none' }}
          >
            {row.phone ? 'Text a reset link' : 'Show a reset link'}
          </Button>
        ) : null}
        {row.has_email ? (
          <Button
            size="small"
            variant="outlined"
            disabled={busy}
            onClick={() => actions.email.mutate(row.user_id)}
            sx={{ textTransform: 'none' }}
          >
            Email a reset link
          </Button>
        ) : null}
      </Stack>
    </Box>
  );
}

/** The list itself. ``rows`` empty → a calm "everyone can sign in". */
export function SignInTroubleList({ rows, loading }: { rows?: SignInTroubleRow[]; loading?: boolean }) {
  const actions = useHelpActions();
  const [linkFor, setLinkFor] = useState<SignInTroubleRow | null>(null);
  return (
    <Stack spacing={1}>
      {!rows || rows.length === 0 ? (
        <Box sx={{ px: 3, py: 6, border: '1px dashed', borderColor: 'divider', borderRadius: 2.5, textAlign: 'center' }}>
          <Typography variant="body2" color="text.secondary">
            {loading ? 'Checking who cannot sign in…' : 'Everyone can sign in. Nobody is locked out today.'}
          </Typography>
        </Box>
      ) : (
        rows.map((row) => <TroubleRow key={row.user_id} row={row} onLink={setLinkFor} actions={actions} />)
      )}
      <SetPasswordLinkDialog
        userId={linkFor?.user_id ?? null}
        name={linkFor?.name ?? ''}
        phone={linkFor?.phone}
        fetchLink={getSignInTroubleLink}
        onClose={() => {
          setLinkFor(null);
          actions.refresh();
        }}
      />
    </Stack>
  );
}

export const SIGN_IN_BAR_HEIGHT = 48;

function clockOf(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).toLowerCase();
}

/**
 * Managers' small version (HR → Requests): one line, always the same height. Nobody in trouble → a quiet line;
 * someone → their name, what and when, and Help, which opens the list with the reset-link buttons.
 */
export function SignInTroubleBar() {
  const { data, isLoading } = useSignInTrouble();
  const [open, setOpen] = useState(false);
  const locked = (data?.rows ?? []).filter((r) => r.state !== 'no_password');
  const first = locked[0];
  const more = locked.length - 1;
  return (
    <Box
      data-testid="sign-in-trouble-bar"
      sx={{
        height: SIGN_IN_BAR_HEIGHT,
        px: 1.5,
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        border: '1px solid',
        borderColor: first ? 'warning.light' : 'divider',
        borderRadius: 2,
        bgcolor: 'background.paper',
        overflow: 'hidden',
      }}
    >
      <Typography variant="body2" sx={{ fontWeight: 700, flexShrink: 0 }}>
        Sign-in
      </Typography>
      <Typography variant="body2" color={first ? 'text.primary' : 'text.secondary'} noWrap sx={{ flex: 1, minWidth: 0 }}>
        {isLoading && !data
          ? '-'
          : first
            ? `${first.name} ${first.locked_now ? 'is locked out' : 'was locked out'} (${clockOf(first.locked_at)})${
                more > 0 ? ` and ${more} more` : ''
              }.`
            : 'Nobody is locked out today.'}
      </Typography>
      <Button
        size="small"
        variant={first ? 'contained' : 'text'}
        onClick={() => setOpen(true)}
        disabled={!data || (data.rows.length === 0)}
        sx={{ textTransform: 'none', flexShrink: 0, visibility: data && data.rows.length > 0 ? 'visible' : 'hidden' }}
      >
        Help
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Cannot sign in</DialogTitle>
        <DialogContent>
          <SignInTroubleList rows={data?.rows} loading={isLoading} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)} sx={{ textTransform: 'none' }}>
            Done
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
