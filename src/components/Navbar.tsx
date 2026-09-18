import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Menu, Moon, Sun, LogOut } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { NotificationBell } from './NotificationBell';
import toast from 'react-hot-toast';

export function Navbar({ onMenuClick }: { onMenuClick: () => void }) {
  const { theme, toggleTheme } = useTheme();
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  const handleSignOut = async () => {
    try {
      await signOut();
      navigate('/');
    } catch {
      toast.error('Failed to sign out');
    }
  };

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-ink-200/60 dark:border-ink-800/60 bg-white/70 dark:bg-ink-950/70 backdrop-blur-xl px-4 lg:px-6">
      <button onClick={onMenuClick} className="btn-ghost lg:hidden p-2">
        <Menu className="h-5 w-5" />
      </button>

      <div className="hidden flex-1 lg:block">
        <p className="text-sm text-ink-400">Welcome back — let's ace that interview.</p>
      </div>

      <div className="flex items-center gap-2">
        <NotificationBell />
        <button onClick={toggleTheme} className="btn-ghost p-2.5" aria-label="Toggle theme">
          {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
        </button>
        <div className="relative">
          <button onClick={() => setMenuOpen((v) => !v)} className="btn-ghost p-2.5">
            <LogOut className="h-5 w-5" />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-12 w-48 rounded-xl border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-900 shadow-lg py-1">
              <button onClick={handleSignOut} className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-ink-700 dark:text-ink-200 hover:bg-ink-100 dark:hover:bg-ink-800">
                <LogOut className="h-4 w-4" /> Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
