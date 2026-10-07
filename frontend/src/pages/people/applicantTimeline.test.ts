import { describe, expect, it } from 'vitest';
import type { ApplicationRow, Stage } from '../../api/hiring.api';
import { daysSince, groupByStage, rowHint, sortForStage, todaysInterviews, whenText } from './applicantTimeline';

const NOW = new Date(2026, 9, 7, 9, 0); // Wed Oct 7 2026, 9:00 local

function row(id: number, stage: Stage, extra: Partial<ApplicationRow> = {}): ApplicationRow {
  return {
    id, first_name: `P${id}`, last_name: 'X', full_name: `P${id} X`, email: '', phone: '', jobs: [], stage,
    stage_label: stage, stage_changed_at: null, rating: null, red_flags: 0, flags: [], source: 'web', source_label: 'Careers page',
    has_resume: false, lead_interest: '', employee_user: null, not_now_reason: '', is_practice: false,
    created_at: new Date(2026, 9, 1, 12).toISOString(), next_interview: null, offer_status: '', ...extra,
  };
}

const at = (d: number, h = 12, m = 0) => new Date(2026, 9, d, h, m).toISOString();

describe('applicant timeline', () => {
  it('counts calendar days, not 24-hour blocks', () => {
    expect(daysSince(at(7, 8), NOW)).toBe(0);
    expect(daysSince(at(6, 23), NOW)).toBe(1);
    expect(daysSince(at(4), NOW)).toBe(3);
    expect(daysSince(null, NOW)).toBe(0);
  });

  it('says when an interview is in words', () => {
    expect(whenText(at(7, 14), NOW)).toMatch(/^Today /);
    expect(whenText(at(8, 10), NOW)).toMatch(/^Tomorrow /);
    expect(whenText(at(9, 10), NOW)).toMatch(/^Fri /);
    expect(whenText(at(20, 10), NOW)).toMatch(/Oct 20/);
  });

  it('hints: interview time, offer status, days waiting (amber when long)', () => {
    expect(rowHint(row(1, 'interview_scheduled', { next_interview: at(7, 14) }), NOW).tone).toBe('now');
    expect(rowHint(row(2, 'offer', { offer_status: 'viewed' }), NOW).text).toBe('Opened');
    expect(rowHint(row(3, 'offer', { offer_status: 'signed' }), NOW).tone).toBe('good');
    expect(rowHint(row(4, 'new', { stage_changed_at: at(7, 8) }), NOW)).toEqual({ text: 'today', tone: 'plain' });
    expect(rowHint(row(5, 'new', { stage_changed_at: at(4) }), NOW)).toEqual({ text: '3d', tone: 'warn' });
    expect(rowHint(row(6, 'contacted', { stage_changed_at: at(4) }), NOW).tone).toBe('plain');
    expect(rowHint(row(7, 'hired', { stage_changed_at: at(2) }), NOW).text).toMatch(/Oct 2/);
  });

  it('orders: next interview first, the longest wait first, hired newest first', () => {
    const booked = [
      row(1, 'interview_scheduled', { next_interview: at(9, 10) }),
      row(2, 'interview_scheduled', { next_interview: at(8, 10) }),
      row(3, 'interview_scheduled'),
    ];
    expect(sortForStage('interview_scheduled', booked).map((r) => r.id)).toEqual([2, 1, 3]);
    const fresh = [row(1, 'new', { stage_changed_at: at(6) }), row(2, 'new', { stage_changed_at: at(3) })];
    expect(sortForStage('new', fresh).map((r) => r.id)).toEqual([2, 1]);
    const hired = [row(1, 'hired', { stage_changed_at: at(3) }), row(2, 'hired', { stage_changed_at: at(6) })];
    expect(sortForStage('hired', hired).map((r) => r.id)).toEqual([2, 1]);
  });

  it('groups by stage and finds today’s interviews', () => {
    const rows = [
      row(1, 'new'),
      row(2, 'interview_scheduled', { next_interview: at(7, 15) }),
      row(3, 'interview_scheduled', { next_interview: at(7, 10) }),
      row(4, 'interview_scheduled', { next_interview: at(8, 10) }),
    ];
    const groups = groupByStage(rows);
    expect(groups.new?.length).toBe(1);
    expect(groups.interview_scheduled?.map((r) => r.id)).toEqual([3, 2, 4]);
    expect(todaysInterviews(rows, NOW).map((r) => r.id)).toEqual([3, 2]);
  });
});
