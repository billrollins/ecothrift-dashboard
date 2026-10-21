import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import TaxExemptDialog, { taxExemptText } from './TaxExemptDialog';
import { buildReceiptData } from '../../utils/posReceipt';
import type { Cart } from '../../types/pos.types';

describe('TaxExemptDialog (non-profits, 2026-10-21)', () => {
  it("needs the organization's name and a certificate number or a photo", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<TaxExemptDialog open pending={false} error="" onSubmit={onSubmit} onCancel={() => undefined} />);
    const go = screen.getByRole('button', { name: 'Make it tax exempt' });
    expect(go).toBeDisabled();
    await user.type(screen.getByLabelText(/Organization's name/), 'Open Door Mission');
    expect(go).toBeDisabled(); // no number, no photo yet
    await user.type(screen.getByLabelText(/certificate number/), '05-123456');
    await user.click(go);
    expect(onSubmit).toHaveBeenCalledWith({ org: 'Open Door Mission', number: '05-123456', photo: null });
  });

  it('a photo of the certificate is enough when there is no number', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<TaxExemptDialog open pending={false} error="" onSubmit={onSubmit} onCancel={() => undefined} />);
    await user.type(screen.getByLabelText(/Organization's name/), 'Scout Troop 12');
    const file = new File(['jpeg'], 'cert.jpg', { type: 'image/jpeg' });
    await user.upload(screen.getByTestId('tax-exempt-photo'), file);
    await user.click(screen.getByRole('button', { name: 'Make it tax exempt' }));
    expect(onSubmit).toHaveBeenCalledWith({ org: 'Scout Troop 12', number: '', photo: file });
  });

  it('the receipt and screens say who it is for', () => {
    const cart = {
      id: 1, status: 'completed', subtotal: '20.00', tax_amount: '0.00', total: '20.00', payment_method: 'cash',
      cash_tendered: '20.00', change_given: '0.00', card_amount: null, completed_at: '2026-10-21T17:00:00Z',
      created_at: '2026-10-21T17:00:00Z', lines: [], cashier_name: 'Pat',
      tax_exempt_at: '2026-10-21T16:59:00Z', tax_exempt_org: 'Open Door Mission', tax_exempt_number: '05-123456',
    } as unknown as Cart;
    expect(taxExemptText(cart)).toBe('Tax exempt: Open Door Mission #05-123456');
    expect(buildReceiptData(cart).tax_exempt).toBe('Tax exempt: Open Door Mission #05-123456');
    expect(buildReceiptData({ ...cart, tax_exempt_at: null }).tax_exempt).toBeUndefined();
  });
});
