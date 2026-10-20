import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { PayLevelField } from './PayLevelField';
import { OverHoursAlert, OverHoursChip } from './OverHoursFlag';

vi.mock('../../api/accounts.api', () => ({
  getPayLevels: vi.fn(async () => ({ data: { levels: [] } })),
}));

function wrap(node: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>{node}</MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('PayLevelField', () => {
  it('shows the range under the field when the pay fits the level', () => {
    wrap(<PayLevelField value="entry" pay="16.50" onChange={() => {}} />);
    expect(screen.getByText('$15 to $17 an hour')).toBeInTheDocument();
  });

  it('warns, and does not block, when the pay is outside the level range', () => {
    wrap(<PayLevelField value="entry" pay="18.50" onChange={() => {}} />);
    expect(
      screen.getByText('$18.50 an hour is outside the Entry range ($15 to $17). You can still save it.'),
    ).toBeInTheDocument();
  });

  it('warns for a pay between two ranges too', () => {
    wrap(<PayLevelField value="senior" pay="17.50" onChange={() => {}} />);
    expect(screen.getByText(/outside the Senior range/)).toBeInTheDocument();
  });
});

describe('over their hours flag', () => {
  const flag = {
    hours: '43.2',
    limit: '40',
    text: 'Over their hours: 43.2 of 40. Forgot to clock out? Fix the time entry.',
    link: '/admin/time-payroll?employee=7',
  };

  it('is a red alert with the words and a link to their time entries', () => {
    wrap(<OverHoursAlert flag={flag} />);
    expect(screen.getByTestId('over-hours-flag')).toHaveTextContent(flag.text);
    expect(screen.getByRole('link', { name: 'Time entries' })).toHaveAttribute('href', flag.link);
  });

  it('is a small red chip on a row', () => {
    wrap(<OverHoursChip flag={flag} />);
    const chip = screen.getByTestId('over-hours-chip');
    expect(chip).toHaveTextContent('Over hours 43.2/40');
    expect(chip).toHaveAttribute('href', flag.link);
  });
});
