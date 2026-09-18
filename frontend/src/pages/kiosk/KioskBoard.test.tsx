// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { KioskBoard as KioskBoardData } from '../../api/kiosk.api';
import { KioskBoard, groupRows } from './KioskBoard';

const dept = { id: 1, name: 'Retail', slug: 'retail-operations', icon: 'cart', sort: 0, other: false };
const other = { id: null, name: 'Other', slug: 'other', icon: 'none', sort: 9999, other: true };

function board(rows: KioskBoardData['rows'], redacted: boolean): KioskBoardData {
  return {
    day: '2026-09-16',
    generated_at: '2026-09-16T14:00:00Z',
    store_open: true,
    departments: [dept, other],
    rows,
    redacted,
  };
}

const base = {
  shift_name: 'Retail Open',
  expected_time: '08:30',
  department_id: 1,
  department_name: 'Retail',
  department_slug: 'retail-operations',
  department_icon: 'cart',
  department_sort: 0,
  other: false,
};

describe('KioskBoard', () => {
  it('hosted board shows every chip, minutes late, and the in-time', () => {
    render(
      <KioskBoard
        lang="en"
        board={board(
          [
            { ...base, id: 1, name: 'Maria R.', status: 'in', in_time: '08:20', late_minutes: null, on_roster: true },
            { ...base, id: 2, name: 'Bea B.', status: 'break', in_time: '08:25', late_minutes: null, on_roster: true },
            { ...base, id: 3, name: 'Lou L.', status: 'late', in_time: '', late_minutes: 30, on_roster: true },
            { ...base, id: 4, name: 'Cal C.', status: 'called_in', in_time: '', late_minutes: null, on_roster: true },
            {
              ...base,
              id: 5,
              name: 'Uma U.',
              status: 'in',
              in_time: '08:50',
              department_id: null,
              department_name: 'Other',
              department_slug: 'other',
              department_icon: 'none',
              department_sort: 9999,
              other: true,
            },
          ],
          false,
        )}
      />,
    );
    expect(screen.getAllByTestId('chip-in')[0]).toHaveTextContent('In');
    expect(screen.getByTestId('chip-break')).toHaveTextContent('On break');
    expect(screen.getByTestId('chip-late')).toHaveTextContent('Late · 30 min late');
    expect(screen.getByTestId('chip-called_in')).toHaveTextContent('Called in');
    expect(screen.getByTestId('row-1')).toHaveTextContent('since 8:20 AM');
    expect(screen.getByTestId('dept-other')).toHaveTextContent('Uma U.');
    expect(screen.queryByText(/called out/i)).toBeNull();
  });

  it('public board shows only In / Out / Expected / Late and no times or breaks', () => {
    const { container } = render(
      <KioskBoard
        lang="en"
        board={board(
          [
            { ...base, id: 1, name: 'Maria R.', status: 'in' },
            { ...base, id: 2, name: 'Bea B.', status: 'in' },
            { ...base, id: 3, name: 'Lou L.', status: 'late' },
            { ...base, id: 4, name: 'Cal C.', status: 'out' },
            { ...base, id: 6, name: 'Eve E.', status: 'expected' },
          ],
          true,
        )}
      />,
    );
    expect(screen.getAllByTestId('chip-in')).toHaveLength(2);
    expect(screen.getByTestId('chip-late')).toHaveTextContent('Late');
    expect(screen.getByTestId('chip-late')).not.toHaveTextContent('min late');
    expect(screen.getByTestId('chip-out')).toHaveTextContent('Out');
    expect(screen.getByTestId('chip-expected')).toHaveTextContent('Expected');
    expect(container.textContent).not.toMatch(/On break|Called in|since/);
  });

  it('speaks Spanish', () => {
    render(<KioskBoard lang="es" board={board([{ ...base, id: 1, name: 'Maria R.', status: 'late', late_minutes: 12 }], false)} />);
    expect(screen.getByTestId('chip-late')).toHaveTextContent('Tarde · 12 min tarde');
  });

  it('groups by department in server order and drops empty departments', () => {
    const grouped = groupRows(board([{ ...base, id: 1, name: 'Maria R.', status: 'in' }], true));
    expect(grouped.map((g) => g.dept.slug)).toEqual(['retail-operations']);
  });
});
