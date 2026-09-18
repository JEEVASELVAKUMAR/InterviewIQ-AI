import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Brain,
  FileText,
  Target,
  MessageSquare,
  Code2,
  Map,
  BarChart3,
  Bot,
  ArrowRight,
  Check,
  Sparkles,
  Shield,
  Zap,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const features = [
  { icon: FileText, title: 'Resume Analysis', desc: 'Upload your PDF resume and let AI extract skills, projects, and experience automatically.' },
  { icon: Target, title: 'Skill Gap Analysis', desc: 'Compare your skills against dream company requirements and get a prioritized learning path.' },
  { icon: MessageSquare, title: 'AI Mock Interviews', desc: 'Practice with adaptive AI interviews across HR, technical, DSA, system design, and behavioral.' },
  { icon: Code2, title: 'Coding Evaluation', desc: 'Submit code in Java, Python, C++, or JS and get instant feedback on complexity, style, and bugs.' },
  { icon: Map, title: 'Personalized Roadmaps', desc: '30/60/90-day plans with daily tasks, weekly goals, mini projects, and curated resources.' },
  { icon: BarChart3, title: 'Interview Analytics', desc: 'Track your progress with radar charts, trend lines, and weak-skill heatmaps.' },
  { icon: Bot, title: 'AI Chat Assistant', desc: 'Context-aware career coach that uses your resume to answer interview and coding questions.' },
  { icon: Brain, title: 'RAG-Powered Insights', desc: 'Resume-aware retrieval ensures every AI response is grounded in your actual experience.' },
];

const stats = [
  { value: '8', label: 'AI Features' },
  { value: '4', label: 'Languages' },
  { value: '30/60/90', label: 'Day Plans' },
  { value: '100%', label: 'Personalized' },
];

export default function LandingPage() {
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-ink-50 dark:bg-ink-950">
      {/* Nav */}
      <nav className="sticky top-0 z-50 border-b border-ink-200/60 dark:border-ink-800/60 bg-white/70 dark:bg-ink-950/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 lg:px-8">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-400 to-brand-600 text-white shadow-lg shadow-brand-500/20">
              <Brain className="h-5 w-5" />
            </div>
            <span className="font-display text-lg font-bold text-ink-900 dark:text-white">InterviewIQ AI</span>
          </div>
          <div className="flex items-center gap-3">
            <Link to={user ? '/dashboard' : '/login'} className="btn-ghost hidden sm:inline-flex">
              {user ? 'Dashboard' : 'Sign in'}
            </Link>
            <Link to="/signup" className="btn-primary">
              Get Started <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-grid-light dark:bg-grid-dark [background-size:40px_40px]" />
        <div className="absolute inset-0 bg-radial-fade" />
        <div className="relative mx-auto max-w-7xl px-4 py-20 lg:px-8 lg:py-28">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="mx-auto max-w-3xl text-center"
          >
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-brand-500/20 bg-brand-500/10 px-4 py-1.5 text-sm font-medium text-brand-600 dark:text-brand-400">
              <Sparkles className="h-4 w-4" /> Powered by Gemini + Groq fallback
            </div>
            <h1 className="font-display text-4xl font-extrabold leading-tight tracking-tight text-ink-900 dark:text-white sm:text-6xl">
              Land your dream job with{' '}
              <span className="bg-gradient-to-r from-brand-400 to-brand-600 bg-clip-text text-transparent">
                AI-powered interview prep
              </span>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg text-ink-500 dark:text-ink-400">
              Mock interviews, resume analysis, skill gap detection, coding evaluation, and personalized
              roadmaps — all in one platform built for placement success.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link to="/signup" className="btn-primary px-6 py-3 text-base">
                Start Free <ArrowRight className="h-5 w-5" />
              </Link>
              <Link to="/login" className="btn-outline px-6 py-3 text-base">
                Sign in
              </Link>
            </div>
          </motion.div>

          {/* Stats */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="mx-auto mt-16 grid max-w-3xl grid-cols-2 gap-4 sm:grid-cols-4"
          >
            {stats.map((s) => (
              <div key={s.label} className="card p-5 text-center">
                <p className="font-display text-2xl font-bold text-brand-500">{s.value}</p>
                <p className="mt-1 text-sm text-ink-500 dark:text-ink-400">{s.label}</p>
              </div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-7xl px-4 py-20 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-display text-3xl font-bold tracking-tight text-ink-900 dark:text-white">
            Everything you need to crack the interview
          </h2>
          <p className="mt-3 text-ink-500 dark:text-ink-400">
            Eight AI-powered modules working together, grounded in your resume and interview history.
          </p>
        </div>
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((f, i) => {
            const Icon = f.icon;
            return (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: i * 0.05 }}
                className="card group p-5 transition-all hover:shadow-md hover:-translate-y-0.5"
              >
                <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-brand-500/10 text-brand-500 transition-transform group-hover:scale-110">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="font-display text-base font-semibold text-ink-900 dark:text-white">{f.title}</h3>
                <p className="mt-1.5 text-sm text-ink-500 dark:text-ink-400">{f.desc}</p>
              </motion.div>
            );
          })}
        </div>
      </section>

      {/* How it works */}
      <section className="border-y border-ink-200/60 dark:border-ink-800/60 bg-white/50 dark:bg-ink-900/30">
        <div className="mx-auto max-w-7xl px-4 py-20 lg:px-8">
          <h2 className="text-center font-display text-3xl font-bold tracking-tight text-ink-900 dark:text-white">
            How it works
          </h2>
          <div className="mt-12 grid gap-8 md:grid-cols-3">
            {[
              { icon: FileText, title: '1. Upload Resume', desc: 'Upload your PDF resume. AI extracts skills, projects, and experience instantly.' },
              { icon: Target, title: '2. Analyze & Practice', desc: 'Run skill gap analysis, mock interviews, and coding evaluations tailored to your target role.' },
              { icon: Map, title: '3. Follow Your Roadmap', desc: 'Get a personalized 30/60/90-day plan and track progress with analytics dashboards.' },
            ].map((step) => {
              const Icon = step.icon;
              return (
                <div key={step.title} className="text-center">
                  <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-400 to-brand-600 text-white shadow-lg shadow-brand-500/20">
                    <Icon className="h-6 w-6" />
                  </div>
                  <h3 className="font-display text-lg font-semibold text-ink-900 dark:text-white">{step.title}</h3>
                  <p className="mt-2 text-sm text-ink-500 dark:text-ink-400">{step.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-7xl px-4 py-20 lg:px-8">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-500 to-brand-700 p-10 text-center lg:p-16">
          <div className="absolute inset-0 bg-grid-dark opacity-20" />
          <div className="relative">
            <h2 className="font-display text-3xl font-bold text-white lg:text-4xl">
              Ready to ace your next interview?
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-brand-50">
              Join InterviewIQ AI today and get personalized AI-powered preparation for your dream company.
            </p>
            <Link
              to="/signup"
              className="mt-8 inline-flex items-center gap-2 rounded-xl bg-white px-6 py-3 text-base font-semibold text-brand-600 shadow-lg transition hover:bg-brand-50 active:scale-95"
            >
              Get Started Free <ArrowRight className="h-5 w-5" />
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-ink-200/60 dark:border-ink-800/60">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-4 py-8 sm:flex-row lg:px-8">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-brand-400 to-brand-600 text-white">
              <Brain className="h-4 w-4" />
            </div>
            <span className="font-display text-sm font-bold text-ink-900 dark:text-white">InterviewIQ AI</span>
          </div>
          <div className="flex items-center gap-6 text-sm text-ink-400">
            <span className="flex items-center gap-1.5"><Shield className="h-4 w-4" /> Secure</span>
            <span className="flex items-center gap-1.5"><Zap className="h-4 w-4" /> Fast</span>
            <span className="flex items-center gap-1.5"><Check className="h-4 w-4" /> Reliable</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
