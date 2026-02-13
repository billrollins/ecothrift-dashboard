import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Box,
  Card,
  CardContent,
  TextField,
  Button,
  Typography,
  Alert,
} from '@mui/material';
import logoImg from '../assets/logo-full-360x120.png';
import { forgotPassword, resetPassword } from '../api/accounts.api';

type Step = 'email' | 'token' | 'done';

export default function ForgotPasswordPage() {
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [token, setToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  // For the stub: show the token so the user can test
  const [debugToken, setDebugToken] = useState('');

  const handleRequestReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      const { data } = await forgotPassword(email);
      setMessage(data.detail);
      if (data.reset_token) {
        setDebugToken(data.reset_token);
        setToken(data.reset_token); // Auto-fill for dev convenience
      }
      setStep('token');
    } catch {
      setError('Failed to request password reset.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    setIsLoading(true);
    try {
      const { data } = await resetPassword(token, newPassword);
      setMessage(data.detail);
      setStep('done');
    } catch {
      setError('Failed to reset password. Token may be invalid or expired.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #f5f7fa 0%, #e8f5e9 50%, #c8e6c9 100%)',
        p: 2,
      }}
    >
      <Card
        sx={{
          maxWidth: 420,
          width: '100%',
          boxShadow: '0 8px 32px rgba(46, 125, 50, 0.15)',
          borderRadius: 3,
        }}
      >
        <CardContent sx={{ p: 4 }}>
          <Box sx={{ textAlign: 'center', mb: 3 }}>
            <Box
              component="img"
              src={logoImg}
              alt="Eco-Thrift"
              sx={{ maxWidth: 280, height: 'auto', mb: 2 }}
            />
            <Typography variant="h5" fontWeight={600} color="text.secondary">
              {step === 'done' ? 'Password Reset' : 'Forgot Password'}
            </Typography>
          </Box>

          {step === 'email' && (
            <Box
              component="form"
              onSubmit={handleRequestReset}
              sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}
            >
              {error && <Alert severity="error">{error}</Alert>}
              <Typography variant="body2" color="text.secondary">
                Enter your email address and we will send you a password reset link.
              </Typography>
              <TextField
                label="Email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                fullWidth
                autoFocus
              />
              <Button
                type="submit"
                variant="contained"
                size="large"
                disabled={isLoading || !email}
                sx={{ mt: 1, py: 1.5 }}
              >
                {isLoading ? 'Sending...' : 'Send Reset Link'}
              </Button>
              <Typography variant="body2" textAlign="center">
                <Link to="/login" style={{ color: '#2e7d32' }}>
                  Back to Sign In
                </Link>
              </Typography>
            </Box>
          )}

          {step === 'token' && (
            <Box
              component="form"
              onSubmit={handleResetPassword}
              sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}
            >
              {error && <Alert severity="error">{error}</Alert>}
              {message && <Alert severity="success">{message}</Alert>}
              {debugToken && (
                <Alert severity="info" sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                  Dev mode: Token auto-filled (no email sent)
                </Alert>
              )}
              <TextField
                label="Reset Token"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                required
                fullWidth
              />
              <TextField
                label="New Password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                fullWidth
              />
              <TextField
                label="Confirm Password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                fullWidth
              />
              <Button
                type="submit"
                variant="contained"
                size="large"
                disabled={isLoading || !token || !newPassword || !confirmPassword}
                sx={{ mt: 1, py: 1.5 }}
              >
                {isLoading ? 'Resetting...' : 'Reset Password'}
              </Button>
            </Box>
          )}

          {step === 'done' && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Alert severity="success">{message}</Alert>
              <Button
                variant="contained"
                size="large"
                component={Link}
                to="/login"
                sx={{ mt: 1, py: 1.5, textDecoration: 'none' }}
              >
                Sign In
              </Button>
            </Box>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}
