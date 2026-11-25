import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SnackbarProvider } from 'notistack';
import { describe, expect, it, vi } from 'vitest';
import { AttachedProductCard, type AttachedRowProduct } from './ProcessingActiveCard';

vi.mock('../../../api/client', () => ({ default: { get: vi.fn(), post: vi.fn() } }));
// The photo sheet button has its own tests; here it is only a place holder on the line.
vi.mock('../../../components/photoSheets/PhotoSheetButton', () => ({ PhotoSheetButton: () => null }));

function line(over: Partial<AttachedRowProduct> = {}): AttachedRowProduct {
  return {
    key: 'product:7',
    productId: 7,
    productNumber: 'PRD-7',
    title: 'Duracell Coppertop AAA Alkaline Batteries 8-Pack',
    brand: 'Duracell',
    category: 'Electronics',
    checkedInQty: 15,
    linkConfig: { role: null, checkIns: 1, manifestUnits: 1 },
    ...over,
  };
}

function show(node: React.ReactNode) {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <SnackbarProvider>{node}</SnackbarProvider>
    </QueryClientProvider>,
  );
}

const noop = () => undefined;

describe('one attached product on a manifest row (#229)', () => {
  it('says how many are checked in and the last price', () => {
    show(<AttachedProductCard product={line()} lastPrice="4.99" onCheckIn={noop} onEditProduct={noop} onLinkConfigChange={noop} />);
    expect(screen.getByTestId('attached-status')).toHaveTextContent('15 checked in · last $4.99');
  });

  it('says "none yet" before the first check-in', () => {
    show(<AttachedProductCard product={line({ checkedInQty: 0 })} onCheckIn={noop} onEditProduct={noop} onLinkConfigChange={noop} />);
    expect(screen.getByTestId('attached-status')).toHaveTextContent('none yet');
    expect(screen.queryByTestId('same-product-rows')).not.toBeInTheDocument();
  });

  it('the same product on other rows is a badge on the line; a click checks them in together', async () => {
    const together = vi.fn();
    show(
      <AttachedProductCard
        product={line()}
        sameRows={[721, 738]}
        onCheckInTogether={together}
        onCheckIn={noop}
        onEditProduct={noop}
        onLinkConfigChange={noop}
      />,
    );
    const badge = screen.getByTestId('same-product-rows');
    expect(badge).toHaveTextContent('Also rows 721, 738');
    await userEvent.setup().click(badge);
    expect(together).toHaveBeenCalledTimes(1);
  });

  it('one other row reads "Also row 65"; with nothing to open it is only a badge', () => {
    show(<AttachedProductCard product={line()} sameRows={[65]} onCheckIn={noop} onEditProduct={noop} onLinkConfigChange={noop} />);
    const badge = screen.getByTestId('same-product-rows');
    expect(badge).toHaveTextContent('Also row 65');
    expect(badge).not.toHaveAttribute('role', 'button');
  });
});
