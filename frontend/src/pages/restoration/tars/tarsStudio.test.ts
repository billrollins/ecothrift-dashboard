import { describe, expect, it } from 'vitest';
import { NAV_ITEM_CATALOG } from '../../../navigation/navItemCatalog';
import type { RestorationJobDTO } from '../../../types/inventory.types';
import { myActiveBenchRestorationJob } from './tarsJobAdapter';
import { TARS_IDLE_PROMPT_MS } from './useTarsTimerController';

function benchJob(
  id: number,
  ownerId: number | null,
  startedAt: string | null,
): RestorationJobDTO {
  return {
    id,
    stage: 'bench',
    bench_owner_id: ownerId,
    timer_started_by_id: ownerId,
    timer_started_at: startedAt,
    bench_started_at: '2026-07-13T12:00:00Z',
    updated_at: '2026-07-13T12:00:00Z',
  } as RestorationJobDTO;
}

describe('standalone TARS Studio contract', () => {
  it('opens from dashboard navigation in a new window', () => {
    expect(NAV_ITEM_CATALOG.tars.path).toBe('/restoration/tars');
    expect(NAV_ITEM_CATALOG.tars.openInNewWindow).toBe(true);
  });

  it('selects the explicit bench owner even when the timer has not started', () => {
    const mine = benchJob(1, 42, null);
    const someoneElses = benchJob(2, 99, '2026-07-13T13:00:00Z');
    expect(myActiveBenchRestorationJob([someoneElses, mine], 42)?.id).toBe(1);
  });

  it('uses the five-minute idle confirmation threshold', () => {
    expect(TARS_IDLE_PROMPT_MS).toBe(300_000);
  });
});

