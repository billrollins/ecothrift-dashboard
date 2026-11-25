import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SnackbarProvider } from 'notistack';
import { useRef, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ManifestField, RowEditActions } from './ProcessingActiveCard';
import { ManifestFieldNavProvider } from './manifestFieldNav';
import {
  ROW_EDIT_FIELDS,
  ROW_EDIT_LABELS,
  patchFor,
  pendingFields,
  revertField,
  shownValues,
  stageValue,
  type RowEditField,
  type RowEditValues,
  type RowPending,
} from './processingRowEdits';

vi.mock('../../../api/client', () => ({ default: { get: vi.fn(), post: vi.fn() } }));

const SAVED: RowEditValues = { title: 'Alkaline Batteries', brand: '', model: '', category: '', unitRetail: '9.54', price: '4.99' };

/** The row's fields wired the way the row card wires them, without the rest of the card. */
function Row({ onSave, fields = [...ROW_EDIT_FIELDS] }: { onSave: (patch: Record<string, string>) => void; fields?: RowEditField[] }) {
  const [pending, setPendingState] = useState<RowPending>({});
  const ref = useRef<RowPending>({});
  const setPending = (next: RowPending) => {
    ref.current = next;
    setPendingState(next);
  };
  const shown = shownValues(SAVED, pending);
  const apply = (values: RowPending = ref.current) => {
    if (!pendingFields(values).length) return;
    onSave(patchFor(values));
    setPending({});
  };
  return (
    <ManifestFieldNavProvider>
      {fields.filter((f) => f !== 'category').map((f) => (
        <ManifestField
          key={f}
          fieldId={f}
          label={ROW_EDIT_LABELS[f]}
          currency={f === 'unitRetail' || f === 'price'}
          value={shown[f]}
          changed={f in pending}
          onStage={(v) => setPending(stageValue(ref.current, SAVED, f, v))}
          onApply={(v) => apply(stageValue(ref.current, SAVED, f, v))}
          onRevert={() => setPending(revertField(ref.current, f))}
        />
      ))}
      <RowEditActions count={pendingFields(pending).length} busy={false} onApply={() => apply()} onCancel={() => setPending({})} />
    </ManifestFieldNavProvider>
  );
}

function show(node: React.ReactNode) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <SnackbarProvider>{node}</SnackbarProvider>
    </QueryClientProvider>,
  );
}

const field = (id: RowEditField) => screen.getByTestId(`row-field-${id}`);

describe('typing in the manifest row fields (#230)', () => {
  it('Tab moves on and leaves the change highlighted, not saved', async () => {
    const onSave = vi.fn();
    show(<Row onSave={onSave} />);
    const user = userEvent.setup();
    await user.click(field('title'));
    await user.keyboard('Energizer MAX 9V{Tab}');
    expect(field('title')).toHaveAttribute('data-changed', 'true');
    expect(field('title')).toHaveTextContent('Energizer MAX 9V');
    expect(onSave).not.toHaveBeenCalled();
    // The cursor is in the next field, left to right.
    await waitFor(() => expect(field('brand')).toHaveAttribute('data-editing', 'true'));
    expect(screen.getByRole('textbox', { name: 'Brand' })).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Apply 1 change' })).toBeEnabled();
  });

  it('Enter saves every highlighted change in one request and moves on', async () => {
    const onSave = vi.fn();
    show(<Row onSave={onSave} />);
    const user = userEvent.setup();
    await user.click(field('title'));
    await user.keyboard('Energizer MAX 9V{Tab}');
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Brand' })).toHaveFocus());
    await user.keyboard('Energizer{Enter}');
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith({ title: 'Energizer MAX 9V', brand: 'Energizer' });
    await waitFor(() => expect(field('model')).toHaveAttribute('data-editing', 'true'));
    expect(field('title')).not.toHaveAttribute('data-changed');
  });

  it('the X puts that one field back; Cancel all puts them all back', async () => {
    const onSave = vi.fn();
    show(<Row onSave={onSave} />);
    const user = userEvent.setup();
    await user.click(field('title'));
    await user.keyboard('Wrong{Tab}');
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Brand' })).toHaveFocus());
    await user.keyboard('Wrong brand{Tab}');
    expect(screen.getByRole('button', { name: 'Apply 2 changes' })).toBeEnabled();

    await user.click(field('title'));
    await user.click(screen.getByRole('button', { name: 'Put Title back' }));
    expect(field('title')).toHaveTextContent('Alkaline Batteries');
    expect(field('title')).not.toHaveAttribute('data-changed');
    expect(field('brand')).toHaveAttribute('data-changed', 'true');

    await user.click(screen.getByRole('button', { name: 'Cancel all' }));
    expect(field('brand')).not.toHaveAttribute('data-changed');
    expect(screen.getByRole('button', { name: 'Apply changes' })).toBeDisabled();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('Esc only stops the typing: what was highlighted stays as it was', async () => {
    show(<Row onSave={vi.fn()} />);
    const user = userEvent.setup();
    await user.click(field('brand'));
    await user.keyboard('Energizer{Tab}');
    await user.click(field('brand'));
    await user.keyboard('zzz{Escape}');
    expect(field('brand')).toHaveTextContent('Energizer');
    expect(field('brand')).toHaveAttribute('data-changed', 'true');
  });

  it('after the last field, Tab lands on Apply changes; pressing it saves', async () => {
    const onSave = vi.fn();
    show(<Row onSave={onSave} />);
    const user = userEvent.setup();
    await user.click(field('price'));
    await user.keyboard('3.99{Tab}');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Apply 1 change' })).toHaveFocus());
    await user.keyboard('{Enter}');
    expect(onSave).toHaveBeenCalledWith({ shelf_price: '3.99' });
  });

  it('a value typed back to what is saved is not a change', async () => {
    show(<Row onSave={vi.fn()} />);
    const user = userEvent.setup();
    await user.click(field('price'));
    await user.keyboard('4.990{Tab}');
    expect(field('price')).not.toHaveAttribute('data-changed');
    expect(screen.getByRole('button', { name: 'Apply changes' })).toBeDisabled();
  });
});
