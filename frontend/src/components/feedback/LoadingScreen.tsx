import { Box, CircularProgress, Typography } from '@mui/material';
import { APP_VERSION } from '../../utils/appVersion';

export interface LoadingScreenProps {
  message?: string;
  /** The release version under it, muted: the Thrift+ Staff app's splash. */
  version?: boolean;
}

export function LoadingScreen({ message, version }: LoadingScreenProps) {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '60vh',
        gap: 2,
      }}
    >
      <CircularProgress size={48} />
      {message && (
        <Typography variant="body2" color="text.secondary">
          {message}
        </Typography>
      )}
      {version && APP_VERSION ? (
        <Typography variant="caption" color="text.disabled" data-testid="app-version">
          {APP_VERSION}
        </Typography>
      ) : null}
    </Box>
  );
}
