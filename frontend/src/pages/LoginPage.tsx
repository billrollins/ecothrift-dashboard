import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import logoImg from '../assets/eco-thrift-logo-color.svg';
import {
  Box,
  Card,
  CardContent,
  TextField,
  Button,
  Typography,
  Alert,
} from '@mui/material';
import { useAuth } from '../contexts/AuthContext';
import { clearIdleSignOut, peekIdleSignOut } from '../api/client';

/**
 * Where to go after signing in: `?next=` when it is a page of this site (the Finalize app, J13), else `/`, which sends
 * a cashier on a register to the Terminal and everyone else to the Dashboard (App.tsx HomeRedirect).
 */
export function loginNext(next: string | null): string {
  return next && next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/login') ? next : '/';
}

/**
 * The "As Bill" button (#144): only on a dev server (`npm run dev`) opened on this PC as localhost or 127.0.0.1, on any
 * port. A production build drops it (import.meta.env.DEV is false there), and the server answers 404 off this PC.
 */
export function devSignInShown(): boolean {
  return import.meta.env.DEV === true && ['localhost', '127.0.0.1'].includes(window.location.hostname);
}

export default function LoginPage() {
  const { login, devLogin } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  // "Signed out after 4 hours idle." (D16): kept by the refresh that failed, shown once.
  const [idleNotice] = useState(peekIdleSignOut);
  useEffect(() => clearIdleSignOut(), []);

  const signIn = async (attempt: () => Promise<void>) => {
    setError(null);
    setIsLoading(true);
    try {
      await attempt();
      navigate(loginNext(searchParams.get('next')), { replace: true });
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { detail?: string } } };
      const detail = axiosErr?.response?.data?.detail;
      setError(detail || (err instanceof Error ? err.message : 'Login failed. Please try again.'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void signIn(() => login(email, password));
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
              // The old PNG's 3:1 box (280 x 93), so the form sits where it did.
              sx={{ width: 280, maxWidth: '100%', aspectRatio: '3 / 1', objectFit: 'contain', mb: 2 }}
            />
            <Typography variant="h5" fontWeight={600} color="text.secondary">
              Sign in to your account
            </Typography>
          </Box>

          <Box component="form" onSubmit={handleSubmit} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {idleNotice && !error ? (
              <Alert severity="info" data-testid="login-idle-notice">
                {idleNotice}
              </Alert>
            ) : null}
            {error && (
              <Alert severity="error" onClose={() => setError(null)}>
                {error}
              </Alert>
            )}
            <TextField
              label="Username or email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              fullWidth
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              autoFocus
            />
            <TextField
              label="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              fullWidth
              autoComplete="current-password"
            />
            <Button
              type="submit"
              variant="contained"
              size="large"
              disabled={isLoading}
              sx={{
                mt: 1,
                py: 1.5,
                bgcolor: 'primary.main',
                '&:hover': { bgcolor: 'primary.dark' },
              }}
            >
              {isLoading ? 'Signing in...' : 'Sign in'}
            </Button>
            <Typography variant="body2" textAlign="center" sx={{ mt: 1 }}>
              <Link to="/forgot-password" style={{ color: '#2e7d32' }}>
                Forgot password?
              </Link>
            </Typography>
            {devSignInShown() ? (
              // Last in the card, and there from the first paint on a dev server, so nothing above it ever moves.
              <Button
                variant="outlined"
                color="secondary"
                disabled={isLoading}
                onClick={() => void signIn(devLogin)}
                data-testid="login-dev-as-bill"
              >
                As Bill (local dev)
              </Button>
            ) : null}
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
}
