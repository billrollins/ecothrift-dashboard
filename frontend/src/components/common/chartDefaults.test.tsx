import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Bar, BarChart, ResponsiveContainer } from 'recharts';
import { CHART_INITIAL_DIMENSION } from './chartDefaults';

describe('CHART_INITIAL_DIMENSION', () => {
  afterEach(() => vi.restoreAllMocks());

  it('keeps ResponsiveContainer from warning about a -1 x -1 chart on its first render', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const chart = (initial?: { width: number; height: number }) => (
      <div style={{ height: 200 }}>
        <ResponsiveContainer width="100%" height="100%" initialDimension={initial}>
          <BarChart data={[{ n: 1 }]}>
            <Bar dataKey="n" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    );

    render(chart());
    expect(warn.mock.calls.some((c) => String(c[0]).includes('should be greater than 0'))).toBe(true);

    warn.mockClear();
    render(chart(CHART_INITIAL_DIMENSION));
    expect(warn.mock.calls.some((c) => String(c[0]).includes('should be greater than 0'))).toBe(false);
  });
});
