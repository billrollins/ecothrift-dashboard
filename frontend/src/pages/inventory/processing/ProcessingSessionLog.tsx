import { Box, Card, CardContent, Typography } from '@mui/material';
import History from '@mui/icons-material/History';

export interface SessionLogLine {
  key: string;
  /** Plain-text line for display */
  text: string;
}

export interface ProcessingSessionLogProps {
  lines: SessionLogLine[];
}

export function ProcessingSessionLog({ lines }: ProcessingSessionLogProps) {
  const has = lines.length > 0;

  return (
    <Card variant="outlined" sx={{ height: '100%', minHeight: 280 }}>
      <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 1, height: '100%' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <History fontSize="small" color="action" />
          <Typography variant="subtitle2">Session log</Typography>
        </Box>
        {!has ? (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
            No session events yet for this visit. Check-ins, merges, and bulk actions will be listed here as we wire persistent
            audit trails.
          </Typography>
        ) : (
          <Box component="ul" sx={{ m: 0, pl: 2, overflow: 'auto', maxHeight: 'min(48vh, 420px)' }}>
            {lines.map((line) => (
              <Typography key={line.key} component="li" variant="caption" sx={{ mb: 0.75 }}>
                {line.text}
              </Typography>
            ))}
          </Box>
        )}
      </CardContent>
    </Card>
  );
}
