import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { RecoveryHint, recoveryLine } from './RecoveryHint';

const api = vi.hoisted(() => ({ getRecoveryEstimate: vi.fn() }));
vi.mock('../../api/recoveryEstimate.api', () => api);

function renderHint(props: Partial<Parameters<typeof RecoveryHint>[0]> = {}) {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <RecoveryHint retail="40.00" productId={7} orderId={3} condition="good" price="20.00" {...props} />
    </QueryClientProvider>,
  );
}

describe('RecoveryHint', () => {
  it('says what similar items keep, flags a high price and offers the middle of the band', async () => {
    api.getRecoveryEstimate.mockResolvedValue({
      data: {
        enabled: true,
        estimate: {
          recovery: 0.31, n: 212, basis: 'Cookware', low: '9.92', high: '14.88', mid: '12.40', verdict: 'high',
          sources: [{ source: 'store', label: 'The whole store', rate: 0.36, n: 48000 }],
        },
      },
    });
    const onUsePrice = vi.fn();
    renderHint({ onUsePrice });
    expect(await screen.findByText(recoveryLine({ recovery: 0.31, n: 212 }), { exact: false })).toBeInTheDocument();
    expect(screen.getByText('Priced high')).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Use $12.40' }));
    expect(onUsePrice).toHaveBeenCalledWith('12.40');
    expect(api.getRecoveryEstimate).toHaveBeenCalledWith(
      { retail: '40.00', product: 7, order: 3, condition: 'good', price: '20.00' }, expect.anything(),
    );
  });

  it('shows nothing with the switch off or without a retail', async () => {
    api.getRecoveryEstimate.mockResolvedValue({ data: { enabled: false, estimate: null } });
    const { container } = renderHint();
    await new Promise((r) => setTimeout(r, 500));
    expect(container).toBeEmptyDOMElement();
    api.getRecoveryEstimate.mockClear();
    renderHint({ retail: '' });
    await new Promise((r) => setTimeout(r, 500));
    expect(api.getRecoveryEstimate).not.toHaveBeenCalled();
  });
});
