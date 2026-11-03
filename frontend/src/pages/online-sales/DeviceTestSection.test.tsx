import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { DeviceTest } from '../../api/webstore.api';
import { DeviceReportView, DeviceTestForm } from './DeviceTestSection';

function Harness({ seen }: { seen: DeviceTest[] }) {
  const [test, setTest] = useState<DeviceTest>({});
  return <DeviceTestForm test={test} testedLine={null} onChange={(t) => { seen.push(t); setTest(t); }} />;
}

describe('Phone test (Dash Updates #51)', () => {
  it('asks "Did we test it?" first; Yes opens the checks; Carrier locked = Yes asks which carrier', async () => {
    const seen: DeviceTest[] = [];
    const user = userEvent.setup();
    render(<Harness seen={seen} />);
    expect(screen.getByText('No test report on the listing.')).toBeInTheDocument();
    expect(screen.queryByText('Turns on')).toBeNull();
    await user.click(screen.getAllByRole('button', { name: 'Yes' })[0]);
    expect(screen.getByText('Turns on')).toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: 'Pass' })[0]);
    expect(seen.at(-1)).toMatchObject({ tested: true, powers_on: 'pass' });
    expect(screen.queryByLabelText('Which carrier')).toBeNull();
    const carrier = screen.getByRole('group', { name: 'Carrier locked?' });
    await user.click(carrier.querySelector('button[value="yes"]')!);
    expect(screen.getByLabelText('Which carrier')).toBeInTheDocument();
  });

  it('the report has a mark and words on every row', () => {
    render(<DeviceReportView report={{
      tested_on: '2026-11-03', note: 'Small scratch.',
      rows: [
        { key: 'powers_on', label: 'Turns on', result: 'Pass', tone: 'good' },
        { key: 'carrier_locked', label: 'Carrier lock', result: 'Locked to Verizon', tone: 'bad' },
        { key: 'charges', label: 'Charges', result: 'Not checked', tone: 'none' },
      ],
    }} />);
    expect(screen.getByText('Tested by Eco-Thrift on Nov 3, 2026')).toBeInTheDocument();
    expect(screen.getByText('Locked to Verizon').textContent).toBe('✗ Locked to Verizon');
    expect(screen.getByText('Pass').textContent).toBe('✓ Pass');
    expect(screen.getByText('Small scratch.')).toBeInTheDocument();
  });
});
