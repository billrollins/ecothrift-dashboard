import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

const ps = vi.hoisted(() => ({ getHealth: vi.fn(), listPrinters: vi.fn(async () => []), getSettings: vi.fn(async () => ({})) }));
const release = vi.hoisted(() => ({ data: { available: true, version: '1.9.9', s3_file_info: { url: 'https://s3/setup.exe' } } }));
vi.mock('../../services/localPrintService', () => ({ localPrintService: ps }));
vi.mock('../../api/core.api', () => ({
  getPrintServerVersion: vi.fn(async () => release),
  getLabelSizeSetting: vi.fn(async () => ({ w_in: 1.5, h_in: 1, dpi: 203 })),
  saveLabelSizeSetting: vi.fn(),
}));
vi.mock('./LabelSizeCard', () => ({ LabelSizeCard: () => <div>label size card</div> }));

import { PrintServerChip } from './PrintServerChip';

function renderChip() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <PrintServerChip />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('print server chip', () => {
  beforeEach(() => vi.clearAllMocks());

  it('Online opens the mini window with the printer pick and the label size', async () => {
    ps.getHealth.mockResolvedValue({ status: 'ok', version: '1.9.9', printers_available: 1 });
    renderChip();
    fireEvent.click(await screen.findByText('Print server: Online'));
    expect(await screen.findByText('label size card')).toBeInTheDocument();
    expect(screen.getByText('All printing settings')).toBeInTheDocument();
  });

  it('Needs update links to the download', async () => {
    ps.getHealth.mockResolvedValue({ status: 'ok', version: '1.9.8', printers_available: 1 });
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    renderChip();
    fireEvent.click(await screen.findByText('Print server: Needs update'));
    expect(open).toHaveBeenCalledWith('https://s3/setup.exe', '_blank', 'noopener');
  });

  it('Offline when it does not answer', async () => {
    ps.getHealth.mockRejectedValue(new TypeError('Failed to fetch'));
    renderChip();
    expect(await screen.findByText('Print server: Offline')).toBeInTheDocument();
  });
});
