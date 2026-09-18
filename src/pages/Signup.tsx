import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { GraduationCap, Briefcase, Calendar, X, ArrowRight, ArrowLeft, Plus } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { AuthShell, GoogleButton } from './Login';

const YEAR_OPTIONS = ['1st', '2nd', '3rd', '4th', 'Graduated', 'N/A'];
const STATUS_OPTIONS = ['Student', 'Employee', 'Graduate', 'Job Seeker', 'Other'];

export default function Signup() {
  const { signUp, signInWithGoogle } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);

  // Step 1 fields
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Step 2 fields
  const [college, setCollege] = useState('');
  const [branch, setBranch] = useState('');
  const [year, setYear] = useState('');
  const [status, setStatus] = useState('');
  const [skillInput, setSkillInput] = useState('');
  const [skills, setSkills] = useState<string[]>([]);

  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const addSkill = () => {
    const trimmed = skillInput.trim();
    if (trimmed && !skills.includes(trimmed)) {
      setSkills([...skills, trimmed]);
    }
    setSkillInput('');
  };

  const removeSkill = (s: string) => setSkills(skills.filter((sk) => sk !== s));

  const handleSkillKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addSkill();
    }
  };

  const handleStep1Submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }
    setStep(2);
  };

  const handleFinalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!branch.trim()) {
      toast.error('Branch is required');
      return;
    }
    if (!year) {
      toast.error('Year is required');
      return;
    }
    if (!status) {
      toast.error('Status is required');
      return;
    }
    setLoading(true);
    try {
      await signUp({
        fullName,
        email,
        password,
        college: college.trim() || undefined,
        branch: branch.trim(),
        year,
        skills,
        status,
      });
      toast.success('Account created! Welcome to InterviewIQ AI.');
      navigate('/dashboard');
    } catch (err: any) {
      toast.error(err.message || 'Signup failed');
      setStep(1);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setGoogleLoading(true);
    try {
      await signInWithGoogle();
    } catch (err: any) {
      toast.error(err.message || 'Google sign-in failed');
      setGoogleLoading(false);
    }
  };

  return (
    <AuthShell title="Create your account" subtitle="Start your AI-powered interview preparation today.">
      <GoogleButton onClick={handleGoogle} loading={googleLoading} label="Continue with Google" />
      <div className="my-5 flex items-center gap-3 text-xs text-ink-400">
        <div className="h-px flex-1 bg-ink-200 dark:bg-ink-700" />
        or
        <div className="h-px flex-1 bg-ink-200 dark:bg-ink-700" />
      </div>

      {/* Step indicator */}
      <div className="mb-6 flex items-center gap-2">
        {[1, 2].map((s) => (
          <div
            key={s}
            className={`h-1.5 flex-1 rounded-full transition-colors ${
              s <= step ? 'bg-brand-500' : 'bg-ink-200 dark:bg-ink-700'
            }`}
          />
        ))}
      </div>

      <AnimatePresence mode="wait">
        {step === 1 ? (
          <motion.form
            key="step1"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            onSubmit={handleStep1Submit}
            className="space-y-4"
          >
            <div>
              <label className="label">Full Name</label>
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="input"
                placeholder="Jane Doe"
              />
            </div>
            <div>
              <label className="label">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input"
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label className="label">Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input"
                placeholder="At least 6 characters"
              />
            </div>
            <button type="submit" className="btn-primary w-full py-3 flex items-center justify-center gap-2">
              Continue <ArrowRight className="h-4 w-4" />
            </button>
          </motion.form>
        ) : (
          <motion.form
            key="step2"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            onSubmit={handleFinalSubmit}
            className="space-y-4"
          >
            <div>
              <label className="label">College / Institution <span className="text-ink-400 font-normal">(optional)</span></label>
              <div className="relative">
                <GraduationCap className="absolute left-3 top-3 h-4 w-4 text-ink-400" />
                <input
                  value={college}
                  onChange={(e) => setCollege(e.target.value)}
                  className="input pl-10"
                  placeholder="IIT Delhi"
                />
              </div>
            </div>
            <div>
              <label className="label">Branch</label>
              <div className="relative">
                <Briefcase className="absolute left-3 top-3 h-4 w-4 text-ink-400" />
                <input
                  required
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                  className="input pl-10"
                  placeholder="Computer Science"
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label">Year</label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-3 h-4 w-4 text-ink-400" />
                  <select
                    required
                    value={year}
                    onChange={(e) => setYear(e.target.value)}
                    className="input pl-10"
                  >
                    <option value="">Select year</option>
                    {YEAR_OPTIONS.map((y) => (
                      <option key={y} value={y}>{y === 'N/A' ? 'N/A' : y === 'Graduated' ? 'Graduated' : `${y} Year`}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="label">Status</label>
                <select
                  required
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="input"
                >
                  <option value="">Select status</option>
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="label">Skills <span className="text-ink-400 font-normal">(optional)</span></label>
              <div className="flex gap-2">
                <input
                  value={skillInput}
                  onChange={(e) => setSkillInput(e.target.value)}
                  onKeyDown={handleSkillKeyDown}
                  className="input flex-1"
                  placeholder="Type a skill and press Enter"
                />
                <button
                  type="button"
                  onClick={addSkill}
                  className="btn-ghost flex items-center gap-1 px-3"
                >
                  <Plus className="h-4 w-4" /> Add
                </button>
              </div>
              {skills.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {skills.map((s) => (
                    <span
                      key={s}
                      className="inline-flex items-center gap-1 rounded-lg bg-brand-500/10 px-2.5 py-1 text-xs font-medium text-brand-600 dark:text-brand-400"
                    >
                      {s}
                      <button type="button" onClick={() => removeSkill(s)} className="hover:text-brand-800 dark:hover:text-brand-200">
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="btn-ghost flex items-center gap-2"
              >
                <ArrowLeft className="h-4 w-4" /> Back
              </button>
              <button type="submit" disabled={loading} className="btn-primary flex-1 py-3">
                {loading ? 'Creating account...' : 'Create account'}
              </button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>

      <p className="mt-6 text-center text-sm text-ink-500 dark:text-ink-400">
        Already have an account?{' '}
        <Link to="/login" className="font-semibold text-brand-500 hover:text-brand-600">
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}
