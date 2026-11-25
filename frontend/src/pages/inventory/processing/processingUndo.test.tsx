import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SnackbarProvider } from 'notistack';
import { describe, expect, it, vi } from 'vitest';
import {
  NO_UNDO,
  ProcessingUndoProvider,
  UNDO_LIMIT,
  afterRedo,
  afterUndo,
  pageUndoKey,
  recorded,
  takeRedo,
  takeUndo,
  useProcessingUndo,
  type UndoEntry,
} from './processingUndo';

const entry = (label: string, over: Partial<UndoEntry> = {}): UndoEntry => ({ label, undo: () => true, redo: () => true, ...over });

describe('the undo and redo lists (#230)', () => {
  it('a new action goes on top and clears what could be redone', () => {
    let s = recorded(NO_UNDO, entry('a'));
    s = recorded(s, entry('b'));
    const { entry: top, rest } = takeUndo(s);
    expect(top?.label).toBe('b');
    const afterB = afterUndo(rest, top!);
    expect(afterB.redo.map((e) => e.label)).toEqual(['b']);
    // A new action after an undo: nothing left to redo.
    expect(recorded(afterB, entry('c')).redo).toEqual([]);
    const { entry: again, rest: r2 } = takeRedo(afterB);
    expect(afterRedo(r2, again!).undo.map((e) => e.label)).toEqual(['a', 'b']);
  });

  it('an action that cannot be redone is not kept for redo, and the list is not endless', () => {
    const checkIn = entry('Check-in on row 4', { redo: undefined });
    expect(afterUndo(NO_UNDO, checkIn).redo).toEqual([]);
    let s = NO_UNDO;
    for (let i = 0; i < UNDO_LIMIT + 5; i += 1) s = recorded(s, entry(String(i)));
    expect(s.undo).toHaveLength(UNDO_LIMIT);
    expect(takeUndo(NO_UNDO).entry).toBeNull();
  });
});

describe('whose Ctrl+Z it is', () => {
  const key = (over: Partial<Parameters<typeof pageUndoKey>[0]>) =>
    pageUndoKey({ key: 'z', ctrlKey: true, metaKey: false, shiftKey: false, altKey: false, target: document.body, ...over });

  it('is the page’s outside a box, and in an empty box (the scan box at rest)', () => {
    expect(key({})).toBe('undo');
    expect(key({ key: 'y' })).toBe('redo');
    expect(key({ shiftKey: true })).toBe('redo');
    expect(key({ metaKey: true, ctrlKey: false })).toBe('undo');
    const empty = document.createElement('input');
    expect(key({ target: empty })).toBe('undo');
    expect(key({ ctrlKey: false })).toBeNull();
    expect(key({ key: 'x' })).toBeNull();
  });

  it('is the browser’s in a box that holds typed text, and the page stays out of a window', () => {
    const typing = document.createElement('input');
    typing.value = 'Energizer';
    expect(key({ target: typing })).toBeNull();
    const area = document.createElement('textarea');
    area.value = 'a pasted page';
    expect(key({ target: area })).toBeNull();
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    const inside = document.createElement('button');
    dialog.appendChild(inside);
    document.body.appendChild(dialog);
    expect(key({ target: inside })).toBeNull();
    dialog.remove();
  });

  it('is the page’s in the scan box even with the last search still in it; not in the check-in window’s scan box', () => {
    const scan = document.createElement('input');
    scan.setAttribute('data-scan-search', 'page');
    scan.value = 'Lava Blast Playset';
    expect(key({ target: scan })).toBe('undo');
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    const inDialog = document.createElement('input');
    inDialog.setAttribute('data-scan-search', 'dialog');
    dialog.appendChild(inDialog);
    document.body.appendChild(dialog);
    expect(key({ target: inDialog })).toBeNull();
    dialog.remove();
  });
});

function Recorder({ make }: { make: () => UndoEntry }) {
  const undo = useProcessingUndo();
  return (
    <>
      <button type="button" onClick={() => undo?.record(make())}>do it</button>
      <span data-testid="undo-label">{undo?.undoLabel ?? 'none'}</span>
      <span data-testid="redo-label">{undo?.redoLabel ?? 'none'}</span>
    </>
  );
}

function show(node: React.ReactNode, scopeKey: number | string = 428) {
  return render(
    <SnackbarProvider>
      <ProcessingUndoProvider scopeKey={scopeKey}>{node}</ProcessingUndoProvider>
    </SnackbarProvider>,
  );
}

describe('Ctrl+Z and Ctrl+Y on the Processing page', () => {
  it('undoes the last action, then does it again', async () => {
    const put = vi.fn(() => true);
    const again = vi.fn(() => true);
    show(<Recorder make={() => ({ label: 'Brand on row 12', undo: put, redo: again })} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'do it' }));
    expect(screen.getByTestId('undo-label')).toHaveTextContent('Brand on row 12');

    await user.keyboard('{Control>}z{/Control}');
    await waitFor(() => expect(put).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByTestId('redo-label')).toHaveTextContent('Brand on row 12'));
    expect(screen.getByTestId('undo-label')).toHaveTextContent('none');
    expect(await screen.findByText('Undone: Brand on row 12.')).toBeInTheDocument();

    await user.keyboard('{Control>}y{/Control}');
    await waitFor(() => expect(again).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByTestId('undo-label')).toHaveTextContent('Brand on row 12'));
  });

  it('says so when it could not be put back, and keeps nothing to redo', async () => {
    show(<Recorder make={() => ({ label: 'Product attached on row 3', undo: () => false, redo: () => true })} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'do it' }));
    await user.keyboard('{Control>}z{/Control}');
    expect(await screen.findByText('Could not undo: Product attached on row 3.')).toBeInTheDocument();
    expect(screen.getByTestId('redo-label')).toHaveTextContent('none');
  });

  it('another order starts an empty list', async () => {
    const view = show(<Recorder make={() => entry('Title on row 1')} />, 428);
    await userEvent.setup().click(screen.getByRole('button', { name: 'do it' }));
    expect(screen.getByTestId('undo-label')).toHaveTextContent('Title on row 1');
    await act(async () => {
      view.rerender(
        <SnackbarProvider>
          <ProcessingUndoProvider scopeKey={461}><Recorder make={() => entry('x')} /></ProcessingUndoProvider>
        </SnackbarProvider>,
      );
    });
    expect(screen.getByTestId('undo-label')).toHaveTextContent('none');
  });
});
