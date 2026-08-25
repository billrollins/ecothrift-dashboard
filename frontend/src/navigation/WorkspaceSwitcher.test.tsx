import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WorkspaceSwitcher } from './WorkspaceSwitcher';
import { SLOT_C_WORKSPACES } from './slotCNavLayout';

const workspaces = SLOT_C_WORKSPACES.slice(0, 4);

describe('WorkspaceSwitcher', () => {
  it('names the current workspace on the trigger', () => {
    render(
      <WorkspaceSwitcher workspaces={workspaces} selectedId="processing" onSelect={() => {}} />,
    );
    expect(screen.getByRole('button', { expanded: false, name: /Processing/ })).toBeInTheDocument();
  });

  it('opens the menu of cards, then a digit selects and closes', async () => {
    const user = userEvent.setup({ delay: null });
    const onSelect = vi.fn();
    render(
      <WorkspaceSwitcher workspaces={workspaces} selectedId="buying" onSelect={onSelect} />,
    );

    await user.click(screen.getByRole('button', { expanded: false }));
    expect(await screen.findByRole('menu')).toBeInTheDocument();
    expect(screen.getByRole('menuitemradio', { name: /Restoration/ })).toBeInTheDocument();

    await user.keyboard('3');
    expect(onSelect).toHaveBeenCalledWith('restoration', true);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('opens the menu of cards, then a letter selects and closes', async () => {
    const user = userEvent.setup({ delay: null });
    const onSelect = vi.fn();
    render(
      <WorkspaceSwitcher workspaces={workspaces} selectedId="buying" onSelect={onSelect} />,
    );

    await user.click(screen.getByRole('button', { expanded: false }));
    expect(await screen.findByRole('menu')).toBeInTheDocument();

    await user.keyboard('r');
    expect(onSelect).toHaveBeenCalledWith('restoration', true);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('ignores digits while the menu is closed', async () => {
    const user = userEvent.setup({ delay: null });
    const onSelect = vi.fn();
    render(
      <WorkspaceSwitcher workspaces={workspaces} selectedId="buying" onSelect={onSelect} />,
    );

    await user.keyboard('3');
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('ignores letters while the menu is closed', async () => {
    const user = userEvent.setup({ delay: null });
    const onSelect = vi.fn();
    render(
      <WorkspaceSwitcher workspaces={workspaces} selectedId="buying" onSelect={onSelect} />,
    );

    await user.keyboard('r');
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('does not badge the closed trigger', () => {
    render(
      <WorkspaceSwitcher
        workspaces={SLOT_C_WORKSPACES}
        selectedId="buying"
        onSelect={() => {}}
        badgeCounts={{ onlineSales: 3, restoration: 2 }}
      />,
    );
    expect(screen.getByRole('button', { expanded: false })).not.toHaveAccessibleName(/waiting/);
  });

  it('pins a tiny count on the workspace icon once the menu is open', async () => {
    const user = userEvent.setup({ delay: null });
    render(
      <WorkspaceSwitcher
        workspaces={SLOT_C_WORKSPACES}
        selectedId="buying"
        onSelect={() => {}}
        badgeCounts={{ onlineSales: 3, restoration: 2 }}
      />,
    );

    await user.click(screen.getByRole('button', { expanded: false }));
    expect(screen.getByRole('menuitemradio', { name: /Online Sales, 3 waiting/ })).toBeInTheDocument();
    expect(screen.getByRole('menuitemradio', { name: /Restoration, 2 waiting/ })).toBeInTheDocument();
    expect(screen.getByRole('menuitemradio', { name: /^Buying$/ })).toBeInTheDocument();
  });
});
