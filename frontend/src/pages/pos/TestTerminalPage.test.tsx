import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Register } from '../../types/pos.types';

const registersState: { data?: { results: Partial<Register>[] }; isLoading: boolean; isError: boolean } = {
  isLoading: false,
  isError: false,
};

vi.mock('../../hooks/usePOS', () => ({
  useRegisters: () => registersState,
}));

// The real terminal is large; here we only check which register /pos/test hands it.
vi.mock('./TerminalPage', () => ({
  default: ({ testRegister }: { testRegister?: Register }) => (
    <div data-testid="terminal">{testRegister ? `test:${testRegister.code}` : 'saved-config'}</div>
  ),
}));

import TestTerminalPage from './TestTerminalPage';

const SAVED = JSON.stringify({
  deviceType: 'register', registerId: 2, registerName: 'Register 2', registerCode: 'REG-02',
  configuredAt: '2026-10-01T12:00:00Z',
});

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/pos/test']}>
      <TestTerminalPage />
    </MemoryRouter>,
  );
}

describe('/pos/test (the test terminal, 2026-10-16)', () => {
  beforeEach(() => {
    localStorage.setItem('pos_device_config', SAVED);
  });
  afterEach(() => localStorage.clear());

  it('runs the terminal on TRAIN and never touches this computer\'s saved register', () => {
    registersState.data = {
      results: [
        { id: 2, code: 'REG-02', name: 'Register 2', is_active: true, is_training: false },
        { id: 9, code: 'TRAIN', name: 'Training', is_active: true, is_training: true },
      ],
    };
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const removeItem = vi.spyOn(Storage.prototype, 'removeItem');
    renderPage();
    expect(screen.getByTestId('terminal')).toHaveTextContent('test:TRAIN');
    expect(setItem).not.toHaveBeenCalled();
    expect(removeItem).not.toHaveBeenCalled();
    expect(localStorage.getItem('pos_device_config')).toBe(SAVED);
    setItem.mockRestore();
    removeItem.mockRestore();
  });

  it('says so clearly when there is no training register, and never falls back to a real one', () => {
    registersState.data = {
      results: [{ id: 2, code: 'REG-02', name: 'Register 2', is_active: true, is_training: false }],
    };
    renderPage();
    expect(screen.queryByTestId('terminal')).toBeNull();
    expect(screen.getByText(/There is no training register \(TRAIN\)/)).toBeInTheDocument();
    expect(screen.getByTestId('training-banner')).toBeInTheDocument();
    expect(screen.getByText('Test terminal — practice only, nothing is real')).toBeInTheDocument();
  });
});
