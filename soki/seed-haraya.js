require('dotenv').config();
const { query } = require('./db');

// Fixed UUIDs — stable across re-runs
const IDS = {
  realm:    'a1000000-0000-0000-0000-000000000001',
  config:   'a1000000-0000-0000-0000-000000000002',

  loc: {
    centre: 'b1000000-0000-0000-0000-000000000001',
    main:   'b1000000-0000-0000-0000-000000000002',
    side:   'b1000000-0000-0000-0000-000000000003',
    sulok:  'b1000000-0000-0000-0000-000000000004',
    gilid:  'b1000000-0000-0000-0000-000000000005',
  },

  char: {
    datus_voice:          'c1000000-0000-0000-0000-000000000001',
    first_councilor:      'c1000000-0000-0000-0000-000000000002',
    veil_apprentice:      'c1000000-0000-0000-0000-000000000003',
    storm_speaker:        'c1000000-0000-0000-0000-000000000004',
    root_singer:          'c1000000-0000-0000-0000-000000000005',
    shadow_cartographer:  'c1000000-0000-0000-0000-000000000006',
    salawahi_elder:       'c1000000-0000-0000-0000-000000000007',
    munda_journalist:     'c1000000-0000-0000-0000-000000000008',
    festival_merchant:    'c1000000-0000-0000-0000-000000000009',
    young_apprentice:     'c1000000-0000-0000-0000-000000000010',
    exiles_child:         'c1000000-0000-0000-0000-000000000011',
    munda_politician:     'c1000000-0000-0000-0000-000000000012',
  },

  vq: {
    q1: 'd1000000-0000-0000-0000-000000000001',
    q2: 'd1000000-0000-0000-0000-000000000002',
    q3: 'd1000000-0000-0000-0000-000000000003',
    q4: 'd1000000-0000-0000-0000-000000000004',
  },

  rule: {
    q1: 'e1000000-0000-0000-0000-000000000001',
  },

  truth: {
    t1: 'f1000000-0000-0000-0000-000000000001',
    t2: 'f1000000-0000-0000-0000-000000000002',
    t3: 'f1000000-0000-0000-0000-000000000003',
    t4: 'f1000000-0000-0000-0000-000000000004',
    t5: 'f1000000-0000-0000-0000-000000000005',
    t6: 'f1000000-0000-0000-0000-000000000006',
  },

  clue: {
    c1: 'a2000000-0000-0000-0000-000000000001',
    c2: 'a2000000-0000-0000-0000-000000000002',
    c3: 'a2000000-0000-0000-0000-000000000003',
    c4: 'a2000000-0000-0000-0000-000000000004',
    c5: 'a2000000-0000-0000-0000-000000000005',
    c6: 'a2000000-0000-0000-0000-000000000006',
    c7: 'a2000000-0000-0000-0000-000000000007',
    c8: 'a2000000-0000-0000-0000-000000000008',
    c9: 'a2000000-0000-0000-0000-000000000009',
    c10:'a2000000-0000-0000-0000-000000000010',
  },

  // Individual sequences — path-specific reveals (one per killer path).
  // Backend picks killer_path A|B|C randomly at game start; matching row unlocks at R3.
  indiv: {
    pathA: 'a3000000-0000-0000-0000-000000000001', // Root Singer (tonic)
    pathB: 'a3000000-0000-0000-0000-000000000002', // Shadow Cartographer (Veil fracture)
    pathC: 'a3000000-0000-0000-0000-000000000003', // Exile's Child (revenge)
  },

  // Soki sequences — false reveals injected as sanctions per soki_trigger_rule.
  soki: {
    s1: 'a4000000-0000-0000-0000-000000000001', // Bagyo distractor
    s2: 'a4000000-0000-0000-0000-000000000002', // Council distractor
    s3: 'a4000000-0000-0000-0000-000000000003', // Apprentice distractor
    s4: 'a4000000-0000-0000-0000-000000000004', // Munda distractor
  },
};

async function seed() {
  try {
    // 1. Realm
    await query(`
      INSERT INTO realms (realm_id, name, description, max_players, min_players, is_active)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (realm_id) DO NOTHING
    `, [
      IDS.realm,
      'Haraya',
      'Hidden tropical archipelago cloaked by a living enchantment called the Tabing (the Veil). Magic practitioners = Hiwaga. Half-magical = Salawahi. Non-magical = Munda.',
      12, 4, true,
    ]);

    // 2. Realm Config (MVP: 3 rounds)
    await query(`
      INSERT INTO realm_config (config_id, realm_id, rounds_total, max_active_soki_sequences, scoring_weight_positive, scoring_weight_negative, sequence_reveal_mode)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (config_id) DO NOTHING
    `, [IDS.config, IDS.realm, 3, 3, 1.0, 1.0, 'one-by-one']);

    // 3. Locations
    const locations = [
      [IDS.loc.centre, 'Dambana ng Tabing',  'Centre of floor. Where Veil Keeper performs sustaining rite. Incident site.'],
      [IDS.loc.main,   'Hapag ng Pista',      'Main dining table. Where all rounds are conducted.'],
      [IDS.loc.side,   'Palengke ng Diwata',  'Food/drinks table. Festival Merchant\'s domain. Social buffer.'],
      [IDS.loc.sulok,  'Sulok ng Bagyo',      'Rival clan\'s zone. Slightly apart, cooler atmosphere.'],
      [IDS.loc.gilid,  'Gilid ng Tabing',     'Salawahi gather here. Where Fire Dance was performed.'],
    ];
    for (const [id, name, desc] of locations) {
      await query(`
        INSERT INTO locations (location_id, realm_id, name, description, is_active)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (location_id) DO NOTHING
      `, [id, IDS.realm, name, desc, true]);
    }

    // 4. Characters
    // description = "{Culture}. {one-liner}." — player-facing tagline (returned by /round/me).
    // backstory = ~60-word omniscient riddle, splittable into 3 fragments (~20 words each).
    //   Distributed to 3 group-mates; never to character's own player. See ROUNDS.md [R1].
    //   Hints reference the one-liner without reusing its words. Killer-path metadata
    //   lives in individual_sequences.unlock_condition (not in backstory text).
    const characters = [
      [IDS.char.datus_voice,         'The Datu\'s Voice',             'Knows about a complaint filed three days ago.',
        "In the Datu's chamber three nights past, parchment moved between hands sealed with a name nobody dared utter. The bearer carried memory of every wax seal pressed that season, one fresh grievance burning brighter than the rest. They watched the festival from a vantage no commoner held."],
      [IDS.char.first_councilor,     'The First Councilor',           'Hiwaga. Has held secret Bagyo negotiations for months.',
        "For seven moons there were quiet meetings beneath the lower colonnade, where ledgers were folded and reopened in handwriting not their own. A pact long forbidden by the elders took shape, traded in whispers and one cold cup of tea. The council saw a steady servant; the colonnade saw different patience entirely."],
      [IDS.char.veil_apprentice,     'The Veil Keeper\'s Apprentice', 'Salawahi. The only one who can restart the rite — but doing so exposes hidden ancestry.',
        "Beneath formal robes, blood that should not be there pulsed in time with the Tabing's hum. Years of practice taught the ceremony no other living hand remembered in full, though none had been told whose hand could complete it tonight. A secret older than admission to the order waited, quiet as the altar's last unfinished mark."],
      [IDS.char.storm_speaker,       'The Storm Speaker',             'Hiwaga (Bagyo). Carries a sealed offer the Veil Keeper was about to reject.',
        "Wrapped against ribs lay parchment phrased so finely that even refusal would still bind. Months of careful diction were folded into one signature line, awaiting a hand that had already half-decided to deny it. A storm had been promised either way; only the wind's direction remained uncertain."],
      [IDS.char.root_singer,         'The Root Singer',               'Hiwaga. Gave the Veil Keeper an experimental tonic two days ago.',
        "In the orchard between two moons, a draught was distilled three times against custom — once for sleep, once for visions, once for something the recipe did not name. A hand pressed the stoppered jar into careful keeping forty-eight hours before the festival lit. The cup at the altar still held residue no celebrant had asked for."],
      [IDS.char.shadow_cartographer, 'The Shadow Cartographer',       'Hiwaga. Detected a Veil fracture three days ago, told only the Veil Keeper.',
        "Charts drawn in fading inks recorded a tear in the sky no other eye had measured, three nights before the lanterns rose. One messenger carried the discovery, and only one ear received the warning before the hum of the rite began. The tear's coordinates lay precisely above a place where everyone would soon be looking elsewhere."],
      [IDS.char.salawahi_elder,      'The Salawahi Elder',            'Salawahi. Was the Veil Keeper\'s oldest friend and most recent enemy.',
        "Two children had once shared a teacher and a hidden corridor of the lower temple, parted badly, and refused each other for a generation. A letter written in the older script lay folded inside a sash, never delivered. The festival's invitation had come at the request of a long ally; it arrived from a fresher quarrel."],
      [IDS.char.munda_journalist,    'The Munda Journalist',          'Munda. Already photographed something they shouldn\'t have.',
        "A small device hidden inside a ceremonial sash captured what eyes had been told to forget. Two frames in particular held a silhouette nobody had been seated near. The journal beside the bed already noted the time-stamp, and a second copy of the print sat sealed for elsewhere, in case the first was claimed."],
      [IDS.char.festival_merchant,   'The Festival Merchant',         'Salawahi. Saw someone approach Dambana during the Fire Dance, said nothing.',
        "From between the wine jars and the lanterns, a clear line of sight ran straight to the altar, unblocked while every head was turned toward the music. A figure passed once, slowly, when the rhythm demanded the crowd face elsewhere. The mouth that had served drinks all evening chose silence, and chose it again later when asked."],
      [IDS.char.young_apprentice,    'The Young Apprentice',          'Hiwaga. Was walking toward Dambana during the Fire Dance and turned back.',
        "Steps were taken toward the altar in the eighth measure of the music, nine paces in, then halted by a sound that did not come from the lanterns. A small hand reversed without ever entering the inscribed circle. No one had been beside the altar then; no one had been there yet."],
      [IDS.char.exiles_child,        'The Exile\'s Child',            'Salawahi. Parent was banished by the Veil Keeper twenty years ago.',
        "A name struck from the scrolls two decades gone had been carried inland in a small mouth, and the small mouth had grown. The promise made at a quiet grave under an old kapok tree did not soften with time; it sharpened. A crowd that looked elsewhere was a useful crowd, and the lanterns a useful direction for every other gaze."],
      [IDS.char.munda_politician,    'The Munda Politician',          'Munda. Has a coastal access document to sign tonight.',
        "Tonight a paper would change owners that no Hiwaga elder had been told existed — tidewater rights opened for fresh anchorage at next tide. The seal pressed wet at the festival's edge belonged to a hand that had drunk from no altar cup. The price had been agreed on weeks earlier, in a voice no parchment recorded."],
    ];
    for (const [id, name, description, backstory] of characters) {
      await query(`
        INSERT INTO characters (character_id, realm_id, name, description, backstory)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (character_id) DO UPDATE
          SET name = EXCLUDED.name,
              description = EXCLUDED.description,
              backstory = EXCLUDED.backstory
      `, [id, IDS.realm, name, description, backstory]);
    }

    // 5. Vote Questions
    const voteQuestions = [
      [IDS.vq.q1, 'pre_game',     'Oracle Card: "The festival lights go out. In the darkness, you hear something fall. What do you do?"', 'Rush to the altar', 'Move toward the sound carefully', 'Stay still and observe', 'Call out to others'],
      [IDS.vq.q2, 'post_round_1', 'Who among the guests do you most suspect had reason to approach the Dambana?',                         'Someone from the Bagyo clan', 'Someone with magical knowledge', 'Someone with a personal grudge', 'An outsider with something to gain'],
      [IDS.vq.q3, 'post_round_2', 'What do you believe the incident was?',                                                                'A deliberate act of harm', 'An accident with consequences', 'A ritual gone wrong', 'Something the Veil Keeper brought on themselves'],
      [IDS.vq.q4, 'final',        'Order the events of the Fire Dance window as you now understand them.',                                'Place sequence fragment 1', 'Place sequence fragment 2', 'Place sequence fragment 3', 'Place sequence fragment 4'],
    ];
    for (const [id, phase, text, a, b, c, d] of voteQuestions) {
      await query(`
        INSERT INTO vote_questions (vote_question_id, realm_id, phase, question_text, option_a, option_b, option_c, option_d)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (vote_question_id) DO NOTHING
      `, [id, IDS.realm, phase, text, a, b, c, d]);
    }

    // 6. Soki Trigger Rule (Q1 only — MVP binary logic)
    await query(`
      INSERT INTO soki_trigger_rules (rule_id, realm_id, vote_question_id, agreement_threshold, result_if_agree, result_if_disagree)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (rule_id) DO NOTHING
    `, [IDS.rule.q1, IDS.realm, IDS.vq.q1, 0.700, 'soki', 'truth']);

    // 7. Truth Sequence
    const truthSeq = [
      [IDS.truth.t1, 1, 'Fire Dance begins. All eyes move to Gilid ng Tabing.',           false],
      [IDS.truth.t2, 2, 'Figure leaves the crowd and moves toward Dambana.',               true],
      [IDS.truth.t3, 3, 'Figure reaches Dambana. Veil Keeper is mid-rite.',                true],
      [IDS.truth.t4, 4, 'Incident occurs (path-dependent).',                               true],
      [IDS.truth.t5, 5, 'Figure returns to crowd.',                                        false],
      [IDS.truth.t6, 6, 'Fire Dance ends. Crowd turns back. Veil Keeper found collapsed.', false],
    ];
    for (const [id, idx, statement, is_key] of truthSeq) {
      await query(`
        INSERT INTO truth_sequences (truth_sequence_id, realm_id, order_index, statement, is_key_event)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (truth_sequence_id) DO NOTHING
      `, [id, IDS.realm, idx, statement, is_key]);
    }

    // 8a. Individual Sequences — path-specific reveals, one per killer path.
    // Backend selects games.killer_path A|B|C at game start; matching row unlocks at R3.
    // Per PHILOSOPHY [GAME_MECHANICS]: shared collective realities, not inherently true or false.
    const indivSeqs = [
      [IDS.indiv.pathA, 1, 'killer_path:A',
        "The third distillation was never named in the recipe. The Keeper's hands faltered between two breaths of the chant, and the cup that had sustained the rite betrayed it instead."],
      [IDS.indiv.pathB, 2, 'killer_path:B',
        "The tear detected three nights earlier was never closed. Above the altar, where everyone would soon be looking elsewhere, the sky opened just wide enough to undo the rite from above."],
      [IDS.indiv.pathC, 3, 'killer_path:C',
        "A name struck from the scrolls returned during the dance. The grievance was older than the festival itself, carried inland in a child's mouth and ripened under an old kapok tree."],
    ];
    for (const [id, order_index, unlock_condition, content] of indivSeqs) {
      await query(`
        INSERT INTO individual_sequences (individual_sequence_id, realm_id, content, round_unlocked, unlock_condition, order_index)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (individual_sequence_id) DO UPDATE
          SET content = EXCLUDED.content,
              unlock_condition = EXCLUDED.unlock_condition,
              order_index = EXCLUDED.order_index,
              round_unlocked = EXCLUDED.round_unlocked
      `, [id, IDS.realm, content, 3, unlock_condition, order_index]);
    }

    // 8b. Soki Sequences — false reveals injected when soki_trigger_rule fires.
    // Each attached to a vote_question; runtime picks one when entropy outcome = 'soki'.
    const sokiSeqs = [
      [IDS.soki.s1, IDS.vq.q2,
        "A foreign delegation pressed an unsigned offer into the Keeper's hand at the altar's edge. Refusal would have ended a months-long pact in plain sight."],
      [IDS.soki.s2, IDS.vq.q3,
        "A council ledger ordered the rite halted before the festival began. The Keeper read the order, set it aside, and lit the first lantern anyway."],
      [IDS.soki.s3, IDS.vq.q1,
        "An apprentice's hidden ancestry was about to be exposed publicly during the closing rites. The shame would have been worse than the death."],
      [IDS.soki.s4, IDS.vq.q1,
        "A coastal access agreement signed at the festival's edge required no living signature from the Tabing's keeper. Permission was implied by absence."],
    ];
    for (const [id, vqId, content] of sokiSeqs) {
      await query(`
        INSERT INTO soki_sequences (soki_sequence_id, realm_id, content, triggered_by_vote_question_id, is_active, penalty_score)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (soki_sequence_id) DO UPDATE
          SET content = EXCLUDED.content,
              triggered_by_vote_question_id = EXCLUDED.triggered_by_vote_question_id,
              penalty_score = EXCLUDED.penalty_score
      `, [id, IDS.realm, content, vqId, false, 1.0]);
    }

    // 9. Clues (all 10 defined; rounds 1–3 active for MVP)
    const clues = [
      [IDS.clue.c1,  'round:1', 'Four-minute window — Everyone watched the Fire Dance. Dambana was unguarded.'],
      [IDS.clue.c2,  'round:1', 'Unfinished ritual mark — Inscription ends mid-stroke. Keeper was interrupted, not overcome.'],
      [IDS.clue.c3,  'round:2', 'Tonic residue on altar cup — Botanical compound found in Keeper\'s cup. Excess causes collapse.'],
      [IDS.clue.c4,  'round:2', 'Veil fracture map — Fracture detected 3 days ago directly above Dambana.'],
      [IDS.clue.c5,  'round:3', 'Festival Merchant\'s sighting — Saw figure move toward Dambana during Fire Dance.'],
      [IDS.clue.c6,  'round:3', 'Bagyo sealed offer — Ritual co-stewardship of Tabing. Partial Veil control.'],
      [IDS.clue.c7,  'round:4', 'Journalist\'s photograph — Figure visible at Dambana edge during Fire Dance, face obscured.'],
      [IDS.clue.c8,  'round:4', 'Salawahi Elder\'s letter — Veil Keeper\'s undelivered apology. Twenty years old.'],
      [IDS.clue.c9,  'round:5', 'Root Singer\'s botanical notes — Formula escalating. Final version far stronger than designed.'],
      [IDS.clue.c10, 'round:5', 'Veil Keeper\'s complaint — Filed 3 days ago. Names Root Singer\'s supplier and Cartographer\'s unreported fracture.'],
    ];
    for (const [id, unlock_condition, content] of clues) {
      await query(`
        INSERT INTO clues (clue_id, realm_id, content, unlock_condition, is_unlocked)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (clue_id) DO NOTHING
      `, [id, IDS.realm, content, unlock_condition, false]);
    }

    console.log('Haraya seed complete.');
  } catch (err) {
    console.error('Seed failed:', err.message);
  } finally {
    process.exit();
  }
}

seed();
