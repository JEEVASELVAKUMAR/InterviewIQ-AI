import { type ReactNode } from 'react';
import { motion } from 'framer-motion';

export function PageHeader({ title, subtitle, icon }: { title: string; subtitle?: string; icon?: ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-6 flex items-start gap-3"
    >
      {icon && (
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-500/10 text-brand-500">
          {icon}
        </div>
      )}
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-ink-900 dark:text-white">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-ink-500 dark:text-ink-400">{subtitle}</p>}
      </div>
    </motion.div>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`card p-5 ${className}`}>{children}</div>;
}

export function ScoreRing({ score, size = 120, label }: { score: number; size?: number; label?: string }) {
  const radius = (size - 12) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color = score >= 75 ? '#22c55e' : score >= 50 ? '#f59e0b' : '#ef4444';
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={8} className="stroke-ink-100 dark:stroke-ink-800" />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={8}
          stroke={color}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1, ease: 'easeOut' }}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="font-display text-2xl font-bold" style={{ color }}>
          {Math.round(score)}
        </span>
        {label && <span className="text-xs text-ink-400">{label}</span>}
      </div>
    </div>
  );
}

export function StatCard({ label, value, icon, accent = 'brand' }: { label: string; value: string | number; icon?: ReactNode; accent?: string }) {
  const accentMap: Record<string, string> = {
    brand: 'bg-brand-500/10 text-brand-500',
    accent: 'bg-accent-500/10 text-accent-500',
    success: 'bg-success-500/10 text-success-500',
    danger: 'bg-danger-500/10 text-danger-500',
  };
  return (
    <Card className="flex items-center gap-4">
      {icon && <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${accentMap[accent]}`}>{icon}</div>}
      <div>
        <p className="text-sm text-ink-500 dark:text-ink-400">{label}</p>
        <p className="font-display text-xl font-bold text-ink-900 dark:text-white">{value}</p>
      </div>
    </Card>
  );
}

export function EmptyState({ icon, title, description, action }: { icon: ReactNode; title: string; description: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-ink-200 dark:border-ink-700 py-16 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-ink-100 dark:bg-ink-800 text-ink-400">
        {icon}
      </div>
      <h3 className="font-display text-lg font-semibold text-ink-900 dark:text-white">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-ink-500 dark:text-ink-400">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function LoadingSpinner({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-ink-200 border-t-brand-500 dark:border-ink-700 dark:border-t-brand-400" />
      {label && <p className="mt-3 text-sm text-ink-500 dark:text-ink-400">{label}</p>}
    </div>
  );
}

export function SkeletonCard() {
  return (
    <div className="card p-5">
      <div className="skeleton mb-3 h-4 w-1/3" />
      <div className="skeleton mb-2 h-3 w-full" />
      <div className="skeleton h-3 w-2/3" />
    </div>
  );
}

export function Badge({ children, color = 'brand' }: { children: ReactNode; color?: 'brand' | 'success' | 'warning' | 'danger' | 'neutral' }) {
  const map = {
    brand: 'bg-brand-500/10 text-brand-600 dark:text-brand-400',
    success: 'bg-success-500/10 text-success-600 dark:text-success-400',
    warning: 'bg-warning-500/10 text-warning-600 dark:text-warning-400',
    danger: 'bg-danger-500/10 text-danger-600 dark:text-danger-400',
    neutral: 'bg-ink-100 text-ink-600 dark:bg-ink-800 dark:text-ink-300',
  };
  return <span className={`badge ${map[color]}`}>{children}</span>;
}
