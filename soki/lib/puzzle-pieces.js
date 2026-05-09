// 10 puzzle-piece SVG silhouettes — knob (sweep=1) / notch (sweep=0) combos
// on top/right/bottom/left edges. Per DECISIONS [SEQUENCE_LOCK].
// Used by both server (random pick at unlock time) and client (render via <use>).
// Indexed 1-10; piece_index persisted in sequence_unlock.puzzle_piece_index.
// viewBox in renderer: "2 2 28 28" — knobs extend ±3px outside the 6,6→26,26 box.

const PUZZLE_PIECES = {
  1:  'M6 6 H13 a3 3 0 0 1 6 0 H26 V13 a3 3 0 0 1 0 6 V26 H19 a3 3 0 0 1 -6 0 H6 V19 a3 3 0 0 1 0 -6 Z',
  2:  'M6 6 H13 a3 3 0 0 0 6 0 H26 V13 a3 3 0 0 0 0 6 V26 H19 a3 3 0 0 0 -6 0 H6 V19 a3 3 0 0 0 0 -6 Z',
  3:  'M6 6 H13 a3 3 0 0 1 6 0 H26 V13 a3 3 0 0 0 0 6 V26 H19 a3 3 0 0 1 -6 0 H6 V19 a3 3 0 0 0 0 -6 Z',
  4:  'M6 6 H13 a3 3 0 0 0 6 0 H26 V13 a3 3 0 0 1 0 6 V26 H19 a3 3 0 0 0 -6 0 H6 V19 a3 3 0 0 1 0 -6 Z',
  5:  'M6 6 H13 a3 3 0 0 1 6 0 H26 V13 a3 3 0 0 1 0 6 V26 H19 a3 3 0 0 0 -6 0 H6 V19 a3 3 0 0 0 0 -6 Z',
  6:  'M6 6 H13 a3 3 0 0 0 6 0 H26 V13 a3 3 0 0 0 0 6 V26 H19 a3 3 0 0 1 -6 0 H6 V19 a3 3 0 0 1 0 -6 Z',
  7:  'M6 6 H13 a3 3 0 0 1 6 0 H26 V13 a3 3 0 0 0 0 6 V26 H19 a3 3 0 0 0 -6 0 H6 V19 a3 3 0 0 1 0 -6 Z',
  8:  'M6 6 H13 a3 3 0 0 0 6 0 H26 V13 a3 3 0 0 1 0 6 V26 H19 a3 3 0 0 1 -6 0 H6 V19 a3 3 0 0 0 0 -6 Z',
  9:  'M6 6 H13 a3 3 0 0 1 6 0 H26 V13 a3 3 0 0 1 0 6 V26 H19 a3 3 0 0 1 -6 0 H6 V19 a3 3 0 0 0 0 -6 Z',
  10: 'M6 6 H13 a3 3 0 0 1 6 0 H26 V13 a3 3 0 0 0 0 6 V26 H19 a3 3 0 0 0 -6 0 H6 V19 a3 3 0 0 0 0 -6 Z',
};

const PIECE_COUNT = 10;

function getPiecePath(index) {
  return PUZZLE_PIECES[index] || PUZZLE_PIECES[1];
}

function randomPieceIndex() {
  return Math.floor(Math.random() * PIECE_COUNT) + 1;
}

module.exports = { PUZZLE_PIECES, PIECE_COUNT, getPiecePath, randomPieceIndex };
