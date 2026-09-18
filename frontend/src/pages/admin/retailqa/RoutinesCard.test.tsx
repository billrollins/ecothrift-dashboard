import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
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
});
