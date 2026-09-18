// AI Skill Gap Analyzer — produces clean, structured, fundamentals-first output
// with expanded resources and a daily/weekly/monthly learning roadmap.
// Inlined AI helper. Includes rate limiting.

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";
const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

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
    const { resumeText, resumeSkills, dreamCompany, role, jobDescription } = await req.json();

    const userId = await userIdFromRequest(req);
    if (userId) {
      const allowed = await checkRateLimit(userId, "ai-skill-gap");
      if (!allowed) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please wait a moment before sending more requests." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    if (!resumeText || resumeText.length < 20) {
      return new Response(JSON.stringify({ error: "Resume text is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!dreamCompany || !role) {
      return new Response(JSON.stringify({ error: "Company and role are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!hasAIKeys()) {
      return new Response(JSON.stringify({
        company: dreamCompany,
        role,
        requiredSkills: [], matchedSkills: [], missingSkills: [], priorityOrder: [],
        fundamentalsFirst: [], estimatedLearningTime: {}, resources: [],
        learningPlan: { daily: [], weekly: [], monthly: [] },
        verdictSummary: "AI keys not configured. Please set GEMINI_API_KEY or GROQ_API_KEY in Supabase Edge Function secrets.",
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const jdSection = jobDescription
      ? `\n\nJob Description to match against:\n${String(jobDescription).slice(0, 3000)}`
      : "";

    const systemPrompt = `You are an expert technical recruiter and career mentor at a top tech company. Always respond in valid JSON only. Analyze a candidate's resume against a specific company and role's requirements. Requirements must be SPECIFIC to this exact company and role — not generic. Default to a fresher framing (fundamentals-first) UNLESS the resume clearly shows real work experience. Output must be SHORT, CLEAN, and STRUCTURED — tight scannable lists, no repeated prose between sections. Every resource entry must include official documentation links, practice problems, a suggested project with a "why build this" explanation, tech stack, difficulty, estimated time, and likely interview questions.`;

    const userPrompt = `Analyze this resume for the company "${dreamCompany}" and role "${role}".

Candidate's resume skills: ${JSON.stringify(resumeSkills)}
Resume text excerpt: ${resumeText.slice(0, 5000)}${jdSection}

Return JSON with this exact schema:
{
  "company": "${dreamCompany}",
  "role": "${role}",
  "matchedSkills": ["skills from the candidate's resume that match the requirements — short list"],
  "missingSkills": ["required skills the candidate does NOT have — short list"],
  "fundamentalsFirst": ["the FUNDAMENTALS the candidate should learn first before advanced topics — short list, only include if relevant"],
  "priorityOrder": ["missing skills in learning priority order — most critical first, short list"],
  "estimatedLearningTime": { "skill": "estimated time (e.g. '2 weeks', '1 month')" },
  "resources": [
    {
      "skill": "skill name",
      "courses": ["1-2 specific course names or platforms"],
      "officialDocs": ["official documentation URL or name"],
      "practiceProblems": ["1-2 practice problem sources or platforms"],
      "projects": ["1-2 hands-on project ideas with a short 'why build this' explanation in parentheses"],
      "projectWhy": "1-2 sentence explanation of why the suggested project is worth building and what it teaches",
      "techStack": ["technologies/tools involved in learning this skill"],
      "difficulty": "Beginner | Intermediate | Advanced",
      "estimatedTime": "estimated completion time (e.g. '2 weeks', '1 month')",
      "interviewQuestions": ["2-3 likely interview questions for this skill"]
    }
  ],
  "learningPlan": {
    "daily": ["short daily tasks or habits"],
    "weekly": ["weekly milestones"],
    "monthly": ["monthly goals"]
  },
  "verdictSummary": "A 3-4 sentence mentor-style assessment: how well does the candidate match, what are their biggest gaps, and what should they focus on first. Be specific to ${dreamCompany} and ${role}."
}

Rules:
- Keep every list SHORT and scannable — no walls of text.
- Do NOT repeat the same point across sections.
- Default to fresher framing (fundamentals-first) unless the resume shows real work experience.
- The requirements must reflect what ${dreamCompany} actually asks for in a ${role} role.
- Every resource entry must have all fields filled — no empty arrays or null values.
- The projectWhy field must explain WHY the project is worth building and WHAT it teaches.`;

    const text = await callAI(systemPrompt, userPrompt, 0.4);
    const result: any = parseJSONResponse(text);
    if (!result.requiredSkills) {
      result.requiredSkills = [...(result.matchedSkills ?? []), ...(result.missingSkills ?? [])];
    }
    if (!result.learningPlan) {
      result.learningPlan = { daily: [], weekly: [], monthly: [] };
    }

    if (userId) {
      upsertUserMemory(userId, {
        company_preferences: [dreamCompany],
        weak_topics: result.missingSkills ?? [],
        strong_topics: result.matchedSkills ?? [],
      });
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
