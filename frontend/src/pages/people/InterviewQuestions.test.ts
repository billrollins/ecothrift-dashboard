import { describe, expect, it } from 'vitest';
import type { Question } from '../../api/hiring.api';
import { applyProposal, type Proposal } from './InterviewQuestions';

const q = (key: string, label: string): Question => ({ key, label, type: 'text', required: false });

describe('interview questions: the ticked AI changes (owner 2026-10-12)', () => {
  const value = [q('hard', 'Tell me about a hard customer.'), q('why', 'Why us?'), q('lift', 'Can you lift 50 pounds?')];
  const proposal: Proposal = {
    summary: '',
    questions: [
      { key: 'hard', label: 'Tell me about a hard customer.', change: 'keep', was: '', why: '' },
      { key: 'why', label: 'What makes this a place you want to work?', change: 'edit', was: 'Why us?', why: '' },
      { key: '', label: 'How would you sort a cart of donations?', change: 'new', was: '', why: '' },
    ],
    removed: [{ key: 'lift', label: 'Can you lift 50 pounds?', why: '' }],
  };

  it('takes everything ticked: the reworded one keeps its key, the new one gets one, the drop goes', () => {
    const out = applyProposal(value, proposal, new Set(['1', '2', 'rm:lift']));
    expect(out.map((x) => x.key)).toEqual(['hard', 'why', 'q_how_would_you_sort_a_cart_of_d']);
    expect(out[1].label).toBe('What makes this a place you want to work?');
  });

  it('leaves out what is unticked: the old wording stays, no new one, the drop stays at the end', () => {
    const out = applyProposal(value, proposal, new Set());
    expect(out.map((x) => x.label)).toEqual(['Tell me about a hard customer.', 'Why us?', 'Can you lift 50 pounds?']);
  });
});
