import { Alert, Box, Button } from '@mui/material';
import ErrorOutline from '@mui/icons-material/ErrorOutline';

export interface ErrorDisplayProps {
  error: string | Error;
  onRetry?: () => void;
}

export function ErrorDisplay({ error, onRetry }: ErrorDisplayProps) {
  const message = typeof error === 'string' ? error : error.message;

  return (
    <Box sx={{ py: 4 }}>
      <Alert
        severity="error"
        icon={<ErrorOutline />}
        action={
          onRetry && (
            <Button color="inherit" size="small" onClick={onRetry}>
              Retry
            </Button>
          )
        }
        sx={{
          '& .MuiAlert-message': {
            width: '100%',
          },
        }}
      >
        {message}
      </Alert>
    </Box>
  );
}
