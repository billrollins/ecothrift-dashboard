import { format, parseISO } from 'date-fns';
import type { QaStaffRow } from '../../../api/routines.api';
import { DEPT_ICON, displayName, formatShiftRange, scheduleGroups, scheduleSummary, shortName, staffChip } from './commandCenter';
import { QaChip } from './QaChip';
import { QaIcon } from './QaIcons';

export function ScheduleCard({
  date,
  staff,
  onCallIn,
}: {
  date: string;
  staff: QaStaffRow[];
  onCallIn: (personId: number) => void;
}) {
  const groups = scheduleGroups(staff);
  const late = staff.some((row) => staffChip(row.status) === 'late');
  return (
    <aside className="card schedule">
      <h2>
        Schedule · {format(parseISO(date), 'EEE MMM d')}
        <span className={`sum${late ? ' warn' : ''}`}>{scheduleSummary(staff)}</span>
      </h2>
      <div className="scroll" id="schedRows">
        {groups.map((group) => (
          <div key={group.department}>
            <div className="grp">
              <QaIcon name={DEPT_ICON[displayName(group.department, 'dept')] || 'home'} />
              {displayName(group.department, 'dept')}
            </div>
            <div className="rows">
              {group.rows.map((row) => {
                const chip = staffChip(row.status);
                const time = formatShiftRange(row.time_in, row.time_out);
                return (
                  <div className={`row${chip === 'late' ? ' s-warn' : ''}`} key={row.id}>
                    <span className="name nowrap" title={row.name}>{shortName(row.name)}</span>
                    <span className="meta nowrap">{displayName(row.shift_name, 'shift')}</span>
                    <span className="time">{time}</span>
                    <span className="st">
                      {chip === 'late' ? (
                        <button type="button" className="act warn" onClick={() => onCallIn(row.id)}>Called in</button>
                      ) : null}
                      <QaChip kind={chip} />
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}
