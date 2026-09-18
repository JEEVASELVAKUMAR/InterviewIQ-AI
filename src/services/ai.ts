import { supabase } from '../lib/supabase';

const FUNCTION_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;

async function callFunction(name: string, body: any) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token ?? import.meta.env.VITE_SUPABASE_ANON_KEY;

  const res = await fetch(`${FUNCTION_BASE}/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`AI request failed (${res.status}): ${errText}`);
  }
  const json = await res.json();
  if (json.error) throw new Error(json.error);
  return json;
}

// ===== RESUME PARSE + ANALYZE =====
export async function parseResume(opts: { resumeText: string }) {
  return callFunction('ai-resume-parse', opts);
}

export async function analyzeResume(opts: { resumeText: string; targetCompany?: string }) {
  return callFunction('ai-resume-parse', { action: 'analyze', ...opts });
}

export async function rewriteResumeForCompany(opts: { resumeText: string; targetCompany: string }) {
  return callFunction('ai-resume-parse', { action: 'rewrite', ...opts });
}

// ===== SKILL GAP =====
export async function analyzeSkillGap(opts: {
  resumeText: string;
  resumeSkills: string[];
  dreamCompany: string;
  role: string;
}) {
  return callFunction('ai-skill-gap', opts);
}

// ===== INTERVIEW =====
export async function generateInterviewQuestions(opts: {
  difficulty: string;
  type: string;
  count: number;
  resumeText?: string;
  company?: string;
  role?: string;
}) {
  return callFunction('ai-interview', { action: 'generate', ...opts });
}

export async function evaluateInterviewAnswer(opts: {
  question: string;
  answer: string;
  type: string;
  difficulty: string;
  turnIndex: number;
}) {
  return callFunction('ai-interview', { action: 'evaluate', ...opts });
}

export async function getInterviewDebrief(opts: {
  turns: { question: string; answer: string; evaluation?: any }[];
  type: string;
  difficulty: string;
  company: string;
  role: string;
}) {
  return callFunction('ai-interview', { action: 'debrief', ...opts });
}

// ===== CODING =====
export async function evaluateCoding(opts: {
  language: string;
  problem: string;
  code: string;
  testCases?: any[];
  mode?: 'run' | 'submit';
}) {
  return callFunction('ai-coding', opts);
}

export async function getCodingHint(opts: {
  problem: string;
  code?: string;
  language: string;
  hintLevel: number;
}) {
  return callFunction('ai-coding', { action: 'hint', ...opts });
}

// ===== ROADMAP =====
export async function generateRoadmap(opts: {
  resumeText?: string;
  interviewHistory?: any[];
  codingScore?: number;
  skillGap?: any;
  duration?: string;
  targetCompany?: string;
  targetRole?: string;
  currentLevel?: string;
  hoursPerDay?: number;
  timeframe?: number;
  weakAreas?: string;
}) {
  return callFunction('ai-roadmap', opts);
}

export async function refineRoadmap(opts: {
  currentRoadmap: any;
  refinementPrompt: string;
}) {
  return callFunction('ai-roadmap', { action: 'refine', ...opts });
}

// ===== AI VOICE/VIDEO INTERVIEW (Phase 1) =====
export async function generateVideoInterviewQuestions(opts: {
  resumeText: string;
  jobRole?: string;
}) {
  return callFunction('ai-video-interview', opts);
}

// ===== AI VOICE/VIDEO INTERVIEW (Phase 4 — staged flow) =====
export async function generateNextInterviewQuestion(opts: {
  conversation: { question: string; answer: string; questionType: string; stage: string }[];
  resumeText?: string;
  jobRole?: string;
  currentStage: string;
  stageQuestionCount: number;
  totalQuestionCount: number;
}) {
  return callFunction('ai-interview-next', opts) as Promise<import('../types').NextQuestionResult>;
}

// ===== CHAT =====
export async function chatWithAI(opts: {
  message: string;
  history: { role: string; content: string }[];
  resumeText?: string;
}) {
  return callFunction('ai-chat', opts);
}

// Streaming chat — returns an async generator that yields text chunks.
// The edge function emits SSE-style `data: {"chunk": "..."}` lines.
export async function* chatWithAIStream(opts: {
  message: string;
  history: { role: string; content: string }[];
  resumeText?: string;
}): AsyncGenerator<string, void, unknown> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token ?? import.meta.env.VITE_SUPABASE_ANON_KEY;

  const res = await fetch(`${FUNCTION_BASE}/ai-chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ ...opts, stream: true }),
  });

  if (!res.ok || !res.body) {
    const errText = await res.text();
    throw new Error(`Chat stream failed (${res.status}): ${errText}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const payload = trimmed.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;
      try {
        const json = JSON.parse(payload);
        if (json.chunk) yield json.chunk as string;
        if (json.error) throw new Error(json.error);
        if (json.done) return;
      } catch (e: any) {
        if (e?.message) throw e;
      }
    }
  }
}
