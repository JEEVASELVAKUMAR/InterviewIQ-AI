/*
# InterviewIQ AI — Vector similarity search RPC functions

## Purpose
Provides `match_conversation_history` and `match_knowledge_chunks` Postgres
functions that edge functions call via PostgREST to retrieve semantically
relevant rows from `conversation_history` and `knowledge_chunks` using
pgvector cosine distance. These power the RAG layer for all AI features.

## 1. Functions

### `match_conversation_history(query_embedding vector, match_count int, query_user_id uuid)`
Returns the user's most semantically similar conversation turns. Scoped to
the calling user via `query_user_id` so users cannot retrieve each other's
history. Ordered by cosine distance ascending (most similar first).

### `match_knowledge_chunks(query_embedding vector, match_count int)`
Returns the most semantically similar knowledge base chunks. The knowledge
base is a shared resource readable by all authenticated users, so no user
scoping is needed.

## 2. Security
- Both functions are `SECURITY DEFINER` so they can run with elevated
  privileges (the HNSW indexes are public, but the function gives a single
  controlled entry point).
- `match_conversation_history` enforces user scoping via the `query_user_id`
  parameter — the caller's user id is passed from the edge function, which
  extracts it from the verified JWT. A user can only retrieve their own turns.
- Both functions are marked `STABLE` and read-only.

## 3. Idempotency
- `CREATE OR REPLACE FUNCTION` is idempotent.

## 4. Backward Compatibility
- No existing tables or columns are modified.
*/

CREATE OR REPLACE FUNCTION match_conversation_history(
  query_embedding vector,
  match_count int DEFAULT 4,
  query_user_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  role text,
  content text,
  feature text,
  created_at timestamptz,
  similarity float
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    ch.id,
    ch.role,
    ch.content,
    ch.feature,
    ch.created_at,
    1 - (ch.embedding <=> query_embedding) AS similarity
  FROM conversation_history ch
  WHERE ch.user_id = query_user_id
    AND ch.embedding IS NOT NULL
  ORDER BY ch.embedding <=> query_embedding
  LIMIT GREATEST(1, LEAST(match_count, 20));
$$;

CREATE OR REPLACE FUNCTION match_knowledge_chunks(
  query_embedding vector,
  match_count int DEFAULT 3
)
RETURNS TABLE (
  id uuid,
  content text,
  source_category text,
  topic_tags text[],
  created_at timestamptz,
  similarity float
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    kc.id,
    kc.content,
    kc.source_category,
    kc.topic_tags,
    kc.created_at,
    1 - (kc.embedding <=> query_embedding) AS similarity
  FROM knowledge_chunks kc
  WHERE kc.embedding IS NOT NULL
  ORDER BY kc.embedding <=> query_embedding
  LIMIT GREATEST(1, LEAST(match_count, 20));
$$;
