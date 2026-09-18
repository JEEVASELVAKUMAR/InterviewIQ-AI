/*
# InterviewIQ AI — AI Memory + RAG Knowledge Base (pgvector)

## Purpose
Introduces long-term AI personalization and retrieval-augmented generation (RAG)
for the InterviewIQ platform. Until now, AI features (chat, interview, roadmap,
skill-gap, coding eval) only had access to the latest resume + the last few chat
messages. With this migration, every AI feature can ground its responses in the
user's accumulated memory and a curated internal knowledge base.

## 1. Extensions
- Enables `vector` (pgvector v0.8.2) in the public schema. This adds the `vector`
  column type and cosine-distance operators used for semantic search. The
  extension was already listed as available on the project but not installed.

## 2. New Tables

### `user_ai_memory`
Per-user long-term memory updated after every meaningful AI interaction
(interview completed, coding session submitted, resume uploaded, roadmap
generated). Read by every AI edge function before generating a response so the
AI can personalize answers without re-reading the entire resume every time.
- `id` (uuid PK)
- `user_id` (uuid, FK auth.users, DEFAULT auth.uid(), ON DELETE CASCADE) — owner
- `resume_summary` (text) — short summary of latest resume
- `preferred_language` (text) — preferred coding/interview language
- `weak_topics` (text[]) — topics the user struggles with
- `strong_topics` (text[]) — topics the user is strong in
- `interview_progress` (jsonb) — running stats (interviews done, avg scores, etc.)
- `active_roadmap_id` (uuid, nullable) — FK to roadmaps.id, NULL by default
- `company_preferences` (text[]) — companies the user is targeting
- `updated_at` (timestamptz, default now())
- Unique constraint on user_id so only one memory row per user.

### `conversation_history`
Long-running log of every user/assistant turn across ALL AI features (chat,
interview, coding, roadmap, skill-gap). Used as the RAG source for grounding
future AI responses in what the user has previously discussed.
- `id` (uuid PK)
- `user_id` (uuid, FK auth.users, DEFAULT auth.uid(), ON DELETE CASCADE)
- `role` (text) — 'user' | 'assistant'
- `content` (text) — the message text
- `feature` (text) — which feature produced this turn
  ('chat' | 'interview' | 'coding' | 'roadmap' | 'skill_gap' | 'resume')
- `embedding` (vector(768), nullable) — pgvector embedding of `content`.
  768 dims matches Gemini's text-embedding-004 model. Nullable because the
  embedding is generated asynchronously by an edge function and may be missing
  on rows written before embedding was wired up.
- `created_at` (timestamptz, default now())
- Index on user_id + created_at for time-ordered reads.
- HNSW index on embedding for fast cosine similarity search.

### `knowledge_chunks`
Internal curated knowledge base (CS fundamentals, common interview patterns,
language/framework concepts). Written/generated content only — never scraped
from LeetCode, HackerRank, or any proprietary site. AI features retrieve from
this table via pgvector similarity search before answering technical questions.
- `id` (uuid PK)
- `content` (text, NOT NULL) — the knowledge text
- `source_category` (text) — e.g. 'dsa', 'system-design', 'behavioral', 'language'
- `topic_tags` (text[]) — fine-grained topic labels
- `embedding` (vector(768), nullable) — pgvector embedding of `content`
- `created_at` (timestamptz, default now())
- HNSW index on embedding for fast cosine similarity search.

## 3. Security (RLS)
All three tables have RLS enabled with owner-scoped policies for authenticated
users. `knowledge_chunks` is a shared resource: every authenticated user can
read it (it's the shared knowledge base) but only service-role / edge functions
write to it, so we add a SELECT-only policy for authenticated users and no
INSERT/UPDATE/DELETE policy (writes happen via the service role key from edge
functions, which bypasses RLS).

`user_ai_memory` and `conversation_history` are fully owner-scoped CRUD.

## 4. Idempotency
- `CREATE EXTENSION IF NOT EXISTS`
- `CREATE TABLE IF NOT EXISTS`
- Columns use `IF NOT EXISTS` checks where relevant
- Policies are dropped before re-creating (CREATE POLICY does not support IF NOT EXISTS reliably)

## 5. Backward Compatibility
- No existing table is dropped, renamed, or column-altered.
- No data is migrated or transformed.
- Existing `chat_history` table remains in use; `conversation_history` is an
  additive, richer log that includes embeddings and cross-feature turns.
*/

-- 1. Enable pgvector
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. user_ai_memory
CREATE TABLE IF NOT EXISTS user_ai_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  resume_summary text,
  preferred_language text,
  weak_topics text[] DEFAULT '{}',
  strong_topics text[] DEFAULT '{}',
  interview_progress jsonb DEFAULT '{}'::jsonb,
  active_roadmap_id uuid,
  company_preferences text[] DEFAULT '{}',
  updated_at timestamptz DEFAULT now(),
  UNIQUE (user_id)
);

ALTER TABLE user_ai_memory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_ai_memory" ON user_ai_memory;
CREATE POLICY "select_own_ai_memory" ON user_ai_memory FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_ai_memory" ON user_ai_memory;
CREATE POLICY "insert_own_ai_memory" ON user_ai_memory FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_ai_memory" ON user_ai_memory;
CREATE POLICY "update_own_ai_memory" ON user_ai_memory FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_ai_memory" ON user_ai_memory;
CREATE POLICY "delete_own_ai_memory" ON user_ai_memory FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_user_ai_memory_user_id ON user_ai_memory(user_id);

-- 3. conversation_history
CREATE TABLE IF NOT EXISTS conversation_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL,
  content text NOT NULL,
  feature text,
  embedding vector(768),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE conversation_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_conversation_history" ON conversation_history;
CREATE POLICY "select_own_conversation_history" ON conversation_history FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_conversation_history" ON conversation_history;
CREATE POLICY "insert_own_conversation_history" ON conversation_history FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_conversation_history" ON conversation_history;
CREATE POLICY "update_own_conversation_history" ON conversation_history FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_conversation_history" ON conversation_history;
CREATE POLICY "delete_own_conversation_history" ON conversation_history FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_conversation_history_user_created
  ON conversation_history(user_id, created_at DESC);

-- HNSW index for fast cosine similarity search on embeddings
CREATE INDEX IF NOT EXISTS idx_conversation_history_embedding
  ON conversation_history USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- 4. knowledge_chunks
CREATE TABLE IF NOT EXISTS knowledge_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content text NOT NULL,
  source_category text,
  topic_tags text[] DEFAULT '{}',
  embedding vector(768),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE knowledge_chunks ENABLE ROW LEVEL SECURITY;

-- Shared read access for all authenticated users. No INSERT/UPDATE/DELETE
-- policies: writes happen via the service role key from edge functions, which
-- bypasses RLS. This keeps the knowledge base read-only from the client.
DROP POLICY IF EXISTS "read_knowledge_chunks" ON knowledge_chunks;
CREATE POLICY "read_knowledge_chunks" ON knowledge_chunks FOR SELECT
  TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_category
  ON knowledge_chunks(source_category);

CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_embedding
  ON knowledge_chunks USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
