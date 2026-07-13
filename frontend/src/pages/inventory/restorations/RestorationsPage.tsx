import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import {
  Badge,
  Box,
  Button,
  CircularProgress,
  List,
  ListItemButton,
  ListItemText,
  Paper,
  Stack,
  Tab,
  Tabs,
  Typography,
} from '@mui/material';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getRestorationJob } from '../../../api/inventory.api';
import { PageHeader } from '../../../components/common/PageHeader';
import {
  useRestorationsFromDesk,
  useValuationPendingJobs,
} from '../../../hooks/useRestorationBench';
import type { RestorationJobDTO } from '../../../types/inventory.types';
import { RestorationsFromDecisionPanel } from './RestorationsFromDecisionPanel';
import { RestorationsFromList } from './RestorationsFromList';
import { RestorationsToSetupPanel } from './RestorationsToSetupPanel';

type Lane = 'from' | 'to';

function parseLane(raw: string | null): Lane {
  return raw === 'to' ? 'to' : 'from';
}

function safeBackPath(from: string | null): string | null {
  if (!from) return null;
  if (!from.startsWith('/') || from.startsWith('//')) return null;
  return from;
}

export default function RestorationsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const lane = parseLane(searchParams.get('lane'));
  const jobIdParam = searchParams.get('job');
  const jobId = jobIdParam && /^\d+$/.test(jobIdParam) ? Number(jobIdParam) : null;
  const backPath = safeBackPath(searchParams.get('from'));

  const { data: fromJobs = [], isLoading: fromLoading } = useRestorationsFromDesk();
  const { data: valuationPending = [], isLoading: valuationLoading } = useValuationPendingJobs({
    enabled: lane === 'to',
  });
  const [selectedFromId, setSelectedFromId] = useState<number | null>(null);

  const toJobQuery = useQuery({
    queryKey: ['restoration-job', jobId],
    queryFn: async () => {
      if (jobId == null) return null;
      const { data } = await getRestorationJob(jobId);
      return data;
    },
    enabled: lane === 'to' && jobId != null,
  });

  useEffect(() => {
    if (lane !== 'from') return;
    if (jobId != null && fromJobs.some((j) => j.id === jobId)) {
      setSelectedFromId(jobId);
      return;
    }
    if (selectedFromId != null && fromJobs.some((j) => j.id === selectedFromId)) return;
    setSelectedFromId(fromJobs[0]?.id ?? null);
  }, [lane, jobId, fromJobs, selectedFromId]);

  const selectedFromJob = useMemo(
    () => fromJobs.find((j) => j.id === selectedFromId) ?? null,
    [fromJobs, selectedFromId],
  );

  function setLane(next: Lane) {
    const params = new URLSearchParams(searchParams);
    params.set('lane', next);
    if (next === 'from') {
      if (jobId != null && !fromJobs.some((j) => j.id === jobId)) {
        params.delete('job');
      }
    }
    setSearchParams(params, { replace: true });
  }

  function handleSelectFrom(job: RestorationJobDTO) {
    setSelectedFromId(job.id);
    const params = new URLSearchParams(searchParams);
    params.set('lane', 'from');
    params.set('job', String(job.id));
    setSearchParams(params, { replace: true });
  }

  function handleSelectToJob(job: RestorationJobDTO) {
    const params = new URLSearchParams(searchParams);
    params.set('lane', 'to');
    params.set('job', String(job.id));
    setSearchParams(params, { replace: true });
  }

  function handleBack() {
    if (backPath) {
      navigate(backPath);
      return;
    }
    navigate('/inventory/processing');
  }

  return (
    <Box sx={{ p: 2, height: '100%', display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <Stack direction="row" spacing={1} alignItems="flex-start" justifyContent="space-between">
        <PageHeader
          title="Restorations"
          subtitle="TO: set grade values for TARS · FROM: process returns (worked & untouched)"
        />
        {backPath || lane === 'to' ? (
          <Button startIcon={<ArrowBackIcon />} onClick={handleBack} sx={{ flexShrink: 0, mt: 0.5 }}>
            Back
          </Button>
        ) : null}
      </Stack>

      <Tabs
        value={lane}
        onChange={(_, next: Lane) => setLane(next)}
        sx={{ borderBottom: 1, borderColor: 'divider', minHeight: 40 }}
      >
        <Tab value="from" label={`FROM (${fromJobs.length})`} sx={{ minHeight: 40, fontWeight: 800 }} />
        <Tab
          value="to"
          label={
            <Badge
              color="warning"
              badgeContent={valuationPending.length || 0}
              invisible={!valuationPending.length}
              sx={{ '& .MuiBadge-badge': { fontWeight: 900 } }}
            >
              <Box component="span" sx={{ pr: valuationPending.length ? 1.25 : 0 }}>TO setup</Box>
            </Badge>
          }
          sx={{ minHeight: 40, fontWeight: 800 }}
        />
      </Tabs>

      {lane === 'from' ? (
        fromLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
            <CircularProgress size={32} />
          </Box>
        ) : (
          <Box
            sx={{
              flex: 1,
              minHeight: 0,
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', md: 'minmax(280px, 38%) 1fr' },
              gap: 1.25,
            }}
          >
            <Paper variant="outlined" sx={{ overflow: 'auto', maxHeight: { xs: 360, md: 'calc(100vh - 220px)' } }}>
              <RestorationsFromList
                jobs={fromJobs}
                selectedId={selectedFromId}
                onSelect={handleSelectFrom}
              />
            </Paper>
            <Paper variant="outlined" sx={{ overflow: 'auto', maxHeight: { xs: 'none', md: 'calc(100vh - 220px)' } }}>
              {selectedFromJob ? (
                <RestorationsFromDecisionPanel
                  job={selectedFromJob}
                  onHandled={() => setSelectedFromId(null)}
                />
              ) : (
                <Box sx={{ p: 3 }}>
                  <Typography color="text.secondary">Select a return to review and act.</Typography>
                </Box>
              )}
            </Paper>
          </Box>
        )
      ) : (
        <Box
          sx={{
            flex: 1,
            minHeight: 0,
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', md: 'minmax(240px, 32%) 1fr' },
            gap: 1.25,
          }}
        >
          <Paper variant="outlined" sx={{ overflow: 'auto', maxHeight: { xs: 280, md: 'calc(100vh - 220px)' } }}>
            <Box sx={{ px: 1.25, py: 1, borderBottom: 1, borderColor: 'divider' }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 900 }}>
                Valuation requests ({valuationPending.length})
              </Typography>
              <Typography variant="caption" color="text.secondary">
                TARS asked Processing to fill missing grade values.
              </Typography>
            </Box>
            {valuationLoading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                <CircularProgress size={28} />
              </Box>
            ) : valuationPending.length ? (
              <List dense disablePadding>
                {valuationPending.map((job) => {
                  const selected = job.id === jobId;
                  const grades = Array.isArray(job.valuation_requested_grades)
                    ? job.valuation_requested_grades.join(', ')
                    : '';
                  return (
                    <ListItemButton
                      key={job.id}
                      selected={selected}
                      onClick={() => handleSelectToJob(job)}
                      sx={{
                        borderLeft: selected ? 4 : 0,
                        borderColor: 'warning.main',
                        bgcolor: selected ? 'warning.50' : undefined,
                      }}
                    >
                      <ListItemText
                        primary={`${job.sku ?? '—'} · ${job.name}`}
                        secondary={`${job.stage}${grades ? ` · need ${grades}` : ''}`}
                        primaryTypographyProps={{ fontWeight: 800, fontSize: 13 }}
                        secondaryTypographyProps={{ fontSize: 12 }}
                      />
                    </ListItemButton>
                  );
                })}
              </List>
            ) : (
              <Box sx={{ p: 2 }}>
                <Typography variant="body2" color="text.secondary">
                  No open valuation requests.
                </Typography>
              </Box>
            )}
          </Paper>

          <Paper variant="outlined" sx={{ p: 1.5, overflow: 'auto', maxHeight: { xs: 'none', md: 'calc(100vh - 220px)' } }}>
            {jobId == null ? (
              <Box sx={{ py: 3 }}>
                <Typography color="text.secondary">
                  Select a valuation request, or open TO setup from Processing after sending an item (
                  <code>?lane=to&amp;job=&lt;id&gt;</code>).
                </Typography>
              </Box>
            ) : toJobQuery.isLoading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
                <CircularProgress size={32} />
              </Box>
            ) : toJobQuery.data ? (
              <RestorationsToSetupPanel
                job={toJobQuery.data}
                onSaved={(saved) => {
                  queryClient.setQueryData(['restoration-job', saved.id], saved);
                  void queryClient.invalidateQueries({ queryKey: ['restoration-jobs', 'valuation-pending'] });
                }}
              />
            ) : (
              <Typography color="error">Could not load restoration job #{jobId}.</Typography>
            )}
          </Paper>
        </Box>
      )}
    </Box>
  );
}
