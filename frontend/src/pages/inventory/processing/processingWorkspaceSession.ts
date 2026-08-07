/** Per-order workspace UI state - survives in-tab navigation away from processing. */

const STORAGE_PREFIX = 'ecothrift.processingWorkspace.v1';

export interface ProcessingWorkspaceSessionState {
  search: string;
  detailProcessingRowId: number | null;
}

function storageKey(orderId: number): string {
  return `${STORAGE_PREFIX}.${orderId}`;
}

export function readProcessingWorkspaceSession(orderId: number): ProcessingWorkspaceSessionState | null {
  try {
    const raw = sessionStorage.getItem(storageKey(orderId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ProcessingWorkspaceSessionState>;
    const search = typeof parsed.search === 'string' ? parsed.search : '';
    const detailRaw = parsed.detailProcessingRowId;
    const detailProcessingRowId =
      typeof detailRaw === 'number' && Number.isFinite(detailRaw) && detailRaw > 0 ?
        Math.trunc(detailRaw)
      : null;
    return { search, detailProcessingRowId };
  } catch {
    return null;
  }
}

export function writeProcessingWorkspaceSession(
  orderId: number,
  state: ProcessingWorkspaceSessionState,
): void {
  try {
    sessionStorage.setItem(
      storageKey(orderId),
      JSON.stringify({
        search: state.search,
        detailProcessingRowId: state.detailProcessingRowId,
      }),
    );
  } catch {
    /* quota / private mode - ignore */
  }
}
