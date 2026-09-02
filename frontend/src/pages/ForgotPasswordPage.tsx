/**
 * Ask for a reset link. That is the whole page.
 *
 * The token never comes back to the browser and is never typed by hand - it
 * arrives as a link in email and lands on /reset-password.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Box, Button, TextField, Typography } from '@mui/material';
import { forgotPassword } from '../api/accounts.api';
import { AuthCard } from './auth/AuthCard';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [message, setMessage] = useState('');
  const [tone, setTone] = useState<'info' | 'error' | 'success'>('info');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const { data } = await forgotPassword(email);
      setMessage(data.detail);
      setTone('success');
      setSent(true);
    } catch (err) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setMessage(detail || 'Could not send the reset email. Try again in a moment.');
      setTone('error');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthCard
      title="Forgot password"
      subtitle="Enter your work email and we will send you a link to set a new password."
      message={message}
      tone={tone}
    >
      <Box
        component="form"
        onSubmit={handleSubmit}
        sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}
      >
        <TextField
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          fullWidth
          autoFocus
          disabled={sent}
        />
        <Button
          type="submit"
          variant="contained"
          size="large"
          disabled={isLoading || !email || sent}
          sx={{ mt: 1, py: 1.5 }}
        >
          {isLoading ? 'Sending…' : sent ? 'Link sent' : 'Send reset link'}
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
