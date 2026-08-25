/**
 * Where an emailed reset link lands.
 *
 * The token rides in the query string, so nobody copies anything. If it is
 * missing or spent, the page says so and points back at Forgot password rather
 * than showing a form that cannot work.
 */
import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Box, Button, TextField, Typography } from '@mui/material';
import { useSnackbar } from 'notistack';
import { resetPassword } from '../api/accounts.api';
import { AuthCard } from './auth/AuthCard';

const MIN_LENGTH = 6;

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const token = searchParams.get('token') || '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [message, setMessage] = useState('');
  const [tone, setTone] = useState<'info' | 'error' | 'success'>('info');
  const [isLoading, setIsLoading] = useState(false);

  const mismatch = confirm.length > 0 && password !== confirm;
  const tooShort = password.length > 0 && password.length < MIN_LENGTH;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      setMessage('Those two passwords are different.');
      setTone('error');
      return;
    }
    if (password.length < MIN_LENGTH) {
      setMessage(`Use at least ${MIN_LENGTH} characters.`);
      setTone('error');
      return;
    }
    setIsLoading(true);
    try {
      await resetPassword(token, password);
      enqueueSnackbar('Password updated. Sign in with it now.', { variant: 'success' });
      navigate('/login', { replace: true });
    } catch (err) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setMessage(detail || 'That link did not work. Ask for a fresh one.');
      setTone('error');
    } finally {
      setIsLoading(false);
    }
  };

  if (!token) {
    return (
      <AuthCard
        title="Reset password"
        message="This link is missing its token. Ask for a fresh one and open it straight from the email."
        tone="error"
      >
        <Button variant="contained" size="large" component={Link} to="/forgot-password" fullWidth>
          Send me a new link
        </Button>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Set a new password"
      subtitle={`Pick something at least ${MIN_LENGTH} characters long.`}
      message={message}
      tone={tone}
    >
      <Box
        component="form"
        onSubmit={handleSubmit}
        sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}
      >
        <TextField
          label="New password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          fullWidth
          autoFocus
          autoComplete="new-password"
          error={tooShort}
          helperText={tooShort ? `At least ${MIN_LENGTH} characters.` : ' '}
        />
        <TextField
          label="Confirm password"
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
          fullWidth
          autoComplete="new-password"
          error={mismatch}
          helperText={mismatch ? 'These do not match.' : ' '}
        />
        <Button
          type="submit"
          variant="contained"
          size="large"
          disabled={isLoading || !password || !confirm || mismatch || tooShort}
          sx={{ py: 1.5 }}
        >
          {isLoading ? 'Saving…' : 'Set password'}
        </Button>
        <Typography variant="body2" textAlign="center">
          <Link to="/login" style={{ color: '#2e7d32' }}>
            Back to sign in
          </Link>
        </Typography>
      </Box>
    </AuthCard>
  );
}
