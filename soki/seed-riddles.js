require('dotenv').config();
const { query } = require('./db');
const crypto = require('crypto');

// 3 bundles × 3 riddles each. Global pool — no realm coupling.
// All riddles are original text for MVP.

const bundles = [
  {
    category: 'logic',
    difficulty_level: 2,
    riddles: [
      {
        question_text: 'A farmer has 17 sheep. All but 9 die. How many sheep does the farmer have left?',
        option_a: '8', option_b: '9', option_c: '17', option_d: '0',
        correct_option: 'b',
        difficulty: 'easy', order_in_bundle: 1,
      },
      {
        question_text: 'You are in a race and overtake the person in 2nd place. What position are you in now?',
        option_a: '1st', option_b: '2nd', option_c: '3rd', option_d: 'Last',
        correct_option: 'b',
        difficulty: 'medium', order_in_bundle: 2,
      },
      {
        question_text: 'A clock loses 15 minutes every hour. If set to the correct time at noon, what time does it show at 6pm?',
        option_a: '5:00 pm', option_b: '4:45 pm', option_c: '5:30 pm', option_d: '5:15 pm',
        correct_option: 'b',
        difficulty: 'hard', order_in_bundle: 3,
      },
    ],
  },
  {
    category: 'pattern',
    difficulty_level: 3,
    riddles: [
      {
        question_text: 'What comes next in the sequence: 2, 6, 12, 20, 30, __?',
        option_a: '38', option_b: '40', option_c: '42', option_d: '44',
        correct_option: 'c',
        difficulty: 'easy', order_in_bundle: 1,
      },
      {
        question_text: 'Complete the pattern: A1, B3, C6, D10, __?',
        option_a: 'E13', option_b: 'E14', option_c: 'E15', option_d: 'F15',
        correct_option: 'c',
        difficulty: 'medium', order_in_bundle: 2,
      },
      {
        question_text: 'In a grid: row 1 = 1,3,5 · row 2 = 2,4,6 · row 3 = 3,5,? — what fills the blank?',
        option_a: '6', option_b: '7', option_c: '8', option_d: '9',
        correct_option: 'b',
        difficulty: 'hard', order_in_bundle: 3,
      },
    ],
  },
  {
    category: 'verbal',
    difficulty_level: 2,
    riddles: [
      {
        question_text: 'I have cities but no houses. I have mountains but no trees. I have water but no fish. What am I?',
        option_a: 'A dream', option_b: 'A painting', option_c: 'A map', option_d: 'A mirror',
        correct_option: 'c',
        difficulty: 'easy', order_in_bundle: 1,
      },
      {
        question_text: 'The more you take, the more you leave behind. What am I?',
        option_a: 'Memories', option_b: 'Footsteps', option_c: 'Time', option_d: 'Money',
        correct_option: 'b',
        difficulty: 'medium', order_in_bundle: 2,
      },
      {
        question_text: 'I speak without a mouth and hear without ears. I have no body but come alive with the wind. What am I?',
        option_a: 'A shadow', option_b: 'A thought', option_c: 'An echo', option_d: 'A flame',
        correct_option: 'c',
        difficulty: 'hard', order_in_bundle: 3,
      },
    ],
  },
];

(async () => {
  try {
    for (const b of bundles) {
      const bundleId = crypto.randomUUID();
      await query(
        `INSERT INTO riddle_bundles (bundle_id, difficulty_level, category)
         VALUES ($1, $2, $3)
         ON CONFLICT DO NOTHING`,
        [bundleId, b.difficulty_level, b.category]
      );
      for (const r of b.riddles) {
        await query(
          `INSERT INTO riddles (riddle_id, question_text, answer_text, difficulty, option_a, option_b, option_c, option_d, correct_option, category, bundle_id, order_in_bundle)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
           ON CONFLICT DO NOTHING`,
          [
            crypto.randomUUID(),
            r.question_text,
            r[`option_${r.correct_option}`], // answer_text = correct option text
            r.difficulty,
            r.option_a, r.option_b, r.option_c, r.option_d,
            r.correct_option,
            b.category,
            bundleId,
            r.order_in_bundle,
          ]
        );
      }
      console.log(`Bundle seeded: ${b.category} (difficulty ${b.difficulty_level})`);
    }
    console.log('Riddle seed complete.');
  } catch (err) {
    console.error('Riddle seed failed:', err.message);
    process.exit(1);
  } finally {
    process.exit(0);
  }
})();
