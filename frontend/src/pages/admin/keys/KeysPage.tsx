import {
  Alert,
  Box,
  Button,
  Card,
  CardActionArea,
  Chip,
  Grid,
  InputAdornment,
  MenuItem,
  Paper,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useDeferredValue, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { type KeyRow, fetchKeys, fetchRings, fetchWhere } from '../../../api/keys.api';
import { PageHeader } from '../../../components/common/PageHeader';
import { ECO_ICONS } from '../../../icons/ecoIcons';
import { FindTab } from './FindTab';
import { KeyDialog } from './KeyDialog';
import { RingsTab } from './RingsTab';
import { KeyThumb, WhereChip, metricsText } from './keysShared';

const TABS = [
  { value: 'keys', label: 'Keys', short: 'Keys' },
  { value: 'rings', label: 'Rings', short: 'Rings' },
  { value: 'where', label: 'Where is everything', short: 'Where' },
  { value: 'find', label: 'Find a key', short: 'Find' },
] as const;
type TabValue = (typeof TABS)[number]['value'];

/** Every key: search, ring filter, and a table on desktop / cards on a phone. */
function KeysTab() {
  const theme = useTheme();
  const phone = useMediaQuery(theme.breakpoints.down('md'));
  const [q, setQ] = useState('');
  const [ring, setRing] = useState<'' | 'none' | number>('');
  const query = useDeferredValue(q);
  const { data: keys = [], isLoading } = useQuery({
    queryKey: ['keys', 'list', query, ring],
    queryFn: () => fetchKeys({ q: query || undefined, ring: ring === '' ? undefined : ring }),
  });
  const { data: rings = [] } = useQuery({ queryKey: ['keys', 'rings'], queryFn: fetchRings });
  const [open, setOpen] = useState<{ key: KeyRow | null } | null>(null);
  const SearchIcon = ECO_ICONS.search;

  return (
    <Stack spacing={2}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
        <TextField
          size="small"
          placeholder="Search keys"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          sx={{ flex: 1, maxWidth: { sm: 480 } }}
          slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> } }}
        />
        <TextField
          select
          size="small"
          label="Ring"
          value={ring}
          onChange={(e) => setRing(e.target.value === '' || e.target.value === 'none' ? (e.target.value as '' | 'none') : Number(e.target.value))}
          sx={{ minWidth: 180 }}
        >
          <MenuItem value="">All keys</MenuItem>
          <MenuItem value="none">Not on a ring</MenuItem>
          {rings.map((r) => (
            <MenuItem key={r.id} value={r.id}>
              {r.name}
            </MenuItem>
          ))}
        </TextField>
        <Box sx={{ flex: { sm: 1 } }} />
        <Button variant="contained" onClick={() => setOpen({ key: null })}>
          Add key
        </Button>
      </Stack>
      <Typography variant="body2" color="text.secondary">
        {isLoading ? 'Loading...' : `${keys.length} key${keys.length === 1 ? '' : 's'}`}
      </Typography>
      {!isLoading && !keys.length ? <Alert severity="info">{q || ring !== '' ? 'No keys match.' : 'No keys yet. Add the first one with its photo.'}</Alert> : null}
      {phone ? (
        <Stack spacing={1}>
          {keys.map((k) => (
            <Card key={k.id} variant="outlined">
              <CardActionArea onClick={() => setOpen({ key: k })} sx={{ p: 1.5, display: 'flex', justifyContent: 'flex-start', gap: 1.5 }}>
                <KeyThumb url={k.thumbnail_url} />
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Typography noWrap fontWeight={600}>
                    {k.name}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" component="div" noWrap>
                    {k.ring_name || 'Not on a ring'}
                    {metricsText(k) ? ` · ${metricsText(k)}` : ''}
                  </Typography>
                  <Box sx={{ mt: 0.5 }}>
                    <WhereChip where={k.where} />
                  </Box>
                </Box>
              </CardActionArea>
            </Card>
          ))}
        </Stack>
      ) : keys.length ? (
        <Paper variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ width: 120 }}>Photo</TableCell>
                <TableCell>Name</TableCell>
                <TableCell>Ring</TableCell>
                <TableCell>Where</TableCell>
                <TableCell>What the AI read</TableCell>
                <TableCell>Notes</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {keys.map((k) => (
                <TableRow key={k.id} hover onClick={() => setOpen({ key: k })} sx={{ cursor: 'pointer' }}>
                  <TableCell>
                    <KeyThumb url={k.thumbnail_url} size={56} />
                  </TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>{k.name}</TableCell>
                  <TableCell>{k.ring_name || <Typography variant="body2" color="text.secondary">None</Typography>}</TableCell>
                  <TableCell>
                    <WhereChip where={k.where} />
                  </TableCell>
                  <TableCell>{metricsText(k) || <Typography variant="body2" color="text.secondary">Not read</Typography>}</TableCell>
                  <TableCell sx={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{k.notes}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>
      ) : null}
      <KeyDialog open={!!open} keyRow={open?.key ?? null} onClose={() => setOpen(null)} />
    </Stack>
  );
}

/** Where is everything: each ring, where it is now and its keys; then the keys on no ring. */
function WhereTab() {
  const { data, isLoading } = useQuery({ queryKey: ['keys', 'where'], queryFn: fetchWhere });
  const [open, setOpen] = useState<KeyRow | null>(null);
  if (isLoading || !data) return <Typography color="text.secondary">Loading...</Typography>;
  const out = data.rings.filter((r) => r.where.status === 'out').length;
  const keyChips = (keys: KeyRow[]) => (
    <Stack direction="row" flexWrap="wrap" useFlexGap spacing={1}>
      {keys.map((k) => (
        <Chip
          key={k.id}
          label={k.name}
          onClick={() => setOpen(k)}
          avatar={k.thumbnail_url ? <Box component="img" src={k.thumbnail_url} alt="" sx={{ objectFit: 'contain', bgcolor: '#fff' }} /> : undefined}
          variant="outlined"
        />
      ))}
      {!keys.length ? <Typography variant="body2" color="text.secondary">No keys.</Typography> : null}
    </Stack>
  );
  return (
    <Stack spacing={2}>
      <Typography color="text.secondary">
        {data.rings.length} ring{data.rings.length === 1 ? '' : 's'}, {out} out now · {data.loose_keys.length} key
        {data.loose_keys.length === 1 ? '' : 's'} on no ring
      </Typography>
      <Grid container spacing={2}>
        {data.rings.map((r) => (
          <Grid key={r.id} size={{ xs: 12, md: 6 }}>
            <Paper variant="outlined" sx={{ p: 2, height: '100%' }}>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }} sx={{ mb: 1.5 }}>
                <Typography variant="h6" sx={{ flex: 1 }} noWrap>
                  {r.name}
                </Typography>
                <WhereChip where={r.where} />
              </Stack>
              {keyChips(r.keys)}
            </Paper>
          </Grid>
        ))}
      </Grid>
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="h6" sx={{ mb: 1.5 }}>
          Not on a ring
        </Typography>
        {keyChips(data.loose_keys)}
      </Paper>
      <KeyDialog open={!!open} keyRow={open} onClose={() => setOpen(null)} />
    </Stack>
  );
}

/** Keys and key rings (owner, 2026-10-26): every key with its photo, every ring, and where everything is. */
export default function KeysPage() {
  const theme = useTheme();
  const phone = useMediaQuery(theme.breakpoints.down('sm'));
  const [params, setParams] = useSearchParams();
  const tab = (TABS.find((t) => t.value === params.get('tab'))?.value ?? 'keys') as TabValue;
  return (
    <Box sx={{ maxWidth: 1400 }}>
      <PageHeader title="Keys" subtitle="Every key and key ring, and where each one is" />
      <Tabs
        value={tab}
        onChange={(_e, v: TabValue) => setParams(v === 'keys' ? {} : { tab: v }, { replace: true })}
        variant={phone ? 'fullWidth' : 'standard'}
        sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}
      >
        {TABS.map((t) => (
          <Tab key={t.value} value={t.value} label={phone ? t.short : t.label} sx={{ minWidth: 0 }} />
        ))}
      </Tabs>
      {tab === 'keys' ? <KeysTab /> : null}
      {tab === 'rings' ? <RingsTab /> : null}
      {tab === 'where' ? <WhereTab /> : null}
      {tab === 'find' ? <FindTab /> : null}
    </Box>
  );
}
