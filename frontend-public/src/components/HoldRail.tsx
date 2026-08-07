export type RailStageState = 'done' | 'current' | 'upcoming'

export type RailStage = {
  key: 'requested' | 'confirmed' | 'ready' | 'picked_up' | string
  label: string
  state: RailStageState
  at?: string | null
}

type HoldRailProps = {
  stages?: RailStage[]
  current?: number
  variant?: 'full' | 'compact'
}

const FALLBACK: RailStage[] = [
  { key: 'requested', label: 'Requested', state: 'upcoming' },
  { key: 'confirmed', label: 'Confirmed', state: 'upcoming' },
  { key: 'ready', label: 'Ready', state: 'upcoming' },
  { key: 'picked_up', label: 'Picked up', state: 'upcoming' },
]

function relativeStamp(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString(undefined, { weekday: 'short' })
}

export default function HoldRail({ stages, current = 0, variant = 'full' }: HoldRailProps) {
  const list = stages && stages.length === 4 ? stages : FALLBACK
  const fillPct = current > 0 ? ((Math.min(current, 4) - 1) / 3) * 100 : 0

  return (
    <div className={`rail rail--${variant}`} aria-label="Hold progress">
      <div className="rail__track" aria-hidden="true">
        <div className="rail__fill" style={{ width: `${fillPct}%` }} />
      </div>
      <ol className="rail__steps">
        {list.map((s) => (
          <li
            key={s.key}
            className={`rail__step rail__step--${s.state}`}
            aria-current={s.state === 'current' ? 'step' : undefined}
          >
            <span className="rail__dot" aria-hidden="true" />
            <span className="rail__label">
              {s.label}
              {s.state === 'done' ? <span className="sr-only"> done</span> : null}
            </span>
            {variant === 'full' && s.at ? (
              <span className="rail__when">{relativeStamp(s.at)}</span>
            ) : null}
          </li>
        ))}
      </ol>
    </div>
  )
}
