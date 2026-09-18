import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { User, Mail, GraduationCap, Briefcase, Save, Calendar, Pencil, X, Tag } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { upsertProfile, getLatestResume } from '../services/database';
import { PageHeader, Card, Badge } from '../components/ui';
import type { Resume } from '../types';

export default function Profile() {
  const { user, profile, refreshProfile } = useAuth();
  const [fullName, setFullName] = useState('');
  const [college, setCollege] = useState('');
  const [branch, setBranch] = useState('');
  const [year, setYear] = useState('');
  const [skills, setSkills] = useState('');
  const [status, setStatus] = useState('');
  const [resume, setResume] = useState<Resume | null>(null);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name ?? '');
      setCollege(profile.college ?? '');
      setBranch(profile.branch ?? '');
      setYear(profile.year ?? '');
      setSkills(profile.skills?.join(', ') ?? '');
      setStatus(profile.status ?? '');
    }
  }, [profile]);

  useEffect(() => {
    if (user) getLatestResume(user.id).then(setResume);
  }, [user]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    try {
      await upsertProfile(user.id, {
        full_name: fullName,
        college,
        branch,
        year,
        skills: skills.split(',').map((s) => s.trim()).filter(Boolean),
        status: status || null,
      });
      await refreshProfile();
      setEditing(false);
      toast.success('Profile updated!');
    } catch (err: any) {
      toast.error('Failed to update profile: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    if (profile) {
      setFullName(profile.full_name ?? '');
      setCollege(profile.college ?? '');
      setBranch(profile.branch ?? '');
      setYear(profile.year ?? '');
      setSkills(profile.skills?.join(', ') ?? '');
      setStatus(profile.status ?? '');
    }
    setEditing(false);
  };

  const avatarUrl = profile?.avatar_url ?? null;

  return (
    <div>
      <PageHeader
        title="Profile"
        subtitle="Manage your personal information and preferences."
        icon={<User className="h-5 w-5" />}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Profile summary */}
        <Card className="text-center">
          <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-brand-400 to-brand-600 text-2xl font-bold text-white">
            {avatarUrl ? (
              <img src={avatarUrl} alt={fullName ?? 'User'} className="h-full w-full object-cover" referrerPolicy="no-referrer" />
            ) : (
              fullName?.[0]?.toUpperCase() ?? 'U'
            )}
          </div>
          <h3 className="font-display text-lg font-semibold text-ink-900 dark:text-white">{fullName || 'User'}</h3>
          <p className="mt-1 text-sm text-ink-400">{user?.email}</p>
          {profile && (
            <p className="mt-2 text-xs text-ink-400">
              Member since {new Date(profile.created_at).toLocaleDateString()}
            </p>
          )}
          {resume && (
            <div className="mt-4 border-t border-ink-100 dark:border-ink-800 pt-4 text-left">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-400">Resume Skills</p>
              <div className="flex flex-wrap gap-1.5">
                {resume.skills.slice(0, 10).map((s) => (
                  <Badge key={s} color="brand">{s}</Badge>
                ))}
              </div>
            </div>
          )}
        </Card>

        {/* View / Edit form */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="lg:col-span-2">
          <Card>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-display text-base font-semibold text-ink-900 dark:text-white">
                {editing ? 'Edit Profile' : 'Profile Details'}
              </h3>
              {!editing && (
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="flex items-center gap-1.5 rounded-lg bg-brand-500/10 px-3 py-1.5 text-xs font-medium text-brand-600 transition hover:bg-brand-500/20 dark:text-brand-400"
                >
                  <Pencil className="h-3.5 w-3.5" /> Edit
                </button>
              )}
            </div>

            <AnimatePresence mode="wait">
              {editing ? (
                <motion.form
                  key="edit"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onSubmit={handleSave}
                  className="space-y-4"
                >
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="label">Full Name</label>
                      <div className="relative">
                        <User className="absolute left-3 top-3 h-4 w-4 text-ink-400" />
                        <input value={fullName} onChange={(e) => setFullName(e.target.value)} className="input pl-10" placeholder="Jane Doe" />
                      </div>
                    </div>
                    <div>
                      <label className="label">Email</label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-3 h-4 w-4 text-ink-400" />
                        <input value={user?.email ?? ''} disabled className="input pl-10 opacity-60" />
                      </div>
                    </div>
                    <div>
                      <label className="label">College</label>
                      <div className="relative">
                        <GraduationCap className="absolute left-3 top-3 h-4 w-4 text-ink-400" />
                        <input value={college} onChange={(e) => setCollege(e.target.value)} className="input pl-10" placeholder="IIT Delhi" />
                      </div>
                    </div>
                    <div>
                      <label className="label">Branch</label>
                      <div className="relative">
                        <Briefcase className="absolute left-3 top-3 h-4 w-4 text-ink-400" />
                        <input value={branch} onChange={(e) => setBranch(e.target.value)} className="input pl-10" placeholder="Computer Science" />
                      </div>
                    </div>
                    <div>
                      <label className="label">Year</label>
                      <div className="relative">
                        <Calendar className="absolute left-3 top-3 h-4 w-4 text-ink-400" />
                        <select value={year} onChange={(e) => setYear(e.target.value)} className="input pl-10">
                          <option value="">Select year</option>
                          <option value="1st">1st Year</option>
                          <option value="2nd">2nd Year</option>
                          <option value="3rd">3rd Year</option>
                          <option value="4th">4th Year</option>
                          <option value="Graduated">Graduated</option>
                          <option value="N/A">N/A</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="label">Status</label>
                      <div className="relative">
                        <Tag className="absolute left-3 top-3 h-4 w-4 text-ink-400" />
                        <select value={status} onChange={(e) => setStatus(e.target.value)} className="input pl-10">
                          <option value="">Select status</option>
                          <option value="Student">Student</option>
                          <option value="Employee">Employee</option>
                          <option value="Graduate">Graduate</option>
                          <option value="Job Seeker">Job Seeker</option>
                          <option value="Other">Other</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="label">Skills (comma-separated)</label>
                      <input value={skills} onChange={(e) => setSkills(e.target.value)} className="input" placeholder="React, Python, SQL" />
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <button type="submit" disabled={saving} className="btn-primary">
                      {saving ? 'Saving...' : <><Save className="h-4 w-4" /> Save Changes</>}
                    </button>
                    <button type="button" onClick={handleCancel} className="btn-ghost">
                      <X className="h-4 w-4" /> Cancel
                    </button>
                  </div>
                </motion.form>
              ) : (
                <motion.div
                  key="view"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="grid gap-4 sm:grid-cols-2"
                >
                  <DetailField icon={<User className="h-4 w-4" />} label="Full Name" value={fullName} />
                  <DetailField icon={<Mail className="h-4 w-4" />} label="Email" value={user?.email ?? ''} />
                  <DetailField icon={<GraduationCap className="h-4 w-4" />} label="College" value={college} />
                  <DetailField icon={<Briefcase className="h-4 w-4" />} label="Branch" value={branch} />
                  <DetailField icon={<Calendar className="h-4 w-4" />} label="Year" value={year} />
                  <DetailField icon={<Tag className="h-4 w-4" />} label="Status" value={status} />
                  <div>
                    <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-400">Skills</p>
                    {profile?.skills?.length ? (
                      <div className="flex flex-wrap gap-1.5">
                        {profile.skills.map((s) => (
                          <Badge key={s} color="brand">{s}</Badge>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-ink-400">Not set</p>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}

function DetailField({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div>
      <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-400">
        {icon} {label}
      </p>
      <p className="text-sm text-ink-900 dark:text-white">{value || 'Not set'}</p>
    </div>
  );
}
