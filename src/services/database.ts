import { supabase } from '../lib/supabase';
import type {
  Profile,
  Resume,
  ResumeAnalysis,
  Interview,
  CodingEvaluation,
  CodingProblem,
  Roadmap,
  ChatMessage,
  Analytics,
  Notification,
  SkillGapReport,
  InterviewSession,
  InterviewQuestionRow,
  VideoInterviewQuestion,
  InterviewAnswerRow,
  EngagementSignals,
  InterviewFeedback,
  AdminProfile,
} from '../types';

export async function getProfile(userId: string): Promise<Profile | null> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) {
      console.error('getProfile error:', error.message);
      return null;
    }
    return data as Profile | null;
  } catch (err: any) {
    console.error('getProfile network error:', err?.message ?? err);
    return null;
  }
}

export async function upsertProfile(userId: string, updates: Partial<Profile>): Promise<Profile | null> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .upsert({ user_id: userId, ...updates, updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .select()
      .maybeSingle();
    if (error) {
      console.error('upsertProfile error:', error.message);
      return null;
    }
    return data as Profile | null;
  } catch (err: any) {
    console.error('upsertProfile network error:', err?.message ?? err);
    return null;
  }
}

export async function getLatestResume(userId: string) {
  const { data, error } = await supabase
    .from('resumes')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as Resume | null;
}

export async function saveResume(userId: string, resume: Partial<Resume>) {
  const { data, error } = await supabase
    .from('resumes')
    .insert({ user_id: userId, ...resume })
    .select()
    .maybeSingle();
  if (error) throw error;
  return data as Resume | null;
}

export async function getInterviews(userId: string) {
  const { data, error } = await supabase
    .from('interviews')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as Interview[];
}

export async function saveInterview(userId: string, interview: Partial<Interview>) {
  const { data, error } = await supabase
    .from('interviews')
    .insert({ user_id: userId, ...interview })
    .select()
    .maybeSingle();
  if (error) throw error;
  return data as Interview | null;
}

export async function getCodingEvaluations(userId: string) {
  const { data, error } = await supabase
    .from('coding_evaluations')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as CodingEvaluation[];
}

export async function saveCodingEvaluation(userId: string, evalData: Partial<CodingEvaluation>) {
  const { data, error } = await supabase
    .from('coding_evaluations')
    .insert({ user_id: userId, ...evalData })
    .select()
    .maybeSingle();
  if (error) throw error;
  return data as CodingEvaluation | null;
}

export async function getRoadmap(userId: string) {
  const { data, error } = await supabase
    .from('roadmaps')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as Roadmap | null;
}

export async function saveRoadmap(userId: string, roadmap: Partial<Roadmap>) {
  const { data, error } = await supabase
    .from('roadmaps')
    .insert({ user_id: userId, ...roadmap })
    .select()
    .maybeSingle();
  if (error) throw error;
  return data as Roadmap | null;
}

export async function updateRoadmap(id: string, updates: Partial<Roadmap>) {
  const { data, error } = await supabase
    .from('roadmaps')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .maybeSingle();
  if (error) throw error;
  return data as Roadmap | null;
}

export async function getChatHistory(userId: string) {
  const { data, error } = await supabase
    .from('chat_history')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(50);
  if (error) throw error;
  return data as ChatMessage[];
}

export async function saveChatMessage(userId: string, role: 'user' | 'assistant', content: string) {
  const { data, error } = await supabase
    .from('chat_history')
    .insert({ user_id: userId, role, content })
    .select()
    .maybeSingle();
  if (error) throw error;
  return data as ChatMessage | null;
}

export async function getAnalytics(userId: string) {
  const { data, error } = await supabase
    .from('analytics')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as Analytics | null;
}

// ===== NOTIFICATIONS =====
export async function getNotifications(userId: string) {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return data as Notification[];
}

export async function markNotificationRead(id: string) {
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('id', id);
  if (error) throw error;
}

export async function markAllNotificationsRead(userId: string) {
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('user_id', userId)
    .eq('is_read', false);
  if (error) throw error;
}

export async function createNotification(
  userId: string,
  notification: { title: string; message: string; type: Notification['type'] },
) {
  const { data, error } = await supabase
    .from('notifications')
    .insert({ user_id: userId, ...notification })
    .select()
    .maybeSingle();
  if (error) throw error;
  return data as Notification | null;
}

// ===== RESUME ANALYSIS =====
export async function getResumeAnalysis(resumeId: string) {
  const { data, error } = await supabase
    .from('resume_analysis')
    .select('*')
    .eq('resume_id', resumeId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as ResumeAnalysis | null;
}

export async function saveResumeAnalysis(
  userId: string,
  analysis: {
    resume_id: string;
    ats_score: number;
    summary_feedback: string;
    section_feedback: any;
    missing_sections: string[];
    keyword_gaps: string[];
    rewrite_suggestions: any[];
  },
) {
  const { data, error } = await supabase
    .from('resume_analysis')
    .insert({ user_id: userId, ...analysis })
    .select()
    .maybeSingle();
  if (error) throw error;
  return data as ResumeAnalysis | null;
}

// ===== SKILL GAP REPORTS =====
export async function getSkillGapReports(userId: string) {
  const { data, error } = await supabase
    .from('skill_gap_reports')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as SkillGapReport[];
}

export async function saveSkillGapReport(
  userId: string,
  report: {
    resume_id: string;
    company: string;
    role: string;
    result_json: any;
  },
) {
  const { data, error } = await supabase
    .from('skill_gap_reports')
    .insert({ user_id: userId, ...report })
    .select()
    .maybeSingle();
  if (error) throw error;
  return data as SkillGapReport | null;
}

// ===== AI VOICE/VIDEO INTERVIEW (Phase 1) =====
export async function createInterviewSession(
  userId: string,
  data: { resume_text: string; job_role: string | null },
) {
  const { data: result, error } = await supabase
    .from('interview_sessions')
    .insert({ user_id: userId, ...data })
    .select()
    .maybeSingle();
  if (error) throw error;
  return result as InterviewSession | null;
}

export async function saveInterviewQuestions(
  sessionId: string,
  questions: VideoInterviewQuestion[],
) {
  const rows = questions.map((q, i) => ({
    session_id: sessionId,
    question_text: q.text,
    question_type: q.type,
    order_index: i,
  }));
  const { error } = await supabase.from('interview_questions').insert(rows);
  if (error) throw error;
}

export async function getInterviewSession(sessionId: string) {
  const { data, error } = await supabase
    .from('interview_sessions')
    .select('*')
    .eq('id', sessionId)
    .maybeSingle();
  if (error) throw error;
  return data as InterviewSession | null;
}

export async function getInterviewQuestions(sessionId: string) {
  const { data, error } = await supabase
    .from('interview_questions')
    .select('*')
    .eq('session_id', sessionId)
    .order('order_index', { ascending: true });
  if (error) throw error;
  return data as InterviewQuestionRow[];
}

// ===== AI VOICE/VIDEO INTERVIEW (Phase 2) =====
export async function saveInterviewAnswer(answer: {
  session_id: string;
  question_id: string | null;
  question_text: string;
  transcript: string | null;
  video_url: string | null;
  audio_url: string | null;
  engagement_signals?: EngagementSignals | null;
}) {
  const { error } = await supabase.from('interview_answers').insert({
    ...answer,
    engagement_signals: answer.engagement_signals ?? null,
  });
  if (error) throw error;
}

export async function getInterviewAnswers(sessionId: string) {
  const { data, error } = await supabase
    .from('interview_answers')
    .select('*')
    .eq('session_id', sessionId)
    .order('answered_at', { ascending: true });
  if (error) throw error;
  return data as InterviewAnswerRow[];
}

export async function updateInterviewSessionStatus(
  sessionId: string,
  status: 'setup' | 'active' | 'in_progress' | 'completed' | 'expired' | 'terminated_violation',
) {
  const { error } = await supabase
    .from('interview_sessions')
    .update({ status })
    .eq('id', sessionId);
  if (error) throw error;
}

export async function recordInterviewViolation(
  sessionId: string,
  violationType: 'tab_switch' | 'fullscreen_exit' | 'device_error',
) {
  const { error } = await supabase
    .from('interview_sessions')
    .update({
      status: 'terminated_violation',
      violation_type: violationType,
      violation_at: new Date().toISOString(),
    })
    .eq('id', sessionId);
  if (error) throw error;
}

export async function updateInterviewStage(
  sessionId: string,
  stage: string,
) {
  const { error } = await supabase
    .from('interview_sessions')
    .update({ current_stage: stage })
    .eq('id', sessionId);
  if (error) throw error;
}

export async function uploadInterviewRecording(path: string, blob: Blob) {
  const { data, error } = await supabase.storage
    .from('interview-recordings')
    .upload(path, blob, { upsert: true });
  if (error) throw error;
  return data?.path ?? path;
}

// ===== CODING PROBLEMS =====
export async function getCodingProblems() {
  const { data, error } = await supabase
    .from('coding_problems')
    .select('*')
    .order('difficulty', { ascending: true });
  if (error) throw error;
  return data as CodingProblem[];
}

export async function getCodingProblem(id: string) {
  const { data, error } = await supabase
    .from('coding_problems')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data as CodingProblem | null;
}

// ===== INTERVIEW FEEDBACK (Phase 5) =====
export async function saveInterviewFeedback(feedback: {
  session_id: string;
  rating: number;
  comment?: string;
}) {
  const { data, error } = await supabase
    .from('interview_feedback')
    .insert(feedback)
    .select()
    .maybeSingle();
  if (error) throw error;
  return data as InterviewFeedback | null;
}

export async function getInterviewFeedback(sessionId: string) {
  const { data, error } = await supabase
    .from('interview_feedback')
    .select('*')
    .eq('session_id', sessionId)
    .maybeSingle();
  if (error) throw error;
  return data as InterviewFeedback | null;
}

// ===== ADMIN: USER DEMOGRAPHICS =====

export async function getAllProfiles(): Promise<AdminProfile[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as AdminProfile[];
}

export async function getSignupTrend(): Promise<{ date: string; count: number }[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('created_at');
  if (error) throw error;
  if (!data) return [];
  const byDay = new Map<string, number>();
  for (const row of data) {
    const d = new Date(row.created_at);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    byDay.set(key, (byDay.get(key) ?? 0) + 1);
  }
  return Array.from(byDay.entries())
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));
}
