import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

const ps = vi.hoisted(() => ({ getHealth: vi.fn(), listPrinters: vi.fn(async () => []), getSettings: vi.fn(async () => ({})) }));
const release = vi.hoisted(() => ({ data: { available: true, version: '1.9.12', s3_file_info: { url: 'https://s3/setup.exe' } } }));
vi.mock('../../services/localPrintService', () => ({ localPrintService: ps }));
vi.mock('../../api/core.api', () => ({ getPrintServerVersion: vi.fn(async () => release) }));
vi.mock('./TagsCard', () => ({ TagsCard: () => <div>tags card</div>, SAMPLE_RESTORATION: {} }));
vi.mock('notistack', () => ({ useSnackbar: () => ({ enqueueSnackbar: vi.fn() }) }));

import { PrintServerButton } from './PrintServerButton';

function renderButton() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <PrintServerButton />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('print server button (sidebar foot)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows the version and Online, and opens the Printing window', async () => {
    ps.getHealth.mockResolvedValue({ status: 'ok', version: '1.9.12', printers_available: 3 });
    renderButton();
    fireEvent.click(await screen.findByText('Print server · v1.9.12 · Online'));
    expect(await screen.findByText('This computer')).toBeInTheDocument();
    expect(screen.getByText('tags card')).toBeInTheDocument();
    expect(screen.getByText(/v1.9.12 · 3 printers · up to date/)).toBeInTheDocument();
  });

  it('Needs update opens the window with the update button', async () => {
    ps.getHealth.mockResolvedValue({ status: 'ok', version: '1.9.11', printers_available: 1 });
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    renderButton();
    fireEvent.click(await screen.findByText('Print server · v1.9.11 · Needs update'));
    fireEvent.click(await screen.findByText('Update to v1.9.12'));
    expect(open).toHaveBeenCalledWith('https://s3/setup.exe', '_blank', 'noopener');
  });

  it('Offline when it does not answer', async () => {
    ps.getHealth.mockRejectedValue(new TypeError('Failed to fetch'));
    renderButton();
    expect(await screen.findByText('Print server · Offline')).toBeInTheDocument();
  });
});
