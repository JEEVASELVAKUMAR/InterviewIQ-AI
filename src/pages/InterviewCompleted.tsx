import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, ArrowRight, MessageSquare, Clock, ListChecks, Star } from 'lucide-react';
import toast from 'react-hot-toast';
import { getInterviewSession, getInterviewAnswers, saveInterviewFeedback, getInterviewFeedback } from '../services/database';
import type { InterviewSession as Session, InterviewAnswerRow } from '../types';

export default function InterviewCompleted() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(null);
  const [answers, setAnswers] = useState<InterviewAnswerRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Feedback form state
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [hasFeedback, setHasFeedback] = useState(false);

  useEffect(() => {
    if (!sessionId) return;
    (async () => {
      try {
        const s = await getInterviewSession(sessionId);
        setSession(s);
        const a = await getInterviewAnswers(sessionId);
        setAnswers(a);
        const existing = await getInterviewFeedback(sessionId);
        if (existing) {
          setHasFeedback(true);
          setRating(existing.rating);
          setComment(existing.comment ?? '');
        }
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    })();
  }, [sessionId]);

  const handleSubmitFeedback = async () => {
    if (rating === 0) {
      toast.error('Please select a star rating');
      return;
    }
    if (!sessionId) return;
    setSubmitting(true);
    try {
      await saveInterviewFeedback({
        session_id: sessionId,
        rating,
        comment: comment.trim() || undefined,
      });
      setHasFeedback(true);
      toast.success('Thank you for your feedback!');
    } catch (err: any) {
      toast.error('Failed to save feedback: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-ink-200 border-t-brand-500 dark:border-ink-700 dark:border-t-brand-400" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl py-8">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="card p-8 text-center"
      >
        {/* Success icon */}
        <motion.div
          initial={{ scale: 0, rotate: -180 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.1 }}
          className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-success-500/10"
        >
          <CheckCircle2 className="h-12 w-12 text-success-500" />
        </motion.div>

        {/* Heading */}
        <h1 className="font-display text-2xl font-bold text-ink-900 dark:text-white">
          Interview Completed!
        </h1>

        {/* Reassurance text */}
        <p className="mx-auto mt-3 max-w-md text-sm text-ink-500 dark:text-ink-400">
          Great job! Your responses have been saved. Take a breath — you've just completed a full
          AI-powered mock interview. Your transcript and recordings are securely stored in your account.
        </p>

        {/* Stats */}
        <div className="mt-6 flex justify-center gap-6">
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500/10 text-brand-500">
              <ListChecks className="h-5 w-5" />
            </div>
            <div className="text-left">
              <p className="font-display text-lg font-bold text-ink-900 dark:text-white">
                {answers.length}
              </p>
              <p className="text-xs text-ink-400">Questions answered</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-500/10 text-accent-500">
              <MessageSquare className="h-5 w-5" />
            </div>
            <div className="text-left">
              <p className="font-display text-lg font-bold text-ink-900 dark:text-white">
                {answers.filter((a) => a.transcript && a.transcript !== '(no speech detected)').length}
              </p>
              <p className="text-xs text-ink-400">Transcripts saved</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-success-500/10 text-success-500">
              <Clock className="h-5 w-5" />
            </div>
            <div className="text-left">
              <p className="font-display text-lg font-bold text-ink-900 dark:text-white">
                {session ? new Date(session.created_at).toLocaleDateString() : '--'}
              </p>
              <p className="text-xs text-ink-400">Date</p>
            </div>
          </div>
        </div>

        {/* Transcript preview */}
        {answers.length > 0 && (
          <div className="mt-8 space-y-3 text-left">
            <h3 className="text-sm font-semibold text-ink-700 dark:text-ink-300">
              Your Responses
            </h3>
            {answers.slice(0, 3).map((a, i) => (
              <div key={a.id} className="rounded-xl border border-ink-200 dark:border-ink-700 p-3">
                <p className="text-xs font-medium text-brand-500">Q{i + 1}</p>
                <p className="mt-1 text-sm text-ink-700 dark:text-ink-300">{a.question_text}</p>
                <p className="mt-2 text-xs text-ink-500 dark:text-ink-400 line-clamp-2">
                  {a.transcript || '(no speech detected)'}
                </p>
              </div>
            ))}
            {answers.length > 3 && (
              <p className="text-center text-xs text-ink-400">
                + {answers.length - 3} more responses saved
              </p>
            )}
          </div>
        )}

        {/* Feedback form */}
        <div className="mt-8 rounded-2xl border border-ink-200 dark:border-ink-700 bg-ink-50 dark:bg-ink-900/50 p-6 text-left">
          <h3 className="font-display text-base font-semibold text-ink-900 dark:text-white">
            How was your mock interview experience?
          </h3>
          <p className="mt-1 text-xs text-ink-500 dark:text-ink-400">
            Your feedback helps improve the AI interviewer for everyone.
          </p>

          {/* Star rating */}
          <div className="mt-4 flex items-center gap-1.5">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                disabled={hasFeedback || submitting}
                onClick={() => setRating(star)}
                onMouseEnter={() => setHoverRating(star)}
                onMouseLeave={() => setHoverRating(0)}
                className="transition-transform hover:scale-110 disabled:cursor-default"
                aria-label={`${star} star${star > 1 ? 's' : ''}`}
              >
                <Star
                  className={`h-7 w-7 ${
                    (hoverRating || rating) >= star
                      ? 'fill-amber-400 text-amber-400'
                      : 'fill-transparent text-ink-300 dark:text-ink-600'
                  }`}
                />
              </button>
            ))}
            {rating > 0 && (
              <span className="ml-2 text-sm font-medium text-ink-600 dark:text-ink-300">
                {rating === 5 ? 'Excellent' : rating === 4 ? 'Good' : rating === 3 ? 'Okay' : rating === 2 ? 'Poor' : 'Very poor'}
              </span>
            )}
          </div>

          {/* Comment */}
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            disabled={hasFeedback || submitting}
            placeholder="Share what you liked or what could be improved (optional)..."
            rows={3}
            className="input mt-4 resize-none"
          />

          {/* Submit */}
          {!hasFeedback ? (
            <button
              onClick={handleSubmitFeedback}
              disabled={submitting || rating === 0}
              className="btn-primary mt-4 w-full"
            >
              {submitting ? 'Submitting...' : 'Submit Feedback'}
            </button>
          ) : (
            <div className="mt-4 flex items-center justify-center gap-2 text-sm text-success-500">
              <CheckCircle2 className="h-4 w-4" />
              Feedback submitted — thank you!
            </div>
          )}
        </div>

        {/* Continue button */}
        <button
          onClick={() => navigate('/dashboard')}
          className="btn-primary mt-8 w-full"
        >
          Continue to Dashboard
          <ArrowRight className="h-4 w-4" />
        </button>
      </motion.div>
    </div>
  );
}
