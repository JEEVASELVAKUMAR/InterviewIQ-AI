// AI Coding Evaluator — supports Run (visible tests only) and Submit (all tests),
// plus a tiered AI Coding Assistant (hints → full explanation on request).
// Inlined AI helper.

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
    await fetch(`${SUPABASE_URL}/rest/v1/rate_limit_log`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` },
      body: JSON.stringify({ user_id: userId, endpoint }),
    });
    return true;
  } catch { return true; }
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

function hasAIKeys(): boolean {
  return GEMINI_API_KEY.length > 0 || GROQ_API_KEY.length > 0;
}

async function callGemini(systemPrompt: string, userPrompt: string, temperature = 0.4): Promise<string> {
  if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY not configured");
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      generationConfig: { temperature, responseMimeType: "application/json" },
    }),
  });
  if (!res.ok) { const err = await res.text(); throw new Error(`Gemini error ${res.status}: ${err}`); }
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini returned empty response");
  return text;
}

async function callGroq(systemPrompt: string, userPrompt: string, temperature = 0.4): Promise<string> {
  if (!GROQ_API_KEY) throw new Error("GROQ_API_KEY not configured");
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${GROQ_API_KEY}` },
    body: JSON.stringify({
      model: "openai/gpt-oss-120b",
      messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }],
      temperature,
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) { const err = await res.text(); throw new Error(`Groq error ${res.status}: ${err}`); }
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text) throw new Error("Groq returned empty response");
  return text;
}

async function callAI(systemPrompt: string, userPrompt: string, temperature = 0.4): Promise<string> {
  if (!hasAIKeys()) throw new Error("No AI API keys configured");
  for (let attempt = 0; attempt < 2; attempt++) {
    try { return await callGemini(systemPrompt, userPrompt, temperature); }
    catch (err) { if (attempt === 1) break; await new Promise((r) => setTimeout(r, 500 * Math.pow(2, attempt))); }
  }
  return callGroq(systemPrompt, userPrompt, temperature);
}

// Plain-text variant for hint responses (no JSON mode needed)
async function callAIPlainText(systemPrompt: string, userPrompt: string, temperature = 0.6): Promise<string> {
  if (!hasAIKeys()) throw new Error("No AI API keys configured");
  if (GEMINI_API_KEY) {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
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
  if (GROQ_API_KEY) {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${GROQ_API_KEY}` },
      body: JSON.stringify({
        model: "openai/gpt-oss-120b",
        messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }],
        temperature,
      }),
    });
    if (!res.ok) throw new Error(`Groq error ${res.status}`);
    const data = await res.json();
    return data?.choices?.[0]?.message?.content ?? "Sorry, I could not generate a response.";
  }
  throw new Error("No AI API keys configured");
}

function parseJSONResponse<T>(text: string): T {
  let cleaned = text.trim();
  if (cleaned.startsWith("```")) { cleaned = cleaned.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, ""); }
  return JSON.parse(cleaned) as T;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { action } = body;

    const userId = await userIdFromRequest(req);
    if (userId) {
      const allowed = await checkRateLimit(userId, "ai-coding");
      if (!allowed) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please wait a moment before sending more requests." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // ---- AI Coding Assistant: tiered hints ----
    if (action === "hint") {
      const { problem, code, language, hintLevel } = body;
      if (!problem) {
        return new Response(JSON.stringify({ error: "Problem is required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (!hasAIKeys()) {
        return new Response(JSON.stringify({ hint: "AI keys not configured. Set GEMINI_API_KEY or GROQ_API_KEY in Supabase Edge Function secrets." }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const levelText: Record<number, string> = {
        1: "Give a gentle nudge — point the candidate toward the right direction without revealing the approach.",
        2: "Give a more specific hint — name the data structure or algorithm pattern they should consider.",
        3: "Describe the algorithm direction step by step, but do NOT write the full solution code.",
        4: "Suggest specific optimizations to their existing code (if any), or describe the optimal approach.",
        5: "List edge cases they should handle (empty input, null, overflow, single element, etc.).",
        6: "Provide a full complexity analysis (time + space) with brief reasoning for the optimal approach.",
      };

      const systemPrompt = `You are a coding interview mentor. You help candidates by giving tiered guidance — never revealing the full solution unless explicitly asked. Be concise and specific to the problem. Respond in plain text, not JSON.`;
      const userPrompt = `Problem: ${problem}
Language: ${language}
${code ? `Candidate's current code:\n\`\`\`${language}\n${code}\n\`\`\`` : "No code written yet."}

Hint Level ${hintLevel}: ${levelText[hintLevel] ?? "Give a helpful hint."}

${hintLevel === 7 ? "The candidate has explicitly requested the full solution. Provide the complete, well-commented solution with explanation." : "Do NOT write the full solution code. Only guide."}`;

      const text = await callAIPlainText(systemPrompt, userPrompt, 0.5);
      return new Response(JSON.stringify({ hint: text }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ---- Default: evaluate code ----
    const { language, problem, code, testCases, mode } = body;

    if (!code || code.length < 5) {
      return new Response(JSON.stringify({ error: "Code is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!hasAIKeys()) {
      return new Response(JSON.stringify({
        testCaseResults: (testCases ?? []).map((tc: any) => ({
          id: tc.id, passed: false, expected: tc.expected ?? "", actual: "AI keys not configured",
        })),
        timeComplexity: "Unknown", spaceComplexity: "Unknown", codeQuality: 0,
        edgeCasesHandled: false, bugsDetected: ["AI keys not configured"], finalScore: 0,
        suggestedImprovements: ["Set GEMINI_API_KEY or GROQ_API_KEY in Supabase Edge Function secrets"],
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const isRun = mode === "run";
    const testsToEvaluate = isRun
      ? (testCases ?? []).filter((tc: any) => !tc.hidden)
      : (testCases ?? []);

    const systemPrompt = `You are a strict coding judge (like LeetCode). Always respond in valid JSON only. Evaluate the code against the provided test cases. For each test case, determine if the code would produce the expected output. Also analyze time/space complexity, code quality, edge case handling, and bugs. Be strict — partial credit only for partially correct solutions.${isRun ? " This is a RUN (sample tests only) — focus on quick pass/fail feedback." : " This is a SUBMIT (all tests including hidden) — apply the full scoring formula."}`;

    const userPrompt = `Evaluate this code solution.

Language: ${language}
Problem: ${problem}

Code:
\`\`\`${language}
${code}
\`\`\`

Test cases to verify against:
${JSON.stringify(testsToEvaluate, null, 2)}

Return JSON with this exact schema:
{
  "testCaseResults": [
    {
      "id": number,
      "passed": boolean,
      "expected": "expected output as string",
      "actual": "what the code would actually produce, or 'N/A' if it would error"
    }
  ],
  "timeComplexity": "Big-O notation with brief reasoning (e.g. 'O(n) - single pass through array')",
  "spaceComplexity": "Big-O notation with brief reasoning",
  "codeQuality": number (0-100, assess naming, structure, readability, comments),
  "edgeCasesHandled": boolean (does the code handle edge cases like empty input, null, overflow?),
  "bugsDetected": ["list of any bugs found, empty if none"],
  "finalScore": number (0-100, calculated as: (testCasesPassed% × 0.70) + (efficiencyScore × 0.15) + (codeQualityScore × 0.15), where efficiencyScore is based on time/space complexity quality 0-100),
  "suggestedImprovements": ["actionable suggestions to improve the solution"]
}

Evaluate each test case by mentally executing the code. If the code would crash on a test case, mark it as failed with actual = "Runtime error".${isRun ? " In Run mode, finalScore may be 0 — focus on pass/fail of the visible tests." : ""}`;

    const text = await callAI(systemPrompt, userPrompt, 0.2);
    const result = parseJSONResponse(text);
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
