import { Alert, Box, Button, Card, CardActionArea, Chip, Collapse, Grid, LinearProgress, Stack, Typography } from '@mui/material';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { type FindResult, type KeyRow, findKey } from '../../../api/keys.api';
import { KeyCamera } from './KeyCamera';
import { KeyDialog } from './KeyDialog';
import { KeyThumb, WhereChip, errorText, metricsText } from './keysShared';

/**
 * Find a key from a photo: the AI reads the key, the 9 closest logged keys come up numbered, and the AI says which
 * one matches (or none). Bill checks the pick against the photos and opens the key.
 */
export function FindTab() {
  const [camera, setCamera] = useState(false);
  const [query, setQuery] = useState<string | null>(null);
  const [showGrid, setShowGrid] = useState(false);
  const [open, setOpen] = useState<KeyRow | null>(null);
  const find = useMutation({ mutationFn: findKey });
  const result: FindResult | undefined = find.data;
  const pick = result?.answer ? result.candidates.find((c) => c.number === result.answer) : undefined;

  const onPhoto = (blob: Blob) => {
    setQuery((old) => {
      if (old) URL.revokeObjectURL(old);
      return URL.createObjectURL(blob);
    });
    setShowGrid(false);
    find.mutate(blob);
  };

  return (
    <Stack spacing={2}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'center' }}>
        <Button variant="contained" size="large" onClick={() => setCamera(true)} disabled={find.isPending}>
          {result || find.isError ? 'Try another photo' : 'Take a photo of the key'}
        </Button>
        <Typography color="text.secondary">Shoot it at 5x over white photo paper, the same way the keys were logged.</Typography>
      </Stack>
      {find.isPending ? <LinearProgress /> : null}
      {find.isError ? <Alert severity="error">{errorText(find.error, 'The search did not work. Try again.')}</Alert> : null}
      {result ? (
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, md: 4 }}>
            <Card variant="outlined" sx={{ p: 2 }}>
              <Typography variant="subtitle2" gutterBottom>
                Your photo
              </Typography>
              {query ? <Box component="img" src={query} alt="Key to find" sx={{ width: '100%', borderRadius: 1, bgcolor: '#fff' }} /> : null}
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                {metricsText(result.metrics) || 'Nothing readable'}
              </Typography>
            </Card>
          </Grid>
          <Grid size={{ xs: 12, md: 8 }}>
            <Stack spacing={2}>
              {pick ? (
                <Alert severity="success" action={<Button color="inherit" onClick={() => setOpen(pick.key)}>Open</Button>}>
                  The AI says number {pick.number}: <strong>{pick.key.name}</strong>
                  {pick.key.ring_name ? ` on ${pick.key.ring_name}` : ''}. Check it against the photos.
                  {result.reason ? ` ${result.reason}` : ''}
                </Alert>
              ) : (
                <Alert severity="warning">
                  {result.candidates.length ? 'The AI found no match among the closest keys.' : 'No logged keys to compare.'}
                  {result.reason ? ` ${result.reason}` : ''}
                </Alert>
              )}
              <Grid container spacing={1}>
                {result.candidates.map((c) => (
                  <Grid key={c.key.id} size={{ xs: 6, sm: 4 }}>
                    <Card
                      variant="outlined"
                      sx={{ borderColor: c.number === result.answer ? 'success.main' : 'divider', borderWidth: c.number === result.answer ? 2 : 1 }}
                    >
                      <CardActionArea onClick={() => setOpen(c.key)} sx={{ p: 1 }}>
                        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                          <Chip size="small" label={c.number} color={c.number === result.answer ? 'success' : 'default'} />
                          <Typography variant="body2" noWrap sx={{ flex: 1 }}>
                            {c.key.name}
                          </Typography>
                        </Stack>
                        <KeyThumb url={c.key.thumbnail_url} size={64} />
                        <Box sx={{ mt: 0.5 }}>
                          <WhereChip where={c.key.where ?? null} />
                        </Box>
                      </CardActionArea>
                    </Card>
                  </Grid>
                ))}
              </Grid>
              {result.grid ? (
                <Box>
                  <Button size="small" onClick={() => setShowGrid((s) => !s)}>
                    {showGrid ? 'Hide the grid the AI saw' : 'Show the grid the AI saw'}
                  </Button>
                  <Collapse in={showGrid}>
                    <Box component="img" src={result.grid} alt="Numbered grid of keys" sx={{ width: '100%', maxWidth: 600, mt: 1, borderRadius: 1 }} />
                  </Collapse>
                </Box>
              ) : null}
            </Stack>
          </Grid>
        </Grid>
      ) : null}
      <KeyCamera open={camera} title="Photo of the key to find" onClose={() => setCamera(false)} onPhoto={onPhoto} />
      <KeyDialog open={!!open} keyRow={open} onClose={() => setOpen(null)} />
    </Stack>
  );
}
