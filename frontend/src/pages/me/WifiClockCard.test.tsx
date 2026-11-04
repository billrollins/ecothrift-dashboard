import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getWifiClock = vi.fn();
vi.mock('../../api/hr.api', () => ({
  getWifiClock: () => getWifiClock(),
  startWifiClock: vi.fn(),
  turnOffWifiClock: vi.fn(),
}));
const standalone = vi.fn();
vi.mock('../thriftplus/scanner/installApp', () => ({ isStandalone: () => standalone() }));

import WifiClockCard from './WifiClockCard';

function renderCard() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><WifiClockCard /></QueryClientProvider>);
}

describe('WifiClockCard', () => {
  beforeEach(() => {
    getWifiClock.mockReset();
    standalone.mockReset();
  });

  it('shows nothing to people outside the pilot', async () => {
    getWifiClock.mockResolvedValue({ data: { eligible: false, on: false, helper_ready: true } });
    standalone.mockReturnValue(true);
    const { container } = renderCard();
    await new Promise((r) => setTimeout(r, 0));
    expect(container).toBeEmptyDOMElement();
  });

  it('only the installed app gets the button', async () => {
    getWifiClock.mockResolvedValue({ data: { eligible: true, on: false, helper_ready: true } });
    standalone.mockReturnValue(false);
    renderCard();
    expect(await screen.findByText('Open the installed Thrift+ Staff app to turn this on.')).toBeInTheDocument();
    expect(screen.queryByTestId('wifi-clock-on')).toBeNull();
  });

  it('installed: the button, and On once it is set', async () => {
    getWifiClock.mockResolvedValue({ data: { eligible: true, on: false, helper_ready: true } });
    standalone.mockReturnValue(true);
    renderCard();
    expect(await screen.findByTestId('wifi-clock-on')).toBeEnabled();
  });

  it('shows On with a way to turn it off', async () => {
    getWifiClock.mockResolvedValue({ data: { eligible: true, on: true, helper_ready: true } });
    standalone.mockReturnValue(true);
    renderCard();
    expect(await screen.findByTestId('wifi-clock-off')).toBeInTheDocument();
    expect(screen.getByTestId('wifi-clock-state')).toHaveTextContent('On');
  });
});
