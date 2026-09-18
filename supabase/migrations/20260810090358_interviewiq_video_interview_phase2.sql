/*
# AI Voice/Video Interview — Phase 2

Extends the Phase 1 schema for live interview sessions.
No existing columns are dropped or renamed; only additive changes.

1. New Tables
- `interview_answers`: stores each candidate answer (transcript + recording URLs).
  - id (uuid PK)
  - session_id (uuid, FK interview_sessions, CASCADE)
  - question_id (uuid, FK interview_questions, CASCADE)
  - question_text (text) — snapshot of the question at answer time (supports dynamic follow-ups)
  - transcript (text, nullable) — speech-to-text result
  - video_url (text, nullable) — Supabase Storage path for video recording
  - audio_url (text, nullable) — Supabase Storage path for audio-only recording
  - answered_at (timestamptz, default now())

2. Modified Tables (additive only)
- `interview_sessions`: widen the `status` CHECK constraint to include
  'in_progress' and 'completed' (in addition to existing 'setup','active','expired').
  Done via DROP CONSTRAINT + ADD CONSTRAINT — no data is lost.

3. Storage
- Create `interview-recordings` bucket (private) for video/audio uploads.

4. Security
- RLS enabled on `interview_answers`.
- Owner-scoped through parent session (EXISTS subquery), 4 policies.
- Storage bucket is private; access via signed URLs (server-side upload only).
*/

-- 1. Widen interview_sessions.status CHECK constraint
ALTER TABLE interview_sessions DROP CONSTRAINT IF EXISTS interview_sessions_status_check;
ALTER TABLE interview_sessions ADD CONSTRAINT interview_sessions_status_check
  CHECK (status IN ('setup','active','in_progress','completed','expired'));

-- 2. Create interview_answers table
CREATE TABLE IF NOT EXISTS interview_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES interview_sessions(id) ON DELETE CASCADE,
  question_id uuid REFERENCES interview_questions(id) ON DELETE SET NULL,
  question_text text NOT NULL,
  transcript text,
  video_url text,
  audio_url text,
  answered_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE interview_answers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_interview_answers" ON interview_answers;
CREATE POLICY "select_own_interview_answers" ON interview_answers
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM interview_sessions s WHERE s.id = session_id AND s.user_id = auth.uid()));

DROP POLICY IF EXISTS "insert_own_interview_answers" ON interview_answers;
CREATE POLICY "insert_own_interview_answers" ON interview_answers
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM interview_sessions s WHERE s.id = session_id AND s.user_id = auth.uid()));

DROP POLICY IF EXISTS "update_own_interview_answers" ON interview_answers;
CREATE POLICY "update_own_interview_answers" ON interview_answers
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM interview_sessions s WHERE s.id = session_id AND s.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM interview_sessions s WHERE s.id = session_id AND s.user_id = auth.uid()));

DROP POLICY IF EXISTS "delete_own_interview_answers" ON interview_answers;
CREATE POLICY "delete_own_interview_answers" ON interview_answers
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM interview_sessions s WHERE s.id = session_id AND s.user_id = auth.uid()));

-- 3. Storage bucket for recordings (private)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'interview-recordings',
  'interview-recordings',
  false,
  104857600, -- 100 MB limit
  ARRAY['video/webm', 'audio/webm', 'audio/ogg', 'video/mp4', 'audio/mp4']
) ON CONFLICT (id) DO NOTHING;

-- Storage RLS: users can upload/read/delete only their own recordings
DROP POLICY IF EXISTS "users_upload_own_recordings" ON storage.objects;
CREATE POLICY "users_upload_own_recordings" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'interview-recordings' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "users_read_own_recordings" ON storage.objects;
CREATE POLICY "users_read_own_recordings" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'interview-recordings' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "users_delete_own_recordings" ON storage.objects;
CREATE POLICY "users_delete_own_recordings" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'interview-recordings' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Add index for common query: get all answers for a session, ordered by time
CREATE INDEX IF NOT EXISTS idx_interview_answers_session_id ON interview_answers(session_id, answered_at);