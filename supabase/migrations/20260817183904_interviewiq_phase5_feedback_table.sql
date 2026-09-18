/*
# Phase 5: Interview Feedback Table

## Purpose
Stores post-interview feedback (star rating + optional comment) from candidates
after they complete a mock interview. This data powers the adaptive feedback loop
in the ai-interview-next edge function, which includes a summary of recent feedback
in its system prompt to practically adapt the AI's interview behavior over time.

## New Tables
- `interview_feedback`
  - `id` (uuid, primary key, auto-generated)
  - `session_id` (uuid, foreign key to interview_sessions, cascade delete)
  - `user_id` (uuid, not null, defaults to auth.uid(), foreign key to auth.users, cascade delete)
  - `rating` (integer, 1-5, not null — star rating from the candidate)
  - `comment` (text, nullable — optional written feedback)
  - `created_at` (timestamptz, defaults to now())

## Security
- RLS enabled on interview_feedback.
- 4 owner-scoped policies (SELECT/INSERT/UPDATE/DELETE) restricted to authenticated users
  who own the feedback row (auth.uid() = user_id).
- user_id defaults to auth.uid() so inserts that omit user_id still satisfy the INSERT policy.

## Indexes
- idx_interview_feedback_user on user_id (for querying a user's feedback history)
- idx_interview_feedback_created on created_at DESC (for fetching recent feedback for the adaptive loop)
*/

CREATE TABLE IF NOT EXISTS interview_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid REFERENCES interview_sessions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  rating integer NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE interview_feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_feedback" ON interview_feedback;
CREATE POLICY "select_own_feedback" ON interview_feedback FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_feedback" ON interview_feedback;
CREATE POLICY "insert_own_feedback" ON interview_feedback FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_feedback" ON interview_feedback;
CREATE POLICY "update_own_feedback" ON interview_feedback FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_feedback" ON interview_feedback;
CREATE POLICY "delete_own_feedback" ON interview_feedback FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_interview_feedback_user ON interview_feedback(user_id);
CREATE INDEX IF NOT EXISTS idx_interview_feedback_created ON interview_feedback(created_at DESC);