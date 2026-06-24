import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import QrCodeScanner from '@mui/icons-material/QrCodeScanner';
import { useMemo } from 'react';
import { TARS_SOURCE_COLORS } from './tarsConstants';
import { useTarsMock } from './TarsMockStore';
import { TarsEvaluationSection } from './TarsEvaluationSection';
import type { TarsItem } from './tarsTypes';

function SourceChip({ source }: { source: TarsItem['source'] }) {
  return (
    <Chip
      label={source}
      size="small"
      sx={{ height: 20, fontSize: 10, fontWeight: 700, bgcolor: TARS_SOURCE_COLORS[source], color: '#fff' }}
    />
  );
}

export function TarsBenchPanel() {
  const {
    sentItems,
    benchItems,
    activeBenchSku,
    setActiveBenchSku,
    benchScanInput,
    setBenchScanInput,
    scanNext,
    submitBenchScan,
    scanIn,
  } = useTarsMock();

  const activeItem = useMemo(() => {
    const picked = benchItems.find((i) => i.sku === activeBenchSku);
    return picked ?? benchItems[0] ?? null;
  }, [benchItems, activeBenchSku]);

  return (
    <Stack spacing={2}>
      <Card sx={{ bgcolor: 'grey.900', color: 'grey.100' }}>
        <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
          <Stack direction="row" spacing={1.5} alignItems="center">
            <QrCodeScanner />
            <TextField
              fullWidth
              size="small"
              placeholder="Scan or type a SKU to check in for evaluation…"
              value={benchScanInput}
              onChange={(e) => setBenchScanInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitBenchScan();
              }}
              slotProps={{
                input: {
                  sx: {
                    fontFamily: 'monospace',
                    bgcolor: 'grey.800',
                    color: 'grey.100',
                    '& fieldset': { border: 'none' },
                  },
                },
              }}
            />
            <Button variant="contained" color="primary" onClick={scanNext}>
              Check in next ({sentItems.length})
            </Button>
          </Stack>
        </CardContent>
      </Card>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', lg: '280px 1fr' },
          gap: 2,
          alignItems: 'start',
        }}
      >
        <Stack spacing={2}>
          <Card variant="outlined">
            <CardContent>
              <Typography variant="overline" fontWeight={700} color="text.secondary" display="block" mb={1}>
                Awaiting check-in
              </Typography>
              {sentItems.length === 0 ? (
                <Typography variant="body2" color="text.secondary" textAlign="center" py={2}>
                  Nothing inbound.
                </Typography>
              ) : (
                sentItems.map((it) => (
                  <Button
                    key={it.sku}
                    fullWidth
                    variant="outlined"
                    onClick={() => scanIn(it.sku)}
                    sx={{
                      textAlign: 'left',
                      justifyContent: 'flex-start',
                      mb: 1,
                      borderStyle: 'dashed',
                    }}
                  >
                    <Box>
                      <Stack direction="row" spacing={1} alignItems="center" mb={0.5}>
                        <Typography variant="caption" fontFamily="monospace" fontWeight={700}>
                          {it.sku}
                        </Typography>
                        <SourceChip source={it.source} />
                      </Stack>
                      <Typography variant="body2" fontWeight={600}>
                        {it.name}
                      </Typography>
                    </Box>
                  </Button>
                ))
              )}
            </CardContent>
          </Card>

          <Card variant="outlined">
            <CardContent>
              <Typography variant="overline" fontWeight={700} color="text.secondary" display="block" mb={1}>
                On bench — evaluating
              </Typography>
              {benchItems.length === 0 ? (
                <Typography variant="body2" color="text.secondary" textAlign="center" py={2}>
                  Bench empty — check something in.
                </Typography>
              ) : (
                benchItems.map((it) => (
                  <Button
                    key={it.sku}
                    fullWidth
                    variant={activeItem?.sku === it.sku ? 'outlined' : 'text'}
                    color={activeItem?.sku === it.sku ? 'primary' : 'inherit'}
                    onClick={() => setActiveBenchSku(it.sku)}
                    sx={{ textAlign: 'left', justifyContent: 'flex-start', mb: 1 }}
                  >
                    <Box>
                      <Stack direction="row" spacing={1} alignItems="center" mb={0.5}>
                        <Typography variant="caption" fontFamily="monospace" fontWeight={700}>
                          {it.sku}
                        </Typography>
                        <SourceChip source={it.source} />
                      </Stack>
                      <Typography variant="body2" fontWeight={600}>
                        {it.name}
                      </Typography>
                    </Box>
                  </Button>
                ))
              )}
            </CardContent>
          </Card>
        </Stack>

        <Card variant="outlined">
          <CardContent>
            {!activeItem ? (
              <Typography color="text.secondary" textAlign="center" py={8}>
                Check in an item to start evaluation.
              </Typography>
            ) : (
              <>
                <Stack direction="row" spacing={1.5} pb={2} mb={2} borderBottom={1} borderColor="divider">
                  <Box
                    sx={{
                      width: 48,
                      height: 48,
                      borderRadius: 1,
                      bgcolor: 'action.hover',
                      display: 'grid',
                      placeItems: 'center',
                      fontSize: 22,
                    }}
                  >
                    🛠️
                  </Box>
                  <Box flex={1}>
                    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" mb={0.5}>
                      <Typography variant="caption" fontFamily="monospace" fontWeight={700}>
                        {activeItem.sku}
                      </Typography>
                      <SourceChip source={activeItem.source} />
                      <Typography variant="caption" color="text.secondary">
                        {activeItem.category} · {activeItem.scale || 'no scale'} scale
                      </Typography>
                    </Stack>
                    <Typography variant="h6" fontWeight={700}>
                      {activeItem.name}
                    </Typography>
                  </Box>
                </Stack>

                <TarsEvaluationSection sku={activeItem.sku} showPerform />
              </>
            )}
          </CardContent>
        </Card>
      </Box>
    </Stack>
  );
}
