import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { Campaign, Company } from '@space/shared';
import { api } from '../../lib/api';
import { useAuth } from '../../stores/auth';
import { useEffect, useState } from 'react';

interface CompaniesResponse { items: Company[] }
interface CampaignsResponse { items: Campaign[] }

interface DashboardResponse {
  counts: {
    teams: number;
    campaigns: { active: number; draft: number; archived: number };
    invites: { total: number; completed: number };
    responseRate: number | null;
    submissions: number;
    openBlockers: number;
  };
  blockerAiFit: Record<string, number>;
  themes: Record<string, number>;
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
    severity: string;
    aiFit: string;
    status: string;
    campaignId: string;
    campaignTitle: string;
  }>;
}

interface SubmissionsResponse {
  items: Array<{
    id: string;
    participantName: string | null;
    roleLabel: string | null;
    teamName: string | null;
    submittedAt: string | null;
    answerCount: number;
  }>;
}

interface OverviewResponse {
  respondentCount: number;
  inviteCount: number;
  responseRate: number | null;
  psychSafetyAverage: number | null;
  dimensions: Array<{
    code: string;
    name: string;
    averageScore: number | null;
    band: string | null;
  }>;
}

interface DoraMetricsResponse {
  current: Record<string, string | null>;
  updatedAt: { current: string | null; previous: string | null };
}

interface ThemesResponse {
  items: Array<{
    id: string;
    themeName: string;
    status: string;
    respondentCount: number;
    percentage: number;
  }>;
}

interface BlockersResponse {
  items: Array<{
    id: string;
    title: string;
    severity: string;
    aiFit: string;
    status: string;
  }>;
}

export default function DashboardPage() {
  const role = useAuth((s) => s.user?.role);
  const userCompanyId = useAuth((s) => s.user?.companyId ?? null);
  const [companyId, setCompanyId] = useState<string | null>(userCompanyId);
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [openSubmissionId, setOpenSubmissionId] = useState<string | null>(null);

  const companies = useQuery({
    queryKey: ['companies'],
    queryFn: () => api<CompaniesResponse>('/api/companies'),
  });
  useEffect(() => {
    const first = companies.data?.items[0];
    if (!companyId && first) setCompanyId(first.id);
  }, [companies.data, companyId]);

  const campaigns = useQuery({
    queryKey: ['campaigns', companyId],
    queryFn: () => api<CampaignsResponse>(`/api/companies/${companyId}/campaigns`),
    enabled: !!companyId,
  });
  useEffect(() => {
    const first = campaigns.data?.items[0];
    if (!campaignId && first) setCampaignId(first.id);
  }, [campaigns.data, campaignId]);

  const dash = useQuery({
    queryKey: ['dashboard', companyId],
    queryFn: () => api<DashboardResponse>(`/api/companies/${companyId}/dashboard`),
    enabled: !!companyId,
  });

  const base = companyId && campaignId
    ? `/api/companies/${companyId}/campaigns/${campaignId}`
    : null;

  const overview = useQuery({
    queryKey: ['dashboard-overview', campaignId],
    queryFn: () => api<OverviewResponse>(`${base}/results`),
    enabled: !!base,
  });
  const submissions = useQuery({
    queryKey: ['dashboard-submissions', campaignId],
    queryFn: () => api<SubmissionsResponse>(`${base}/results/submissions`),
    enabled: !!base,
  });
  const themes = useQuery({
    queryKey: ['dashboard-themes', campaignId],
    queryFn: () => api<ThemesResponse>(`${base}/themes`),
    enabled: !!base,
  });
  const dora = useQuery({
    queryKey: ['dashboard-dora', campaignId],
    queryFn: () => api<DoraMetricsResponse>(`${base}/triangulation/dora-metrics`),
    enabled: !!base,
  });
  const blockers = useQuery({
    queryKey: ['dashboard-blockers', campaignId],
    queryFn: () => api<BlockersResponse>(`${base}/triangulation/blockers`),
    enabled: !!base,
  });

  const d = dash.data;
  const o = overview.data;

  return (
    <div className="space-y-6 p-2">
      <header>
        <h1 className="text-2xl font-semibold text-slate-900">Dashboard</h1>
        <p className="text-sm text-slate-500">
          Survey program health, team analytics, and latest assessment insights.
        </p>
      </header>

      {/* Selectors */}
      <div className="bg-white rounded-lg border border-slate-200 p-4 flex flex-wrap gap-3 items-end">
        {role === 'SUPER_ADMIN' && (
          <label className="text-sm">
            <span className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-1">
              Company
            </span>
            <select
              className="border border-slate-300 rounded px-2 py-1 text-sm"
              value={companyId ?? ''}
              onChange={(e) => {
                setCompanyId(e.target.value || null);
                setCampaignId(null);
              }}
            >
              <option value="">— select —</option>
              {companies.data?.items.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="text-sm">
          <span className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-1">
            Campaign
          </span>
          <select
            className="border border-slate-300 rounded px-2 py-1 text-sm"
            value={campaignId ?? ''}
            onChange={(e) => setCampaignId(e.target.value || null)}
          >
            <option value="">— select —</option>
            {campaigns.data?.items.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Program overview */}
      <section>
        <h2 className="text-sm font-semibold text-slate-700 mb-2 uppercase tracking-wider">
          Survey program
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Metric label="Active campaigns" value={d?.counts.campaigns.active ?? '—'} />
          <Metric label="Draft + Archived" value={(d?.counts.campaigns.draft ?? 0) + (d?.counts.campaigns.archived ?? 0)} />
          <Metric label="Total invites" value={d?.counts.invites.total ?? '—'} />
          <Metric label="Responses received" value={d?.counts.submissions ?? '—'} />
          <Metric label="Completion rate" value={d?.counts.responseRate != null ? `${d.counts.responseRate}%` : '—'} />
          <Metric label="Teams" value={d?.counts.teams ?? '—'} />
          <Metric label="Open blockers" value={d?.counts.openBlockers ?? '—'} />
          <Metric
            label="Participants (latest)"
            value={submissions.data?.items.length ?? '—'}
          />
        </div>
      </section>

      {/* SPACE + DORA */}
      <div className="grid lg:grid-cols-2 gap-4">
        <section className="bg-white rounded-lg border border-slate-200 p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-3 uppercase tracking-wider">
            SPACE maturity (latest campaign)
          </h3>
          {!o ? (
            <p className="text-xs text-slate-500">Select a campaign.</p>
          ) : (
            <div className="space-y-2">
              {o.dimensions.map((dim) => (
                <div key={dim.code} className="flex items-center gap-3 text-sm">
                  <span className="font-mono w-6 text-slate-500">{dim.code}</span>
                  <span className="flex-1 text-slate-800">{dim.name}</span>
                  <span className="tabular-nums font-semibold">
                    {dim.averageScore !== null ? dim.averageScore.toFixed(2) : '—'}
                  </span>
                  <span
                    className={`text-[10px] uppercase px-1.5 py-0.5 rounded ${
                      dim.band === 'CRITICAL'
                        ? 'bg-red-100 text-red-700'
                        : dim.band === 'WARNING'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-emerald-100 text-emerald-700'
                    }`}
                  >
                    {dim.band ?? '—'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="bg-white rounded-lg border border-slate-200 p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-3 uppercase tracking-wider">
            DORA metrics
          </h3>
          {!dora.data ? (
            <p className="text-xs text-slate-500">Select a campaign.</p>
          ) : (
            <div className="grid grid-cols-2 gap-3 text-sm">
              <DoraCell label="Lead time" value={dora.data.current.leadTimeForChanges} />
              <DoraCell label="Deploy freq" value={dora.data.current.deploymentFrequency} />
              <DoraCell label="MTTR" value={dora.data.current.mttr} />
              <DoraCell label="Change fail rate" value={dora.data.current.changeFailureRate} />
            </div>
          )}
        </section>
      </div>

      {/* Themes + blockers */}
      <div className="grid lg:grid-cols-2 gap-4">
        <section className="bg-white rounded-lg border border-slate-200 p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-3 uppercase tracking-wider">
            Top themes
          </h3>
          {!themes.data || themes.data.items.length === 0 ? (
            <p className="text-xs text-slate-500">No themes yet. Run P2 auto-analyse.</p>
          ) : (
            <ul className="divide-y divide-slate-100 text-sm">
              {themes.data.items.slice(0, 6).map((t) => (
                <li key={t.id} className="py-2 flex items-center gap-3">
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                      t.status === 'PROMOTE'
                        ? 'bg-emerald-100 text-emerald-700'
                        : t.status === 'INVESTIGATE'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {t.status}
                  </span>
                  <span className="flex-1 truncate">{t.themeName}</span>
                  <span className="text-xs text-slate-500 tabular-nums">{t.percentage.toFixed(1)}%</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="bg-white rounded-lg border border-slate-200 p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-3 uppercase tracking-wider">
            Top blockers
          </h3>
          {!blockers.data || blockers.data.items.length === 0 ? (
            <p className="text-xs text-slate-500">No blockers triangulated yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100 text-sm">
              {blockers.data.items.slice(0, 6).map((b) => (
                <li key={b.id} className="py-2 flex items-center gap-3">
                  <span className="text-[10px] px-1.5 py-0.5 rounded font-mono bg-slate-100 text-slate-700">
                    {b.severity}
                  </span>
                  <span className="flex-1 truncate">{b.title}</span>
                  <span className="text-[10px] uppercase text-slate-500">{b.aiFit}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Recent participants */}
      <section className="bg-white rounded-lg border border-slate-200 p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wider">
            Latest participants
          </h3>
          {campaignId && (
            <Link to="/admin/p1" className="text-xs text-emerald-700 hover:underline">
              View triage →
            </Link>
          )}
        </div>
        {!submissions.data || submissions.data.items.length === 0 ? (
          <p className="text-xs text-slate-500">No completed submissions yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wider text-slate-500">
                  <th className="py-2 pr-4">Name</th>
                  <th className="py-2 pr-4">Team</th>
                  <th className="py-2 pr-4">Role</th>
                  <th className="py-2 pr-4">Answers</th>
                  <th className="py-2 pr-4">Submitted</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {submissions.data.items.slice(0, 10).map((s) => (
                  <tr key={s.id}>
                    <td className="py-2 pr-4 text-slate-800">{s.participantName ?? '(anonymous)'}</td>
                    <td className="py-2 pr-4 text-slate-600">{s.teamName ?? '—'}</td>
                    <td className="py-2 pr-4 text-slate-600">{s.roleLabel ?? '—'}</td>
                    <td className="py-2 pr-4 tabular-nums text-slate-600">{s.answerCount}</td>
                    <td className="py-2 pr-4 text-xs text-slate-500">
                      {s.submittedAt ? new Date(s.submittedAt).toLocaleString() : '—'}
                    </td>
                    <td className="py-2 pr-2 text-right">
                      <button
                        onClick={() =>
                          setOpenSubmissionId(openSubmissionId === s.id ? null : s.id)
                        }
                        className="text-xs text-emerald-700 hover:underline"
                      >
                        {openSubmissionId === s.id ? 'Hide' : 'View'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {openSubmissionId && base && (
              <SubmissionDetail base={base} submissionId={openSubmissionId} />
            )}
          </div>
        )}
      </section>

      {/* Recent campaigns */}
      <section className="bg-white rounded-lg border border-slate-200 p-5">
        <h3 className="text-sm font-semibold text-slate-700 mb-3 uppercase tracking-wider">
          Recent campaigns
        </h3>
        {!d || d.recentCampaigns.length === 0 ? (
          <p className="text-xs text-slate-500">No campaigns yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100 text-sm">
            {d.recentCampaigns.map((c) => (
              <li key={c.id} className="py-2 flex items-center gap-3">
                <span className="flex-1 truncate text-slate-800">{c.title}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded font-mono bg-slate-100 text-slate-700">
                  {c.status}
                </span>
                <span className="text-xs text-slate-500">
                  {c.startDate ? new Date(c.startDate).toLocaleDateString() : '—'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-4">
      <div className="text-[10px] font-mono uppercase tracking-[2px] text-slate-500">{label}</div>
      <div className="text-2xl font-semibold text-slate-900 tabular-nums">{value}</div>
    </div>
  );
}

function DoraCell({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="border border-slate-200 rounded p-3 bg-slate-50">
      <div className="text-[10px] font-mono uppercase tracking-[2px] text-slate-500 mb-1">{label}</div>
      <div className="text-sm font-semibold text-slate-800">{value ?? '—'}</div>
    </div>
  );
}

interface SubmissionDetailResponse {
  id: string;
  participantName: string | null;
  roleLabel: string | null;
  teamName: string | null;
  yearsAtCompany: string | null;
  primaryTechnology: string | null;
  submittedAt: string | null;
  answers: Array<{
    questionNumber: number;
    questionText: string;
    questionType: string;
    dimensionCode: string;
    rawValue: number | null;
    scoredValue: number | null;
    textValue: string | null;
  }>;
}

function SubmissionDetail({ base, submissionId }: { base: string; submissionId: string }) {
  const q = useQuery({
    queryKey: ['submission-detail', submissionId],
    queryFn: () =>
      api<SubmissionDetailResponse>(`${base}/results/submissions/${submissionId}`),
  });
  if (q.isLoading) return <div className="mt-3 text-xs text-slate-500">Loading response…</div>;
  if (q.error) return <div className="mt-3 text-xs text-red-600">{(q.error as Error).message}</div>;
  if (!q.data) return null;
  const s = q.data;
  return (
    <div className="mt-3 border-t border-slate-200 pt-3 bg-slate-50 rounded p-3">
      <div className="flex flex-wrap gap-4 mb-3 text-xs text-slate-600">
        <span><strong>Name:</strong> {s.participantName ?? '(anonymous)'}</span>
        <span><strong>Team:</strong> {s.teamName ?? '—'}</span>
        <span><strong>Role:</strong> {s.roleLabel ?? '—'}</span>
        <span><strong>Years:</strong> {s.yearsAtCompany ?? '—'}</span>
        <span><strong>Tech:</strong> {s.primaryTechnology ?? '—'}</span>
        <span><strong>Submitted:</strong> {s.submittedAt ? new Date(s.submittedAt).toLocaleString() : '—'}</span>
      </div>
      <table className="min-w-full text-xs">
        <thead>
          <tr className="text-left text-[10px] uppercase text-slate-500">
            <th className="py-1 pr-2">Q</th>
            <th className="py-1 pr-2">Dim</th>
            <th className="py-1 pr-2">Question</th>
            <th className="py-1 pr-2">Answer</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {s.answers.map((a) => (
            <tr key={a.questionNumber}>
              <td className="py-1 pr-2 font-mono tabular-nums">{a.questionNumber}</td>
              <td className="py-1 pr-2 font-mono">{a.dimensionCode}</td>
              <td className="py-1 pr-2">{a.questionText}</td>
              <td className="py-1 pr-2 text-slate-700">
                {a.questionType === 'OPEN_TEXT'
                  ? (a.textValue ?? '—')
                  : a.rawValue != null
                    ? `${a.rawValue}/5`
                    : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
