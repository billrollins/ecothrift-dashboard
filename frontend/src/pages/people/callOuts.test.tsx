import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import type { Callout } from '../../api/hiring.api';
import { CallOutSection, chosenNotes, type NoteLine } from './EmailReview';
import { CalloutChips, CalloutMarks } from './FlagDots';

const CALLOUTS: Callout[] = [
  { key: 'pay', kind: 'pay', label: 'Asks $22 (starts at $15)', short: '$22' },
  { key: 'hours', kind: 'hours', label: 'Wants 20 hrs (30+)', short: '20h' },
  { key: 'must_have.lifting', kind: 'must_have', label: 'Lift 50 lbs: no', short: 'Lift 50 lbs' },
];

describe('heads-up flags (Dash #184)', () => {
  it('card chips and list marks leave the must-haves to their own red marks', () => {
    render(
      <>
        <CalloutChips callouts={CALLOUTS} />
        <div data-testid="marks">
          <CalloutMarks callouts={CALLOUTS} />
        </div>
      </>,
    );
    const chips = screen.getByTestId('callout-chips');
    expect(chips).toHaveTextContent('Asks $22 (starts at $15)');
    expect(chips).toHaveTextContent('Wants 20 hrs (30+)');
    expect(chips).not.toHaveTextContent('Lift 50 lbs');
    expect(within(screen.getByTestId('marks')).getAllByTestId('callout-mark').map((m) => m.textContent)).toEqual(['$22', '20h']);
  });

  it('no heads-up flags: no chips', () => {
    const { container } = render(<CalloutChips callouts={[CALLOUTS[2]]} />);
    expect(container).toBeEmptyDOMElement();
  });
});

function Harness({ start, onOut }: { start: NoteLine[]; onOut: (v: ReturnType<typeof chosenNotes>) => void }) {
  const [heading, setHeading] = useState('A few things to look at before you book');
  const [lines, setLines] = useState(start);
  onOut(chosenNotes(heading, lines));
  return <CallOutSection heading={heading} lines={lines} onHeading={setHeading} onLines={setLines} />;
}

describe('invite call-outs in the review', () => {
  it('untick a paragraph, edit one, add a line of your own', async () => {
    let out = { heading: '', items: [] as string[] };
    render(
      <Harness
        start={[
          { key: 'pay', label: 'Asks $22 (starts at $15)', text: 'About pay: we start at $15.', on: true },
          { key: 'hours', label: 'Wants 20 hrs (30+)', text: 'About hours.', on: true },
        ]}
        onOut={(v) => (out = v)}
      />,
    );
    expect(out.items).toEqual(['About pay: we start at $15.', 'About hours.']);
    await userEvent.click(screen.getByLabelText('Include: Wants 20 hrs (30+)'));
    expect(out.items).toEqual(['About pay: we start at $15.']);
    const pay = screen.getByDisplayValue('About pay: we start at $15.');
    await userEvent.clear(pay);
    await userEvent.type(pay, 'Pay: talk to us.');
    await userEvent.click(screen.getByRole('button', { name: '+ Add a line' }));
    await userEvent.type(screen.getByPlaceholderText('Your words'), 'Bring your ID.');
    expect(out).toEqual({ heading: 'A few things to look at before you book', items: ['Pay: talk to us.', 'Bring your ID.'] });
    await userEvent.click(screen.getByLabelText('Remove this line'));
    expect(out.items).toEqual(['Pay: talk to us.']);
  });

  it('no flags: just the button to add a line', () => {
    render(<Harness start={[]} onOut={() => undefined} />);
    expect(screen.queryByLabelText('Heading')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '+ Add a line' })).toBeInTheDocument();
  });
});
