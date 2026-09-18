import { useEffect, useState, useMemo } from 'react';
import {
  Users,
  GraduationCap,
  Briefcase,
  Calendar,
  Tag,
  ShieldCheck,
  Search,
  TrendingUp,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line,
} from 'recharts';
import { useAuth } from '../context/AuthContext';
import { getAllProfiles, getSignupTrend } from '../services/database';
import { PageHeader, Card, StatCard, Badge, LoadingSpinner } from '../components/ui';
import type { AdminProfile } from '../types';

type DemographicBucket = { name: string; count: number };

export default function Admin() {
  const { isAdmin } = useAuth();
  const [profiles, setProfiles] = useState<AdminProfile[]>([]);
  const [trend, setTrend] = useState<{ date: string; count: number }[]>([]);
  const [loading, setLoading] = useState(true);

  // Filter state
  const [search, setSearch] = useState('');
  const [collegeFilter, setCollegeFilter] = useState('');
  const [branchFilter, setBranchFilter] = useState('');
  const [yearFilter, setYearFilter] = useState('');

  useEffect(() => {
    Promise.all([getAllProfiles(), getSignupTrend()])
      .then(([p, t]) => {
        setProfiles(p);
        setTrend(t);
      })
      .catch((err) => console.error('Admin load error:', err.message))
      .finally(() => setLoading(false));
  }, []);

  // Derive unique values for filter dropdowns
  const colleges = useMemo(() => {
    const set = new Set<string>();
    profiles.forEach((p) => { if (p.college) set.add(p.college); });
    return Array.from(set).sort();
  }, [profiles]);

  const branches = useMemo(() => {
    const set = new Set<string>();
    profiles.forEach((p) => { if (p.branch) set.add(p.branch); });
    return Array.from(set).sort();
  }, [profiles]);

  const years = useMemo(() => {
    const set = new Set<string>();
    profiles.forEach((p) => { if (p.year) set.add(p.year); });
    return Array.from(set).sort();
  }, [profiles]);

  // Aggregations
  const byCollege = useMemo<DemographicBucket[]>(() => {
    const map = new Map<string, number>();
    profiles.forEach((p) => {
      const key = p.college || 'Not specified';
      map.set(key, (map.get(key) ?? 0) + 1);
    });
    return Array.from(map.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [profiles]);

  const byBranch = useMemo<DemographicBucket[]>(() => {
    const map = new Map<string, number>();
    profiles.forEach((p) => {
      const key = p.branch || 'Not specified';
      map.set(key, (map.get(key) ?? 0) + 1);
    });
    return Array.from(map.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [profiles]);

  const byYear = useMemo<DemographicBucket[]>(() => {
    const order = ['1st', '2nd', '3rd', '4th', 'Graduated', 'N/A'];
    const map = new Map<string, number>();
    profiles.forEach((p) => {
      const key = p.year || 'Not specified';
      map.set(key, (map.get(key) ?? 0) + 1);
    });
    return Array.from(map.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => {
        const ia = order.indexOf(a.name);
        const ib = order.indexOf(b.name);
        if (ia !== -1 && ib !== -1) return ia - ib;
        if (ia !== -1) return -1;
        if (ib !== -1) return 1;
        return a.name.localeCompare(b.name);
      });
  }, [profiles]);

  const byStatus = useMemo<DemographicBucket[]>(() => {
    const order = ['Student', 'Employee', 'Graduate', 'Job Seeker', 'Other'];
    const map = new Map<string, number>();
    profiles.forEach((p) => {
      const key = p.status || 'Not specified';
      map.set(key, (map.get(key) ?? 0) + 1);
    });
    return Array.from(map.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => {
        const ia = order.indexOf(a.name);
        const ib = order.indexOf(b.name);
        if (ia !== -1 && ib !== -1) return ia - ib;
        if (ia !== -1) return -1;
        if (ib !== -1) return 1;
        return a.name.localeCompare(b.name);
      });
  }, [profiles]);

  // Filtered candidate table
  const filtered = useMemo(() => {
    return profiles.filter((p) => {
      if (search) {
        const q = search.toLowerCase();
        const name = (p.full_name ?? '').toLowerCase();
        if (!name.includes(q)) return false;
      }
      if (collegeFilter && p.college !== collegeFilter) return false;
      if (branchFilter && p.branch !== branchFilter) return false;
      if (yearFilter && p.year !== yearFilter) return false;
      return true;
    });
  }, [profiles, search, collegeFilter, branchFilter, yearFilter]);

  if (!isAdmin) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="text-center">
          <ShieldCheck className="mx-auto mb-4 h-12 w-12 text-ink-300 dark:text-ink-600" />
          <h2 className="font-display text-lg font-semibold text-ink-900 dark:text-white">Access Denied</h2>
          <p className="mt-1 text-sm text-ink-500 dark:text-ink-400">You need admin privileges to view this page.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div>
        <PageHeader title="Admin Dashboard" subtitle="User demographics and platform overview." icon={<ShieldCheck className="h-5 w-5" />} />
        <LoadingSpinner label="Loading demographics..." />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Admin Dashboard"
        subtitle="User demographics and platform overview."
        icon={<ShieldCheck className="h-5 w-5" />}
      />

      {/* Summary stat cards */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total Users"
          value={profiles.length}
          icon={<Users className="h-5 w-5" />}
          accent="brand"
        />
        <StatCard
          label="Colleges Represented"
          value={colleges.length}
          icon={<GraduationCap className="h-5 w-5" />}
          accent="accent"
        />
        <StatCard
          label="Branches"
          value={branches.length}
          icon={<Briefcase className="h-5 w-5" />}
          accent="success"
        />
        <StatCard
          label="Signups (last 7 days)"
          value={trend.slice(-7).reduce((s, d) => s + d.count, 0)}
          icon={<TrendingUp className="h-5 w-5" />}
          accent="danger"
        />
      </div>

      {/* Charts: college, branch, year, status */}
      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <DemographicCard title="Users by College" icon={<GraduationCap className="h-4 w-4" />} data={byCollege} />
        <DemographicCard title="Users by Branch" icon={<Briefcase className="h-4 w-4" />} data={byBranch} />
        <DemographicCard title="Users by Year" icon={<Calendar className="h-4 w-4" />} data={byYear} />
        <DemographicCard title="Users by Status" icon={<Tag className="h-4 w-4" />} data={byStatus} />
      </div>

      {/* Signup trend line chart */}
      {trend.length > 0 && (
        <Card className="mb-6">
          <h3 className="mb-4 flex items-center gap-2 font-display text-base font-semibold text-ink-900 dark:text-white">
            <TrendingUp className="h-4 w-4 text-brand-500" /> Signup Trend
          </h3>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={trend}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-ink-100 dark:stroke-ink-800" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11 }}
                className="fill-ink-400"
                tickFormatter={(v: string) => v.slice(5)}
              />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} className="fill-ink-400" />
              <Tooltip
                contentStyle={{
                  background: 'var(--card-bg, #fff)',
                  border: '1px solid var(--border, #e5e7eb)',
                  borderRadius: 8,
                  fontSize: 12,
                }}
              />
              <Line type="monotone" dataKey="count" stroke="#6366f1" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* Filterable candidate table */}
      <Card>
        <h3 className="mb-4 flex items-center gap-2 font-display text-base font-semibold text-ink-900 dark:text-white">
          <Users className="h-4 w-4 text-brand-500" /> Candidate Directory
          <Badge color="neutral">{filtered.length}</Badge>
        </h3>

        {/* Filters */}
        <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-ink-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input pl-10"
              placeholder="Search by name..."
            />
          </div>
          <select value={collegeFilter} onChange={(e) => setCollegeFilter(e.target.value)} className="input">
            <option value="">All colleges</option>
            {colleges.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)} className="input">
            <option value="">All branches</option>
            {branches.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
          <select value={yearFilter} onChange={(e) => setYearFilter(e.target.value)} className="input">
            <option value="">All years</option>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink-100 dark:border-ink-800 text-left text-xs font-semibold uppercase tracking-wide text-ink-400">
                <th className="pb-3 pr-4">Name</th>
                <th className="pb-3 pr-4">College</th>
                <th className="pb-3 pr-4">Branch</th>
                <th className="pb-3 pr-4">Year</th>
                <th className="pb-3 pr-4">Status</th>
                <th className="pb-3 pr-4">Skills</th>
                <th className="pb-3">Joined</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-ink-400">No users match these filters.</td>
                </tr>
              ) : (
                filtered.map((p) => (
                  <tr key={p.id} className="border-b border-ink-50 dark:border-ink-800/50 last:border-0">
                    <td className="py-3 pr-4 font-medium text-ink-900 dark:text-white">
                      {p.full_name || 'Unknown'}
                    </td>
                    <td className="py-3 pr-4 text-ink-600 dark:text-ink-300">{p.college || '—'}</td>
                    <td className="py-3 pr-4 text-ink-600 dark:text-ink-300">{p.branch || '—'}</td>
                    <td className="py-3 pr-4 text-ink-600 dark:text-ink-300">{p.year || '—'}</td>
                    <td className="py-3 pr-4">
                      {p.status ? <Badge color="brand">{p.status}</Badge> : <span className="text-ink-400">—</span>}
                    </td>
                    <td className="py-3 pr-4">
                      <div className="flex flex-wrap gap-1">
                        {(p.skills ?? []).slice(0, 3).map((s) => (
                          <span key={s} className="rounded bg-ink-100 dark:bg-ink-800 px-1.5 py-0.5 text-xs text-ink-600 dark:text-ink-300">{s}</span>
                        ))}
                        {(p.skills ?? []).length > 3 && (
                          <span className="text-xs text-ink-400">+{p.skills.length - 3}</span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 text-ink-400 text-xs">
                      {new Date(p.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function DemographicCard({ title, icon, data }: { title: string; icon: React.ReactNode; data: DemographicBucket[] }) {
  return (
    <Card>
      <h3 className="mb-4 flex items-center gap-2 font-display text-base font-semibold text-ink-900 dark:text-white">
        <span className="text-brand-500">{icon}</span> {title}
      </h3>
      {data.length === 0 ? (
        <p className="py-6 text-center text-sm text-ink-400">No data yet.</p>
      ) : (
        <ResponsiveContainer width="100%" height={Math.max(180, data.length * 36)}>
          <BarChart data={data} layout="vertical" margin={{ left: 10, right: 20 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-ink-100 dark:stroke-ink-800" />
            <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} className="fill-ink-400" />
            <YAxis
              type="category"
              dataKey="name"
              tick={{ fontSize: 11 }}
              className="fill-ink-400"
              width={120}
            />
            <Tooltip
              contentStyle={{
                background: 'var(--card-bg, #fff)',
                border: '1px solid var(--border, #e5e7eb)',
                borderRadius: 8,
                fontSize: 12,
              }}
            />
            <Bar dataKey="count" fill="#6366f1" radius={[0, 4, 4, 0]} barSize={20} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </Card>
  );
}
