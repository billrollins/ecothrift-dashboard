import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import type { BadTagSummary } from '../../../api/badTags.api';
import { TagErrorsSummaryBody, tagErrorsBadgeText, topReason } from './TagErrorsPanel';

const SUMMARY: BadTagSummary = {
  week_start: '2026-10-19',
  total: 5,
  open: 3,
  by_reason: [
    { key: 'retail_high', label: 'Retail overstated', count: 3 },
    { key: 'wrong_item', label: 'Wrong item', count: 2 },
    { key: 'price_high', label: 'Price too high', count: 0 },
    { key: 'price_low', label: 'Price too low', count: 0 },
    { key: 'missing', label: 'Tag missing or unreadable', count: 0 },
  ],
  by_processor: [
    { user_id: 4, name: 'Maria', count: 4, by_reason: { retail_high: 3, wrong_item: 1 }, checked_in_this_week: 160 },
    { user_id: null, name: 'Unknown', count: 1, by_reason: { wrong_item: 1 }, checked_in_this_week: 0 },
  ],
  by_truck: [
    { purchase_order_id: 12, order_number: '1234', count: 4, by_reason: { retail_high: 3, wrong_item: 1 } },
    { purchase_order_id: null, order_number: 'No truck', count: 1, by_reason: { wrong_item: 1 } },
  ],
};

function show(summary: BadTagSummary) {
  render(
    <MemoryRouter>
      <TagErrorsSummaryBody week="2026-W43" summary={summary} />
    </MemoryRouter>,
  );
}

describe('Retail QA Tag errors panel', () => {
  it('shows the totals, the reasons found, and a rate per 100 tags', () => {
    show(SUMMARY);
    expect(screen.getByText('Found this week').previousSibling).toHaveTextContent('5');
    expect(screen.getByText('Open on PR Fix-it').previousSibling).toHaveTextContent('3');
    expect(screen.getByLabelText('By reason')).toHaveTextContent('Retail overstated 3');
    expect(screen.queryByText(/Price too high/)).toBeNull();
    expect(screen.getByText('2.5')).toBeInTheDocument();
  });

  it('links each processor and truck to the Tag errors page for the week', () => {
    show(SUMMARY);
    expect(screen.getByRole('link', { name: 'Maria' })).toHaveAttribute('href', '/inventory/tag-errors?week=2026-W43&processor=4');
    expect(screen.getByRole('link', { name: '1234' })).toHaveAttribute('href', '/inventory/tag-errors?week=2026-W43&po=12');
    // No person or truck behind a row: nothing to link to.
    expect(screen.queryByRole('link', { name: 'Unknown' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'No truck' })).toBeNull();
    expect(screen.getByRole('link', { name: /See every tag error/ })).toHaveAttribute('href', '/inventory/tag-errors?week=2026-W43');
  });

  it('says so on a clean week', () => {
    show({ ...SUMMARY, total: 0, open: 0, by_processor: [], by_truck: [], by_reason: SUMMARY.by_reason.map((r) => ({ ...r, count: 0 })) });
    expect(screen.getByText('No tag errors found this week.')).toBeInTheDocument();
    expect(screen.queryByText('By processor')).toBeNull();
  });

  it('words the header badge', () => {
    expect(tagErrorsBadgeText(undefined)).toBe('-');
    expect(tagErrorsBadgeText({ total: 0, open: 0 })).toBe('None found');
    expect(tagErrorsBadgeText({ total: 5, open: 3 })).toBe('5 · 3 open');
    expect(tagErrorsBadgeText({ total: 5, open: 0 })).toBe('5 · all fixed');
    expect(topReason({ retail_high: 1, wrong_item: 3 })).toBe('Wrong item');
    expect(topReason({})).toBe('');
  });
});
