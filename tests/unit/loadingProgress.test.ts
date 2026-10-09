import { describe, expect, it } from 'vitest';
import {
  SLOW_AFTER_SEC,
  VERY_SLOW_AFTER_SEC,
  nextProgress,
  stageRange,
  waitNoteKey,
} from '../../src/app/components/states/loadingProgress';

describe('nextProgress', () => {
  it('moves forward within a stage but never reaches its cap', () => {
    let p = stageRange('llm_processing').floor;
    for (let i = 0; i < 500; i++) {
      const next = nextProgress(p, 'llm_processing');
      expect(next).toBeGreaterThanOrEqual(p);
      p = next;
    }
    expect(p).toBeLessThanOrEqual(stageRange('llm_processing').cap);
    expect(p).toBeGreaterThan(80);
  });

  it('jumps up to the floor of a later stage', () => {
    expect(nextProgress(30, 'llm_processing')).toBeGreaterThanOrEqual(stageRange('llm_processing').floor);
  });

  it('never moves backwards when the stage floor is lower than the current value', () => {
    expect(nextProgress(60, 'scanning')).toBe(60);
  });

  it('keeps stage ranges ordered and non-overlapping', () => {
    const order = ['scanning', 'transcribing', 'llm_processing', 'generating_pdf'] as const;
    for (let i = 1; i < order.length; i++) {
      expect(stageRange(order[i]).floor).toBeGreaterThan(stageRange(order[i - 1]).cap);
    }
  });
});

describe('waitNoteKey', () => {
  it('escalates the message with elapsed time', () => {
    expect(waitNoteKey(0)).toBe('loadingExpect');
    expect(waitNoteKey(SLOW_AFTER_SEC - 1)).toBe('loadingExpect');
    expect(waitNoteKey(SLOW_AFTER_SEC)).toBe('loadingSlow');
    expect(waitNoteKey(VERY_SLOW_AFTER_SEC)).toBe('loadingVerySlow');
  });
});
