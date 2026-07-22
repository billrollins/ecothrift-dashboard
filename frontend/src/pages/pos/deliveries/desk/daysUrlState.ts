export type DaysBucket = 'past' | 'today' | 'future' | 'all';

export type DeskDaysUrlState = {
  bucket: DaysBucket;
  search: string;
  includeTest: boolean;
  page: number;
};

export function parseDeskDaysUrlState(params: URLSearchParams): DeskDaysUrlState {
  const bucketRaw = params.get('bucket') || 'today';
  const bucket: DaysBucket =
    bucketRaw === 'past' || bucketRaw === 'future' || bucketRaw === 'all' || bucketRaw === 'today'
      ? bucketRaw
      : 'today';
  return {
    bucket,
    search: params.get('q') || params.get('search') || '',
    includeTest: params.get('include_test') === '1',
    page: Math.max(1, Number(params.get('page') || '1') || 1),
  };
}

export function deskDaysStateToParams(state: DeskDaysUrlState): URLSearchParams {
  const p = new URLSearchParams();
  if (state.bucket !== 'today') p.set('bucket', state.bucket);
  if (state.search.trim()) p.set('q', state.search.trim());
  if (state.includeTest) p.set('include_test', '1');
  if (state.page > 1) p.set('page', String(state.page));
  return p;
}

export function deskDaysStateToApiParams(state: DeskDaysUrlState): Record<string, unknown> {
  const params: Record<string, unknown> = {
    page: state.page,
    page_size: 50,
  };
  if (state.bucket !== 'all') params.bucket = state.bucket;
  if (state.search.trim()) params.search = state.search.trim();
  if (state.includeTest) params.include_test = '1';
  return params;
}
