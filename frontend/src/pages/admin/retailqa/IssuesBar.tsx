import type { QaIssue, QaJob, QaStaffRow } from '../../../api/routines.api';
import { groupIssues } from './commandCenter';

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
  return (
    <section className="card issues">
      <h2>
        Needs your attention
        {rows.length ? <span className="sum warn">{rows.length}</span> : null}
      </h2>
      {rows.length ? (
        <div className="scroll rows">
          {rows.map((row) => (
            <div className="row" key={row.id}>
              <span className={`dot${row.severity === 'amber' ? ' amb' : ''}`} />
              <span className="nowrap">{row.sentence}</span>
              {row.action === 'nudge' && row.run_id ? (
                <button type="button" className="act always green" onClick={() => onNudge(row.run_id as number)}>Nudge</button>
              ) : null}
              {row.action === 'call_in' && row.person_id ? (
                <button type="button" className="act always green" onClick={() => onCallIn(row.person_id as number)}>Called in</button>
              ) : null}
              {row.action === 'reassign' ? (
                <button type="button" className="act always green" onClick={onReassign}>Reassign</button>
              ) : null}
              {row.action === 'open_cross' ? (
                <button type="button" className="act always green" onClick={onOpenCross}>Open</button>
              ) : null}
              {row.action === 'do_spot' ? (
                <button type="button" className="act always green" onClick={onDoSpot}>Walk</button>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <div className="empty">Nothing needs attention right now.</div>
      )}
    </section>
  );
}
