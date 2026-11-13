/**
 * Design Lab > Pages: the page registry (navigation/pageRegistry.ts). Every sidebar page with its page type and its
 * design checklist, by workspace or by page type. After a design change, filter to the pages that still need it,
 * open each one, and copy its brief for a coder. The owner ticks each step here; the ticks are saved on the server
 * (/api/core/design-lab/checks/, steps kept in order).
 */
import {
  Box,
  Button,
  Chip,
  InputAdornment,
  Snackbar,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import { useMemo, useState } from 'react';
import type { DesignStep } from '../../api/core.api';
import { Ticks, useDesignChecks } from './designChecks';
import { useSearchParams } from 'react-router-dom';
import { EmptyState, FilterBar, PageShell, PageToolbar, Section, StatTile, StatusPill } from '../../components/page/PageKit';
import { ECO_ICONS } from '../../icons/ecoIcons';
import {
  PAGE_REGISTRY,
  PAGE_TEMPLATES,
  REGISTRY_WORKSPACES,
  TOOL_TEMPLATE,
  designBrief,
  nextStep,
  templateInfo,
  withChecks,
  type RegistryPage,
} from '../../navigation/pageRegistry';

type Show = 'needs' | 'all';
type GroupBy = 'workspace' | 'type';

function typeLabel(page: RegistryPage) {
  if (page.template === 'unsorted') return 'Not sorted';
  if (page.template === 'none') return 'Reference';
  return templateInfo(page.template)?.label ?? page.template;
}

/** The three steps as tick boxes (designChecks.tsx); a reference sheet needs none. */
function Checklist({ page, onTick, busy }: { page: RegistryPage; onTick: (step: DesignStep, on: boolean) => void; busy: boolean }) {
  if (page.template === 'none') return <StatusPill tone="quiet" label="No design needed" />;
  return <Ticks check={{ ...page.check, by: page.checkedBy, at: page.checkedAt }} busy={busy} onTick={onTick} />;
}

export default function PagesTab() {
  const [, setParams] = useSearchParams();
  const [query, setQuery] = useState('');
  const [show, setShow] = useState<Show>('needs');
  const [groupBy, setGroupBy] = useState<GroupBy>('workspace');
  const [copied, setCopied] = useState('');
  const { checks, tick } = useDesignChecks(() => setCopied('Not saved: the tick did not reach the server. Try again.'));
  const registry = useMemo(() => withChecks(PAGE_REGISTRY, checks), [checks]);

  const counts = useMemo(() => {
    const designed = registry.filter((p) => p.template !== 'none');
    return {
      pages: designed.length,
      template: designed.filter((p) => p.check.template).length,
      design: designed.filter((p) => p.check.design).length,
      done: designed.filter((p) => p.check.done).length,
      unsorted: designed.filter((p) => p.template === 'unsorted').length,
    };
  }, [registry]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return registry.filter((p) => (show === 'all' ? true : nextStep(p) !== null)).filter(
      (p) => !q || `${p.label} ${p.path} ${p.workspaceLabel} ${typeLabel(p)}`.toLowerCase().includes(q),
    );
  }, [query, show, registry]);

  const groups = useMemo(() => {
    if (groupBy === 'workspace') {
      return REGISTRY_WORKSPACES.map((w) => ({ id: w.id, title: w.label, hint: '', pages: rows.filter((p) => p.workspaceId === w.id) }));
    }
    const types = [...PAGE_TEMPLATES, TOOL_TEMPLATE];
    return [
      ...types.map((t) => ({ id: t.id, title: t.label, hint: `${t.first === 'mobile' ? 'Phone' : 'Desktop'} first · on a phone ${t.phone}`, pages: rows.filter((p) => p.template === t.id) })),
      { id: 'unsorted', title: 'Not sorted', hint: 'Give each a page type in navigation/pageRegistry.ts', pages: rows.filter((p) => p.template === 'unsorted') },
      { id: 'none', title: 'Reference sheets', hint: 'No design of their own', pages: rows.filter((p) => p.template === 'none') },
    ];
  }, [groupBy, rows]);

  const copyBrief = async (page: RegistryPage) => {
    try {
      await navigator.clipboard.writeText(designBrief(page, window.location.origin));
      setCopied(`Brief for ${page.label} copied`);
    } catch {
      setCopied('Could not copy: the browser blocked the clipboard');
    }
  };

  const openType = (page: RegistryPage) => {
    if (page.template === 'unsorted' || page.template === 'none' || page.template === 'tool') return;
    setParams({ view: page.template });
  };

  return (
    <PageShell width="wide">
      <Box sx={{ display: 'grid', gap: { xs: 1.5, md: 2 }, gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: 'repeat(4, minmax(0, 1fr))' } }}>
        <StatTile label="Pages" value={String(counts.pages)} detail={counts.unsorted ? `${counts.unsorted} not sorted` : 'every one has a page type'} Icon={ECO_ICONS.overview} />
        <StatTile label="On their template" value={String(counts.template)} note={`${counts.pages - counts.template} to move`} tone={counts.template === counts.pages ? 'good' : 'wait'} />
        <StatTile label="Design approved" value={String(counts.design)} note={`${counts.pages - counts.design} to approve`} tone={counts.design === counts.pages ? 'good' : 'wait'} />
        <StatTile label="Done" value={String(counts.done)} />
      </Box>

      <PageToolbar
        lead={
          <FilterBar>
            <TextField
              size="small"
              placeholder="Search pages"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              sx={{ minWidth: { sm: 240 } }}
              slotProps={{ input: { startAdornment: <InputAdornment position="start"><ECO_ICONS.search sx={{ fontSize: 20 }} /></InputAdornment> } }}
            />
            <Stack direction="row" spacing={1}>
              <Chip label="Needs a design update" color={show === 'needs' ? 'primary' : 'default'} variant={show === 'needs' ? 'filled' : 'outlined'} onClick={() => setShow('needs')} />
              <Chip label="All pages" color={show === 'all' ? 'primary' : 'default'} variant={show === 'all' ? 'filled' : 'outlined'} onClick={() => setShow('all')} />
            </Stack>
          </FilterBar>
        }
      >
        <ToggleButtonGroup size="small" exclusive value={groupBy} onChange={(_, v: GroupBy | null) => v && setGroupBy(v)} aria-label="Group pages by">
          <ToggleButton value="workspace" sx={{ textTransform: 'none', fontWeight: 700, px: 1.5 }}>By workspace</ToggleButton>
          <ToggleButton value="type" sx={{ textTransform: 'none', fontWeight: 700, px: 1.5 }}>By page type</ToggleButton>
        </ToggleButtonGroup>
      </PageToolbar>

      {rows.length === 0 ? (
        <Section>
          <EmptyState Icon={ECO_ICONS.confirm} title="Nothing needs a design update" body="Every page is on its template with an approved design. Switch to All pages to see them." />
        </Section>
      ) : null}

      {groups.filter((g) => g.pages.length).map((g) => (
        <Section key={g.id} title={`${g.title} · ${g.pages.length}`} hint={g.hint || undefined} flush>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Page</TableCell>
                <TableCell>{groupBy === 'workspace' ? 'Page type' : 'Workspace'}</TableCell>
                <TableCell data-phone="hide">Starts on</TableCell>
                <TableCell>Checklist</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {g.pages.map((p) => (
                <TableRow key={p.id} hover>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>{p.label}</Typography>
                    <Typography variant="caption" component="div" sx={{ fontWeight: 500 }}>
                      {p.path}{p.superuserOnly ? ' · owner only' : ''}{p.alsoIn.length ? ` · also in ${p.alsoIn.join(', ')}` : ''}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    {groupBy === 'workspace' ? (
                      <Chip
                        size="small"
                        variant="outlined"
                        label={typeLabel(p)}
                        onClick={['unsorted', 'none', 'tool'].includes(p.template) ? undefined : () => openType(p)}
                        color={p.template === 'unsorted' ? 'warning' : 'default'}
                      />
                    ) : (
                      p.workspaceLabel
                    )}
                  </TableCell>
                  <TableCell>{p.first === 'mobile' ? 'Phone' : 'Desktop'}</TableCell>
                  <TableCell>
                    <Checklist
                      page={p}
                      busy={tick.isPending && tick.variables?.page === p.id}
                      onTick={(step, on) => tick.mutate({ page: p.id, step, on })}
                    />
                  </TableCell>
                  <TableCell align="right">
                    <Stack direction="row" spacing={1} justifyContent="flex-end">
                      <Button size="small" variant="outlined" startIcon={<ECO_ICONS.openExternal />} href={p.path} target="_blank" rel="noopener">
                        Open
                      </Button>
                      {nextStep(p) ? (
                        <Button size="small" startIcon={<ECO_ICONS.copy />} onClick={() => void copyBrief(p)}>Copy brief</Button>
                      ) : null}
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Section>
      ))}

      <Snackbar open={Boolean(copied)} autoHideDuration={2500} onClose={() => setCopied('')} message={copied} />
    </PageShell>
  );
}
