import { describe, expect, it } from 'vitest';
import { NAV_ITEM_CATALOG } from '../../../navigation/navItemCatalog';
import { tarsStudioRedirectTarget } from '../restorationRoutes';
import type { RestorationJobDTO } from '../../../types/inventory.types';
import { isForeignBench, myActiveBenchRestorationJob } from './tarsJobAdapter';

function benchJob(
  id: number,
  ownerId: number | null,
  startedAt: string | null,
): RestorationJobDTO {
  return {
    id,
    stage: 'bench',
    bench_owner_id: ownerId,
    bench_started_at: startedAt ?? '2026-07-13T12:00:00Z',
    updated_at: '2026-07-13T12:00:00Z',
  } as RestorationJobDTO;
}

describe('in-dashboard restoration navigation', () => {
  it('opens Bench in the dashboard, not a new window', () => {
    expect(NAV_ITEM_CATALOG.tars.path).toBe('/restoration/bench');
    expect(NAV_ITEM_CATALOG.tars.openInNewWindow).toBeUndefined();
    expect(NAV_ITEM_CATALOG.tars.label).toBe('Bench');
  });

  it('names the queue page Overview and keeps the old queue URL as an alias', () => {
    expect(NAV_ITEM_CATALOG.restorationQueue.path).toBe('/restoration/overview');
    expect(NAV_ITEM_CATALOG.restorationQueue.pathAliases).toContain('/restoration/queue');
    expect(NAV_ITEM_CATALOG.restorationQueue.label).toBe('Overview');
  });

  it('names the parts-requests page for what it is', () => {
    expect(NAV_ITEM_CATALOG.restorationPartsRequests.path).toBe('/restoration/parts-requests');
    expect(NAV_ITEM_CATALOG.restorationPartsRequests.label).toBe('Parts Requests');
    expect(NAV_ITEM_CATALOG.restorationPartsRequests.superuserOnly).toBeUndefined();
  });

  it('sends old TARS Studio bookmarks to Bench or Overview', () => {
    expect(tarsStudioRedirectTarget('42', null)).toBe('/restoration/bench?job=42');
    expect(tarsStudioRedirectTarget(null, 'bench')).toBe('/restoration/bench');
    expect(tarsStudioRedirectTarget(null, 'home')).toBe('/restoration/overview');
    expect(tarsStudioRedirectTarget(null, null)).toBe('/restoration/overview');
  });
});

describe('bench job selection', () => {
  it('selects the explicit bench owner', () => {
    const mine = benchJob(1, 42, '2026-07-13T12:00:00Z');
    const someoneElses = benchJob(2, 99, '2026-07-13T13:00:00Z');
    expect(myActiveBenchRestorationJob([someoneElses, mine], 42)?.id).toBe(1);
  });

  it('ignores bench jobs this user does not own', () => {
    const someoneElses = benchJob(2, 99, '2026-07-13T13:00:00Z');
    expect(myActiveBenchRestorationJob([someoneElses], 42)).toBeNull();
  });

  it('flags another technician\'s bench as foreign', () => {
    expect(isForeignBench(benchJob(2, 99, '2026-07-13T13:00:00Z'), 42)).toBe(true);
    expect(isForeignBench(benchJob(1, 42, '2026-07-13T12:00:00Z'), 42)).toBe(false);
  });
});
