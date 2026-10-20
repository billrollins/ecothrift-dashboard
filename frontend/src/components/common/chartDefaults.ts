/**
 * Recharts' ResponsiveContainer starts at -1 x -1 until it measures its parent, and logs "The width(-1) and
 * height(-1) of chart should be greater than 0" on that first render. A small positive start size is replaced by
 * the real one a moment later, so the warning never fires. Pass it as `initialDimension` on every ResponsiveContainer.
 */
export const CHART_INITIAL_DIMENSION = { width: 320, height: 200 } as const;
