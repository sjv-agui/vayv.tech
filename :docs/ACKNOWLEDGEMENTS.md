# ACKNOWLEDGEMENTS.md
> Third-party datasets, content sources, and libraries used in Soki.
> Append every external source that ships in code or data. Read DECISIONS [LICENSE_PRINCIPLE] before adding.
> Index: [DATA] [LIBRARIES] [INSPIRATION] [PENDING_REVIEW]

---

## [DATA]
_(none active yet — populated as datasets are seeded)_

---

## [LIBRARIES]
- `pg`, `dotenv` — server.js dependencies
- Fonts loaded from Google Fonts (Share Tech Mono, Azeret Mono) — used per Google Fonts open license

---

## [INSPIRATION]
_(non-shipping references — do not need attribution but worth recording for design lineage)_

---

## [PENDING_REVIEW]
Sources evaluated but not yet integrated. Each must clear license + format check before moving to [DATA].

### crawsome/riddles — github.com/crawsome/riddles
- Author: Colin Burke (`crawsome`), 2020.
- Author disclaimer: "I didn't write these. These are from all around the internet." — upstream provenance murky.
- **Blockers**:
  - No LICENSE file visible in repo (default = "all rights reserved" — legally unusable until clarified).
  - Open-ended Q→A format; R2 needs 4-option multiple-choice. Would require generating 3 distractors per riddle.
  - No difficulty rating; no category tag (logic / pattern / verbal). Manual tagging required.
- Status: **on hold** until license confirmed (open issue with author OR find equivalent licensed source).
- If integrated: attribution required in this file under [DATA] + a "Riddles" credit on the post-game screen.

### Open Trivia DB — opentdb.com
- License: CC-BY-SA 4.0.
- Format: 4-option multiple-choice native. Has difficulty (easy/medium/hard) + category.
- Trivia-leaning, not "riddle"-leaning per Wikipedia's enigma definition. Acceptable for MVP if R2 framing is "intelligence test" rather than literal riddles.
- Status: **preferred fallback** for the R2 starter pool.
