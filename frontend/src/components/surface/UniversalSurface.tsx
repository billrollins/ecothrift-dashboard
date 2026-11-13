/**
 * The Universal Surface (Dash Update #134, Bill 2026-11-13): the one window every object opens in, anywhere in Dash
 * (OOUX: one object, one surface, the same for every user). It writes down the shape the object windows already share
 * (components/objects: Item, Product, Order, Vendor, Restoration; windowParts.tsx) as ten elements, in this order:
 *
 *   1 Bar        what it is: the object's icon and name, its number; Back (when one surface opened another), Full page, Close
 *   2 Identity   the ID with a copy button, one status, kind chips, the name, one line under it
 *   3 Numbers    up to four big numbers
 *   4 Attention  the one thing that needs doing now, if any (never more than one)
 *   5 Actions    one main button; everything else under More
 *   6 Facts      titled groups of label and value; an empty value is left out, an empty group says so
 *   7 Related    every object it is tied to; each opens its own surface in the same window (Back returns)
 *   8 Photos     the universal photo picker: take a photo, my photo drawer, a file
 *   9 Notes      who, when, what
 *  10 Timeline   what happened to it, newest first
 *
 * On a phone the surface is the whole screen: one column (Numbers, Attention, Facts, Related, Photos, Notes, Timeline)
 * and the main button stays in reach at the bottom. No colours of its own: everything comes from the theme.
 * The catalog of objects and what each one shows: navigation/objectCatalog.ts. On show: /admin/design-lab?view=surfaces.
 */
import { Box, Button, ButtonBase, IconButton, Stack, Tooltip, Typography, useMediaQuery } from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import type { SvgIconProps } from '@mui/material/SvgIcon';
import { useState, type ComponentType, type ReactNode } from 'react';
import { ECO_ICONS } from '../../icons/ecoIcons';
import { StatusPill, type Tone } from '../page/PageKit';

type IconType = ComponentType<SvgIconProps>;

export interface SurfaceStat { label: string; value: string; note?: string; tone?: Tone }
export interface SurfaceFactGroup { title: string; rows: [string, ReactNode][]; empty?: string }
export interface SurfaceLink { id: string; label: string; meta?: string; status?: { tone: Tone; label: string } }
export interface SurfaceRelatedGroup {
  /** The related object's name ("Items"), its icon, and how many there are in all. */
  title: string;
  Icon?: IconType;
  total?: number;
  rows: SurfaceLink[];
}
export interface SurfaceNote { who: string; when: string; text: string }
export interface SurfaceEvent { when: string; label: string; detail?: string }

export interface SurfaceProps {
  /** 1 Bar */
  objectLabel: string;
  Icon?: IconType;
  number?: string;
  canGoBack?: boolean;
  onBack?: () => void;
  onFullPage?: () => void;
  onClose?: () => void;
  /** 2 Identity */
  id: string;
  status?: { tone: Tone; label: string };
  chips?: string[];
  title: string;
  subtitle?: string;
  /** 3 Numbers (up to four) */
  stats?: SurfaceStat[];
  /** 4 Attention */
  attention?: { tone: Tone; text: string; action?: string };
  /** 5 Actions */
  primary?: string;
  more?: string[];
  /** 6 Facts */
  facts?: SurfaceFactGroup[];
  /** 7 Related */
  related?: SurfaceRelatedGroup[];
  onOpenRelated?: (group: SurfaceRelatedGroup, row: SurfaceLink) => void;
  /** 8 Photos: how many there are (the demo draws placeholders), or undefined for an object with no photos */
  photos?: number;
  /** 9 Notes */
  notes?: SurfaceNote[];
  /** 10 Timeline */
  timeline?: SurfaceEvent[];
}

/** A titled block inside the surface. */
function Block({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <Box component="section" sx={{ border: 1, borderColor: 'divider', borderRadius: '12px', bgcolor: 'background.paper', p: { xs: 1.5, md: 2 }, minWidth: 0 }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
        <Typography component="h3" variant="overline" color="text.secondary" sx={{ flex: 1, lineHeight: 1.4 }}>{title}</Typography>
        {action}
      </Stack>
      {children}
    </Box>
  );
}

function CopyId({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const Copy = ECO_ICONS.copy;
  return (
    <Stack direction="row" spacing={0.25} alignItems="center">
      <Typography sx={{ fontFamily: 'ui-monospace, Consolas, monospace', fontWeight: 800, fontSize: '0.9375rem' }}>{value}</Typography>
      <Tooltip title={copied ? 'Copied' : 'Copy'}>
        <IconButton
          size="small"
          aria-label={`Copy ${value}`}
          onClick={() => {
            void navigator.clipboard?.writeText(value).then(() => setCopied(true), () => undefined);
            window.setTimeout(() => setCopied(false), 1400);
          }}
        >
          <Copy sx={{ fontSize: 18 }} />
        </IconButton>
      </Tooltip>
    </Stack>
  );
}

function Facts({ group }: { group: SurfaceFactGroup }) {
  const shown = group.rows.filter(([, v]) => v != null && v !== '' && v !== false);
  return (
    <Block title={group.title}>
      {shown.length === 0 ? (
        <Typography variant="body2" color="text.secondary">{group.empty ?? 'Nothing recorded.'}</Typography>
      ) : (
        <Box
          component="dl"
          sx={{
            m: 0, display: 'grid', gridTemplateColumns: 'minmax(104px, auto) 1fr', columnGap: 2, rowGap: 0.75,
            '& dt': { color: 'text.secondary', typography: 'body2' },
            '& dd': { m: 0, typography: 'body2', fontWeight: 700, overflowWrap: 'anywhere' },
          }}
        >
          {shown.map(([k, v]) => (
            <Box key={k} sx={{ display: 'contents' }}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </Box>
          ))}
        </Box>
      )}
    </Block>
  );
}

function Related({ group, onOpen }: { group: SurfaceRelatedGroup; onOpen?: (row: SurfaceLink) => void }) {
  const { Icon } = group;
  const more = (group.total ?? group.rows.length) - group.rows.length;
  return (
    <Block
      title={`${group.title}${group.total != null ? ` · ${group.total}` : ''}`}
      action={more > 0 ? <Button size="small">All {group.total}</Button> : undefined}
    >
      {group.rows.length === 0 ? (
        <Typography variant="body2" color="text.secondary">None yet.</Typography>
      ) : (
        <Stack divider={<Box sx={{ borderTop: 1, borderColor: 'divider' }} />}>
          {group.rows.map((row) => (
            <ButtonBase
              key={row.id}
              onClick={() => onOpen?.(row)}
              sx={{ display: 'flex', gap: 1.25, py: 0.9, px: 0.5, borderRadius: '8px', textAlign: 'left', justifyContent: 'flex-start', alignItems: 'center', '&:hover': { bgcolor: 'action.hover' } }}
            >
              {Icon ? <Icon sx={{ fontSize: 22, color: 'text.secondary', flexShrink: 0 }} /> : null}
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Stack direction="row" spacing={1} alignItems="baseline" sx={{ minWidth: 0 }}>
                  <Typography sx={{ fontFamily: 'ui-monospace, Consolas, monospace', fontWeight: 700, fontSize: '0.8125rem', flexShrink: 0 }}>{row.id}</Typography>
                  <Typography variant="body2" noWrap sx={{ fontWeight: 700, minWidth: 0 }}>{row.label}</Typography>
                </Stack>
                {row.meta ? <Typography variant="caption" component="div" noWrap>{row.meta}</Typography> : null}
              </Box>
              {row.status ? <StatusPill tone={row.status.tone} label={row.status.label} /> : null}
            </ButtonBase>
          ))}
        </Stack>
      )}
    </Block>
  );
}

function Photos({ count }: { count: number }) {
  const Add = ECO_ICONS.add;
  return (
    <Block title={`Photos · ${count}`} action={<Button size="small" startIcon={<Add />}>Add photo</Button>}>
      <Box sx={{ display: 'grid', gap: 1, gridTemplateColumns: 'repeat(auto-fill, minmax(72px, 1fr))' }}>
        {Array.from({ length: Math.min(count, 6) }, (_, i) => (
          <Box key={i} sx={(t) => ({ aspectRatio: '1', borderRadius: '10px', bgcolor: alpha(t.palette.secondary.main, 0.08 + i * 0.03), border: 1, borderColor: 'divider' })} />
        ))}
      </Box>
      <Typography variant="caption" component="div" sx={{ mt: 1 }}>Add photo: take a photo, my photo drawer, or a file.</Typography>
    </Block>
  );
}

function Notes({ notes }: { notes: SurfaceNote[] }) {
  return (
    <Block title="Notes" action={<Button size="small">Add note</Button>}>
      {notes.length === 0 ? <Typography variant="body2" color="text.secondary">No notes.</Typography> : (
        <Stack spacing={1.25}>
          {notes.map((n) => (
            <Box key={n.when + n.who}>
              <Typography variant="body2">{n.text}</Typography>
              <Typography variant="caption">{n.who} · {n.when}</Typography>
            </Box>
          ))}
        </Stack>
      )}
    </Block>
  );
}

function Timeline({ events }: { events: SurfaceEvent[] }) {
  return (
    <Block title="Timeline">
      <Box component="ol" sx={{ listStyle: 'none', m: 0, p: 0 }}>
        {events.map((e, i) => (
          <Box component="li" key={e.when + e.label} sx={{ display: 'grid', gridTemplateColumns: '14px 1fr', columnGap: 1.25, pb: i === events.length - 1 ? 0 : 1.25, position: 'relative' }}>
            <Box sx={{ position: 'relative' }}>
              <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: i === 0 ? 'secondary.main' : 'grey.400', mt: '5px' }} />
              {i < events.length - 1 ? <Box sx={{ position: 'absolute', left: 4, top: 17, bottom: -4, width: 2, bgcolor: 'divider' }} /> : null}
            </Box>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="body2" sx={{ fontWeight: 700 }}>{e.label}</Typography>
              {e.detail ? <Typography variant="body2">{e.detail}</Typography> : null}
              <Typography variant="caption">{e.when}</Typography>
            </Box>
          </Box>
        ))}
      </Box>
    </Block>
  );
}

export function UniversalSurface(props: SurfaceProps) {
  const theme = useTheme();
  const phone = useMediaQuery(theme.breakpoints.down('sm'));
  const { Icon } = props;
  const Back = ECO_ICONS.back;
  const Close = ECO_ICONS.close;
  const Open = ECO_ICONS.openExternal;
  const More = ECO_ICONS.more;

  const facts = (props.facts ?? []).map((g) => <Facts key={g.title} group={g} />);
  const related = (props.related ?? []).map((g) => (
    <Related key={g.title} group={g} onOpen={(row) => props.onOpenRelated?.(g, row)} />
  ));
  const photos = props.photos != null ? <Photos count={props.photos} /> : null;
  const notes = props.notes ? <Notes notes={props.notes} /> : null;
  const timeline = props.timeline?.length ? <Timeline events={props.timeline} /> : null;

  const primary = props.primary ? <Button variant="contained" fullWidth={phone}>{props.primary}</Button> : null;
  const more = props.more?.length ? (
    <Tooltip title={props.more.join(', ')}>
      <Button variant="outlined" startIcon={<More />} sx={{ flexShrink: 0 }}>More</Button>
    </Tooltip>
  ) : null;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', bgcolor: 'background.default', minHeight: phone ? '100%' : undefined }}>
      {/* 1 Bar */}
      <Stack direction="row" alignItems="center" spacing={1} sx={{ px: { xs: 1, sm: 2 }, py: 1, bgcolor: 'background.paper', borderBottom: 1, borderColor: 'divider', position: 'sticky', top: 0, zIndex: 1 }}>
        {props.canGoBack ? (
          <IconButton size="small" aria-label="Back" onClick={props.onBack}><Back fontSize="small" /></IconButton>
        ) : null}
        {Icon ? <Icon sx={{ fontSize: 24, color: 'primary.main' }} /> : null}
        <Typography variant="subtitle1" sx={{ flex: 1, minWidth: 0 }} noWrap>
          {props.objectLabel}
          {props.number ? <Typography component="span" color="text.secondary" sx={{ ml: 1, fontWeight: 600 }}>{props.number}</Typography> : null}
        </Typography>
        {!phone && props.onFullPage ? <Button size="small" startIcon={<Open />} onClick={props.onFullPage}>Full page</Button> : null}
        <IconButton size="small" aria-label="Close" onClick={props.onClose}><Close fontSize="small" /></IconButton>
      </Stack>

      <Stack spacing={2} sx={{ p: { xs: 1.5, md: 2.5 }, flex: 1 }}>
        {/* 2 Identity, 5 Actions */}
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ sm: 'flex-start' }}>
          <Stack spacing={0.5} sx={{ flex: 1, minWidth: 0 }}>
            <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" useFlexGap>
              <CopyId value={props.id} />
              {props.status ? <StatusPill tone={props.status.tone} label={props.status.label} /> : null}
              {(props.chips ?? []).map((c) => <Box key={c} component="span" sx={{ px: 1, height: 24, display: 'inline-flex', alignItems: 'center', borderRadius: 999, border: 1, borderColor: 'divider', typography: 'caption', fontWeight: 700, color: 'text.primary' }}>{c}</Box>)}
            </Stack>
            <Typography component="h2" variant="h4">{props.title}</Typography>
            {props.subtitle ? <Typography variant="body2" color="text.secondary">{props.subtitle}</Typography> : null}
          </Stack>
          {!phone ? <Stack direction="row" spacing={1} sx={{ flexShrink: 0 }}>{more}{primary}</Stack> : null}
        </Stack>

        {/* 3 Numbers */}
        {props.stats?.length ? (
          <Box sx={{ display: 'grid', gap: 1.25, gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', sm: `repeat(${Math.min(props.stats.length, 4)}, minmax(0, 1fr))` } }}>
            {props.stats.slice(0, 4).map((s) => (
              <Box key={s.label} sx={{ p: 1.5, borderRadius: '12px', border: 1, borderColor: 'divider', bgcolor: 'background.paper', minWidth: 0 }}>
                <Typography variant="overline" color="text.secondary" sx={{ lineHeight: 1.4, display: 'block' }} noWrap>{s.label}</Typography>
                <Typography variant="h4" component="p">{s.value}</Typography>
                {s.note ? (
                  <Typography variant="caption" sx={{ fontWeight: 700, color: s.tone && s.tone !== 'quiet' ? `${({ good: 'success', wait: 'warning', problem: 'error', info: 'info' } as const)[s.tone]}.dark` : 'text.secondary' }}>
                    {s.note}
                  </Typography>
                ) : null}
              </Box>
            ))}
          </Box>
        ) : null}

        {/* 4 Attention */}
        {props.attention ? (
          <Stack
            direction="row"
            spacing={1.5}
            alignItems="center"
            sx={(t) => {
              const key = props.attention!.tone === 'quiet' ? null : ({ good: 'success', wait: 'warning', problem: 'error', info: 'info' } as const)[props.attention!.tone];
              const p = key ? t.palette[key] : null;
              return { p: 1.5, borderRadius: '12px', bgcolor: p ? p.light : t.palette.grey[100], color: p ? p.dark : t.palette.text.primary };
            }}
          >
            <Typography variant="body2" sx={{ flex: 1, fontWeight: 700 }}>{props.attention.text}</Typography>
            {props.attention.action ? <Button size="small" variant="outlined" color="inherit" sx={{ flexShrink: 0 }}>{props.attention.action}</Button> : null}
          </Stack>
        ) : null}

        {/* 6 Facts, 9 Notes | 7 Related, 8 Photos, 10 Timeline */}
        {phone ? (
          <Stack spacing={1.5}>{facts}{related}{photos}{notes}{timeline}</Stack>
        ) : (
          <Box sx={{ display: 'grid', gap: 2, alignItems: 'start', gridTemplateColumns: { sm: '1fr', md: 'minmax(0, 1.1fr) minmax(0, 1fr)' } }}>
            <Stack spacing={2} sx={{ minWidth: 0 }}>{facts}{notes}</Stack>
            <Stack spacing={2} sx={{ minWidth: 0 }}>{related}{photos}{timeline}</Stack>
          </Box>
        )}
      </Stack>

      {/* 5 Actions on a phone: the main button stays in reach */}
      {phone && (primary || more) ? (
        <Stack direction="row" spacing={1} sx={{ position: 'sticky', bottom: 0, p: 1.5, bgcolor: 'background.paper', borderTop: 1, borderColor: 'divider' }}>
          {more}
          <Box sx={{ flex: 1 }}>{primary}</Box>
        </Stack>
      ) : null}
    </Box>
  );
}
