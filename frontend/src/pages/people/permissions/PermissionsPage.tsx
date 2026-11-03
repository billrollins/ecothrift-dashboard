import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  IconButton,
  MenuItem,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { useTheme } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import VisibilityRoundedIcon from '@mui/icons-material/VisibilityRounded';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import { Fragment, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  getAccessHistory,
  getAccessPage,
  saveAccessLayer,
  setAccessLevel,
  type AccessArea,
  type AccessAreas,
  type AccessEntry,
  type AccessLayer,
  type AccessPage,
  type AccessPerson,
} from '../../../api/accounts.api';
import { PageHeader } from '../../../components/common/PageHeader';
import { useAuth } from '../../../contexts/AuthContext';
import { ccTokens } from '../../../theme';
import { errorText } from '../peopleUi';
import {
  dialLabel,
  FULL,
  itemsGiven,
  setStep,
  SOURCE_TEXT,
  STEP_NAMES,
  tidy,
  toggleLayerItem,
  togglePersonItem,
  type LayerKind,
} from './permissionsLogic';

type TabId = 'levels' | 'departments' | 'people' | 'history';
const TABS: { id: TabId; label: string }[] = [
  { id: 'levels', label: 'Levels' },
  { id: 'departments', label: 'Departments' },
  { id: 'people', label: 'People' },
  { id: 'history', label: 'History' },
];

const card = { p: 2, borderRadius: ccTokens.r, border: `1px solid ${ccTokens.line}`, bgcolor: ccTokens.card };

/** One column of the grid: a level, a department, or the Owner (locked at Full). */
interface Column {
  key: string;
  label: string;
  sub?: string;
  kind: LayerKind;
  locked?: boolean;
  entry: (area: string) => AccessEntry | undefined;
}

/**
 * People → Permissions (Dash Update #53, owner 2026-11-03): one dial per sidebar area for each level, each department
 * (adds only) and each person (an exception has the last word). Managers read it; the owner changes it.
 */
export default function PermissionsPage() {
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const [params, setParams] = useSearchParams();
  const tab = (TABS.some((t) => t.id === params.get('tab')) ? params.get('tab') : 'levels') as TabId;
  const page = useQuery({ queryKey: ['access', 'page'], queryFn: async () => (await getAccessPage()).data });

  const done = (data: AccessPage) => {
    queryClient.setQueryData(['access', 'page'], data);
    void queryClient.invalidateQueries({ queryKey: ['access', 'history'] });
    enqueueSnackbar('Saved', { variant: 'success' });
  };
  const fail = (err: unknown) => enqueueSnackbar(errorText(err, 'Could not save.'), { variant: 'error' });
  const save = useMutation({ mutationFn: (layer: AccessLayer) => saveAccessLayer(layer), onSuccess: (r) => done(r.data),
    onError: fail });
  const level = useMutation({
    mutationFn: ({ id, to }: { id: number; to: 'Employee' | 'Manager' }) => setAccessLevel(id, to),
    onSuccess: (r) => done(r.data),
    onError: fail,
  });

  const data = page.data;
  return (
    <Box>
      <PageHeader
        title="Permissions"
        subtitle="One dial per area: None · View · Work · Manage · Full. Each step includes the ones below it. A level sets the base, a department adds, and an exception for one person has the last word."
      />
      {page.isError && <Alert severity="error">{errorText(page.error, 'Could not load permissions.')}</Alert>}
      {!data ? (
        !page.isError && <CircularProgress />
      ) : (
        <>
          <Alert severity="info" sx={{ mb: 2 }}>
            {data.can_edit
              ? 'Giving more works everywhere now. Taking away hides the menus and pages now; the server lock follows in the next phase.'
              : 'Read only: the owner changes permissions.'}
          </Alert>
          <Tabs
            value={tab}
            onChange={(_, value: TabId) => setParams(value === 'levels' ? {} : { tab: value }, { replace: true })}
            variant="scrollable"
            sx={{ mb: 2 }}
          >
            {TABS.map((t) => <Tab key={t.id} value={t.id} label={t.label} />)}
          </Tabs>
          {tab === 'levels' && (
            <LevelsTab data={data} onSave={(layer) => save.mutate(layer)} />
          )}
          {tab === 'departments' && (
            <DepartmentsTab data={data} onSave={(layer) => save.mutate(layer)} />
          )}
          {tab === 'people' && (
            <PeopleTab
              data={data}
              onSave={(layer) => save.mutate(layer)}
              onLevel={(id, to) => level.mutate({ id, to })}
            />
          )}
          {tab === 'history' && <HistoryTab />}
        </>
      )}
    </Box>
  );
}

// ── Levels and departments: the grid ──────────────────────────────────────

function LevelsTab({ data, onSave }: { data: AccessPage; onSave: (layer: AccessLayer) => void }) {
  const columns: Column[] = [
    ...(['Employee', 'Manager'] as const).map((lv) => ({
      key: lv,
      label: lv,
      sub: `${data.people.filter((p) => p.level === lv).length} people`,
      kind: 'level' as const,
      entry: (area: string) => data.levels[lv][area],
    })),
    { key: 'Owner', label: 'Owner', sub: 'Always Full', kind: 'level', locked: true, entry: () => ({ step: FULL }) },
  ];
  const change = (col: string, area: string, entry: AccessEntry) => {
    const lv = col as 'Employee' | 'Manager';
    onSave({ kind: 'level', level: lv, areas: { ...data.levels[lv], [area]: entry } });
  };
  return (
    <Stack spacing={2}>
      <LayerGrid areas={data.catalog.areas} columns={columns} canEdit={data.can_edit} onChange={change} />
      <Box sx={card}>
        <Typography fontWeight={700} sx={{ mb: 0.5 }}>Always on for every staff login</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          On no dial, so nobody loses the basics by accident.
        </Typography>
        <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
          {data.catalog.basics.map((b) => <Chip key={b} size="small" label={b} />)}
        </Stack>
      </Box>
    </Stack>
  );
}

function DepartmentsTab({ data, onSave }: { data: AccessPage; onSave: (layer: AccessLayer) => void }) {
  if (data.departments.length === 0) {
    return <Typography color="text.secondary">No departments yet. Add them in Admin → Departments.</Typography>;
  }
  const columns: Column[] = data.departments.map((d) => ({
    key: String(d.id),
    label: d.name,
    sub: `${d.people} ${d.people === 1 ? 'person' : 'people'}`,
    kind: 'department',
    entry: (area: string) => d.areas[area],
  }));
  const change = (col: string, area: string, entry: AccessEntry) => {
    const dept = data.departments.find((d) => String(d.id) === col);
    if (!dept) return;
    onSave({ kind: 'department', department_id: dept.id, areas: tidy({ ...dept.areas, [area]: entry }, 'department') });
  };
  return (
    <Stack spacing={1.5}>
      <Typography variant="body2" color="text.secondary">
        A department only adds to its people&apos;s level: a higher dial, or single items. Most departments add nothing.
      </Typography>
      <LayerGrid areas={data.catalog.areas} columns={columns} canEdit={data.can_edit} onChange={change} />
    </Stack>
  );
}

function StepSelect({ value, kind, entry, onPick, label }: {
  value: number | null;
  kind: LayerKind;
  entry: AccessEntry | undefined;
  onPick: (step: number | null) => void;
  label: string;
}) {
  const options: { value: string; text: string }[] = [
    ...(kind === 'person' ? [{ value: '', text: 'Same as level' }] : []),
    ...STEP_NAMES.map((name, step) => ({
      value: String(step),
      text: step === 0 && kind === 'department' ? 'Adds nothing' : name,
    })),
  ];
  return (
    <TextField
      select
      size="small"
      fullWidth
      value={value == null ? '' : String(value)}
      onChange={(e) => onPick(e.target.value === '' ? null : Number(e.target.value))}
      slotProps={{
        htmlInput: { 'aria-label': label },
        select: { displayEmpty: true, renderValue: () => dialLabel(entry, kind) },
      }}
      sx={{ minWidth: 0, '& .MuiSelect-select': { py: 0.75, fontSize: 14 } }}
    >
      {options.map((o) => <MenuItem key={o.value} value={o.value}>{o.text}</MenuItem>)}
    </TextField>
  );
}

function LayerGrid({ areas, columns, canEdit, onChange }: {
  areas: AccessArea[];
  columns: Column[];
  canEdit: boolean;
  onChange: (col: string, area: string, entry: AccessEntry) => void;
}) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  // A phone shows one column at a time (picked above the grid); wider screens show them all.
  const narrow = useMediaQuery(useTheme().breakpoints.down('sm'));
  const [pick, setPick] = useState<string | null>(null);
  const picked = columns.find((c) => c.key === pick) ?? columns[0];
  const shown = narrow && picked ? [picked] : columns;
  const toggleOpen = (id: string) => setOpen((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
  const template = `minmax(${narrow ? 130 : 150}px, 1.6fr) repeat(${shown.length}, minmax(112px, 1fr))`;
  const cell = { py: 0.75, px: 0.75, borderBottom: `1px solid ${ccTokens.line}`, display: 'flex', alignItems: 'center',
    minWidth: 0 };
  return (
    <Box>
      {narrow && columns.length > 1 && (
        <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap', mb: 1 }}>
          {columns.map((c) => (
            <Chip key={c.key} label={c.label} onClick={() => setPick(c.key)}
              color={c.key === picked?.key ? 'primary' : 'default'}
              variant={c.key === picked?.key ? 'filled' : 'outlined'} />
          ))}
        </Stack>
      )}
      <Box sx={{ ...card, p: 0, overflowX: 'auto' }}>
        <Box sx={{ display: 'grid', gridTemplateColumns: template, minWidth: (narrow ? 130 : 150) + shown.length * 112 }}>
          <Box sx={{ ...cell, borderBottomColor: ccTokens.line2 }}>
            <Typography variant="caption" color="text.secondary" fontWeight={700}>Area</Typography>
          </Box>
          {shown.map((c) => (
            <Box key={c.key} sx={{ ...cell, borderBottomColor: ccTokens.line2, flexDirection: 'column', alignItems: 'flex-start' }}>
              <Typography variant="body2" fontWeight={700} noWrap>{c.label}</Typography>
              {c.sub && <Typography variant="caption" color="text.secondary" noWrap>{c.sub}</Typography>}
            </Box>
          ))}
          {areas.map((area) => {
            const isOpen = open.has(area.id);
            return (
              <Fragment key={area.id}>
                <Box sx={cell}>
                  <IconButton size="small" onClick={() => toggleOpen(area.id)} aria-label={`${isOpen ? 'Close' : 'Open'} ${area.label}`}
                    aria-expanded={isOpen}>
                    {isOpen ? <ExpandMoreIcon fontSize="small" /> : <ChevronRightIcon fontSize="small" />}
                  </IconButton>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography fontWeight={700} sx={{ fontSize: 14 }}>{area.label}</Typography>
                    {isOpen && <Typography variant="caption" color="text.secondary">{area.helper}</Typography>}
                  </Box>
                </Box>
                {shown.map((c) => {
                  const entry = c.entry(area.id);
                  return (
                    <Box key={c.key} sx={cell}>
                      {c.locked ? (
                        <Stack direction="row" spacing={0.5} alignItems="center" sx={{ color: ccTokens.ink2 }}>
                          <LockOutlinedIcon sx={{ fontSize: 16 }} />
                          <Typography variant="body2">Full</Typography>
                        </Stack>
                      ) : canEdit ? (
                        <StepSelect
                          value={entry?.step ?? (c.kind === 'department' ? 0 : null)}
                          kind={c.kind}
                          entry={entry}
                          label={`${c.label}: ${area.label}`}
                          onPick={(step) => onChange(c.key, area.id, setStep(entry, step ?? 0))}
                        />
                      ) : (
                        <Typography variant="body2">{dialLabel(entry, c.kind)}</Typography>
                      )}
                    </Box>
                  );
                })}
                {isOpen && area.items.map((item) => (
                  <Fragment key={item.id}>
                    <Box sx={{ ...cell, pl: 5, bgcolor: ccTokens.bg }}>
                      <Box sx={{ minWidth: 0 }}>
                        <Typography variant="body2">{item.label}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {item.locked ? 'Owner only' : STEP_NAMES[item.step]}
                        </Typography>
                      </Box>
                    </Box>
                    {shown.map((c) => {
                      const entry = c.entry(area.id);
                      const on = c.locked || itemsGiven(area, entry).has(item.id);
                      const changed = (entry?.add ?? []).includes(item.id) || (entry?.remove ?? []).includes(item.id);
                      const byStep = item.step <= (entry?.step ?? 0);
                      const fixed = !canEdit || c.locked || item.locked || (c.kind === 'department' && byStep);
                      return (
                        <Box key={c.key} sx={{ ...cell, bgcolor: ccTokens.bg }}>
                          <Checkbox
                            size="small"
                            checked={on}
                            disabled={fixed}
                            onChange={() => onChange(c.key, area.id,
                              toggleLayerItem(area, entry, item.id, c.kind as 'level' | 'department'))}
                            inputProps={{ 'aria-label': `${c.label}: ${item.label}` }}
                            sx={changed ? { outline: `2px solid ${ccTokens.kraft}`, outlineOffset: -6, borderRadius: 1 } : undefined}
                          />
                          {changed && <Typography variant="caption" sx={{ color: ccTokens.kraftDeep }}>changed</Typography>}
                        </Box>
                      );
                    })}
                  </Fragment>
                ))}
              </Fragment>
            );
          })}
        </Box>
      </Box>
    </Box>
  );
}

// ── People ────────────────────────────────────────────────────────────────

function PeopleTab({ data, onSave, onLevel }: {
  data: AccessPage;
  onSave: (layer: AccessLayer) => void;
  onLevel: (id: number, to: 'Employee' | 'Manager') => void;
}) {
  const [openId, setOpenId] = useState<number | null>(null);
  const { startViewAs } = useAuth();
  return (
    <Stack spacing={1}>
      {data.people.map((person) => {
        const isOpen = openId === person.id;
        return (
          <Box key={person.id} sx={card}>
            <Stack direction="row" spacing={1.5} alignItems="center" useFlexGap sx={{ flexWrap: 'wrap' }}>
              <IconButton size="small" onClick={() => setOpenId(isOpen ? null : person.id)}
                aria-label={`${isOpen ? 'Close' : 'Open'} ${person.name}`} aria-expanded={isOpen}>
                {isOpen ? <ExpandMoreIcon fontSize="small" /> : <ChevronRightIcon fontSize="small" />}
              </IconButton>
              <Box sx={{ flex: 1, minWidth: 160 }}>
                <Typography fontWeight={700}>{person.name}</Typography>
                <Typography variant="caption" color="text.secondary">
                  {[person.position, person.department?.name].filter(Boolean).join(' · ') || 'No department'}
                </Typography>
              </Box>
              {person.exception_count > 0 && (
                <Chip size="small" label={`${person.exception_count} exception${person.exception_count === 1 ? '' : 's'}`}
                  sx={{ bgcolor: ccTokens.warnTint, color: ccTokens.warnText }} />
              )}
              {person.level === 'Owner' || !data.can_edit ? (
                <Chip size="small" label={person.level} />
              ) : (
                <TextField select size="small" value={person.level} sx={{ width: 130 }}
                  onChange={(e) => onLevel(person.id, e.target.value as 'Employee' | 'Manager')}
                  slotProps={{ htmlInput: { 'aria-label': `${person.name}: level` } }}>
                  <MenuItem value="Employee">Employee</MenuItem>
                  <MenuItem value="Manager">Manager</MenuItem>
                </TextField>
              )}
              {data.can_edit && person.level !== 'Owner' && (
                <Button size="small" startIcon={<VisibilityRoundedIcon />} onClick={() => void startViewAs(person.id)}>
                  View as
                </Button>
              )}
            </Stack>
            {isOpen && <PersonAreas data={data} person={person} onSave={onSave} />}
          </Box>
        );
      })}
    </Stack>
  );
}

function PersonAreas({ data, person, onSave }: {
  data: AccessPage;
  person: AccessPerson;
  onSave: (layer: AccessLayer) => void;
}) {
  const [openArea, setOpenArea] = useState<string | null>(null);
  const owner = person.level === 'Owner';
  const canEdit = data.can_edit && !owner;
  const put = (area: string, entry: AccessEntry) => {
    const areas: AccessAreas = { ...person.exceptions, [area]: entry };
    onSave({ kind: 'person', user_id: person.id, areas: tidy(areas, 'person') });
  };
  return (
    <Stack spacing={0} sx={{ mt: 1.5, borderTop: `1px solid ${ccTokens.line}` }}>
      {data.catalog.areas.map((area) => {
        const mine = person.exceptions[area.id];
        const step = person.steps[area.id] ?? 0;
        const from = person.step_from[area.id];
        const isOpen = openArea === area.id;
        return (
          <Box key={area.id} sx={{ borderBottom: `1px solid ${ccTokens.line}`, py: 0.75 }}>
            <Stack direction="row" spacing={1} alignItems="center" useFlexGap sx={{ flexWrap: 'wrap' }}>
              <IconButton size="small" onClick={() => setOpenArea(isOpen ? null : area.id)}
                aria-label={`${isOpen ? 'Close' : 'Open'} ${area.label} for ${person.name}`} aria-expanded={isOpen}>
                {isOpen ? <ExpandMoreIcon fontSize="small" /> : <ChevronRightIcon fontSize="small" />}
              </IconButton>
              <Typography sx={{ flex: 1, minWidth: 110, fontSize: 14 }}>{area.label}</Typography>
              <Typography fontWeight={700} sx={{ width: 70, fontSize: 14 }}>{STEP_NAMES[step]}</Typography>
              <SourceChip source={from} />
              {canEdit && (
                <Box sx={{ width: 150 }}>
                  <StepSelect
                    value={mine?.step ?? null}
                    kind="person"
                    entry={mine}
                    label={`${person.name}: ${area.label}`}
                    onPick={(next) => put(area.id, { ...setStep(mine, next), until: mine?.until, note: mine?.note })}
                  />
                </Box>
              )}
            </Stack>
            {isOpen && (
              <Box sx={{ pl: 5, pt: 0.5 }}>
                {area.items.map((item) => {
                  const held = item.id in person.items;
                  const denied = person.denied.includes(item.id);
                  return (
                    <Stack key={item.id} direction="row" spacing={1} alignItems="center">
                      <Checkbox
                        size="small"
                        checked={held}
                        disabled={!canEdit || item.locked}
                        onChange={() => put(area.id, togglePersonItem(person, mine, item.id))}
                        inputProps={{ 'aria-label': `${person.name}: ${item.label}` }}
                      />
                      <Typography variant="body2" sx={{ flex: 1, textDecoration: denied ? 'line-through' : 'none' }}>
                        {item.label}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ width: 64 }}>
                        {item.locked ? 'Owner only' : STEP_NAMES[item.step]}
                      </Typography>
                      {held ? <SourceChip source={person.items[item.id]} /> : denied ? <SourceChip source="person" no /> : null}
                    </Stack>
                  );
                })}
                {canEdit && mine && (
                  <Stack direction="row" spacing={1} useFlexGap sx={{ mt: 1, flexWrap: 'wrap' }}>
                    <TextField
                      size="small"
                      type="date"
                      label="Ends after"
                      value={mine.until ?? ''}
                      onChange={(e) => put(area.id, { ...mine, until: e.target.value || undefined })}
                      slotProps={{ inputLabel: { shrink: true } }}
                      sx={{ width: 170 }}
                    />
                    <NoteField
                      key={`${area.id}-${mine.note ?? ''}`}
                      initial={mine.note ?? ''}
                      onSave={(note) => put(area.id, { ...mine, note: note || undefined })}
                    />
                  </Stack>
                )}
              </Box>
            )}
          </Box>
        );
      })}
    </Stack>
  );
}

function NoteField({ initial, onSave }: { initial: string; onSave: (note: string) => void }) {
  const [note, setNote] = useState(initial);
  return (
    <TextField
      size="small"
      label="Why (shows in History)"
      value={note}
      onChange={(e) => setNote(e.target.value)}
      onBlur={() => { if (note.trim() !== initial) onSave(note.trim()); }}
      sx={{ flex: 1, minWidth: 200 }}
    />
  );
}

function SourceChip({ source, no }: { source: string | undefined; no?: boolean }) {
  if (!source) return null;
  const tone = no
    ? { bgcolor: ccTokens.badTint, color: ccTokens.badText }
    : source === 'person'
      ? { bgcolor: ccTokens.warnTint, color: ccTokens.warnText }
      : source === 'department'
        ? { bgcolor: ccTokens.goodTint, color: ccTokens.goodText }
        : { bgcolor: ccTokens.neuTint, color: ccTokens.ink2 };
  return <Chip size="small" label={no ? 'Taken away' : SOURCE_TEXT[source] ?? source} sx={{ ...tone, height: 22 }} />;
}

// ── History ───────────────────────────────────────────────────────────────

function HistoryTab() {
  const history = useQuery({ queryKey: ['access', 'history'], queryFn: async () => (await getAccessHistory()).data });
  if (history.isError) return <Alert severity="error">{errorText(history.error, 'Could not load History.')}</Alert>;
  if (!history.data) return <CircularProgress />;
  const rows = history.data.results;
  if (rows.length === 0) return <Typography color="text.secondary">No changes yet.</Typography>;
  return (
    <Stack spacing={1}>
      {rows.map((row) => (
        <Box key={row.id} sx={{ ...card, py: 1.25 }}>
          <Stack direction="row" spacing={1} useFlexGap alignItems="baseline" sx={{ flexWrap: 'wrap' }}>
            <Typography fontWeight={700} sx={{ fontSize: 14 }}>{row.target}</Typography>
            {row.area && <Chip size="small" label={row.area} sx={{ height: 20 }} />}
            <Typography sx={{ fontSize: 14, flex: 1, minWidth: 180 }}>{row.change}</Typography>
            <Typography variant="caption" color="text.secondary">
              {row.actor || 'Someone'} · {new Date(row.at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
            </Typography>
          </Stack>
          {row.note && <Typography variant="body2" color="text.secondary">{row.note}</Typography>}
        </Box>
      ))}
    </Stack>
  );
}
