import { useState } from 'react';
import { format, parseISO } from 'date-fns';
import type { QaStaffRow, RoutineAssignee } from '../../../api/routines.api';
import { DEPT_ICON, displayName, formatShiftRange, scheduleGroups, scheduleSummary, shortName, staffChip } from './commandCenter';
import { AddPersonPopover } from './AddPersonPopover';
import { ChipMenu } from './QaChip';
import { ItemsMenu } from './ItemsMenu';
import { QaIcon } from './QaIcons';
import type { RowMenuItem } from './ItemsMenu';

export function ScheduleCard({
  date,
  staff,
  off,
  people,
  onCallIn,
  onClearCallIn,
  onLeftEarly,
  onRemove,
  onNudgePerson,
  onAddPerson,
  closedLabel,
}: {
  date: string;
  staff: QaStaffRow[];
  off?: QaStaffRow[];
  people: RoutineAssignee[];
  onCallIn: (personId: number) => void;
  onClearCallIn: (personId: number) => void;
  onLeftEarly: (personId: number) => void;
  onRemove: (personId: number) => void;
  onNudgePerson: (personId: number) => void;
  onAddPerson: (input: { user: number; shift: number; time_in: string; time_out: string }) => void;
  closedLabel?: string | null;
}) {
  const [kebab, setKebab] = useState<HTMLElement | null>(null);
  const [addAnchor, setAddAnchor] = useState<HTMLElement | null>(null);
  const [showOff, setShowOff] = useState(false);
  const visible = showOff ? [...staff, ...(off ?? [])] : staff;
  const groups = scheduleGroups(visible);
  const late = staff.some((row) => staffChip(row.status) === 'late');
  return (
    <aside className="card schedule">
      <h2>
        Schedule · {format(parseISO(date), 'EEE MMM d')}
        <span className="head-end">
          <span className={`sum${late ? ' warn' : ''}`}>{closedLabel ? '' : scheduleSummary(staff)}</span>
          {!closedLabel ? (
            <>
              <button
                type="button"
                className="kebab"
                aria-label="Schedule menu"
                onClick={(event) => setKebab(event.currentTarget)}
              >
                ⋮
              </button>
              <ItemsMenu
                anchor={kebab}
                onClose={() => setKebab(null)}
                items={[
                  {
                    label: 'Add person',
                    onClick: () => setAddAnchor(kebab),
                  },
                  {
                    label: showOff ? '✓ Show off today' : 'Show off today',
                    onClick: () => setShowOff((on) => !on),
                  },
                ]}
              />
              <AddPersonPopover
                date={date}
                people={people}
                onAdd={onAddPerson}
                anchor={addAnchor}
                onClose={() => setAddAnchor(null)}
              />
            </>
          ) : null}
        </span>
      </h2>
      <div className="scroll" id="schedRows">
        {closedLabel ? <div className="empty-closed">{closedLabel}</div> : null}
        {!closedLabel && !groups.length ? <div className="empty-closed">No one scheduled</div> : null}
        {!closedLabel && groups.map((group) => (
          <div key={group.department}>
            <div className="grp">
              <QaIcon name={DEPT_ICON[displayName(group.department, 'dept')] || 'home'} />
              {displayName(group.department, 'dept')}
            </div>
            <div className="rows">
              {group.rows.map((row) => {
                const chip = staffChip(row.status);
                const time = formatShiftRange(row.time_in, row.time_out);
                const items = staffMenu(row, {
                  onCallIn, onClearCallIn, onLeftEarly, onRemove, onNudgePerson,
                });
                return (
                  <div className={`row${chip === 'late' ? ' s-warn' : ''}`} key={`${row.id}-${row.shift_id ?? 'x'}`}>
                    <span className="name nowrap" title={row.added ? 'added' : row.name}>{shortName(row.name)}</span>
                    <span className="meta nowrap">{displayName(row.shift_name, 'shift')}</span>
                    <span className="time">{time}</span>
                    <span className="st">
                      <ChipMenu kind={chip} items={items} />
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

function staffMenu(
  row: QaStaffRow,
  handlers: {
    onCallIn: (personId: number) => void;
    onClearCallIn: (personId: number) => void;
    onLeftEarly: (personId: number) => void;
    onRemove: (personId: number) => void;
    onNudgePerson: (personId: number) => void;
  },
): RowMenuItem[] {
  const word = row.status;
  if (word === 'Left' || word === 'Off') return [];
  if (word === 'Called in') {
    return [{ label: 'Clear call-in', onClick: () => handlers.onClearCallIn(row.id) }];
  }
  if (word === 'In') {
    return [
      { label: 'Left early', onClick: () => handlers.onLeftEarly(row.id) },
      { label: 'Nudge', onClick: () => handlers.onNudgePerson(row.id) },
    ];
  }
  if (word === 'Late') {
    return [
      { label: 'Called in', onClick: () => handlers.onCallIn(row.id) },
      { label: 'Nudge', onClick: () => handlers.onNudgePerson(row.id) },
      { label: 'Remove from today', onClick: () => handlers.onRemove(row.id) },
    ];
  }
  return [
    { label: 'Called in', onClick: () => handlers.onCallIn(row.id) },
    { label: 'Remove from today', onClick: () => handlers.onRemove(row.id) },
  ];
}
