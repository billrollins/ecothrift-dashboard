/**
 * Settings (owner, 2026-10-07): tabs are areas, sections expand. Search finds any setting on any tab.
 *
 * - Placement and order: `settings/settingsLayout.ts`. Labels, help and editors: `settings/settingsRegistry.ts`.
 * - Deep links: `?tab=<tab>&section=<section>&key=<setting>` opens the section and highlights the setting.
 * - Pre-launch sections are tagged; legacy sections hide behind "Show legacy".
 * - Open sections are remembered on this computer.
 */
import { Autocomplete, Box, Chip, FormControlLabel, Stack, Switch, Tab, Tabs, TextField, Typography } from '@mui/material';
import Accordion from '@mui/material/Accordion';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { Setting } from '../../api/core.api';
import { PageHeader } from '../../components/common/PageHeader';
import { LoadingScreen } from '../../components/feedback/LoadingScreen';
import { useAuth } from '../../contexts/AuthContext';
import { canSee, SETTINGS_LAYOUT, type SettingsSectionDef, type SettingsTabDef } from './settings/settingsLayout';
import { metaForKey, parseSettingsTab, type SettingsTab } from './settings/settingsRegistry';
import { Piece } from './settings/SettingsPieces';
import { SettingRow } from './settings/SettingRow';
import { settingByKey, useAppSettings } from './settings/useAppSettings';
import { IconSearch as SearchIcon } from '../../icons/ecoIcons';

const OPEN_KEY = 'settings.open';
const RECENT_DAYS = 7;

function readOpen(): Record<string, boolean> {
  try {
    return JSON.parse(window.localStorage.getItem(OPEN_KEY) || '{}') as Record<string, boolean>;
  } catch {
    return {};
  }
}

function writeOpen(open: Record<string, boolean>): void {
  try {
    window.localStorage.setItem(OPEN_KEY, JSON.stringify(open));
  } catch {
    // Private mode: open sections are not remembered.
  }
}

interface SearchHit {
  key: string;
  label: string;
  help: string;
  tab: SettingsTabDef;
  section: SettingsSectionDef;
}

function SectionView({ tab, section, settings, open, onToggle, highlight }: {
  tab: SettingsTabDef; section: SettingsSectionDef; settings: Setting[]; open: boolean; onToggle: () => void; highlight: string | null;
}) {
  const keys = section.keys ?? [];
  const now = Date.now();
  const recent = keys.filter((k) => {
    const at = settingByKey(settings, k)?.updated_at as string | undefined;
    return at && now - Date.parse(at) < RECENT_DAYS * 86_400_000;
  }).length;
  return (
    <Accordion expanded={open} onChange={onToggle} disableGutters variant="outlined" sx={{ mb: 1.5, borderRadius: 2, '&:before': { display: 'none' } }}
      id={`section-${tab.id}-${section.id}`}>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ width: '100%', pr: 1, flexWrap: 'wrap', rowGap: 0.5 }}>
          <Typography sx={{ fontWeight: 700, flex: 1 }}>{section.title}</Typography>
          {section.stage === 'pre-launch' ? <Chip size="small" color="warning" variant="outlined" label="Pre-launch" /> : null}
          {section.stage === 'legacy' ? <Chip size="small" variant="outlined" label="Legacy: can be removed" /> : null}
          {recent ? <Chip size="small" color="info" variant="outlined" label={`${recent} changed this week`} /> : null}
          {keys.length ? <Typography variant="caption" color="text.secondary">{keys.length} {keys.length === 1 ? 'setting' : 'settings'}</Typography> : null}
        </Stack>
      </AccordionSummary>
      <AccordionDetails sx={{ pt: 0 }}>
        {section.help ? <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>{section.help}</Typography> : null}
        {keys.map((key) => {
          const row = settingByKey(settings, key);
          const meta = metaForKey(key);
          return (
            <SettingRow
              key={key}
              settingKey={key}
              value={row?.value ?? (meta.kind === 'switch' ? false : meta.kind === 'list' ? [] : '')}
              description={row?.description as string | undefined}
              meta={meta}
              changedBy={row?.updated_by_name as string | null | undefined}
              changedAt={row?.updated_at as string | null | undefined}
              highlight={highlight === key}
            />
          );
        })}
        {(section.custom ?? []).map((piece) => (
          <Box key={piece} sx={{ mt: keys.length ? 1 : 0 }}>
            <Piece piece={piece} settings={settings} />
          </Box>
        ))}
      </AccordionDetails>
    </Accordion>
  );
}

export default function SettingsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'Admin';
  const isSuperuser = Boolean(user?.is_superuser);
  const [params, setParams] = useSearchParams();
  const tabId = parseSettingsTab(params.get('tab'), isAdmin, isSuperuser);
  const askedSection = params.get('section');
  const highlight = params.get('key');
  const { data: settings, isLoading } = useAppSettings();
  const [open, setOpen] = useState<Record<string, boolean>>(readOpen);
  const [showLegacy, setShowLegacy] = useState(false);

  const tabs = SETTINGS_LAYOUT.filter((t) => canSee(t.access, isAdmin, isSuperuser));
  const tab = tabs.find((t) => t.id === tabId) ?? tabs[0];
  const sections = tab.sections.filter((s) => canSee(s.access, isAdmin, isSuperuser) && (showLegacy || s.stage !== 'legacy'));
  const hasLegacy = tab.sections.some((s) => s.stage === 'legacy');

  const hits = useMemo<SearchHit[]>(() => {
    const out: SearchHit[] = [];
    for (const t of tabs) {
      for (const s of t.sections) {
        if (!canSee(s.access, isAdmin, isSuperuser)) continue;
        for (const key of s.keys ?? []) {
          const meta = metaForKey(key);
          out.push({ key, label: meta.label, help: meta.help, tab: t, section: s });
        }
        if (!s.keys?.length) out.push({ key: `section:${s.id}`, label: s.title, help: s.help ?? '', tab: t, section: s });
      }
    }
    return out;
  }, [tabs, isAdmin, isSuperuser]);

  const isOpen = (sectionId: string, index: number) => {
    const id = `${tab.id}.${sectionId}`;
    if (askedSection === sectionId) return true;
    return open[id] ?? index === 0;
  };
  const toggle = (sectionId: string, index: number) => {
    const id = `${tab.id}.${sectionId}`;
    const next = { ...open, [id]: !isOpen(sectionId, index) };
    setOpen(next);
    writeOpen(next);
    if (askedSection === sectionId) {
      const q = new URLSearchParams(params);
      q.delete('section');
      q.delete('key');
      setParams(q, { replace: true });
    }
  };

  const go = (next: { tab: SettingsTab; section?: string; key?: string }) => {
    const q = new URLSearchParams();
    if (next.tab !== 'store') q.set('tab', next.tab);
    if (next.section) q.set('section', next.section);
    if (next.key) q.set('key', next.key);
    setParams(q, { replace: false });
  };

  // A deep link scrolls to its setting (or section) once the page has drawn it.
  useEffect(() => {
    const target = highlight ? `setting-${highlight}` : askedSection ? `section-${tab.id}-${askedSection}` : null;
    if (!target || !settings) return;
    const t = window.setTimeout(() => document.getElementById(target)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 250);
    return () => window.clearTimeout(t);
  }, [highlight, askedSection, tab.id, settings]);

  return (
    <Box>
      <PageHeader title="Settings" subtitle="How the store runs" />
      <Autocomplete
        options={hits}
        groupBy={(h) => h.tab.label}
        getOptionLabel={(h) => h.label}
        filterOptions={(opts, { inputValue }) => {
          const q = inputValue.trim().toLowerCase();
          if (!q) return [];
          return opts.filter((h) => `${h.label} ${h.help} ${h.key} ${h.section.title}`.toLowerCase().includes(q)).slice(0, 30);
        }}
        renderOption={(props, h) => (
          <li {...props} key={`${h.tab.id}-${h.key}`}>
            <Box>
              <Typography sx={{ fontSize: 14, fontWeight: 600 }}>{h.label}</Typography>
              <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>{h.tab.label} › {h.section.title}</Typography>
            </Box>
          </li>
        )}
        onChange={(_e, h) => {
          if (!h) return;
          go({ tab: h.tab.id, section: h.section.id, key: h.key.startsWith('section:') ? undefined : h.key });
        }}
        noOptionsText="No setting by that name"
        blurOnSelect
        clearOnBlur
        value={null}
        renderInput={(p) => (
          <TextField
            {...p}
            size="small"
            placeholder="Find a setting: shrink, tax, preview code, printer…"
            InputProps={{ ...p.InputProps, startAdornment: <SearchIcon sx={{ color: 'text.secondary', mr: 0.5 }} /> }}
          />
        )}
        sx={{ maxWidth: 560, mb: 1.5 }}
      />
      <Tabs
        value={tab.id}
        onChange={(_e, next: SettingsTab) => go({ tab: next })}
        variant="scrollable"
        allowScrollButtonsMobile
        sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}
      >
        {tabs.map((t) => (
          <Tab key={t.id} value={t.id} label={t.label} sx={{ textTransform: 'none', fontWeight: 600 }} />
        ))}
      </Tabs>
      {isLoading && !settings ? (
        <LoadingScreen message="Loading settings..." />
      ) : (
        <Box>
          {sections.map((section, index) => (
            <SectionView
              key={section.id}
              tab={tab}
              section={section}
              settings={settings ?? []}
              open={isOpen(section.id, index)}
              onToggle={() => toggle(section.id, index)}
              highlight={highlight}
            />
          ))}
          {hasLegacy ? (
            <FormControlLabel control={<Switch size="small" checked={showLegacy} onChange={(e) => setShowLegacy(e.target.checked)} />}
              label={<Typography variant="body2">Show legacy sections</Typography>} />
          ) : null}
        </Box>
      )}
    </Box>
  );
}
