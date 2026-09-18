// AI Chat Assistant edge function — streaming + RAG over user memory + knowledge base.
// Inlines the shared _ai.ts helpers (Supabase Edge Functions do not share code).

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";
const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

// Rate limiting: max 20 requests per 60s per user per endpoint
const RATE_LIMIT_WINDOW = 60;
const RATE_LIMIT_MAX = 20;

async function checkRateLimit(userId: string, endpoint: string): Promise<boolean> {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return true;
  try {
    const since = new Date(Date.now() - RATE_LIMIT_WINDOW * 1000).toISOString();
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/rate_limit_log?user_id=eq.${userId}&endpoint=eq.${endpoint}&created_at=gte.${since}&select=id`,
      { headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` } },
    );
    if (!res.ok) return true;
    const rows = await res.json();
    if (Array.isArray(rows) && rows.length >= RATE_LIMIT_MAX) return false;
    // Log this request
    await fetch(`${SUPABASE_URL}/rest/v1/rate_limit_log`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` },
      body: JSON.stringify({ user_id: userId, endpoint }),
    });
    return true;
  } catch { return true; }
}

const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;
const GEMINI_STREAM_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:streamGenerateContent?key=${GEMINI_API_KEY}&alt=sse`;
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const GEMINI_EMBED_URL = `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${GEMINI_API_KEY}`;

function hasAIKeys(): boolean {
  return GEMINI_API_KEY.length > 0 || GROQ_API_KEY.length > 0;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

async function embedText(text: string): Promise<number[] | null> {
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

async function retrieveRelevantHistory(userId: string, query: string, topK = 4) {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return [];
  const embedding = await embedText(query);
  try {
    if (embedding) {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/match_conversation_history`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` },
        body: JSON.stringify({ query_embedding: embedding, match_count: topK, query_user_id: userId }),
      });
      if (res.ok) {
        const rows = await res.json();
        if (Array.isArray(rows) && rows.length > 0) {
          return rows.map((r: any) => ({ role: r.role, content: r.content }));
        }
      }
    }
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

async function retrieveKnowledge(query: string, topK = 3) {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return [];
  const embedding = await embedText(query);
  if (!embedding) return [];
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/match_knowledge_chunks`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` },
      body: JSON.stringify({ query_embedding: embedding, match_count: topK }),
    });
    if (!res.ok) return [];
    const rows = await res.json();
    if (!Array.isArray(rows)) return [];
    return rows.map((r: any) => ({ content: r.content, source_category: r.source_category }));
  } catch {
    return [];
  }
}

async function getUserMemory(userId: string) {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return null;
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/user_ai_memory?user_id=eq.${userId}&select=resume_summary,preferred_language,weak_topics,strong_topics,company_preferences`,
      { headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` } },
    );
    if (!res.ok) return null;
    const arr = await res.json();
    if (!Array.isArray(arr) || arr.length === 0) return null;
    return arr[0];
  } catch {
    return null;
  }
}

async function appendConversationTurn(userId: string, role: string, content: string, feature: string) {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return;
  const embedding = await embedText(content);
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/conversation_history`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` },
      body: JSON.stringify({ user_id: userId, role, content, feature, embedding: embedding ?? null }),
    });
  } catch { /* best-effort */ }
}

async function userIdFromRequest(req: Request): Promise<string | null> {
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

type ChatMessage = { role: string; content: string };

async function* streamGemini(systemPrompt: string, messages: ChatMessage[], temperature: number): AsyncGenerator<string> {
  const contents = messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));
  const res = await fetch(GEMINI_STREAM_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents,
      generationConfig: { temperature },
    }),
  });
  if (!res.ok || !res.body) throw new Error(`Gemini stream error ${res.status}`);
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
      } catch { /* ignore */ }
    }
  }
  if (!yielded) throw new Error("Gemini stream empty");
}

async function* streamGroq(systemPrompt: string, messages: ChatMessage[], temperature: number): AsyncGenerator<string> {
  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${GROQ_API_KEY}` },
    body: JSON.stringify({
      model: "openai/gpt-oss-120b",
      messages: [
        { role: "system", content: systemPrompt },
        ...messages.map((m) => ({ role: m.role, content: m.content })),
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
}

async function* callAIStream(systemPrompt: string, messages: ChatMessage[], temperature = 0.6): AsyncGenerator<string> {
  if (!hasAIKeys()) throw new Error("No AI API keys configured");
  if (GEMINI_API_KEY) {
    try {
      for await (const chunk of streamGemini(systemPrompt, messages, temperature)) yield chunk;
      return;
    } catch { /* fall through */ }
  }
  if (GROQ_API_KEY) {
    for await (const chunk of streamGroq(systemPrompt, messages, temperature)) yield chunk;
    return;
  }
  throw new Error("No AI API keys configured");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { message, history, resumeText, stream } = await req.json();

    if (!message) {
      return new Response(JSON.stringify({ error: "message is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!hasAIKeys()) {
      return new Response(JSON.stringify({
        response: "AI keys are not configured. Please set GEMINI_API_KEY or GROQ_API_KEY in Supabase Edge Function secrets to enable the AI assistant.",
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const userId = await userIdFromRequest(req);

    // Rate limiting
    if (userId) {
      const allowed = await checkRateLimit(userId, "ai-chat");
      if (!allowed) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please wait a moment before sending more messages." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // RAG: pull relevant history + knowledge chunks + user memory (best-effort)
    const [relevantHistory, knowledgeChunks, memory] = await Promise.all([
      userId ? retrieveRelevantHistory(userId, message, 4) : Promise.resolve([]),
      retrieveKnowledge(message, 3),
      userId ? getUserMemory(userId) : Promise.resolve(null),
    ]);

    const memoryContext = memory
      ? [
          memory.resume_summary ? `Candidate summary: ${memory.resume_summary}` : null,
          memory.weak_topics?.length ? `Weak topics: ${memory.weak_topics.join(", ")}` : null,
          memory.strong_topics?.length ? `Strong topics: ${memory.strong_topics.join(", ")}` : null,
          memory.company_preferences?.length ? `Target companies: ${memory.company_preferences.join(", ")}` : null,
          memory.preferred_language ? `Preferred language: ${memory.preferred_language}` : null,
        ].filter(Boolean).join("\n")
      : "";

    const knowledgeContext = knowledgeChunks.length > 0
      ? knowledgeChunks.map((k, i) => `[${i + 1}] (${k.source_category}) ${k.content}`).join("\n")
      : "";

    const systemPrompt = `You are InterviewIQ AI, a helpful career coach and interview preparation assistant. You help with resume questions, career advice, interview prep, coding doubts, and behavioral questions.

Style: simple, accurate, and direct — like Claude or ChatGPT. Prefer short, well-organized answers over long, meandering ones. Use markdown, code blocks with syntax highlighting, and lists where they aid clarity. Do NOT pad responses.

Grounding rules:
- Use the candidate's resume context to give personalized advice when available.
- If the knowledge base and memory don't have an answer, say so plainly instead of guessing. Never fabricate citations or sources.
${resumeText ? `\nCandidate's resume context:\n${resumeText.slice(0, 4000)}` : ""}
${memoryContext ? `\nLong-term memory:\n${memoryContext}` : ""}
${knowledgeContext ? `\nRelevant knowledge base excerpts (use these to ground technical answers):\n${knowledgeContext}` : ""}`;

    // Build proper multi-turn conversation messages
    const chatMessages: ChatMessage[] = [];

    // Add history as alternating user/assistant turns
    if (history && Array.isArray(history)) {
      for (const msg of history.slice(-10)) {
        chatMessages.push({ role: msg.role === "user" ? "user" : "assistant", content: msg.content });
      }
    }

    // Inject RAG-retrieved prior turns as a context preamble (if not already in history)
    if (relevantHistory.length > 0) {
      const existingContents = new Set((history ?? []).map((m: any) => m.content));
      const ragTurns = relevantHistory.filter((r) => !existingContents.has(r.content));
      if (ragTurns.length > 0) {
        const ragText = ragTurns
          .map((r) => `${r.role === "user" ? "Candidate" : "Assistant"}: ${r.content}`)
          .join("\n");
        // Prepend as a system-level context message merged into the first user turn
        if (chatMessages.length > 0 && chatMessages[0].role === "user") {
          chatMessages[0].content = `[Relevant prior conversation]\n${ragText}\n\n${chatMessages[0].content}`;
        } else {
          chatMessages.unshift({ role: "user", content: `[Relevant prior conversation]\n${ragText}` });
          chatMessages.unshift({ role: "assistant", content: "Got it, I'll keep that context in mind." });
        }
      }
    }

    // Add the current user message
    chatMessages.push({ role: "user", content: message });

    // Persist the user turn to conversation_history (best-effort, async)
    if (userId) {
      appendConversationTurn(userId, "user", message, "chat");
    }

    // Streaming response
    if (stream) {
      const streamHeaders = {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
      };
      const encoder = new TextEncoder();
      let full = "";
      const body = new ReadableStream({
        async start(controller) {
          try {
            for await (const chunk of callAIStream(systemPrompt, chatMessages, 0.6)) {
              full += chunk;
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ chunk })}\n\n`));
            }
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`));
            if (userId) await appendConversationTurn(userId, "assistant", full, "chat");
          } catch (err) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: err.message })}\n\n`));
          } finally {
            controller.close();
          }
        },
      });
      return new Response(body, { headers: streamHeaders });
    }

    // Non-streaming fallback
    const text = await callAIPlainTextMultiTurn(systemPrompt, chatMessages, 0.6);
    if (userId) await appendConversationTurn(userId, "assistant", text, "chat");

    return new Response(JSON.stringify({ response: text }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

async function callAIPlainTextMultiTurn(systemPrompt: string, messages: ChatMessage[], temperature = 0.6): Promise<string> {
  if (GEMINI_API_KEY) {
    try {
      const contents = messages.map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      }));
      const res = await fetch(GEMINI_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents,
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
  if (GROQ_API_KEY) {
    const res = await fetch(GROQ_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${GROQ_API_KEY}` },
      body: JSON.stringify({
        model: "openai/gpt-oss-120b",
        messages: [
        { role: "system", content: systemPrompt },
        ...messages.map((m) => ({ role: m.role, content: m.content })),
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
