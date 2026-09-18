import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Video,
  Mic,
  MicOff,
  VideoOff,
  AlertCircle,
  Check,
  Loader2,
  Radio,
  Sparkles,
  Captions,
  Eye,
  Gauge,
  TrendingUp,
  Maximize2,
  Camera,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { useTextToSpeech } from '../hooks/useTextToSpeech';
import { useSpeechRecognition } from '../hooks/useSpeechRecognition';
import { useMediaRecorder } from '../hooks/useMediaRecorder';
import { useSilenceDetection } from '../hooks/useSilenceDetection';
import { useEngagementSignals } from '../hooks/useEngagementSignals';
import { useFullscreenProctor } from '../hooks/useFullscreenProctor';
import { useTabSwitchProctor } from '../hooks/useTabSwitchProctor';
import { useDeviceMonitor } from '../hooks/useDeviceMonitor';
import type { EngagementSignals as Signals } from '../hooks/useEngagementSignals';
import { TerminatedScreen } from '../components/TerminatedScreen';
import {
  getInterviewSession,
  saveInterviewAnswer,
  updateInterviewSessionStatus,
  recordInterviewViolation,
  updateInterviewStage,
  uploadInterviewRecording,
} from '../services/database';
import { generateNextInterviewQuestion } from '../services/ai';
import type { InterviewSession as Session, InterviewStage } from '../types';

type Phase =
  | 'loading'
  | 'consent'
  | 'calibrating'
  | 'ai_speaking'
  | 'candidate_answering'
  | 'thinking'
  | 'done'
  | 'terminated';

type ConversationTurn = {
  question: string;
  answer: string;
  questionType: string;
  stage: string;
  signals?: Signals;
};

const TOTAL_MAX_QUESTIONS = 10;

// Stages where answers should be scored
const SCORED_STAGES = new Set(['background', 'core']);

export default function InterviewSession() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [phase, setPhase] = useState<Phase>('loading');
  const [session, setSession] = useState<Session | null>(null);
  const [conversation, setConversation] = useState<ConversationTurn[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState<string>('');
  const [currentTransition, setCurrentTransition] = useState<string>('');
  const [currentQuestionType, setCurrentQuestionType] = useState<string>('behavioral');
  const [currentStage, setCurrentStage] = useState<InterviewStage>('entry');
  const [stageQuestionCount, setStageQuestionCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [violationType, setViolationType] = useState<
    'tab_switch' | 'fullscreen_exit' | 'device_error' | null
  >(null);

  // Device controls (only on consent screen)
  const [micEnabled, setMicEnabled] = useState(true);
  const [cameraEnabled, setCameraEnabled] = useState(true);

  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Phase 3: Voice-first UI
  const [captionsEnabled, setCaptionsEnabled] = useState(false);

  // Hooks
  const tts = useTextToSpeech();
  const sr = useSpeechRecognition();
  const recorder = useMediaRecorder();
  const silence = useSilenceDetection(recorder.stream, {
    silenceDuration: 2800,
    shortAnswerSilenceDuration: 4000,
    minSpeechDuration: 1000,
    getWordCount: () =>
      (sr.transcript + ' ' + sr.interimTranscript).trim().split(/\s+/).filter((w) => w.length > 0).length,
  });
  const engagement = useEngagementSignals(videoRef);

  // Proctoring violation handler
  const handleViolation = useCallback(
    (type: 'tab_switch' | 'fullscreen_exit' | 'device_error') => {
      if (phase === 'terminated' || phase === 'consent' || phase === 'loading') return;
      setViolationType(type);
      setPhase('terminated');
      tts.cancel();
      sr.stop();
      recorder.stopStream();
      if (sessionId) {
        recordInterviewViolation(sessionId, type).catch(() => {});
      }
    },
    [phase, sessionId, tts, sr, recorder],
  );

  // Proctoring hooks — only enabled during active interview
  const proctoringActive =
    phase !== 'loading' && phase !== 'consent' && phase !== 'terminated' && phase !== 'done';

  useFullscreenProctor({
    enabled: proctoringActive,
    onViolation: () => handleViolation('fullscreen_exit'),
  });
  useTabSwitchProctor({
    enabled: proctoringActive,
    onViolation: () => handleViolation('tab_switch'),
  });
  useDeviceMonitor({
    stream: recorder.stream,
    enabled: proctoringActive,
    onViolation: () => handleViolation('device_error'),
  });

  const { requestFullscreen } = useFullscreenProctor({
    enabled: false, // we use the listener part above; this is just for the request function
    onViolation: () => {},
  });

  // --- Load session data ---
  useEffect(() => {
    if (!sessionId || !user) return;
    (async () => {
      try {
        const { data, error: fetchError } = await import('../lib/supabase').then((m) =>
          m.supabase.from('interview_sessions').select('*').eq('id', sessionId).single(),
        );
        if (fetchError || !data) {
          setError('Interview session not found.');
          setPhase('consent');
          return;
        }
        if (data.user_id !== user.id) {
          setError('You do not have access to this interview session.');
          setPhase('consent');
          return;
        }
        if (data.status === 'terminated_violation') {
          setViolationType(data.violation_type as any);
          setPhase('terminated');
          return;
        }
        setSession(data as Session);
        if (data.current_stage) {
          setCurrentStage(data.current_stage as InterviewStage);
        }
        setPhase('consent');
      } catch (err: any) {
        setError(err.message);
        setPhase('consent');
      }
    })();
  }, [sessionId, user]);

  // --- Attach video stream to element ---
  useEffect(() => {
    if (videoRef.current && recorder.stream) {
      videoRef.current.srcObject = recorder.stream;
    }
  }, [recorder.stream]);

  // --- Silence detection: auto-stop when candidate stops speaking ---
  useEffect(() => {
    if (phase === 'candidate_answering' && silence.silenceTriggered) {
      handleDoneAnswering();
    }
  }, [silence.silenceTriggered, phase]);

  // --- Cleanup on unmount ---
  useEffect(() => {
    return () => {
      tts.cancel();
      recorder.stopStream();
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Start interview (from consent) ---
  const handleStart = useCallback(async () => {
    if (!session) return;
    try {
      // Request fullscreen BEFORE starting
      if (containerRef.current) {
        const ok = await requestFullscreen(containerRef.current);
        if (!ok) {
          toast.error(
            'Fullscreen is required for this interview. Please allow fullscreen and try again.',
          );
          return;
        }
      }

      await updateInterviewSessionStatus(session.id, 'in_progress');
      const stream = await recorder.startRecording({ video: cameraEnabled, audio: micEnabled });
      if (!stream) {
        toast.error('Could not access camera/microphone. Please grant permissions and try again.');
        if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
        return;
      }

      await fetchNextQuestion();
    } catch (err: any) {
      toast.error('Failed to start interview: ' + err.message);
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    }
  }, [session, recorder, cameraEnabled, micEnabled, requestFullscreen]);

  // --- Fetch next question from edge function (staged flow) ---
  const fetchNextQuestion = useCallback(async () => {
    if (!session) return;
    const totalQuestionCount = conversation.length;

    if (totalQuestionCount >= TOTAL_MAX_QUESTIONS) {
      await finishInterview();
      return;
    }

    setPhase('thinking');

    try {
      const result = await generateNextInterviewQuestion({
        conversation: conversation.map((t) => ({
          question: t.question,
          answer: t.answer,
          questionType: t.questionType,
          stage: t.stage,
        })),
        resumeText: session.resume_text ?? undefined,
        jobRole: session.job_role ?? undefined,
        currentStage,
        stageQuestionCount,
        totalQuestionCount,
      });

      if (result.done || !result.question) {
        if (result.transition) {
          setPhase('ai_speaking');
          setCurrentQuestion(result.transition);
          setCurrentTransition('');
          await tts.speak(result.transition);
        }
        await finishInterview();
        return;
      }

      const newStage = (result.stage as InterviewStage) || currentStage;
      setCurrentStage(newStage);
      setCurrentQuestion(result.question);
      setCurrentTransition(result.transition || '');
      setCurrentQuestionType(result.type || 'behavioral');

      // Update stage in DB
      updateInterviewStage(session.id, newStage).catch(() => {});

      // If stage changed, reset stage question count
      if (newStage !== currentStage) {
        setStageQuestionCount(1);
      } else {
        setStageQuestionCount((prev) => prev + 1);
      }

      setPhase('ai_speaking');

      const fullText = result.transition
        ? `${result.transition} ${result.question}`
        : result.question;
      await tts.speak(fullText);

      if (tts.supported) {
        startCandidateAnswering();
      }
    } catch (err: any) {
      toast.error('Failed to generate next question: ' + err.message);
      setError(err.message);
      setPhase('consent');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, conversation, currentStage, stageQuestionCount, tts]);

  // --- Start candidate answering phase ---
  const startCandidateAnswering = useCallback(async () => {
    sr.start();
    silence.reset();
    setPhase('candidate_answering');
    // Await engagement collection — this now waits for FaceLandmarker init + video readiness
    await engagement.startCollection();
  }, [sr, silence, engagement]);

  // --- Candidate done answering ---
  const handleDoneAnswering = useCallback(async () => {
    if (phase !== 'candidate_answering') return;

    const transcript = sr.stop();
    silence.reset();
    const signals = engagement.stopCollection(transcript);
    setPhase('thinking');

    const recording = await recorder.stopRecording();

    if (session) {
      try {
        let videoUrl: string | null = null;

        if (recording) {
          const isVideo = recording.type.startsWith('video');
          const path = `${user?.id}/${session.id}/q${conversation.length + 1}.${isVideo ? 'webm' : 'webm'}`;
          videoUrl = await uploadInterviewRecording(path, recording.blob);
        }

        await saveInterviewAnswer({
          session_id: session.id,
          question_id: null,
          question_text: currentQuestion,
          transcript: transcript || '(no speech detected)',
          video_url: videoUrl,
          audio_url: null,
          engagement_signals: SCORED_STAGES.has(currentStage) ? signals : null,
        });
      } catch (err: any) {
        toast.error('Failed to save answer: ' + err.message);
      }
    }

    const turn: ConversationTurn = {
      question: currentQuestion,
      answer: transcript || '(no speech detected)',
      questionType: currentQuestionType,
      stage: currentStage,
      signals: SCORED_STAGES.has(currentStage) ? signals : undefined,
    };
    setConversation((prev) => [...prev, turn]);

    if (micEnabled || cameraEnabled) {
      await recorder.startRecording({ video: cameraEnabled, audio: micEnabled });
    }

    await fetchNextQuestion();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, sr, recorder, session, user, conversation, currentQuestion, currentQuestionType, currentStage, silence, engagement]);

  // --- Finish interview ---
  const finishInterview = useCallback(async () => {
    if (!session) return;
    try {
      await updateInterviewSessionStatus(session.id, 'completed');
      recorder.stopStream();
      tts.cancel();
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
    } catch {
      // ignore
    }
    navigate(`/interview/completed/${session.id}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, recorder, tts, navigate]);

  // --- Toggle mic/camera (only on consent screen) ---
  const toggleMic = useCallback(() => {
    setMicEnabled((prev) => !prev);
  }, []);

  const toggleCamera = useCallback(() => {
    setCameraEnabled((prev) => !prev);
  }, []);

  // --- Early exit ---
  const handleExit = useCallback(() => {
    if (phase === 'candidate_answering' || phase === 'ai_speaking') {
      if (!confirm('Are you sure you want to end the interview early? Your progress will be saved.')) return;
    }
    finishInterview();
  }, [phase, finishInterview]);

  // =================== RENDER ===================

  if (phase === 'loading') {
    return (
      <div className="flex h-[80vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-ink-200 border-t-brand-500 dark:border-ink-700 dark:border-t-brand-400" />
        <span className="ml-3 text-sm text-ink-500 dark:text-ink-400">Loading interview session...</span>
      </div>
    );
  }

  // --- Terminated screen ---
  if (phase === 'terminated' && violationType) {
    return (
      <TerminatedScreen
        violationType={violationType}
        onRestart={() => navigate('/interview/setup')}
        onGoHome={() => navigate('/dashboard')}
      />
    );
  }

  // --- Consent screen ---
  if (phase === 'consent') {
    return (
      <div className="mx-auto max-w-2xl py-8">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="card p-8"
        >
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-500/10 text-brand-500">
              <Video className="h-6 w-6" />
            </div>
            <div>
              <h1 className="font-display text-xl font-bold text-ink-900 dark:text-white">
                Video Interview Ready
              </h1>
              <p className="text-sm text-ink-500 dark:text-ink-400">
                Before we begin, let's set up your camera and microphone.
              </p>
            </div>
          </div>

          {error && (
            <div className="mb-5 flex items-center gap-2 rounded-xl bg-danger-500/10 p-3 text-sm text-danger-600 dark:text-danger-400">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          <div className="mb-6 space-y-3">
            <div className="flex items-start gap-3 rounded-xl bg-ink-50 dark:bg-ink-900/50 p-4">
              <Radio className="mt-0.5 h-5 w-5 shrink-0 text-brand-500" />
              <div>
                <p className="text-sm font-medium text-ink-800 dark:text-ink-200">
                  Camera and microphone access
                </p>
                <p className="mt-0.5 text-xs text-ink-500 dark:text-ink-400">
                  We need access to your camera and microphone to conduct the interview. You can disable either one below before starting.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-xl bg-ink-50 dark:bg-ink-900/50 p-4">
              <Video className="mt-0.5 h-5 w-5 shrink-0 text-brand-500" />
              <div>
                <p className="text-sm font-medium text-ink-800 dark:text-ink-200">
                  Your recording is private
                </p>
                <p className="mt-0.5 text-xs text-ink-500 dark:text-ink-400">
                  Your video and audio responses are stored securely and are only visible to you. Nothing is shared.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-xl bg-ink-50 dark:bg-ink-900/50 p-4">
              <Eye className="mt-0.5 h-5 w-5 shrink-0 text-brand-500" />
              <div>
                <p className="text-sm font-medium text-ink-800 dark:text-ink-200">
                  Behavioral signals (not emotion detection)
                </p>
                <p className="mt-0.5 text-xs text-ink-500 dark:text-ink-400">
                  We measure observable signals like eye contact with the camera, speaking pace, and filler word frequency to give you feedback. We do not detect emotions or judge confidence from facial expressions.
                </p>
              </div>
            </div>
            {/* Phase 4: Fullscreen + tab switch warning */}
            <div className="flex items-start gap-3 rounded-xl bg-danger-500/10 p-4">
              <Maximize2 className="mt-0.5 h-5 w-5 shrink-0 text-danger-500" />
              <div>
                <p className="text-sm font-medium text-ink-800 dark:text-ink-200">
                  Fullscreen required the entire time
                </p>
                <p className="mt-0.5 text-xs text-ink-500 dark:text-ink-400">
                  This interview must stay in fullscreen the entire time. Exiting fullscreen or switching tabs will end the interview immediately and you'll need to restart.
                </p>
              </div>
            </div>
          </div>

          {/* Device toggles — only on consent screen */}
          <div className="mb-6 flex gap-3">
            <button
              onClick={toggleMic}
              className={`flex flex-1 items-center justify-center gap-2 rounded-xl border p-3 text-sm font-medium transition-colors ${
                micEnabled
                  ? 'border-brand-500 bg-brand-500/5 text-brand-600 dark:text-brand-400'
                  : 'border-ink-200 dark:border-ink-700 text-ink-400'
              }`}
            >
              {micEnabled ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
              {micEnabled ? 'Microphone On' : 'Microphone Off'}
            </button>
            <button
              onClick={toggleCamera}
              className={`flex flex-1 items-center justify-center gap-2 rounded-xl border p-3 text-sm font-medium transition-colors ${
                cameraEnabled
                  ? 'border-brand-500 bg-brand-500/5 text-brand-600 dark:text-brand-400'
                  : 'border-ink-200 dark:border-ink-700 text-ink-400'
              }`}
            >
              {cameraEnabled ? <Video className="h-4 w-4" /> : <VideoOff className="h-4 w-4" />}
              {cameraEnabled ? 'Camera On' : 'Camera Off'}
            </button>
          </div>

          {/* Auto turn-taking info */}
          <div className="mb-6 flex items-start gap-3 rounded-xl bg-brand-500/5 p-4">
            <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-brand-500" />
            <div>
              <p className="text-sm font-medium text-ink-800 dark:text-ink-200">
                Automatic turn-taking
              </p>
              <p className="mt-0.5 text-xs text-ink-500 dark:text-ink-400">
                Just speak naturally — the AI will detect when you've finished answering and move to the next question automatically. No need to click any buttons.
              </p>
            </div>
          </div>

          {!tts.supported && (
            <div className="mb-4 flex items-center gap-2 rounded-xl bg-warning-500/10 p-3 text-xs text-warning-600 dark:text-warning-400">
              <AlertCircle className="h-4 w-4 shrink-0" />
              Your browser doesn't support text-to-speech. Questions will be displayed as text only.
            </div>
          )}

          {!sr.supported && (
            <div className="mb-4 flex items-center gap-2 rounded-xl bg-warning-500/10 p-3 text-xs text-warning-600 dark:text-warning-400">
              <AlertCircle className="h-4 w-4 shrink-0" />
              Your browser doesn't support live speech recognition. You can still record audio — transcripts will be generated server-side.
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={() => navigate('/interview/setup')}
              className="btn-secondary flex-1"
            >
              Back
            </button>
            <button
              onClick={handleStart}
              className="btn-primary flex-[2]"
            >
              <Maximize2 className="h-4 w-4" /> Start Interview
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  // --- Main interview screen ---
  const isRecording = recorder.state === 'recording';
  const lastTurn = conversation.length > 0 ? conversation[conversation.length - 1] : null;
  const isScored = lastTurn ? SCORED_STAGES.has(lastTurn.stage) : false;

  return (
    <div ref={containerRef} className="flex flex-col gap-4">
      {/* Top bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isRecording && (
            <span className="flex items-center gap-1.5 rounded-full bg-danger-500/10 px-2.5 py-1 text-xs font-medium text-danger-600 dark:text-danger-400">
              <span className="h-2 w-2 animate-pulse rounded-full bg-danger-500" />
              REC
            </span>
          )}
          <span className="text-sm text-ink-500 dark:text-ink-400">
            Question {Math.min(conversation.length + 1, TOTAL_MAX_QUESTIONS)}
          </span>
          {/* Stage indicator (subtle) */}
          <span className="rounded-full bg-ink-100 px-2 py-0.5 text-xs text-ink-400 dark:bg-ink-800">
            {currentStage}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {/* Captions toggle */}
          <button
            onClick={() => setCaptionsEnabled((prev) => !prev)}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              captionsEnabled
                ? 'bg-brand-500/10 text-brand-600 dark:text-brand-400'
                : 'bg-ink-100 text-ink-500 dark:bg-ink-800 dark:text-ink-400'
            }`}
            title="Toggle captions for AI questions"
          >
            <Captions className="h-3.5 w-3.5" />
            {captionsEnabled ? 'Captions On' : 'Captions'}
          </button>
          <button
            onClick={handleExit}
            className="text-sm font-medium text-ink-400 hover:text-danger-500 transition-colors"
          >
            End Interview
          </button>
        </div>
      </div>

      {/* Split screen */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* LEFT: AI Interviewer */}
        <div className="relative flex min-h-[300px] flex-col overflow-hidden rounded-2xl border border-ink-200 bg-ink-900 dark:border-ink-700 lg:min-h-[450px]">
          {/* Avatar / waveform area */}
          <div className="flex flex-1 items-center justify-center p-8">
            <AiAvatar
              speaking={tts.speaking || phase === 'thinking'}
              calibrating={phase === 'candidate_answering' && engagement.calibrating}
            />
          </div>

          {/* Calibrating overlay */}
          {phase === 'candidate_answering' && engagement.calibrating && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-sm">
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="h-8 w-8 animate-spin text-brand-400" />
                <p className="text-sm font-medium text-white/80">Calibrating camera...</p>
              </div>
            </div>
          )}

          {/* Captions (optional, subtle bottom-third style) */}
          {captionsEnabled && (
            <div className="pointer-events-none absolute bottom-[15%] left-1/2 -translate-x-1/2 px-4">
              {phase === 'thinking' && (
                <div className="flex items-center gap-2 text-sm text-white/60">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  AI is preparing the next question...
                </div>
              )}
              {phase === 'ai_speaking' && currentQuestion && (
                <p className="text-center text-sm font-medium text-white/90 drop-shadow-lg">
                  {currentQuestion}
                </p>
              )}
            </div>
          )}

          {/* Bottom status bar */}
          <div className="border-t border-white/10 bg-black/40 p-4 backdrop-blur">
            {phase === 'thinking' && !captionsEnabled && (
              <div className="flex items-center gap-2 text-sm text-white/60">
                <Loader2 className="h-4 w-4 animate-spin" />
                AI is preparing the next question...
              </div>
            )}
            {phase === 'ai_speaking' && !captionsEnabled && (
              <div className="flex items-center gap-2 text-sm text-white/60">
                <span className="h-2 w-2 animate-pulse rounded-full bg-brand-400" />
                AI is speaking...
              </div>
            )}
            {phase === 'candidate_answering' && !engagement.calibrating && (
              <div className="flex items-center gap-2 text-sm text-white/60">
                <Mic className="h-4 w-4 text-success-400" />
                Your turn — speak your answer
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: Candidate camera */}
        <div className="relative flex min-h-[300px] flex-col overflow-hidden rounded-2xl border border-ink-200 bg-ink-900 dark:border-ink-700 dark:bg-black lg:min-h-[450px]">
          {/* Video feed */}
          <div className="relative flex-1">
            {cameraEnabled && recorder.stream ? (
              <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                className="h-full w-full object-cover"
                style={{ transform: 'scaleX(-1)' }}
              />
            ) : (
              <div className="flex h-full items-center justify-center">
                <div className="flex h-20 w-20 items-center justify-center rounded-full bg-ink-800 text-ink-500">
                  {cameraEnabled ? <Video className="h-8 w-8" /> : <VideoOff className="h-8 w-8" />}
                </div>
              </div>
            )}

            {/* Recording indicator */}
            {isRecording && (
              <div className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-black/50 px-2.5 py-1 text-xs font-medium text-white backdrop-blur">
                <span className="h-2 w-2 animate-pulse rounded-full bg-danger-500" />
                REC
              </div>
            )}

            {/* Engagement tracking indicator */}
            {phase === 'candidate_answering' && engagement.active && !engagement.calibrating && (
              <div className="absolute right-3 top-3 flex items-center gap-1.5 rounded-full bg-black/50 px-2.5 py-1 text-xs font-medium text-white backdrop-blur">
                <Eye className="h-3 w-3 text-brand-400" />
                {engagement.trackingAvailable ? 'Tracking' : 'No tracking'}
              </div>
            )}

            {/* Live transcript captions removed — transcript is still captured
                in the background via sr.transcript/sr.interimTranscript and sent
                to the AI, but no longer displayed on the candidate's camera view. */}
          </div>

          {/* Controls — mic/camera locked during active interview, only Done button active */}
          <div className="flex items-center justify-center gap-3 border-t border-white/10 bg-black/60 p-4 backdrop-blur">
            {/* Mic indicator (locked, dims when silence detected) */}
            <div
              className={`flex h-11 w-11 items-center justify-center rounded-full transition-opacity duration-500 ${
                micEnabled
                  ? silence.finishing
                    ? 'bg-white/5 text-white/40'
                    : 'bg-white/10 text-white'
                  : 'bg-danger-500 text-white'
              }`}
              title={micEnabled ? (silence.finishing ? 'Silence detected — about to move on' : 'Microphone on (locked)') : 'Microphone off'}
            >
              {micEnabled ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
            </div>
            {/* Camera indicator (locked, not toggleable) */}
            <div
              className={`flex h-11 w-11 items-center justify-center rounded-full ${
                cameraEnabled ? 'bg-white/10 text-white' : 'bg-danger-500 text-white'
              }`}
              title={cameraEnabled ? 'Camera on (locked)' : 'Camera off'}
            >
              {cameraEnabled ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
            </div>


          </div>
        </div>
      </div>

      {/* Engagement signals (only for scored stages) */}
      <AnimatePresence>
        {lastTurn?.signals && phase !== 'candidate_answering' && isScored && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="grid grid-cols-2 gap-3 sm:grid-cols-4"
          >
            <SignalCard
              icon={<Eye className="h-4 w-4" />}
              label="Eye Contact"
              value={lastTurn.signals.sampleCount > 0 ? `${lastTurn.signals.eyeContactPct}%` : 'no data'}
              hint={lastTurn.signals.sampleCount > 0 ? `${lastTurn.signals.sampleCount} samples` : 'tracking unavailable'}
            />
            <SignalCard
              icon={<Gauge className="h-4 w-4" />}
              label="Speaking Pace"
              value={`${lastTurn.signals.speakingPaceWPM} wpm`}
              hint={lastTurn.signals.speakingPaceWPM > 0 ? (lastTurn.signals.speakingPaceWPM < 120 ? 'slow' : lastTurn.signals.speakingPaceWPM > 180 ? 'fast' : 'steady') : '—'}
            />
            <SignalCard
              icon={<TrendingUp className="h-4 w-4" />}
              label="Filler Words"
              value={String(lastTurn.signals.fillerWordCount)}
              hint={lastTurn.signals.fillerWords.length > 0 ? lastTurn.signals.fillerWords.join(', ') : 'none detected'}
            />
            <SignalCard
              icon={<Check className="h-4 w-4" />}
              label="Completeness"
              value={lastTurn.signals.answerCompleteness}
              hint={lastTurn.signals.answerCompleteness === 'complete' ? 'full answer' : lastTurn.signals.answerCompleteness === 'partial' ? 'partial' : 'too short'}
            />
          </motion.div>
        )}
        {/* For non-scored stages (icebreaker, entry), show a subtle note */}
        {lastTurn && !lastTurn.signals && phase !== 'candidate_answering' && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="flex items-center justify-center gap-2 text-sm text-ink-400"
          >
            <Sparkles className="h-4 w-4" />
            <span>This stage is for conversation only — not scored.</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Status / hints */}
      <AnimatePresence>
        {phase === 'ai_speaking' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex items-center justify-center gap-2 text-sm text-ink-500 dark:text-ink-400"
          >
            <Loader2 className="h-4 w-4 animate-spin text-brand-500" />
            AI is speaking... Please wait.
          </motion.div>
        )}
        {phase === 'candidate_answering' && !engagement.calibrating && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex items-center justify-center gap-2 text-sm text-ink-500 dark:text-ink-400"
          >
            {silence.finishing ? (
              <><Loader2 className="h-4 w-4 animate-spin text-ink-400" /> Wrapping up your answer...</>
            ) : silence.speaking ? (
              <><Radio className="h-4 w-4 text-success-500" /> Listening... speak your answer naturally.</>
            ) : (
              <><Mic className="h-4 w-4 text-brand-500" /> Your turn — start speaking when ready.</>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// --- Signal card component ---
function SignalCard({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: string; hint?: string }) {
  return (
    <div className="card p-3">
      <div className="mb-1 flex items-center gap-1.5 text-ink-400">
        {icon}
        <span className="text-xs font-medium">{label}</span>
      </div>
      <p className="font-display text-base font-bold text-ink-900 dark:text-white">{value}</p>
      {hint && <p className="mt-0.5 truncate text-xs text-ink-400" title={hint}>{hint}</p>}
    </div>
  );
}

// --- AI Avatar component ---
function AiAvatar({ speaking, calibrating }: { speaking: boolean; calibrating?: boolean }) {
  return (
    <div className="relative flex items-center justify-center">
      {/* Pulsing rings */}
      <motion.div
        animate={{
          scale: speaking ? [1, 1.15, 1] : [1, 1.05, 1],
          opacity: speaking ? [0.6, 0.2, 0.6] : [0.3, 0.1, 0.3],
        }}
        transition={{
          duration: speaking ? 0.8 : 2,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
        className="absolute h-40 w-40 rounded-full bg-brand-500/20"
      />
      <motion.div
        animate={{
          scale: speaking ? [1, 1.3, 1] : [1, 1.1, 1],
          opacity: speaking ? [0.4, 0.05, 0.4] : [0.2, 0.05, 0.2],
        }}
        transition={{
          duration: speaking ? 1.2 : 3,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
        className="absolute h-48 w-48 rounded-full bg-brand-500/10"
      />

      {/* Core circle */}
      <motion.div
        animate={{
          scale: speaking ? [1, 1.06, 1] : 1,
        }}
        transition={{
          duration: speaking ? 0.4 : 0,
          repeat: speaking ? Infinity : 0,
          ease: 'easeInOut',
        }}
        className="relative flex h-28 w-28 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-accent-500 shadow-2xl shadow-brand-500/30"
      >
        {calibrating ? (
          <Loader2 className="h-8 w-8 animate-spin text-white" />
        ) : (
          /* Waveform bars */
          <div className="flex items-center gap-1">
            {[0, 1, 2, 3, 4].map((i) => (
              <motion.div
                key={i}
                animate={{
                  height: speaking
                    ? [8, 32, 8, 24, 8][i] ?? 16
                    : 4,
                }}
                transition={{
                  duration: speaking ? 0.4 : 0,
                  repeat: speaking ? Infinity : 0,
                  delay: i * 0.08,
                  ease: 'easeInOut',
                }}
                className="w-1.5 rounded-full bg-white"
                style={{ height: 4 }}
              />
            ))}
          </div>
        )}
      </motion.div>
    </div>
  );
}
