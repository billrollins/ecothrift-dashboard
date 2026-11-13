/**
 * Design Lab (/admin/design-lab, superusers; Dash Update #134, modelled on Dark Horse's): the Eco-Thrift look in one
 * place, wearing the Eco-Thrift theme (theme/eco.ts) while the rest of the app still wears today's.
 *   Theme   every token with its swatch and use, the fonts, the MUI parts dressed in it
 *   Icons   the icon set and where each one is used
 *   one tab per page type, at desktop and phone size side by side (a real phone sees the phone page)
 *   Surfaces the Universal Surface every object opens in (OOUX): its ten elements, the object map, each object
 *   Pages   the page registry: every page, its type and design checklist, open it or copy its brief
 * The tab is kept in the URL (?view=report&device=phone) so a view can be linked or reloaded.
 */
import { Box, Stack, Tab, Tabs, ThemeProvider, Typography } from '@mui/material';
import { useEffect, type ComponentType } from 'react';
import { useSearchParams } from 'react-router-dom';
import StackOnPhone from '../../components/page/StackOnPhone';
import { PAGE_REGISTRY, PAGE_TEMPLATES, type PageTemplate } from '../../navigation/pageRegistry';
import { ECO_FONT_HREF, ecoFonts, ecoTheme } from '../../theme/eco';
import { DevicePicker, DeviceView } from './DeviceView';
import IconsTab from './IconsTab';
import PagesTab from './PagesTab';
import SurfacesTab from './SurfacesTab';
import ThemeTab from './ThemeTab';
import { CalendarDemo, FormDemo, ListDetailDemo, OverviewDemo, RecordDemo, ReportDemo, SettingsDemo } from './demos';

/** Each demo with the page name its stand-in top bar shows. */
const DEMOS: Record<Exclude<PageTemplate, 'tool' | 'none'>, { View: ComponentType; title: string }> = {
  overview: { View: OverviewDemo, title: 'Processing' },
  'list-detail': { View: ListDetailDemo, title: 'Receiving' },
  record: { View: RecordDemo, title: 'Item' },
  calendar: { View: CalendarDemo, title: 'Delivery schedule' },
  report: { View: ReportDemo, title: 'Sales report' },
  form: { View: FormDemo, title: 'Price an item' },
  settings: { View: SettingsDemo, title: 'POS setup' },
};

type View = { id: string; label: string; demo?: (typeof PAGE_TEMPLATES)[number]; View?: ComponentType };

const VIEWS: View[] = [
  { id: 'theme', label: 'Theme', View: ThemeTab },
  { id: 'icons', label: 'Icons', View: IconsTab },
  ...PAGE_TEMPLATES.map((t) => ({ id: t.id, label: t.label, demo: t })),
  { id: 'surfaces', label: 'Surfaces', View: SurfacesTab },
  { id: 'pages', label: 'Pages', View: PagesTab },
];

/** Phase 1: the theme's fonts load with the Design Lab only (phase 2 moves them to index.html). */
function useEcoFonts() {
  useEffect(() => {
    if (document.querySelector(`link[href="${ECO_FONT_HREF}"]`)) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = ECO_FONT_HREF;
    document.head.appendChild(link);
  }, []);
}

export default function DesignLabPage() {
  useEcoFonts();
  const [params, setParams] = useSearchParams();
  const current = VIEWS.find((v) => v.id === params.get('view')) ?? VIEWS[0];
  const demo = current.demo;
  const pagesOfType = demo ? PAGE_REGISTRY.filter((p) => p.template === demo.id).length : 0;

  const pick = (id: string) => {
    const next = new URLSearchParams(params);
    if (id === VIEWS[0].id) next.delete('view');
    else next.set('view', id);
    setParams(next, { replace: true });
  };

  return (
    <ThemeProvider theme={ecoTheme}>
      <Box
        sx={{
          m: -3,
          minHeight: 'calc(100vh - 64px)',
          bgcolor: 'background.default',
          color: 'text.primary',
          fontFamily: ecoFonts.body,
        }}
      >
        <Stack
          direction={{ xs: 'column', md: 'row' }}
          alignItems={{ md: 'center' }}
          justifyContent="space-between"
          spacing={1}
          sx={{
            position: 'sticky',
            top: 0,
            zIndex: 3,
            px: { xs: 1.5, sm: 3 },
            bgcolor: 'background.paper',
            borderBottom: '1px solid',
            borderColor: 'divider',
          }}
        >
          <Tabs value={current.id} onChange={(_, id: string) => pick(id)} aria-label="Design Lab views" sx={{ minWidth: 0 }}>
            {VIEWS.map((v) => <Tab key={v.id} value={v.id} label={v.label} />)}
          </Tabs>
        </Stack>
        <Box sx={{ p: { xs: 1.5, sm: 3 }, pb: { xs: 4, sm: 6 } }}>
          {demo ? (
            <Stack spacing={2}>
              <Stack direction={{ xs: 'column', md: 'row' }} spacing={{ xs: 1, md: 2 }} alignItems={{ md: 'center' }} justifyContent="space-between">
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>{demo.use}</Typography>
                  <Typography variant="caption" component="div">
                    {demo.first === 'mobile' ? 'Phone' : 'Desktop'} first · on a phone {demo.phone} · {pagesOfType} Dash pages use it · made-up data
                  </Typography>
                </Box>
                <DevicePicker />
              </Stack>
              <DeviceView title={DEMOS[demo.id as keyof typeof DEMOS].title} View={DEMOS[demo.id as keyof typeof DEMOS].View} />
            </Stack>
          ) : current.View ? (
            <StackOnPhone><current.View /></StackOnPhone>
          ) : null}
        </Box>
      </Box>
    </ThemeProvider>
  );
}
