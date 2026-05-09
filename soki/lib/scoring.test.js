import { describe, it, expect } from 'vitest';
import {
  shannonEntropy,
  evaluateOracle,
  speedBucket,
  r1UnlockTypes,
  r2Bucket,
  r2UnlockTypes,
  r3Score,
  SOKI_ENTROPY_THRESHOLD,
} from './scoring.js';

describe('shannonEntropy', () => {
  it('returns 0 for empty votes', () => {
    expect(shannonEntropy([0, 0, 0, 0])).toBe(0);
  });

  it('returns 0 for unanimous vote', () => {
    expect(shannonEntropy([10, 0, 0, 0])).toBe(0);
  });

  it('returns log2(4)=2 for perfectly uniform 4-option vote', () => {
    expect(shannonEntropy([1, 1, 1, 1])).toBeCloseTo(2.0);
  });

  it('returns ~1 for 50/50 split across 2 options', () => {
    expect(shannonEntropy([5, 5, 0, 0])).toBeCloseTo(1.0);
  });
});

describe('evaluateOracle', () => {
  const rule = { result_if_agree: 'soki', result_if_disagree: 'truth' };

  it('high agreement (H=0) → soki', () => {
    const { outcome, highAgreement } = evaluateOracle(0, rule);
    expect(outcome).toBe('soki');
    expect(highAgreement).toBe(true);
  });

  it('low agreement (H=2) → truth', () => {
    const { outcome, highAgreement } = evaluateOracle(2, rule);
    expect(outcome).toBe('truth');
    expect(highAgreement).toBe(false);
  });

  it('exactly at threshold → highAgreement', () => {
    const { highAgreement } = evaluateOracle(SOKI_ENTROPY_THRESHOLD, rule);
    expect(highAgreement).toBe(true);
  });

  it('just above threshold → not highAgreement', () => {
    const { highAgreement } = evaluateOracle(SOKI_ENTROPY_THRESHOLD + 0.001, rule);
    expect(highAgreement).toBe(false);
  });

  it('defaults rule when null passed', () => {
    const { outcome } = evaluateOracle(0, null);
    expect(outcome).toBe('soki');
  });
});

describe('speedBucket', () => {
  const fast = 300000;

  it('all groups fast → all_fast', () => {
    expect(speedBucket([100, 200, 250], fast)).toBe('all_fast');
  });

  it('no groups fast → none_fast', () => {
    expect(speedBucket([400000, 500000], fast)).toBe('none_fast');
  });

  it('null group time (timeout) counts as not fast', () => {
    expect(speedBucket([100, null], fast)).toBe('some_fast');
  });

  it('all null → none_fast', () => {
    expect(speedBucket([null, null], fast)).toBe('none_fast');
  });

  it('empty array → none_fast', () => {
    expect(speedBucket([], fast)).toBe('none_fast');
  });

  it('mixed fast + slow → some_fast', () => {
    expect(speedBucket([100, 600000], fast)).toBe('some_fast');
  });
});

describe('r1UnlockTypes', () => {
  it('all_fast → 2 truth', () => {
    expect(r1UnlockTypes('all_fast', 2)).toEqual(['truth', 'truth']);
  });

  it('none_fast → 2 soki', () => {
    expect(r1UnlockTypes('none_fast', 2)).toEqual(['soki', 'soki']);
  });

  it('some_fast → 1 truth + 1 soki', () => {
    expect(r1UnlockTypes('some_fast', 2)).toEqual(['truth', 'soki']);
  });

  it('some_fast with 3 unlocks → 2 truth + 1 soki', () => {
    expect(r1UnlockTypes('some_fast', 3)).toEqual(['truth', 'truth', 'soki']);
  });

  it('defaults to 2 unlocks', () => {
    expect(r1UnlockTypes('all_fast')).toHaveLength(2);
  });
});

describe('r2Bucket', () => {
  const fast = 480000;
  const g = (correctCount, totalCount, ms) => ({ correctCount, totalCount, ms });

  it('all correct + all finish fast → all_correct_fast', () => {
    expect(r2Bucket([g(3,3,100000), g(3,3,200000)], fast)).toBe('all_correct_fast');
  });

  it('all correct + slow avg → all_correct_slow', () => {
    expect(r2Bucket([g(3,3,500000), g(3,3,600000)], fast)).toBe('all_correct_slow');
  });

  it('mixed correctness + fast avg → mixed_fast', () => {
    expect(r2Bucket([g(2,3,100000), g(3,3,200000)], fast)).toBe('mixed_fast');
  });

  it('any group timed out → slow_or_timeout', () => {
    expect(r2Bucket([g(3,3,100000), g(3,3,null)], fast)).toBe('slow_or_timeout');
  });

  it('mixed correctness + slow → slow_or_timeout', () => {
    expect(r2Bucket([g(1,3,600000), g(2,3,700000)], fast)).toBe('slow_or_timeout');
  });

  it('empty array → slow_or_timeout', () => {
    expect(r2Bucket([], fast)).toBe('slow_or_timeout');
  });
});

describe('r2UnlockTypes', () => {
  it('all_correct_fast → 2 truth', () => {
    expect(r2UnlockTypes('all_correct_fast', 2)).toEqual(['truth', 'truth']);
  });

  it('slow_or_timeout → 2 soki', () => {
    expect(r2UnlockTypes('slow_or_timeout', 2)).toEqual(['soki', 'soki']);
  });

  it('all_correct_slow → 1 truth + 1 soki', () => {
    expect(r2UnlockTypes('all_correct_slow', 2)).toEqual(['truth', 'soki']);
  });

  it('mixed_fast → 1 truth + 1 soki', () => {
    expect(r2UnlockTypes('mixed_fast', 2)).toEqual(['truth', 'soki']);
  });

  it('defaults to 2 unlocks', () => {
    expect(r2UnlockTypes('all_correct_fast')).toHaveLength(2);
  });
});

describe('r3Score', () => {
  it('empty ordering → 0/0/0%', () => {
    expect(r3Score([])).toEqual({ score: 0, max: 0, percent: 0 });
  });

  it('all truths in correct order → 100%', () => {
    const ordering = [
      { type: 'truth', canonical_index: 1 },
      { type: 'truth', canonical_index: 2 },
      { type: 'truth', canonical_index: 3 },
    ];
    expect(r3Score(ordering)).toEqual({ score: 3, max: 3, percent: 100 });
  });

  it('all truths wrong order → 0%', () => {
    // [2,1] — neither tile is in its correct relative position
    const ordering = [
      { type: 'truth', canonical_index: 2 },
      { type: 'truth', canonical_index: 1 },
    ];
    const { percent } = r3Score(ordering);
    expect(percent).toBe(0);
  });

  it('soki tile deducts from score, floored at 0%', () => {
    const ordering = [
      { type: 'truth', canonical_index: 1 },
      { type: 'soki',  canonical_index: null },
    ];
    const { score, percent } = r3Score(ordering);
    expect(score).toBe(0); // 1 correct truth − 1 soki
    expect(percent).toBe(0);
  });

  it('two truths correct, one soki → net positive', () => {
    const ordering = [
      { type: 'truth', canonical_index: 1 },
      { type: 'truth', canonical_index: 2 },
      { type: 'soki',  canonical_index: null },
    ];
    const { score, max, percent } = r3Score(ordering);
    expect(score).toBe(1);   // 2 correct − 1 soki
    expect(max).toBe(2);
    expect(percent).toBe(50);
  });
});
