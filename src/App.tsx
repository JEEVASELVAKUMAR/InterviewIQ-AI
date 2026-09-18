import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { AppLayout } from './components/AppLayout';
import { lazy, Suspense } from 'react';
import { LoadingSpinner } from './components/ui';
import LandingPage from './pages/LandingPage';
import Login from './pages/Login';
import Signup from './pages/Signup';
import ForgotPassword from './pages/ForgotPassword';
import NotFound from './pages/NotFound';

// Lazy-load feature pages so the initial bundle stays light.
const Dashboard = lazy(() => import('./pages/Dashboard'));
const ResumeUpload = lazy(() => import('./pages/ResumeUpload'));
const SkillGap = lazy(() => import('./pages/SkillGap'));
const MockInterview = lazy(() => import('./pages/MockInterview'));
const CodingEval = lazy(() => import('./pages/CodingEval'));
const Roadmap = lazy(() => import('./pages/Roadmap'));
const Analytics = lazy(() => import('./pages/Analytics'));
const ChatAssistant = lazy(() => import('./pages/ChatAssistant'));
const Profile = lazy(() => import('./pages/Profile'));
const Admin = lazy(() => import('./pages/Admin'));
// Phase 1: AI Voice/Video Interview
const InterviewSetup = lazy(() => import('./pages/InterviewSetup'));
// Phase 2: Live AI Voice Interview
const InterviewSession = lazy(() => import('./pages/InterviewSession'));
const InterviewCompleted = lazy(() => import('./pages/InterviewCompleted'));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function FeatureFallback() {
  return (
    <div className="flex h-[60vh] items-center justify-center">
      <LoadingSpinner label="Loading..." />
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<LandingPage />} />
              <Route path="/login" element={<Login />} />
              <Route path="/signup" element={<Signup />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route
                path="/dashboard"
                element={
                  <AppLayout>
                    <Suspense fallback={<FeatureFallback />}>
                      <Dashboard />
                    </Suspense>
                  </AppLayout>
                }
              />
              <Route
                path="/resume"
                element={
                  <AppLayout>
                    <Suspense fallback={<FeatureFallback />}>
                      <ResumeUpload />
                    </Suspense>
                  </AppLayout>
                }
              />
              <Route
                path="/skill-gap"
                element={
                  <AppLayout>
                    <Suspense fallback={<FeatureFallback />}>
                      <SkillGap />
                    </Suspense>
                  </AppLayout>
                }
              />
              <Route
                path="/mock-interview"
                element={
                  <AppLayout>
                    <Suspense fallback={<FeatureFallback />}>
                      <MockInterview />
                    </Suspense>
                  </AppLayout>
                }
              />
              <Route
                path="/coding"
                element={
                  <AppLayout>
                    <Suspense fallback={<FeatureFallback />}>
                      <CodingEval />
                    </Suspense>
                  </AppLayout>
                }
              />
              <Route
                path="/roadmap"
                element={
                  <AppLayout>
                    <Suspense fallback={<FeatureFallback />}>
                      <Roadmap />
                    </Suspense>
                  </AppLayout>
                }
              />
              {/* Analytics route hidden — can be restored later
              <Route
                path="/analytics"
                element={
                  <AppLayout>
                    <Suspense fallback={<FeatureFallback />}>
                      <Analytics />
                    </Suspense>
                  </AppLayout>
                }
              /> */}
              <Route
                path="/chat"
                element={
                  <AppLayout>
                    <Suspense fallback={<FeatureFallback />}>
                      <ChatAssistant />
                    </Suspense>
                  </AppLayout>
                }
              />
              <Route
                path="/profile"
                element={
                  <AppLayout>
                    <Suspense fallback={<FeatureFallback />}>
                      <Profile />
                    </Suspense>
                  </AppLayout>
                }
              />
              <Route
                path="/admin"
                element={
                  <AppLayout>
                    <Suspense fallback={<FeatureFallback />}>
                      <Admin />
                    </Suspense>
                  </AppLayout>
                }
              />
              {/* Phase 1: AI Voice/Video Interview */}
              <Route
                path="/interview/setup"
                element={
                  <AppLayout>
                    <Suspense fallback={<FeatureFallback />}>
                      <InterviewSetup />
                    </Suspense>
                  </AppLayout>
                }
              />
              {/* Phase 2: Live AI Voice Interview */}
              <Route
                path="/interview/session/:sessionId"
                element={
                  <AppLayout>
                    <Suspense fallback={<FeatureFallback />}>
                      <InterviewSession />
                    </Suspense>
                  </AppLayout>
                }
              />
              <Route
                path="/interview/completed/:sessionId"
                element={
                  <AppLayout>
                    <Suspense fallback={<FeatureFallback />}>
                      <InterviewCompleted />
                    </Suspense>
                  </AppLayout>
                }
              />
              <Route path="*" element={<NotFound />} />
            </Routes>
            <Toaster
              position="top-right"
              toastOptions={{
                className: '!bg-white dark:!bg-ink-900 !text-ink-900 dark:!text-ink-100 !border !border-ink-200 dark:!border-ink-700',
                duration: 3500,
              }}
            />
          </BrowserRouter>
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
