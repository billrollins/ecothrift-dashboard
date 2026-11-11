import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type {
  ProcessingCommandCenter,
  ProcessingNumbers,
  ProcessingPerson,
} from '../../../api/processingCommandCenter.api';
import { CommandCenterTable, CommandCenterView, bigItemsText } from './ProcessingCommandCenterPage';

function numbers(over: Partial<ProcessingNumbers> = {}): ProcessingNumbers {
  return {
    items: 40, dollars: '500.00', hours: '4.00', items_per_hour: '10.00', dollars_per_hour: '125.00',
    average_tag: '12.50', big_items: 6, big_share: 64, tag_errors: 0, to_restoration: 2, ...over,
  };
}

function person(over: Partial<ProcessingPerson> = {}): ProcessingPerson {
  return {
    user_id: 4, name: 'Ashley K', is_new: false, first_check_in: null,
    day: numbers(), week: numbers({ items: 200, dollars: '2600.00', hours: '20.00' }), ...over,
  };
}

const ROOM = { items_per_hour: '8.50', dollars_per_hour: '110.00' };

function row(id: number) {
  return within(screen.getByTestId(`processor-${id}`));
}

describe('CommandCenterTable', () => {
  it('shows a line per person with the day numbers', () => {
    render(<CommandCenterTable people={[person()]} period="day" pace={ROOM} me={99} bigItemPrice="25.00" />);
    const line = row(4);
    expect(line.getByText('Ashley K')).toBeInTheDocument();
    expect(line.getByText('40')).toBeInTheDocument();
    expect(line.getByText('$500.00')).toBeInTheDocument();
    expect(line.getByText('4.0')).toBeInTheDocument();
    expect(line.getByText('10.0')).toBeInTheDocument();
    expect(line.getByText('$125.00')).toBeInTheDocument();
    expect(line.getByText('$12.50')).toBeInTheDocument();
    expect(line.getByText('6 (64% of dollars)')).toBeInTheDocument();
    expect(screen.getByText('Big items ($25 and up)')).toBeInTheDocument();
  });

  it('switches to the week numbers', () => {
    render(<CommandCenterTable people={[person()]} period="week" pace={ROOM} me={99} bigItemPrice="25.00" />);
    expect(row(4).getByText('200')).toBeInTheDocument();
    expect(row(4).getByText('$2,600.00')).toBeInTheDocument();
    expect(row(4).getByText('20.0')).toBeInTheDocument();
  });

  it('leaves per-hour blank and says so when there is no clock entry', () => {
    const noClock = person({ day: numbers({ hours: null, items_per_hour: null, dollars_per_hour: null }) });
    render(<CommandCenterTable people={[noClock]} period="day" pace={ROOM} me={99} bigItemPrice="25.00" />);
    const line = row(4);
    expect(line.getByText('No clock entry')).toBeInTheDocument();
    expect(line.queryByText('10.0')).not.toBeInTheDocument();
    expect(line.queryByText('$125.00')).not.toBeInTheDocument();
    expect(line.getByText('40')).toBeInTheDocument();
  });

  it('marks a new hire and shows the room pace beside theirs', () => {
    const rookie = person({ user_id: 7, name: 'Maria K', is_new: true, first_check_in: '2026-11-03' });
    render(<CommandCenterTable people={[person(), rookie]} period="day" pace={ROOM} me={99} bigItemPrice="25.00" />);
    expect(row(7).getByText('New')).toBeInTheDocument();
    expect(row(7).getByText('First check-in Nov 3')).toBeInTheDocument();
    expect(row(7).getByText('room 8.5')).toBeInTheDocument();
    expect(row(7).getByText('room $110.00')).toBeInTheDocument();
    expect(row(4).queryByText('New')).not.toBeInTheDocument();
    expect(row(4).queryByText(/^room /)).not.toBeInTheDocument();
  });

  it('marks your own line and says when nobody worked', () => {
    const { unmount } = render(
      <CommandCenterTable people={[person()]} period="day" pace={ROOM} me={4} bigItemPrice="25.00" />,
    );
    expect(row(4).getByText('Ashley K (you)')).toBeInTheDocument();
    unmount();
    render(<CommandCenterTable people={[]} period="day" pace={ROOM} me={4} bigItemPrice="25.00" />);
    expect(screen.getByText('Nobody checked in or clocked Processing hours in this period.')).toBeInTheDocument();
  });

  it('writes big items as a count and its share of the dollars', () => {
    expect(bigItemsText(numbers({ big_items: 0, big_share: 0 }))).toBe('0');
    expect(bigItemsText(numbers({ big_items: 3, big_share: null }))).toBe('3');
    expect(bigItemsText(numbers({ big_items: 3, big_share: 41 }))).toBe('3 (41% of dollars)');
  });
});

describe('CommandCenterView', () => {
  const data: ProcessingCommandCenter = {
    date: '2026-11-10', today: '2026-11-10', week_start: '2026-11-09', can_see_everyone: true, me: 1,
    big_item_price: '25.00', new_hire_days: 30,
    goal: { week: '35000.00', day: '7000.00', work_days: [0, 1, 2, 3, 4] },
    room: { day_dollars: '3500.00', week_dollars: '9000.00', day_average: ROOM, week_average: ROOM },
    people: [person()],
  };

  it('shows the room against the day share and the week goal', () => {
    render(<CommandCenterView data={data} period="day" onPeriod={vi.fn()} />);
    expect(screen.getByText('On the floor today')).toBeInTheDocument();
    expect(screen.getByText('$3,500')).toBeInTheDocument();
    expect(screen.getByText(/of \$7,000/)).toBeInTheDocument();
    expect(screen.getByText("The day's share of the $35,000 week goal")).toBeInTheDocument();
    expect(screen.getByLabelText('On the floor today: 50% of the goal')).toBeInTheDocument();
    expect(screen.getByText('$9,000')).toBeInTheDocument();
    expect(screen.getByText('By person')).toBeInTheDocument();
  });

  it('is "My numbers" for a person who sees only their own line', () => {
    render(<CommandCenterView data={{ ...data, can_see_everyone: false }} period="day" onPeriod={vi.fn()} />);
    expect(screen.getByText('My numbers')).toBeInTheDocument();
    expect(screen.queryByText('By person')).not.toBeInTheDocument();
  });

  it('has no dash characters in its words', () => {
    const { container } = render(<CommandCenterView data={data} period="week" onPeriod={vi.fn()} />);
    expect(container.textContent).not.toMatch(new RegExp('[' + String.fromCharCode(0x2013, 0x2014) + ']'));
  });
});
