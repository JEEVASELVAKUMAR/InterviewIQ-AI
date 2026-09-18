// AI Roadmap generator — uses user memory + updates active_roadmap_id after generation.
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

function parseJSONResponse<T>(text: string): T {
  let cleaned = text.trim();
  if (cleaned.startsWith("```")) { cleaned = cleaned.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, ""); }
  return JSON.parse(cleaned) as T;
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

async function getUserMemory(userId: string) {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return null;
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/user_ai_memory?user_id=eq.${userId}&select=resume_summary,weak_topics,strong_topics,company_preferences,active_roadmap_id`,
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

async function upsertUserMemory(userId: string, updates: Record<string, unknown>): Promise<void> {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return;
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/user_ai_memory`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        Prefer: "resolution=merge-duplicates",
      },
      body: JSON.stringify({ user_id: userId, updated_at: new Date().toISOString(), ...updates }),
    });
  } catch { /* best-effort */ }
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
      const allowed = await checkRateLimit(userId, "ai-roadmap");
      if (!allowed) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please wait a moment before sending more requests." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    if (!hasAIKeys()) {
      return new Response(JSON.stringify({
        phases: [{
          phaseTitle: "AI Keys Not Configured",
          durationDays: body.timeframe ?? 60,
          reasoning: "Please set GEMINI_API_KEY or GROQ_API_KEY in Supabase Edge Function secrets.",
          dailyTasks: [], weeklyGoals: [], miniProjects: [],
          checkpointMockInterview: false, resources: [],
        }],
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "refine") {
      const { currentRoadmap, refinementPrompt } = body;
      if (!currentRoadmap || !refinementPrompt) {
        return new Response(JSON.stringify({ error: "Current roadmap and refinement prompt are required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const systemPrompt = `You are an expert career mentor adjusting a personalized learning roadmap. Always respond in valid JSON only. Apply the user's refinement request to the roadmap — only modify the relevant phases, keep the rest unchanged. Keep the same schema including resources with real URLs.`;

      const userPrompt = `Here is the current roadmap:
${JSON.stringify(currentRoadmap, null, 2)}

The user wants this change: "${refinementPrompt}"

Apply the change and return the FULL updated roadmap with the same schema:
{
  "phases": [
    {
      "phaseTitle": "string",
      "durationDays": number,
      "reasoning": "short mentor-style explanation for this phase",
      "learningOrder": number,
      "prerequisites": ["string"],
      "difficulty": "Beginner | Intermediate | Advanced",
      "dailyTasks": ["task1", "task2"],
      "weeklyGoals": ["goal1", "goal2"],
      "monthlyGoals": ["goal1"],
      "miniProjects": ["project1"],
      "milestones": ["milestone1"],
      "interviewReadinessGoals": ["goal1"],
      "checkpointMockInterview": boolean,
      "resources": [{ "title": "resource name", "url": "real valid URL", "type": "doc | course | tutorial | practice | book" }]
    }
  ]
}`;

      const text = await callAI(systemPrompt, userPrompt, 0.5);
      const result = parseJSONResponse(text);
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Default: generate roadmap
    const {
      resumeText, interviewHistory, codingScore,
      targetCompany, targetRole, currentLevel,
      hoursPerDay, timeframe, weakAreas,
    } = body;

    if (!targetCompany || !targetRole) {
      return new Response(JSON.stringify({ error: "Target company and role are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // RAG: pull user memory to personalize
    const userId = await userIdFromRequest(req);
    const memory = userId ? await getUserMemory(userId) : null;
    const memoryContext = memory
      ? [
          memory.resume_summary ? `Resume summary: ${memory.resume_summary}` : null,
          memory.weak_topics?.length ? `Known weak topics: ${memory.weak_topics.join(", ")}` : null,
          memory.strong_topics?.length ? `Known strong topics: ${memory.strong_topics.join(", ")}` : null,
        ].filter(Boolean).join("\n")
      : "";

    const systemPrompt = `You are an expert career mentor creating a personalized learning roadmap. Always respond in valid JSON only. Create a phased plan specific to the candidate's current level, target company, target role, and available time. Each phase must have concrete daily tasks, weekly goals, monthly goals, mini projects, milestones, prerequisites, difficulty, learning order, and resources with real URLs. Include reasoning for each phase.`;

    const userPrompt = `Create a ${timeframe ?? 60}-day personalized roadmap for a ${currentLevel ?? 'Beginner'}-level candidate targeting ${targetCompany} - ${targetRole}.

Context:
- Current level: ${currentLevel ?? 'Beginner'}
- Available hours/day: ${hoursPerDay ?? 2}
- Timeframe: ${timeframe ?? 60} days
- Weak areas: ${weakAreas ?? 'Not specified'}
${resumeText ? `- Resume excerpt: ${resumeText.slice(0, 3000)}` : ''}
${memoryContext ? `- Long-term memory:\n${memoryContext}` : ''}
${interviewHistory?.length > 0 ? `- Recent interview scores: ${JSON.stringify(interviewHistory.slice(0, 3).map((i: any) => i.overall_score))}` : ''}
${codingScore ? `- Average coding score: ${codingScore}` : ''}

Return JSON with this exact schema:
{
  "phases": [
    {
      "phaseTitle": "descriptive phase title",
      "durationDays": number (should sum to approximately ${timeframe ?? 60}),
      "reasoning": "1-2 sentence mentor-style explanation of why this phase matters",
      "learningOrder": number (1-based order in which to tackle this phase),
      "prerequisites": ["what should be completed before starting this phase"],
      "difficulty": "Beginner | Intermediate | Advanced",
      "dailyTasks": ["specific daily tasks for this phase"],
      "weeklyGoals": ["milestone goals for each week"],
      "monthlyGoals": ["broader monthly goals"],
      "miniProjects": ["hands-on project ideas to build skills"],
      "milestones": ["specific milestones to reach by end of this phase"],
      "interviewReadinessGoals": ["what the candidate should be able to answer in an interview after this phase"],
      "checkpointMockInterview": boolean (true if a mock interview should be taken at the end),
      "resources": [
        { "title": "resource name", "url": "real valid URL", "type": "doc | course | tutorial | practice | book" }
      ]
    }
  ]
}

Create 3-5 phases. Make tasks specific and actionable for ${hoursPerDay ?? 2} hours/day. Include ${targetCompany}-specific preparation where relevant. Every resource MUST include a real, valid, clickable URL that opens the actual external website. Use official documentation URLs where possible (e.g. https://docs.oracle.com, https://react.dev, https://leetcode.com).`;

    const text = await callAI(systemPrompt, userPrompt, 0.5);
    const result = parseJSONResponse(text);

    // Update memory with company preference (best-effort)
    if (userId) {
      upsertUserMemory(userId, { company_preferences: [targetCompany] });
    }

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
