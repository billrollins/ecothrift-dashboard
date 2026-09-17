import { format, parseISO } from 'date-fns';
import type { QaStaffRow } from '../../../api/routines.api';
import { CHIP_LABEL, displayName, scheduleGroups, scheduleSummary, shortName, staffChip } from './commandCenter';

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
  return (
    <aside className="card schedule">
      <h2>
        Schedule · {format(parseISO(date), 'EEE MMM d')}
        <span className="sum">{scheduleSummary(staff)}</span>
      </h2>
      <div className="scroll" id="schedRows">
        {groups.map((group) => (
          <div key={group.department}>
            <div className="grp">{displayName(group.department, 'dept')}</div>
            {group.rows.map((row) => {
              const chip = staffChip(row.status);
              const time = row.time_in && row.time_out ? `${row.time_in} to ${row.time_out}` : '';
              return (
                <div className="row" key={row.id}>
                  <span className="name nowrap" title={row.name}>{shortName(row.name)}</span>
                  <span className="shift nowrap">{displayName(row.shift_name, 'shift')}</span>
                  <span className="time">{time}</span>
                  <span className="st">
                    {chip === 'late' ? (
                      <button type="button" className="act red" onClick={() => onCallIn(row.id)}>Called in</button>
                    ) : null}
                    <span className={`chip ${chip}`}>{CHIP_LABEL[chip]}</span>
                  </span>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </aside>
  );
}
