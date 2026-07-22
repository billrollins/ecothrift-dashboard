export type DeskTotalUrlState = {
  search: string;
  status: string;
  includeTest: boolean;
  includeArchived: boolean;
  page: number;
};

export function parseDeskTotalUrlState(params: URLSearchParams): DeskTotalUrlState {
  return {
    search: params.get('q') || params.get('search') || '',
    status: params.get('status') || '',
    includeTest: params.get('include_test') === '1',
    includeArchived: params.get('include_archived') === '1',
    page: Math.max(1, Number(params.get('page') || '1') || 1),
  };
}

export function deskTotalStateToParams(state: DeskTotalUrlState): URLSearchParams {
  const p = new URLSearchParams();
  if (state.search.trim()) p.set('q', state.search.trim());
  if (state.status) p.set('status', state.status);
  if (state.includeTest) p.set('include_test', '1');
  if (state.includeArchived) p.set('include_archived', '1');
  if (state.page > 1) p.set('page', String(state.page));
  return p;
}

export function deskTotalStateToApiParams(state: DeskTotalUrlState): Record<string, unknown> {
  const params: Record<string, unknown> = {
    page: state.page,
    page_size: 50,
  };
  if (state.search.trim()) params.search = state.search.trim();
  if (state.status) params.status = state.status;
  if (state.includeTest) params.include_test = '1';
  if (state.includeArchived) params.include_archived = '1';
  return params;
}
