import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RestorationActionDTO } from '../../../types/inventory.types';
import { resetClaimedCannedActionEnters } from './tarsActions';
import { CurrentAction } from './TarsWorkPanel';

function action(overrides: Partial<RestorationActionDTO> = {}): RestorationActionDTO {
  return {
    id: 17,
    grade: '',
    category: 'test',
    description: '',
    seconds: 0,
    started_at: '2026-08-19T18:00:00Z',
    ended_at: null,
    created_by: 1,
    is_described: false,
    ...overrides,
  };
}

describe('CurrentAction Enter', () => {
  beforeEach(() => {
    resetClaimedCannedActionEnters();
  });

  it('files the draft when Enter is clicked', async () => {
    const user = userEvent.setup();
    const onEnter = vi.fn();
    render(
      <CurrentAction
        action={action()}
        canUndo
        onDescribe={vi.fn()}
        onEnter={onEnter}
        onUndo={vi.fn()}
      />,
    );

    await user.type(screen.getByLabelText('What you did'), 'Checked the wheels.');
    await user.click(screen.getByRole('button', { name: 'Enter' }));
    expect(onEnter).toHaveBeenCalledWith('Checked the wheels.');
  });

  it('files the draft when Enter is pressed in the field', async () => {
    const user = userEvent.setup();
    const onEnter = vi.fn();
    render(
      <CurrentAction
        action={action()}
        canUndo
        onDescribe={vi.fn()}
        onEnter={onEnter}
        onUndo={vi.fn()}
      />,
    );

    await user.type(screen.getByLabelText('What you did'), 'Checked the wheels.{Enter}');
    expect(onEnter).toHaveBeenCalledWith('Checked the wheels.');
  });

  it('enters an initial inspection without waiting for the button', () => {
    const onEnter = vi.fn();
    render(
      <CurrentAction
        action={action({ description: 'Initial item inspection', is_described: true })}
        canUndo={false}
        onDescribe={vi.fn()}
        onEnter={onEnter}
      />,
    );
    expect(onEnter).toHaveBeenCalledWith('Initial item inspection');
  });

  it('enters a resume from hold without waiting for the button', () => {
    const onEnter = vi.fn();
    render(
      <CurrentAction
        action={action({ description: 'Resume item from hold', is_described: true })}
        canUndo
        onDescribe={vi.fn()}
        onEnter={onEnter}
        onUndo={vi.fn()}
      />,
    );
    expect(onEnter).toHaveBeenCalledWith('Resume item from hold');
  });

  it('does not enter a real description on its own', () => {
    const onEnter = vi.fn();
    render(
      <CurrentAction
        action={action({ description: 'Checked the wheels.', is_described: true })}
        canUndo
        onDescribe={vi.fn()}
        onEnter={onEnter}
        onUndo={vi.fn()}
      />,
    );
    expect(onEnter).not.toHaveBeenCalled();
  });
});
