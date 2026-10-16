/**
 * Users → Members (owner 2026-10-16): every member, newest first. Each cell is two lines:
 * Name / Member # · Since / ThriftBucks · Returns · Phone / Email · Holds · Stage / Notes.
 * Stages: Needs Finalize (email confirmed, finish at a register), Member, Off. Unconfirmed sign-ups are not listed.
 */
import { useEffect, useMemo, useState } from 'react';
import { Box, Chip, InputAdornment, Stack, TextField, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import { useQuery } from '@tanstack/react-query';
import { GRID_FILL_SX, GRID_PAGE_PROPS, GRID_SX, PAGE_FILL_SX, noRowsSlot } from '../../../components/common/gridChrome';
import MemberDrawer from '../../../components/users/MemberDrawer';
import { PersonCell, StackCell, StateChip, formatWhen, relativeDay } from '../../../components/users/userChrome';
import { STAGE_LABEL, fetchMembers, shortBucks, type MemberRow, type MemberStage } from '../../../api/memberDirectory.api';
import { useIsMobileLayout } from '../../../hooks/useIsMobileLayout';
import { formatPhone } from '../../../utils/formatPhone';
import { IconSearch as Search } from '../../../icons/ecoIcons';

type Filter = 'all' | MemberStage;

export const MEMBERS_KEY = ['members'];

export function useMembers() {
  return useQuery({ queryKey: MEMBERS_KEY, queryFn: fetchMembers, staleTime: 15_000 });
}

const TONE: Record<MemberStage, 'good' | 'warn' | 'muted'> = {
  member: 'good', needs_finalize: 'warn', off: 'muted', unconfirmed: 'muted',
};

function matches(row: MemberRow, q: string): boolean {
  if (!q) return true;
  const hay = `${row.name} ${row.second} ${row.email} ${row.number} ${row.notes}`.toLowerCase();
  const digits = q.replace(/\D/g, '');
  // A member code matches typed with or without its spaces, or scanned as the app's QR ("TP716671720440").
  return hay.includes(q.toLowerCase())
    || (digits.length >= 3 && ((row.phone || '').includes(digits) || (row.number || '').replace(/\D/g, '').includes(digits)));
}

/** The quick marks under a name: Staff, a waiting message, an old account. */
function Marks({ row }: { row: MemberRow }) {
  const marks = [row.staff ? `Staff: ${row.staff}` : '', row.needs_reply ? 'Message waiting' : '', row.legacy ? 'Old account' : '']
    .filter(Boolean);
  if (!marks.length) return null;
  return (
    <Stack direction="row" spacing={0.5} sx={{ mt: 0.25 }}>
      {marks.map((m) => (
        <Chip key={m} size="small" label={m} color={m === 'Message waiting' ? 'warning' : 'default'} variant="outlined"
          sx={{ height: 18, fontSize: 11 }} />
      ))}
    </Stack>
  );
}

/**
 * A member on a phone (owner 2026-10-16: lookups are common, phone first): two short lines. The name (cut with "…")
 * and the stage; then #number · ••phone's last 4 · ThriftBucks. The number never shrinks.
 */
function MobileRow({ row, onOpen }: { row: MemberRow; onOpen: (r: MemberRow) => void }) {
  const meta = { fontSize: 13, color: 'text.secondary', whiteSpace: 'nowrap' } as const;
  return (
    <Box component="button" type="button" onClick={() => onOpen(row)} aria-label={`Open ${row.name}`} data-testid="member-mobile-row"
      sx={{ display: 'block', width: '100%', textAlign: 'left', px: 1.5, py: 0.9, border: '1px solid', borderColor: 'divider',
        borderRadius: 2, bgcolor: 'background.paper', cursor: 'pointer', font: 'inherit', color: 'inherit',
        opacity: row.stage === 'off' ? 0.6 : 1 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
        <Typography noWrap sx={{ flex: 1, minWidth: 0, fontWeight: 700, fontSize: 15 }}>
          {row.name}{row.second ? <Box component="span" sx={{ fontWeight: 400, color: 'text.secondary' }}>{` + ${row.second.split(' ')[0]}`}</Box> : null}
        </Typography>
        <Box sx={{ flexShrink: 0 }}><StateChip label={STAGE_LABEL[row.stage]} tone={TONE[row.stage]} /></Box>
      </Box>
      <Box sx={{ display: 'flex', gap: 0.75, minWidth: 0, overflow: 'hidden', mt: 0.25 }}>
        <Typography component="span" sx={{ ...meta, flexShrink: 0, fontWeight: 700 }}>{row.number}</Typography>
        <Typography component="span" sx={{ ...meta, flexShrink: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {`· ${row.phone ? `••${row.phone.slice(-4)}` : 'no phone yet'}`}
        </Typography>
        <Typography component="span" sx={{ ...meta, flexShrink: 2, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {`· ${shortBucks(row.bucks)} ThriftBucks${row.returns ? ` · ${row.returns} ret` : ''}`}
        </Typography>
      </Box>
    </Box>
  );
}

export default function MembersPanel({ openKey }: { openKey?: string | null }) {
  const isMobile = useIsMobileLayout();
  const [input, setInput] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [open, setOpen] = useState<string | null>(openKey ?? null);
  const { data, isLoading, isError } = useMembers();

  useEffect(() => {
    const t = window.setTimeout(() => setSearch(input.trim()), 200);
    return () => window.clearTimeout(t);
  }, [input]);

  const rows = useMemo(
    () => (data || []).filter((r) => (filter === 'all' ? true : r.stage === filter)).filter((r) => matches(r, search)),
    [data, filter, search],
  );
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of data || []) c[r.stage] = (c[r.stage] ?? 0) + 1;
    return c;
  }, [data]);
  const current = (data || []).find((r) => r.key === open) ?? null;

  const columns: GridColDef<MemberRow>[] = useMemo(() => [
    {
      field: 'name', headerName: 'Name / Member #', flex: 1.3, minWidth: 190, sortable: false,
      renderCell: ({ row }) => (
        <Box sx={{ minWidth: 0, py: 0.5 }}>
          <PersonCell name={row.name} secondary={`${row.number}${row.second ? ` · with ${row.second}` : ''}`}
            seed={row.email || row.key} muted={row.stage === 'off'} />
          <Marks row={row} />
        </Box>
      ),
    },
    {
      // Since with its time (owner 2026-10-16), the room taken from Name and Phone.
      field: 'since', headerName: 'Since / ThriftBucks · Returns', width: 240,
      renderCell: ({ row }) => (
        <StackCell top={formatWhen(row.since) || '-'}
          bottom={`${shortBucks(row.bucks)} ThriftBucks · ${row.returns} return${row.returns === 1 ? '' : 's'}`} />
      ),
    },
    {
      field: 'phone', headerName: 'Phone / Email', flex: 1, minWidth: 170, sortable: false,
      renderCell: ({ row }) => (
        <StackCell top={row.phone ? formatPhone(row.phone) : 'No phone yet'} bottom={row.email || 'No email'} />
      ),
    },
    {
      field: 'holds_active', headerName: 'Holds / Last visit', width: 140,
      renderCell: ({ row }) => (
        <StackCell top={row.holds_total ? `${row.holds_active} active · ${row.holds_total}` : 'None'}
          bottom={row.last_visit ? `visited ${relativeDay(row.last_visit)}` : 'no visit yet'} />
      ),
    },
    {
      field: 'stage', headerName: 'State / Notes', flex: 1.2, minWidth: 180,
      renderCell: ({ row }) => (
        <Box sx={{ minWidth: 0 }}>
          {/* Owner 2026-10-16: a Staff pill when the membership is linked to a staff login. */}
          <Stack direction="row" spacing={0.5} alignItems="center">
            <StateChip label={STAGE_LABEL[row.stage]} tone={TONE[row.stage]} />
            {row.staff ? <Chip size="small" label="Staff" color="info" variant="outlined" sx={{ fontWeight: 600 }} /> : null}
          </Stack>
          <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block', mt: 0.25 }}>
            {(row.notes || '').trim() || '-'}
          </Typography>
        </Box>
      ),
    },
  ], []);

  if (isError && !data) return <Typography color="error" variant="body2">Could not load members.</Typography>;

  return (
    <Box sx={PAGE_FILL_SX}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ sm: 'center' }} sx={{ mb: 2, flexShrink: 0 }}>
        <TextField size="small" placeholder="Search name, email, phone, # or notes" value={input}
          onChange={(e) => setInput(e.target.value)} fullWidth={isMobile}
          InputProps={{ startAdornment: <InputAdornment position="start"><Search fontSize="small" /></InputAdornment> }}
          sx={{ minWidth: isMobile ? 0 : 280, flex: isMobile ? undefined : '1 1 280px' }} />
        <ToggleButtonGroup exclusive size="small" value={filter} onChange={(_e, v: Filter | null) => v && setFilter(v)}>
          <ToggleButton value="all" sx={{ textTransform: 'none', px: 1.5 }}>All {data ? data.length : ''}</ToggleButton>
          <ToggleButton value="needs_finalize" sx={{ textTransform: 'none', px: 1.5 }}>Needs Finalize {counts.needs_finalize ?? 0}</ToggleButton>
          <ToggleButton value="member" sx={{ textTransform: 'none', px: 1.5 }}>Member {counts.member ?? 0}</ToggleButton>
          <ToggleButton value="off" sx={{ textTransform: 'none', px: 1.5 }}>Off {counts.off ?? 0}</ToggleButton>
        </ToggleButtonGroup>
      </Stack>

      {isMobile ? (
        <Stack spacing={0.75}>
          {rows.length ? rows.map((r) => <MobileRow key={r.key} row={r} onOpen={(x) => setOpen(x.key)} />) : (
            <Typography variant="body2" color="text.secondary" align="center" sx={{ py: 6 }}>
              {isLoading ? 'Loading members…' : 'No members match.'}
            </Typography>
          )}
        </Stack>
      ) : (
        <Box sx={GRID_FILL_SX}>
          <DataGrid rows={rows} columns={columns} getRowId={(r) => r.key} loading={isLoading}
            disableRowSelectionOnClick onRowClick={(p) => setOpen(p.row.key)}
            slots={noRowsSlot(search ? 'No members match this search' : 'No members yet')}
            sx={{ ...GRID_SX, cursor: 'pointer', '& .MuiDataGrid-cell': { py: 0 } }} {...GRID_PAGE_PROPS} rowHeight={48}
            columnHeaderHeight={40} initialState={{ pagination: { paginationModel: { pageSize: 50 } } }} />
        </Box>
      )}

      <MemberDrawer row={current} onClose={() => setOpen(null)} />
    </Box>
  );
}
