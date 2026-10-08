import { Box, Paper, Stack, Typography } from '@mui/material';
import { PageHeader } from '../../components/common/PageHeader';
import { ACTION_ICON_NAMES, ECO_ICONS, NOTES, PAGE_ICON_NAMES, type EcoIconName } from '../../icons/ecoIcons';
import { NAV_ITEM_CATALOG } from '../../navigation/navItemCatalog';
import { SLOT_C_WORKSPACES } from '../../navigation/slotCNavLayout';

/** Every sidebar page and workspace that points at each icon. */
function usedBy(): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const item of Object.values(NAV_ITEM_CATALOG)) (out[item.icon] ??= []).push(item.label);
  for (const ws of SLOT_C_WORKSPACES) (out[ws.icon] ??= []).push(`${ws.label} workspace`);
  return out;
}

const GROUNDS = [
  { label: 'Sidebar', bg: '#fff', fg: '#5b6356' },
  { label: 'Selected', bg: '#fff', fg: '#2e7d32' },
  { label: 'Band', bg: '#2f4a32', fg: '#fff' },
  { label: 'One colour', bg: '#fff', fg: '#22271f', accent: 'currentColor' },
];

function Tile({ name, size, bg, fg, accent }: { name: EcoIconName; size: number; bg: string; fg: string; accent?: string }) {
  const Icon = ECO_ICONS[name];
  return (
    <Box
      sx={{
        width: 48, height: 48, borderRadius: 1, bgcolor: bg, color: fg, display: 'grid', placeItems: 'center',
        border: '1px solid #e2e4dd', ...(accent ? { '--eco-icon-accent': accent } : {}),
      }}
    >
      <Icon sx={{ fontSize: size }} />
    </Box>
  );
}

function IconRow({ name, uses }: { name: EcoIconName; uses: string[] }) {
  const note = NOTES[name];
  return (
    <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ py: 1, borderBottom: '1px solid #e2e4dd' }}>
      <Box sx={{ width: { md: 320 }, flexShrink: 0, minWidth: 0 }}>
        <Typography fontWeight={600}>{name}</Typography>
        <Typography variant="body2">{note.use}</Typography>
        <Typography variant="caption" color="text.secondary">{note.metaphor}</Typography>
        {uses.length ? (
          <Typography variant="caption" display="block" color="text.secondary">Sidebar: {uses.join(', ')}</Typography>
        ) : null}
      </Box>
      <Stack direction="row" spacing={0.75} sx={{ flexWrap: 'wrap', rowGap: 0.75 }}>
        {GROUNDS.flatMap((g) => [40, 20].map((size) => (
          <Tile key={`${g.label}-${size}`} name={name} size={size} bg={g.bg} fg={g.fg} accent={g.accent} />
        )))}
      </Stack>
    </Stack>
  );
}

function Strip({ names, bg, fg }: { names: EcoIconName[]; bg: string; fg: string }) {
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.25, p: 1.5, bgcolor: bg, color: fg, borderRadius: 1 }}>
      {names.map((name) => {
        const Icon = ECO_ICONS[name];
        return <Icon key={name} titleAccess={name} sx={{ fontSize: 20 }} />;
      })}
    </Box>
  );
}

/** Superuser: the whole icon set on one sheet (T75), to check it reads as one family before anything changes. */
export default function IconsPage() {
  const uses = usedBy();
  return (
    <Box>
      <PageHeader
        title="Icons"
        subtitle={`Eco-Thrift's own set: ${PAGE_ICON_NAMES.length} page icons, ${ACTION_ICON_NAMES.length} action icons. The recipe is at the top of icons/ecoIcons.tsx.`}
      />
      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Typography variant="subtitle2" gutterBottom>All of them at 20 px, the sidebar size</Typography>
        <Stack spacing={1}>
          <Strip names={[...PAGE_ICON_NAMES, ...ACTION_ICON_NAMES]} bg="#fff" fg="#5b6356" />
          <Strip names={[...PAGE_ICON_NAMES, ...ACTION_ICON_NAMES]} bg="#2f4a32" fg="#fff" />
        </Stack>
      </Paper>
      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Typography variant="subtitle2">Page icons (sidebar, workspaces, page headers)</Typography>
        {PAGE_ICON_NAMES.map((name) => <IconRow key={name} name={name} uses={uses[name] ?? []} />)}
      </Paper>
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="subtitle2">Action icons (buttons: line only)</Typography>
        {ACTION_ICON_NAMES.map((name) => <IconRow key={name} name={name} uses={uses[name] ?? []} />)}
      </Paper>
    </Box>
  );
}
