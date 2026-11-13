import { Table, TableBody, TableCell, TableHead, TableRow } from '@mui/material';
import { render, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import StackOnPhone from './StackOnPhone';

function Sample({ rows = ['Becky'], className }: { rows?: string[]; className?: string }) {
  return (
    <StackOnPhone>
      <Table className={className}>
        <TableHead>
          <TableRow>
            <TableCell>Employee</TableCell>
            <TableCell data-phone="hide">Unit</TableCell>
            <TableCell align="right">Rate</TableCell>
            <TableCell>Actions</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={4}>No employees</TableCell>
            </TableRow>
          ) : (
            rows.map((name) => (
              <TableRow key={name}>
                <TableCell>{name}</TableCell>
                <TableCell>each</TableCell>
                <TableCell align="right">$15.00</TableCell>
                <TableCell><button type="button">Edit</button></TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </StackOnPhone>
  );
}

const cells = (container: HTMLElement) => Array.from(container.querySelectorAll<HTMLTableCellElement>('tbody td'));

describe('StackOnPhone', () => {
  it('copies each column heading onto its cells, so a card can show "RATE  $15.00"', () => {
    const { container } = render(<Sample />);
    expect(cells(container).map((td) => td.dataset.label)).toEqual(['Employee', 'Unit', 'Rate', '']);
  });

  it('marks a column the page asked to leave out on a phone, and gives "Actions" no label', () => {
    const { container } = render(<Sample />);
    const [, unit, rate, actions] = cells(container);
    expect(unit.dataset.phone).toBe('hide');
    expect(rate.dataset.phone).not.toBe('hide');
    expect(actions.dataset.label).toBe('');
  });

  it('labels rows that arrive later (data loading)', async () => {
    const { container, rerender } = render(<Sample rows={[]} />);
    // The "nothing here" row spans the table and is left alone.
    expect(cells(container)[0].dataset.label).toBeUndefined();
    rerender(<Sample rows={['Becky', 'Eli']} />);
    await waitFor(() => expect(cells(container).filter((td) => td.dataset.label === 'Rate')).toHaveLength(2));
  });

  it('leaves a table marked eco-no-stack alone', () => {
    const { container } = render(<Sample className="eco-no-stack" />);
    expect(cells(container).every((td) => td.dataset.label === undefined)).toBe(true);
  });

  it('labels rows after a left-out first column (a tick box), so the next cell can head the card', () => {
    const { container } = render(
      <StackOnPhone>
        <Table>
          <TableHead><TableRow><TableCell data-phone="hide" /><TableCell>Title</TableCell><TableCell>Price</TableCell></TableRow></TableHead>
          <TableBody><TableRow><TableCell><input type="checkbox" /></TableCell><TableCell>Bed frame</TableCell><TableCell>$16.50</TableCell></TableRow></TableBody>
        </Table>
      </StackOnPhone>,
    );
    const [tick, title, price] = cells(container);
    expect(tick.dataset.phone).toBe('hide');
    expect(title.dataset.label).toBe('Title');
    expect(price.dataset.label).toBe('Price');
  });
});

