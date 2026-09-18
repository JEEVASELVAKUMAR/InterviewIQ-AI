/*
# AI Voice/Video Interview — Phase 1

Adds two NEW tables for the async AI interview feature.
No existing tables are modified, renamed, or deleted.

1. New Tables
- `interview_sessions`: one row per interview a candidate starts.
  - id (uuid PK)
  - user_id (uuid, FK auth.users, CASCADE, DEFAULT auth.uid())
  - resume_text (text, nullable) — raw resume text used for question generation
  - job_role (text, nullable) — optional target role
  - status (text, default 'setup', CHECK in setup/active/completed/expired)
  - created_at (timestamptz, default now())
- `interview_questions`: the 5-8 generated questions per session.
  - id (uuid PK)
  - session_id (uuid, FK interview_sessions, CASCADE)
  - question_text (text, not null)
  - question_type (text, CHECK in technical/behavioral/resume-based)
  - order_index (int, default 0)
  - created_at (timestamptz, default now())

2. Security
- RLS enabled on both tables.
- interview_sessions: owner-scoped CRUD (auth.uid() = user_id).
- interview_questions: ownership checked through parent session via EXISTS subquery.
- 4 policies per table (SELECT/INSERT/UPDATE/DELETE), scoped TO authenticated.
*/

-- interview_sessions
CREATE TABLE IF NOT EXISTS interview_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  resume_text text,
  job_role text,
  status text NOT NULL DEFAULT 'setup' CHECK (status IN ('setup','active','completed','expired')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE interview_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_interview_sessions" ON interview_sessions;
CREATE POLICY "select_own_interview_sessions" ON interview_sessions
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_interview_sessions" ON interview_sessions;
CREATE POLICY "insert_own_interview_sessions" ON interview_sessions
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_interview_sessions" ON interview_sessions;
CREATE POLICY "update_own_interview_sessions" ON interview_sessions
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_interview_sessions" ON interview_sessions;
CREATE POLICY "delete_own_interview_sessions" ON interview_sessions
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- interview_questions
CREATE TABLE IF NOT EXISTS interview_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES interview_sessions(id) ON DELETE CASCADE,
  question_text text NOT NULL,
  question_type text NOT NULL CHECK (question_type IN ('technical','behavioral','resume-based')),
  order_index int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE interview_questions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_interview_questions" ON interview_questions;
CREATE POLICY "select_own_interview_questions" ON interview_questions
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM interview_sessions s WHERE s.id = session_id AND s.user_id = auth.uid()));

DROP POLICY IF EXISTS "insert_own_interview_questions" ON interview_questions;
CREATE POLICY "insert_own_interview_questions" ON interview_questions
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM interview_sessions s WHERE s.id = session_id AND s.user_id = auth.uid()));

DROP POLICY IF EXISTS "update_own_interview_questions" ON interview_questions;
CREATE POLICY "update_own_interview_questions" ON interview_questions
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM interview_sessions s WHERE s.id = session_id AND s.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM interview_sessions s WHERE s.id = session_id AND s.user_id = auth.uid()));

DROP POLICY IF EXISTS "delete_own_interview_questions" ON interview_questions;
CREATE POLICY "delete_own_interview_questions" ON interview_questions
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM interview_sessions s WHERE s.id = session_id AND s.user_id = auth.uid()));