-- Phase 4: Proctoring + staged interview flow
-- Additive only — no drops, no renames.

ALTER TABLE interview_sessions
  ADD COLUMN IF NOT EXISTS violation_type text,
  ADD COLUMN IF NOT EXISTS violation_at timestamptz;

ALTER TABLE interview_sessions
  ADD COLUMN IF NOT EXISTS current_stage text DEFAULT 'entry';

-- Widen status constraint to include 'terminated_violation'
ALTER TABLE interview_sessions DROP CONSTRAINT IF EXISTS interview_sessions_status_check;
ALTER TABLE interview_sessions ADD CONSTRAINT interview_sessions_status_check
  CHECK (status IN ('setup','active','in_progress','completed','expired','terminated_violation'));