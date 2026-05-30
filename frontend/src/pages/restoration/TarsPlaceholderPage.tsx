import { Box, Card, CardContent, Typography } from '@mui/material';

/** Placeholder for Restoration TARS (Test, Assemble, Repair, Salvage) workflows. */
export default function TarsPlaceholderPage() {
  return (
    <Box>
      <Typography variant="h5" gutterBottom>
        TARS
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Test, Assemble, Repair, Salvage — restoration workspace coming soon.
      </Typography>
      <Card variant="outlined">
        <CardContent>
          <Typography variant="body2" color="text.secondary">
            Dedicated TARS workflows are not wired yet. Use Processing for intake today; floor
            tools for item lookup and reprice.
          </Typography>
        </CardContent>
      </Card>
    </Box>
  );
}
