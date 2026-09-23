import { lazy, Suspense, useRef, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import logoImg from '../assets/logo-full-360x120.png';
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
import { tk } from '../i18n/kiosk';
import { useKioskLang } from './kiosk/kioskLang';

/** Card scanning is the door tablet's code. Keep it out of the sign-in bundle. */
const LoginScan = lazy(() => import('./LoginScan'));

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [lang] = useKioskLang();
  const [scanning, setScanning] = useState(false);
  const [scanMessage, setScanMessage] = useState('');
  const emailRef = useRef<HTMLInputElement | null>(null);

  const stopScanning = () => {
    setScanning(false);
    emailRef.current?.focus();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    try {
      await login(email, password);
      navigate('/dashboard', { replace: true });
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { detail?: string } } };
      const detail = axiosErr?.response?.data?.detail;
      setError(detail || (err instanceof Error ? err.message : 'Login failed. Please try again.'));
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
              Sign in to your account
            </Typography>
          </Box>

          <Box component="form" onSubmit={handleSubmit} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {error && (
              <Alert severity="error" onClose={() => setError(null)}>
                {error}
              </Alert>
            )}
            {scanMessage ? (
              <Alert severity="success" data-testid="login-scan-message" onClose={() => setScanMessage('')}>
                {scanMessage}
              </Alert>
            ) : null}
            <TextField
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              fullWidth
              autoComplete="email"
              autoFocus
              inputRef={emailRef}
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
            <Button
              type="button"
              data-testid="login-scan-button"
              onClick={() => {
                setScanMessage('');
                setScanning(true);
              }}
              sx={{ textTransform: 'none', fontWeight: 700, color: '#2e7d32' }}
            >
              {tk('scanYourCard', lang)}
            </Button>
            <Typography variant="body2" textAlign="center" sx={{ mt: 1 }}>
              <Link to="/forgot-password" style={{ color: '#2e7d32' }}>
                Forgot password?
              </Link>
            </Typography>
          </Box>
        </CardContent>
      </Card>

      {scanning ? (
        <Suspense fallback={null}>
          <LoginScan
            onExit={stopScanning}
            onDone={(message) => {
              setScanMessage(message);
              stopScanning();
            }}
          />
        </Suspense>
      ) : null}
    </Box>
  );
}
