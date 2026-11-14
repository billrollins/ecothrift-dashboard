/**
 * HR > Incidents in the managers' HR workspace (Dash Update #140): the incident reports to follow up (#131), on the
 * page kit, so the top bar names it. Staff file and follow their own from Home > HR (HR > Incidents, /hr/incidents).
 * `?report=<id>` opens one report (the Requests inbox links here).
 */
import { PageShell } from '../../components/page/PageKit';
import HrIncidents from './HrIncidents';

export default function HrIncidentsPage() {
  return (
    <PageShell>
      <HrIncidents kit />
    </PageShell>
  );
}
