import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { Company } from '@space/shared';
import { api } from '../../lib/api';
import { useAuth } from '../../stores/auth';

interface CompaniesResponse { items: Company[]; }

interface Dashboard {
  counts: {
    teams: number;
    campaigns: { active: number; draft: number; archived: number };
    invites: { total: number; completed: number };
    responseRate: number | null;
    submissions: number;
    openBlockers: number;
  };
  blockerAiFit: Record<'STRONG_FIT' | 'CANDIDATE' | 'INVESTIGATE' | 'NOT_FIT', number>;
  themes: Record<'MONITOR' | 'INVESTIGATE' | 'PROMOTE', number>;
  recentCampaigns: Array<{
    id: string;
    title: string;
    status: string;
    startDate: string | null;
    closeDate: string | null;
    createdAt: string;
  }>;
  recentBlockers: Array<{
    id: string;
    title: string;
    severity: 'P1' | 'P2' | 'P3' | 'P4';
    aiFit: 'STRONG_FIT' | 'CANDIDATE' | 'INVESTIGATE' | 'NOT_FIT';
    status: string;
    campaignId: string;
    campaignTitle: string;
  }>;
}

const SEV_COLOR: Record<string, string> = {
  P1: 'bg-rose-100 text-rose-700 border-rose-300',
  P2: 'bg-amber-100 text-amber-800 border-amber-300',
  P3: 'bg-sky-100 text-sky-700 border-sky-300',
  P4: 'bg-slate-100 text-slate-600 border-slate-300',
};
const FIT_COLOR: Record<string, string> = {
  STRONG_FIT: 'bg-emerald-100 text-emerald-700 border-emerald-300',
  CANDIDATE: 'bg-sky-100 text-sky-700 border-sky-300',
  INVESTIGATE: 'bg-amber-100 text-amber-800 border-amber-300',
  NOT_FIT: 'bg-rose-100 text-rose-700 border-rose-300',
};

export default function AdminHome() {
  const role = useAuth((s) => s.user?.role);
  const userCompanyId = useAuth((s) => s.user?.companyId ?? null);
  const [companyId, setCompanyId] = useState<string | null>(userCompanyId);

  const companies = useQuery({
    queryKey: ['companies'],
    queryFn: () => api<CompaniesResponse>('/api/companies'),
    enabled: role === 'SUPER_ADMIN' || userCompanyId === null,
  });
  useEffect(() => {
    const first = companies.data?.items[0];
    if (!companyId && first) setCompanyId(first.id);
  }, [companies.data, companyId]);

  const dashboard = useQuery({
    queryKey: ['dashboard', companyId],
    queryFn: () => api<Dashboard>(`/api/companies/${companyId}/dashboard`),
    enabled: !!companyId,
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="text-slate-600 mt-1 text-sm">
            Snapshot of campaigns, response rates, blockers and themes.
          </p>
        </div>
        {role === 'SUPER_ADMIN' && companies.data && (
          <label className="text-sm">
            <span className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-1">
              Company
            </span>
            <select
              value={companyId ?? ''}
              onChange={(e) => setCompanyId(e.target.value || null)}
              className="border border-slate-300 rounded px-2 py-1.5 text-sm min-w-[200px]"
            >
              <option value="">—</option>
              {companies.data.items.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </label>
        )}
      </div>

      {!companyId && (
        <EmptyState>
          Create a company in <Link to="/admin/setup" className="underline">Setup</Link> to get
          started.
        </EmptyState>
      )}

      {dashboard.isLoading && <div className="text-sm text-slate-500">Loading…</div>}
      {dashboard.data && <DashboardBody d={dashboard.data} />}
    </div>
  );
}

function DashboardBody({ d }: { d: Dashboard }) {
  const c = d.counts;
  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="Active campaigns" value={c.campaigns.active} sub={`${c.campaigns.draft} draft · ${c.campaigns.archived} archived`} />
        <Kpi label="Submissions" value={c.submissions} sub={`${c.invites.completed}/${c.invites.total} invites`} />
        <Kpi
          label="Response rate"
          value={c.responseRate === null ? '—' : `${c.responseRate}%`}
        />
        <Kpi label="Open blockers" value={c.openBlockers} sub={`${c.teams} teams`} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card title="Blockers by AI fit">
          <BarRow label="Strong fit" value={d.blockerAiFit.STRONG_FIT} tone="emerald" />
          <BarRow label="Candidate" value={d.blockerAiFit.CANDIDATE} tone="sky" />
          <BarRow label="Investigate" value={d.blockerAiFit.INVESTIGATE} tone="amber" />
          <BarRow label="Not fit" value={d.blockerAiFit.NOT_FIT} tone="rose" />
        </Card>
        <Card title="Themes by status">
          <BarRow label="Monitor" value={d.themes.MONITOR} tone="slate" />
          <BarRow label="Investigate" value={d.themes.INVESTIGATE} tone="amber" />
          <BarRow label="Promote" value={d.themes.PROMOTE} tone="emerald" />
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card title="Recent campaigns">
          {d.recentCampaigns.length === 0 && (
            <p className="text-sm text-slate-500">No campaigns yet.</p>
          )}
          <ul className="divide-y divide-slate-100">
            {d.recentCampaigns.map((c) => (
              <li key={c.id} className="py-2 text-sm flex items-center justify-between">
                <div>
                  <div className="font-medium">{c.title}</div>
                  <div className="text-xs text-slate-500">
                    {new Date(c.createdAt).toLocaleDateString()}
                  </div>
                </div>
                <span className="text-xs font-semibold uppercase border border-slate-300 rounded px-1.5 py-0.5">
                  {c.status}
                </span>
              </li>
            ))}
          </ul>
        </Card>

        <Card title="Top blockers">
          {d.recentBlockers.length === 0 && (
            <p className="text-sm text-slate-500">No blockers tracked yet.</p>
          )}
          <ul className="divide-y divide-slate-100">
            {d.recentBlockers.map((b) => (
              <li key={b.id} className="py-2 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-medium truncate">{b.title}</div>
                  <span className={`text-[10px] font-semibold border rounded px-1.5 py-0.5 ${SEV_COLOR[b.severity]}`}>
                    {b.severity}
                  </span>
                </div>
                <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-1.5">
                  {b.campaignTitle}
                  <span className={`text-[10px] font-semibold border rounded px-1 py-0.5 ${FIT_COLOR[b.aiFit]}`}>
                    {b.aiFit.replace('_', ' ')}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}

function Kpi({ label, value, sub }: { label: string; value: number | string; sub?: string }) {
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-4">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className="text-2xl font-semibold mt-1">{value}</div>
      {sub && <div className="text-xs text-slate-500 mt-1">{sub}</div>}
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-4">
      <h2 className="text-sm font-semibold mb-2">{title}</h2>
      {children}
    </div>
  );
}

type Tone = 'emerald' | 'sky' | 'amber' | 'rose' | 'slate';
const TONE_BG: Record<Tone, string> = {
  emerald: 'bg-emerald-500',
  sky: 'bg-sky-500',
  amber: 'bg-amber-500',
  rose: 'bg-rose-500',
  slate: 'bg-slate-400',
};

function BarRow({ label, value, tone }: { label: string; value: number; tone: Tone }) {
  const max = 20;
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div className="text-sm py-1">
      <div className="flex items-center justify-between">
        <span>{label}</span>
        <span className="font-semibold">{value}</span>
      </div>
      <div className="h-1.5 bg-slate-100 rounded mt-1 overflow-hidden">
        <div className={`${TONE_BG[tone]} h-full`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-8 text-center text-sm text-slate-500">
      {children}
    </div>
  );
}
