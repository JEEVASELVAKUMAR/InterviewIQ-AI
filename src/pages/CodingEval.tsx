import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Editor, { OnMount } from '@monaco-editor/react';
import {
  Code2, Sparkles, Play, RotateCcw, CheckCircle, AlertTriangle,
  Lightbulb, Clock, ChevronRight, Bug, Gauge, FileCode, Send,
  Maximize2, Minimize2, Pause, Shuffle, Plus, X, MessageSquare,
  Loader2, Zap, Brain, TrendingUp,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { getCodingProblems, saveCodingEvaluation, createNotification } from '../services/database';
import { evaluateCoding, getCodingHint } from '../services/ai';
import { PageHeader, Card, Badge, LoadingSpinner } from '../components/ui';
import type { CodingProblem, CodingEvalResultV2 } from '../types';

const languages = [
  { id: 'java', label: 'Java', placeholder: 'public class Solution {\n    public static void main(String[] args) {\n        \n    }\n}' },
  { id: 'python', label: 'Python', placeholder: 'def solution():\n    pass' },
  { id: 'cpp', label: 'C++', placeholder: '#include <iostream>\nusing namespace std;\n\nint main() {\n    \n}' },
  { id: 'javascript', label: 'JavaScript', placeholder: 'function solution() {\n    \n}' },
  { id: 'c', label: 'C', placeholder: '#include <stdio.h>\n\nint main() {\n    \n}' },
  { id: 'typescript', label: 'TypeScript', placeholder: 'function solution(): void {\n    \n}' },
  { id: 'go', label: 'Go', placeholder: 'package main\n\nfunc main() {\n    \n}' },
  { id: 'csharp', label: 'C#', placeholder: 'using System;\n\nclass Program {\n    static void Main() {\n        \n    }\n}' },
  { id: 'rust', label: 'Rust', placeholder: 'fn main() {\n    \n}' },
  { id: 'sql', label: 'SQL', placeholder: 'SELECT * FROM table_name\nWHERE condition;' },
];

const monacoLangMap: Record<string, string> = {
  java: 'java', python: 'python', cpp: 'cpp', javascript: 'javascript',
  c: 'c', typescript: 'typescript', go: 'go', csharp: 'csharp', rust: 'rust', sql: 'sql',
};

const difficulties = ['Easy', 'Medium', 'Hard'];

const HINT_LEVELS = [
  { level: 1, label: 'Hint 1: Gentle nudge', icon: Lightbulb },
  { level: 2, label: 'Hint 2: More specific', icon: Lightbulb },
  { level: 3, label: 'Algorithm direction', icon: Brain },
  { level: 4, label: 'Optimization suggestions', icon: Zap },
  { level: 5, label: 'Edge cases', icon: AlertTriangle },
  { level: 6, label: 'Complexity analysis', icon: Gauge },
  { level: 7, label: 'Full solution (on request)', icon: Code2 },
];

export default function CodingEval() {
  const { user } = useAuth();
  const [problems, setProblems] = useState<CodingProblem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProblem, setSelectedProblem] = useState<CodingProblem | null>(null);
  const [language, setLanguage] = useState('python');
  const [code, setCode] = useState('');
  const [evaluating, setEvaluating] = useState<'run' | 'submit' | null>(null);
  const [result, setResult] = useState<CodingEvalResultV2 | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [themeState, setThemeState] = useState<'light' | 'dark'>(
    typeof document !== 'undefined' && document.documentElement.classList.contains('dark') ? 'dark' : 'light'
  );

  // Timer
  const [blockDuration, setBlockDuration] = useState(45);
  const [timeLeft, setTimeLeft] = useState(0);
  const [timerActive, setTimerActive] = useState(false);
  const [timerPaused, setTimerPaused] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Random mode
  const [randomMode, setRandomMode] = useState(false);
  const [filterDifficulty, setFilterDifficulty] = useState('');
  const [filterTopic, setFilterTopic] = useState('');
  const [filterLanguage, setFilterLanguage] = useState('');

  // Custom test cases
  const [customTests, setCustomTests] = useState<{ id: number; input: string; expected: string }[]>([]);
  const [newTestInput, setNewTestInput] = useState('');
  const [newTestExpected, setNewTestExpected] = useState('');

  // AI Assistant
  const [aiOpen, setAiOpen] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiHint, setAiHint] = useState<string | null>(null);
  const [aiHintLevel, setAiHintLevel] = useState(1);

  const editorRef = useRef<any>(null);

  useEffect(() => {
    getCodingProblems()
      .then((p) => {
        setProblems(p);
        if (p.length > 0) setSelectedProblem(p[0]);
      })
      .catch(() => toast.error('Failed to load problems'))
      .finally(() => setLoading(false));
  }, []);

  // Timer logic
  useEffect(() => {
    if (!timerActive || timerPaused) return;
    timerRef.current = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          clearInterval(timerRef.current!);
          setTimerActive(false);
          toast.error('Time block ended!');
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [timerActive, timerPaused]);

  // Theme observer
  useEffect(() => {
    const observer = new MutationObserver(() => {
      setThemeState(document.documentElement.classList.contains('dark') ? 'dark' : 'light');
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  };

  const lang = languages.find((l) => l.id === language)!;

  const handleEditorMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    // Fix: ensure Monaco's own scroll handler isn't blocked by outer containers.
    // We let Monaco manage its own scrolling and prevent wheel events from
    // bubbling to parent scroll containers.
    editor.onDidContentSizeChange(() => {
      const layout = editor.getLayoutInfo();
      if (layout.height < editor.getContentHeight()) {
        editor.layout({ width: layout.width, height: editor.getContentHeight() });
      }
    });
  };

  const handleEvaluate = async (mode: 'run' | 'submit') => {
    if (!code.trim()) {
      toast.error('Please write some code first');
      return;
    }
    if (!selectedProblem) return;
    setEvaluating(mode);
    setResult(null);
    try {
      const officialTests = [
        ...(selectedProblem.visible_test_cases ?? []).map((tc: any) => ({ ...tc, hidden: false })),
        ...(selectedProblem.hidden_test_cases ?? []).map((tc: any) => ({ ...tc, hidden: true })),
      ];
      const customTestObjs = customTests.map((t) => ({ id: t.id, input: t.input, expected: t.expected, hidden: false, custom: true }));
      const allTestCases = [...officialTests, ...customTestObjs];
      const res = await evaluateCoding({
        language,
        problem: selectedProblem.statement,
        code,
        testCases: allTestCases,
        mode,
      });
      setResult(res);
      if (mode === 'submit' && user) {
        await saveCodingEvaluation(user.id, {
          language,
          problem: selectedProblem.title,
          code,
          evaluation: res,
          score: res.finalScore,
        });
        await createNotification(user.id, {
          title: 'Coding Evaluation Complete',
          message: `${selectedProblem.title} — Score: ${res.finalScore}/100`,
          type: 'coding',
          link_path: '/coding',
        });
        toast.success('Submission saved!');
      } else if (mode === 'run') {
        toast.success('Run complete — check sample test results');
      }
    } catch (err: any) {
      toast.error('Evaluation failed: ' + err.message);
    } finally {
      setEvaluating(null);
    }
  };

  // Timer controls
  const startTimer = () => {
    setTimeLeft(blockDuration * 60);
    setTimerActive(true);
    setTimerPaused(false);
  };
  const pauseTimer = () => setTimerPaused(!timerPaused);
  const restartTimer = () => {
    setTimeLeft(blockDuration * 60);
    setTimerPaused(false);
    setTimerActive(true);
  };
  const resetTimer = () => {
    setTimerActive(false);
    setTimerPaused(false);
    setTimeLeft(0);
  };
  const resetEnvironment = () => {
    resetTimer();
    setCode(lang.placeholder);
    setResult(null);
    setCustomTests([]);
  };

  const getRandomProblem = () => {
    let filtered = problems;
    if (filterDifficulty) filtered = filtered.filter((p) => p.difficulty === filterDifficulty);
    if (filterTopic) filtered = filtered.filter((p) => p.topic_tags?.some((t: string) => t.toLowerCase().includes(filterTopic.toLowerCase())));
    if (filtered.length === 0) {
      toast.error('No problems match your filters');
      return;
    }
    const random = filtered[Math.floor(Math.random() * filtered.length)];
    setSelectedProblem(random);
    setCode('');
    setResult(null);
    toast.success(`Random problem: ${random.title}`);
  };

  const addCustomTest = () => {
    if (!newTestInput || !newTestExpected) {
      toast.error('Fill in both input and expected output');
      return;
    }
    setCustomTests([...customTests, { id: Date.now(), input: newTestInput, expected: newTestExpected }]);
    setNewTestInput('');
    setNewTestExpected('');
  };

  const removeCustomTest = (id: number) => {
    setCustomTests(customTests.filter((t) => t.id !== id));
  };

  const requestHint = async (level: number) => {
    if (!selectedProblem) return;
    setAiLoading(true);
    setAiHintLevel(level);
    setAiHint(null);
    try {
      const res = await getCodingHint({
        problem: selectedProblem.statement,
        code: code || undefined,
        language,
        hintLevel: level,
      });
      setAiHint(res.hint ?? 'No hint available.');
    } catch (err: any) {
      toast.error('Hint request failed: ' + err.message);
    } finally {
      setAiLoading(false);
    }
  };

  const allPassed = result?.testCaseResults?.length > 0 && result.testCaseResults.every((tc: any) => tc.passed);

  if (loading) {
    return (
      <div>
        <PageHeader title="Coding Evaluation" icon={<Code2 className="h-5 w-5" />} />
        <LoadingSpinner label="Loading problem bank..." />
      </div>
    );
  }

  const editorContent = (
    <div className={fullscreen ? 'flex h-full flex-col' : ''}>
      {/* Problem selector + filters */}
      <Card className={fullscreen ? 'mb-2' : 'mb-4'}>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setRandomMode(!randomMode)}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                randomMode ? 'bg-brand-500 text-white' : 'bg-ink-100 dark:bg-ink-800 text-ink-600 dark:text-ink-300'
              }`}
            >
              <Shuffle className="h-4 w-4" /> Random
            </button>
          </div>

          {randomMode ? (
            <div className="flex flex-1 flex-wrap items-center gap-2">
              <select value={filterDifficulty} onChange={(e) => setFilterDifficulty(e.target.value)} className="input !w-auto !py-1.5 text-xs">
                <option value="">Any difficulty</option>
                {difficulties.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
              <input value={filterTopic} onChange={(e) => setFilterTopic(e.target.value)} placeholder="Topic filter" className="input !w-auto !py-1.5 text-xs" />
              <button onClick={getRandomProblem} className="btn-primary !py-1.5 text-xs">
                <Shuffle className="h-3.5 w-3.5" /> Get Random
              </button>
            </div>
          ) : (
            <select
              value={selectedProblem?.id ?? ''}
              onChange={(e) => {
                const p = problems.find((x) => x.id === e.target.value);
                setSelectedProblem(p ?? null);
                setCode('');
                setResult(null);
              }}
              className="input flex-1"
            >
              {problems.map((p) => (
                <option key={p.id} value={p.id}>{p.title} ({p.difficulty})</option>
              ))}
            </select>
          )}

          <button onClick={() => setFullscreen(!fullscreen)} className="btn-ghost !p-2" title="Toggle fullscreen">
            {fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
        </div>
      </Card>

      {selectedProblem && (
        <div className={`grid gap-4 ${fullscreen ? 'flex-1 lg:grid-cols-2' : 'lg:grid-cols-2'}`}>
          {/* Problem description */}
          <Card className={fullscreen ? 'overflow-y-auto' : ''}>
            <div className="mb-2 flex items-center gap-2">
              <h3 className="font-display text-base font-semibold text-ink-900 dark:text-white">{selectedProblem.title}</h3>
              <Badge color={selectedProblem.difficulty === 'Easy' ? 'success' : selectedProblem.difficulty === 'Medium' ? 'warning' : 'danger'}>
                {selectedProblem.difficulty}
              </Badge>
            </div>
            <p className="text-sm text-ink-600 dark:text-ink-300">{selectedProblem.statement}</p>
            {selectedProblem.constraints && (
              <div className="mt-3">
                <p className="text-xs font-medium text-ink-500">Constraints:</p>
                <pre className="mt-1 whitespace-pre-wrap text-xs text-ink-600 dark:text-ink-300">{selectedProblem.constraints}</pre>
              </div>
            )}
            {selectedProblem.examples?.length > 0 && (
              <div className="mt-3 space-y-2">
                <p className="text-xs font-medium text-ink-500">Examples:</p>
                {selectedProblem.examples.map((ex: any, i) => (
                  <div key={i} className="rounded-lg bg-ink-50 dark:bg-ink-900/50 p-2">
                    <p className="font-mono text-xs text-ink-600 dark:text-ink-300">Input: {ex.input}</p>
                    <p className="font-mono text-xs text-ink-600 dark:text-ink-300">Output: {ex.output}</p>
                    {ex.explanation && <p className="mt-1 text-xs text-ink-400">{ex.explanation}</p>}
                  </div>
                ))}
              </div>
            )}
            {selectedProblem.topic_tags?.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {selectedProblem.topic_tags.map((t) => <Badge key={t} color="neutral">{t}</Badge>)}
              </div>
            )}

            {/* Custom test cases */}
            <div className="mt-4 border-t border-ink-100 dark:border-ink-800 pt-3">
              <p className="mb-2 text-xs font-medium text-ink-500">Custom Test Cases</p>
              {customTests.length > 0 && (
                <div className="mb-2 space-y-1">
                  {customTests.map((t) => (
                    <div key={t.id} className="flex items-center gap-2 rounded-lg bg-ink-50 dark:bg-ink-900/50 p-2 text-xs">
                      <span className="flex-1 font-mono text-ink-600 dark:text-ink-300">in: {t.input} → out: {t.expected}</span>
                      <button onClick={() => removeCustomTest(t.id)} className="text-danger-500"><X className="h-3 w-3" /></button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <input value={newTestInput} onChange={(e) => setNewTestInput(e.target.value)} placeholder="Input" className="input !py-1.5 text-xs flex-1" />
                <input value={newTestExpected} onChange={(e) => setNewTestExpected(e.target.value)} placeholder="Expected" className="input !py-1.5 text-xs flex-1" />
                <button onClick={addCustomTest} className="btn-outline !py-1.5 text-xs"><Plus className="h-3 w-3" /> Add</button>
              </div>
            </div>
          </Card>

          {/* Code editor + controls */}
          <div className="space-y-3">
            <Card className={fullscreen ? 'flex flex-1 flex-col' : ''}>
              <div className="mb-3 flex items-center justify-between">
                <label className="label !mb-0">Your Code</label>
                <div className="flex flex-wrap gap-1">
                  {languages.map((l) => (
                    <button key={l.id} onClick={() => { setLanguage(l.id); setCode(l.placeholder); }}
                      className={`rounded-lg px-2 py-1 text-xs font-medium transition ${
                        language === l.id ? 'bg-brand-500 text-white' : 'bg-ink-100 dark:bg-ink-800 text-ink-500 hover:bg-ink-200 dark:hover:bg-ink-700'
                      }`}>{l.label}</button>
                  ))}
                </div>
              </div>
              <div className="overflow-hidden rounded-xl border border-ink-200 dark:border-ink-700" style={{ height: fullscreen ? '100%' : '380px' }}>
                <Editor
                  height={fullscreen ? '100%' : '380px'}
                  language={monacoLangMap[language] ?? 'plaintext'}
                  value={code || lang.placeholder}
                  theme={themeState === 'dark' ? 'vs-dark' : 'light'}
                  onChange={(val) => setCode(val ?? '')}
                  onMount={handleEditorMount}
                  options={{
                    minimap: { enabled: false },
                    fontSize: 13,
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                    lineNumbers: 'on',
                    scrollBeyondLastLine: false,
                    tabSize: 4,
                    automaticLayout: true,
                    padding: { top: 12, bottom: 12 },
                    scrollbar: {
                      alwaysConsumeMouseWheel: false,
                      vertical: 'auto',
                      horizontal: 'auto',
                    },
                  }}
                />
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button onClick={() => handleEvaluate('run')} disabled={!!evaluating} className="btn-outline flex-1">
                  {evaluating === 'run' ? <><Sparkles className="h-4 w-4 animate-pulse" /> Running...</> : <><Play className="h-4 w-4" /> Run</>}
                </button>
                <button onClick={() => handleEvaluate('submit')} disabled={!!evaluating} className="btn-primary flex-1">
                  {evaluating === 'submit' ? <><Sparkles className="h-4 w-4 animate-pulse" /> Submitting...</> : <><Send className="h-4 w-4" /> Submit</>}
                </button>
                <button onClick={() => { setCode(lang.placeholder); setResult(null); }} className="btn-outline" title="Reset code to starter template">
                  <RotateCcw className="h-4 w-4" /> Reset Code
                </button>
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* Timer + AI Assistant bar */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <Card className="flex items-center gap-3 !py-2">
          <Clock className="h-4 w-4 text-brand-500" />
          <span className="text-sm font-medium text-ink-700 dark:text-ink-300">Timer:</span>
          <select value={blockDuration} onChange={(e) => setBlockDuration(parseInt(e.target.value))} className="input !w-auto !py-1 text-xs" disabled={timerActive}>
            <option value={30}>30 min</option>
            <option value={45}>45 min</option>
            <option value={60}>60 min</option>
            <option value={90}>90 min</option>
          </select>
          {!timerActive ? (
            <button onClick={startTimer} className="btn-outline !py-1.5 text-xs">Start</button>
          ) : (
            <>
              <Badge color={timeLeft < 300 ? 'danger' : 'brand'}>{formatTime(timeLeft)}</Badge>
              <button onClick={pauseTimer} className="btn-outline !py-1.5 text-xs">
                {timerPaused ? <><Play className="h-3 w-3" /> Resume</> : <><Pause className="h-3 w-3" /> Pause</>}
              </button>
              <button onClick={restartTimer} className="btn-outline !py-1.5 text-xs" title="Restart timer to configured duration">
                <RotateCcw className="h-3 w-3" /> Restart
              </button>
            </>
          )}
          <button onClick={resetTimer} className="btn-outline !py-1.5 text-xs" title="Stop and clear timer">
            <X className="h-3 w-3" /> Reset
          </button>
          <button onClick={resetEnvironment} className="btn-outline !py-1.5 text-xs" title="Reset timer AND code">
            Reset All
          </button>
        </Card>

        <button onClick={() => setAiOpen(!aiOpen)} className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium transition ${aiOpen ? 'bg-brand-500 text-white' : 'bg-brand-500/10 text-brand-600 dark:text-brand-400'}`}>
          <MessageSquare className="h-4 w-4" /> AI Assistant
        </button>
      </div>

      {/* Results */}
      <div className="mt-4">
        {evaluating ? (
          <Card><LoadingSpinner label={evaluating === 'run' ? 'Running sample test cases...' : 'AI is judging all test cases and analyzing your code...'} /></Card>
        ) : result ? (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
            {/* Success screen */}
            {allPassed && evaluating === null && (
              <Card className="flex flex-col items-center text-center">
                <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-success-500/10 text-success-500">
                  <CheckCircle className="h-8 w-8" />
                </div>
                <h3 className="font-display text-xl font-bold text-success-600 dark:text-success-400">Congratulations! All test cases passed.</h3>
                <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <div className="rounded-xl bg-ink-50 dark:bg-ink-900/50 p-3 text-center">
                    <p className="font-display text-2xl font-bold text-brand-500">{result.finalScore}</p>
                    <p className="text-xs text-ink-400">Final Score</p>
                  </div>
                  <div className="rounded-xl bg-ink-50 dark:bg-ink-900/50 p-3 text-center">
                    <p className="font-display text-2xl font-bold text-success-500">{Math.round((result.testCaseResults.filter((tc: any) => tc.passed).length / result.testCaseResults.length) * 100)}%</p>
                    <p className="text-xs text-ink-400">Acceptance</p>
                  </div>
                  <div className="rounded-xl bg-ink-50 dark:bg-ink-900/50 p-3 text-center">
                    <p className="font-mono text-sm font-bold text-ink-900 dark:text-white">{result.timeComplexity}</p>
                    <p className="text-xs text-ink-400">Time</p>
                  </div>
                  <div className="rounded-xl bg-ink-50 dark:bg-ink-900/50 p-3 text-center">
                    <p className="font-mono text-sm font-bold text-ink-900 dark:text-white">{result.spaceComplexity}</p>
                    <p className="text-xs text-ink-400">Space</p>
                  </div>
                </div>
                {result.suggestedImprovements?.length > 0 && (
                  <div className="mt-4 text-left">
                    <p className="mb-1 flex items-center gap-1.5 text-xs font-medium text-brand-500"><TrendingUp className="h-3.5 w-3.5" /> Optimization Suggestions</p>
                    <ul className="space-y-1">
                      {result.suggestedImprovements.map((imp, i) => <li key={i} className="text-sm text-ink-600 dark:text-ink-300">• {imp}</li>)}
                    </ul>
                  </div>
                )}
              </Card>
            )}

            {/* Test case results */}
            {result.testCaseResults?.length > 0 && (
              <Card>
                <h3 className="mb-3 font-display text-sm font-semibold text-ink-900 dark:text-white">Test Case Results</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-ink-200 dark:border-ink-700">
                        <th className="py-2 text-left text-xs text-ink-400">#</th>
                        <th className="py-2 text-center text-xs text-ink-400">Status</th>
                        <th className="py-2 text-left text-xs text-ink-400">Expected</th>
                        <th className="py-2 text-left text-xs text-ink-400">Actual</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.testCaseResults.map((tc: any) => (
                        <tr key={tc.id} className="border-b border-ink-100 dark:border-ink-800">
                          <td className="py-2 text-ink-500">{tc.id}</td>
                          <td className="py-2 text-center">
                            {tc.passed ? <CheckCircle className="mx-auto h-4 w-4 text-success-500" /> : <AlertTriangle className="mx-auto h-4 w-4 text-danger-500" />}
                          </td>
                          <td className="py-2 font-mono text-xs text-ink-600 dark:text-ink-300">{tc.expected}</td>
                          <td className={`py-2 font-mono text-xs ${tc.passed ? 'text-success-500' : 'text-danger-500'}`}>{tc.actual}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}

            {/* Complexity + quality */}
            <Card>
              <h3 className="mb-3 font-display text-sm font-semibold text-ink-900 dark:text-white">Complexity Analysis</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-ink-50 dark:bg-ink-900/50 p-3">
                  <p className="text-xs text-ink-400">Time Complexity</p>
                  <p className="mt-0.5 font-mono text-sm font-medium text-ink-900 dark:text-white">{result.timeComplexity}</p>
                </div>
                <div className="rounded-xl bg-ink-50 dark:bg-ink-900/50 p-3">
                  <p className="text-xs text-ink-400">Space Complexity</p>
                  <p className="mt-0.5 font-mono text-sm font-medium text-ink-900 dark:text-white">{result.spaceComplexity}</p>
                </div>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <Gauge className="h-4 w-4 text-brand-500" />
                <span className="text-sm text-ink-600 dark:text-ink-300">Code Quality: {result.codeQuality}/100</span>
                <span className="text-xs text-ink-400">· Edge cases {result.edgeCasesHandled ? 'handled' : 'not handled'}</span>
              </div>
            </Card>

            {/* Bugs */}
            {result.bugsDetected?.length > 0 && (
              <Card>
                <div className="mb-2 flex items-center gap-2">
                  <Bug className="h-4 w-4 text-danger-500" />
                  <h3 className="font-display text-sm font-semibold text-ink-900 dark:text-white">Bugs Detected</h3>
                </div>
                <ul className="space-y-1.5">
                  {result.bugsDetected.map((b, i) => <li key={i} className="flex gap-2 text-sm text-ink-600 dark:text-ink-300"><span className="text-danger-500">•</span> {b}</li>)}
                </ul>
              </Card>
            )}

            {/* Improvements */}
            {result.suggestedImprovements?.length > 0 && !allPassed && (
              <Card>
                <div className="mb-2 flex items-center gap-2">
                  <Lightbulb className="h-4 w-4 text-brand-500" />
                  <h3 className="font-display text-sm font-semibold text-ink-900 dark:text-white">Suggested Improvements</h3>
                </div>
                <ul className="space-y-1.5">
                  {result.suggestedImprovements.map((imp, i) => <li key={i} className="flex gap-2 text-sm text-ink-600 dark:text-ink-300"><CheckCircle className="h-4 w-4 shrink-0 text-brand-500 mt-0.5" /> {imp}</li>)}
                </ul>
              </Card>
            )}
          </motion.div>
        ) : (
          <Card className="flex min-h-[200px] flex-col items-center justify-center text-center">
            <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-ink-100 dark:bg-ink-800 text-ink-400">
              <FileCode className="h-7 w-7" />
            </div>
            <p className="text-sm font-medium text-ink-700 dark:text-ink-300">Ready to evaluate</p>
            <p className="mt-1 max-w-xs text-sm text-ink-400">
              <strong>Run</strong> checks sample test cases. <strong>Submit</strong> runs all tests and saves your score.
            </p>
          </Card>
        )}
      </div>

      {/* AI Coding Assistant panel */}
      <AnimatePresence>
        {aiOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-4 right-4 z-40 w-80 max-w-[calc(100vw-2rem)] sm:w-96"
          >
            <Card className="!p-0">
              <div className="flex items-center justify-between border-b border-ink-200 dark:border-ink-700 px-4 py-3">
                <div className="flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-brand-500" />
                  <h3 className="font-display text-sm font-semibold text-ink-900 dark:text-white">AI Coding Assistant</h3>
                </div>
                <button onClick={() => setAiOpen(false)} className="text-ink-400 hover:text-ink-600"><X className="h-4 w-4" /></button>
              </div>
              <div className="max-h-[400px] overflow-y-auto p-4">
                <p className="mb-3 text-xs text-ink-500">Get tiered guidance — from gentle hints to full explanation. The assistant never reveals the solution unless you ask.</p>
                <div className="mb-3 flex flex-wrap gap-1.5">
                  {HINT_LEVELS.map((h) => {
                    const Icon = h.icon;
                    return (
                      <button
                        key={h.level}
                        onClick={() => requestHint(h.level)}
                        disabled={aiLoading}
                        className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
                          aiHintLevel === h.level ? 'bg-brand-500 text-white' : 'bg-ink-100 dark:bg-ink-800 text-ink-600 dark:text-ink-300 hover:bg-ink-200 dark:hover:bg-ink-700'
                        }`}
                      >
                        <Icon className="h-3 w-3" /> L{h.level}
                      </button>
                    );
                  })}
                </div>
                {aiLoading && <LoadingSpinner label="Getting guidance..." />}
                {aiHint && !aiLoading && (
                  <div className="rounded-xl bg-ink-50 dark:bg-ink-900/50 p-3">
                    <p className="mb-1 text-xs font-medium text-brand-500">{HINT_LEVELS.find((h) => h.level === aiHintLevel)?.label}</p>
                    <p className="whitespace-pre-wrap text-sm text-ink-600 dark:text-ink-300">{aiHint}</p>
                  </div>
                )}
                {!aiHint && !aiLoading && (
                  <p className="text-center text-xs text-ink-400">Select a hint level to get started.</p>
                )}
              </div>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );

  if (fullscreen) {
    return <div className="fixed inset-0 z-50 bg-white dark:bg-ink-950 p-4 overflow-y-auto">{editorContent}</div>;
  }

  return (
    <div>
      <PageHeader
        title="Coding Evaluation"
        subtitle="Solve curated problems with strict test-case judging across 10 languages. AI assistant provides tiered hints."
        icon={<Code2 className="h-5 w-5" />}
      />
      {editorContent}
    </div>
  );
}
