import { Dialog, DialogContent, DialogTitle, IconButton } from '@mui/material';
import { addDays, format, parseISO } from 'date-fns';
import { useState } from 'react';
import type { PersonWeekRow, QaDayTile, QaToday, QaWeek, SpotScoreCard } from '../../../api/routines.api';
import { ccTokens } from '../../../theme';
import { weekMonday } from '../routines/gradeWeek';
import { displayName, peopleDots, sectionCheckDoneLabel } from './commandCenter';
import { ItemsMenu, type RowMenuItem } from './ItemsMenu';
import { QaIcon } from './QaIcons';

const WALK_FLOOR = 3;

export type SummaryId = 'spot' | 'cross' | 'people';

export function SummaryDialogs({
  open,
  onClose,
  week,
  today,
  tiles,
  board,
  weekData,
  spots,
  people,
  onDoSpot,
  onOpenRun,
  workers,
  canEdit,
  onAssignChecker,
  onUnblock,
}: {
  open: SummaryId | null;
  onClose: () => void;
  week: string;
  today: string;
  tiles: QaDayTile[];
  board?: QaToday;
  weekData?: QaWeek;
  spots: Array<SpotScoreCard & { date: string }>;
  people: PersonWeekRow[];
  onDoSpot: () => void;
  onOpenRun: (runId: number) => void;
  workers: Array<{ id: number; name: string }>;
  canEdit: boolean;
  onAssignChecker: (sectionId: number, userId: number) => void;
  onUnblock: (sectionId: number) => void;
}) {
  const monday = weekMonday(week);
  const sunday = addDays(monday, 6);
  const cross = board?.cross;
  const ready = (board?.jobs ?? [])
    .filter((job) => job.group === 'section' && job.status === 'Done')
    .map((job) => job.title);
  const flags = (weekData?.cross_diagnostics ?? []).filter((row) => row.items_fixed >= 6);

  return (
    <>
      <BoardDialog open={open === 'spot'} onClose={onClose} title={`Spot walks · ${format(monday, 'MMM d')} to ${format(sunday, 'd')}`}>
        <table className="cc-dialog-table">
          <thead>
            <tr><th>Day</th><th>Section</th><th>By</th><th className="r">Score</th><th></th></tr>
          </thead>
          <tbody>
            {tiles.filter((tile) => tile.graded ?? tile.open).map((tile) => {
              const spot = spots.find((row) => row.date === tile.date);
              const day = `${tile.weekday} ${format(parseISO(tile.date), 'd')}`;
              const dueWord = `Due ${format(parseISO(tile.date), 'EEE MMM d')}`;
              if (spot) {
                return (
                  <tr key={tile.date}>
                    <td>{day}</td>
                    <td>{displayName(spot.section_name, 'auto') || '—'}</td>
                    <td>{spot.attributed_to?.name || '—'}</td>
                    <td className="r">{spot.spot_score ?? '—'}</td>
                    <td className="r">
                      {spot.run_id ? <a href="#" onClick={(event) => { event.preventDefault(); onOpenRun(spot.run_id as number); }}>View</a> : null}
                    </td>
                  </tr>
                );
              }
              if (tile.date > today || tile.is_future || tile.date === today) {
                const canWalk = tile.date === today && ready.length > 0;
                return (
                  <tr key={tile.date}>
                    <td>{day}</td>
                    <td colSpan={tile.date === today ? 2 : 3} className="tone-grey">{dueWord}</td>
                    {tile.date === today ? (
                      <td className="r">
                        <span title={canWalk ? ready.join(', ') : 'No section is ready'}>
                          <button type="button" className="walk-now" disabled={!canWalk} onClick={onDoSpot}>
                            Walk now
                          </button>
                        </span>
                      </td>
                    ) : (
                      <td />
                    )}
                  </tr>
                );
              }
              return (
                <tr key={tile.date}>
                  <td>{day}</td>
                  <td colSpan={4} className="tone-bad">Not done</td>
                </tr>
              );
            })}
            {spots.length ? (
              <tr>
                <td colSpan={3}>Combined score</td>
                <td className="r">
                  {Math.round(spots.reduce((sum, row) => sum + (row.spot_score ?? 0), 0) / spots.length)}
                </td>
                <td />
              </tr>
            ) : null}
          </tbody>
        </table>
        <div className="cc-dialog-note">{WALK_FLOOR} walks this week keep the grade uncapped.</div>
      </BoardDialog>

      <BoardDialog open={open === 'cross'} onClose={onClose} title={`Cross-checks · due ${cross?.due_label || '—'}`}>
        <table className="cc-dialog-table">
          <thead>
            <tr>
              <th>Section</th><th>Owner</th><th>Checker</th><th>Status</th>
              <th className="r">Items fixed</th><th className="r">Score</th><th></th>
            </tr>
          </thead>
          <tbody>
            {(cross?.rows ?? []).map((row) => {
              const stuck = row.checker_state === 'not_scheduled'
                || row.checker_state === 'called_in'
                || row.checker_state === 'unassigned'
                || row.checker_state === 'leaves_early'
                || row.checker_state === 'left';
              const stateLabel = row.checker_state === 'not_scheduled'
                ? 'Not scheduled'
                : row.checker_state === 'called_in'
                  ? 'Called in'
                  : row.checker_state === 'unassigned'
                    ? 'Unassigned'
                    : row.checker_state === 'leaves_early'
                      ? `Leaves ${row.checker_out || ''}`.trim()
                      : row.checker_state === 'left'
                        ? 'Clocked out'
                        : '';
              const checkerName = typeof row.checker === 'string' ? row.checker : row.checker?.name || '';
              const checkerId = typeof row.checker === 'string' ? null : row.checker?.id;
              const openRow = row.status !== 'Validated' && row.status !== 'Issues found';
              const choices = workers.filter((person) => person.id !== row.owner?.id && person.id !== checkerId);
              return (
              <tr key={row.run_id ?? row.section_id ?? row.section_name} className={stuck ? 'stuck' : undefined}>
                <td>{displayName(row.section_name, 'auto')}</td>
                <td>{row.owner?.name || '—'}</td>
                <td>
                  {canEdit && openRow && row.section_id ? (
                    <CheckerPicker
                      name={checkerName}
                      label={`Change ${row.section_name} checker`}
                      choices={choices}
                      onPick={(userId) => onAssignChecker(row.section_id as number, userId)}
                    />
                  ) : (checkerName || '—')}
                  {stateLabel ? <span className="stuck-note">{stateLabel}</span> : null}
                </td>
                <td className={row.blocked && !row.waived ? 'wait' : row.tone === 'grey' ? 'tone-grey' : row.tone === 'bad' ? 'tone-bad' : ''}>
                  <span className="status-cell">
                    {row.status_label || row.status}
                    {canEdit && row.blocked && !row.waived && row.section_id ? (
                      <button type="button" className="unblock" onClick={() => onUnblock(row.section_id as number)}>
                        Unblock
                      </button>
                    ) : null}
                  </span>
                </td>
                <td className="r">{row.items_fixed ?? '—'}</td>
                <td className="r">{row.score ?? '—'}</td>
                <td className="r">
                  {row.run_id && !openRow ? (
                    <a href="#" onClick={(event) => { event.preventDefault(); onOpenRun(row.run_id as number); }}>View</a>
                  ) : null}
                </td>
              </tr>
              );
            })}
            {(cross?.done ?? 0) > 0 ? (
              <tr>
                <td colSpan={5}>Combined score</td>
                <td className="r">{cross?.score ?? '—'}</td>
                <td />
              </tr>
            ) : null}
          </tbody>
        </table>
        {flags.map((row) => (
          <div key={row.section} className="cc-dialog-note warn">
            <QaIcon name="alert" />
            {row.section}: {row.items_fixed} items fixed and the owner check was done. {row.flag || 'Owner not maintaining.'}
          </div>
        ))}
      </BoardDialog>

      <BoardDialog open={open === 'people'} onClose={onClose} title="Section checks this week">
        {people.length ? (
          <>
            <table className="cc-dialog-table">
              <thead>
                <tr>
                  <th>Person</th><th>Mon</th><th>Tue</th><th>Wed</th><th>Thu</th><th>Fri</th><th>Sat</th><th>Sun</th>
                  <th className="r">Done</th>
                  <th className="r" title="POS on-task">On-task</th>
                </tr>
              </thead>
              <tbody>
                {people.map((row) => {
                  const dots = peopleDots(weekData?.days, row.id, row.section_days);
                  return (
                    <tr key={row.id}>
                      <td>{row.name}</td>
                      {dots.map((dot, index) => (
                        <td
                          key={index}
                          title={dot === 'ok' ? 'Done' : dot === 'miss' ? 'Missed' : dot === 'due' ? 'Due today' : 'Not expected'}
                        >
                          {dot ? <i className={`dot ${dot}`} /> : null}
                        </td>
                      ))}
                      <td className="r">{sectionCheckDoneLabel(row)}</td>
                      <td className="r">
                        {row.on_task == null
                          ? <span title="No POS activity">—</span>
                          : `${Math.round(row.on_task)}%`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="cc-dialog-note">
              A missing dot means not expected, a hollow dot means due today, red means missed, green means done.
            </div>
          </>
        ) : (
          <div className="cc-dialog-note">No one owns a section.</div>
        )}
      </BoardDialog>
    </>
  );
}

function CheckerPicker({
  name,
  label,
  choices,
  onPick,
}: {
  name: string;
  label: string;
  choices: Array<{ id: number; name: string }>;
  onPick: (userId: number) => void;
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const items: RowMenuItem[] = choices.length
    ? choices.map((person) => ({ label: person.name, onClick: () => onPick(person.id) }))
    : [{ label: 'No one else is in', onClick: () => undefined }];
  return (
    <>
      <button
        type="button"
        className={`picker${name ? '' : ' empty'}`}
        aria-label={label}
        aria-haspopup="menu"
        onClick={(event) => setAnchor(event.currentTarget)}
      >
        {name || 'Assign'}
        <span className="caret" aria-hidden>▾</span>
      </button>
      <ItemsMenu anchor={anchor} onClose={() => setAnchor(null)} items={items} />
    </>
  );
}

export function BoardDialog({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      transitionDuration={150}
      className="cc-page-dialog"
      slotProps={{ backdrop: { timeout: 150 } }}
    >
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pr: 1 }}>
        {title}
        <IconButton aria-label="Close" onClick={onClose} sx={{ color: ccTokens.ink3 }}>×</IconButton>
      </DialogTitle>
      <DialogContent>{children}</DialogContent>
    </Dialog>
  );
}
