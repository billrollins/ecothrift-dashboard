/**
 * The signed-out card: logo, title, and a reserved line for whatever went
 * wrong or went right.
 *
 * The message slot is always there. An error appearing must not shove the
 * password fields down while someone is mid-type.
 */
import type { ReactNode } from 'react';
import { Box, Card, CardContent, Typography } from '@mui/material';
import logoImg from '../../assets/logo-full-360x120.png';

export const AUTH_MESSAGE_MIN_HEIGHT = 44;

export function AuthCard({
  title,
  subtitle,
  message,
  tone = 'info',
  children,
}: {
  title: string;
  subtitle?: string;
  message?: string;
  tone?: 'info' | 'error' | 'success';
  children: ReactNode;
}) {
  const color =
    tone === 'error' ? 'error.main' : tone === 'success' ? 'success.main' : 'text.secondary';
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
          <Box sx={{ textAlign: 'center', mb: 2 }}>
            <Box
              component="img"
              src={logoImg}
              alt="Eco-Thrift"
              sx={{ maxWidth: 280, height: 'auto', mb: 2 }}
            />
            <Typography variant="h5" fontWeight={600} color="text.secondary">
              {title}
            </Typography>
          </Box>

          {/* Reserved slot - the form below never moves when a message lands. */}
          <Box
            role="status"
            sx={{
              minHeight: AUTH_MESSAGE_MIN_HEIGHT,
              display: 'flex',
              alignItems: 'center',
              mb: 1,
            }}
          >
            <Typography variant="body2" sx={{ color, fontWeight: message ? 600 : 400 }}>
              {message || subtitle || ''}
            </Typography>
          </Box>

          {children}
        </CardContent>
      </Card>
    </Box>
  );
}
