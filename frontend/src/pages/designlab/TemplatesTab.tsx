/**
 * Design Lab > Templates: every page type, each with a live demo. "Open" opens the demo in a new tab, inside the real
 * Dash shell on made-up data, exactly as a page of that type looks live. "Phone" opens the same live page in a
 * phone-width frame (a real 390 px window: every breakpoint, scroll and sticky bar behaves as on a phone).
 */
import { Box, Button, Dialog, IconButton, Stack, Typography } from '@mui/material';
import { useState } from 'react';
import { PageShell, Section, StatusPill } from '../../components/page/PageKit';
import { MicroLabel } from '../../components/page/RichKit';
import { ECO_ICONS } from '../../icons/ecoIcons';
import { PAGE_REGISTRY, PAGE_TEMPLATES, TOOL_TEMPLATE, templateDemoPath, type TemplateInfo } from '../../navigation/pageRegistry';

const NEW: string[] = ['data-table', 'command-center', 'station'];

function PhoneFrame({ template, onClose }: { template: TemplateInfo | null; onClose: () => void }) {
  return (
    <Dialog open={Boolean(template)} onClose={onClose} maxWidth={false}
      slotProps={{ paper: { sx: { bgcolor: 'transparent', boxShadow: 'none', overflow: 'visible' } } }}>
      {template ? (
        <Stack alignItems="center" spacing={1}>
          <Stack direction="row" alignItems="center" spacing={1} sx={{ color: 'common.white' }}>
            <Typography sx={{ fontWeight: 800 }}>{template.label} on a phone</Typography>
            <IconButton size="small" onClick={onClose} aria-label="Close" sx={{ color: 'common.white' }}><ECO_ICONS.close /></IconButton>
          </Stack>
          <Box sx={{ p: '10px', borderRadius: '34px', bgcolor: 'text.primary', boxShadow: 12 }}>
            <Box component="iframe" title={`${template.label} demo on a phone`} src={templateDemoPath(template.id)}
              sx={{ display: 'block', width: 390, height: 'min(844px, calc(100vh - 120px))', border: 0, borderRadius: '26px', bgcolor: 'background.default' }} />
          </Box>
        </Stack>
      ) : null}
    </Dialog>
  );
}

export default function TemplatesTab() {
  const [phone, setPhone] = useState<TemplateInfo | null>(null);
  const count = (id: string) => PAGE_REGISTRY.filter((p) => p.template === id).length;
  return (
    <PageShell width="wide">
      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))', xl: 'repeat(3, minmax(0, 1fr))' } }}>
        {PAGE_TEMPLATES.map((t) => (
          <Section key={t.id}>
            <Stack spacing={1.25} sx={{ height: '100%' }}>
              <Stack direction="row" spacing={1} alignItems="center">
                <Typography variant="h5" component="h2" sx={{ flex: 1 }}>{t.label}</Typography>
                {NEW.includes(t.id) ? <StatusPill tone="info" label="New" /> : null}
                <StatusPill tone="quiet" label={t.first === 'mobile' ? 'Phone first' : 'Desktop first'} />
              </Stack>
              <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>{t.use}</Typography>
              <Box>
                <MicroLabel>On a phone</MicroLabel>
                <Typography variant="body2" sx={{ fontWeight: 700 }}>{t.phone}</Typography>
              </Box>
              <Stack direction="row" spacing={1} alignItems="center">
                <Button variant="contained" startIcon={<ECO_ICONS.openExternal />} href={templateDemoPath(t.id)} target="_blank" rel="noopener">Open live demo</Button>
                <Button variant="outlined" onClick={() => setPhone(t)}>Phone</Button>
                <Box sx={{ flex: 1 }} />
                <Typography variant="caption" sx={{ fontWeight: 700 }}>{count(t.id)} Dash pages</Typography>
              </Stack>
            </Stack>
          </Section>
        ))}
        <Section>
          <Stack spacing={1.25}>
            <Typography variant="h5" component="h2">{TOOL_TEMPLATE.label}</Typography>
            <Typography variant="body2" color="text.secondary">{TOOL_TEMPLATE.use}</Typography>
            <Typography variant="caption" sx={{ fontWeight: 700 }}>{count('tool')} Dash pages · no demo: each editor is its own canvas, built from the kit pieces (Elements tab).</Typography>
          </Stack>
        </Section>
      </Box>
      <PhoneFrame template={phone} onClose={() => setPhone(null)} />
    </PageShell>
  );
}
