import { Link } from 'react-router-dom';
import { Home, Brain } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-ink-50 dark:bg-ink-950 px-4 text-center">
      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-400 to-brand-600 text-white shadow-lg shadow-brand-500/20">
        <Brain className="h-8 w-8" />
      </div>
      <h1 className="font-display text-7xl font-extrabold text-brand-500">404</h1>
      <p className="mt-3 font-display text-xl font-semibold text-ink-900 dark:text-white">Page not found</p>
      <p className="mt-1 text-sm text-ink-500 dark:text-ink-400">
        The page you're looking for doesn't exist or has been moved.
      </p>
      <Link to="/" className="btn-primary mt-6">
        <Home className="h-4 w-4" /> Back to Home
      </Link>
    </div>
  );
}
