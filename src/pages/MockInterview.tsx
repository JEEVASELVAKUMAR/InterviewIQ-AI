import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MessageSquare, Sparkles, Send, ArrowRight, CheckCircle, RotateCcw,
  Bot, User, Loader2, Video, VideoOff, Mic, MicOff, AlertTriangle,
  Clock, Square, ChevronRight, Lock, Hand,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { getLatestResume, saveInterview, createNotification } from '../services/database';
import { generateInterviewQuestions, evaluateInterviewAnswer, getInterviewDebrief } from '../services/ai';
import { PageHeader, Card, Badge, EmptyState } from '../components/ui';
import type { InterviewTurn, Resume, InterviewDebrief } from '../types';

type Phase = 'config' | 'greeting' | 'interview' | 'results';

const difficulties = ['Easy', 'Medium', 'Hard', 'Expert'];
const types = ['HR', 'Technical', 'Behavioral', 'DSA', 'System Design'];
const counts = [5, 10, 15];
const companies = [
  'Google', 'Amazon', 'Microsoft', 'Meta', 'Apple', 'Netflix', 'Uber', 'Adobe',
  'Atlassian', 'Salesforce', 'Oracle', 'Infosys', 'TCS', 'Accenture',
  'Capgemini', 'Wipro', 'Cognizant', 'Zoho', 'Freshworks', 'Startup', 'Other',
];
const roles = ['Software Engineer', 'Frontend Developer', 'Backend Developer', 'Full Stack Developer', 'AI Engineer', 'Data Scientist', 'DevOps Engineer', 'Java Developer', 'Python Developer'];

type SpeechRecognitionType = any;

const GREETING_FLOW = [
  "Please come in and have a seat. Welcome — I'll be conducting your interview today.",
  "Before we begin, could you please introduce yourself? Tell me a bit about your background.",
];

export default function MockInterview() {
  const { user } = useAuth();
  const [phase, setPhase] = useState<Phase>('config');
  const [resume, setResume] = useState<Resume | null>(null);
  const [loadingResume, setLoadingResume] = useState(true);
  const [difficulty, setDifficulty] = useState('Medium');
  const [type, setType] = useState('Technical');
  const [count, setCount] = useState(5);
  const [customCount, setCustomCount] = useState('');
  const [company, setCompany] = useState('');
  const [customCompany, setCustomCompany] = useState('');
  const [role, setRole] = useState('');
  const [questions, setQuestions] = useState<string[]>([]);
  const [currentQ, setCurrentQ] = useState(0);
  const [answer, setAnswer] = useState('');
  const [turns, setTurns] = useState<InterviewTurn[]>([]);
  const [generating, setGenerating] = useState(false);
  const [evaluating, setEvaluating] = useState(false);
  const [scores, setScores] = useState<any>(null);
  const [debrief, setDebrief] = useState<InterviewDebrief | null>(null);
  const [greetingStep, setGreetingStep] = useState(0);
  const [introAnswer, setIntroAnswer] = useState('');

  // Voice
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionType>(null);

  // Camera — mandatory to start
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Timer
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Monitoring
  const [monitoringFlags, setMonitoringFlags] = useState<string[]>([]);
  const [endedEarly, setEndedEarly] = useState(false);
  const [endReason, setEndReason] = useState('');

  const answerRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Load resume
  useEffect(() => {
    if (!user) return;
    getLatestResume(user.id)
      .then(setResume)
      .finally(() => setLoadingResume(false));
  }, [user]);

  // Check Web Speech API support
  useEffect(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SR) {
      setVoiceSupported(true);
      const rec = new SR();
      rec.continuous = true;
      rec.interimResults = true;
      rec.onresult = (e: any) => {
        let transcript = '';
        for (let i = 0; i < e.results.length; i++) {
          transcript += e.results[i][0].transcript;
        }
        setAnswer(transcript);
      };
      rec.onerror = () => setListening(false);
      rec.onend = () => setListening(false);
      recognitionRef.current = rec;
    }
  }, []);

  // Scroll
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [turns, currentQ, greetingStep]);

  // Timer
  useEffect(() => {
    const active = phase === 'greeting' || phase === 'interview';
    if (active && !timerRef.current) {
      timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
    }
    if (!active && timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, [phase]);

  // Monitoring: tab blur
  useEffect(() => {
    if (phase !== 'interview' && phase !== 'greeting') return;
    const handleBlur = () => {
      addFlag('Tab switch detected');
    };
    window.addEventListener('blur', handleBlur);
    return () => window.removeEventListener('blur', handleBlur);
  }, [phase]);

  // Cleanup camera on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  const addFlag = (msg: string) => {
    setMonitoringFlags((prev) => {
      const updated = [...prev, { message: msg, timestamp: new Date().toISOString() }];
      if (updated.length >= 3) {
        endInterviewEarly('Ended early due to monitoring violations');
      }
      return updated;
    });
  };

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  };

  const requestCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setCameraOn(true);
      setCameraError(false);
    } catch {
      setCameraError(true);
      toast.error('Camera access denied. Camera is required to start the interview.');
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraOn(false);
  };

  const speakQuestion = (q: string) => {
    if (!voiceEnabled || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(q);
    utter.rate = 0.95;
    utter.onstart = () => setSpeaking(true);
    utter.onend = () => setSpeaking(false);
    window.speechSynthesis.speak(utter);
  };

  const toggleListening = () => {
    if (!recognitionRef.current) return;
    if (listening) {
      recognitionRef.current.stop();
      setListening(false);
    } else {
      setAnswer('');
      recognitionRef.current.start();
      setListening(true);
    }
  };

  const finalCompany = company === 'Other' ? customCompany : company;

  const startInterview = async () => {
    if (!resume?.raw_text) {
      toast.error('Please upload your resume first');
      return;
    }
    if (!finalCompany || !role) {
      toast.error('Select a company and role');
      return;
    }
    if (!cameraOn) {
      toast.error('Camera access is required to attend the mock interview. Please enable your camera to continue.');
      return;
    }
    const qCount = customCount ? parseInt(customCount) : count;
    if (!qCount || qCount < 1) {
      toast.error('Enter a valid question count');
      return;
    }
    setGenerating(true);
    try {
      const res = await generateInterviewQuestions({
        difficulty, type, count: qCount,
        resumeText: resume.raw_text,
        company: finalCompany, role,
      });
      const qs = res.questions ?? [];
      if (qs.length === 0) throw new Error('No questions generated');
      setQuestions(qs);
      setCurrentQ(0);
      setTurns([]);
      setElapsed(0);
      setMonitoringFlags([]);
      setEndedEarly(false);
      setEndReason('');
      setGreetingStep(0);
      setIntroAnswer('');
      setDebrief(null);
      setScores(null);
      setPhase('greeting');
      toast.success('Interview starting...');
      // Speak first greeting after a short delay
      setTimeout(() => speakQuestion(GREETING_FLOW[0]), 500);
    } catch (err: any) {
      toast.error('Failed to generate questions: ' + err.message);
    } finally {
      setGenerating(false);
    }
  };

  // Greeting flow: step 0 = first greeting, step 1 = ask for intro, step 2 = submit intro → interview
  const handleGreetingNext = () => {
    if (greetingStep === 0) {
      setGreetingStep(1);
      setTimeout(() => speakQuestion(GREETING_FLOW[1]), 300);
    } else if (greetingStep === 1) {
      if (!introAnswer.trim()) {
        toast.error('Please introduce yourself before we begin');
        return;
      }
      setGreetingStep(2);
      // Acknowledge resume, then begin real interview
      const acknowledge = `Thank you. I have your resume and documents here. Let's begin with the ${type} questions for the ${role} role at ${finalCompany}.`;
      speakQuestion(acknowledge);
      setTimeout(() => {
        setPhase('interview');
        setTimeout(() => speakQuestion(questions[0]), 800);
      }, 2500);
    }
  };

  const submitAnswer = async () => {
    if (!answer.trim()) {
      toast.error('Please provide an answer');
      return;
    }
    setEvaluating(true);
    if (listening && recognitionRef.current) {
      recognitionRef.current.stop();
      setListening(false);
    }
    try {
      const res = await evaluateInterviewAnswer({
        question: questions[currentQ],
        answer,
        type,
        difficulty,
        turnIndex: currentQ,
      });
      const newTurn: InterviewTurn = {
        question: questions[currentQ],
        answer,
        evaluation: res.evaluation,
        followUp: res.followUp,
      };
      const newTurns = [...turns, newTurn];
      setTurns(newTurns);
      setAnswer('');

      if (currentQ + 1 < questions.length) {
        setCurrentQ(currentQ + 1);
        setTimeout(() => speakQuestion(questions[currentQ + 1]), 300);
      } else {
        await finishInterview(newTurns, false, '');
      }
    } catch (err: any) {
      toast.error('Evaluation failed: ' + err.message);
    } finally {
      setEvaluating(false);
    }
  };

  const endInterviewEarly = useCallback((reason: string) => {
    setEndedEarly(true);
    setEndReason(reason);
    finishInterview(turns, true, reason);
  }, [turns]);

  const handleManualEnd = () => {
    if (turns.length === 0) {
      toast.error('No answers to evaluate yet');
      return;
    }
    finishInterview(turns, false, 'Ended manually by user');
  };

  const finishInterview = async (allTurns: InterviewTurn[], early: boolean, reason: string) => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    window.speechSynthesis?.cancel();
    if (listening && recognitionRef.current) {
      recognitionRef.current.stop();
      setListening(false);
    }
    try {
      const allScores = allTurns.map((t) => t.evaluation?.scores).filter(Boolean);
      const avg = (key: string) =>
        allScores.length > 0 ? allScores.reduce((s, sc) => s + (sc[key] ?? 0), 0) / allScores.length : 0;
      const overall = avg('overall') || (allTurns.length > 0 ? 60 : 0);

      const finalScores = {
        confidence: Math.round(avg('confidence')),
        grammar: Math.round(avg('grammar')),
        communication: Math.round(avg('communication')),
        technicalAccuracy: Math.round(avg('technicalAccuracy')),
        depth: Math.round(avg('depth')),
        starMethod: Math.round(avg('starMethod')),
        overall: Math.round(overall),
      };
      setScores(finalScores);

      // Fetch end-of-interview debrief (HR-style report)
      let debriefResult: InterviewDebrief | null = null;
      try {
        debriefResult = await getInterviewDebrief({
          turns: allTurns,
          type, difficulty,
          company: finalCompany, role,
        });
        setDebrief(debriefResult);
      } catch (err: any) {
        console.warn('Debrief failed:', err.message);
      }

      if (user) {
        await saveInterview(user.id, {
          difficulty, type,
          question_count: allTurns.length,
          transcript: allTurns,
          scores: finalScores,
          feedback: debriefResult?.debrief ?? { summary: '', suggestions: [] },
          overall_score: overall,
          status: early ? 'ended_early' : 'completed',
          monitoring_flags: monitoringFlags,
          ended_early: early,
          end_reason: reason,
          voice_used: voiceEnabled,
          company: finalCompany, role,
          resume_id: resume?.id,
        });
        await createNotification(user.id, {
          title: early ? 'Interview Ended Early' : 'Mock Interview Complete',
          message: `${type} interview for ${finalCompany} - ${role}. Score: ${Math.round(overall)}/100${early ? ' (ended early)' : ''}`,
          type: 'interview',
        });
        toast.success('Interview saved!');
      }
      setPhase('results');
    } catch (err: any) {
      toast.error('Failed to save interview: ' + err.message);
      setPhase('results');
    }
  };

  const reset = () => {
    setPhase('config');
    setQuestions([]);
    setTurns([]);
    setAnswer('');
    setScores(null);
    setDebrief(null);
    setCurrentQ(0);
    setElapsed(0);
    setMonitoringFlags([]);
    setEndedEarly(false);
    setEndReason('');
    setGreetingStep(0);
    setIntroAnswer('');
    stopCamera();
  };

  // Config phase
  if (loadingResume) {
    return (
      <div>
        <PageHeader title="AI Mock Interview" icon={<MessageSquare className="h-5 w-5" />} />
        <div className="skeleton h-96" />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="AI Mock Interview"
        subtitle="Realistic interview simulation with voice, camera monitoring, and end-of-interview debrief."
        icon={<MessageSquare className="h-5 w-5" />}
      />

      <AnimatePresence mode="wait">
        {phase === 'config' && (
          <motion.div key="config" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {!resume ? (
              <EmptyState
                icon={<Lock className="h-7 w-7" />}
                title="Upload your resume first"
                description="Mock interview requires your resume to generate personalized, resume-specific questions."
                action={<a href="/resume" className="btn-primary">Upload Resume <ArrowRight className="h-4 w-4" /></a>}
              />
            ) : (
              <Card>
                <h3 className="mb-4 font-display text-base font-semibold text-ink-900 dark:text-white">Configure Your Interview</h3>
                <div className="space-y-5">
                  {/* Company */}
                  <div>
                    <label className="label">Company</label>
                    <select value={company} onChange={(e) => setCompany(e.target.value)} className="input">
                      <option value="">Select a company</option>
                      {companies.filter((c) => c !== 'Other').map((c) => <option key={c} value={c}>{c}</option>)}
                      <option value="Other">Other (enter manually)</option>
                    </select>
                    {company === 'Other' && (
                      <input type="text" value={customCompany} onChange={(e) => setCustomCompany(e.target.value)}
                        placeholder="Enter company name" className="input mt-2" />
                    )}
                  </div>
                  {/* Role */}
                  <div>
                    <label className="label">Target Role</label>
                    <select value={role} onChange={(e) => setRole(e.target.value)} className="input">
                      <option value="">Select a role</option>
                      {roles.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </div>
                  {/* Difficulty */}
                  <div>
                    <label className="label">Difficulty</label>
                    <div className="flex flex-wrap gap-2">
                      {difficulties.map((d) => (
                        <button key={d} onClick={() => setDifficulty(d)}
                          className={`flex-1 rounded-xl border px-4 py-2.5 text-sm font-medium transition ${
                            difficulty === d ? 'border-brand-500 bg-brand-500/10 text-brand-600 dark:text-brand-400' : 'border-ink-200 dark:border-ink-700 text-ink-600 dark:text-ink-300 hover:border-brand-400'
                          }`}>{d}</button>
                      ))}
                    </div>
                  </div>
                  {/* Type */}
                  <div>
                    <label className="label">Interview Type</label>
                    <div className="flex flex-wrap gap-2">
                      {types.map((t) => (
                        <button key={t} onClick={() => setType(t)}
                          className={`rounded-xl border px-4 py-2.5 text-sm font-medium transition ${
                            type === t ? 'border-brand-500 bg-brand-500/10 text-brand-600 dark:text-brand-400' : 'border-ink-200 dark:border-ink-700 text-ink-600 dark:text-ink-300 hover:border-brand-400'
                          }`}>{t}</button>
                      ))}
                    </div>
                  </div>
                  {/* Count */}
                  <div>
                    <label className="label">Number of Questions</label>
                    <div className="flex gap-2">
                      {counts.map((c) => (
                        <button key={c} onClick={() => { setCount(c); setCustomCount(''); }}
                          className={`flex-1 rounded-xl border px-4 py-2.5 text-sm font-medium transition ${
                            count === c && !customCount ? 'border-brand-500 bg-brand-500/10 text-brand-600 dark:text-brand-400' : 'border-ink-200 dark:border-ink-700 text-ink-600 dark:text-ink-300 hover:border-brand-400'
                          }`}>{c} Qs</button>
                      ))}
                      <input type="number" min={1} max={50} value={customCount} onChange={(e) => setCustomCount(e.target.value)}
                        placeholder="Custom" className="input w-24" />
                    </div>
                  </div>

                  {/* Voice toggle */}
                  <div className="flex items-center justify-between rounded-xl bg-ink-50 dark:bg-ink-900/50 p-3">
                    <div className="flex items-center gap-2">
                      <Mic className="h-4 w-4 text-brand-500" />
                      <span className="text-sm font-medium text-ink-700 dark:text-ink-300">Voice Q&A</span>
                    </div>
                    {voiceSupported ? (
                      <button onClick={() => setVoiceEnabled(!voiceEnabled)}
                        className={`relative h-6 w-11 rounded-full transition ${voiceEnabled ? 'bg-brand-500' : 'bg-ink-300 dark:bg-ink-700'}`}>
                        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition ${voiceEnabled ? 'left-5' : 'left-0.5'}`} />
                      </button>
                    ) : (
                      <span className="text-xs text-ink-400">Not supported in this browser</span>
                    )}
                  </div>

                  {/* Camera request — mandatory */}
                  <div className="rounded-xl bg-ink-50 dark:bg-ink-900/50 p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Video className="h-4 w-4 text-brand-500" />
                        <span className="text-sm font-medium text-ink-700 dark:text-ink-300">Camera Monitoring <span className="text-danger-500">*</span> required</span>
                      </div>
                      <button onClick={() => (cameraOn ? stopCamera() : requestCamera())}
                        className={`rounded-lg px-3 py-1 text-xs font-medium transition ${cameraOn ? 'bg-danger-500/10 text-danger-500' : 'bg-brand-500/10 text-brand-500'}`}>
                        {cameraOn ? 'Turn Off' : 'Enable'}
                      </button>
                    </div>
                    {cameraError && <p className="mt-2 text-xs text-danger-500">Camera access denied. Camera is required to start the interview.</p>}
                    {cameraOn && (
                      <div className="relative mt-3 overflow-hidden rounded-xl">
                        <video ref={videoRef} autoPlay playsInline muted className="w-full" />
                        <p className="absolute bottom-2 left-2 rounded-lg bg-black/60 px-2 py-1 text-xs text-white">
                          You are being monitored. Stay in frame, keep this tab active.
                        </p>
                      </div>
                    )}
                    {!cameraOn && !cameraError && (
                      <p className="mt-2 text-xs text-ink-500">Camera access is required to attend the mock interview.</p>
                    )}
                  </div>

                  <button
                    onClick={startInterview}
                    disabled={generating || !cameraOn}
                    className="btn-primary w-full py-3 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {generating ? (
                      <><Loader2 className="h-4 w-4 animate-spin" /> Generating questions...</>
                    ) : !cameraOn ? (
                      <><Lock className="h-4 w-4" /> Enable camera to start</>
                    ) : (
                      <><Sparkles className="h-4 w-4" /> Start Interview</>
                    )}
                  </button>
                </div>
              </Card>
            )}
          </motion.div>
        )}

        {phase === 'greeting' && (
          <motion.div key="greeting" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {/* Top bar */}
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Badge color="brand">{type} · {difficulty}</Badge>
                <Badge color="neutral">{finalCompany} · {role}</Badge>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5 rounded-lg bg-ink-100 dark:bg-ink-800 px-3 py-1.5">
                  <Clock className="h-4 w-4 text-ink-400" />
                  <span className="font-mono text-sm font-medium text-ink-700 dark:text-ink-200">{formatTime(elapsed)}</span>
                </div>
              </div>
            </div>

            {/* Camera preview */}
            {cameraOn && (
              <div className="mb-4 flex justify-end">
                <div className="relative h-24 w-32 overflow-hidden rounded-lg">
                  <video ref={videoRef} autoPlay playsInline muted className="h-full w-full object-cover" />
                  <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1 text-[10px] text-white">Live</span>
                </div>
              </div>
            )}

            {/* Greeting chat */}
            <div ref={scrollRef} className="mb-4 max-h-[400px] space-y-4 overflow-y-auto rounded-2xl border border-ink-200 dark:border-ink-700 p-4">
              {/* Interviewer greeting */}
              <div className="flex gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-500/10 text-brand-500">
                  <Bot className="h-4 w-4" />
                </div>
                <div className="flex-1 rounded-xl rounded-tl-none bg-ink-100 dark:bg-ink-800 p-3 text-sm text-ink-700 dark:text-ink-200">
                  {GREETING_FLOW[0]}
                  {speaking && <span className="ml-2 inline-block h-2 w-2 animate-pulse rounded-full bg-brand-500" />}
                </div>
              </div>

              {greetingStep >= 1 && (
                <>
                  <div className="flex gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-500/10 text-brand-500">
                      <Bot className="h-4 w-4" />
                    </div>
                    <div className="flex-1 rounded-xl rounded-tl-none bg-ink-100 dark:bg-ink-800 p-3 text-sm text-ink-700 dark:text-ink-200">
                      {GREETING_FLOW[1]}
                    </div>
                  </div>
                  {/* Intro input */}
                  <Card>
                    <textarea
                      value={introAnswer}
                      onChange={(e) => setIntroAnswer(e.target.value)}
                      placeholder={voiceEnabled ? "Speak or type your introduction..." : "Type your introduction here..."}
                      rows={5}
                      className="input resize-none"
                    />
                    <div className="mt-3 flex items-center justify-between gap-2">
                      {voiceEnabled && voiceSupported && (
                        <button onClick={toggleListening} disabled={evaluating}
                          className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium transition ${
                            listening ? 'bg-danger-500 text-white' : 'bg-ink-100 dark:bg-ink-800 text-ink-600 dark:text-ink-300 hover:bg-ink-200 dark:hover:bg-ink-700'
                          }`}>
                          {listening ? <><MicOff className="h-4 w-4" /> Stop</> : <><Mic className="h-4 w-4" /> Speak</>}
                        </button>
                      )}
                      <button onClick={handleGreetingNext} disabled={!introAnswer.trim()} className="btn-primary ml-auto">
                        Begin Interview <ArrowRight className="h-4 w-4" />
                      </button>
                    </div>
                  </Card>
                </>
              )}

              {greetingStep === 0 && (
                <div className="flex justify-end">
                  <button onClick={handleGreetingNext} className="btn-primary">
                    Continue <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        )}

        {phase === 'interview' && (
          <motion.div key="interview" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {/* Top bar: timer + monitoring + end button */}
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Badge color="brand">{type} · {difficulty}</Badge>
                <Badge color="neutral">{finalCompany} · {role}</Badge>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5 rounded-lg bg-ink-100 dark:bg-ink-800 px-3 py-1.5">
                  <Clock className="h-4 w-4 text-ink-400" />
                  <span className="font-mono text-sm font-medium text-ink-700 dark:text-ink-200">{formatTime(elapsed)}</span>
                </div>
                {monitoringFlags.length > 0 && (
                  <Badge color="danger">
                    <AlertTriangle className="mr-1 inline h-3 w-3" /> {monitoringFlags.length} flag{monitoringFlags.length > 1 ? 's' : ''}
                  </Badge>
                )}
                <button onClick={handleManualEnd} className="btn-outline border-danger-500 text-danger-500 hover:bg-danger-500/10">
                  <Square className="h-4 w-4" /> End & Submit
                </button>
              </div>
            </div>

            {/* Progress */}
            <div className="mb-4 flex items-center justify-between">
              <span className="text-sm text-ink-500 dark:text-ink-400">Question {currentQ + 1} of {questions.length}</span>
              <span className="text-sm text-ink-400">{turns.length} answered</span>
            </div>
            <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-ink-100 dark:bg-ink-800">
              <motion.div className="h-full bg-brand-500" animate={{ width: `${(currentQ / questions.length) * 100}%` }} />
            </div>

            {/* Camera preview (small) */}
            {cameraOn && (
              <div className="mb-4 flex justify-end">
                <div className="relative h-24 w-32 overflow-hidden rounded-lg">
                  <video ref={videoRef} autoPlay playsInline muted className="h-full w-full object-cover" />
                  <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1 text-[10px] text-white">Live</span>
                </div>
              </div>
            )}

            {/* Chat transcript — feedback is HIDDEN during interview, shown only at the end */}
            <div ref={scrollRef} className="mb-4 max-h-[400px] space-y-4 overflow-y-auto rounded-2xl border border-ink-200 dark:border-ink-700 p-4">
              {turns.map((t, i) => (
                <div key={i} className="space-y-3">
                  <div className="flex gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-500/10 text-brand-500">
                      <Bot className="h-4 w-4" />
                    </div>
                    <div className="flex-1 rounded-xl rounded-tl-none bg-ink-100 dark:bg-ink-800 p-3 text-sm text-ink-700 dark:text-ink-200">{t.question}</div>
                  </div>
                  <div className="flex gap-3 justify-end">
                    <div className="flex-1 rounded-xl rounded-tr-none bg-brand-500 p-3 text-sm text-white">{t.answer}</div>
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink-200 dark:bg-ink-700 text-ink-500">
                      <User className="h-4 w-4" />
                    </div>
                  </div>
                </div>
              ))}
              {/* Current question */}
              <div className="flex gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-500/10 text-brand-500">
                  <Bot className="h-4 w-4" />
                </div>
                <div className="flex-1 rounded-xl rounded-tl-none bg-ink-100 dark:bg-ink-800 p-3 text-sm text-ink-700 dark:text-ink-200">
                  {questions[currentQ]}
                  {speaking && <span className="ml-2 inline-block h-2 w-2 animate-pulse rounded-full bg-brand-500" />}
                </div>
              </div>
            </div>

            {/* Answer input */}
            <Card>
              <textarea
                ref={answerRef}
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                placeholder={voiceEnabled ? "Speak or type your answer..." : "Type your answer here..."}
                rows={5}
                className="input resize-none"
                disabled={evaluating}
              />
              <div className="mt-3 flex items-center justify-between gap-2">
                {voiceEnabled && voiceSupported && (
                  <button onClick={toggleListening} disabled={evaluating}
                    className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium transition ${
                      listening ? 'bg-danger-500 text-white' : 'bg-ink-100 dark:bg-ink-800 text-ink-600 dark:text-ink-300 hover:bg-ink-200 dark:hover:bg-ink-700'
                    }`}>
                    {listening ? <><MicOff className="h-4 w-4" /> Stop</> : <><Mic className="h-4 w-4" /> Speak</>}
                  </button>
                )}
                <button onClick={submitAnswer} disabled={evaluating || !answer.trim()} className="btn-primary ml-auto">
                  {evaluating ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Evaluating...</>
                  ) : (
                    <>Submit & Next <Send className="h-4 w-4" /></>
                  )}
                </button>
              </div>
            </Card>
          </motion.div>
        )}

        {phase === 'results' && (
          <motion.div key="results" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
            <Card className="flex flex-col items-center text-center">
              <div className={`mb-3 flex h-16 w-16 items-center justify-center rounded-2xl ${endedEarly ? 'bg-warning-500/10 text-warning-500' : 'bg-success-500/10 text-success-500'}`}>
                {endedEarly ? <AlertTriangle className="h-8 w-8" /> : <CheckCircle className="h-8 w-8" />}
              </div>
              <h3 className="font-display text-xl font-bold text-ink-900 dark:text-white">
                {endedEarly ? 'Interview Ended Early' : 'Interview Complete!'}
              </h3>
              <p className="mt-1 text-sm text-ink-500 dark:text-ink-400">
                {endedEarly ? endReason : `You answered ${turns.length} ${type} questions at ${difficulty} difficulty.`}
              </p>
              <p className="mt-1 text-xs text-ink-400">Duration: {formatTime(elapsed)} · {finalCompany} · {role}</p>
            </Card>

            {/* End-of-interview debrief (HR-style report) */}
            {debrief?.debrief && (
              <Card>
                <div className="mb-3 flex items-center gap-2">
                  <Hand className="h-5 w-5 text-brand-500" />
                  <h3 className="font-display text-base font-semibold text-ink-900 dark:text-white">Interviewer Debrief</h3>
                </div>
                <p className="text-sm text-ink-600 dark:text-ink-300">{debrief.debrief.overallSummary}</p>
                {debrief.debrief.recommendation && (
                  <p className="mt-3 rounded-xl bg-brand-500/10 p-3 text-sm font-medium text-brand-600 dark:text-brand-400">
                    Recommendation: {debrief.debrief.recommendation}
                  </p>
                )}
              </Card>
            )}

            {scores && (
              <Card>
                <h3 className="mb-4 font-display text-base font-semibold text-ink-900 dark:text-white">Score Breakdown</h3>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {Object.entries(scores).map(([key, val]) => (
                    <div key={key} className="rounded-xl bg-ink-50 dark:bg-ink-900/50 p-3 text-center">
                      <p className="font-display text-2xl font-bold text-brand-500">{val as number}</p>
                      <p className="mt-0.5 text-xs capitalize text-ink-500 dark:text-ink-400">{key.replace(/([A-Z])/g, ' $1').trim()}</p>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {debrief?.debrief && (
              <div className="grid gap-4 md:grid-cols-2">
                {debrief.debrief.strengths?.length > 0 && (
                  <Card>
                    <div className="mb-3 flex items-center gap-2">
                      <CheckCircle className="h-5 w-5 text-success-500" />
                      <h3 className="font-display text-sm font-semibold text-ink-900 dark:text-white">Strengths</h3>
                    </div>
                    <ul className="space-y-1.5">
                      {debrief.debrief.strengths.map((s, i) => (
                        <li key={i} className="flex gap-2 text-sm text-ink-600 dark:text-ink-300">
                          <ArrowRight className="h-4 w-4 shrink-0 text-success-500 mt-0.5" /> {s}
                        </li>
                      ))}
                    </ul>
                  </Card>
                )}
                {debrief.debrief.improvements?.length > 0 && (
                  <Card>
                    <div className="mb-3 flex items-center gap-2">
                      <AlertTriangle className="h-5 w-5 text-warning-500" />
                      <h3 className="font-display text-sm font-semibold text-ink-900 dark:text-white">Areas to Improve</h3>
                    </div>
                    <ul className="space-y-1.5">
                      {debrief.debrief.improvements.map((s, i) => (
                        <li key={i} className="flex gap-2 text-sm text-ink-600 dark:text-ink-300">
                          <ArrowRight className="h-4 w-4 shrink-0 text-warning-500 mt-0.5" /> {s}
                        </li>
                      ))}
                    </ul>
                  </Card>
                )}
              </div>
            )}

            {monitoringFlags.length > 0 && (
              <Card>
                <div className="mb-2 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-warning-500" />
                  <h3 className="font-display text-sm font-semibold text-ink-900 dark:text-white">Monitoring Flags ({monitoringFlags.length})</h3>
                </div>
                <ul className="space-y-1">
                  {monitoringFlags.map((f: any, i) => (
                    <li key={i} className="text-xs text-ink-500">{f.message} — {new Date(f.timestamp).toLocaleTimeString()}</li>
                  ))}
                </ul>
              </Card>
            )}

            <button onClick={reset} className="btn-outline w-full">
              <RotateCcw className="h-4 w-4" /> Start New Interview
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
