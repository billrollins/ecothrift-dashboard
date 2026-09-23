import { describe, expect, it } from 'vitest';
import {
  BURST_GAP_MS,
  EMPTY_SCAN_STATE,
  ENTER_STALE_MS,
  takeScanKey,
  type ScanResult,
  type ScanState,
} from './ScanInput';

/** Feed a list of [key, timestamp] and return the last result. */
function feed(keys: Array<[string, number]>): ScanResult {
  let state: ScanState = EMPTY_SCAN_STATE;
  let result: ScanResult = { kind: 'none' };
  for (const [key, now] of keys) {
    const step = takeScanKey(state, key, now);
    state = step.state;
    result = step.result;
  }
  return result;
}

/** A real card: 10 characters from 23456789ABCDEFGHJKMNPQRSTUVWXYZ. */
const CARD = '7K3MQP9XTB';
const LAST_CHAR_AT = 1_000 + (CARD.length - 1) * 10;

/** One wedge burst: a character every 10ms starting at `startAt`. */
function burst(token: string, startAt: number): Array<[string, number]> {
  return token.split('').map((ch, i): [string, number] => [ch, startAt + i * 10]);
}

describe('takeScanKey', () => {
  it('the reported bug: a pause before Enter no longer wipes the scan', () => {
    const keys = burst(CARD, 1_000);
    keys.push(['Enter', LAST_CHAR_AT + 200]);
    expect(feed(keys)).toEqual({ kind: 'scan', token: CARD });
  });

  it('a slow gap between characters starts a new buffer', () => {
    const keys: Array<[string, number]> = [...burst('ABCDEF', 0), ...burst('GHIJKL', 1_000)];
    keys.push(['Enter', 1_060]);
    expect(feed(keys)).toEqual({ kind: 'scan', token: 'GHIJKL' });
  });

  it('a short buffer at Enter is a reject', () => {
    const keys = burst('7K3M', 1_000);
    keys.push(['Enter', 1_040]);
    expect(feed(keys)).toEqual({ kind: 'reject' });
  });

  it('Enter with nothing buffered is silent', () => {
    expect(feed([['Enter', 1_000]])).toEqual({ kind: 'none' });
  });

  it('a buffer older than the stale window is silent, not a reject', () => {
    const keys = burst(CARD, 1_000);
    keys.push(['Enter', LAST_CHAR_AT + ENTER_STALE_MS + 1]);
    expect(feed(keys)).toEqual({ kind: 'none' });
  });

  it('Tab ends a scan the same way Enter does', () => {
    const keys = burst(CARD, 1_000);
    keys.push(['Tab', LAST_CHAR_AT + 50]);
    expect(feed(keys)).toEqual({ kind: 'scan', token: CARD });
  });

  it('modifier keys are neither characters nor gaps', () => {
    let state: ScanState = EMPTY_SCAN_STATE;
    const keys: Array<[string, number]> = [...burst('7K3MQ', 1_000), ['Shift', 1_045], ['P', 1_050]];
    for (const [key, now] of keys) state = takeScanKey(state, key, now).state;
    expect(state.buffer).toBe('7K3MQP');
  });

  it('keeps the agreed gap', () => {
    expect(BURST_GAP_MS).toBe(400);
  });
});
