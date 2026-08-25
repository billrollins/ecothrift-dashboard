import { describe, expect, it } from 'vitest';
import {
  emptyMainOutput,
  emptyPartOutput,
  finishMainNoteReady,
  lowestGrade,
} from './finishNotes';

describe('finish output lines', () => {
  it('starts with a main line that carries a destination', () => {
    expect(emptyMainOutput('ITM0001')).toEqual({
      seq: 0,
      label: 'ITM0001',
      notes: '',
      destination: 'processing',
    });
    expect(emptyPartOutput(1, 'salvage')).toEqual({
      seq: 1,
      label: '',
      notes: '',
      destination: 'salvage',
    });
  });
});

describe('finishMainNoteReady', () => {
  it('requires a note when nothing was done', () => {
    expect(finishMainNoteReady('', false)).toBe(false);
    expect(finishMainNoteReady('   ', false)).toBe(false);
    expect(finishMainNoteReady('Recalled', false)).toBe(true);
  });

  it('lets a worked item leave without a dispatch note', () => {
    expect(finishMainNoteReady('', true)).toBe(true);
  });
});

describe('lowestGrade', () => {
  it('returns the cheapest priced grade', () => {
    expect(lowestGrade({ Working: 40, Repairable: 18, 'Parts-only': 5 })).toBe('Parts-only');
    expect(lowestGrade({})).toBe('');
  });
});
