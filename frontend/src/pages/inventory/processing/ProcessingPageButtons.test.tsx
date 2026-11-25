import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SnackbarProvider } from 'notistack';
import { describe, expect, it, vi } from 'vitest';
import { ProcessingPageButtons } from './ProcessingPageButtons';
import { ProcessingUndoProvider, useProcessingUndo } from './processingUndo';

function Do({ undoFn }: { undoFn: () => boolean }) {
  const undo = useProcessingUndo();
  return <button type="button" onClick={() => undo?.record({ label: 'Brand on row 10', undo: undoFn, redo: () => true })}>do it</button>;
}

function show(node: React.ReactNode) {
  return render(
    <SnackbarProvider>
      <ProcessingUndoProvider scopeKey={428}>{node}</ProcessingUndoProvider>
    </SnackbarProvider>,
  );
}

describe('the page buttons on the search row', () => {
  it('on the queue: Undo and Redo with their keys, greyed with nothing to undo, and no Queue or Refresh', () => {
    show(<ProcessingPageButtons />);
    expect(screen.getByRole('button', { name: 'Undo (Ctrl+Z)' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Redo (Ctrl+Y)' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Undo (Ctrl+Z)' })).toHaveTextContent('Ctrl+Z');
    expect(screen.queryByRole('button', { name: 'Queue' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Refresh page' })).not.toBeInTheDocument();
  });

  it('with a row open: Queue and Refresh come first, Undo and Redo stay last', async () => {
    const back = vi.fn();
    const refresh = vi.fn();
    show(<ProcessingPageButtons onBackToQueue={back} onRefresh={refresh} />);
    const names = screen.getAllByRole('button').map((b) => b.getAttribute('aria-label'));
    expect(names).toEqual(['Queue', 'Refresh page', 'Undo (Ctrl+Z)', 'Redo (Ctrl+Y)']);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Queue' }));
    await user.click(screen.getByRole('button', { name: 'Refresh page' }));
    expect(back).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('Refresh is greyed while the row is loading again', () => {
    show(<ProcessingPageButtons onBackToQueue={vi.fn()} onRefresh={vi.fn()} refreshing />);
    expect(screen.getByRole('button', { name: 'Refresh page' })).toBeDisabled();
  });

  it('Undo lights up after an action and puts it back', async () => {
    const put = vi.fn(() => true);
    show(
      <>
        <Do undoFn={put} />
        <ProcessingPageButtons />
      </>,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'do it' }));
    const undo = screen.getByRole('button', { name: 'Undo (Ctrl+Z)' });
    expect(undo).toBeEnabled();
    await user.click(undo);
    await waitFor(() => expect(put).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Redo (Ctrl+Y)' })).toBeEnabled());
  });
});
