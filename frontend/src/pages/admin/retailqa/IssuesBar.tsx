import type { QaIssue, QaJob, QaStaffRow } from '../../../api/routines.api';
import { groupIssues } from './commandCenter';
import { QaIcon } from './QaIcons';

export function IssuesBar({
  issues,
  staff,
  jobs,
  onCallIn,
  onReassign,
  onNudge,
  onOpenCross,
  onDoSpot,
}: {
  issues: QaIssue[];
  staff: QaStaffRow[];
  jobs: QaJob[];
  onCallIn: (personId: number) => void;
  onReassign: () => void;
  onNudge: (runId: number) => void;
  onOpenCross: () => void;
  onDoSpot: () => void;
}) {
  const rows = groupIssues(issues, staff, jobs);
  const red = rows.some((row) => row.severity === 'red');
  return (
    <section className="card issues">
      <h2>
        Needs your attention
        {rows.length ? <span className={`pill${red ? '' : ' warn'}`}>{rows.length}</span> : null}
      </h2>
      {rows.length ? (
        <div className="scroll rows">
          {rows.map((row) => {
            const tone = row.severity === 'red' ? 'bad' : row.severity === 'amber' ? 'warn' : '';
            return (
              <div className={`row${tone ? ` s-${tone}` : ''}`} key={row.id}>
                <span className="ic"><QaIcon name={row.icon} /></span>
                <span className="nowrap">{row.sentence}</span>
                {row.action === 'nudge' && row.run_id ? (
                  <button type="button" className={`act always ${tone || 'warn'}`} onClick={() => onNudge(row.run_id as number)}>Nudge</button>
                ) : null}
                {row.action === 'call_in' && row.person_id ? (
                  <button type="button" className={`act always ${tone || 'warn'}`} onClick={() => onCallIn(row.person_id as number)}>Called in</button>
                ) : null}
                {row.action === 'reassign' ? (
                  <button type="button" className={`act always ${tone || 'warn'}`} onClick={onReassign}>Reassign</button>
                ) : null}
                {row.action === 'open_cross' ? (
                  <button type="button" className={`act always ${tone || 'warn'}`} onClick={onOpenCross}>Open</button>
                ) : null}
                {row.action === 'do_spot' ? (
                  <button type="button" className={`act always ${tone || 'warn'}`} onClick={onDoSpot}>Walk</button>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="empty"><QaIcon name="check" />Nothing needs attention right now.</div>
      )}
    </section>
  );
}
