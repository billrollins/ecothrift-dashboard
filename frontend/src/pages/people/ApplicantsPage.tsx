import {
  Box,
  Button,
  ButtonBase,
  IconButton,
  InputAdornment,
  Menu,
  MenuItem,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import ClearIcon from '@mui/icons-material/Clear';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link as RouterLink, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
  getApplication,
  getApplicationCounts,
  getApplications,
  getJobs,
  type ApplicationRow,
  type Job,
  type Stage,
} from '../../api/hiring.api';
import { PageHeader } from '../../components/common/PageHeader';
import { ccTokens } from '../../theme';
import { AddApplicantDialog } from './ApplicantDialogs';
import { ApplicantView } from './ApplicantView';
import { CLOSED_STAGES, groupByStage, rowHint, sortForStage, timeText, todaysInterviews } from './applicantTimeline';
import { PracticeDialog } from './PracticeDialog';
import { StageTimeline } from './StageTimeline';
import { IconMore as MoreVertIcon, IconSearch as SearchIcon } from '../../icons/ecoIcons';

type Flag = '' | 'red' | 'green';

function Filters({
  search,
  setSearch,
  job,
  setJob,
  flag,
  setFlag,
  jobs,
}: {
  search: string;
  setSearch: (v: string) => void;
  job: string;
  setJob: (v: string) => void;
  flag: Flag;
  setFlag: (v: Flag) => void;
  jobs: Job[];
}) {
  return (
    <Box sx={{ mb: 2 }}>
      <TextField
        size="small"
        fullWidth
        placeholder="Search name, email or phone"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon fontSize="small" />
            </InputAdornment>
          ),
          endAdornment: search ? (
            <InputAdornment position="end">
              <IconButton size="small" aria-label="Clear search" onClick={() => setSearch('')}>
                <ClearIcon fontSize="small" />
              </IconButton>
            </InputAdornment>
          ) : undefined,
        }}
        sx={{ bgcolor: '#fff' }}
      />
      <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
        <TextField select size="small" label="Role" value={job} onChange={(e) => setJob(e.target.value)} fullWidth sx={{ bgcolor: '#fff' }}>
          <MenuItem value="">All roles</MenuItem>
          {jobs.map((j) => (
            <MenuItem key={j.id} value={j.slug}>
              {j.title}
            </MenuItem>
          ))}
        </TextField>
        <TextField select size="small" label="Must-haves" value={flag} onChange={(e) => setFlag(e.target.value as Flag)} fullWidth sx={{ bgcolor: '#fff' }}>
          <MenuItem value="">Any</MenuItem>
          <MenuItem value="green">All green</MenuItem>
          <MenuItem value="red">Has a red</MenuItem>
        </TextField>
      </Box>
    </Box>
  );
}

/** Nobody picked yet (desktop): who needs you first. */
function Overview({
  groups,
  today,
  total,
  onPick,
}: {
  groups: Partial<Record<Stage, ApplicationRow[]>> | undefined;
  today: ApplicationRow[];
  total: number | undefined;
  onPick: (id: number) => void;
}) {
  const now = new Date();
  const lists = [
    { title: 'Interviews today', rows: today, hint: (r: ApplicationRow) => timeText(new Date(r.next_interview!)) },
    { title: 'New: waiting longest', rows: groups?.new ?? [], hint: (r: ApplicationRow) => rowHint(r, now).text },
    { title: 'Interviewed: decide', rows: groups?.interviewed ?? [], hint: (r: ApplicationRow) => rowHint(r, now).text },
    { title: 'Offers out', rows: groups?.offer ?? [], hint: (r: ApplicationRow) => rowHint(r, now).text },
  ].filter((l) => l.rows.length > 0);
  return (
    <Box sx={{ p: 3, borderRadius: ccTokens.r, border: `1px solid ${ccTokens.line}`, bgcolor: ccTokens.card }}>
      <Typography variant="h6" fontWeight={700}>
        {total === 0 ? 'No applicants yet' : 'Pick someone on the timeline'}
      </Typography>
      <Typography color="text.secondary" sx={{ mt: 0.5 }}>
        {total === 0
          ? 'New applications land here. Turn the careers page on in Jobs & careers page when you are ready.'
          : lists.length
            ? 'Who needs you first:'
            : 'Nothing is waiting on you right now.'}
      </Typography>
      {lists.length > 0 && (
        <Box sx={{ display: 'grid', gridTemplateColumns: { md: '1fr', lg: '1fr 1fr' }, gap: 2, mt: 2 }}>
          {lists.map((list) => (
            <Box key={list.title} sx={{ p: 1.5, borderRadius: ccTokens.rSm, bgcolor: '#fafaf7', border: `1px solid ${ccTokens.line}` }}>
              <Typography variant="overline" sx={{ color: ccTokens.ink2, fontWeight: 700 }}>
                {list.title} · {list.rows.length}
              </Typography>
              {list.rows.slice(0, 5).map((row) => (
                <ButtonBase
                  key={row.id}
                  onClick={() => onPick(row.id)}
                  sx={{ width: '100%', display: 'flex', gap: 1, px: 1, py: 0.75, borderRadius: ccTokens.rSm, '&:hover': { bgcolor: '#f0f0ea' } }}
                >
                  <Typography noWrap sx={{ flex: 1, textAlign: 'left', fontWeight: 600, fontSize: 14 }}>
                    {row.full_name}
                  </Typography>
                  <Typography sx={{ fontSize: 12, color: ccTokens.ink3 }}>{list.hint(row)}</Typography>
                </ButtonBase>
              ))}
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}

export default function ApplicantsPage() {
  const theme = useTheme();
  const wide = useMediaQuery(theme.breakpoints.up('md'));
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const navigate = useNavigate();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const [job, setJob] = useState(params.get('job') ?? '');
  const [flag, setFlag] = useState<Flag>('');
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [openClosed, setOpenClosed] = useState<Stage[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [practiceOpen, setPracticeOpen] = useState(false);
  const [menu, setMenu] = useState<HTMLElement | null>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const openId = Number(params.get('id')) || null;

  useEffect(() => {
    const t = setTimeout(() => setQ(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  const filters = { job, flag, q };
  const jobs = useQuery({ queryKey: ['hiring', 'jobs'], queryFn: async () => (await getJobs()).data });
  const counts = useQuery({
    queryKey: ['hiring', 'counts', job, flag, q],
    queryFn: async () => (await getApplicationCounts(filters)).data,
  });
  const active = useQuery({
    queryKey: ['hiring', 'applications', 'open', job, flag, q],
    queryFn: async () => (await getApplications({ stage: 'open', ...filters })).data,
  });
  // Hired and Not now only grow: load them when opened, or when searching.
  const hired = useQuery({
    queryKey: ['hiring', 'applications', 'hired', job, flag, q],
    queryFn: async () => (await getApplications({ stage: 'hired', ...filters })).data,
    enabled: openClosed.includes('hired') || !!q,
  });
  const notNow = useQuery({
    queryKey: ['hiring', 'applications', 'not_now', job, flag, q],
    queryFn: async () => (await getApplications({ stage: 'not_now', ...filters })).data,
    enabled: openClosed.includes('not_now') || !!q,
  });
  const selected = useQuery({
    queryKey: ['hiring', 'application', openId],
    queryFn: async () => (await getApplication(openId!)).data,
    enabled: !!openId,
  });

  // Searching opens Hired and Not now when they hold a match; a link to someone in them opens theirs.
  useEffect(() => {
    const want = new Set<Stage>();
    if (q && hired.data?.results.length) want.add('hired');
    if (q && notNow.data?.results.length) want.add('not_now');
    const stage = selected.data?.stage;
    if (stage && CLOSED_STAGES.includes(stage)) want.add(stage);
    if ([...want].some((s) => !openClosed.includes(s))) setOpenClosed((o) => [...new Set([...o, ...want])]);
  }, [q, hired.data, notNow.data, selected.data?.stage]); // eslint-disable-line react-hooks/exhaustive-deps

  // On a phone, a new person starts at the top.
  useEffect(() => {
    if (!wide) topRef.current?.scrollIntoView({ block: 'start' });
  }, [openId, wide]);

  const groups = useMemo(() => (active.data ? groupByStage(active.data.results) : undefined), [active.data]);
  const today = useMemo(() => todaysInterviews(active.data?.results ?? [], new Date()), [active.data]);
  const closedRows = {
    hired: hired.data ? sortForStage('hired', hired.data.results) : undefined,
    not_now: notNow.data ? sortForStage('not_now', notNow.data.results) : undefined,
  };

  function open(id: number | null) {
    const next = new URLSearchParams(params);
    next.delete('stage');
    if (id) next.set('id', String(id));
    else next.delete('id');
    // A phone's Back button returns to the list; on a desktop the choice just swaps in place.
    if (!wide && id) setParams(next, { state: { fromList: true } });
    else setParams(next, { replace: true });
  }

  function back() {
    if (!wide && (location.state as { fromList?: boolean } | null)?.fromList) navigate(-1);
    else open(null);
  }

  const jobList = jobs.data ?? [];
  const openJobs = jobList.filter((j) => j.status !== 'closed');
  const timeline = (
    <StageTimeline
      counts={counts.data?.counts}
      groups={groups}
      closedRows={closedRows}
      closedLoading={{ hired: hired.isFetching && !hired.data, not_now: notNow.isFetching && !notNow.data }}
      openClosed={openClosed}
      onToggleClosed={(stage) => setOpenClosed((o) => (o.includes(stage) ? o.filter((s) => s !== stage) : [...o, stage]))}
      today={today}
      selectedId={openId}
      touch={!wide}
      onPick={open}
    />
  );
  const filterBar = (
    <Filters search={search} setSearch={setSearch} job={job} setJob={setJob} flag={flag} setFlag={setFlag} jobs={jobList} />
  );
  const dialogs = (
    <>
      <PracticeDialog
        open={practiceOpen}
        jobs={openJobs}
        practiceCount={counts.data?.practice ?? 0}
        onClose={() => setPracticeOpen(false)}
        onCreated={(created) => {
          setPracticeOpen(false);
          enqueueSnackbar(
            created.email
              ? `Practice applicant made. The auto-reply went to ${created.email}, tagged [Practice].`
              : 'Practice applicant made (no email; use the copy-link buttons).',
            { variant: 'success', autoHideDuration: 8000 },
          );
          open(created.id);
        }}
      />
      <AddApplicantDialog
        open={addOpen}
        jobs={openJobs}
        onClose={() => setAddOpen(false)}
        onDone={async (created) => {
          setAddOpen(false);
          await queryClient.invalidateQueries({ queryKey: ['hiring'] });
          enqueueSnackbar(`${created.full_name} added`, { variant: 'success' });
          open(created.id);
        }}
      />
    </>
  );

  // ── Phone: the timeline is the list; tap a name for their page; Back returns ──
  if (!wide) {
    return (
      // The main area pads 24px; a phone gets 12px, and an open person's top bar sits flush under the app bar.
      <Box ref={topRef} sx={{ mx: -1.5, mt: openId ? -3 : -1.5 }}>
        {openId ? (
          <ApplicantView key={openId} id={openId} jobs={jobList} reasons={counts.data?.reasons ?? []} narrow onBack={back} />
        ) : (
          <>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
              <Typography variant="h5" fontWeight={700} sx={{ flex: 1 }}>
                Applicants
              </Typography>
              <Button variant="contained" onClick={() => setAddOpen(true)} sx={{ minHeight: 40 }}>
                Add
              </Button>
              <IconButton aria-label="More" onClick={(e) => setMenu(e.currentTarget)} sx={{ width: 44, height: 44 }}>
                <MoreVertIcon />
              </IconButton>
              <Menu anchorEl={menu} open={!!menu} onClose={() => setMenu(null)}>
                <MenuItem
                  onClick={() => {
                    setMenu(null);
                    setPracticeOpen(true);
                  }}
                >
                  Practice run{counts.data?.practice ? ` (${counts.data.practice})` : ''}
                </MenuItem>
                <MenuItem component={RouterLink} to="/people/interviews" onClick={() => setMenu(null)}>
                  Interviews calendar
                </MenuItem>
                <MenuItem component={RouterLink} to="/people/jobs" onClick={() => setMenu(null)}>
                  Jobs & careers page
                </MenuItem>
              </Menu>
            </Box>
            {filterBar}
            {timeline}
          </>
        )}
        {dialogs}
      </Box>
    );
  }

  // ── Desktop: the timeline on the left, the person in the main part ──
  return (
    <Box ref={topRef}>
      <PageHeader
        title="Applicants"
        subtitle="Everyone who applied at ecothrift.us/careers, plus walk-ins, along the hiring line."
        action={
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button component={RouterLink} to="/people/jobs">
              Jobs & careers page
            </Button>
            <Button variant="outlined" onClick={() => setPracticeOpen(true)}>
              Practice run{counts.data?.practice ? ` (${counts.data.practice})` : ''}
            </Button>
            <Button variant="contained" onClick={() => setAddOpen(true)}>
              Add applicant
            </Button>
          </Box>
        }
      />
      <Box sx={{ display: 'grid', gridTemplateColumns: '300px minmax(0, 1fr)', gap: 3, alignItems: 'start' }}>
        <Box
          component="nav"
          aria-label="Applicants by stage"
          sx={{ position: 'sticky', top: 0, maxHeight: 'calc(100vh - 112px)', overflowY: 'auto', pr: 0.5, pb: 2 }}
        >
          {filterBar}
          {timeline}
        </Box>
        <Box sx={{ minWidth: 0 }}>
          {openId ? (
            <ApplicantView key={openId} id={openId} jobs={jobList} reasons={counts.data?.reasons ?? []} narrow={false} onBack={back} />
          ) : (
            <Overview groups={groups} today={today} total={counts.data?.counts.all} onPick={open} />
          )}
        </Box>
      </Box>
      {dialogs}
    </Box>
  );
}
