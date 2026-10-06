import {
  Box,
  Button,
  Chip,
  Drawer,
  InputAdornment,
  MenuItem,
  Rating,
  Tab,
  Tabs,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import SearchIcon from '@mui/icons-material/Search';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import { useEffect, useState } from 'react';
import { Link as RouterLink, useSearchParams } from 'react-router-dom';
import { getApplicationCounts, getApplications, getJobs, type ApplicationRow } from '../../api/hiring.api';
import { PageHeader } from '../../components/common/PageHeader';
import { ccTokens } from '../../theme';
import { AddApplicantDialog } from './ApplicantDialogs';
import { ApplicantPanel } from './ApplicantPanel';
import { FlagDots } from './FlagDots';
import { shortDate, STAGES } from './peopleUi';

const TABS = [{ key: 'open', label: 'Open' }, ...STAGES, { key: '', label: 'All' }];

function Row({ row, selected, onOpen }: { row: ApplicationRow; selected: boolean; onOpen: () => void }) {
  return (
    <Box
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onOpen()}
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '1fr auto', md: 'minmax(180px, 1.4fr) 1.4fr 110px 120px 130px' },
        alignItems: 'center',
        gap: { xs: 0.75, md: 2 },
        px: 2,
        py: 1.5,
        cursor: 'pointer',
        bgcolor: selected ? ccTokens.goodTint : ccTokens.card,
        borderBottom: `1px solid ${ccTokens.line}`,
        '&:hover': { bgcolor: selected ? ccTokens.goodTint : '#fafaf7' },
        '&:focus-visible': { outline: `2px solid ${ccTokens.brand}`, outlineOffset: -2 },
      }}
    >
      <Box sx={{ minWidth: 0 }}>
        <Typography fontWeight={700} noWrap>
          {row.full_name}
          {row.has_resume && <AttachFileIcon sx={{ fontSize: 15, ml: 0.5, verticalAlign: '-2px', color: ccTokens.ink3 }} />}
        </Typography>
        <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
          {row.phone || row.email || row.source_label}
        </Typography>
        {row.lead_interest === 'Yes' && (
          <Chip
            size="small"
            label="Wants to lead"
            sx={{ mt: 0.5, height: 20, fontSize: 11, fontWeight: 700, bgcolor: ccTokens.kraftTint, color: ccTokens.kraftDeep }}
          />
        )}
      </Box>
      <Box sx={{ display: { xs: 'none', md: 'flex' }, gap: 0.5, flexWrap: 'wrap' }}>
        {row.jobs.map((j) => (
          <Chip key={j.id} size="small" label={j.title.replace(' Associate', '')} variant="outlined" />
        ))}
      </Box>
      <Box sx={{ justifySelf: { xs: 'end', md: 'start' } }}>
        {row.flags.length ? <FlagDots flags={row.flags} /> : <Typography variant="caption" color="text.secondary">-</Typography>}
      </Box>
      <Box sx={{ display: { xs: 'none', md: 'block' } }}>
        <Rating size="small" value={row.rating} readOnly />
      </Box>
      <Box sx={{ gridColumn: { xs: '1 / -1', md: 'auto' }, display: 'flex', gap: 1, alignItems: 'center' }}>
        <Typography variant="caption" sx={{ color: ccTokens.ink2 }}>
          {row.stage_label} · {shortDate(row.created_at)}
        </Typography>
        <Box sx={{ display: { xs: 'flex', md: 'none' }, gap: 0.5 }}>
          {row.jobs.map((j) => (
            <Chip key={j.id} size="small" label={j.title.replace(' Associate', '')} variant="outlined" />
          ))}
        </Box>
      </Box>
    </Box>
  );
}

export default function ApplicantsPage() {
  const theme = useTheme();
  const wide = useMediaQuery(theme.breakpoints.up('md'));
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const [params, setParams] = useSearchParams();
  const [stage, setStageTab] = useState(params.get('stage') ?? 'open');
  const [job, setJob] = useState('');
  const [flag, setFlag] = useState<'' | 'red' | 'green'>('');
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const openId = Number(params.get('id')) || null;

  useEffect(() => {
    const t = setTimeout(() => setQ(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  const jobs = useQuery({ queryKey: ['hiring', 'jobs'], queryFn: async () => (await getJobs()).data });
  const counts = useQuery({
    queryKey: ['hiring', 'counts', job, flag, q],
    queryFn: async () => (await getApplicationCounts({ job, flag, q })).data,
  });
  const list = useQuery({
    queryKey: ['hiring', 'applications', stage, job, flag, q],
    queryFn: async () => (await getApplications({ stage, job, flag, q })).data,
  });

  function open(id: number | null) {
    const next = new URLSearchParams(params);
    if (id) next.set('id', String(id));
    else next.delete('id');
    setParams(next, { replace: true });
  }

  const rows = list.data?.results ?? [];
  const panel = openId ? (
    <ApplicantPanel
      key={openId}
      id={openId}
      jobs={jobs.data ?? []}
      reasons={counts.data?.reasons ?? []}
      onClose={() => open(null)}
    />
  ) : null;

  return (
    <Box>
      <PageHeader
        title="Applicants"
        subtitle="Everyone who applied at ecothrift.us/careers, plus walk-ins. Click a name to work it."
        action={
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button component={RouterLink} to="/people/jobs">
              Jobs & careers page
            </Button>
            <Button variant="contained" onClick={() => setAddOpen(true)}>
              Add applicant
            </Button>
          </Box>
        }
      />

      <Tabs
        value={stage}
        onChange={(_, value) => setStageTab(value)}
        variant="scrollable"
        scrollButtons="auto"
        sx={{ borderBottom: `1px solid ${ccTokens.line}`, mb: 2 }}
      >
        {TABS.map((tab) => {
          const n = counts.data?.counts?.[(tab.key || 'all') as keyof NonNullable<typeof counts.data>['counts']];
          return <Tab key={tab.key || 'all'} value={tab.key} label={`${tab.label}${n !== undefined ? ` (${n})` : ''}`} />;
        })}
      </Tabs>

      <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', mb: 2 }}>
        <TextField
          size="small"
          placeholder="Name, email or phone"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
          sx={{ minWidth: 240, flex: { xs: 1, sm: 'none' } }}
        />
        <TextField select size="small" label="Role" value={job} onChange={(e) => setJob(e.target.value)} sx={{ minWidth: 180 }}>
          <MenuItem value="">All roles</MenuItem>
          {(jobs.data ?? []).map((j) => (
            <MenuItem key={j.id} value={j.slug}>
              {j.title}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          select
          size="small"
          label="Must-haves"
          value={flag}
          onChange={(e) => setFlag(e.target.value as '' | 'red' | 'green')}
          sx={{ minWidth: 150 }}
        >
          <MenuItem value="">Any</MenuItem>
          <MenuItem value="green">All green</MenuItem>
          <MenuItem value="red">Has a red</MenuItem>
        </TextField>
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: wide && openId ? 'minmax(0, 1fr) 480px' : '1fr', gap: 2 }}>
        <Box sx={{ border: `1px solid ${ccTokens.line}`, borderRadius: ccTokens.r, overflow: 'hidden', bgcolor: ccTokens.card, alignSelf: 'start' }}>
          {list.isLoading && <Typography sx={{ p: 3 }} color="text.secondary">Loading…</Typography>}
          {!list.isLoading && rows.length === 0 && (
            <Box sx={{ p: 4, textAlign: 'center' }}>
              <Typography fontWeight={600}>Nobody here yet</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                {stage === 'open' || stage === 'new'
                  ? 'New applications land here. Turn the careers page on in Jobs & careers page when you are ready.'
                  : 'Try another tab or clear the filters.'}
              </Typography>
            </Box>
          )}
          {rows.map((row) => (
            <Row key={row.id} row={row} selected={row.id === openId} onOpen={() => open(row.id)} />
          ))}
        </Box>
        {wide && openId && (
          <Box
            sx={{
              border: `1px solid ${ccTokens.line}`,
              borderRadius: ccTokens.r,
              bgcolor: ccTokens.card,
              alignSelf: 'start',
              position: 'sticky',
              top: 16,
              maxHeight: 'calc(100vh - 32px)',
              overflowY: 'auto',
            }}
          >
            {panel}
          </Box>
        )}
      </Box>

      {!wide && (
        <Drawer anchor="bottom" open={!!openId} onClose={() => open(null)} PaperProps={{ sx: { height: '92vh', borderRadius: '16px 16px 0 0' } }}>
          {panel}
        </Drawer>
      )}

      <AddApplicantDialog
        open={addOpen}
        jobs={(jobs.data ?? []).filter((j) => j.status !== 'closed')}
        onClose={() => setAddOpen(false)}
        onDone={async (created) => {
          setAddOpen(false);
          await queryClient.invalidateQueries({ queryKey: ['hiring'] });
          enqueueSnackbar(`${created.full_name} added`, { variant: 'success' });
          open(created.id);
        }}
      />
    </Box>
  );
}
