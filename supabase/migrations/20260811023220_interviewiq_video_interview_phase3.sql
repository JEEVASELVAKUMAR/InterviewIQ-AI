/*
# AI Voice/Video Interview — Phase 3: Engagement Signals

Adds a JSONB column to interview_answers for storing observable behavioral signals.
No existing columns are dropped or renamed; purely additive.

1. Modified Tables (additive only)
- `interview_answers`: add `engagement_signals` JSONB column (nullable).
  Stores: { eyeContactPct, speakingPaceWPM, fillerWordCount, fillerWords, answerCompleteness, sampleCount }
  Collected per answer during the interview session.

2. Security
- No RLS policy changes needed — the new column inherits the table's existing policies.
*/

ALTER TABLE interview_answers
  ADD COLUMN IF NOT EXISTS engagement_signals JSONB;