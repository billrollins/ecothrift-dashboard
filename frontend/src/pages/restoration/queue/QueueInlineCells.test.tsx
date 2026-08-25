import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { formatGradeAmount, MoneyCell, NOTE_HEIGHT_PX, NOTE_MIN_PAD_Y_PX, NoteCell, notePadY } from './QueueInlineCells';

const LINE = 18;
const THREE = LINE * 3;
const MIN = NOTE_MIN_PAD_Y_PX;
const CLIENT = THREE + MIN * 2;

describe('notePadY', () => {
  it('centers one line in the three-line box', () => {
    expect(notePadY(MIN * 2 + LINE, CLIENT)).toBe(MIN + LINE);
  });

  it('centers two lines so they sit in the middle', () => {
    expect(notePadY(MIN * 2 + LINE * 2, CLIENT)).toBe(MIN + LINE / 2);
  });

  it('keeps minimum padding when the note fills all three lines', () => {
    expect(notePadY(MIN * 2 + THREE, CLIENT)).toBe(MIN);
  });

  it('keeps minimum padding when the note overflows, so it starts at the top', () => {
    expect(notePadY(MIN * 2 + LINE * 5, CLIENT)).toBe(MIN);
  });

  it('does not invent padding when layout has not run yet', () => {
    expect(notePadY(0, 0)).toBe(MIN);
  });
});

describe('formatGradeAmount', () => {
  it('groups thousands and always shows cents', () => {
    expect(formatGradeAmount(29)).toBe('29.00');
    expect(formatGradeAmount(1234.5)).toBe('1,234.50');
  });
});

describe('MoneyCell', () => {
  it('keeps $ and % in a leading rail and formats the amount', () => {
    const { rerender } = render(
      <MoneyCell label="Working" value={29} unit="usd" onCommit={vi.fn()} />,
    );
    expect(screen.getByLabelText('Working price')).toHaveValue('29.00');
    expect(screen.getByText('$')).toBeInTheDocument();

    rerender(<MoneyCell label="Working" value={29} unit="pct" onCommit={vi.fn()} />);
    expect(screen.getByLabelText('Working price')).toHaveValue('29.00');
    expect(screen.getByText('%')).toBeInTheDocument();
  });
});

describe('NoteCell', () => {
  it('is a three-line textarea that commits on blur, not Enter', () => {
    const onCommit = vi.fn();
    render(<NoteCell label="Note" value="scuffed hinge" placeholder="add a note…" onCommit={onCommit} />);

    const field = screen.getByLabelText('Note');
    expect(field.tagName).toBe('TEXTAREA');
    expect(field).toHaveStyle({ height: `${NOTE_HEIGHT_PX}px` });

    fireEvent.change(field, { target: { value: 'scuffed hinge\nneeds pin' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(onCommit).not.toHaveBeenCalled();
    expect(field).toHaveValue('scuffed hinge\nneeds pin');

    fireEvent.blur(field);
    expect(onCommit).toHaveBeenCalledWith('scuffed hinge\nneeds pin');
  });

  it('reverts on Escape', () => {
    const onCommit = vi.fn();
    render(<NoteCell label="Note" value="keep me" placeholder="add a note…" onCommit={onCommit} />);

    const field = screen.getByLabelText('Note');
    fireEvent.change(field, { target: { value: 'throw away' } });
    fireEvent.keyDown(field, { key: 'Escape' });
    expect(field).toHaveValue('keep me');
    expect(onCommit).not.toHaveBeenCalled();
  });
});
