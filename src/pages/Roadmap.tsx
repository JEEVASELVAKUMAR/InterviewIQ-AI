import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Map, Sparkles, Send, Loader2, CheckCircle, Circle,
  Calendar, Target, BookOpen, Code, Brain, ChevronDown, ChevronUp, RefreshCw, Lightbulb,
  ExternalLink,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { getRoadmap, saveRoadmap, updateRoadmap, getLatestResume, getInterviews, getCodingEvaluations, createNotification } from '../services/database';
import { generateRoadmap, refineRoadmap } from '../services/ai';
import { PageHeader, Card, LoadingSpinner, EmptyState, Badge } from '../components/ui';
import type { RoadmapPhase, RoadmapResource, Roadmap as RoadmapType, Resume, Interview, CodingEvaluation } from '../types';

const levels = ['Beginner', 'Intermediate', 'Advanced'];
const timeframes = [30, 60, 90];
const companies = ['Google', 'Amazon', 'Microsoft', 'Netflix', 'Meta', 'Apple', 'Adobe', 'Uber', 'Flipkart', 'Startup', 'TCS', 'Wipro', 'Hexaware', 'Capgemini', 'LTIMindtree'];
const roles = ['Software Engineer', 'Frontend Developer', 'Backend Developer', 'Full Stack Developer', 'AI Engineer', 'Data Scientist', 'DevOps Engineer', 'Java Developer', 'Python Developer'];

export default function Roadmap() {
  const { user } = useAuth();
  const [existingRoadmap, setExistingRoadmap] = useState<RoadmapType | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [refining, setRefining] = useState(false);

  // Form state
  const [targetCompany, setTargetCompany] = useState('');
  const [targetRole, setTargetRole] = useState('');
  const [currentLevel, setCurrentLevel] = useState('Beginner');
  const [hoursPerDay, setHoursPerDay] = useState(2);
  const [timeframe, setTimeframe] = useState(60);
  const [weakAreas, setWeakAreas] = useState('');

  // Roadmap phases
  const [phases, setPhases] = useState<RoadmapPhase[]>([]);
  const [expandedPhase, setExpandedPhase] = useState<number | null>(null);
  const [completedTasks, setCompletedTasks] = useState<Set<string>>(new Set());

  // Refinement chat
  const [refinementInput, setRefinementInput] = useState('');
  const [showRefine, setShowRefine] = useState(false);

  useEffect(() => {
    if (!user) return;
    getRoadmap(user.id)
      .then((r) => {
        setExistingRoadmap(r);
        if (r?.roadmap_json?.phases) {
          setPhases(r.roadmap_json.phases);
        } else if (r?.plan?.phases) {
          setPhases(r.plan.phases);
        }
      })
      .finally(() => setLoading(false));
  }, [user]);

  const handleGenerate = async () => {
    if (!targetCompany || !targetRole) {
      toast.error('Please select target company and role');
      return;
    }
    setGenerating(true);
    setPhases([]);
    try {
      // Gather context data
      const [resume, interviews, codingEvals] = await Promise.all([
        getLatestResume(user!.id).catch(() => null),
        getInterviews(user!.id).catch(() => [] as Interview[]),
        getCodingEvaluations(user!.id).catch(() => [] as CodingEvaluation[]),
      ]);

      const avgCoding = codingEvals.length > 0
        ? codingEvals.reduce((s, c) => s + (c.score ?? 0), 0) / codingEvals.length
        : undefined;

      const res = await generateRoadmap({
        resumeText: (resume as Resume | null)?.raw_text ?? undefined,
        interviewHistory: interviews.slice(0, 5),
        codingScore: avgCoding,
        targetCompany,
        targetRole,
        currentLevel,
        hoursPerDay,
        timeframe,
        weakAreas: weakAreas || undefined,
      });

      const newPhases = res.phases ?? [];
      setPhases(newPhases);

      const saved = await saveRoadmap(user!.id, {
        target_company: targetCompany,
        target_role: targetRole,
        input_json: {
          targetCompany, targetRole, currentLevel, hoursPerDay, timeframe, weakAreas,
        },
        roadmap_json: { phases: newPhases },
        plan: { phases: newPhases },
      });
      setExistingRoadmap(saved);

      await createNotification(user!.id, {
        title: 'Roadmap Generated',
        message: `${timeframe}-day roadmap for ${targetCompany} - ${targetRole} is ready!`,
        type: 'roadmap',
      });

      toast.success('Roadmap generated!');
    } catch (err: any) {
      toast.error('Generation failed: ' + err.message);
    } finally {
      setGenerating(false);
    }
  };

  const handleRefine = async () => {
    if (!refinementInput.trim() || !existingRoadmap) return;
    setRefining(true);
    try {
      const res = await refineRoadmap({
        currentRoadmap: { phases },
        refinementPrompt: refinementInput,
      });
      const newPhases = res.phases ?? phases;
      setPhases(newPhases);
      await updateRoadmap(existingRoadmap.id, {
        roadmap_json: { phases: newPhases },
        plan: { phases: newPhases },
      });
      setRefinementInput('');
      toast.success('Roadmap refined!');
    } catch (err: any) {
      toast.error('Refinement failed: ' + err.message);
    } finally {
      setRefining(false);
    }
  };

  const toggleTask = (phaseIdx: number, taskIdx: number) => {
    const key = `${phaseIdx}-${taskIdx}`;
    setCompletedTasks((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  if (loading) {
    return (
      <div>
        <PageHeader title="Personalized Roadmap" icon={<Map className="h-5 w-5" />} />
        <LoadingSpinner label="Loading..." />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Personalized Roadmap"
        subtitle="AI-generated, phased learning plan tailored to your resume, skills, and target role."
        icon={<Map className="h-5 w-5" />}
      />

      {/* Pre-generation form */}
      {phases.length === 0 && !generating && (
        <Card>
          <h3 className="mb-4 font-display text-base font-semibold text-ink-900 dark:text-white">Configure Your Roadmap</h3>
          <div className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label">Target Company</label>
                <select value={targetCompany} onChange={(e) => setTargetCompany(e.target.value)} className="input">
                  <option value="">Select a company</option>
                  {companies.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Target Role</label>
                <select value={targetRole} onChange={(e) => setTargetRole(e.target.value)} className="input">
                  <option value="">Select a role</option>
                  {roles.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className="label">Current Level</label>
              <div className="flex gap-2">
                {levels.map((l) => (
                  <button key={l} onClick={() => setCurrentLevel(l)}
                    className={`flex-1 rounded-xl border px-4 py-2.5 text-sm font-medium transition ${
                      currentLevel === l ? 'border-brand-500 bg-brand-500/10 text-brand-600 dark:text-brand-400' : 'border-ink-200 dark:border-ink-700 text-ink-600 dark:text-ink-300 hover:border-brand-400'
                    }`}>{l}</button>
                ))}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label">Available Hours / Day</label>
                <input type="number" min={1} max={12} value={hoursPerDay}
                  onChange={(e) => setHoursPerDay(parseInt(e.target.value) || 1)} className="input" />
              </div>
              <div>
                <label className="label">Timeframe (days)</label>
                <div className="flex gap-2">
                  {timeframes.map((t) => (
                    <button key={t} onClick={() => setTimeframe(t)}
                      className={`flex-1 rounded-xl border px-4 py-2.5 text-sm font-medium transition ${
                        timeframe === t ? 'border-brand-500 bg-brand-500/10 text-brand-600 dark:text-brand-400' : 'border-ink-200 dark:border-ink-700 text-ink-600 dark:text-ink-300 hover:border-brand-400'
                      }`}>{t} days</button>
                  ))}
                </div>
              </div>
            </div>

            <div>
              <label className="label">Known Weak Areas (optional)</label>
              <textarea value={weakAreas} onChange={(e) => setWeakAreas(e.target.value)}
                placeholder="e.g. System design, dynamic programming, SQL joins..."
                rows={2} className="input resize-none" />
            </div>

            <button onClick={handleGenerate} disabled={generating} className="btn-primary w-full py-3">
              <Sparkles className="h-4 w-4" /> Generate Roadmap
            </button>
          </div>
        </Card>
      )}

      {generating && <LoadingSpinner label="AI is crafting your personalized roadmap..." />}

      {/* Roadmap phases */}
      {phases.length > 0 && !generating && (
        <div className="space-y-4">
          {/* Refinement bar */}
          <Card className="flex items-center gap-3">
            <button onClick={() => setShowRefine(!showRefine)} className="btn-outline flex items-center gap-2">
              <RefreshCw className="h-4 w-4" /> Refine Roadmap
            </button>
            <div className="flex-1" />
            <Badge color="brand">{targetCompany || existingRoadmap?.target_company} · {targetRole || existingRoadmap?.target_role}</Badge>
            <Badge color="neutral">{timeframe} days</Badge>
          </Card>

          {/* Refinement chat */}
          <AnimatePresence>
            {showRefine && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                <Card>
                  <div className="mb-2 flex items-center gap-2">
                    <Lightbulb className="h-4 w-4 text-brand-500" />
                    <p className="text-sm font-medium text-ink-700 dark:text-ink-300">Ask AI to adjust your roadmap</p>
                  </div>
                  <div className="flex gap-2">
                    <input value={refinementInput} onChange={(e) => setRefinementInput(e.target.value)}
                      placeholder='e.g. "make week 3 lighter" or "add more DSA practice"'
                      className="input flex-1" onKeyDown={(e) => e.key === 'Enter' && handleRefine()} />
                    <button onClick={handleRefine} disabled={refining || !refinementInput.trim()} className="btn-primary">
                      {refining ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    </button>
                  </div>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Phase cards */}
          {phases.map((phase, idx) => {
            const isOpen = expandedPhase === idx;
            const tasks = phase.dailyTasks ?? [];
            const completedCount = tasks.filter((_, ti) => completedTasks.has(`${idx}-${ti}`)).length;
            const progress = tasks.length > 0 ? Math.round((completedCount / tasks.length) * 100) : 0;

            return (
              <Card key={idx}>
                <button onClick={() => setExpandedPhase(isOpen ? null : idx)}
                  className="flex w-full items-start justify-between gap-3 text-left">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-500 text-xs font-bold text-white">{idx + 1}</span>
                      <h3 className="font-display text-base font-semibold text-ink-900 dark:text-white">{phase.phaseTitle}</h3>
                    </div>
                    <p className="mt-1 ml-9 flex items-center gap-3 text-xs text-ink-400">
                      <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> {phase.durationDays} days</span>
                      {tasks.length > 0 && <span className="flex items-center gap-1"><CheckCircle className="h-3 w-3" /> {completedCount}/{tasks.length} tasks</span>}
                    </p>
                    {phase.reasoning && (
                      <p className="mt-2 ml-9 text-sm italic text-ink-500 dark:text-ink-400">"{phase.reasoning}"</p>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    {tasks.length > 0 && (
                      <div className="hidden sm:block">
                        <div className="h-1.5 w-24 overflow-hidden rounded-full bg-ink-100 dark:bg-ink-800">
                          <div className="h-full bg-brand-500 transition-all" style={{ width: `${progress}%` }} />
                        </div>
                      </div>
                    )}
                    {isOpen ? <ChevronUp className="h-5 w-5 text-ink-400" /> : <ChevronDown className="h-5 w-5 text-ink-400" />}
                  </div>
                </button>

                <AnimatePresence>
                  {isOpen && (
                    <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden">
                      <div className="mt-4 ml-9 space-y-4">
                        {/* Daily tasks */}
                        {tasks.length > 0 && (
                          <div>
                            <p className="mb-2 text-xs font-medium text-ink-500">Daily Tasks</p>
                            <div className="space-y-1.5">
                              {tasks.map((task, ti) => {
                                const done = completedTasks.has(`${idx}-${ti}`);
                                return (
                                  <button key={ti} onClick={() => toggleTask(idx, ti)}
                                    className="flex w-full items-start gap-2 text-left">
                                    {done ? <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-success-500" /> : <Circle className="mt-0.5 h-4 w-4 shrink-0 text-ink-300" />}
                                    <span className={`text-sm ${done ? 'text-ink-400 line-through' : 'text-ink-600 dark:text-ink-300'}`}>{task}</span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* Weekly goals */}
                        {phase.weeklyGoals?.length > 0 && (
                          <div>
                            <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-ink-500"><Target className="h-3.5 w-3.5" /> Weekly Goals</p>
                            <ul className="space-y-1">
                              {phase.weeklyGoals.map((g, gi) => (
                                <li key={gi} className="flex gap-2 text-sm text-ink-600 dark:text-ink-300"><span className="text-brand-500">•</span> {g}</li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {/* Mini projects */}
                        {phase.miniProjects?.length > 0 && (
                          <div>
                            <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-ink-500"><Code className="h-3.5 w-3.5" /> Mini Projects</p>
                            <ul className="space-y-1">
                              {phase.miniProjects.map((p, pi) => (
                                <li key={pi} className="flex gap-2 text-sm text-ink-600 dark:text-ink-300"><span className="text-brand-500">•</span> {p}</li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {/* Prerequisites + Difficulty */}
                        {(phase.prerequisites?.length > 0 || phase.difficulty) && (
                          <div className="flex flex-wrap gap-4">
                            {phase.difficulty && (
                              <div>
                                <p className="mb-1 text-xs font-medium text-ink-500">Difficulty</p>
                                <Badge color={phase.difficulty === 'Beginner' ? 'success' : phase.difficulty === 'Intermediate' ? 'warning' : 'danger'}>{phase.difficulty}</Badge>
                              </div>
                            )}
                            {phase.prerequisites?.length > 0 && (
                              <div>
                                <p className="mb-1 text-xs font-medium text-ink-500">Prerequisites</p>
                                <ul className="space-y-0.5">
                                  {phase.prerequisites.map((p, pi) => (
                                    <li key={pi} className="flex gap-2 text-sm text-ink-600 dark:text-ink-300"><span className="text-warning-500">•</span> {p}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Monthly goals */}
                        {phase.monthlyGoals?.length > 0 && (
                          <div>
                            <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-ink-500"><Target className="h-3.5 w-3.5" /> Monthly Goals</p>
                            <ul className="space-y-1">
                              {phase.monthlyGoals.map((g, gi) => (
                                <li key={gi} className="flex gap-2 text-sm text-ink-600 dark:text-ink-300"><span className="text-accent-500">•</span> {g}</li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {/* Milestones */}
                        {phase.milestones?.length > 0 && (
                          <div>
                            <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-ink-500"><CheckCircle className="h-3.5 w-3.5" /> Milestones</p>
                            <ul className="space-y-1">
                              {phase.milestones.map((m, mi) => (
                                <li key={mi} className="flex gap-2 text-sm text-ink-600 dark:text-ink-300"><span className="text-success-500">•</span> {m}</li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {/* Interview readiness goals */}
                        {phase.interviewReadinessGoals?.length > 0 && (
                          <div className="rounded-lg bg-brand-500/5 p-3">
                            <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-brand-500"><Brain className="h-3.5 w-3.5" /> Interview Readiness Goals</p>
                            <ul className="space-y-1">
                              {phase.interviewReadinessGoals.map((g, gi) => (
                                <li key={gi} className="flex gap-2 text-sm text-ink-600 dark:text-ink-300"><span className="text-brand-500">•</span> {g}</li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {/* Resources */}
                        {phase.resources?.length > 0 && (
                          <div>
                            <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-ink-500"><BookOpen className="h-3.5 w-3.5" /> Resources</p>
                            <div className="space-y-1.5">
                              {phase.resources.map((r, ri) => {
                                const res = typeof r === 'string' ? null : r as RoadmapResource;
                                if (res && res.url) {
                                  return (
                                    <a key={ri} href={res.url} target="_blank" rel="noopener noreferrer"
                                      className="flex items-center gap-2 rounded-lg border border-ink-200 dark:border-ink-700 p-2 text-sm text-brand-500 transition hover:bg-brand-500/5">
                                      <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                                      <span className="flex-1">{res.title}</span>
                                      {res.type && <Badge color="neutral">{res.type}</Badge>}
                                    </a>
                                  );
                                }
                                return (
                                  <li key={ri} className="flex gap-2 text-sm text-ink-600 dark:text-ink-300"><span className="text-brand-500">•</span> {typeof r === 'string' ? r : (r as RoadmapResource).title}</li>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* Checkpoint mock interview */}
                        {phase.checkpointMockInterview && (
                          <div className="flex items-center gap-2 rounded-lg bg-brand-500/10 p-2">
                            <Brain className="h-4 w-4 text-brand-500" />
                            <span className="text-xs font-medium text-brand-600 dark:text-brand-400">Checkpoint: Mock interview recommended at end of this phase</span>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
