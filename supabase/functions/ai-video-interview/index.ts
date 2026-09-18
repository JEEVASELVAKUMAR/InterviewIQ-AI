// AI Voice/Video Interview — Phase 1: resume-based question generation.
// Isolated edge function. Does NOT share code with ai-interview.
// Reuses GEMINI_API_KEY (primary) + GROQ_API_KEY (fallback) env vars.

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";
const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY") ?? "";

function hasAIKeys(): boolean {
  return GEMINI_API_KEY.length > 0 || GROQ_API_KEY.length > 0;
}

async function callGemini(systemPrompt: string, userPrompt: string, temperature = 0.5): Promise<string> {
  if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY not configured");
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: "user", parts: [{ text: userPrompt }] }],
        generationConfig: { temperature, responseMimeType: "application/json" },
      }),
    },
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini error ${res.status}: ${err}`);
  }
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini returned empty response");
  return text;
}

async function callGroq(systemPrompt: string, userPrompt: string, temperature = 0.5): Promise<string> {
  if (!GROQ_API_KEY) throw new Error("GROQ_API_KEY not configured");
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${GROQ_API_KEY}` },
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

async function callAI(systemPrompt: string, userPrompt: string, temperature = 0.5): Promise<string> {
  if (!hasAIKeys()) throw new Error("No AI API keys configured");
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

function parseJSONResponse<T>(text: string): T {
  let cleaned = text.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }
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
    const { resumeText, jobRole } = body as { resumeText?: string; jobRole?: string };

    if (!resumeText || resumeText.trim().length < 20) {
      return new Response(
        JSON.stringify({ error: "Resume text is required (at least 20 characters)." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Fallback when no AI keys configured — generic questions so the flow is testable.
    if (!hasAIKeys()) {
      const fallbackQuestions = [
        { id: "1", text: "Tell me about yourself and your background.", type: "behavioral" },
        { id: "2", text: "Why are you interested in this role?", type: "behavioral" },
        { id: "3", text: "Describe a challenging project you worked on.", type: "resume-based" },
        { id: "4", text: "How do you handle tight deadlines and pressure?", type: "behavioral" },
        { id: "5", text: "Explain a technical concept you are most comfortable with.", type: "technical" },
      ];
      return new Response(JSON.stringify({ questions: fallbackQuestions }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const roleContext = jobRole
      ? `The candidate is applying for a ${jobRole} role.`
      : "The candidate's target role is not specified — generate general interview questions.";

    const systemPrompt =
      "You are an expert technical interviewer at a top company. Generate tailored interview questions based on the candidate's resume. Always respond in valid JSON only.";

    const userPrompt = `Generate 6 interview questions for a candidate.
${roleContext}

Candidate's resume:
${resumeText.slice(0, 6000)}

Return JSON with this exact schema:
{
  "questions": [
    { "id": "1", "text": "the question", "type": "technical" | "behavioral" | "resume-based" },
    ...
  ]
}

Rules:
- Generate exactly 6 questions.
- Mix types: at least 2 technical, 2 behavioral, and 2 resume-based.
- Resume-based questions must reference the candidate's actual skills, projects, or experience.
- Technical questions should be relevant to the skills mentioned in the resume.
- Behavioral questions should assess soft skills and cultural fit.
- Each question id should be a unique string ("1" through "6").`;

    const text = await callAI(systemPrompt, userPrompt, 0.5);
    const result = parseJSONResponse<{ questions: { id: string; text: string; type: string }[] }>(text);

    // Validate and normalize types
    const validTypes = new Set(["technical", "behavioral", "resume-based"]);
    const questions = (result.questions ?? []).map((q, i) => ({
      id: q.id ?? String(i + 1),
      text: q.text ?? "",
      type: validTypes.has(q.type) ? q.type : "behavioral",
    }));

    return new Response(JSON.stringify({ questions }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
