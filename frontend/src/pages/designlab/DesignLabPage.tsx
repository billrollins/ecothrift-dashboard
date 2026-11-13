/**
 * Design Lab (/admin/design-lab, superusers; Dash Update #134, modelled on Dark Horse's): the Eco-Thrift look in one
 * place, wearing the Eco-Thrift theme (theme/eco.ts).
 *   Theme      every token with its swatch and use, the fonts, the MUI parts dressed in it
 *   Icons      the icon set and where each one is used
 *   Templates  every page type; each opens as a live demo page in a new tab (/admin/design-lab/demo/<type>), inside
 *              the real Dash shell on made-up data, or in a phone-width frame
 *   Windows    the object window every object opens in; each opens as a real modal
 *   Elements   every kit element with a live preview and its import line
 *   Registry   pages, templates, windows and elements, each with the owner's checklist ticks
 * The tab is kept in the URL (?view=windows) so a view can be linked or reloaded.
 */
import { Box, Tab, Tabs, ThemeProvider } from '@mui/material';
import type { ComponentType } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ecoFonts, ecoTheme } from '../../theme/eco';
import ElementsTab from './ElementsTab';
import IconsTab from './IconsTab';
import RegistryTab from './RegistryTab';
import TemplatesTab from './TemplatesTab';
import ThemeTab from './ThemeTab';
import { DemoWindowProvider } from './WindowDialog';
import WindowsTab from './WindowsTab';

const VIEWS: { id: string; label: string; View: ComponentType }[] = [
  { id: 'theme', label: 'Theme', View: ThemeTab },
  { id: 'icons', label: 'Icons', View: IconsTab },
  { id: 'templates', label: 'Templates', View: TemplatesTab },
  { id: 'windows', label: 'Windows', View: WindowsTab },
  { id: 'elements', label: 'Elements', View: ElementsTab },
  { id: 'registry', label: 'Registry', View: RegistryTab },
];
/** Old links (round 2) still land somewhere sensible: a page type's old tab opens Templates. */
const ALIASES: Record<string, string> = { pages: 'registry', surfaces: 'windows' };

export default function DesignLabPage() {
  const [params, setParams] = useSearchParams();
  const raw = params.get('view') ?? '';
  const id = ALIASES[raw] ?? raw;
  const current = VIEWS.find((v) => v.id === id) ?? (raw ? VIEWS[2] : VIEWS[0]);
  const { View } = current;

  const pick = (next: string) => setParams(next === VIEWS[0].id ? {} : { view: next }, { replace: true });

  return (
    <ThemeProvider theme={ecoTheme}>
      <DemoWindowProvider>
        <Box sx={{ m: -3, minHeight: 'calc(100vh - 64px)', bgcolor: 'background.default', color: 'text.primary', fontFamily: ecoFonts.body }}>
          {/* Sticky right under the top bar. The page area is padded 24 px, so sticking at 0 left a band above the
              tabs (Bill, 11-13): stick at -24 px instead. */}
          <Box sx={{ position: 'sticky', top: (t) => t.spacing(-3), zIndex: 3, px: { xs: 1.5, sm: 3 }, bgcolor: 'background.paper', borderBottom: 1, borderColor: 'divider' }}>
            <Tabs value={current.id} onChange={(_, v: string) => pick(v)} aria-label="Design Lab views">
              {VIEWS.map((v) => <Tab key={v.id} value={v.id} label={v.label} />)}
            </Tabs>
          </Box>
          <Box sx={{ p: { xs: 1.5, sm: 3 }, pb: { xs: 4, sm: 6 } }}>
            <View />
          </Box>
        </Box>
      </DemoWindowProvider>
    </ThemeProvider>
  );
}
