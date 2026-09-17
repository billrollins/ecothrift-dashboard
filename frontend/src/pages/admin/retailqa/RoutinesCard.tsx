import { useState } from 'react';
import { format, parseISO } from 'date-fns';
import type { QaJob, RoutineAssignee } from '../../../api/routines.api';
import { barTone, displayName, jobChip, jobTimeLabel, shortName } from './commandCenter';
import { QaChip } from './QaChip';
import { QaIcon } from './QaIcons';

export function RoutinesCard({
  date,
  jobs,
  people,
  onAssign,
  onNudge,
  onWeekView,
}: {
  date: string;
  jobs: QaJob[];
  people: RoutineAssignee[];
  onAssign: (runId: number, userId: number | '') => void;
  onNudge: (runId: number) => void;
  onWeekView: () => void;
}) {
  const done = jobs.filter((job) => jobChip(job.status, job.owner) === 'done').length;
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
      {needed ? <div className={`bar ${bar.tone}`}><i style={{ width: `${bar.pct}%` }} /></div> : null}
      <div className="scroll" id="rtBody">
        <RoutineGroup title="Section checks" jobs={sections} people={people} onAssign={onAssign} onNudge={onNudge} />
        <RoutineGroup title="Open / Day / Close" jobs={shifts} people={people} onAssign={onAssign} onNudge={onNudge} />
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
  onAssign: (runId: number, userId: number | '') => void;
  onNudge: (runId: number) => void;
}) {
  const allDone = jobs.length > 0 && jobs.every((job) => jobChip(job.status, job.owner) === 'done');
  const [open, setOpen] = useState(!allDone);
  const [reassignId, setReassignId] = useState<number | null>(null);
  if (!jobs.length) return null;
  const done = jobs.filter((job) => jobChip(job.status, job.owner) === 'done').length;
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
          const chip = jobChip(job.status, job.owner);
          const unassigned = chip === 'unas' && !job.owner;
          const pool = job.shift_people?.length ? job.shift_people : people;
          return (
            <div className={`row${chip === 'over' || chip === 'miss' || chip === 'unas' ? ' s-warn' : ''}`} key={`${job.key}-${job.run_id ?? job.section_id ?? index}`}>
              <span className="name nowrap">{displayName(job.title, 'routine')}</span>
              <span
                className={`owner nowrap${job.owner_state === 'scheduled' ? ' scheduled' : ''}`}
                title={job.owner_state === 'scheduled' ? 'scheduled' : (job.owner?.name || '')}
              >
                {(unassigned || reassignId === job.run_id) && job.run_id ? (
                  <select
                    className="assign"
                    defaultValue=""
                    onChange={(event) => {
                      const value = Number(event.target.value);
                      if (value) {
                        onAssign(job.run_id as number, value);
                        setReassignId(null);
                      }
                    }}
                  >
                    <option value="">Assign owner</option>
                    {pool.map((person) => (
                      <option key={person.id} value={person.id}>
                        {person.full_name || person.name}
                      </option>
                    ))}
                  </select>
                ) : job.owner?.name ? shortName(job.owner.name) : ''}
              </span>
              <span className="time nowrap">{jobTimeLabel(job)}</span>
              <span className="end">
                {chip !== 'done' && chip !== 'unas' ? (
                  <button
                    type="button"
                    className={`act ${chip === 'over' || chip === 'miss' ? 'warn' : ''}`}
                    onClick={() => {
                      if (chip === 'over' && job.run_id) onNudge(job.run_id);
                      else if (job.run_id) setReassignId(job.run_id);
                    }}
                  >
                    {chip === 'over' ? 'Nudge' : 'Reassign'}
                  </button>
                ) : null}
                <QaChip kind={chip} />
              </span>
            </div>
          );
        })}
      </div>
    </>
  );
}
