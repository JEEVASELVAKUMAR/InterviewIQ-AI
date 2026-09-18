/*
# InterviewIQ AI — Core Schema

## Overview
Creates the full data model for the InterviewIQ AI placement-preparation platform:
profiles, resumes, interviews, coding evaluations, roadmaps, chat history, and
analytics snapshots. All tables are owner-scoped to the authenticated user via
`user_id` with Row Level Security.

## New Tables
1. `profiles` — extended user info (name, college, branch, year, skills).
2. `resumes` — extracted resume text, parsed skills/projects/education/experience/certifications.
3. `interviews` — mock interview sessions: config, transcript, scores, feedback.
4. `coding_evaluations` — code submissions with AI evaluation results.
5. `roadmaps` — personalized 30/60/90-day learning plans.
6. `chat_history` — AI chat assistant conversation turns.
7. `analytics` — periodic analytics snapshots per user.

## Security
- RLS enabled on every table.
- 4 CRUD policies per table, scoped to `authenticated` with `auth.uid() = user_id`.
- Owner columns default to `auth.uid()` so client inserts omitting `user_id` succeed.
*/

-- profiles
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text,
  college text,
  branch text,
  year text,
  skills text[] DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_own_profiles" ON profiles;
CREATE POLICY "select_own_profiles" ON profiles FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_profiles" ON profiles;
CREATE POLICY "insert_own_profiles" ON profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_profiles" ON profiles;
CREATE POLICY "update_own_profiles" ON profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_profiles" ON profiles;
CREATE POLICY "delete_own_profiles" ON profiles FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- resumes
CREATE TABLE IF NOT EXISTS resumes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  file_name text,
  raw_text text,
  skills text[] DEFAULT '{}',
  projects jsonb DEFAULT '[]',
  education jsonb DEFAULT '[]',
  experience jsonb DEFAULT '[]',
  certifications jsonb DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE resumes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_own_resumes" ON resumes;
CREATE POLICY "select_own_resumes" ON resumes FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_resumes" ON resumes;
CREATE POLICY "insert_own_resumes" ON resumes FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_resumes" ON resumes;
CREATE POLICY "update_own_resumes" ON resumes FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_resumes" ON resumes;
CREATE POLICY "delete_own_resumes" ON resumes FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- interviews
CREATE TABLE IF NOT EXISTS interviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  difficulty text,
  type text,
  question_count int,
  transcript jsonb DEFAULT '[]',
  scores jsonb DEFAULT '{}',
  feedback jsonb DEFAULT '{}',
  overall_score numeric,
  status text DEFAULT 'completed',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE interviews ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_own_interviews" ON interviews;
CREATE POLICY "select_own_interviews" ON interviews FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_interviews" ON interviews;
CREATE POLICY "insert_own_interviews" ON interviews FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_interviews" ON interviews;
CREATE POLICY "update_own_interviews" ON interviews FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_interviews" ON interviews;
CREATE POLICY "delete_own_interviews" ON interviews FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- coding_evaluations
CREATE TABLE IF NOT EXISTS coding_evaluations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  language text,
  problem text,
  code text,
  evaluation jsonb DEFAULT '{}',
  score numeric,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE coding_evaluations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_own_coding_evaluations" ON coding_evaluations;
CREATE POLICY "select_own_coding_evaluations" ON coding_evaluations FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_coding_evaluations" ON coding_evaluations;
CREATE POLICY "insert_own_coding_evaluations" ON coding_evaluations FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_coding_evaluations" ON coding_evaluations;
CREATE POLICY "update_own_coding_evaluations" ON coding_evaluations FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_coding_evaluations" ON coding_evaluations;
CREATE POLICY "delete_own_coding_evaluations" ON coding_evaluations FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- roadmaps
CREATE TABLE IF NOT EXISTS roadmaps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  plan jsonb DEFAULT '{}',
  target_role text,
  target_company text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE roadmaps ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_own_roadmaps" ON roadmaps;
CREATE POLICY "select_own_roadmaps" ON roadmaps FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_roadmaps" ON roadmaps;
CREATE POLICY "insert_own_roadmaps" ON roadmaps FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_roadmaps" ON roadmaps;
CREATE POLICY "update_own_roadmaps" ON roadmaps FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_roadmaps" ON roadmaps;
CREATE POLICY "delete_own_roadmaps" ON roadmaps FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- chat_history
CREATE TABLE IF NOT EXISTS chat_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE chat_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_own_chat_history" ON chat_history;
CREATE POLICY "select_own_chat_history" ON chat_history FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_chat_history" ON chat_history;
CREATE POLICY "insert_own_chat_history" ON chat_history FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_chat_history" ON chat_history;
CREATE POLICY "update_own_chat_history" ON chat_history FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_chat_history" ON chat_history;
CREATE POLICY "delete_own_chat_history" ON chat_history FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- analytics
CREATE TABLE IF NOT EXISTS analytics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  overall_score numeric,
  coding_score numeric,
  communication_score numeric,
  technical_score numeric,
  behavioral_score numeric,
  skill_progress jsonb DEFAULT '{}',
  weak_areas text[] DEFAULT '{}',
  strong_areas text[] DEFAULT '{}',
  interviews_count int DEFAULT 0,
  snapshot_date timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE analytics ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_own_analytics" ON analytics;
CREATE POLICY "select_own_analytics" ON analytics FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_analytics" ON analytics;
CREATE POLICY "insert_own_analytics" ON analytics FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_analytics" ON analytics;
CREATE POLICY "update_own_analytics" ON analytics FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_analytics" ON analytics;
CREATE POLICY "delete_own_analytics" ON analytics FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_resumes_user_id ON resumes(user_id);
CREATE INDEX IF NOT EXISTS idx_interviews_user_id ON interviews(user_id);
CREATE INDEX IF NOT EXISTS idx_coding_evaluations_user_id ON coding_evaluations(user_id);
CREATE INDEX IF NOT EXISTS idx_roadmaps_user_id ON roadmaps(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_history_user_id ON chat_history(user_id);
CREATE INDEX IF NOT EXISTS idx_analytics_user_id ON analytics(user_id);
CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON profiles(user_id);
