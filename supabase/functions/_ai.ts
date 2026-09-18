// Shared AI helper for edge functions — Gemini primary, Groq fallback.
// Each edge function inlines a copy of this (Supabase Edge Functions do not
// share code across function boundaries). This file is the canonical source
// of truth — copy from here when creating or updating a function.

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";
const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY") ?? "";

const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;
const GEMINI_STREAM_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:streamGenerateContent?key=${GEMINI_API_KEY}&alt=sse`;
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_STREAM_URL = "https://api.groq.com/openai/v1/chat/completions";
const GEMINI_EMBED_URL = `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${GEMINI_API_KEY}`;

export function hasAIKeys(): boolean {
  return GEMINI_API_KEY.length > 0 || GROQ_API_KEY.length > 0;
}

async function callGemini(systemPrompt: string, userPrompt: string, temperature = 0.4): Promise<string> {
  if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY not configured");
  const res = await fetch(GEMINI_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      generationConfig: { temperature, responseMimeType: "application/json" },
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini error ${res.status}: ${err}`);
  }
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini returned empty response");
  return text;
}

async function callGroq(systemPrompt: string, userPrompt: string, temperature = 0.4): Promise<string> {
  if (!GROQ_API_KEY) throw new Error("GROQ_API_KEY not configured");
  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: "openai/gpt-oss-120b",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature,
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Groq error ${res.status}: ${err}`);
  }
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text) throw new Error("Groq returned empty response");
  return text;
}

// Exponential backoff retry + fallback from Gemini to Groq.
export async function callAI(systemPrompt: string, userPrompt: string, temperature = 0.4): Promise<string> {
  if (!hasAIKeys()) {
    throw new Error("No AI API keys configured. Set GEMINI_API_KEY or GROQ_API_KEY in Supabase Edge Function secrets.");
  }

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await callGemini(systemPrompt, userPrompt, temperature);
    } catch (err) {
      if (attempt === 1) break;
      await new Promise((r) => setTimeout(r, 500 * Math.pow(2, attempt)));
    }
  }
  return callGroq(systemPrompt, userPrompt, temperature);
}

// Plain-text (non-JSON) variant for chat responses.
export async function callAIPlainText(systemPrompt: string, userPrompt: string, temperature = 0.6): Promise<string> {
  if (!hasAIKeys()) {
    throw new Error("No AI API keys configured.");
  }
  // Try Gemini without JSON mode
  if (GEMINI_API_KEY) {
    try {
      const res = await fetch(GEMINI_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: "user", parts: [{ text: userPrompt }] }],
          generationConfig: { temperature },
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) return text;
      }
    } catch { /* fall through */ }
  }
  // Fallback to Groq
  if (GROQ_API_KEY) {
    const res = await fetch(GROQ_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${GROQ_API_KEY}` },
      body: JSON.stringify({
        model: "openai/gpt-oss-120b",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature,
      }),
    });
    if (!res.ok) throw new Error(`Groq error ${res.status}`);
    const data = await res.json();
    return data?.choices?.[0]?.message?.content ?? "Sorry, I could not generate a response.";
  }
  throw new Error("No AI API keys configured");
}

// Streaming variant — yields text chunks via an async generator.
// Used by the chat assistant for ChatGPT-style progressive rendering.
export async function* callAIStream(
  systemPrompt: string,
  userPrompt: string,
  temperature = 0.6,
): AsyncGenerator<string, void, unknown> {
  if (!hasAIKeys()) throw new Error("No AI API keys configured.");

  // Try Gemini streaming first
  if (GEMINI_API_KEY) {
    try {
      const res = await fetch(GEMINI_STREAM_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: "user", parts: [{ text: userPrompt }] }],
          generationConfig: { temperature },
        }),
      });
      if (res.ok && res.body) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let yielded = false;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data:")) continue;
            const payload = trimmed.slice(5).trim();
            if (!payload || payload === "[DONE]") continue;
            try {
              const json = JSON.parse(payload);
              const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
              if (text) {
                yielded = true;
                yield text;
              }
            } catch { /* ignore partial */ }
          }
        }
        if (yielded) return;
      }
    } catch { /* fall through to Groq */ }
  }

  // Fallback: Groq streaming
  if (GROQ_API_KEY) {
    const res = await fetch(GROQ_STREAM_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${GROQ_API_KEY}` },
      body: JSON.stringify({
        model: "openai/gpt-oss-120b",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature,
        stream: true,
      }),
    });
    if (!res.ok || !res.body) throw new Error(`Groq stream error ${res.status}`);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const payload = trimmed.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        try {
          const json = JSON.parse(payload);
          const delta = json?.choices?.[0]?.delta?.content;
          if (delta) yield delta;
        } catch { /* ignore */ }
      }
    }
    return;
  }
  throw new Error("No AI API keys configured");
}

// Generate a 768-dim embedding via Gemini text-embedding-004.
// Returns null if Gemini isn't configured (caller should still persist the row).
export async function embedText(text: string): Promise<number[] | null> {
  if (!GEMINI_API_KEY) return null;
  try {
    const res = await fetch(GEMINI_EMBED_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "models/text-embedding-004",
        content: { parts: [{ text: text.slice(0, 8000) }] },
        taskType: "RETRIEVAL_DOCUMENT",
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const values = data?.embedding?.values;
    if (Array.isArray(values) && values.length > 0) return values as number[];
    return null;
  } catch {
    return null;
  }
}

export function parseJSONResponse<T>(text: string): T {
  let cleaned = text.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }
  return JSON.parse(cleaned) as T;
}

// ---- RAG memory retrieval helpers (used by edge functions) ----
// These use the service role key to read user-scoped rows, since edge functions
// run with elevated privileges and need to read across the user's own data.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

export interface MemorySnapshot {
  resumeSummary?: string;
  preferredLanguage?: string;
  weakTopics: string[];
  strongTopics: string[];
  companyPreferences: string[];
  interviewProgress: any;
}

// Fetch the user's long-term memory row.
export async function getUserMemory(userId: string): Promise<MemorySnapshot | null> {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return null;
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/user_ai_memory?user_id=eq.${userId}&select=resume_summary,preferred_language,weak_topics,strong_topics,company_preferences,interview_progress`,
      { headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` } },
    );
    if (!res.ok) return null;
    const arr = await res.json();
    if (!Array.isArray(arr) || arr.length === 0) return null;
    const m = arr[0];
    return {
      resumeSummary: m.resume_summary,
      preferredLanguage: m.preferred_language,
      weakTopics: m.weak_topics ?? [],
      strongTopics: m.strong_topics ?? [],
      companyPreferences: m.company_preferences ?? [],
      interviewProgress: m.interview_progress,
    };
  } catch {
    return null;
  }
}

// Retrieve the top-N most semantically relevant conversation turns for a query.
// Falls back to most-recent turns if embeddings are unavailable.
export async function retrieveRelevantHistory(
  userId: string,
  query: string,
  topK = 4,
): Promise<{ role: string; content: string }[]> {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return [];
  const embedding = await embedText(query);
  try {
    if (embedding) {
      // Use pgvector cosine similarity via RPC-free REST: order by distance
      // using the `<=>` operator through a PostgREST remote procedure call.
      // We use a direct select with an embedded order via the vector column.
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/rpc/match_conversation_history`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` },
          body: JSON.stringify({ query_embedding: embedding, match_count: topK, query_user_id: userId }),
        },
      );
      if (res.ok) {
        const rows = await res.json();
        if (Array.isArray(rows) && rows.length > 0) {
          return rows.map((r: any) => ({ role: r.role, content: r.content }));
        }
      }
    }
    // Fallback: most recent turns
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/conversation_history?user_id=eq.${userId}&order=created_at.desc&limit=${topK}&select=role,content`,
      { headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` } },
    );
    if (!res.ok) return [];
    const rows = await res.json();
    if (!Array.isArray(rows)) return [];
    return rows.map((r: any) => ({ role: r.role, content: r.content })).reverse();
  } catch {
    return [];
  }
}

// Retrieve top-N knowledge chunks relevant to a query (RAG over curated KB).
export async function retrieveKnowledge(
  query: string,
  topK = 3,
): Promise<{ content: string; source_category: string }[]> {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return [];
  const embedding = await embedText(query);
  if (!embedding) return [];
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/rpc/match_knowledge_chunks`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` },
        body: JSON.stringify({ query_embedding: embedding, match_count: topK }),
      },
    );
    if (!res.ok) return [];
    const rows = await res.json();
    if (!Array.isArray(rows)) return [];
    return rows.map((r: any) => ({ content: r.content, source_category: r.source_category }));
  } catch {
    return [];
  }
}

// Append a turn to conversation_history (with optional embedding).
export async function appendConversationTurn(
  userId: string,
  role: string,
  content: string,
  feature: string,
): Promise<void> {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return;
  const embedding = await embedText(content);
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/conversation_history`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` },
      body: JSON.stringify({
        user_id: userId,
        role,
        content,
        feature,
        embedding: embedding ?? null,
      }),
    });
  } catch { /* best-effort */ }
}

// Upsert the user's memory row.
export async function upsertUserMemory(
  userId: string,
  updates: Partial<MemorySnapshot>,
): Promise<void> {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return;
  const body: Record<string, unknown> = { user_id: userId, updated_at: new Date().toISOString() };
  if (updates.resumeSummary !== undefined) body.resume_summary = updates.resumeSummary;
  if (updates.preferredLanguage !== undefined) body.preferred_language = updates.preferredLanguage;
  if (updates.weakTopics !== undefined) body.weak_topics = updates.weakTopics;
  if (updates.strongTopics !== undefined) body.strong_topics = updates.strongTopics;
  if (updates.companyPreferences !== undefined) body.company_preferences = updates.companyPreferences;
  if (updates.interviewProgress !== undefined) body.interview_progress = updates.interviewProgress;
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/user_ai_memory`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        Prefer: "resolution=merge-duplicates",
      },
      body: JSON.stringify(body),
    });
  } catch { /* best-effort */ }
}

// Extract the user id from the request's JWT (for edge functions that need to
// read memory scoped to the calling user).
export async function userIdFromRequest(req: Request): Promise<string | null> {
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return null;
  const token = auth.slice(7);
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
    return payload?.sub ?? null;
  } catch {
    return null;
  }
}
