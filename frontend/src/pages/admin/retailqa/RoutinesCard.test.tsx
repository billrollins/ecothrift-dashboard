import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { QaJob } from '../../../api/routines.api';
import { RoutinesCard } from './RoutinesCard';

const JOB: QaJob = {
  group: 'shift',
  key: 'retail.open',
  title: 'Opening checklist',
  run_id: 21,
  section_id: null,
  owner: null,
  due_at: null,
  due_label: 'Due 08:30',
  status: 'Due',
  closed: false,
  can_close: false,
};

const MISSED: QaJob = { ...JOB, owner: { id: 4, name: 'Sam Lee' }, status: 'Missed', urgency: 'missed' };

describe('RoutinesCard', () => {
  it('labels the Open Day Close group Checklists', () => {
    render(
      <RoutinesCard
        date="2026-09-16"
        jobs={[JOB]}
        people={[]}
        onAssign={() => {}}
        onNudge={() => {}}
        onWeekView={() => {}}
      />,
    );
    expect(screen.getByText('Checklists')).toBeInTheDocument();
  });

  it('gives a superuser Mark done and Forgive on a missed routine, and no Nudge', () => {
    const onResolve = vi.fn();
    render(
      <RoutinesCard
        date="2026-10-05"
        jobs={[MISSED]}
        people={[]}
        onAssign={() => {}}
        onNudge={() => {}}
        onResolve={onResolve}
        onWeekView={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Missed/ }));
    expect(screen.queryByText('Nudge')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Forgive'));
    expect(onResolve).toHaveBeenCalledWith(expect.objectContaining({ run_id: 21 }), 'forgiven');
  });

  it('offers Mark done on any past-due row, even one with no run behind it', () => {
    const onResolve = vi.fn();
    render(
      <RoutinesCard
        date="2026-10-05"
        jobs={[{ ...MISSED, run_id: null, owner: null }]}
        people={[]}
        onAssign={() => {}}
        onNudge={() => {}}
        onResolve={onResolve}
        canNudge={false}
        onWeekView={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Missed/ }));
    fireEvent.click(screen.getByText('Mark done'));
    expect(onResolve).toHaveBeenCalledWith(expect.objectContaining({ key: 'retail.open', run_id: null }), 'done');
  });

  it('offers no Nudge on a missed routine to anyone else either', () => {
    render(
      <RoutinesCard
        date="2026-10-05"
        jobs={[MISSED]}
        people={[]}
        onAssign={() => {}}
        onNudge={() => {}}
        onWeekView={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Missed/ }));
    expect(screen.queryByText('Nudge')).not.toBeInTheDocument();
    expect(screen.queryByText('Mark done')).not.toBeInTheDocument();
    expect(screen.getByText('Reassign')).toBeInTheDocument();
  });

  it('shows who cleared a routine', () => {
    render(
      <RoutinesCard
        date="2026-10-05"
        jobs={[{ ...MISSED, status: 'Done', urgency: null, resolved: { kind: 'forgiven', label: 'Forgiven', by_name: 'Bill Rollins' } }]}
        people={[]}
        onAssign={() => {}}
        onNudge={() => {}}
        onWeekView={() => {}}
      />,
    );
    fireEvent.click(screen.getByText(/All 1 done/));
    expect(screen.getByText(/^Forgiven by /)).toBeInTheDocument();
  });
});
