/**
 * Design Lab > Windows (OOUX; Bill 2026-11-13): the object window every object opens in, as a real modal.
 * Every object of the catalog (navigation/objectCatalog.ts) by group; Open shows its window over this page on
 * made-up data (full screen on a phone); a related row inside swaps the window in place with Back, as live.
 * The ten elements the window is made of are listed under the cards. The owner ticks each window's checklist.
 */
import { Box, Button, Chip, Snackbar, Stack, Typography } from '@mui/material';
import { useState } from 'react';
import { PageShell, Section, StatusPill } from '../../components/page/PageKit';
import { ECO_ICONS } from '../../icons/ecoIcons';
import { OBJECTS, OBJECT_GROUPS, objectInfo, windowCheckId } from '../../navigation/objectCatalog';
import { Ticks, useDesignChecks } from './designChecks';
import { useOpenDemoWindow } from './WindowDialog';

export const WINDOW_ELEMENTS: [string, string][] = [
  ['Bar', 'The object\'s icon, name and number. Back when one window opened another, Full page, Close.'],
  ['Identity', 'The ID with a copy button, one status, kind chips, the name and one line under it.'],
  ['Numbers', 'Up to four big numbers that say how it is doing.'],
  ['Attention', 'The one thing that needs doing now, with its button. Never more than one; none when all is well.'],
  ['Actions', 'One main button. Everything else under More. On a phone the main button stays at the bottom.'],
  ['Facts', 'Titled groups of label and value. An empty value is left out; an empty group says so.'],
  ['Related', 'Every object it is tied to. Each row opens that object\'s window in place; Back returns.'],
  ['Photos', 'The universal photo picker: take a photo, my photo drawer, or a file.'],
  ['Notes', 'Who, when, what. Anyone who can see it can add one.'],
  ['Timeline', 'What happened to it, newest first.'],
];

const STEPS = ['Standard', 'Design', 'Done'];

export default function WindowsTab() {
  const open = useOpenDemoWindow();
  const [error, setError] = useState('');
  const { checks, tick } = useDesignChecks(() => setError('Not saved: the tick did not reach the server. Try again.'));
  const busyId = tick.isPending ? tick.variables?.page : undefined;

  return (
    <PageShell width="wide">
      {OBJECT_GROUPS.map((g) => (
        <Box key={g}>
          <Typography variant="overline" color="text.secondary" component="h2">{g}</Typography>
          <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(3, minmax(0, 1fr))', xl: 'repeat(4, minmax(0, 1fr))' } }}>
            {OBJECTS.filter((o) => o.group === g).map((o) => {
              const Icon = ECO_ICONS[o.icon];
              const id = windowCheckId(o.id);
              return (
                <Box key={o.id} sx={{ p: 1.75, borderRadius: '14px', border: 1, borderColor: 'divider', bgcolor: 'background.paper', display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
                  <Stack direction="row" spacing={1.25} alignItems="center">
                    <Box sx={{ width: 40, height: 40, borderRadius: '12px', display: 'grid', placeItems: 'center', bgcolor: 'grey.100', color: 'primary.main', flexShrink: 0 }}><Icon sx={{ fontSize: 24 }} /></Box>
                    <Box sx={{ minWidth: 0, flex: 1 }}>
                      <Typography variant="subtitle1" noWrap>{o.label}</Typography>
                      <Typography variant="caption" component="div" noWrap>{o.kinds ? o.kinds.join(', ') : `ID like ${o.idFormat}`}</Typography>
                    </Box>
                    {o.window ? null : <StatusPill tone="wait" label="To build" />}
                  </Stack>
                  <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>{o.what}</Typography>
                  <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                    {o.related.map((r) => <Chip key={r} size="small" variant="outlined" label={objectInfo(r).label} onClick={() => open(r)} />)}
                  </Stack>
                  <Stack direction="row" alignItems="center" spacing={1}>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Ticks check={checks?.[id]} labels={STEPS} busy={busyId === id} onTick={(step, on) => tick.mutate({ page: id, step, on })} />
                    </Box>
                    <Button variant="contained" size="small" onClick={() => open(o.id)}>Open</Button>
                  </Stack>
                </Box>
              );
            })}
          </Box>
        </Box>
      ))}

      <Section title="The ten elements of a window" hint="In this order, on every object. The window has no colours of its own.">
        <Box component="ol" sx={{ m: 0, p: 0, listStyle: 'none', display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' } }}>
          {WINDOW_ELEMENTS.map(([name, body], i) => (
            <Stack key={name} component="li" direction="row" spacing={1.5} alignItems="flex-start">
              <Box sx={{ width: 28, height: 28, flexShrink: 0, borderRadius: '50%', display: 'grid', placeItems: 'center', bgcolor: 'primary.main', color: 'primary.contrastText', fontWeight: 800, fontSize: '0.8125rem' }}>{i + 1}</Box>
              <Box><Typography variant="subtitle2">{name}</Typography><Typography variant="body2" color="text.secondary">{body}</Typography></Box>
            </Stack>
          ))}
        </Box>
        <Typography variant="body2" sx={{ mt: 2 }}>
          Rules: one window per object; a list opens a window, never a page of its own. Kinds share one window (a chip says which). A related row opens in place, never a second window on top. Full page is for work that needs room. Calendar is a page type, not an object.
        </Typography>
      </Section>
      <Snackbar open={Boolean(error)} autoHideDuration={3000} onClose={() => setError('')} message={error} />
    </PageShell>
  );
}
