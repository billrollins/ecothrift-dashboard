import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DeviceSetupDialog } from './DeviceSetupDialog';
import { TRAINING_REGISTER_LABEL, sortRegistersForSetup } from '../../utils/trainingRegister';

const state = vi.hoisted(() => ({ manager: true }));

// The server sends registers by code, so TRAIN can land in the middle; the dialog puts it last.
const REGISTERS = [
  { id: 1, name: 'Back', code: 'BACK', is_training: false },
  { id: 3, name: 'Training register', code: 'TRAIN', is_training: true },
  { id: 2, name: 'Front', code: 'FRONT', is_training: false },
];

vi.mock('../../hooks/usePOS', () => ({
  useRegisters: () => ({ data: { results: REGISTERS } }),
}));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    hasRole: (role: string) => (state.manager ? true : role === 'Employee'),
  }),
}));

const STORAGE_KEY = 'pos_device_config';

function storedConfig(): { deviceType: string; registerId?: number } | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw ? JSON.parse(raw) : null;
}

function configureDevice(id: number) {
  const reg = REGISTERS.find((r) => r.id === id)!;
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      deviceType: 'register',
      registerId: reg.id,
      registerName: reg.name,
      registerCode: reg.code,
      configuredAt: '2026-10-14T09:00:00Z',
    }),
  );
}

function openRegisterList() {
  fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Register' }));
  return within(screen.getByRole('listbox'));
}

function setup() {
  const onClose = vi.fn();
  const onSaved = vi.fn();
  render(<DeviceSetupDialog open onClose={onClose} onSaved={onSaved} />);
  return { onClose, onSaved, user: userEvent.setup() };
}

describe('Device setup: the training register (2026-10-14)', () => {
  beforeEach(() => {
    localStorage.clear();
    state.manager = true;
  });

  it('lists the training register last, labelled practice only', () => {
    setup();
    const names = openRegisterList()
      .getAllByRole('option')
      .map((o) => o.textContent);
    expect(names).toEqual(['Select register...', 'Back (BACK)', 'Front (FRONT)', TRAINING_REGISTER_LABEL]);
  });

  it('sorts real registers first and keeps their order', () => {
    expect(sortRegistersForSetup(REGISTERS).map((r) => r.code)).toEqual(['BACK', 'FRONT', 'TRAIN']);
  });

  it('asks before switching a device to the training register', async () => {
    configureDevice(2);
    const { onSaved, user } = setup();
    await user.click(openRegisterList().getByRole('option', { name: TRAINING_REGISTER_LABEL }));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    const confirm = screen.getByRole('dialog', { name: 'Switch to the training register?' });
    expect(confirm).toHaveTextContent('Practice only: nothing is a real sale');
    expect(storedConfig()?.registerId).toBe(2); // nothing saved yet
    await user.click(within(confirm).getByRole('button', { name: 'Yes, practice only' }));
    expect(storedConfig()?.registerId).toBe(3);
    expect(onSaved).toHaveBeenCalled();
  });

  it('keeps the device where it was when the switch is cancelled', async () => {
    configureDevice(2);
    const { onSaved, user } = setup();
    await user.click(openRegisterList().getByRole('option', { name: TRAINING_REGISTER_LABEL }));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    const confirm = screen.getByRole('dialog', { name: 'Switch to the training register?' });
    await user.click(within(confirm).getByRole('button', { name: 'Cancel' }));
    expect(storedConfig()?.registerId).toBe(2);
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('asks before leaving the training register for a real one', async () => {
    configureDevice(3);
    const { user } = setup();
    await user.click(openRegisterList().getByRole('option', { name: 'Front (FRONT)' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    const confirm = screen.getByRole('dialog', { name: 'Leave the training register?' });
    expect(confirm).toHaveTextContent('This is a real register: sales are real.');
    expect(confirm).toHaveTextContent('Front (FRONT)');
    expect(storedConfig()?.registerId).toBe(3);
    await user.click(within(confirm).getByRole('button', { name: 'Yes, real sales' }));
    expect(storedConfig()?.registerId).toBe(2);
  });

  it('switches between real registers with no extra step, as before', async () => {
    configureDevice(1);
    const { onSaved, user } = setup();
    await user.click(openRegisterList().getByRole('option', { name: 'Front (FRONT)' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.queryByRole('dialog', { name: /training register/ })).not.toBeInTheDocument();
    expect(storedConfig()?.registerId).toBe(2);
    expect(onSaved).toHaveBeenCalled();
  });

  it('lets only a manager put a device on the training register', () => {
    state.manager = false;
    configureDevice(2);
    setup();
    expect(screen.getByText('Only a manager can switch a device to the training register.')).toBeInTheDocument();
    const option = openRegisterList().getByRole('option', { name: TRAINING_REGISTER_LABEL });
    expect(option).toHaveAttribute('aria-disabled', 'true');
  });

  it('lets anyone take a training device back to a real register', async () => {
    state.manager = false;
    configureDevice(3);
    const { user } = setup();
    expect(screen.queryByText('Only a manager can switch a device to the training register.')).not.toBeInTheDocument();
    await user.click(openRegisterList().getByRole('option', { name: 'Back (BACK)' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await user.click(
      within(screen.getByRole('dialog', { name: 'Leave the training register?' })).getByRole('button', {
        name: 'Yes, real sales',
      }),
    );
    expect(storedConfig()?.registerId).toBe(1);
  });
});
