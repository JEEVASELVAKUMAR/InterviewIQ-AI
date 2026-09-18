import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Target, Sparkles, TrendingUp, AlertTriangle, CheckCircle, Clock, BookOpen, History, ArrowRight, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { getLatestResume, getSkillGapReports, saveSkillGapReport, createNotification } from '../services/database';
import { analyzeSkillGap } from '../services/ai';
import { PageHeader, Card, LoadingSpinner, Badge, EmptyState } from '../components/ui';
import type { Resume, SkillGapResultV2, SkillGapReport } from '../types';

const companies = [
  'Google', 'Amazon', 'Microsoft', 'Meta', 'Apple', 'Netflix', 'Uber', 'Adobe',
  'Atlassian', 'Salesforce', 'Oracle', 'Infosys', 'TCS', 'Accenture',
  'Capgemini', 'Wipro', 'Cognizant', 'Zoho', 'Freshworks', 'Startup',
];
const roles = [
  'Software Engineer', 'Frontend Developer', 'Backend Developer', 'Full Stack Developer',
  'AI Engineer', 'Data Scientist', 'DevOps Engineer', 'Java Developer', 'Python Developer',
  'System Design Engineer',
];

export default function SkillGap() {
  const { user } = useAuth();
  const [resume, setResume] = useState<Resume | null>(null);
  const [company, setCompany] = useState('');
  const [customCompany, setCustomCompany] = useState('');
  const [role, setRole] = useState('');
  const [customRole, setCustomRole] = useState('');
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<SkillGapResultV2 | null>(null);
  const [reports, setReports] = useState<SkillGapReport[]>([]);
  const [tab, setTab] = useState<'analyze' | 'history'>('analyze');
  const [selectedReport, setSelectedReport] = useState<SkillGapReport | null>(null);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      getLatestResume(user.id),
      getSkillGapReports(user.id),
    ]).then(([r, reps]) => {
      setResume(r);
      setReports(reps);
    }).finally(() => setLoading(false));
  }, [user]);

  const finalCompany = company === 'Other' ? customCompany : company;
  const finalRole = role === 'Other' ? customRole : role;

  const handleAnalyze = async () => {
    if (!resume?.raw_text) {
      toast.error('Please upload your resume first');
      return;
    }
    if (!finalCompany || !finalRole) {
      toast.error('Select or enter a company and role');
      return;
    }
    setAnalyzing(true);
    setResult(null);
    try {
      const res = await analyzeSkillGap({
        resumeText: resume.raw_text,
        resumeSkills: resume.skills ?? [],
        dreamCompany: finalCompany,
        role: finalRole,
      });
      setResult(res);

      const saved = await saveSkillGapReport(user!.id, {
        resume_id: resume.id,
        company: finalCompany,
        role: finalRole,
        result_json: res,
      });
      if (saved) {
        setReports((prev) => [saved, ...prev]);
      }

      await createNotification(user!.id, {
        title: 'Skill Gap Analysis Complete',
        message: `Analysis for ${finalCompany} - ${finalRole} is ready.`,
        type: 'skill_gap',
      });

      toast.success('Skill gap analysis complete!');
    } catch (err: any) {
      toast.error('Analysis failed: ' + err.message);
    } finally {
      setAnalyzing(false);
    }
  };

  if (loading) {
    return (
      <div>
        <PageHeader title="Skill Gap Analysis" icon={<Target className="h-5 w-5" />} />
        <LoadingSpinner label="Loading..." />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Skill Gap Analysis"
        subtitle="Compare your skills against your dream company's specific requirements."
        icon={<Target className="h-5 w-5" />}
      />

      {/* Tabs */}
      <div className="mb-6 flex gap-2">
        <button
          onClick={() => setTab('analyze')}
          className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
            tab === 'analyze'
              ? 'bg-brand-500 text-white'
              : 'bg-ink-100 dark:bg-ink-800 text-ink-500 hover:bg-ink-200 dark:hover:bg-ink-700'
          }`}
        >
          <Target className="mr-1.5 inline h-4 w-4" /> Analyze
        </button>
        <button
          onClick={() => setTab('history')}
          className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
            tab === 'history'
              ? 'bg-brand-500 text-white'
              : 'bg-ink-100 dark:bg-ink-800 text-ink-500 hover:bg-ink-200 dark:hover:bg-ink-700'
          }`}
        >
          <History className="mr-1.5 inline h-4 w-4" /> History ({reports.length})
        </button>
      </div>

      <AnimatePresence mode="wait">
        {tab === 'analyze' && (
          <motion.div key="analyze" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {!resume ? (
              <EmptyState
                icon={<AlertTriangle className="h-7 w-7" />}
                title="No resume found"
                description="Upload your resume first so we can analyze your skills against the job requirements."
                action={<a href="/resume" className="btn-primary">Upload Resume <ArrowRight className="h-4 w-4" /></a>}
              />
            ) : (
              <>
                <Card className="mb-6">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="label">Company</label>
                      <select value={company} onChange={(e) => setCompany(e.target.value)} className="input">
                        <option value="">Select a company</option>
                        {companies.map((c) => <option key={c} value={c}>{c}</option>)}
                        <option value="Other">Other (enter manually)</option>
                      </select>
                      {company === 'Other' && (
                        <input
                          type="text"
                          value={customCompany}
                          onChange={(e) => setCustomCompany(e.target.value)}
                          placeholder="Enter company name"
                          className="input mt-2"
                        />
                      )}
                    </div>
                    <div>
                      <label className="label">Target Role</label>
                      <select value={role} onChange={(e) => setRole(e.target.value)} className="input">
                        <option value="">Select a role</option>
                        {roles.map((r) => <option key={r} value={r}>{r}</option>)}
                        <option value="Other">Other (enter manually)</option>
                      </select>
                      {role === 'Other' && (
                        <input
                          type="text"
                          value={customRole}
                          onChange={(e) => setCustomRole(e.target.value)}
                          placeholder="Enter role name"
                          className="input mt-2"
                        />
                      )}
                    </div>
                  </div>
                  <button onClick={handleAnalyze} disabled={analyzing} className="btn-primary mt-4 w-full sm:w-auto">
                    {analyzing ? (
                      <><Sparkles className="h-4 w-4 animate-pulse" /> Analyzing...</>
                    ) : (
                      <><Sparkles className="h-4 w-4" /> Analyze Skill Gap</>
                    )}
                  </button>
                </Card>

                {analyzing && <LoadingSpinner label="AI is evaluating your resume against job requirements..." />}

                {result && (
                  <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
                    {/* Verdict Summary */}
                    <Card className="border-l-4 border-brand-500">
                      <div className="flex items-start gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-500/10 text-brand-500">
                          <Target className="h-5 w-5" />
                        </div>
                        <div>
                          <h3 className="font-display text-base font-semibold text-ink-900 dark:text-white">
                            Verdict — {result.company} · {result.role}
                          </h3>
                          <p className="mt-1 text-sm text-ink-600 dark:text-ink-300">{result.verdictSummary}</p>
                        </div>
                      </div>
                    </Card>

                    {/* Required vs Matched vs Missing */}
                    <div className="grid gap-4 md:grid-cols-3">
                      <Card>
                        <div className="mb-3 flex items-center gap-2">
                          <CheckCircle className="h-5 w-5 text-success-500" />
                          <h3 className="font-display text-sm font-semibold text-ink-900 dark:text-white">Matched Skills</h3>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {result.matchedSkills.length > 0 ? (
                            result.matchedSkills.map((s) => <Badge key={s} color="success">{s}</Badge>)
                          ) : (
                            <p className="text-sm text-ink-400">No matches found</p>
                          )}
                        </div>
                      </Card>
                      <Card>
                        <div className="mb-3 flex items-center gap-2">
                          <AlertTriangle className="h-5 w-5 text-danger-500" />
                          <h3 className="font-display text-sm font-semibold text-ink-900 dark:text-white">Missing Skills</h3>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {result.missingSkills.length > 0 ? (
                            result.missingSkills.map((s) => <Badge key={s} color="danger">{s}</Badge>)
                          ) : (
                            <p className="text-sm text-success-500">You're fully covered!</p>
                          )}
                        </div>
                      </Card>
                      <Card>
                        <div className="mb-3 flex items-center gap-2">
                          <TrendingUp className="h-5 w-5 text-brand-500" />
                          <h3 className="font-display text-sm font-semibold text-ink-900 dark:text-white">Required Skills</h3>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {result.requiredSkills.map((s) => <Badge key={s} color="brand">{s}</Badge>)}
                        </div>
                      </Card>
                    </div>

                    {/* Priority order */}
                    {result.priorityOrder.length > 0 && (
                      <Card>
                        <h3 className="mb-3 font-display text-sm font-semibold text-ink-900 dark:text-white">Learning Priority Order</h3>
                        <div className="flex flex-wrap items-center gap-2">
                          {result.priorityOrder.map((s, i) => (
                            <div key={s} className="flex items-center gap-2">
                              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-500 text-xs font-bold text-white">{i + 1}</span>
                              <span className="text-sm text-ink-600 dark:text-ink-300">{s}</span>
                              {i < result.priorityOrder.length - 1 && <ArrowRight className="h-3 w-3 text-ink-300" />}
                            </div>
                          ))}
                        </div>
                      </Card>
                    )}

                    {/* Fundamentals first */}
                    {result.fundamentalsFirst && result.fundamentalsFirst.length > 0 && (
                      <Card className="border-l-4 border-accent-500">
                        <div className="mb-3 flex items-center gap-2">
                          <BookOpen className="h-5 w-5 text-accent-500" />
                          <h3 className="font-display text-sm font-semibold text-ink-900 dark:text-white">Fundamentals to Learn First</h3>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {result.fundamentalsFirst.map((s) => (
                            <Badge key={s} color="neutral">{s}</Badge>
                          ))}
                        </div>
                        <p className="mt-2 text-xs text-ink-400">Start here before tackling the advanced missing skills above.</p>
                      </Card>
                    )}

                    {/* Estimated learning time */}
                    {Object.keys(result.estimatedLearningTime ?? {}).length > 0 && (
                      <Card>
                        <h3 className="mb-3 font-display text-sm font-semibold text-ink-900 dark:text-white">Estimated Learning Time</h3>
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                          {Object.entries(result.estimatedLearningTime).map(([skill, time]) => (
                            <div key={skill} className="rounded-xl bg-ink-50 dark:bg-ink-900/50 p-3">
                              <p className="text-xs font-medium text-ink-900 dark:text-white">{skill}</p>
                              <p className="mt-0.5 flex items-center gap-1 text-xs text-ink-500">
                                <Clock className="h-3 w-3" /> {time}
                              </p>
                            </div>
                          ))}
                        </div>
                      </Card>
                    )}

                    {/* Resources */}
                    {result.resources.length > 0 && (
                      <Card>
                        <div className="mb-4 flex items-center gap-2">
                          <BookOpen className="h-5 w-5 text-brand-500" />
                          <h3 className="font-display text-sm font-semibold text-ink-900 dark:text-white">Learning Resources</h3>
                        </div>
                        <div className="space-y-3">
                          {result.resources.map((r, i) => (
                            <div key={i} className="rounded-xl border border-ink-200 dark:border-ink-700 p-4">
                              <div className="flex items-start justify-between gap-3">
                                <p className="font-medium text-ink-900 dark:text-white">{r.skill}</p>
                                <Badge color="neutral">{r.difficulty}</Badge>
                              </div>
                              {r.courses.length > 0 && (
                                <div className="mt-2">
                                  <p className="text-xs font-medium text-ink-500">Courses:</p>
                                  <ul className="mt-1 space-y-0.5 text-sm text-ink-600 dark:text-ink-300">
                                    {r.courses.map((c, j) => <li key={j} className="flex gap-1.5"><span className="text-brand-500">•</span> {c}</li>)}
                                  </ul>
                                </div>
                              )}
                              {r.projects.length > 0 && (
                                <div className="mt-2">
                                  <p className="text-xs font-medium text-ink-500">Projects:</p>
                                  <ul className="mt-1 space-y-0.5 text-sm text-ink-600 dark:text-ink-300">
                                    {r.projects.map((p, j) => <li key={j} className="flex gap-1.5"><span className="text-brand-500">•</span> {p}</li>)}
                                  </ul>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </Card>
                    )}
                  </motion.div>
                )}
              </>
            )}
          </motion.div>
        )}

        {tab === 'history' && (
          <motion.div key="history" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {reports.length === 0 ? (
              <EmptyState
                icon={<History className="h-7 w-7" />}
                title="No reports yet"
                description="Run a skill gap analysis to see your history here."
              />
            ) : (
              <div className="space-y-3">
                {reports.map((r) => (
                  <Card key={r.id} className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-ink-900 dark:text-white">{r.company} · {r.role}</p>
                      <p className="text-xs text-ink-400">{new Date(r.created_at).toLocaleString()}</p>
                    </div>
                    <button
                      onClick={() => { setSelectedReport(r); setResult(r.result_json); setTab('analyze'); }}
                      className="btn-outline"
                    >
                      View <ArrowRight className="h-4 w-4" />
                    </button>
                  </Card>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
