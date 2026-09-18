import { format, parseISO } from 'date-fns';
import type { GradeLetter, GradeThirds, QaDayTile, QaToday, QaWeek } from '../../../api/routines.api';
import { weekRangeLabel } from '../routines/gradeWeek';
import { bandWeightLabel, letterClass, scoreText, sectionWeekCounts, tileClass, tileCounts, tileNote, walkDots } from './commandCenter';

const WALK_FLOOR = 3;

type SummaryId = 'spot' | 'cross' | 'people' | null;

export function CommandHeader({
  store,
  openToday,
  week,
  weekNumber,
  date,
  today,
  tiles,
  weekLetter,
  weekThirds,
  projectedLetter,
  weekData,
  board,
  sectionDone,
  sectionTotal,
  summary,
  onSummary,
  onScore,
  onMoveWeek,
  onSelectDay,
}: {
  store: string;
  openToday: boolean;
  week: string;
  weekNumber: string;
  date: string;
  today: string;
  tiles: QaDayTile[];
  weekLetter: GradeLetter | null;
  weekThirds: GradeThirds;
  projectedLetter: GradeLetter | null | undefined;
  weekData?: QaWeek;
  board?: QaToday;
  sectionDone?: number;
  sectionTotal?: number;
  summary: SummaryId;
  onSummary: (id: SummaryId) => void;
  onScore: () => void;
  onMoveWeek: (delta: number) => void;
  onSelectDay: (next: string) => void;
}) {
  const walks = tiles.filter((tile) => tileCounts(tile) && tile.spot != null).length;
  const dots = walkDots(tiles);
  const cross = board?.cross;
  const dueWord = (cross?.due_label || '').split(' ')[0] || '';
  const counts = sectionDone != null && sectionTotal != null
    ? { done: sectionDone, total: sectionTotal }
    : sectionWeekCounts(weekData?.days);

  return (
    <header className="band">
      <div className="band-top">
        <div className="store">
          <h1>{store}</h1>
          <div className="sub">
            {openToday ? 'Open today' : 'Closed today'}
          </div>
        </div>
        <div className="weeknav">
          <button type="button" className="arrow" aria-label="Previous week" onClick={() => onMoveWeek(-1)}>‹</button>
          <div className="lbl">
            <b>{weekRangeLabel(week)}</b>
            <small>{weekNumber}</small>
          </div>
          <button type="button" className="arrow" aria-label="Next week" onClick={() => onMoveWeek(1)}>›</button>
        </div>
        <button type="button" className="hero" onClick={onScore}>
          <div className={`big ${letterClass(weekLetter)}`}>{weekLetter ?? '—'}</div>
          <div className="cap"><b>Week grade</b><span>so far</span></div>
        </button>
        <div className="stats">
          {(['spot', 'do', 'cross'] as const).map((key) => {
            const score = key === 'spot' ? weekThirds.owner : key === 'do' ? weekThirds.doing : weekThirds.cross;
            const label = key === 'spot' ? 'Spot' : key === 'do' ? 'Do' : 'Cross';
            const excluded = Boolean(weekData?.excluded?.includes(key));
            const reason = weekData?.excluded_reasons?.[key] || '';
            return (
              <button
                key={key}
                type="button"
                className="stat"
                onClick={onScore}
                title={excluded ? reason : undefined}
              >
                <b>{excluded ? '—' : scoreText(score)}</b>
                <span>{bandWeightLabel(label, weekData?.weights?.[key] ?? { spot: 60, do: 25, cross: 15 }[key], excluded)}</span>
              </button>
            );
          })}
        </div>
        <div className="proj">
          <span className="txt">If the rest is done<br />this week</span>
          <b className={letterClass(projectedLetter)}>{projectedLetter ?? '—'}</b>
        </div>
      </div>

      <div className="week">
        <div className="tiles" id="tiles">
          {tiles.map((tile) => (
            <DayTile
              key={tile.date}
              tile={tile}
              selected={tile.date === date}
              today={today}
              onSelect={() => onSelectDay(tile.date)}
            />
          ))}
        </div>
        <div className="badges">
          <button type="button" className={`badge${summary === 'spot' ? ' open' : ''}`} onClick={() => onSummary(summary === 'spot' ? null : 'spot')}>
            <span className="k">Spot walks</span>
            <span className={`v ${walks < WALK_FLOOR ? 'warn' : 'ok'}`}>
              {walks} of {WALK_FLOOR} this week
              <span className="dots">
                {dots.map((dot, index) => (
                  <i key={index} className={dot} />
                ))}
              </span>
            </span>
            <span className="ch">›</span>
          </button>
          <button type="button" className={`badge${summary === 'cross' ? ' open' : ''}`} onClick={() => onSummary(summary === 'cross' ? null : 'cross')}>
            <span className="k">Cross-checks</span>
            <span className={`v ${cross && cross.done === cross.total && cross.total ? 'ok' : ''}`}>
              {cross
                ? `${cross.done} of ${cross.total} ${cross.done === cross.total && dueWord ? `done ${dueWord}` : 'done'}`
                : '—'}
            </span>
            <span className="ch">›</span>
          </button>
          <button type="button" className={`badge${summary === 'people' ? ' open' : ''}`} onClick={() => onSummary(summary === 'people' ? null : 'people')}>
            <span className="k">Section checks this week</span>
            <span className="v">{counts.done} of {counts.total} done</span>
            <span className="ch">›</span>
          </button>
        </div>
      </div>
    </header>
  );
}

function DayTile({
  tile,
  selected,
  today,
  onSelect,
}: {
  tile: QaDayTile;
  selected: boolean;
  today: string;
  onSelect: () => void;
}) {
  const closed = !tile.open;
  const graded = tileCounts(tile);
  const idleClosed = closed && !graded;
  const isToday = tile.date === today || tile.is_today;
  const letter = tile.is_future ? tile.projected_letter : tile.letter;
  const note = tileNote(tile);
  return (
    <div
      className={tileClass(closed, selected, { letter, projected: tile.is_future && graded, graded })}
      onClick={() => onSelect()}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') onSelect();
      }}
      role="button"
      tabIndex={0}
    >
      <div className="d">
        <span>{tile.weekday} {format(parseISO(tile.date), 'd')}</span>
        {isToday ? <span className="today">Today</span> : null}
      </div>
      {idleClosed ? (
        <div className="l">Closed</div>
      ) : tile.is_future ? (
        <div className={`l${letter && letter.length > 1 ? ' plusminus' : ''}`}>{letter ?? 'A'}</div>
      ) : (
        <div className={`l${letter && letter.length > 1 ? ' plusminus' : ''}`}>{letter ?? '—'}</div>
      )}
      <div className="n">{note}</div>
    </div>
  );
}
