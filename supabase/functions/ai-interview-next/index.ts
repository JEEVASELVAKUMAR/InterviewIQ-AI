// AI Video Interview — Phase 4: staged, natural interview flow.
// Generates questions dynamically, one at a time, across 5 stages.
// No longer requires pre-generated questions — generates the FIRST question too.

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";
const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

// Fetch recent interview feedback to adapt the AI's behavior based on aggregated user sentiment.
// This is prompt-level adaptation, NOT model retraining — the AI's weights don't change,
// but its instructions shift based on real feedback patterns over time.
async function getRecentFeedbackSummary(): Promise<string> {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return "";
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/interview_feedback?order=created_at.desc&limit=50&select=rating,comment`,
      { headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` } },
    );
    if (!res.ok) return "";
    const rows = await res.json();
    if (!Array.isArray(rows) || rows.length === 0) return "";

    const avgRating = rows.reduce((sum: number, r: any) => sum + (r.rating ?? 0), 0) / rows.length;
    const lowRated = rows.filter((r: any) => r.rating <= 3 && r.comment);
    const comments = lowRated.map((r: any) => r.comment as string).filter((c) => c && c.trim().length > 0);

    // Extract common complaint themes by keyword matching
    const themes: string[] = [];
    const allComments = comments.join(" ").toLowerCase();
    if (/repeat|repetit|same question|asked that/.test(allComments)) themes.push("questions are too repetitive");
    if (/generic|vague|not specific|not detailed/.test(allComments)) themes.push("questions feel too generic");
    if (/listen|acknowledge|ignor|didn't respond|didn't react/.test(allComments)) themes.push("AI doesn't listen to or acknowledge answers");
    if (/fast|rush|quick|speed/.test(allComments)) themes.push("interview feels rushed");
    if (/hard|difficult|tough|advanced/.test(allComments)) themes.push("questions are too difficult");
    if (/easy|simple|basic|beginner/.test(allComments)) themes.push("questions are too easy");
    if (/boring|monotone|robot|unnatural/.test(allComments)) themes.push("tone feels robotic");

    const parts: string[] = [`Average rating: ${avgRating.toFixed(1)}/5 from ${rows.length} recent feedback entries.`];
    if (themes.length > 0) {
      parts.push(`Common complaints: ${themes.join("; ")}.`);
    } else if (avgRating >= 4) {
      parts.push("Overall feedback is positive — maintain current approach.");
    }
    return parts.join(" ");
  } catch {
    return "";
  }
}

function hasAIKeys(): boolean {
  return GEMINI_API_KEY.length > 0 || GROQ_API_KEY.length > 0;
}

async function callGemini(systemPrompt: string, userPrompt: string, temperature = 0.7): Promise<string> {
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

async function callGroq(systemPrompt: string, userPrompt: string, temperature = 0.7): Promise<string> {
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

async function callAI(systemPrompt: string, userPrompt: string, temperature = 0.7): Promise<string> {
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

type ConversationTurn = {
  question: string;
  answer: string;
  questionType: string;
  stage: string;
};

type Stage = "entry" | "icebreaker" | "background" | "core" | "closing";

const STAGE_ORDER: Stage[] = ["entry", "icebreaker", "background", "core", "closing"];

const STAGE_MAX_QUESTIONS: Record<Stage, number> = {
  entry: 1,
  icebreaker: 1,
  background: 2,
  core: 5,
  closing: 1,
};

const TOTAL_MAX_QUESTIONS = 10;

function determineNextStage(currentStage: Stage, stageQuestionCount: number): Stage {
  if (stageQuestionCount >= STAGE_MAX_QUESTIONS[currentStage]) {
    const idx = STAGE_ORDER.indexOf(currentStage);
    if (idx < STAGE_ORDER.length - 1) {
      return STAGE_ORDER[idx + 1];
    }
  }
  return currentStage;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const {
      conversation,
      resumeText,
      jobRole,
      currentStage,
      stageQuestionCount,
      totalQuestionCount,
    } = body as {
      conversation: ConversationTurn[];
      resumeText?: string;
      jobRole?: string;
      currentStage: string;
      stageQuestionCount: number;
      totalQuestionCount: number;
    };

    const stage = (currentStage || "entry") as Stage;
    const stageCount = stageQuestionCount || 0;
    const totalCount = totalQuestionCount || 0;

    // Check if we've reached the end
    if (stage === "closing" && stageCount >= STAGE_MAX_QUESTIONS.closing) {
      return new Response(
        JSON.stringify({
          done: true,
          question: null,
          transition: "That wraps up all my questions. Thank you so much for your time today — we'll be in touch soon about next steps. Take care!",
          stage: "closing",
          type: "closing",
          isFollowUp: false,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (totalCount >= TOTAL_MAX_QUESTIONS) {
      return new Response(
        JSON.stringify({
          done: true,
          question: null,
          transition: "That wraps up all my questions. Thank you so much for your time today — we'll be in touch soon about next steps. Take care!",
          stage: "closing",
          type: "closing",
          isFollowUp: false,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Determine the stage for this question
    const targetStage = determineNextStage(stage, stageCount);

    // Fallback when no AI keys configured
    if (!hasAIKeys()) {
      return new Response(
        JSON.stringify({
          done: false,
          question: getFallbackQuestion(targetStage, resumeText, jobRole),
          type: stageToType(targetStage),
          transition: getFallbackTransition(targetStage, stageCount),
          stage: targetStage,
          isFollowUp: false,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const roleContext = jobRole
      ? `The candidate is applying for a ${jobRole} role.`
      : "The candidate's target role is not specified.";

    const resumeContext = resumeText
      ? `Candidate's resume summary (first 3000 chars):\n${resumeText.slice(0, 3000)}`
      : "No resume provided.";

    const conversationText = conversation.length > 0
      ? conversation.map((t, i) =>
        `Q${i + 1} [${t.stage}] (${t.questionType}): ${t.question}\nA${i + 1}: ${t.answer}`
      ).join("\n\n")
      : "No questions asked yet — this is the very first interaction.";

    const feedbackSummary = await getRecentFeedbackSummary();

    const systemPrompt = `You are an expert interviewer conducting a live, conversational video interview. Your tone is warm, encouraging, and natural — like a real human interviewer welcoming a candidate into their office. You speak in English only.

You conduct the interview in STAGES, in this strict order:
1. ENTRY (1 exchange): Greet the candidate warmly, like welcoming them into a room. e.g. "Come on in, please have a seat. Thanks for joining today." Make them feel comfortable. This is NOT a question — it's a greeting that ends with a simple "How are you doing?" or similar.
2. ICEBREAKER (exactly 1 exchange): Ask ONE casual small-talk question unrelated to the job. e.g. "Did you get a chance to have breakfast?" or "How's your day going so far?" Keep it brief and friendly. This is NOT scored.
3. BACKGROUND (1-2 exchanges): Ask about their degree, college, or branch of study. e.g. "Tell me a bit about your educational background." or "What did you study in college?"
4. CORE (4-5 exchanges): Ask technical and behavioral questions. Mix short direct questions ("What is a REST API?") with longer scenario questions ("Tell me about a time you had a conflict with a teammate. How did you handle it?"). Use the candidate's resume to personalize questions. Vary the length — some should be short and punchy, others longer and scenario-based.
5. CLOSING (1 exchange): Thank them warmly, explain next steps, and wrap up. e.g. "That's all the questions I have. Thank you so much for your time today. We'll get back to you within a few days about next steps. Do you have any questions for me?"

CRITICAL RULES:
- Ask ONE clear, natural-sounding question at a time.
- Vary length — some short and direct, some longer scenario questions, but never long-winded.
- Sound like a warm, professional human interviewer, not a quiz bot.
- Never say "Question 3 of 8" or anything robotic.
- Never reveal the stage name to the candidate.
- The ICEBREAKER stage is for rapport only — it must NOT be scored or evaluated.
- Only BACKGROUND and CORE stage answers count toward evaluation.
- If the candidate's last answer was vague or very short, you may ask a natural follow-up to dig deeper (staying in the same stage).
- A follow-up should reference something specific the candidate said.
- The question itself should be standalone — the candidate will hear it spoken aloud.
- Respond in valid JSON only.

ANTI-REPETITION RULES (CRITICAL):
- You will be given a list of questions already asked. NEVER ask a question that is the same as or very similar in meaning to any question already asked.
- Before generating your next question, mentally check it against every question in the "Questions already asked" list. If it overlaps in topic or meaning, reformulate it to explore a genuinely different angle.
- Do not rephrase a previous question slightly and call it new — the candidate should feel each question explores new territory.
- If you are in the CORE stage and running low on fresh topics, draw from the candidate's resume to find a new technical area or behavioral scenario you haven't covered.

ACTIVE LISTENING RULES (CRITICAL):
- You are a warm, attentive human interviewer who genuinely LISTENS to what the candidate says.
- Before asking your next question, you MUST read and respond to the CONTENT of the candidate's last answer.
- Reference specific details, projects, technologies, or experiences they mentioned — the way a real interviewer reacts.
- If they mentioned a specific project, ask about a detail of that project. If they mentioned a technology, probe deeper on it. If they shared a personal experience, acknowledge it genuinely.
- Do NOT just advance a scripted list of questions — react to what they actually said.
- If their answer reveals a gap or weakness, gently probe that area. If it reveals a strength, acknowledge it and build on it.
- Your transition must demonstrate that you heard and understood their specific answer, not just a generic "thanks for sharing."

CONVERSATIONAL ACKNOWLEDGMENT RULES:
- Briefly acknowledge what the candidate said in your own words before moving to your next question.
- Vary your phrasing naturally — never repeat the same transition twice in one interview.
- Reference something specific from their answer when relevant (e.g. "I like that you mentioned X...", "So it sounds like you worked on Y...").
- When transitioning between stages, use a natural bridge (e.g. moving from BACKGROUND to CORE: "Good, I have a clearer picture of your background now. Let's talk about the technical side.").
- Occasionally (not always) show genuine interest with a light follow-up comment like "That's an interesting way to think about it." — but keep it brief and move on.
- Do NOT over-acknowledge or repeat their words back at them — keep acknowledgments to one short sentence.
- The transition field should contain this acknowledgment + bridge. The question field is the standalone question.
${feedbackSummary ? `\nADAPTIVE FEEDBACK CONTEXT:\nRecent user feedback from past interviews: ${feedbackSummary}\nKeep this feedback in mind and adjust your approach accordingly. If users noted repetition, be extra vigilant about varying your questions. If they noted the AI doesn't listen, make sure to actively reference answer content.` : ""}`;

    // Build explicit list of questions already asked for anti-repetition
    const questionsAlreadyAsked = conversation.length > 0
      ? conversation.map((t, i) => `${i + 1}. [${t.stage}] ${t.question}`).join("\n")
      : "(None — this is the first question.)";

    const userPrompt = `Interview context:
${roleContext}
${resumeContext}

Current stage: ${targetStage}
Questions asked in this stage so far: ${stageCount}
Total questions asked: ${totalCount}

Questions already asked (DO NOT repeat any of these or ask anything similar):
${questionsAlreadyAsked}

Conversation so far:
${conversationText}

You are now in the ${targetStage.toUpperCase()} stage. ${getStageInstruction(targetStage, stageCount)}

IMPORTANT: Before generating your question, check it against the "Questions already asked" list above. If it overlaps in topic or meaning with any listed question, reformulate it to explore a genuinely different angle.

Return JSON with this exact schema:
{
  "done": false,
  "stage": "${targetStage}",
  "transition": "a brief, warm acknowledgment that references something specific from the candidate's last answer + a natural bridge to the next question. Vary phrasing every time. For the very first question (ENTRY, 0 asked), use a warm greeting instead.",
  "question": "the actual question text, standalone, spoken aloud to the candidate. Must NOT be similar to any question already asked.",
  "type": "technical" | "behavioral" | "resume-based" | "closing",
  "isFollowUp": true | false
}

If this is the very first interaction (ENTRY stage, 0 questions asked), set transition to a warm greeting like "Hi! Come on in, please have a seat. Thanks for joining today." and ask a simple "How are you doing?" type question.`;

    const text = await callAI(systemPrompt, userPrompt, 0.7);
    const result = parseJSONResponse<{
      done: boolean;
      transition: string;
      question: string | null;
      type?: string;
      isFollowUp?: boolean;
      stage?: string;
    }>(text);

    const validTypes = new Set(["technical", "behavioral", "resume-based", "closing"]);
    if (result.type && !validTypes.has(result.type)) {
      result.type = stageToType(targetStage);
    }
    if (!result.stage) result.stage = targetStage;

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

function stageToType(stage: Stage): string {
  switch (stage) {
    case "entry": return "behavioral";
    case "icebreaker": return "behavioral";
    case "background": return "resume-based";
    case "core": return "technical";
    case "closing": return "closing";
  }
}

function getStageInstruction(stage: Stage, stageCount: number): string {
  switch (stage) {
    case "entry":
      return "Greet the candidate warmly and ask how they're doing. Make them feel welcome.";
    case "icebreaker":
      return "Ask ONE casual, friendly small-talk question. Keep it very brief. This is not scored.";
    case "background":
      return stageCount === 0
        ? "Ask about their educational background — degree, college, or branch of study."
        : "Ask a follow-up about their education, or transition to the CORE stage with a technical/behavioral question.";
    case "core":
      return "Ask a technical or behavioral question. Vary the length — mix short direct questions with longer scenario questions. Use the resume to personalize when possible.";
    case "closing":
      return "Thank the candidate warmly, explain next steps, and ask if they have any questions. Wrap up the interview.";
  }
}

function getFallbackQuestion(stage: Stage, resumeText?: string, jobRole?: string): string {
  switch (stage) {
    case "entry":
      return "Hi! Come on in, please have a seat. Thanks for joining today. How are you doing?";
    case "icebreaker":
      return "Did you get a chance to have breakfast this morning?";
    case "background":
      return "Tell me a bit about your educational background — what did you study and where?";
    case "core":
      return jobRole
        ? `Tell me about a project you're proud of that's relevant to the ${jobRole} role.`
        : "Tell me about a project you're particularly proud of.";
    case "closing":
      return "That's all the questions I have. Thank you so much for your time today. We'll be in touch about next steps. Do you have any questions for me?";
  }
}

function getFallbackTransition(stage: Stage, stageCount: number): string {
  if (stage === "entry" && stageCount === 0) {
    return "Hi! Come on in, please have a seat. Thanks for joining today.";
  }
  const transitions = [
    "Great, thanks for sharing that.",
    "That's helpful, thank you.",
    "Got it, appreciate that.",
    "Thanks for that answer.",
    "Makes sense. Let me ask you this next.",
  ];
  return transitions[stageCount % transitions.length];
}
