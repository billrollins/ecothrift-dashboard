import type { HoursNagLevel } from '../../hooks/useHoursNag';
import type { MyWork, NagTone } from '../../pages/routines/myWork';
import { isNagging } from '../../pages/routines/myWork';

/**
 * Everything that nags, counted once, for the app-bar icon and the Today header chip:
 * nagging routines, messages about something that is not already one of them, the
 * weekly-hours nag, and the buyer's nags (superusers: bid now, did we win). Colour is the
 * worst: red for a hard nag, late, a message, the hour limit reached, or a lot in its last
 * 15 minutes; amber for soft nags only.
 */
export function nagSummary(
  work: MyWork,
  messageRunIds: number[],
  hours: HoursNagLevel,
  buying: { count: number; tone: NagTone } = { count: 0, tone: 'none' },
): { count: number; tone: NagTone } {
  const nagging = new Set(work.owed.filter((item) => isNagging(item.state)).map((item) => item.run.id));
  const extraMessages = messageRunIds.filter((id) => !nagging.has(id)).length;
  const count = work.nagCount + extraMessages + (hours === 'none' ? 0 : 1) + buying.count;
  const red = messageRunIds.length > 0 || hours === 'hard' || work.nagTone === 'red' || buying.tone === 'red';
  const amber = work.nagTone === 'amber' || hours === 'soft' || buying.tone === 'amber';
  return { count, tone: red ? 'red' : amber ? 'amber' : 'none' };
}
