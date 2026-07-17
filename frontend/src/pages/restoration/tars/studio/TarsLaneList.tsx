import PlayArrow from '@mui/icons-material/PlayArrow';
import WarningAmber from '@mui/icons-material/WarningAmber';
import { Box, Button, Chip, Stack, Typography } from '@mui/material';
import type { RestorationJobDTO } from '../../../../types/inventory.types';
import { TARS_PENDING_REASON_LABELS } from '../tarsWorkTypes';

export function TarsLaneList({
  lane,
  jobs,
  busy,
  onOpen,
}: {
  lane: 'inbox' | 'pending';
  jobs: RestorationJobDTO[];
  busy?: boolean;
  onOpen: (job: RestorationJobDTO) => void;
}) {
  return (
    <Box sx={{ width: '100%', height: '100%', overflowY: 'auto', p: { xs: 1, md: 2 } }}>
      <Box sx={{ maxWidth: 1180, mx: 'auto' }}>
        <Box sx={{ mb: 1.5 }}>
          <Typography variant="h5" sx={{ color: '#172033', fontWeight: 950 }}>
            {lane === 'inbox' ? 'Restoration Inbox' : 'Pending work'}
          </Typography>
          <Typography variant="body2" sx={{ color: '#65748a' }}>
            {lane === 'inbox'
              ? 'Scan an item or choose one job to move onto your Bench.'
              : 'Resume one item when parts, tools, time, or approval are ready.'}
          </Typography>
        </Box>
        {jobs.length === 0 ? (
          <Box
            sx={{
              py: 8,
              textAlign: 'center',
              borderRadius: 2,
              bgcolor: '#fff',
              border: '1px dashed #b8c3d0',
              color: '#65748a',
            }}
          >
            <Typography variant="body1" fontWeight={850}>No items in {lane}.</Typography>
          </Box>
        ) : (
          <Stack spacing={0.75}>
            {jobs.map((job) => {
              const sku = job.items[0]?.sku ?? job.sku ?? `Job ${job.id}`;
              const missing = job.needs_setup;
              const projectedPending = (
                job.work_session as { pending?: { partsReceived?: boolean } } | undefined
              )?.pending;
              return (
                <Box
                  key={job.id}
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: { xs: '1fr', md: 'minmax(300px, 1.3fr) minmax(220px, 1fr) auto' },
                    gap: 1.25,
                    alignItems: 'center',
                    px: 1.5,
                    py: 1.2,
                    borderRadius: 2,
                    bgcolor: '#fff',
                    border: `1px solid ${missing ? '#e5b64c' : '#cbd5df'}`,
                    boxShadow: '0 2px 7px rgba(23, 32, 51, 0.04)',
                  }}
                >
                  <Box sx={{ minWidth: 0 }}>
                    <Stack direction="row" alignItems="center" gap={0.75}>
                      <Typography sx={{ fontFamily: 'monospace', color: '#0b665e', fontWeight: 950 }}>
                        {sku}
                      </Typography>
                      {missing ? (
                        <Chip
                          size="small"
                          icon={<WarningAmber />}
                          label="Values missing"
                          sx={{ height: 22, bgcolor: '#fff4cf', color: '#874c06', fontWeight: 850 }}
                        />
                      ) : null}
                    </Stack>
                    <Typography variant="body1" noWrap sx={{ color: '#172033', fontWeight: 900 }}>
                      {job.name}
                    </Typography>
                    <Typography variant="caption" sx={{ color: '#7a8798' }}>
                      {job.brand || 'Unknown brand'} · {job.category || 'General'} · {job.scale || 'No scale'}
                    </Typography>
                  </Box>
                  <Box>
                    {lane === 'pending' ? (
                      <>
                        <Typography variant="caption" sx={{ color: '#65748a', fontWeight: 850 }}>
                          HOLD REASON
                        </Typography>
                        <Typography variant="body2" sx={{ color: '#344258', fontWeight: 850 }}>
                          {job.pending_reason
                            ? TARS_PENDING_REASON_LABELS[job.pending_reason]
                            : 'Pending'}
                        </Typography>
                        {job.pending_notes ? (
                          <Typography variant="caption" noWrap sx={{ display: 'block', color: '#65748a' }}>
                            Follow-up: {job.pending_notes}
                          </Typography>
                        ) : null}
                        {job.pending_storage_location ? (
                          <Typography variant="caption" sx={{ display: 'block', color: '#7a8798' }}>
                            Stored: {job.pending_storage_location}
                          </Typography>
                        ) : null}
                        {job.pending_reason === 'parts_needed' ? (
                          <Chip
                            size="small"
                            label={projectedPending?.partsReceived ? 'Parts received' : 'Waiting for parts'}
                            sx={{
                              mt: 0.4,
                              height: 21,
                              bgcolor: projectedPending?.partsReceived ? '#e8f7ed' : '#f1f4f7',
                              color: projectedPending?.partsReceived ? '#26703a' : '#526177',
                              fontWeight: 850,
                            }}
                          />
                        ) : null}
                      </>
                    ) : (
                      <>
                        <Typography variant="caption" sx={{ color: '#65748a', fontWeight: 850 }}>
                          PROCESSING HANDOFF
                        </Typography>
                        <Typography variant="body2" noWrap sx={{ color: '#344258' }}>
                          {job.processing_handoff?.condition_evidence || 'No handoff notes'}
                        </Typography>
                      </>
                    )}
                  </Box>
                  <Button
                    variant="contained"
                    startIcon={<PlayArrow />}
                    disabled={busy}
                    onClick={() => onOpen(job)}
                    sx={{
                      minWidth: 150,
                      textTransform: 'none',
                      fontWeight: 950,
                      bgcolor: '#087b6f',
                      '&:hover': { bgcolor: '#06665d' },
                    }}
                  >
                    {lane === 'pending' ? 'Resume on Bench' : 'Check in'}
                  </Button>
                </Box>
              );
            })}
          </Stack>
        )}
      </Box>
    </Box>
  );
}

