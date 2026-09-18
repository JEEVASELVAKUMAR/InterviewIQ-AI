import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import {
  LayoutDashboard,
  FileText,
  MessageSquare,
  Code2,
  Target,
  TrendingUp,
  Award,
  Zap,
  ArrowRight,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { getInterviews, getCodingEvaluations, getLatestResume } from '../services/database';
import type { Interview, CodingEvaluation, Resume } from '../types';
import { PageHeader, Card, ScoreRing, StatCard, EmptyState, Badge } from '../components/ui';

export default function Dashboard() {
  const { user, profile } = useAuth();
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [codingEvals, setCodingEvals] = useState<CodingEvaluation[]>([]);
  const [resume, setResume] = useState<Resume | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      getInterviews(user.id),
      getCodingEvaluations(user.id),
      getLatestResume(user.id),
    ])
      .then(([iv, ce, r]) => {
        setInterviews(iv);
        setCodingEvals(ce);
        setResume(r);
      })
      .finally(() => setLoading(false));
  }, [user]);

  const avgInterviewScore =
    interviews.length > 0
      ? interviews.reduce((s, i) => s + (i.overall_score ?? 0), 0) / interviews.length
      : 0;
  const avgCodingScore =
    codingEvals.length > 0
      ? codingEvals.reduce((s, c) => s + (c.score ?? 0), 0) / codingEvals.length
      : 0;

  const communicationScore =
    interviews.length > 0
      ? interviews.reduce((s, i) => s + (i.scores?.communication ?? 0), 0) / interviews.length
      : 0;
  const technicalScore =
    interviews.length > 0
      ? interviews.reduce((s, i) => s + (i.scores?.technicalAccuracy ?? 0), 0) / interviews.length
      : 0;
  const behavioralScore =
    interviews.length > 0
      ? interviews.reduce((s, i) => s + (i.scores?.starMethod ?? 0), 0) / interviews.length
      : 0;

  const overallScore = Math.round(
    (technicalScore * 0.30 + avgCodingScore * 0.30 + communicationScore * 0.20 + behavioralScore * 0.20) || 0,
  );

  const scoreRemark = (score: number) => {
    if (score >= 85) return 'Excellent';
    if (score >= 75) return 'Strong';
    if (score >= 60) return 'Good';
    if (score >= 40) return 'Needs Work';
    return 'Beginner';
  };

  const radarData = [
    { skill: 'Communication', value: Math.round(communicationScore) },
    { skill: 'Technical', value: Math.round(technicalScore) },
    { skill: 'Coding', value: Math.round(avgCodingScore) },
    { skill: 'Behavioral', value: Math.round(behavioralScore) },
    { skill: 'Overall', value: overallScore },
  ];

  const trendData = interviews.slice(0, 10).reverse().map((iv, i) => ({
    name: `#${i + 1}`,
    score: Math.round(iv.overall_score ?? 0),
  }));

  const quickActions = [
    { to: '/resume', label: 'Upload Resume', icon: FileText, desc: 'Get AI analysis' },
    { to: '/skill-gap', label: 'Skill Gap', icon: Target, desc: 'Find missing skills' },
    { to: '/mock-interview', label: 'Mock Interview', icon: MessageSquare, desc: 'Practice now' },
    { to: '/coding', label: 'Coding Eval', icon: Code2, desc: 'Test your code' },
  ];

  if (loading) {
    return (
      <div>
        <PageHeader title="Dashboard" subtitle="Loading your progress..." icon={<LayoutDashboard className="h-5 w-5" />} />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="skeleton h-28" />
          ))}
        </div>
      </div>
    );
  }

  const hasData = interviews.length > 0 || codingEvals.length > 0;

  return (
    <div>
      <PageHeader
        title={`Welcome, ${profile?.full_name?.split(' ')[0] || 'there'}!`}
        subtitle="Here's your interview preparation progress at a glance."
        icon={<LayoutDashboard className="h-5 w-5" />}
      />

      {/* Welcome banner */}
      {!resume && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 flex flex-col items-start justify-between gap-4 rounded-2xl bg-gradient-to-r from-brand-500/10 to-brand-600/5 border border-brand-500/20 p-5 sm:flex-row sm:items-center"
        >
          <div>
            <h3 className="font-display text-lg font-semibold text-ink-900 dark:text-white">
              Start by uploading your resume
            </h3>
            <p className="mt-1 text-sm text-ink-500 dark:text-ink-400">
              AI will extract your skills, projects, and experience to personalize everything.
            </p>
          </div>
          <Link to="/resume" className="btn-primary shrink-0">
            Upload Resume <ArrowRight className="h-4 w-4" />
          </Link>
        </motion.div>
      )}

      {/* Score overview */}
      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <Card className="flex flex-col items-center justify-center">
          <ScoreRing score={overallScore} size={140} label="Overall" />
          <p className="mt-3 text-sm font-medium text-ink-500 dark:text-ink-400">Overall Score · {scoreRemark(overallScore)}</p>
        </Card>
        <div className="grid grid-cols-2 gap-4 lg:col-span-2">
          <StatCard label="Interview Score" value={Math.round(avgInterviewScore)} icon={<Award className="h-5 w-5" />} accent="brand" />
          <StatCard label="Coding Score" value={Math.round(avgCodingScore)} icon={<Code2 className="h-5 w-5" />} accent="accent" />
          <StatCard label="Communication" value={Math.round(communicationScore)} icon={<MessageSquare className="h-5 w-5" />} accent="success" />
          <StatCard label="Technical" value={Math.round(technicalScore)} icon={<TrendingUp className="h-5 w-5" />} accent="brand" />
        </div>
      </div>

      {/* Quick actions */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {quickActions.map((a) => {
          const Icon = a.icon;
          return (
            <Link
              key={a.to}
              to={a.to}
              className="card group flex items-center gap-3 p-4 transition-all hover:shadow-md hover:-translate-y-0.5"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500/10 text-brand-500 transition-transform group-hover:scale-110">
                <Icon className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-ink-900 dark:text-white">{a.label}</p>
                <p className="text-xs text-ink-400">{a.desc}</p>
              </div>
              <ArrowRight className="h-4 w-4 text-ink-300 transition-transform group-hover:translate-x-1" />
            </Link>
          );
        })}
      </div>

      {/* Charts */}
      {hasData ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <h3 className="mb-4 font-display text-base font-semibold text-ink-900 dark:text-white">Skill Breakdown</h3>
            <ResponsiveContainer width="100%" height={260}>
              <RadarChart data={radarData}>
                <PolarGrid stroke="currentColor" className="text-ink-200 dark:text-ink-700" />
                <PolarAngleAxis dataKey="skill" tick={{ fontSize: 12, fill: 'currentColor' }} className="text-ink-500 dark:text-ink-400" />
                <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                <Radar dataKey="value" stroke="#06b6d4" fill="#06b6d4" fillOpacity={0.3} strokeWidth={2} />
                <Tooltip
                  contentStyle={{
                    background: 'rgba(15,23,42,0.9)',
                    border: 'none',
                    borderRadius: 12,
                    color: '#fff',
                    fontSize: 12,
                  }}
                />
              </RadarChart>
            </ResponsiveContainer>
          </Card>

          <Card>
            <h3 className="mb-4 font-display text-base font-semibold text-ink-900 dark:text-white">Interview Score Trend</h3>
            {trendData.length > 0 ? (
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={trendData}>
                  <defs>
                    <linearGradient id="scoreGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-ink-100 dark:text-ink-800" />
                  <XAxis dataKey="name" tick={{ fontSize: 12, fill: 'currentColor' }} className="text-ink-400" />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 12, fill: 'currentColor' }} className="text-ink-400" />
                  <Tooltip
                    contentStyle={{
                      background: 'rgba(15,23,42,0.9)',
                      border: 'none',
                      borderRadius: 12,
                      color: '#fff',
                      fontSize: 12,
                    }}
                  />
                  <Area type="monotone" dataKey="score" stroke="#06b6d4" strokeWidth={2} fill="url(#scoreGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-[260px] items-center justify-center text-sm text-ink-400">
                No interview data yet
              </div>
            )}
          </Card>
        </div>
      ) : (
        <EmptyState
          icon={<Zap className="h-7 w-7" />}
          title="No activity yet"
          description="Start a mock interview or coding evaluation to see your analytics here."
          action={
            <Link to="/mock-interview" className="btn-primary">
              Start a Mock Interview <ArrowRight className="h-4 w-4" />
            </Link>
          }
        />
      )}

      {/* Recent interviews */}
      {interviews.length > 0 && (
        <div className="mt-6">
          <h3 className="mb-3 font-display text-base font-semibold text-ink-900 dark:text-white">Recent Interviews</h3>
          <div className="space-y-2">
            {interviews.slice(0, 5).map((iv) => {
              const score = iv.overall_score ?? 0;
              return (
                <div key={iv.id} className="card flex items-center justify-between p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500/10 text-brand-500">
                      <MessageSquare className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-ink-900 dark:text-white">
                        {iv.type} · {iv.difficulty}
                      </p>
                      <p className="text-xs text-ink-400">
                        {new Date(iv.created_at).toLocaleDateString()} · {iv.question_count} questions
                      </p>
                    </div>
                  </div>
                  <Badge color={score >= 75 ? 'success' : score >= 50 ? 'warning' : 'danger'}>
                    {Math.round(score)}/100
                  </Badge>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
