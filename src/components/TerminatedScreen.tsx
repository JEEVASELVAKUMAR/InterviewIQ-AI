import { motion } from 'framer-motion';
import { ShieldAlert, RotateCcw, ArrowRight } from 'lucide-react';

type Props = {
  violationType: 'tab_switch' | 'fullscreen_exit' | 'device_error';
  onRestart: () => void;
  onGoHome: () => void;
};

const VIOLATION_MESSAGES: Record<Props['violationType'], { title: string; description: string }> = {
  tab_switch: {
    title: 'Tab Switch Detected',
    description:
      'Your interview was ended because you switched away from the interview tab or minimized the window. This is treated as a proctoring violation to keep the interview fair.',
  },
  fullscreen_exit: {
    title: 'Fullscreen Exited',
    description:
      'Your interview was ended because you exited fullscreen mode. The interview must stay in fullscreen the entire time to prevent looking up answers or using outside resources.',
  },
  device_error: {
    title: 'Camera or Microphone Stopped',
    description:
      'Your camera or microphone stopped working during the interview. This could be caused by a system-level permission change or the device being disconnected. The interview cannot continue without active recording.',
  },
};

export function TerminatedScreen({ violationType, onRestart, onGoHome }: Props) {
  const msg = VIOLATION_MESSAGES[violationType];

  return (
    <div className="flex min-h-[70vh] items-center justify-center">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="mx-auto max-w-lg"
      >
        <div className="card overflow-hidden p-0">
          {/* Header band */}
          <div className="bg-danger-500/10 px-8 py-10 text-center">
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.1 }}
              className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-danger-500/15 text-danger-500"
            >
              <ShieldAlert className="h-8 w-8" />
            </motion.div>
            <h1 className="font-display text-xl font-bold text-ink-900 dark:text-white">
              {msg.title}
            </h1>
          </div>

          {/* Body */}
          <div className="px-8 py-6">
            <p className="text-sm leading-relaxed text-ink-600 dark:text-ink-300">
              {msg.description}
            </p>

            <div className="mt-5 rounded-xl bg-ink-50 dark:bg-ink-900/50 p-4">
              <p className="text-sm font-medium text-ink-700 dark:text-ink-200">
                You'll need to start a new session to try again.
              </p>
              <p className="mt-1 text-xs text-ink-500 dark:text-ink-400">
                Your progress from this session has been saved, but it cannot be resumed.
              </p>
            </div>

            <div className="mt-6 flex gap-3">
              <button onClick={onGoHome} className="btn-secondary flex-1">
                <ArrowRight className="h-4 w-4" /> Back to Dashboard
              </button>
              <button onClick={onRestart} className="btn-primary flex-1">
                <RotateCcw className="h-4 w-4" /> New Interview
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
