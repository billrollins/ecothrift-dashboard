import { useState } from 'react';
import { format, parseISO } from 'date-fns';
import type { QaJob, RoutineAssignee } from '../../../api/routines.api';
import { CHECKLISTS_LABEL, barTone, displayName, jobChip, jobTimeLabel, missReasonText, missedLine, nudgeLabel, shortName } from './commandCenter';
import { ChipMenu } from './QaChip';
import { QaIcon } from './QaIcons';

export function RoutinesCard({
  date,
  jobs,
  people,
  onAssign,
  onNudge,
  onWeekView,
  closedLabel,
}: {
  date: string;
  jobs: QaJob[];
  people: RoutineAssignee[];
  onAssign: (job: QaJob, userId: number | '') => void;
  onNudge: (runId: number, el: HTMLElement) => void;
  onWeekView: () => void;
  closedLabel?: string | null;
}) {
  const done = jobs.filter((job) => jobChip(job.status, job.owner, job.urgency) === 'done').length;
  const needed = jobs.length;
  const sections = jobs.filter((job) => job.group === 'section');
  const shifts = jobs.filter((job) => job.group === 'shift');
  const bar = barTone(jobs);

  return (
    <section className="card routines">
      <h2>
        Routines · {format(parseISO(date), 'EEE MMM d')}
        <span>
          <span className="sum">{needed ? `${done} of ${needed} done` : ''}</span>
          {' \u00a0\u00a0 '}
          <a href="#" onClick={(event) => { event.preventDefault(); onWeekView(); }}>Week view</a>
        </span>
      </h2>
      {needed && !closedLabel ? <div className={`bar ${bar.tone}`}><i style={{ width: `${bar.pct}%` }} /></div> : null}
      <div className="scroll" id="rtBody">
        {closedLabel ? <div className="empty-closed">{closedLabel}</div> : null}
        {!closedLabel && !needed ? <div className="empty-closed">No routines today</div> : null}
        {!closedLabel ? (
          <>
            <RoutineGroup title="Section checks" jobs={sections} people={people} onAssign={onAssign} onNudge={onNudge} />
            <RoutineGroup title={CHECKLISTS_LABEL} jobs={shifts} people={people} onAssign={onAssign} onNudge={onNudge} />
          </>
        ) : null}
      </div>
    </section>
  );
}

function RoutineGroup({
  title,
  jobs,
  people,
  onAssign,
  onNudge,
}: {
  title: string;
  jobs: QaJob[];
  people: RoutineAssignee[];
  onAssign: (job: QaJob, userId: number | '') => void;
  onNudge: (runId: number, el: HTMLElement) => void;
}) {
  const allDone = jobs.length > 0 && jobs.every((job) => jobChip(job.status, job.owner, job.urgency) === 'done');
  const [open, setOpen] = useState(!allDone);
  const [reassignKey, setReassignKey] = useState<string | null>(null);
  if (!jobs.length) return null;
  const done = jobs.filter((job) => jobChip(job.status, job.owner, job.urgency) === 'done').length;
  if (allDone && !open) {
    return (
      <>
        <div className="grp">{title}</div>
        <div className="rows">
          <div
            className="row grp-done"
            role="button"
            tabIndex={0}
            onClick={() => setOpen(true)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') setOpen(true);
            }}
          >
            <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <QaIcon name="check" /> All {jobs.length} done
            </span>
            <span>▸</span>
          </div>
        </div>
      </>
    );
  }
  return (
    <>
      <div className="grp">
        {title}
        <span className="cnt">{done} of {jobs.length}</span>
      </div>
      <div className="rows">
        {jobs.map((job, index) => {
          const chip = jobChip(job.status, job.owner, job.urgency);
          const unassigned = chip === 'unas' && !job.owner;
          const pool = job.shift_people?.length ? job.shift_people : people;
          const stripe = chip === 'hard' || chip === 'miss' || chip === 'unas' ? ' s-bad' : chip === 'over' ? ' s-warn' : '';
          const rowKey = job.section_id != null ? `s${job.section_id}` : `r${job.run_id ?? index}`;
          const canAssign = Boolean(
            (unassigned || reassignKey === rowKey) && (job.section_id || job.run_id),
          );
          return (
            <div className={`row${stripe}`} key={`${job.key}-${job.run_id ?? job.section_id ?? index}`}>
              <span className="name nowrap">{displayName(job.title, 'routine')}</span>
              <span
                className={`owner nowrap${job.owner_state === 'scheduled' || job.owner_state === 'pool' ? ' scheduled' : ''}`}
                title={job.owner_state === 'scheduled' || job.owner_state === 'pool' ? (job.owner_state || '') : (job.owner?.name || '')}
              >
                {canAssign ? (
                  <select
                    className="assign"
                    defaultValue=""
                    onChange={(event) => {
                      const value = Number(event.target.value);
                      if (value) {
                        onAssign(job, value);
                        setReassignKey(null);
                      }
                    }}
                  >
                    <option value="">Assign owner</option>
                    {pool.map((person) => (
                      <option key={person.id} value={person.id}>
                        {'full_name' in person && person.full_name
                          ? person.full_name
                          : 'name' in person && person.name
                            ? person.name
                            : String(person.id)}
                      </option>
                    ))}
                  </select>
                ) : job.owner?.name ? (
                  job.owner_state === 'pool' || job.owner.id == null ? job.owner.name : shortName(job.owner.name)
                ) : ''}
              </span>
              <span className="time" title={missReasonText(job) || undefined}>
                <span className="due nowrap">{jobTimeLabel(job)}</span>
                {missedLine(job) ? <span className="miss-why nowrap">{missedLine(job)}</span> : null}
                {job.owner_late ? <span className="owner-late">Owner late</span> : null}
                {nudgeLabel(job.nudged_at) ? <span className="nudged">{nudgeLabel(job.nudged_at)}</span> : null}
              </span>
              <span className="end">
                <ChipMenu
                  kind={chip}
                  title={nudgeLabel(job.nudged_at) || undefined}
                  items={
                    chip !== 'done' && chip !== 'unas' && (job.run_id || job.section_id)
                      ? [
                          ...(job.run_id
                            ? [{ label: 'Nudge', onClick: () => onNudge(job.run_id as number, document.body) }]
                            : []),
                          { label: 'Reassign', onClick: () => setReassignKey(rowKey) },
                        ]
                      : []
                  }
                />
              </span>
            </div>
          );
        })}
      </div>
    </>
  );
}
