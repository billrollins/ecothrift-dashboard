import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FreshTagItem, FreshTagsResponses } from '../../../api/routines.api';
import { answerFreshItem, freshTagMisses, freshTagsChecked, freshTagsLeft, hasTagRetail } from './freshTags';
import { FreshTagsRunner, freshDayLabel, freshProgressLabel } from './FreshTagsRunner';
import { KindRunner } from './KindRunner';
import { issuesFound, runnerBlockers, submitLabel } from './runnerStatus';

const auth = vi.hoisted(() => ({ language: 'en' as 'en' | 'es' }));
vi.mock('../../../hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 1, role: 'Employee', is_superuser: false, language: auth.language } }),
}));

function item(over: Partial<FreshTagItem> = {}): FreshTagItem {
  return {
    item_id: 1,
    sku: 'ITM0000101',
    title: 'Brass lamp',
    brand: 'Pottery Barn',
    price: '14.00',
    retail: '70.00',
    tag_retail: '70.00',
    location: 'Aisle 3',
    checked_in_by: 'Maria',
    found: '',
    match: '',
    retail_ok: '',
    price_ok: '',
    note: '',
    ...over,
  };
}

function run(items: FreshTagItem[]): FreshTagsResponses {
  return { items, checked_in_day: '2026-10-20' };
}

describe('fresh-tag answers', () => {
  it('counts an item as checked when not found, or found with all three answers', () => {
    const r = run([
      item({ item_id: 1, found: 'no' }),
      item({ item_id: 2, found: 'yes', match: 'pass', retail_ok: 'pass', price_ok: 'pass' }),
      item({ item_id: 3, found: 'yes', match: 'pass', retail_ok: 'pass' }),
      item({ item_id: 4 }),
    ]);
    expect(freshTagsChecked(r)).toBe(2);
    expect(freshTagsLeft(r)).toBe(2);
  });

  it('counts one bad tag per failed check on found items only (like kinds.fresh_tag_misses)', () => {
    const r = run([
      item({ item_id: 1, found: 'yes', match: 'fail', retail_ok: 'fail', price_ok: 'low' }),
      item({ item_id: 2, found: 'yes', match: 'pass', retail_ok: 'na', price_ok: 'high' }),
      item({ item_id: 3, found: 'no', match: 'fail', price_ok: 'high' }),
    ]);
    expect(freshTagMisses(r)).toBe(4);
  });

  it("clears the checks on Can't find, and answers retail n.a. when the tag shows none", () => {
    const answered = run([item({ found: 'yes', match: 'fail', retail_ok: 'pass', price_ok: 'pass' })]);
    const lost = answerFreshItem(answered, 1, { found: 'no' });
    expect(lost.items[0]).toMatchObject({ found: 'no', match: '', retail_ok: '', price_ok: '' });

    const bare = run([item({ tag_retail: null, retail: null })]);
    expect(hasTagRetail(bare.items[0])).toBe(false);
    expect(answerFreshItem(bare, 1, { found: 'yes' }).items[0].retail_ok).toBe('na');
    expect(answerFreshItem(run([item()]), 1, { found: 'yes' }).items[0].retail_ok).toBe('');
  });

  it('mirrors the server blockers and labels Submit with what goes to PR Fix-it', () => {
    const open = run([item(), item({ item_id: 2 })]);
    expect(runnerBlockers('fresh_tags', open, 0)).toEqual(['2 items left to check']);
    const done = run([
      item({ found: 'yes', match: 'pass', retail_ok: 'pass', price_ok: 'high' }),
      item({ item_id: 2, found: 'no' }),
    ]);
    expect(runnerBlockers('fresh_tags', done, 0)).toEqual([]);
    expect(submitLabel('fresh_tags', done, 0)).toBe('Submit · 1 to PR Fix-it');
    expect(issuesFound('fresh_tags', done)).toBe(1);
    expect(runnerBlockers('fresh_tags', run([]), 0)).toEqual([]);
    expect(submitLabel('fresh_tags', run([]), 0)).toBe('Submit · tags look right');
  });

  it('labels progress and the tag day', () => {
    const r = run([item({ found: 'yes', match: 'fail', retail_ok: 'pass', price_ok: 'pass' }), item({ item_id: 2 })]);
    expect(freshProgressLabel(r, 'en')).toBe('1 of 2 checked · 1 to PR Fix-it');
    expect(freshProgressLabel(r, 'es')).toBe('1 de 2 revisados · 1 a PR Fix-it');
    expect(freshDayLabel(null, 'en')).toBe('');
    expect(freshDayLabel('2026-10-20', 'en')).toMatch(/Oct/);
  });
});

describe('FreshTagsRunner', () => {
  beforeEach(() => {
    auth.language = 'en';
  });

  it('lists the drawn items with what the tag shows, and answers Found it', () => {
    const onChange = vi.fn();
    render(<FreshTagsRunner title="Fresh-tag check" subject="" responses={run([item()])} onChange={onChange} />);
    expect(screen.getByText('Brass lamp')).toBeInTheDocument();
    expect(screen.getByText('Aisle 3 · ITM0000101')).toBeInTheDocument();
    expect(screen.getByText(/retail \$70\.00/)).toBeInTheDocument();
    expect(screen.getByText('0 of 1 checked')).toBeInTheDocument();
    // The three checks wait for Found it.
    expect(screen.getByRole('button', { name: 'Too high' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Found it' }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      items: [expect.objectContaining({ item_id: 1, found: 'yes' })],
    }));
  });

  it('opens the checks once found, and locks retail to n.a. on a tag with none', () => {
    const onChange = vi.fn();
    render(
      <FreshTagsRunner
        title="Fresh-tag check"
        subject=""
        responses={run([item({ found: 'yes', tag_retail: null, retail_ok: 'na' })])}
        onChange={onChange}
      />,
    );
    const retail = screen.getByRole('group', { name: 'Retail believable' });
    expect(retail.querySelectorAll('button')[0]).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Too low' }));
    expect(onChange.mock.calls[0][0].items[0].price_ok).toBe('low');
  });

  it('says so when nothing was drawn, in Spanish too', () => {
    auth.language = 'es';
    render(<KindRunner kind="fresh_tags" title="Revision" subject="" responses={{ items: [], checked_in_day: null }} taxonomy={null} verify={null} minItems={0} />);
    expect(screen.getAllByText('No se registro nada recientemente').length).toBeGreaterThan(0);
  });

  it('is read only after submit', () => {
    render(
      <FreshTagsRunner
        title="Fresh-tag check"
        subject=""
        readOnly
        responses={run([item({ found: 'yes', match: 'pass', retail_ok: 'pass', price_ok: 'pass' })])}
      />,
    );
    expect(screen.getByRole('button', { name: 'Found it' })).toBeDisabled();
    expect(screen.getByPlaceholderText('Note (optional)')).toBeDisabled();
  });
});
