import { format, parseISO } from 'date-fns';
import { useMemo, useState } from 'react';
import type { GradeLetter, GradeThirds, QaDayTile, QaToday, QaWeek } from '../../../api/routines.api';
import { formatWeight, scoreText } from './commandCenter';
import { BoardDialog } from './SummaryDialogs';

const RULES = {
  spot: 'Average of walks on days that had one. Days without a walk aren\'t counted. Fewer than 3 walks caps the week at B.',
  do: "Routines done over routines expected. Call-ins don't reduce expected.",
  cross: 'Weekly only. Sections cross-checked over sections due, counted from the due date.',
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
  const weights = selectedDay
    ? (selectedDay.weights ?? dayRow?.weights)
    : weekData?.weights;
  const excluded = selectedDay
    ? (selectedDay.excluded ?? dayRow?.excluded ?? [])
    : (weekData?.excluded ?? []);
  const reasons = weekData?.excluded_reasons ?? {};
  const items = splitItems(selectedDay ? dayItems : weekItems);
  const cashiers = weekData?.cashier_activity ?? [];
  const title = selectedDay
    ? `${selectedDay.weekday} ${format(parseISO(selectedDay.date), 'MMM d')} · Grade ${selectedDay.letter ?? scoreText(null)}`
    : `${weekNumber} · Grade ${weekLetter ?? '—'} (projected ${projectedLetter ?? '—'})`;
  const daySections = (dayRow?.cross?.audits ?? [])
    .filter((row) => row.status === 'done')
    .map((row) => row.section_name)
    .filter(Boolean);
  const crossDone = board?.cross?.done ?? 0;
  const crossDue = board?.cross?.total ?? 0;

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
        <ScoreCol
          title="Spot"
          weight={weights?.spot}
          score={thirds.owner}
          excluded={excluded.includes('spot')}
          reason={reasons.spot || 'No walks this week · not counted'}
          rule={RULES.spot}
          items={items.spot}
        />
        <ScoreCol
          title="Do"
          weight={weights?.do}
          score={thirds.doing}
          excluded={excluded.includes('do')}
          reason={reasons.do || ''}
          rule={RULES.do}
          items={items.doing}
          extra={pos}
        />
        {selectedDay ? (
          <ScoreCol
            title="Cross-checks this week"
            scoreLabel={crossDue ? `${crossDone} of ${crossDue}` : '—'}
            informational
            rule={RULES.cross}
            items={daySections.length ? daySections : items.cross}
            extra={daySections.length ? 'Completed on this day.' : undefined}
          />
        ) : (
          <ScoreCol
            title="Cross"
            weight={weights?.cross}
            score={thirds.cross}
            excluded={excluded.includes('cross')}
            reason={reasons.cross || 'Cross-checks pending'}
            rule={RULES.cross}
            items={items.cross}
          />
        )}
      </div>
    </BoardDialog>
  );
}

function ScoreCol({
  title,
  weight,
  score,
  scoreLabel,
  excluded,
  reason,
  informational,
  rule,
  items,
  extra,
}: {
  title: string;
  weight?: number;
  score?: number | null;
  scoreLabel?: string;
  excluded?: boolean;
  reason?: string;
  informational?: boolean;
  rule: string;
  items: string[];
  extra?: string;
}) {
  const heading = informational
    ? title
    : excluded
      ? `${title} —`
      : weight != null
        ? `${title} · ${formatWeight(weight)}%`
        : title;
  return (
    <div className={`score-col${excluded ? ' excluded' : ''}${informational ? ' info' : ''}`}>
      <b>{excluded ? '—' : (scoreLabel ?? scoreText(score))}</b>
      <span className="k">{heading}</span>
      {excluded ? (
        <p className="muted">Not counted. {reason}</p>
      ) : (
        <p>{rule}</p>
      )}
      {items.length ? (
        <ul>
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : informational ? (
        <p className="muted">No sections completed on this day.</p>
      ) : (
        <p className="muted">Nothing pulled this score down.</p>
      )}
      {extra ? <p className="muted">{extra}</p> : null}
    </div>
  );
}
