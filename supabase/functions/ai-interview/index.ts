// AI Mock Interview edge function — generate questions, evaluate answers,
// produce real-time reactions, and the end-of-interview consolidated report.
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
    const body = await req.json();
    const { action } = body;

    const userId = await userIdFromRequest(req);
    if (userId) {
      const allowed = await checkRateLimit(userId, "ai-interview");
      if (!allowed) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please wait a moment before sending more requests." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    if (!hasAIKeys()) {
      if (action === "evaluate") {
        return new Response(JSON.stringify({
          evaluation: {
            scores: { confidence: 0, grammar: 0, communication: 0, technicalAccuracy: 0, depth: 0, starMethod: 0, overall: 0 },
            feedback: { summary: "AI keys not configured.", suggestions: [] },
          },
          followUp: null,
          reaction: null,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (action === "debrief") {
        return new Response(JSON.stringify({
          debrief: {
            overallSummary: "AI keys not configured.", strengths: [], improvements: [],
            scoreBreakdown: {}, recommendation: "",
            attentionReport: { faceVisiblePercent: 0, lookingAwayEvents: 0, headMovementEvents: 0 },
            integrityReport: { tabSwitches: 0, durationOutsideInterview: 0, warningHistory: [] },
            actionPlan: [], recommendedProjects: [], recommendedResources: [],
          },
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (action === "react") {
        return new Response(JSON.stringify({ reaction: "Thank you for sharing that." }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const fallbackQs = [
        "Tell me about yourself and your background.",
        "Why are you interested in this role?",
        "Describe a challenging project you worked on.",
        "How do you handle tight deadlines?",
        "Where do you see yourself in 5 years?",
      ];
      return new Response(JSON.stringify({ questions: fallbackQs.slice(0, body.count ?? 5) }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Real-time reaction
    if (action === "react") {
      const { question, answer, conversationHistory } = body;
      if (!answer || answer.length < 3) {
        return new Response(JSON.stringify({ reaction: null }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const systemPrompt = `You are a realistic interviewer giving a SHORT real-time conversational reaction to a candidate's answer. Respond in valid JSON only. The reaction should be 1-2 sentences — praise strong answers, gently challenge weak ones, or probe deeper. Do NOT give formal feedback.`;
      const userPrompt = `The candidate was asked: "${question}"
Their answer: "${String(answer).slice(0, 2000)}"
Recent conversation: ${JSON.stringify(conversationHistory?.slice(-4) ?? [])}

Return JSON: { "reaction": "1-2 sentence natural interviewer reaction" }`;
      const text = await callAI(systemPrompt, userPrompt, 0.6);
      const result = parseJSONResponse(text);
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "evaluate") {
      const { question, answer, type, difficulty, conversationHistory } = body;
      if (!answer || answer.length < 5) {
        return new Response(JSON.stringify({ error: "Answer is required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const historyContext = conversationHistory?.length > 0
        ? `\n\nRecent conversation context:\n${JSON.stringify(conversationHistory.slice(-4))}`
        : "";

      const systemPrompt = `You are an expert interviewer evaluating a candidate's response. Always respond in valid JSON only. Be fair but strict. Score each metric 0-100.`;

      const userPrompt = `Evaluate this interview answer.

Question: ${question}
Interview Type: ${type}
Difficulty: ${difficulty}
Answer: ${answer}${historyContext}

Return JSON with this exact schema:
{
  "evaluation": {
    "scores": {
      "confidence": number (0-100),
      "grammar": number (0-100),
      "communication": number (0-100),
      "technicalAccuracy": number (0-100),
      "depth": number (0-100),
      "starMethod": number (0-100, only for behavioral, 0 otherwise),
      "overall": number (0-100, weighted average)
    },
    "feedback": {
      "summary": "2-3 sentence assessment",
      "suggestions": ["actionable improvement tips"]
    }
  },
  "followUp": "a follow-up question if the answer was incomplete or vague, or null if thorough"
}`;

      const text = await callAI(systemPrompt, userPrompt, 0.3);
      const result = parseJSONResponse(text);
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "debrief") {
      const { turns, type, difficulty, company, role, attentionReport, integrityReport } = body;
      if (!Array.isArray(turns) || turns.length === 0) {
        return new Response(JSON.stringify({ error: "turns array is required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const systemPrompt = `You are an expert hiring manager writing an end-of-interview debrief. Always respond in valid JSON only. Be honest but constructive. Produce the consolidated Interview Report with all scores, attention report, integrity report, action plan, and recommended projects/resources.`;

      const userPrompt = `Write the consolidated end-of-interview report for a ${type} interview at ${difficulty} difficulty for a ${role} role at ${company}.

Candidate's question/answer turns with per-answer scores:
${JSON.stringify(turns, null, 2)}

Attention report (from camera tracking):
${JSON.stringify(attentionReport ?? { faceVisiblePercent: 0, lookingAwayEvents: 0, headMovementEvents: 0 })}

Integrity report (from tab/window monitoring):
${JSON.stringify(integrityReport ?? { tabSwitches: 0, durationOutsideInterview: 0, warningHistory: [] })}

Return JSON with this exact schema:
{
  "debrief": {
    "overallSummary": "4-6 sentence overall assessment",
    "strengths": ["3-5 specific strengths"],
    "improvements": ["3-5 specific, actionable improvement areas"],
    "scoreBreakdown": {
      "technicalScore": number, "communicationScore": number, "confidenceScore": number,
      "grammarScore": number, "vocabularyScore": number, "resumeMatchScore": number,
      "codingScore": number, "behaviorScore": number, "eyeContactScore": number,
      "speakingSpeed": number, "pronunciationScore": number, "companyReadinessScore": number,
      "overallScore": number
    },
    "recommendation": "Hire | Borderline | No-Hire, with a 1-sentence justification",
    "attentionReport": { "faceVisiblePercent": number, "lookingAwayEvents": number, "headMovementEvents": number },
    "integrityReport": { "tabSwitches": number, "durationOutsideInterview": number, "warningHistory": ["list of warnings"] },
    "actionPlan": ["3-5 specific next steps"],
    "recommendedProjects": ["2-3 project ideas"],
    "recommendedResources": [{"title": "resource name", "url": "real URL", "type": "course|doc|practice"}]
  }
}

Rules:
- Ground every score and observation in the candidate's actual answers.
- overallScore = (technicalScore × 0.30) + (codingScore × 0.30) + (communicationScore × 0.20) + (behaviorScore × 0.20).
- recommendedResources must include real, valid URLs.`;

      const text = await callAI(systemPrompt, userPrompt, 0.4);
      const result: any = parseJSONResponse(text);

      if (userId) {
        const weakTopics = (result.debrief?.improvements ?? []).slice(0, 5);
        const strongTopics = (result.debrief?.strengths ?? []).slice(0, 5);
        upsertUserMemory(userId, {
          weak_topics: weakTopics,
          strong_topics: strongTopics,
          interview_progress: { lastInterviewAt: new Date().toISOString(), company, role, type, difficulty },
        });
      }

      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Default: generate questions
    const { difficulty: diff, type: intType, count, resumeText, company, role, experienceLevel, preferredLanguage, jobDescription } = body;
    const numQuestions = Math.min(Math.max(count ?? 5, 1), 50);
    const expContext = experienceLevel ? ` The candidate is at ${experienceLevel} experience level.` : "";
    const langContext = preferredLanguage ? ` The candidate's preferred language is ${preferredLanguage} — generate coding questions in that language when relevant.` : "";
    const jdContext = jobDescription ? `\n\nJob Description:\n${String(jobDescription).slice(0, 3000)}` : "";

    const systemPrompt = `You are an expert technical interviewer at a top company conducting a realistic interview. Always respond in valid JSON only. Generate interview questions SPECIFIC to the candidate's resume, the target company, and the target role. Mix question styles — short, long, scenario, counter-questions, follow-ups, behavioral, coding, resume/project questions.${expContext}${langContext}`;

    const userPrompt = `Generate ${numQuestions} ${diff} difficulty ${intType} interview questions for a ${role} position at ${company}.${expContext}${langContext}

Candidate's resume:
${resumeText?.slice(0, 6000) ?? "No resume provided"}${jdContext}

Return JSON: { "questions": ["question1", "question2", ...] }

Rules:
- Questions must reference the candidate's actual skills, projects, or experience.
- Mix question styles: short, long, scenario, counter-questions, follow-ups, behavioral, coding, resume/project.
- For Technical/DSA types: include coding or system design questions (in ${preferredLanguage ?? "the candidate's preferred language"} when relevant).
- For HR type: focus on background, motivation, culture fit.
- For Behavioral type: use behavioral scenarios, assess with STAR method.
- For System Design: include scalability and architecture questions.
- Occasionally include a probing/deep question: "Can you explain that?", "What would you improve?", "Can you optimize it?".
- Make questions realistic for ${company} interviewing for a ${role}.`;

    const text = await callAI(systemPrompt, userPrompt, 0.5);
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
