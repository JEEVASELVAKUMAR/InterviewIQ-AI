/*
# InterviewIQ AI — Phase 8: Rate limiting table for AI edge functions

## Overview
Creates a `rate_limit_log` table that edge functions use to enforce per-user
rate limits on AI-calling endpoints. Each AI request inserts a row; the
function checks the count of rows for the current user within the last
window (default 60 seconds) and rejects if over the limit.

## New Table
- `rate_limit_log` — id, user_id, endpoint, created_at
  - Indexed on (user_id, endpoint, created_at) for fast window queries.

## Security
- RLS enabled. Users can only see their own rate limit rows.
- Edge functions write via the service role key (bypasses RLS).

## Backward Compatibility
- New table only; no existing tables modified.
*/

CREATE TABLE IF NOT EXISTS rate_limit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  endpoint text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE rate_limit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_rate_limit" ON rate_limit_log;
CREATE POLICY "select_own_rate_limit" ON rate_limit_log FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_rate_limit_user_endpoint_time
  ON rate_limit_log(user_id, endpoint, created_at DESC);
