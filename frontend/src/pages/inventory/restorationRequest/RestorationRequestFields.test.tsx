import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { RestorationRequestFields } from './RestorationRequestFields';
import { EMPTY_REQUEST, type RestorationRequestForm } from './restorationRequest';

vi.mock('../../../api/inventory.api', () => ({
  getRestorationRequestSettings: vi.fn(async () => ({ data: undefined })),
}));

function Form({ start = EMPTY_REQUEST }: { start?: RestorationRequestForm }) {
  const [price, setPrice] = useState('40.00');
  const [form, setForm] = useState(start);
  return (
    <QueryClientProvider client={new QueryClient()}>
      <input aria-label="Price" value={price} onChange={(e) => setPrice(e.target.value)} />
      <RestorationRequestFields value={form} onChange={setForm} price={price} />
    </QueryClientProvider>
  );
}

describe('Send to Restoration: the done price is not typed twice (Dash Updates #2)', () => {
  it('starts as the Price and follows it until someone types their own', async () => {
    const user = userEvent.setup();
    render(<Form />);
    const done = screen.getByLabelText(/Done price/) as HTMLInputElement;
    expect(done.value).toBe('40.00');
    expect(screen.getByText('Same as Price; change it if not')).toBeInTheDocument();
    const price = screen.getByLabelText('Price');
    await user.clear(price);
    await user.type(price, '55.00');
    expect(done.value).toBe('55.00');
    await user.clear(done);
    await user.type(done, '70');
    await user.clear(price);
    await user.type(price, '60.00');
    expect(done.value).toBe('70');
  });

  it('keeps a done price already saved', () => {
    render(<Form start={{ ...EMPTY_REQUEST, donePrice: '90.00' }} />);
    expect((screen.getByLabelText(/Done price/) as HTMLInputElement).value).toBe('90.00');
  });
});
