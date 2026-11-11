import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CleanUpResponse } from '../../../api/addItem.api';
import { AddItemNewProductStep, type FormState } from './AddItemNewProductStep';
import { emptyForm } from './addItemModel';

const api = vi.hoisted(() => ({
  cleanUpWithAi: vi.fn(),
  getAddItemTaxonomy: vi.fn(),
}));
vi.mock('../../../api/addItem.api', () => api);

const ANSWER: CleanUpResponse = {
  values: {
    title: 'Keurig K-Mini Coffee Maker', short_name: 'Keurig K-Mini', brand: 'Keurig', model: 'K-Mini',
    category: 'Kitchen & dining', subcategory: 'Small appliances', upc: '', condition: 'like_new', price: '18.00',
    retail_estimate: '89.99', tags: ['coffee'], identifiers: {}, specifications: { Color: 'Black' },
  },
  filled: ['title', 'short_name', 'brand', 'model', 'category', 'subcategory', 'condition', 'price', 'retail_estimate',
    'tags', 'specifications'],
  problems: [], confidence: 'high', price_from: 'the AI', model: 'muse-spark-1.3-contributor',
};

let last: FormState | null = null;

function Harness({ anything = '' }: { anything?: string }) {
  const [state, setState] = useState<FormState>({ form: emptyForm('ai', anything), marks: {} });
  last = state;
  const [photos, setPhotos] = useState<File[]>([]);
  return (
    <AddItemNewProductStep state={state} onStateChange={setState} photos={photos} onPhotosChange={setPhotos}
      copiedFrom={null} onBack={() => {}} onNext={() => {}} />
  );
}

function show(anything = '') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><Harness anything={anything} /></QueryClientProvider>);
}

describe('Add item: Clean up with AI', () => {
  beforeEach(() => {
    api.cleanUpWithAi.mockReset();
    api.getAddItemTaxonomy.mockResolvedValue([{ name: 'Kitchen & dining', subcategories: ['Small appliances'] }]);
  });

  it('with nothing at all, says so in plain words and calls no AI', async () => {
    show();
    await userEvent.click(screen.getByRole('button', { name: 'Clean up with AI' }));
    expect(screen.getByText(/something to go on/)).toBeInTheDocument();
    expect(api.cleanUpWithAi).not.toHaveBeenCalled();
  });

  it('sends the big box and the typed boxes, fills the rest with AI marks, and the mark is a way back', async () => {
    api.cleanUpWithAi.mockResolvedValue(ANSWER);
    show('keurig mini, open box');
    await userEvent.type(screen.getByLabelText('Brand'), 'Keurig Co');
    await userEvent.click(screen.getByRole('button', { name: 'Clean up with AI' }));
    await waitFor(() => expect(screen.getByLabelText(/^Title/)).toHaveValue('Keurig K-Mini Coffee Maker'));
    expect(api.cleanUpWithAi).toHaveBeenCalledWith('keurig mini, open box', { brand: 'Keurig Co' }, []);
    expect(screen.getByLabelText('Brand')).toHaveValue('Keurig Co');          // typed wins
    expect(screen.getByText(/The AI filled/)).toBeInTheDocument();
    expect(last?.marks.brand).toBeUndefined();
    expect(last?.marks.title?.viewing).toBe('ai');

    await userEvent.click(screen.getByRole('button', { name: 'Original' }));
    expect(screen.getByLabelText(/^Title/)).toHaveValue('');
    await userEvent.click(screen.getByRole('button', { name: 'AI values' }));
    expect(screen.getByLabelText(/^Title/)).toHaveValue('Keurig K-Mini Coffee Maker');
  });

  it('a failed AI call says so plainly and leaves every box as it was', async () => {
    api.cleanUpWithAi.mockRejectedValue({ response: { data: { detail: 'The AI could not clean this one up right now. Your boxes are as you left them.' } } });
    show('keurig');
    await userEvent.type(screen.getByLabelText('Model'), 'K-Mini');
    await userEvent.click(screen.getByRole('button', { name: 'Clean up with AI' }));
    expect(await screen.findByText(/as you left them/)).toBeInTheDocument();
    expect(screen.getByLabelText('Model')).toHaveValue('K-Mini');
    expect(screen.getByLabelText(/^Title/)).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Clean up with AI' })).toBeEnabled();
  });
});
