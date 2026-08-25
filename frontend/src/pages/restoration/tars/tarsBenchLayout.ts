/**
 * Left track is the narrower one so Recent notes and the work log can breathe.
 * Cards on the left do not have to share one inner width.
 */
export const BENCH_SPLIT_COLUMNS = {
  xs: '1fr',
  lg: 'minmax(400px, 46%) minmax(0, 1fr)',
} as const;

export const BENCH_SPLIT_GAP = 0.6;
