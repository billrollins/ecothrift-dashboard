/**
 * A page type's live demo (/admin/design-lab/demo/:template, superusers; Dash Update #134). The demo page runs inside
 * the real Dash shell (sidebar, top bar, the real window width and phone behaviour), wearing the Eco-Thrift theme,
 * on made-up data: exactly what a page of that type will look like live. The top bar names it after a real page of
 * that type (pageTitleFor). A new page starts by copying its type's demo (pages/designlab/demos/).
 */
import { Box, ThemeProvider } from '@mui/material';
import type { ComponentType } from 'react';
import { useParams } from 'react-router-dom';
import { EmptyState, PageShell } from '../../components/page/PageKit';
import { ECO_ICONS } from '../../icons/ecoIcons';
import type { PageTemplate } from '../../navigation/pageRegistry';
import { ecoFonts, ecoTheme } from '../../theme/eco';
import { CalendarDemo, FormDemo, ListDetailDemo, OverviewDemo, RecordDemo, ReportDemo, SettingsDemo } from './demos';
import { CommandCenterDemo } from './demos/CommandCenterDemo';
import { DataTableDemo } from './demos/DataTableDemo';
import { StationDemo } from './demos/StationDemo';
import { DemoWindowProvider } from './WindowDialog';

export const DEMO_VIEWS: Partial<Record<PageTemplate, ComponentType>> = {
  overview: OverviewDemo,
  'data-table': DataTableDemo,
  'list-detail': ListDetailDemo,
  record: RecordDemo,
  'command-center': CommandCenterDemo,
  station: StationDemo,
  calendar: CalendarDemo,
  report: ReportDemo,
  form: FormDemo,
  settings: SettingsDemo,
};

/** Page types whose demo fills the whole work area edge to edge (no page padding): stations and command centers. */
const FULL_BLEED: PageTemplate[] = ['command-center', 'station'];

export default function DemoPage() {
  const { template = '' } = useParams();
  const View = DEMO_VIEWS[template as PageTemplate];
  const bleed = FULL_BLEED.includes(template as PageTemplate);
  return (
    <ThemeProvider theme={ecoTheme}>
      <DemoWindowProvider>
      <Box
        sx={{
          m: -3,
          p: bleed ? 0 : { xs: 1.5, sm: 3 },
          minHeight: 'calc(100vh - 64px)',
          display: 'flex',
          flexDirection: 'column',
          bgcolor: 'background.default',
          color: 'text.primary',
          fontFamily: ecoFonts.body,
        }}
      >
        {View ? <View /> : (
          <PageShell>
            <EmptyState Icon={ECO_ICONS.studio} title="No demo for this page type" body="Open the Design Lab's Templates tab to see the page types." />
          </PageShell>
        )}
      </Box>
      </DemoWindowProvider>
    </ThemeProvider>
  );
}
