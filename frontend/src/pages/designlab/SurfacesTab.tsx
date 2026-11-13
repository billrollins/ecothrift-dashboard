/**
 * Design Lab > Surfaces (OOUX; Bill 2026-11-13): the Universal Surface every object opens in.
 *   The ten elements   what a surface is made of, in order
 *   Object map         every object, its kinds, what it links to, its window today, and the owner's ticks
 *   one per object     the object's surface on made-up data, desktop and phone side by side; a related row opens
 *                      that object's surface (the way the real window swaps, with Back)
 * The choice is kept in the URL: ?view=surfaces&object=item.
 */
import {
  Box,
  Chip,
  MenuItem,
  Snackbar,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
  useMediaQuery,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PageShell, Section, StatusPill } from '../../components/page/PageKit';
import { UniversalSurface } from '../../components/surface/UniversalSurface';
import { ECO_ICONS } from '../../icons/ecoIcons';
import { OBJECTS, OBJECT_GROUPS, objectInfo, surfaceCheckId, type ObjectId } from '../../navigation/objectCatalog';
import { DevicePicker, DeviceView } from './DeviceView';
import { Ticks, useDesignChecks } from './designChecks';
import { SURFACE_DEMOS } from './surfaceDemos';

const ELEMENTS: [string, string][] = [
  ['Bar', 'The object\'s icon, name and number. Back when one surface opened another, Full page, Close.'],
  ['Identity', 'The ID with a copy button, one status, kind chips, the name and one line under it.'],
  ['Numbers', 'Up to four big numbers that say how it is doing.'],
  ['Attention', 'The one thing that needs doing now, with its button. Never more than one; none when all is well.'],
  ['Actions', 'One main button. Everything else goes under More. On a phone the main button stays at the bottom.'],
  ['Facts', 'Titled groups of label and value. An empty value is left out; an empty group says so.'],
  ['Related', 'Every object it is tied to. Each row opens that object\'s surface in the same window; Back returns.'],
  ['Photos', 'The universal photo picker: take a photo, my photo drawer, or a file.'],
  ['Notes', 'Who, when, what. Anyone who can see it can add one.'],
  ['Timeline', 'What happened to it, newest first.'],
];

const SURFACE_STEPS = ['Standard', 'Design', 'Done'];
const ANATOMY = 'anatomy';
const MAP = 'map';

function ObjectSurface({ object, onOpen }: { object: ObjectId; onOpen: (o: ObjectId) => void }) {
  const info = objectInfo(object);
  const demo = SURFACE_DEMOS[object];
  return (
    <UniversalSurface
      {...demo}
      objectLabel={info.label}
      Icon={ECO_ICONS[info.icon]}
      number={demo.id}
      onFullPage={() => undefined}
      related={(demo.related ?? []).map((r) => {
        const target = objectInfo(r.object);
        return { title: r.title ?? target.plural, Icon: ECO_ICONS[target.icon], total: r.total, rows: r.rows };
      })}
      onOpenRelated={(group) => {
        const target = (demo.related ?? []).find((r) => (r.title ?? objectInfo(r.object).plural) === group.title);
        if (target) onOpen(target.object);
      }}
    />
  );
}

function Anatomy() {
  return (
    <Stack spacing={2}>
      <Section title="One surface for every object" hint="Click any object, anywhere in Dash, and it opens here, the same for every user.">
        <Box component="ol" sx={{ m: 0, p: 0, listStyle: 'none', display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
          {ELEMENTS.map(([name, body], i) => (
            <Stack key={name} component="li" direction="row" spacing={1.5} alignItems="flex-start">
              <Box sx={{ width: 30, height: 30, flexShrink: 0, borderRadius: '50%', display: 'grid', placeItems: 'center', bgcolor: 'primary.main', color: 'primary.contrastText', fontWeight: 800, fontSize: '0.875rem' }}>
                {i + 1}
              </Box>
              <Box>
                <Typography variant="subtitle1">{name}</Typography>
                <Typography variant="body2" color="text.secondary">{body}</Typography>
              </Box>
            </Stack>
          ))}
        </Box>
      </Section>
      <Section title="Rules">
        <Stack component="ul" spacing={0.75} sx={{ m: 0, pl: 2.5 }}>
          <Typography component="li" variant="body2">An object has one surface. A page may list objects; clicking one always opens its surface, never a page of its own.</Typography>
          <Typography component="li" variant="body2">Kinds (a vendor that is B-Stock, a supplier or a service) share one surface; a chip says which, and a kind may hide facts it does not have.</Typography>
          <Typography component="li" variant="body2">A related row opens in the same window with Back, never a second window on top.</Typography>
          <Typography component="li" variant="body2">Full page is for work that needs room (editing a product, closing a truck); the surface stays the place to look.</Typography>
          <Typography component="li" variant="body2">Calendar is a page type, not an object: each thing on a calendar opens its own surface.</Typography>
        </Stack>
      </Section>
    </Stack>
  );
}

function ObjectMap({ onOpen, checks, onTick, busyId }: {
  onOpen: (o: ObjectId) => void;
  checks: ReturnType<typeof useDesignChecks>['checks'];
  onTick: (o: ObjectId, step: 'template' | 'design' | 'done', on: boolean) => void;
  busyId?: string;
}) {
  return (
    <Section title={`${OBJECTS.length} objects`} hint="Each links to the objects on the right. Window today: the file that opens it now." flush>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Object</TableCell>
            <TableCell>Links to</TableCell>
            <TableCell data-phone="hide">Window today</TableCell>
            <TableCell>Checklist</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {OBJECTS.map((o) => {
            const Icon = ECO_ICONS[o.icon];
            return (
              <TableRow key={o.id} hover>
                <TableCell>
                  <Stack direction="row" spacing={1.25} alignItems="center" sx={{ cursor: 'pointer' }} onClick={() => onOpen(o.id)}>
                    <Icon sx={{ fontSize: 24, color: 'primary.main' }} />
                    <Box>
                      <Typography variant="body2" sx={{ fontWeight: 800 }}>{o.label}</Typography>
                      <Typography variant="caption" component="div">{o.kinds ? o.kinds.join(', ') : o.group}</Typography>
                    </Box>
                  </Stack>
                </TableCell>
                <TableCell>
                  <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                    {o.related.map((r) => <Chip key={r} size="small" variant="outlined" label={objectInfo(r).label} onClick={() => onOpen(r)} />)}
                  </Stack>
                </TableCell>
                <TableCell>{o.window ? <Typography variant="caption" sx={{ fontFamily: 'ui-monospace, Consolas, monospace' }}>{o.window}</Typography> : <StatusPill tone="wait" label="To build" />}</TableCell>
                <TableCell>
                  <Ticks check={checks?.[surfaceCheckId(o.id)]} labels={SURFACE_STEPS} busy={busyId === surfaceCheckId(o.id)} onTick={(step, on) => onTick(o.id, step, on)} />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </Section>
  );
}

export default function SurfacesTab() {
  const theme = useTheme();
  const phone = useMediaQuery(theme.breakpoints.down('md'));
  const [params, setParams] = useSearchParams();
  const [error, setError] = useState('');
  const { checks, tick } = useDesignChecks(() => setError('Not saved: the tick did not reach the server. Try again.'));
  const raw = params.get('object') ?? ANATOMY;
  const selected = raw === ANATOMY || raw === MAP || OBJECTS.some((o) => o.id === raw) ? raw : ANATOMY;

  const pick = (id: string) => {
    const next = new URLSearchParams(params);
    if (id === ANATOMY) next.delete('object');
    else next.set('object', id);
    setParams(next, { replace: true });
  };
  const onTick = (o: ObjectId, step: 'template' | 'design' | 'done', on: boolean) => tick.mutate({ page: surfaceCheckId(o), step, on });
  const busyId = tick.isPending ? tick.variables?.page : undefined;
  // One component per object, so the surface keeps its state while the page around it changes.
  const SurfaceView = useMemo(
    () => (OBJECTS.some((o) => o.id === selected) ? () => <ObjectSurface object={selected as ObjectId} onOpen={pick} /> : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selected],
  );

  const nav = phone ? (
    <TextField select size="small" value={selected} onChange={(e) => pick(e.target.value)} fullWidth label="Show">
      <MenuItem value={ANATOMY}>The ten elements</MenuItem>
      <MenuItem value={MAP}>Object map</MenuItem>
      {OBJECTS.map((o) => <MenuItem key={o.id} value={o.id}>{o.label}</MenuItem>)}
    </TextField>
  ) : (
    <Section flush>
      <Stack direction="row" spacing={3} flexWrap="wrap" useFlexGap sx={{ p: 1.5, rowGap: 1.5 }}>
        <Box>
          <Typography variant="overline" color="text.secondary" component="div">The standard</Typography>
          <Stack direction="row" spacing={0.75}>
            {[[ANATOMY, 'The ten elements'], [MAP, 'Object map']].map(([id, label]) => (
              <Chip key={id} label={label} color={selected === id ? 'primary' : 'default'} variant={selected === id ? 'filled' : 'outlined'} onClick={() => pick(id)} />
            ))}
          </Stack>
        </Box>
        {OBJECT_GROUPS.map((g) => (
          <Box key={g}>
            <Typography variant="overline" color="text.secondary" component="div">{g}</Typography>
            <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
              {OBJECTS.filter((o) => o.group === g).map((o) => {
                const Icon = ECO_ICONS[o.icon];
                const approved = checks?.[surfaceCheckId(o.id)]?.design;
                return (
                  <Chip
                    key={o.id}
                    icon={<Icon />}
                    label={o.label}
                    color={selected === o.id ? 'primary' : 'default'}
                    variant={selected === o.id ? 'filled' : 'outlined'}
                    onClick={() => pick(o.id)}
                    onDelete={approved ? () => pick(o.id) : undefined}
                    deleteIcon={approved ? <ECO_ICONS.confirm aria-label="Design approved" /> : undefined}
                  />
                );
              })}
            </Stack>
          </Box>
        ))}
      </Stack>
    </Section>
  );

  let body;
  if (selected === ANATOMY) body = <Anatomy />;
  else if (selected === MAP) body = <ObjectMap onOpen={pick} checks={checks} onTick={onTick} busyId={busyId} />;
  else {
    const info = objectInfo(selected as ObjectId);
    body = (
      <Stack spacing={2}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={{ xs: 1, md: 2 }} alignItems={{ md: 'center' }} justifyContent="space-between">
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="body2" sx={{ fontWeight: 700 }}>{info.what}</Typography>
            <Typography variant="caption" component="div">
              {info.kinds ? `Kinds: ${info.kinds.join(', ')} · ` : ''}ID like {info.idFormat} · {info.window ? `window today: ${info.window}` : 'no window yet'} · made-up data
            </Typography>
          </Box>
          <Stack direction="row" spacing={2} alignItems="center" sx={{ flexShrink: 0 }}>
            <Ticks check={checks?.[surfaceCheckId(info.id)]} labels={SURFACE_STEPS} busy={busyId === surfaceCheckId(info.id)} onTick={(step, on) => onTick(info.id, step, on)} />
            <DevicePicker />
          </Stack>
        </Stack>
        {SurfaceView ? <DeviceView key={info.id} title={info.label} View={SurfaceView} surface /> : null}
      </Stack>
    );
  }

  return (
    <PageShell width="wide">
      {nav}
      <Box sx={{ minWidth: 0 }}>{body}</Box>
      <Snackbar open={Boolean(error)} autoHideDuration={3000} onClose={() => setError('')} message={error} />
    </PageShell>
  );
}
