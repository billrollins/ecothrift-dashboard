import { format, parseISO } from 'date-fns';
import { useMemo, useState } from 'react';
import type { GradeLetter, GradeThirds, QaDayTile, QaToday, QaWeek } from '../../../api/routines.api';
import { scoreText } from './commandCenter';
import { BoardDialog } from './SummaryDialogs';

const RULES = {
  spot: 'Average of owner spot walks this week. Fewer than 3 walks caps the week at B.',
  do: "Routines done over routines expected, averaged across open days. Call-ins don't reduce expected.",
  cross: 'Sections cross-checked over sections due, counted from the due date.',
};

function splitItems(items: string[]) {
  const spot: string[] = [];
  const doing: string[] = [];
  const cross: string[] = [];
  for (const item of items) {
    const low = item.toLowerCase();
    if (low.includes('spot')) spot.push(item);
    else if (low.includes('cross') || low.includes('verify')) cross.push(item);
    else doing.push(item);
  }
  return { spot, doing, cross };
}

export function ScoreDialog({
  open,
  onClose,
  weekNumber,
  weekLetter,
  projectedLetter,
  weekThirds,
  weekItems,
  dayItems,
  tiles,
  weekData,
  board,
  posOnTask,
}: {
  open: boolean;
  onClose: () => void;
  weekNumber: string;
  weekLetter: GradeLetter | null;
  projectedLetter: GradeLetter | null | undefined;
  weekThirds: GradeThirds;
  weekItems: string[];
  dayItems: string[];
  tiles: QaDayTile[];
  weekData?: QaWeek;
  board?: QaToday;
  posOnTask?: string;
}) {
  const [scope, setScope] = useState('week');
  const openDays = tiles.filter((tile) => tile.open);
  const selectedDay = openDays.find((tile) => tile.date === scope);
  const dayRow = weekData?.days?.find((row) => row.date === scope);
  const thirds = selectedDay
    ? {
        owner: selectedDay.spot ?? dayRow?.thirds?.owner ?? null,
        doing: selectedDay.doing ?? dayRow?.thirds?.doing ?? null,
        cross: selectedDay.cross ?? dayRow?.thirds?.cross ?? null,
      }
    : weekThirds;
  const items = splitItems(selectedDay ? dayItems : weekItems);
  const cashiers = weekData?.cashier_activity ?? [];
  const title = selectedDay
    ? `${selectedDay.weekday} ${format(parseISO(selectedDay.date), 'MMM d')} · Grade ${selectedDay.letter ?? scoreText(null)}`
    : `${weekNumber} · Grade ${weekLetter ?? '—'} (projected ${projectedLetter ?? '—'})`;

  const pos = useMemo(() => {
    if (selectedDay) {
      return cashiers.length
        ? cashiers.map((row) => `${row.name}: ${row.on_task == null ? '—' : `${Math.round(row.on_task)}%`}`).join(' · ')
        : '';
    }
    return posOnTask || board?.pos_on_task || '';
  }, [board?.pos_on_task, cashiers, posOnTask, selectedDay]);

  return (
    <BoardDialog open={open} onClose={onClose} title={title}>
      <div className="score-scope">
        <select value={scope} onChange={(event) => setScope(event.target.value)}>
          <option value="week">{weekNumber}</option>
          {openDays.map((tile) => (
            <option key={tile.date} value={tile.date}>
              {tile.weekday} {format(parseISO(tile.date), 'd')}
            </option>
          ))}
        </select>
      </div>
      <div className="score-cols">
        <ScoreCol title="Spot" score={thirds.owner} rule={RULES.spot} items={items.spot} />
        <ScoreCol title="Do" score={thirds.doing} rule={RULES.do} items={items.doing} extra={pos} />
        <ScoreCol title="Cross" score={thirds.cross} rule={RULES.cross} items={items.cross} />
      </div>
    </BoardDialog>
  );
}

function ScoreCol({
  title,
  score,
  rule,
  items,
  extra,
}: {
  title: string;
  score: number | null | undefined;
  rule: string;
  items: string[];
  extra?: string;
}) {
  return (
    <div className="score-col">
      <b>{scoreText(score)}</b>
      <span className="k">{title}</span>
      <p>{rule}</p>
      {items.length ? (
        <ul>
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : (
        <p className="muted">Nothing pulled this score down.</p>
      )}
      {extra ? <p className="muted">{extra}</p> : null}
    </div>
  );
}
