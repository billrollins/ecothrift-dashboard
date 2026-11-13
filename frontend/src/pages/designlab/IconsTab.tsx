/** Design Lab > Icons: Eco-Thrift's own icon set (icons/ecoIcons.tsx) and where each one is used today. */
import { Box, Button, Stack, Typography } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import { PageShell, Section } from '../../components/page/PageKit';
import { ACTION_ICON_NAMES, ECO_ICONS, NOTES, PAGE_ICON_NAMES, type EcoIconName } from '../../icons/ecoIcons';
import { NAV_ITEM_CATALOG } from '../../navigation/navItemCatalog';
import { SLOT_C_WORKSPACES } from '../../navigation/slotCNavLayout';
import { eco } from '../../theme/eco';

/** Every sidebar page and workspace that points at each icon. */
function usedBy(): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const ws of SLOT_C_WORKSPACES) (out[ws.icon] ??= []).push(`${ws.label} workspace`);
  for (const item of Object.values(NAV_ITEM_CATALOG)) (out[item.icon] ??= []).push(item.label);
  return out;
}

function IconCell({ name, uses }: { name: EcoIconName; uses: string[] }) {
  const Icon = ECO_ICONS[name];
  const use = uses.length ? uses.join(', ') : NOTES[name].use;
  return (
    <Stack
      alignItems="center"
      spacing={0.75}
      title={`${NOTES[name].use}. ${NOTES[name].metaphor}`}
      sx={{ p: 1.5, borderRadius: '12px', border: '1px solid', borderColor: 'divider', bgcolor: 'background.paper', textAlign: 'center', minWidth: 0 }}
    >
      <Icon sx={{ fontSize: 40, color: 'text.primary' }} />
      <Typography noWrap sx={{ fontSize: '0.8125rem', fontWeight: 800, maxWidth: '100%' }}>{name}</Typography>
      <Typography variant="caption" sx={{ maxWidth: '100%', minHeight: 38, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
        {use}
      </Typography>
    </Stack>
  );
}

const GRID = { display: 'grid', gap: 1.25, gridTemplateColumns: 'repeat(auto-fill, minmax(132px, 1fr))' } as const;
const SAMPLE: EcoIconName[] = ['processing', 'register', 'auction', 'restoration', 'thriftPlus', 'people'];

export default function IconsTab() {
  const uses = usedBy();
  return (
    <PageShell width="wide">
      <Section
        title="The recipe"
        hint={`${PAGE_ICON_NAMES.length + ACTION_ICON_NAMES.length} icons, one recipe: a 1.75 line, a soft wash, one kraft detail (page icons only).`}
        action={<Button size="small" component={RouterLink} to="/admin/icons">Full sheet</Button>}
      >
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={{ xs: 2.5, md: 5 }} alignItems={{ md: 'center' }}>
          <Stack direction="row" spacing={2.5} alignItems="flex-end">
            {[20, 24, 32, 48, 72].map((size) => {
              const Icon = ECO_ICONS.processing;
              return (
                <Stack key={size} alignItems="center" spacing={0.5}>
                  <Icon sx={{ fontSize: size, color: 'text.primary' }} />
                  <Typography variant="caption">{size}</Typography>
                </Stack>
              );
            })}
          </Stack>
          <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap>
            {SAMPLE.map((key) => {
              const Icon = ECO_ICONS[key];
              return (
                <Box key={key} sx={{ width: 52, height: 52, borderRadius: '16px', display: 'grid', placeItems: 'center', bgcolor: 'primary.main', color: 'primary.contrastText' }}>
                  <Icon sx={{ fontSize: 30 }} />
                </Box>
              );
            })}
          </Stack>
          <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap>
            {SAMPLE.map((key) => {
              const Icon = ECO_ICONS[key];
              return (
                <Box key={key} sx={{ width: 52, height: 52, borderRadius: '16px', display: 'grid', placeItems: 'center', bgcolor: eco.mint, color: 'primary.main' }}>
                  <Icon sx={{ fontSize: 30 }} />
                </Box>
              );
            })}
          </Stack>
        </Stack>
      </Section>

      <Section title="Page icons" hint="Sidebar pages, workspaces and page headers. The second line is where each is used today.">
        <Box sx={GRID}>
          {PAGE_ICON_NAMES.map((name) => <IconCell key={name} name={name} uses={uses[name] ?? []} />)}
        </Box>
      </Section>

      <Section title="Action icons" hint="Buttons: line only, no wash, no accent. The button's own colour speaks.">
        <Box sx={GRID}>
          {ACTION_ICON_NAMES.map((name) => <IconCell key={name} name={name} uses={[]} />)}
        </Box>
      </Section>
    </PageShell>
  );
}
