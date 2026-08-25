import { describe, expect, it } from 'vitest';
import { BENCH_SEND_BACK, benchSendBackReady } from './sendBackReasons';

describe('bench send-back', () => {
  it('offers Not Ready, a question, and a grades disagreement', () => {
    expect(BENCH_SEND_BACK.map((item) => item.id)).toEqual(['not_ready', 'question', 'grades']);
    expect(BENCH_SEND_BACK.find((item) => item.id === 'not_ready')?.noteRequired).toBe(false);
    expect(BENCH_SEND_BACK.find((item) => item.id === 'question')?.markProcessing).toBe(true);
    expect(BENCH_SEND_BACK.find((item) => item.id === 'grades')?.noteRequired).toBe(true);
  });

  it('lets Not Ready go without a note, and requires a note for the Processing marks', () => {
    expect(benchSendBackReady(null, '')).toBe(false);
    expect(benchSendBackReady('not_ready', '')).toBe(true);
    expect(benchSendBackReady('question', '')).toBe(false);
    expect(benchSendBackReady('question', 'Does this power on?')).toBe(true);
    expect(benchSendBackReady('grades', '')).toBe(false);
    expect(benchSendBackReady('grades', 'Working is too high')).toBe(true);
  });
});
