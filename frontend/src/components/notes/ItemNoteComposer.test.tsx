import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ItemNoteComposer } from './ItemNoteComposer';

const mutateAsync = vi.fn().mockResolvedValue({});

vi.mock('../../hooks/useItemNotes', () => ({
  useAppendItemNote: () => ({
    mutateAsync,
    isPending: false,
  }),
}));

describe('ItemNoteComposer', () => {
  it('adds a note and clears the box', async () => {
    const user = userEvent.setup();
    render(<ItemNoteComposer itemId={9} jobId={4} />);
    const field = screen.getByLabelText('Add a note');
    const add = screen.getByRole('button', { name: 'Add' });
    expect(add).toBeDisabled();
    await user.type(field, 'Mike: hinge is loose');
    expect(add).toBeEnabled();
    await user.click(add);
    expect(mutateAsync).toHaveBeenCalledWith('Mike: hinge is loose');
  });

  it('submits on Enter', async () => {
    const user = userEvent.setup();
    render(<ItemNoteComposer itemId={9} jobId={4} />);
    await user.type(screen.getByLabelText('Add a note'), 'hinge is loose{Enter}');
    expect(mutateAsync).toHaveBeenCalledWith('hinge is loose');
  });
});
