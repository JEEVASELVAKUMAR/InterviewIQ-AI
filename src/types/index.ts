export type Profile = {
  id: string;
  user_id: string;
  full_name: string | null;
  college: string | null;
  branch: string | null;
  year: string | null;
  skills: string[];
  status: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
};

export type SignupData = {
  fullName: string;
  email: string;
  password: string;
  college?: string;
  branch: string;
  year: string;
  skills?: string[];
  status: string;
};

export type AdminProfile = Profile & {
  email?: string | null;
};

export type Resume = {
  id: string;
  user_id: string;
  file_name: string | null;
  raw_text: string | null;
  skills: string[];
  projects: any[];
  education: any[];
  experience: any[];
  certifications: any[];
  created_at: string;
};

export type ResumeAnalysis = {
  id: string;
  user_id: string;
  resume_id: string | null;
  ats_score: number | null;
  summary_feedback: string | null;
  section_feedback: {
    summary?: string;
    skills?: string;
    experience?: string;
    projects?: string;
    education?: string;
  };
  missing_sections: string[];
  keyword_gaps: string[];
  rewrite_suggestions: { original: string; improved: string }[];
  created_at: string;
};

export type InterviewTurn = {
  question: string;
  answer: string;
  evaluation?: any;
  followUp?: string;
};

export type InterviewScores = {
  confidence: number;
  grammar: number;
  communication: number;
  technicalAccuracy: number;
  depth: number;
  starMethod: number;
  overall: number;
};

export type Interview = {
  id: string;
  user_id: string;
  difficulty: string | null;
  type: string | null;
  question_count: number | null;
  transcript: InterviewTurn[];
  scores: Partial<InterviewScores>;
  feedback: any;
  overall_score: number | null;
  status: string;
  monitoring_flags: any[];
  ended_early: boolean | null;
  end_reason: string | null;
  voice_used: boolean | null;
  company: string | null;
  role: string | null;
  resume_id: string | null;
  created_at: string;
};

export type CodingEvaluation = {
  id: string;
  user_id: string;
  language: string | null;
  problem: string | null;
  code: string | null;
  evaluation: any;
  score: number | null;
  created_at: string;
};

export type CodingProblem = {
  id: string;
  title: string;
  difficulty: string;
  statement: string;
  constraints: string | null;
  examples: any[];
  visible_test_cases: any[];
  hidden_test_cases: any[];
  topic_tags: string[];
  created_at: string;
};

export type Roadmap = {
  id: string;
  user_id: string;
  plan: any;
  input_json: any;
  roadmap_json: any;
  target_role: string | null;
  target_company: string | null;
  created_at: string;
  updated_at: string;
};

export type ChatMessage = {
  id: string;
  user_id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
};

export type Notification = {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: 'interview' | 'coding' | 'roadmap' | 'skill_gap' | 'system';
  is_read: boolean;
  link_path: string | null;
  created_at: string;
};

export type SkillGapReport = {
  id: string;
  user_id: string;
  resume_id: string | null;
  company: string;
  role: string;
  result_json: SkillGapResultV2;
  created_at: string;
};

export type Analytics = {
  id: string;
  user_id: string;
  overall_score: number | null;
  coding_score: number | null;
  communication_score: number | null;
  technical_score: number | null;
  behavioral_score: number | null;
  skill_progress: Record<string, number>;
  weak_areas: string[];
  strong_areas: string[];
  interviews_count: number;
  snapshot_date: string;
  created_at: string;
};

export type SkillGapResult = {
  score: number;
  missingSkills: string[];
  strengths: string[];
  weaknesses: string[];
  roadmap: {
    skill: string;
    priority: string;
    estimatedTime: string;
    courses: string[];
    projects: string[];
    difficulty: string;
  }[];
};

export type SkillGapResultV2 = {
  company: string;
  role: string;
  requiredSkills: string[];
  matchedSkills: string[];
  missingSkills: string[];
  fundamentalsFirst?: string[];
  priorityOrder: string[];
  estimatedLearningTime: Record<string, string>;
  resources: { skill: string; courses: string[]; projects: string[]; difficulty: string }[];
  verdictSummary: string;
};

export type RewrittenResume = {
  rewrittenResume: {
    summary: string;
    sections: { title: string; items: string[] }[];
    skills: string[];
  };
  rewrittenAtsScore: number;
  changesSummary: string;
};

export type InterviewDebrief = {
  debrief: {
    overallSummary: string;
    strengths: string[];
    improvements: string[];
    scoreBreakdown: {
      confidence: number;
      grammar: number;
      communication: number;
      technicalAccuracy: number;
      depth: number;
      starMethod: number;
      overall: number;
    };
    recommendation: string;
  };
};

export type UserAiMemory = {
  user_id: string;
  resume_summary?: string | null;
  preferred_language?: string | null;
  weak_topics?: string[];
  strong_topics?: string[];
  company_preferences?: string[];
  active_roadmap_id?: string | null;
  interview_progress?: any;
  updated_at?: string;
};

export type CodingEvalResult = {
  correctness: number;
  timeComplexity: string;
  spaceComplexity: string;
  optimization: string;
  codeStyle: number;
  edgeCases: string[];
  bugs: string[];
  finalScore: number;
  improvements: string[];
};

export type CodingEvalResultV2 = {
  testCaseResults: { id: number; passed: boolean; expected: string; actual: string }[];
  timeComplexity: string;
  spaceComplexity: string;
  codeQuality: number;
  edgeCasesHandled: boolean;
  bugsDetected: string[];
  finalScore: number;
  suggestedImprovements: string[];
};

// ===== AI VOICE/VIDEO INTERVIEW (Phase 1) =====
export type VideoInterviewQuestion = {
  id: string;
  text: string;
  type: 'technical' | 'behavioral' | 'resume-based';
};

export type InterviewSession = {
  id: string;
  user_id: string;
  resume_text: string | null;
  job_role: string | null;
  status: 'setup' | 'active' | 'in_progress' | 'completed' | 'expired' | 'terminated_violation';
  created_at: string;
  violation_type?: 'tab_switch' | 'fullscreen_exit' | 'device_error' | null;
  violation_at?: string | null;
  current_stage?: string | null;
};

export type InterviewQuestionRow = {
  id: string;
  session_id: string;
  question_text: string;
  question_type: 'technical' | 'behavioral' | 'resume-based';
  order_index: number;
  created_at: string;
};

// ===== AI VOICE/VIDEO INTERVIEW (Phase 2) =====
export type InterviewAnswerRow = {
  id: string;
  session_id: string;
  question_id: string | null;
  question_text: string;
  transcript: string | null;
  video_url: string | null;
  audio_url: string | null;
  answered_at: string;
  engagement_signals?: EngagementSignals | null;
};

// ===== AI VOICE/VIDEO INTERVIEW (Phase 3) =====
export type EngagementSignals = {
  eyeContactPct: number;
  speakingPaceWPM: number;
  fillerWordCount: number;
  fillerWords: string[];
  answerCompleteness: 'complete' | 'partial' | 'minimal';
  sampleCount: number;
};

export type NextQuestionResult = {
  done: boolean;
  transition: string;
  question: string | null;
  type: string;
  isFollowUp?: boolean;
  stage?: string;
};

export type InterviewStage = 'entry' | 'icebreaker' | 'background' | 'core' | 'closing';

export type InterviewFeedback = {
  id: string;
  session_id: string | null;
  user_id: string;
  rating: number;
  comment: string | null;
  created_at: string;
};

export type RoadmapResource = {
  title: string;
  url: string;
  type: string;
};

export type RoadmapPhase = {
  phaseTitle: string;
  durationDays: number;
  reasoning: string;
  learningOrder?: number;
  prerequisites?: string[];
  difficulty?: string;
  dailyTasks: string[];
  weeklyGoals: string[];
  monthlyGoals?: string[];
  miniProjects: string[];
  milestones?: string[];
  interviewReadinessGoals?: string[];
  checkpointMockInterview: boolean;
  resources: string[] | RoadmapResource[];
};

export type RoadmapPlanV2 = {
  phases: RoadmapPhase[];
};

export type ResumeAnalysisResult = {
  atsScore: number;
  summaryFeedback: string;
  sectionFeedback: {
    summary: string;
    skills: string;
    experience: string;
    projects: string;
    education: string;
  };
  missingSections: string[];
  keywordGaps: string[];
  rewriteSuggestions: { original: string; improved: string }[];
};
