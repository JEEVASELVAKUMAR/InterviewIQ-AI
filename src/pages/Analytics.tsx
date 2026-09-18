import { useEffect, useState, Component, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid,
  BarChart, Bar, Legend,
} from 'recharts';
import { BarChart3, TrendingUp, Award, Target, Zap, Flame, Map, MessageSquare, X, Send, Loader2, AlertTriangle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { getInterviews, getCodingEvaluations, getRoadmap } from '../services/database';
import { supabase } from '../lib/supabase';
import { chatWithAI } from '../services/ai';
import type { Interview, CodingEvaluation, Roadmap } from '../types';
import { PageHeader, Card, StatCard, EmptyState, ScoreRing } from '../components/ui';

class AnalyticsErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  render() {
    if (this.state.hasError) {
      return (
        <div>
          <PageHeader title="Interview Analytics" icon={<BarChart3 className="h-5 w-5" />} />
          <Card className="flex min-h-[300px] flex-col items-center justify-center text-center">
            <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-danger-500/10 text-danger-500">
              <AlertTriangle className="h-7 w-7" />
            </div>
            <h3 className="font-display text-base font-semibold text-ink-900 dark:text-white">Something went wrong</h3>
            <p className="mt-1 max-w-sm text-sm text-ink-500 dark:text-ink-400">
              We couldn't load your analytics. Try refreshing the page, or complete a mock interview or coding evaluation first.
            </p>
            <button onClick={() => window.location.reload()} className="btn-primary mt-4">Refresh Page</button>
          </Card>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function Analytics() {
  const { user } = useAuth();
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [codingEvals, setCodingEvals] = useState<CodingEvaluation[]>([]);
  const [roadmap, setRoadmap] = useState<Roadmap | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    Promise.all([getInterviews(user.id), getCodingEvaluations(user.id), getRoadmap(user.id)])
      .then(([iv, ce, rm]) => {
        setInterviews(iv);
        setCodingEvals(ce);
        setRoadmap(rm);
      })
      .finally(() => setLoading(false));

    // Realtime subscriptions
    const interviewChannel = supabase
      .channel('analytics-interviews')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'interviews', filter: `user_id=eq.${user.id}` },
        () => getInterviews(user.id).then(setInterviews))
      .subscribe();

    const codingChannel = supabase
      .channel('analytics-coding')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'coding_evaluations', filter: `user_id=eq.${user.id}` },
        () => getCodingEvaluations(user.id).then(setCodingEvals))
      .subscribe();

    const skillGapChannel = supabase
      .channel('analytics-skill-gap')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'skill_gap_reports', filter: `user_id=eq.${user.id}` },
        () => { /* triggers re-render via state */ })
      .subscribe();

    return () => {
      supabase.removeChannel(interviewChannel);
      supabase.removeChannel(codingChannel);
      supabase.removeChannel(skillGapChannel);
    };
  }, [user]);

  if (loading) {
    return (
      <AnalyticsErrorBoundary>
        <div>
          <PageHeader title="Interview Analytics" icon={<BarChart3 className="h-5 w-5" />} />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[...Array(4)].map((_, i) => <div key={i} className="skeleton h-28" />)}
          </div>
        </div>
      </AnalyticsErrorBoundary>
    );
  }

  const hasData = interviews.length > 0 || codingEvals.length > 0;

  if (!hasData) {
    return (
      <AnalyticsErrorBoundary>
        <div>
          <PageHeader title="Interview Analytics" icon={<BarChart3 className="h-5 w-5" />} />
          <EmptyState
            icon={<Zap className="h-7 w-7" />}
            title="No analytics yet"
            description="Complete mock interviews and coding evaluations to see your detailed analytics here."
            action={<a href="/mock-interview" className="btn-primary">Start Mock Interview</a>}
          />
        </div>
      </AnalyticsErrorBoundary>
    );
  }

  const avgInterview = interviews.length > 0
    ? interviews.reduce((s, i) => s + (i.overall_score ?? 0), 0) / interviews.length
    : 0;
  const avgCoding = codingEvals.length > 0
    ? codingEvals.reduce((s, c) => s + (c.score ?? 0), 0) / codingEvals.length
    : 0;
  const avgComm = interviews.length > 0
    ? interviews.reduce((s, i) => s + (i.scores?.communication ?? 0), 0) / interviews.length
    : 0;
  const avgTech = interviews.length > 0
    ? interviews.reduce((s, i) => s + (i.scores?.technicalAccuracy ?? 0), 0) / interviews.length
    : 0;
  const avgBehavioral = interviews.length > 0
    ? interviews.reduce((s, i) => s + (i.scores?.starMethod ?? 0), 0) / interviews.length
    : 0;
  const avgDepth = interviews.length > 0
    ? interviews.reduce((s, i) => s + (i.scores?.depth ?? 0), 0) / interviews.length
    : 0;

  // Fixed formula: technical × 0.30 + coding × 0.30 + communication × 0.20 + behavioral × 0.20
  const overall = Math.round(
    (avgTech * 0.30 + avgCoding * 0.30 + avgComm * 0.20 + avgBehavioral * 0.20) || 0,
  );

  const scoreRemark = (score: number) => {
    if (score >= 85) return 'Excellent';
    if (score >= 75) return 'Strong';
    if (score >= 60) return 'Good';
    if (score >= 40) return 'Needs Work';
    return 'Beginner';
  };

  // Roadmap progress
  const roadmapProgress = (() => {
    if (!roadmap?.roadmap_json?.phases) return 0;
    const phases = roadmap.roadmap_json.phases;
    if (phases.length === 0) return 0;
    const completed = phases.filter((p: any) => p.completed).length;
    return Math.round((completed / phases.length) * 100);
  })();

  // Roadmap phase breakdown for the progress chart
  const roadmapPhases = (() => {
    const phases = roadmap?.roadmap_json?.phases ?? roadmap?.plan?.phases ?? [];
    return Array.isArray(phases) ? phases : [];
  })();
  const roadmapChartData = roadmapPhases.map((p: any, i: number) => ({
    name: p.phaseTitle ?? `Phase ${i + 1}`,
    days: p.durationDays ?? 0,
    completed: p.completed ? 100 : 0,
  }));

  const radarData = [
    { skill: 'Communication', value: Math.round(avgComm) },
    { skill: 'Technical', value: Math.round(avgTech) },
    { skill: 'Coding', value: Math.round(avgCoding) },
    { skill: 'Behavioral', value: Math.round(avgBehavioral) },
    { skill: 'Depth', value: Math.round(avgDepth) },
  ];

  // Multi-line trend: Technical / Communication / Coding
  const maxLen = Math.max(interviews.length, codingEvals.length);
  const trendData = Array.from({ length: Math.min(maxLen, 15) }, (_, i) => {
    const iv = interviews[interviews.length - 1 - i];
    const ce = codingEvals[codingEvals.length - 1 - i];
    return {
      name: `#${i + 1}`,
      Technical: iv ? Math.round(iv.scores?.technicalAccuracy ?? 0) : null,
      Communication: iv ? Math.round(iv.scores?.communication ?? 0) : null,
      Coding: ce ? Math.round(ce.score ?? 0) : null,
    };
  }).reverse();

  // Average score trend (line)
  const avgTrendData = interviews.slice(0, 15).reverse().map((iv, i) => ({
    name: `#${i + 1}`,
    Score: Math.round(iv.overall_score ?? 0),
  }));

  const codingTrend = codingEvals.slice(0, 15).reverse().map((c, i) => ({
    name: `#${i + 1}`,
    score: Math.round(c.score ?? 0),
  }));

  const typeBreakdown = interviews.reduce((acc, iv) => {
    const t = iv.type ?? 'Unknown';
    acc[t] = (acc[t] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const typeData = Object.entries(typeBreakdown).map(([name, count]) => ({ name, count }));

  // Weak skills heatmap data
  const allSkills = new Set<string>();
  interviews.forEach((iv) => {
    iv.scores && Object.entries(iv.scores).forEach(([k, v]) => {
      if (typeof v === 'number' && v < 60) allSkills.add(k as string);
    });
  });
  const weakSkills = Array.from(allSkills).slice(0, 6);

  return (
    <AnalyticsErrorBoundary>
      <AnalyticsContent
        interviews={interviews}
        codingEvals={codingEvals}
        roadmap={roadmap}
        overall={overall}
        avgComm={avgComm}
        avgTech={avgTech}
        avgCoding={avgCoding}
        avgBehavioral={avgBehavioral}
        avgDepth={avgDepth}
        roadmapProgress={roadmapProgress}
        radarData={radarData}
        avgTrendData={avgTrendData}
        trendData={trendData}
        codingTrend={codingTrend}
        typeData={typeData}
        roadmapChartData={roadmapChartData}
        weakSkills={weakSkills}
        scoreRemark={scoreRemark}
      />
    </AnalyticsErrorBoundary>
  );
}

function AnalyticsContent(props: {
  interviews: Interview[];
  codingEvals: CodingEvaluation[];
  roadmap: Roadmap | null;
  overall: number;
  avgComm: number;
  avgTech: number;
  avgCoding: number;
  avgBehavioral: number;
  avgDepth: number;
  roadmapProgress: number;
  radarData: any[];
  avgTrendData: any[];
  trendData: any[];
  codingTrend: any[];
  typeData: any[];
  roadmapChartData: any[];
  weakSkills: string[];
  scoreRemark: (s: number) => string;
}) {
  const { interviews, codingEvals, roadmap, overall, avgComm, avgTech, avgCoding, avgBehavioral, roadmapProgress, radarData, avgTrendData, trendData, codingTrend, typeData, roadmapChartData, weakSkills, scoreRemark } = props;

  // AI assistant widget state
  const [aiOpen, setAiOpen] = useState(false);
  const [aiInput, setAiInput] = useState('');
  const [aiResponse, setAiResponse] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  const askAI = async () => {
    if (!aiInput.trim()) return;
    setAiLoading(true);
    setAiResponse(null);
    try {
      const context = `User analytics data: Overall score ${overall}, Technical ${avgTech}, Communication ${avgComm}, Coding ${avgCoding}, Behavioral ${avgBehavioral}. ${interviews.length} interviews, ${codingEvals.length} coding evaluations. Weak skills: ${weakSkills.join(', ') || 'none'}. Roadmap progress: ${roadmapProgress}%.`;
      const res = await chatWithAI({
        message: `${aiInput}\n\nContext: ${context}`,
        history: [],
      });
      setAiResponse(res.response ?? res.message ?? 'No response.');
    } catch {
      setAiResponse('Sorry, I could not analyze your data right now.');
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Interview Analytics"
        subtitle="Real-time tracking of your progress with detailed visualizations."
        icon={<BarChart3 className="h-5 w-5" />}
      />

      {/* Top stats */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Overall Score" value={`${overall} · ${scoreRemark(overall)}`} icon={<Award className="h-5 w-5" />} accent="brand" />
        <StatCard label="Interviews" value={interviews.length} icon={<Target className="h-5 w-5" />} accent="accent" />
        <StatCard label="Coding Evals" value={codingEvals.length} icon={<TrendingUp className="h-5 w-5" />} accent="success" />
        <StatCard label="Roadmap Progress" value={`${roadmapProgress}%`} icon={<Map className="h-5 w-5" />} accent="brand" />
      </div>

      {/* Overall ring + radar */}
      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <Card className="flex flex-col items-center justify-center">
          <ScoreRing score={overall} size={140} label="Overall" />
          <p className="mt-3 text-sm text-ink-500 dark:text-ink-400">{scoreRemark(overall)}</p>
        </Card>
        <Card className="lg:col-span-2">
          <h3 className="mb-4 font-display text-base font-semibold text-ink-900 dark:text-white">Skill Radar</h3>
          <ResponsiveContainer width="100%" height={260}>
            <RadarChart data={radarData}>
              <PolarGrid stroke="currentColor" className="text-ink-200 dark:text-ink-700" />
              <PolarAngleAxis dataKey="skill" tick={{ fontSize: 12, fill: 'currentColor' }} className="text-ink-500 dark:text-ink-400" />
              <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
              <Radar dataKey="value" stroke="#06b6d4" fill="#06b6d4" fillOpacity={0.3} strokeWidth={2} />
              <Tooltip contentStyle={{ background: 'rgba(15,23,42,0.9)', border: 'none', borderRadius: 12, color: '#fff', fontSize: 12 }} />
            </RadarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      {/* Average score trend */}
      <div className="mb-6">
        <Card>
          <h3 className="mb-4 font-display text-base font-semibold text-ink-900 dark:text-white">Average Score Trend</h3>
          {avgTrendData.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={avgTrendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-ink-100 dark:text-ink-800" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'currentColor' }} className="text-ink-400" />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: 'currentColor' }} className="text-ink-400" />
                <Tooltip contentStyle={{ background: 'rgba(15,23,42,0.9)', border: 'none', borderRadius: 12, color: '#fff', fontSize: 12 }} />
                <Line type="monotone" dataKey="Score" stroke="#06b6d4" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-[260px] items-center justify-center text-sm text-ink-400">No interview data</div>
          )}
        </Card>
      </div>

      {/* Multi-line trend: Technical / Communication / Coding */}
      <div className="mb-6">
        <Card>
          <h3 className="mb-4 font-display text-base font-semibold text-ink-900 dark:text-white">Technical / Communication / Coding Trends</h3>
          {trendData.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-ink-100 dark:text-ink-800" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'currentColor' }} className="text-ink-400" />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: 'currentColor' }} className="text-ink-400" />
                <Tooltip contentStyle={{ background: 'rgba(15,23,42,0.9)', border: 'none', borderRadius: 12, color: '#fff', fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="Technical" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                <Line type="monotone" dataKey="Communication" stroke="#22c55e" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                <Line type="monotone" dataKey="Coding" stroke="#06b6d4" strokeWidth={2} dot={{ r: 3 }} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-[260px] items-center justify-center text-sm text-ink-400">No trend data yet</div>
          )}
        </Card>
      </div>

      {/* Coding score trend + Interview types */}
      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <h3 className="mb-4 font-display text-base font-semibold text-ink-900 dark:text-white">Coding Score Trend</h3>
          {codingTrend.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={codingTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-ink-100 dark:text-ink-800" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'currentColor' }} className="text-ink-400" />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: 'currentColor' }} className="text-ink-400" />
                <Tooltip contentStyle={{ background: 'rgba(15,23,42,0.9)', border: 'none', borderRadius: 12, color: '#fff', fontSize: 12 }} />
                <Line type="monotone" dataKey="score" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-[240px] items-center justify-center text-sm text-ink-400">No coding evaluations yet</div>
          )}
        </Card>

        <Card>
          <h3 className="mb-4 font-display text-base font-semibold text-ink-900 dark:text-white">Interview Types</h3>
          {typeData.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={typeData}>
                <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-ink-100 dark:text-ink-800" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'currentColor' }} className="text-ink-400" />
                <YAxis tick={{ fontSize: 11, fill: 'currentColor' }} className="text-ink-400" allowDecimals={false} />
                <Tooltip contentStyle={{ background: 'rgba(15,23,42,0.9)', border: 'none', borderRadius: 12, color: '#fff', fontSize: 12 }} />
                <Bar dataKey="count" fill="#06b6d4" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-[240px] items-center justify-center text-sm text-ink-400">No data</div>
          )}
        </Card>
      </div>

      {/* Roadmap progress chart */}
      {roadmapChartData.length > 0 && (
        <Card className="mb-6">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-display text-base font-semibold text-ink-900 dark:text-white">Roadmap Progress</h3>
            <Badge color="brand">{roadmapProgress}% complete</Badge>
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={roadmapChartData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-ink-100 dark:text-ink-800" />
              <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11, fill: 'currentColor' }} className="text-ink-400" />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: 'currentColor' }} className="text-ink-400" width={140} />
              <Tooltip contentStyle={{ background: 'rgba(15,23,42,0.9)', border: 'none', borderRadius: 12, color: '#fff', fontSize: 12 }} />
              <Bar dataKey="completed" fill="#22c55e" radius={[0, 8, 8, 0]} name="Progress %" />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* Weak skill heatmap */}
      <Card>
        <h3 className="mb-4 font-display text-base font-semibold text-ink-900 dark:text-white">Weak Skill Heatmap</h3>
        {weakSkills.length > 0 ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {weakSkills.map((skill) => {
              const scores = interviews.map((iv) => (iv.scores as Record<string, number | undefined> | undefined)?.[skill] ?? 0).filter((s) => s > 0);
              const avg = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
              const intensity = Math.min(1, (100 - avg) / 100);
              return (
                <div
                  key={skill}
                  className="rounded-xl p-3 text-center"
                  style={{ backgroundColor: `rgba(239, 68, 68, ${0.1 + intensity * 0.3})` }}
                >
                  <p className="text-xs font-medium text-ink-700 dark:text-ink-200 capitalize">
                    {skill.replace(/([A-Z])/g, ' $1').trim()}
                  </p>
                  <p className="mt-1 font-display text-lg font-bold text-danger-500">{Math.round(avg)}</p>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex h-[240px] items-center justify-center text-center text-sm text-ink-400">
            <div>
              <Flame className="mx-auto mb-2 h-8 w-8 text-success-500" />
              No weak areas detected — great job!
            </div>
          </div>
        )}
      </Card>

      {/* AI Analytics Assistant */}
      <div className="mt-4 flex justify-end">
        <button onClick={() => setAiOpen(!aiOpen)} className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium transition ${aiOpen ? 'bg-brand-500 text-white' : 'bg-brand-500/10 text-brand-600 dark:text-brand-400'}`}>
          <MessageSquare className="h-4 w-4" /> Ask AI about your analytics
        </button>
      </div>

      <AnimatePresence>
        {aiOpen && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }} className="fixed bottom-4 right-4 z-40 w-80 max-w-[calc(100vw-2rem)] sm:w-96">
            <Card className="!p-0">
              <div className="flex items-center justify-between border-b border-ink-200 dark:border-ink-700 px-4 py-3">
                <div className="flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-brand-500" />
                  <h3 className="font-display text-sm font-semibold text-ink-900 dark:text-white">Analytics Assistant</h3>
                </div>
                <button onClick={() => setAiOpen(false)} className="text-ink-400 hover:text-ink-600"><X className="h-4 w-4" /></button>
              </div>
              <div className="max-h-[400px] overflow-y-auto p-4">
                <p className="mb-3 text-xs text-ink-500">Ask questions about your analytics — e.g. "why is my communication score low?" or "what should I focus on?"</p>
                {aiResponse && !aiLoading && (
                  <div className="mb-3 rounded-xl bg-ink-50 dark:bg-ink-900/50 p-3">
                    <p className="whitespace-pre-wrap text-sm text-ink-600 dark:text-ink-300">{aiResponse}</p>
                  </div>
                )}
                {aiLoading && <div className="flex items-center gap-2 text-sm text-ink-400"><Loader2 className="h-4 w-4 animate-spin" /> Analyzing your data...</div>}
                <div className="flex gap-2">
                  <input value={aiInput} onChange={(e) => setAiInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && askAI()} placeholder="Ask about your analytics..." className="input flex-1 text-sm" />
                  <button onClick={askAI} disabled={aiLoading} className="btn-primary !px-3"><Send className="h-4 w-4" /></button>
                </div>
              </div>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
