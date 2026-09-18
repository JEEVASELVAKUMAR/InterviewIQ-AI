/*
# InterviewIQ AI — Security audit fixes (Phase 9)

## Summary
Tightens database security to clear Supabase security audit warnings:
1. Pins search_path on three mutable-path functions.
2. Moves the vector extension out of public into a dedicated `extensions` schema.
3. Removes the always-true write policies on coding_problems (admin-managed content).
4. Locks down the two match_* RPC functions (SECURITY INVOKER + auth check for
   conversation history; SECURITY DEFINER + anon revoked for knowledge chunks).

## 1. Function search path (search_path mutable)
- `match_conversation_history` — SET search_path = extensions, public, pg_temp
  (extensions needed so the `vector` type + `<=>` operator resolve after the
  extension move; pg_temp last prevents hijacking).
- `match_knowledge_chunks` — SET search_path = extensions, public, pg_temp.
- `knowledge_chunks_set_prefix` — SET search_path = public, pg_temp (trigger
  function; does not touch the vector type).

## 2. Vector extension relocation
- Creates schema `extensions` if it does not exist.
- Moves the `vector` extension from public to extensions. Existing table columns
  of type `vector(768)` keep working (they reference the type by OID). The match
  functions get `extensions` in their search_path so `vector` and `<=>` resolve.

## 3. RLS on coding_problems (always-true write policies)
- coding_problems is a curated, admin-managed problem bank with no user_id
  column — it is shared content, not user-owned. SELECT stays open to all
  authenticated users; INSERT/UPDATE/DELETE are removed entirely so only the
  service role (which bypasses RLS) can manage problems. This matches the
  table's design: seeded once, read by everyone, written only via service role.

## 4. SECURITY DEFINER functions publicly executable
- `match_conversation_history`: switched to SECURITY INVOKER and the body now
  requires `query_user_id = auth.uid()` before returning any rows. RLS on
  conversation_history also enforces ownership. EXECUTE revoked from anon.
- `match_knowledge_chunks`: kept SECURITY DEFINER (shared read-only knowledge
  base search that must bypass RLS to read all chunks) but EXECUTE revoked from
  anon so unauthenticated callers cannot invoke it; granted to authenticated.

## 5. Idempotency
- `CREATE SCHEMA IF NOT EXISTS`
- Extension move is guarded by a check on the current extension schema.
- Functions use `CREATE OR REPLACE`.
- Policies are dropped before re-creating.

## 6. Backward Compatibility
- No tables or columns dropped or renamed.
- No data migrated.
- All existing app flows (RAG search, coding eval problem bank) keep working.
*/

-- 1. Create dedicated schema for extensions
CREATE SCHEMA IF NOT EXISTS extensions;

-- 2. Move vector extension out of public into extensions (guarded)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_extension e
    JOIN pg_namespace n ON n.oid = e.extnamespace
    WHERE e.extname = 'vector' AND n.nspname = 'public'
  ) THEN
    ALTER EXTENSION vector SET SCHEMA extensions;
  END IF;
END $$;

-- 3. match_conversation_history: SECURITY INVOKER + auth.uid() check + pinned search_path
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
SECURITY INVOKER
SET search_path = extensions, public, pg_temp
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
    AND query_user_id = auth.uid()
    AND ch.embedding IS NOT NULL
  ORDER BY ch.embedding <=> query_embedding
  LIMIT GREATEST(1, LEAST(match_count, 20));
$$;

REVOKE EXECUTE ON FUNCTION match_conversation_history(vector, int, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION match_conversation_history(vector, int, uuid) TO authenticated;

-- 4. match_knowledge_chunks: SECURITY DEFINER kept, anon revoked, pinned search_path
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
SET search_path = extensions, public, pg_temp
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

REVOKE EXECUTE ON FUNCTION match_knowledge_chunks(vector, int) FROM anon;
GRANT EXECUTE ON FUNCTION match_knowledge_chunks(vector, int) TO authenticated;

-- 5. knowledge_chunks_set_prefix: pin search_path (trigger function, no vector use)
ALTER FUNCTION knowledge_chunks_set_prefix() SET search_path = public, pg_temp;

-- 6. coding_problems: remove always-true write policies (admin-managed content)
DROP POLICY IF EXISTS "insert_coding_problems" ON coding_problems;
DROP POLICY IF EXISTS "update_coding_problems" ON coding_problems;
DROP POLICY IF EXISTS "delete_coding_problems" ON coding_problems;
