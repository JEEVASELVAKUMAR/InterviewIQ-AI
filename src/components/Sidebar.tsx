import { NavLink, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  LayoutDashboard,
  FileText,
  Target,
  MessageSquare,
  Code2,
  Map,
  Bot,
  User,
  Brain,
  Video,
  ShieldCheck,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/resume', label: 'Resume', icon: FileText },
  { to: '/skill-gap', label: 'Skill Gap', icon: Target },
  { to: '/mock-interview', label: 'Mock Interview', icon: MessageSquare },
  { to: '/coding', label: 'Coding Eval', icon: Code2 },
  { to: '/roadmap', label: 'Roadmap', icon: Map },
  // { to: '/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/chat', label: 'AI Assistant', icon: Bot },
  { to: '/profile', label: 'Profile', icon: User },
  // Phase 1: AI Voice/Video Interview
  { to: '/interview/setup', label: 'Video Interview', icon: Video },
];

const adminNavItems = [
  { to: '/admin', label: 'Admin Dashboard', icon: ShieldCheck },
];

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const location = useLocation();
  const { profile, isAdmin } = useAuth();

  return (
    <aside className="flex h-full w-64 flex-col border-r border-ink-200/60 dark:border-ink-800/60 bg-white/80 dark:bg-ink-950/80 backdrop-blur-xl">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-400 to-brand-600 text-white shadow-lg shadow-brand-500/20">
          <Brain className="h-5 w-5" />
        </div>
        <div>
          <p className="font-display text-sm font-bold text-ink-900 dark:text-white">InterviewIQ</p>
          <p className="text-xs text-brand-500">AI Platform</p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = location.pathname === item.to || location.pathname.startsWith(item.to + '/');
          return (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={onNavigate}
              className={`relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                active
                  ? 'text-brand-600 dark:text-brand-400'
                  : 'text-ink-500 hover:text-ink-900 dark:text-ink-400 dark:hover:text-white hover:bg-ink-100 dark:hover:bg-ink-800/50'
              }`}
            >
              {active && (
                <motion.div
                  layoutId="sidebar-active"
                  className="absolute inset-0 rounded-xl bg-brand-500/10"
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                />
              )}
              <Icon className="relative h-4.5 w-4.5 shrink-0" size={18} />
              <span className="relative">{item.label}</span>
            </NavLink>
          );
        })}
        {isAdmin && (
          <>
            <div className="mt-4 mb-1 px-3 text-xs font-semibold uppercase tracking-wide text-ink-300 dark:text-ink-600">
              Admin
            </div>
            {adminNavItems.map((item) => {
              const Icon = item.icon;
              const active = location.pathname === item.to;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={onNavigate}
                  className={`relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                    active
                      ? 'text-danger-600 dark:text-danger-400'
                      : 'text-ink-500 hover:text-ink-900 dark:text-ink-400 dark:hover:text-white hover:bg-ink-100 dark:hover:bg-ink-800/50'
                  }`}
                >
                  {active && (
                    <motion.div
                      layoutId="sidebar-active-admin"
                      className="absolute inset-0 rounded-xl bg-danger-500/10"
                      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                    />
                  )}
                  <Icon className="relative h-4.5 w-4.5 shrink-0" size={18} />
                  <span className="relative">{item.label}</span>
                </NavLink>
              );
            })}
          </>
        )}
      </nav>

      <div className="border-t border-ink-200/60 dark:border-ink-800/60 p-3">
        <div className="flex items-center gap-3 rounded-xl px-3 py-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-brand-400 to-brand-600 text-sm font-bold text-white">
            {profile?.full_name?.[0]?.toUpperCase() ?? 'U'}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-ink-900 dark:text-white">
              {profile?.full_name || 'User'}
            </p>
            <p className="truncate text-xs text-ink-400">Free Plan</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
