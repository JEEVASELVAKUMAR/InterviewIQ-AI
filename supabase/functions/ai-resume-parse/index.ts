// AI Resume Parse + Analyze + Rewrite edge function.
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
  const body: Record<string, unknown> = { user_id: userId, updated_at: new Date().toISOString(), ...updates };
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
    const body = await req.json();
    const { resumeText, action, targetCompany, targetRole, jobDescription } = body;

    const userId = await userIdFromRequest(req);
    if (userId) {
      const allowed = await checkRateLimit(userId, "ai-resume-parse");
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

    if (!hasAIKeys()) {
      if (action === "analyze") {
        return new Response(JSON.stringify({
          atsScore: 0,
          summaryFeedback: "AI keys not configured. Please set GEMINI_API_KEY or GROQ_API_KEY in Supabase Edge Function secrets.",
          sectionFeedback: { summary: "", skills: "", experience: "", projects: "", education: "" },
          missingSections: [],
          keywordGaps: [],
          rewriteSuggestions: [],
          matchedSkills: [],
          missingSkills: [],
          missingTechnologies: [],
          missingTools: [],
          missingSoftSkills: [],
          strengths: [],
          weaknesses: [],
          grammarErrors: [],
          formattingIssues: [],
          keywordAnalysis: {},
          actionItems: [],
          interviewReadinessScore: 0,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (action === "rewrite") {
        return new Response(JSON.stringify({
          rewrittenResume: { summary: "", sections: [], skills: [] },
          rewrittenAtsScore: 0,
          changesSummary: "AI keys not configured.",
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({
        skills: [], projects: [], education: [], experience: [], certifications: [],
        profile: {},
        achievements: [],
        languages: [],
        note: "AI keys not configured. Upload will still store raw text.",
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "rewrite") {
      if (!targetCompany) {
        return new Response(JSON.stringify({ error: "targetCompany is required for rewrite" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const roleContext = targetRole ? ` for a ${targetRole} role` : "";
      const jdContext = jobDescription ? `\n\nJob Description:\n${jobDescription.slice(0, 3000)}` : "";

      const systemPrompt = `You are an expert resume writer who rewrites resumes to maximize ATS score for a specific target company and role. Always respond in valid JSON only. Rewrite the candidate's resume content (summary, bullet points, skills phrasing) to legitimately raise the ATS score for ${targetCompany}${roleContext}. Do NOT fabricate experience or skills — only rephrase and reorganize existing content. Keep it truthful.`;

      const userPrompt = `Rewrite this resume specifically to maximize ATS score for a role at ${targetCompany}${roleContext}. Use ${targetCompany}-specific keywords and emphasize the parts of the candidate's background that ${targetCompany} cares about.${jdContext}

Resume text:
${resumeText.slice(0, 8000)}

Return JSON with this exact schema:
{
  "rewrittenResume": {
    "summary": "rewritten professional summary (2-4 lines)",
    "sections": [
      { "title": "Experience", "items": ["rewritten bullet 1", "rewritten bullet 2"] },
      { "title": "Projects", "items": ["rewritten bullet 1"] }
    ],
    "skills": ["rephrased/organized skills list"]
  },
  "rewrittenAtsScore": number (0-100, the projected ATS score AFTER rewriting),
  "changesSummary": "short list of the key changes made, as a single string with newlines"
}

Rules:
- Only rephrase existing content — do NOT invent new experience, jobs, or skills.
- Keep the structure ATS-friendly: single column, standard headings, no tables/graphics.
- The rewritten score should reflect the realistic improvement from better keyword alignment.`;

      const text = await callAI(systemPrompt, userPrompt, 0.4);
      const result = parseJSONResponse(text);
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "analyze") {
      const targetContext = targetCompany
        ? ` for a role at ${targetCompany}${targetRole ? ` as a ${targetRole}` : ""}`
        : "";
      const jdSection = jobDescription
        ? `\n\nJob Description to match against:\n${jobDescription.slice(0, 3000)}`
        : "";

      const systemPrompt = `You are an expert ATS (Applicant Tracking System) resume analyzer and career coach. Always respond in valid JSON only. Analyze the resume for ATS compatibility, section quality, keyword optimization, skill matching against the target company/role/JD, and provide actionable rewrite suggestions. Be specific and constructive.${targetCompany ? ` Score against ${targetCompany}'s known requirements when possible.` : ""}`;

      const userPrompt = `Analyze this resume${targetContext} and return JSON with this exact schema:
{
  "atsScore": number (0-100, where 100 is perfectly ATS-optimized),
  "summaryFeedback": "2-3 sentence overall assessment",
  "sectionFeedback": {
    "summary": "feedback on the summary/objective section",
    "skills": "feedback on the skills section",
    "experience": "feedback on the experience section",
    "projects": "feedback on the projects section",
    "education": "feedback on the education section"
  },
  "matchedSkills": ["skills from the resume that match the target role/company/JD"],
  "missingSkills": ["skills expected for the target role that are missing from the resume"],
  "missingTechnologies": ["technologies/tools expected for the target role that are missing"],
  "missingTools": ["specific tools (e.g. Git, Docker, Jira) expected but missing"],
  "missingSoftSkills": ["soft skills expected (e.g. leadership, communication) but missing"],
  "strengths": ["specific strengths of this resume"],
  "weaknesses": ["specific weaknesses or areas for improvement"],
  "grammarErrors": ["list of grammar or spelling errors found, with the specific text"],
  "formattingIssues": ["list of formatting problems (e.g. inconsistent dates, missing bullet points)"],
  "keywordAnalysis": {
    "present": ["keywords found that are good for ATS"],
    "missing": ["keywords that should be added for the target role"],
    "density": "brief assessment of keyword density"
  },
  "actionItems": ["numbered list of specific, actionable steps to improve the resume"],
  "interviewReadinessScore": number (0-100, how ready this resume makes the candidate for interviews at the target),
  "missingSections": ["list of sections that are missing or too thin"],
  "keywordGaps": ["industry-standard keywords that should be present but are missing"],
  "rewriteSuggestions": [{"original": "the original text from resume", "improved": "a better version"}]
}

Be thorough. Provide at least 3 rewrite suggestions if the resume has content. Score strictly — a generic resume should score 40-60, a well-optimized one 70-85, and only exceptional resumes get 85+.
${jdSection}

Resume text:
${resumeText.slice(0, 8000)}`;

      const text = await callAI(systemPrompt, userPrompt, 0.3);
      const result = parseJSONResponse(text);

      if (userId) {
        const summary = (result.summaryFeedback ?? "").slice(0, 500);
        upsertUserMemory(userId, { resume_summary: summary });
      }

      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Default: parse resume — structured summary, not raw text dump
    const systemPrompt = `You are an expert resume parser. Always respond in valid JSON only. Extract structured information from the resume text and organize it into clear sections. Do not hallucinate — only include information present in the text. If a section is not present in the resume, return an empty array or empty object for it.`;

    const userPrompt = `Parse this resume and return JSON with this exact schema:
{
  "profile": {
    "name": "full name",
    "email": "email if found",
    "phone": "phone if found",
    "location": "city/state if found",
    "links": ["LinkedIn, GitHub, portfolio URLs if found"]
  },
  "skills": ["list of technical and soft skills"],
  "projects": [{"name": "project name", "description": "brief description", "technologies": ["tech"]}],
  "education": [{"degree": "degree name", "institution": "school/college", "year": "year if available"}],
  "experience": [{"role": "job title", "company": "company name", "duration": "time period", "description": "what they did"}],
  "certifications": ["list of certifications"],
  "achievements": ["list of awards, honors, or notable achievements"],
  "languages": ["list of languages spoken/known"]
}

Resume text:
${resumeText.slice(0, 8000)}`;

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
