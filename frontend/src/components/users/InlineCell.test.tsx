import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InlineSelect, InlineText } from './InlineCell';

describe('InlineSelect', () => {
  it('commits a new value and does not bubble the click to the row', async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();
    const onRow = vi.fn();
    render(
      <div onClick={onRow}>
        <InlineSelect
          ariaLabel="Department"
          value=""
          emptyLabel="None"
          options={[{ value: '1', label: 'Retail' }]}
          onCommit={onCommit}
        />
      </div>,
    );

    await user.selectOptions(screen.getByLabelText('Department'), '1');

    expect(onCommit).toHaveBeenCalledWith('1');
    expect(onRow).not.toHaveBeenCalled();
  });
});

describe('InlineText', () => {
  it('commits on blur when the text changed', async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();
    render(
      <InlineText ariaLabel="Job" value="Cashier" onCommit={onCommit} />,
    );

    const field = screen.getByLabelText('Job');
    await user.clear(field);
    await user.type(field, 'Lead cashier');
    field.blur();

    expect(onCommit).toHaveBeenCalledWith('Lead cashier');
  });

  it('does not commit when the value is unchanged', async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();
    render(<InlineText ariaLabel="Job" value="Cashier" onCommit={onCommit} />);

    const field = screen.getByLabelText('Job');
    await user.click(field);
    field.blur();

    expect(onCommit).not.toHaveBeenCalled();
  });
});
