import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type {
  ProcessingCommandCenter,
  ProcessingNumbers,
  ProcessingPace,
  ProcessingPerson,
  ProcessingWhole,
} from '../../../api/processingCommandCenter.api';
import {
  CommandCenterTable, CommandCenterView, bigItemsText, comingAlong, nameList, needsALook, ownTrend, restOfLine, standing,
} from './ProcessingCommandCenterPage';

function numbers(over: Partial<ProcessingNumbers> = {}): ProcessingNumbers {
  return {
    items: 40, dollars: '500.00', hours: '4.00', items_per_hour: '10.00', dollars_per_hour: '125.00',
    items_off_clock: 0, average_tag: '12.50', big_items: 6, big_share: 64, tag_errors: 0, to_restoration: 2, ...over,
  };
}

const NOTHING = numbers({
  items: 0, dollars: '0.00', hours: null, items_per_hour: null, dollars_per_hour: null, average_tag: null,
  big_items: 0, big_share: null, to_restoration: 0,
});
const CLOCKED_ONLY = { ...NOTHING, hours: '8.00' };
const NO_PUNCH = numbers({ items: 2, dollars: '248.00', hours: null, items_per_hour: null, dollars_per_hour: null, items_off_clock: 2 });

function person(over: Partial<ProcessingPerson> = {}): ProcessingPerson {
  return {
    user_id: 4, name: 'Ashley K', is_new: false, first_check_in: null, hired: null, is_owner: false, days: [],
    day: numbers(), week: numbers({ items: 200, dollars: '2600.00', hours: '20.00' }), ...over,
  };
}

const ROOM: ProcessingPace = { items_per_hour: '8.50', dollars_per_hour: '110.00', people: 3 };
const WHOLE: ProcessingWhole = { items: 80, hours: '16.00', items_per_hour: '5.00', dollars_per_hour: '62.50' };

/** The table and the phone cards are both in the page; the tests read the table (the first one). */
function row(id: number) {
  return within(screen.getAllByTestId(`processor-${id}`)[0]);
}

function table(people: ProcessingPerson[], period: 'day' | 'week' = 'day', me = 99) {
  return render(
    <CommandCenterTable people={people} period={period} pace={ROOM} whole={WHOLE} me={me} bigItemPrice="25.00" today="2026-11-10" date="2026-11-10" />,
  );
}

const TWO_DAYS = [
  { date: '2026-11-09', items: 103, dollars: '1000.00', hours: '7.00', items_per_hour: '14.71', dollars_per_hour: '142.86' },
  { date: '2026-11-10', items: 150, dollars: '1500.00', hours: '7.30', items_per_hour: '20.55', dollars_per_hour: '205.48' },
];

describe('CommandCenterTable', () => {
  it('shows a line per person with the day numbers, whole dollars', () => {
    table([person()]);
    const line = row(4);
    expect(line.getByText('Ashley K')).toBeInTheDocument();
    expect(line.getByText('40')).toBeInTheDocument();
    expect(line.getByText('$500')).toBeInTheDocument();
    expect(line.getByText('4.0')).toBeInTheDocument();
    expect(line.getByText('10.0')).toBeInTheDocument();
    expect(line.getByText('$125')).toBeInTheDocument();
    expect(line.getByText('$12.50')).toBeInTheDocument();
    expect(line.getByText('64%')).toBeInTheDocument();
  });

  it('switches to the week numbers and shows only the days the person was in', () => {
    const days = [
      { date: '2026-11-09', items: 463, dollars: '4000.00', hours: null, items_per_hour: null, dollars_per_hour: null },
      { date: '2026-11-10', items: 146, dollars: '2000.00', hours: '8.30', items_per_hour: '17.59', dollars_per_hour: '240.96' },
      { date: '2026-11-11', items: 0, dollars: '0.00', hours: null, items_per_hour: null, dollars_per_hour: null },
    ];
    table([person({ days })], 'week');
    expect(row(4).getByText('200')).toBeInTheDocument();
    expect(row(4).getByText('$2,600')).toBeInTheDocument();
    const strip = within(screen.getAllByTestId('day-strip')[0]);
    expect(strip.getByText('463 items')).toBeInTheDocument();
    expect(strip.getByText('no punch')).toBeInTheDocument();
    expect(strip.getByText('17.6 an hour')).toBeInTheDocument();
    expect(strip.queryByText('Wed 11')).not.toBeInTheDocument();
  });

  it('leaves per-hour blank and says why once when there is no punch', () => {
    table([person({ day: NO_PUNCH })]);
    const line = row(4);
    expect(line.getByText('No punch, so no pace.')).toBeInTheDocument();
    expect(line.queryByText('10.0')).not.toBeInTheDocument();
    expect(line.getByText('$248')).toBeInTheDocument();
  });

  it('the owner with no punch is not a missed punch', () => {
    table([person({ user_id: 1, name: 'Bill R', is_owner: true, day: NO_PUNCH })]);
    expect(row(1).getByText('The owner, not on the Processing clock.')).toBeInTheDocument();
  });

  it('never shows a pace of zero for hours with no check-ins, and then rates nobody', () => {
    table([person(), person({ user_id: 7, name: 'Maria K', day: CLOCKED_ONLY })]);
    const line = row(7);
    expect(line.getByText('No check-ins under this sign-in.')).toBeInTheDocument();
    expect(line.getByText('8.0')).toBeInTheDocument();
    expect(line.queryByText('0.0')).not.toBeInTheDocument();
    expect(screen.getByTestId('no-verdicts')).toHaveTextContent('Pace is grey while sign-ins are shared');
    expect(screen.queryByText('Above the room')).not.toBeInTheDocument();
  });

  it('rates people against the room when the lines can be trusted', () => {
    table([person(), person({ user_id: 5, name: 'Bo T', day: numbers({ dollars_per_hour: '90.00' }) })]);
    expect(row(4).getByText('Above the room')).toBeInTheDocument();
    expect(row(5).getByText('Below the room')).toBeInTheDocument();
    expect(screen.queryByTestId('no-verdicts')).not.toBeInTheDocument();
  });

  it('marks a new hire, how their first days go, or the hire date', () => {
    const rookie = person({ user_id: 7, name: 'Josh P', is_new: true, first_check_in: '2026-11-03', days: TWO_DAYS });
    const unseen = person({ user_id: 8, name: 'Rhea J', is_new: true, hired: '2026-11-02', day: CLOCKED_ONLY });
    table([person(), rookie, unseen]);
    expect(row(7).getByText('New')).toBeInTheDocument();
    expect(row(7).getByText('Coming along: 20.6 an hour on Tue 10, up from 14.7 an hour.')).toBeInTheDocument();
    expect(row(8).getByText('Hired Nov 2. No check-in under this sign-in yet.')).toBeInTheDocument();
    // One line for Rhea, not the same fact twice.
    expect(row(8).queryByText('No check-ins under this sign-in.')).not.toBeInTheDocument();
    expect(row(4).queryByText('New')).not.toBeInTheDocument();
  });

  it('marks your own line, lists only who was in, and says when nobody worked', () => {
    const { unmount } = table([person(), person({ user_id: 9, name: 'Off Today', day: { ...NOTHING, tag_errors: 1 } })], 'day', 4);
    expect(row(4).getByText('Ashley K (you)')).toBeInTheDocument();
    expect(screen.queryByTestId('processor-9')).not.toBeInTheDocument();
    unmount();
    table([]);
    expect(screen.getByText('Nobody has checked in or clocked Processing hours yet today.')).toBeInTheDocument();
  });

  it('the whole room line adds up on its face', () => {
    table([person(), person({ user_id: 5, name: 'Bo T' })]);
    const all = within(screen.getByTestId('room-line'));
    expect(all.getByText('80')).toBeInTheDocument();
    expect(all.getByText('$1,000')).toBeInTheDocument();
    expect(all.getByText('8.0')).toBeInTheDocument();
    expect(all.getByText('5.0')).toBeInTheDocument();
    expect(all.getByText('$63')).toBeInTheDocument();
  });

  it('writes big items as a count and its share, and the rest of a line in a sentence', () => {
    expect(bigItemsText(numbers({ big_items: 0, big_share: 0 }))).toBe('0');
    expect(bigItemsText(numbers({ big_items: 3, big_share: 41 }))).toBe('3 (41% of tag dollars)');
    expect(restOfLine(numbers(), '25.00')).toBe('Average tag $12.50. 6 big items ($25 and up), 64% of the tag dollars. 2 sent to Restoration.');
    expect(restOfLine(CLOCKED_ONLY, '25.00')).toBe('');
  });
});

describe('standing', () => {
  const fair = { shared: false, isNew: false };

  it('reads above, with or below the room by dollars an hour', () => {
    expect(standing(numbers({ dollars_per_hour: '125.00' }), ROOM, fair)).toEqual({ text: 'Above the room', tone: 'good' });
    expect(standing(numbers({ dollars_per_hour: '112.00' }), ROOM, fair)).toEqual({ text: 'With the room', tone: 'plain' });
    expect(standing(numbers({ dollars_per_hour: '90.00' }), ROOM, fair)).toEqual({ text: 'Below the room', tone: 'warn' });
  });

  it('a new person under the room is never a warning', () => {
    expect(standing(numbers({ dollars_per_hour: '60.00' }), ROOM, { shared: false, isNew: true }))
      .toEqual({ text: 'Below the room', tone: 'plain' });
  });

  it('gives no verdict the data cannot back', () => {
    expect(standing(numbers(), ROOM, { shared: true, isNew: false })).toBeNull();
    expect(standing(numbers(), { ...ROOM, people: 1 }, fair)).toBeNull();
    expect(standing(NOTHING, ROOM, fair)).toBeNull();
  });
});

describe('against their own days', () => {
  it('never compares with a day that had no punch', () => {
    const days = [
      { date: '2026-11-09', items: 463, dollars: '4000.00', hours: null, items_per_hour: null, dollars_per_hour: null },
      { date: '2026-11-10', items: 146, dollars: '2000.00', hours: '8.30', items_per_hour: '17.59', dollars_per_hour: '240.96' },
    ];
    // Round 3 caught "Down from 463 on Mon 26" against a no-punch Monday.
    expect(ownTrend(person({ days }), '2026-11-10')).toBeNull();
    const clocked = [{ ...days[0], hours: '8.00', items_per_hour: '20.10' }, days[1]];
    expect(ownTrend(person({ days: clocked }), '2026-11-10')).toEqual({ text: 'Slower than Mon 9 (20.1 an hour)', tone: 'plain' });
  });
});

describe('comingAlong', () => {
  it('is empty for a veteran or with one day', () => {
    expect(comingAlong(person({ days: TWO_DAYS }))).toBe('');
    expect(comingAlong(person({ is_new: true, days: [] }))).toBe('');
  });
});

describe('needsALook', () => {
  it('is empty on a clean day', () => {
    expect(needsALook([person()], 'day')).toEqual([]);
  });

  it('calls out a shared sign-in, items with no punch, and tag errors, each with its next move', () => {
    const calls = needsALook([
      person({ day: numbers({ tag_errors: 2 }) }),
      person({ user_id: 7, name: 'Maria K', day: CLOCKED_ONLY }),
      person({ user_id: 8, name: 'Rhea J', day: { ...CLOCKED_ONLY, hours: '7.90' } }),
      person({ user_id: 6, name: 'Cy D', day: NO_PUNCH }),
      person({ user_id: 1, name: 'Bill R', is_owner: true, day: NO_PUNCH }),
    ], 'day');
    expect(calls).toHaveLength(3);
    expect(calls[0].text).toContain('Maria K and Rhea J clocked 15.9 Processing hours with no check-ins under their own sign-ins.');
    expect(calls[0].text).toContain('Ask each of them to sign in at the PC before checking in.');
    expect(calls[1].text).toBe('Checked in with no Processing punch: Cy D (2 items). No pace can be shown for those items. Add the missing punch in the time clock.');
    expect(calls[2]).toEqual({ text: '2 tag errors found, traced to Ashley K.', link: { to: '/inventory/tag-errors', label: 'See the tag errors' } });
  });

  it('words one person as one person', () => {
    const [call] = needsALook([person({ user_id: 7, name: 'Maria K', week: { ...CLOCKED_ONLY, hours: '30.60' } })], 'week');
    expect(call.text).toBe("Maria K clocked 30.6 Processing hours this week with no check-ins under that sign-in. Those items are likely under someone else's name. Ask them to sign in at the PC before checking in.");
  });

  it('joins names plainly', () => {
    expect(nameList(['A'])).toBe('A');
    expect(nameList(['A', 'B'])).toBe('A and B');
    expect(nameList(['A', 'B', 'C'])).toBe('A, B and C');
  });
});

describe('CommandCenterView', () => {
  const data: ProcessingCommandCenter = {
    date: '2026-11-10', today: '2026-11-10', week_start: '2026-11-09', can_see_everyone: true, me: 1,
    big_item_price: '25.00', new_hire_days: 30,
    goal: { week: '35000.00', day: '7000.00', work_days: [0, 1, 2, 3, 4] },
    room: {
      day_dollars: '3500.00', week_dollars: '9000.00', day_average: ROOM, week_average: ROOM,
      day_whole: WHOLE, week_whole: WHOLE, shared_sign_in: { day: false, week: false },
      by_day: [{ date: '2026-11-09', dollars: '5500.00' }, { date: '2026-11-10', dollars: '3500.00' }],
    },
    people: [person()],
  };

  it('says where the room stands against the day goal and against the week so far', () => {
    render(<CommandCenterView data={data} period="day" onPeriod={vi.fn()} />);
    expect(screen.getByText('The room today')).toBeInTheDocument();
    expect(screen.getByText('$3,500 to go today')).toBeInTheDocument();
    expect(screen.getByLabelText('The room today: 50% of the goal')).toBeInTheDocument();
    // Tuesday: two days' share is due, $14,000; the room is at $9,000.
    expect(screen.getByText('$5,000 behind the $14,000 due by Tuesday')).toBeInTheDocument();
    expect(screen.getByText('People, today')).toBeInTheDocument();
  });

  it('the room pace is every check-in over every Processing hour', () => {
    render(<CommandCenterView data={data} period="day" onPeriod={vi.fn()} />);
    expect(screen.getByText('5.0 items an hour')).toBeInTheDocument();
    expect(screen.getByText(/80 check-ins over 16.0 Processing hours/)).toBeInTheDocument();
  });

  it('says goal met and by how much, and a missed past day reads as short', () => {
    const { unmount } = render(
      <CommandCenterView data={{ ...data, room: { ...data.room, day_dollars: '14864.00', week_dollars: '28432.00' } }} period="day" onPeriod={vi.fn()} />,
    );
    expect(screen.getByText('Goal met, $7,864 over')).toBeInTheDocument();
    expect(screen.getByText('$14,432 ahead of the $14,000 due by Tuesday')).toBeInTheDocument();
    unmount();
    render(<CommandCenterView data={{ ...data, today: '2026-11-11' }} period="day" onPeriod={vi.fn()} />);
    expect(screen.getByText('$3,500 short of the goal')).toBeInTheDocument();
    expect(screen.getByText('The room, Nov 10')).toBeInTheDocument();
  });

  it('says why the lines and the room card differ when they do', () => {
    render(<CommandCenterView data={data} period="day" onPeriod={vi.fn()} />);
    expect(screen.getByTestId('gap-note')).toHaveTextContent('Checked in: $500. Put on the floor, the room card: $3,500.');
  });

  it('lifts what needs a look above the table, with a link for tag errors', () => {
    const idle = person({ user_id: 7, name: 'Maria K', day: CLOCKED_ONLY });
    render(<CommandCenterView data={{ ...data, people: [person({ day: numbers({ tag_errors: 1 }) }), idle] }} period="day" onPeriod={vi.fn()} />);
    const box = within(screen.getByTestId('needs-a-look'));
    expect(box.getByText(/Maria K clocked 8.0 Processing hours/)).toBeInTheDocument();
    expect(box.getByText('See the tag errors')).toHaveAttribute('href', '/inventory/tag-errors');
  });

  describe('My numbers', () => {
    const mine = { ...data, can_see_everyone: false, me: 4 };

    it('leads with the person own day, then the room', () => {
      render(<CommandCenterView data={mine} period="day" onPeriod={vi.fn()} />);
      expect(screen.getByText('You, today')).toBeInTheDocument();
      expect(screen.getByText('40')).toBeInTheDocument();
      expect(screen.getByText('items checked in')).toBeInTheDocument();
      expect(screen.getByText('$500')).toBeInTheDocument();
      expect(screen.getByText('10.0')).toBeInTheDocument();
      expect(screen.getByTestId('room-line-mine')).toHaveTextContent('The whole room, today');
      expect(screen.queryByText(/People,/)).not.toBeInTheDocument();
      expect(screen.getByText(/Your lead and the owner see these same numbers and notes/)).toBeInTheDocument();
    });

    it('says when the day was up on the day before', () => {
      render(<CommandCenterView data={{ ...mine, people: [person({ days: TWO_DAYS })] }} period="day" onPeriod={vi.fn()} />);
      expect(screen.getByTestId('up-line')).toHaveTextContent('Faster than Mon 9: 20.6 an hour, up from 14.7.');
    });

    it('tells the person what the lead is told when sign-ins were shared', () => {
      render(<CommandCenterView data={{ ...mine, room: { ...mine.room, shared_sign_in: { day: true, week: true } } }} period="day" onPeriod={vi.fn()} />);
      expect(screen.getByTestId('shared-note')).toHaveTextContent('some of these items may be theirs. Signing out when you step away keeps your numbers your own. Your lead sees the same note.');
    });

    it('hours with no check-ins read as a sign-in matter, never as zero work', () => {
      render(<CommandCenterView data={{ ...mine, people: [person({ day: CLOCKED_ONLY })] }} period="day" onPeriod={vi.fn()} />);
      expect(screen.getByText('8.0 hours')).toBeInTheDocument();
      expect(screen.getByText(/Thank you for the time/)).toBeInTheDocument();
      expect(screen.getByTestId('sign-in-note')).toHaveTextContent('sign in as yourself at the PC before you check in');
      expect(screen.queryByText('0.0')).not.toBeInTheDocument();
    });

    it('a past day with no punch says so once, calmly', () => {
      render(<CommandCenterView data={{ ...mine, today: '2026-11-12', people: [person({ day: NO_PUNCH })] }} period="day" onPeriod={vi.fn()} />);
      expect(screen.getAllByText(/Not clocked in to Processing/)).toHaveLength(1);
      expect(screen.getByText('Not clocked in to Processing this day, so no per-hour number.')).toBeInTheDocument();
    });

    it('a quiet day is one calm line, and tag errors lead to the list', () => {
      render(<CommandCenterView data={{ ...mine, people: [person({ day: { ...NOTHING, tag_errors: 2 } })] }} period="day" onPeriod={vi.fn()} />);
      expect(screen.getByText('Nothing under your name yet today. Your numbers show here as you check in.')).toBeInTheDocument();
      expect(screen.queryByText('Items an hour')).not.toBeInTheDocument();
      expect(screen.getByText('See which ones')).toHaveAttribute('href', '/inventory/tag-errors');
    });

    it('a tag error already fixed says so', () => {
      render(<CommandCenterView data={{ ...mine, people: [person({ day: { ...NOTHING, tag_errors: 2, tag_errors_fixed: 2 } })] }} period="day" onPeriod={vi.fn()} />);
      expect(screen.getByTestId('my-tag-errors')).toHaveTextContent('2 tag errors found on your items today, already fixed.');
    });

    it('the week tells a climb in one line', () => {
      const days = [
        { date: '2026-11-09', items: 16, dollars: '100.00', hours: null, items_per_hour: null, dollars_per_hour: null },
        ...TWO_DAYS.map((day) => ({ ...day, date: day.date === '2026-11-09' ? '2026-11-10' : '2026-11-11' })),
      ];
      render(<CommandCenterView data={{ ...mine, date: '2026-11-11', today: '2026-11-11', people: [person({ days })] }} period="week" onPeriod={vi.fn()} />);
      // The no-punch first day is no yardstick: only the clocked days count.
      expect(screen.getByTestId('up-line')).toHaveTextContent('Faster each clocked day: 14.7, 20.6 items an hour.');
    });
  });

  it('opens with the whole answer in words', () => {
    const idle = person({ user_id: 7, name: 'Maria K', day: CLOCKED_ONLY });
    const rookie = person({ user_id: 8, name: 'Josh P', is_new: true, first_check_in: '2026-11-09', days: TWO_DAYS });
    render(<CommandCenterView data={{ ...data, people: [person(), idle, rookie] }} period="day" onPeriod={vi.fn()} />);
    const story = screen.getByTestId('room-story').textContent ?? '';
    expect(story).toContain('Today: the room put $3,500 on the floor, $3,500 to go today.');
    expect(story).toContain('3 people on the Processing clock for 16.0 hours, 5.0 items an hour.');
    expect(story).toContain('Maria had no check-ins under their own name');
    expect(story).toContain('Josh (new) is climbing: 20.6 an hour, up from 14.7 an hour.');
  });

  it('has no dash characters in its words', () => {
    const { container } = render(<CommandCenterView data={data} period="week" onPeriod={vi.fn()} />);
    expect(container.textContent).not.toMatch(new RegExp('[' + String.fromCharCode(0x2013, 0x2014) + ']'));
  });
});
