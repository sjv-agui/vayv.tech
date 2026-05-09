// Pure scoring + outcome math. No DB calls. Unit-testable.
// Source of truth for soki/truth thresholds and R1 speed buckets.
// Per DECISIONS [MECHANICS] + [R1_SPEED_BUCKETS].

const SOKI_ENTROPY_THRESHOLD = 1.2; // max H = log2(4) = 2.0; min = 0

/**
 * Shannon entropy over option counts (base 2). Returns a number in [0, log2(N)].
 * For 4 options: [0, 2.0].
 * @param {number[]} counts
 * @returns {number}
 */
function shannonEntropy(counts) {
  const total = counts.reduce((s, n) => s + n, 0);
  if (total === 0) return 0;
  let H = 0;
  for (const n of counts) {
    if (n === 0) continue;
    const p = n / total;
    H -= p * Math.log2(p);
  }
  return H;
}

/**
 * Map entropy → outcome per soki_trigger_rule row.
 * Default behavior if no rule supplied: high agreement → soki, low → truth (per [MECHANICS]).
 * @param {number} H
 * @param {{result_if_agree: 'soki'|'truth', result_if_disagree: 'soki'|'truth'}} rule
 * @param {number} threshold
 * @returns {{outcome: 'soki'|'truth', highAgreement: boolean, threshold: number}}
 */
function evaluateOracle(H, rule, threshold = SOKI_ENTROPY_THRESHOLD) {
  const r = rule || { result_if_agree: 'soki', result_if_disagree: 'truth' };
  const highAgreement = H <= threshold;
  const outcome = highAgreement ? r.result_if_agree : r.result_if_disagree;
  return { outcome, highAgreement, threshold };
}

/**
 * R1 speed bucket from per-group completion times.
 * Group time = ms from round start to last correct guess in that group.
 * `null` → group did not finish before timer expired.
 * @param {(number|null)[]} groupTimesMs
 * @param {number} fastThresholdMs
 * @returns {'all_fast'|'some_fast'|'none_fast'}
 */
function speedBucket(groupTimesMs, fastThresholdMs) {
  if (!groupTimesMs || !groupTimesMs.length) return 'none_fast';
  const fast = groupTimesMs.filter(t => t !== null && t <= fastThresholdMs).length;
  if (fast === groupTimesMs.length) return 'all_fast';
  if (fast === 0) return 'none_fast';
  return 'some_fast';
}

/**
 * R1 unlock type distribution.
 * all_fast → all truth; none_fast → all soki; some_fast → ceil/2 truth + remainder soki.
 * @param {'all_fast'|'some_fast'|'none_fast'} bucket
 * @param {number} unlockCount
 * @returns {('truth'|'soki')[]}
 */
function r1UnlockTypes(bucket, unlockCount = 2) {
  if (bucket === 'all_fast') return Array(unlockCount).fill('truth');
  if (bucket === 'none_fast') return Array(unlockCount).fill('soki');
  const truths = Math.ceil(unlockCount / 2);
  return [
    ...Array(truths).fill('truth'),
    ...Array(unlockCount - truths).fill('soki'),
  ];
}

/**
 * R2 collective bucket from per-group correctness + bundle ms across all groups.
 * Each group input: { correctCount, totalCount, ms } where ms = bundle elapsed ms.
 * `ms === null` → group did not finish before timeout.
 * @param {{correctCount:number,totalCount:number,ms:number|null}[]} groupResults
 * @param {number} fastThresholdMs — bundle-level threshold
 * @returns {'all_correct_fast'|'all_correct_slow'|'mixed_fast'|'slow_or_timeout'}
 */
function r2Bucket(groupResults, fastThresholdMs) {
  if (!groupResults || !groupResults.length) return 'slow_or_timeout';
  const allCorrect = groupResults.every(g => g.correctCount === g.totalCount);
  const finishedTimes = groupResults.filter(g => g.ms !== null).map(g => g.ms);
  if (finishedTimes.length !== groupResults.length) return 'slow_or_timeout';
  const avgMs = finishedTimes.reduce((s, n) => s + n, 0) / finishedTimes.length;
  const fastAvg = avgMs <= fastThresholdMs;
  if (allCorrect && fastAvg) return 'all_correct_fast';
  if (allCorrect && !fastAvg) return 'all_correct_slow';
  if (!allCorrect && fastAvg) return 'mixed_fast';
  return 'slow_or_timeout';
}

/**
 * R2 unlock type distribution from collective bucket. Demo realm = 2 unlocks.
 * @param {'all_correct_fast'|'all_correct_slow'|'mixed_fast'|'slow_or_timeout'} bucket
 * @param {number} unlockCount
 * @returns {('truth'|'soki')[]}
 */
function r2UnlockTypes(bucket, unlockCount = 2) {
  if (bucket === 'all_correct_fast') return Array(unlockCount).fill('truth');
  if (bucket === 'slow_or_timeout') return Array(unlockCount).fill('soki');
  // all_correct_slow OR mixed_fast → 50/50, ceil truths
  const truths = Math.ceil(unlockCount / 2);
  return [
    ...Array(truths).fill('truth'),
    ...Array(unlockCount - truths).fill('soki'),
  ];
}

/**
 * R3 final score from a player-submitted ordering.
 * `ordering` is an array of unlock objects in the order placed by the host:
 *   [{ type: 'truth'|'soki', canonical_index: number|null }, ...]
 *   - truth tiles: canonical_index = truth_sequences.order_index for that tile
 *   - soki tiles: canonical_index = null (they shouldn't be in the canonical order)
 *
 * Scoring (per DECISIONS [R3_ORDERING]):
 *   - each truth tile placed in its canonical position → +1
 *   - each soki tile placed anywhere in the order → -1
 *   - final percent = max(0, score) / max_possible × 100, where
 *     max_possible = count of truth tiles in the ordering (best case all correct, no sokis penalize beyond zero floor)
 *
 * The "canonical position" check uses relative order: for the truth tiles in the ordering,
 * filter out sokis, and a truth tile is "correct" if its canonical_index matches the
 * (1-indexed) position among the surviving truth tiles. This makes the scoring tolerant
 * to which subset of canonical truths were unlocked.
 *
 * @param {{type:'truth'|'soki', canonical_index:number|null}[]} ordering
 * @returns {{score:number, max:number, percent:number}}
 */
function r3Score(ordering) {
  if (!ordering || !ordering.length) return { score: 0, max: 0, percent: 0 };
  const truths = ordering
    .map((tile, idx) => ({ ...tile, ordered_idx: idx }))
    .filter(t => t.type === 'truth');
  const sokis = ordering.filter(t => t.type === 'soki');
  // Sort the unlocked truths by their canonical_index to determine the expected sequence positions.
  const expected = [...truths].sort((a, b) => (a.canonical_index ?? 0) - (b.canonical_index ?? 0));
  let correct = 0;
  for (let i = 0; i < truths.length; i++) {
    // The truth tile currently at index i (among truths only) is "correct" if it equals the i-th expected truth.
    if (truths[i].canonical_index === expected[i].canonical_index) correct += 1;
  }
  const score = correct - sokis.length;
  const max = truths.length;
  const percent = max === 0 ? 0 : Math.round((Math.max(0, score) / max) * 100);
  return { score, max, percent };
}

module.exports = {
  SOKI_ENTROPY_THRESHOLD,
  shannonEntropy,
  evaluateOracle,
  speedBucket,
  r1UnlockTypes,
  r2Bucket,
  r2UnlockTypes,
  r3Score,
};
