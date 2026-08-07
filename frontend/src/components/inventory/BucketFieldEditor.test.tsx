import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { describe, expect, it, vi } from 'vitest';
import { BucketFieldEditor } from './BucketFieldEditor';

function renderEditor(ui: ReactElement) {
  return render(<ThemeProvider theme={createTheme()}>{ui}</ThemeProvider>);
}

describe('BucketFieldEditor', () => {
  it('does not save when subkey fails regex validation', async () => {
    // delay: null removes per-event waits - this test hit the 5s timeout on cold runs.
    const user = userEvent.setup({ delay: null });
    const onSave = vi.fn();
    renderEditor(
      <BucketFieldEditor
        open
        bucketId="tracking"
        bucketMeta={{
          label: 'Tracking',
          suggested_keys: ['lot_id'],
          open: true,
        }}
        headers={['Lot']}
        formulas={{}}
        onClose={() => {}}
        onSave={onSave}
      />,
    );

    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: /add field/i }));
    const fieldNameInput = within(dialog).getAllByPlaceholderText(/warehouse_zone/i)[0];
    const formulaInput = within(dialog).getByPlaceholderText('e.g. TITLE([Lot])');
    fireEvent.change(fieldNameInput, { target: { value: 'InvalidUpper' } });
    fireEvent.change(formulaInput, { target: { value: 'TRIM([Lot])' } });

    await waitFor(() => {
      expect((formulaInput as HTMLInputElement).value).toBe('TRIM([Lot])');
    });

    await user.click(within(dialog).getByRole('button', { name: /^save$/i }));
    expect(within(dialog).getByText(/got "InvalidUpper"/)).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('saves valid custom subkeys with trimmed formulas', async () => {
    // delay: null removes per-event waits - this test hit the 5s timeout on cold runs.
    const user = userEvent.setup({ delay: null });
    const onSave = vi.fn();
    renderEditor(
      <BucketFieldEditor
        open
        bucketId="tracking"
        bucketMeta={{
          label: 'Tracking',
          suggested_keys: [],
          open: true,
        }}
        headers={['Lot']}
        formulas={{}}
        onClose={() => {}}
        onSave={onSave}
      />,
    );

    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: /add field/i }));
    const fieldNameInput = within(dialog).getAllByPlaceholderText(/warehouse_zone/i)[0];
    const formulaInput = within(dialog).getByPlaceholderText('e.g. TITLE([Lot])');
    fireEvent.change(fieldNameInput, { target: { value: 'warehouse_zone' } });
    fireEvent.change(formulaInput, { target: { value: 'TRIM([Lot])' } });

    await waitFor(() => {
      expect((fieldNameInput as HTMLInputElement).value).toBe('warehouse_zone');
      expect((formulaInput as HTMLInputElement).value).toBe('TRIM([Lot])');
    });

    await user.click(within(dialog).getByRole('button', { name: /^save$/i }));
    expect(onSave).toHaveBeenCalledWith([
      { target: 'tracking.warehouse_zone', formula: 'TRIM([Lot])' },
    ]);
  });
});
