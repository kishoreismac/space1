import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Campaign, Company } from '@space/shared';
import { api } from '../../lib/api';
import { useAuth } from '../../stores/auth';

interface CompaniesResponse { items: Company[]; }
interface CampaignsResponse { items: Campaign[]; }

type AIFit = 'STRONG_FIT' | 'CANDIDATE' | 'INVESTIGATE' | 'NOT_FIT';
type Severity = 'P1' | 'P2' | 'P3' | 'P4';

interface ReportDimension {
  code: 'S' | 'P' | 'A' | 'C' | 'E';
  name: string;
  averageScore: number | null;
  band: string;
  priority: string;
  previousAverage: number | null;
  trendDelta: number | null;
  trendOverridden: boolean;
}

interface ReportTheme {
  id: string;
  themeName: string;
  status: string;
  sourceType: string | null;
  respondentCount: number;
  percentage: number;
  jtbdStatement: string | null;
  representativeQuote: string | null;
}

interface ReportFrictionStep {
  stepName: string;
  rootCause: string | null;
  jtbdStatement: string | null;
  dotVotes: number;
  quote: string | null;
}

interface ReportBlocker {
  blockerId: string;
  title: string;
  severity: Severity;
  sdlcPhase: string | null;
  dimensionCode: string | null;
  reachPercentage: number | null;
  estimatedHoursLost: number | null;
  evidenceSummary: string | null;
  signalCount: number;
  aiFit: AIFit;
  status: string;
  feasibilityScore: number;
  feasibilityClass: AIFit | null;
  impactScore: number;
  priorityScore: number;
}

interface Report {
  generatedAt: string;
  company: { id: string; name: string };
  campaign: {
    id: string;
    title: string;
    status: string;
    startDate: string | null;
    endDate: string | null;
    questionnaire: { id: string; title: string; version: string };
  };
  participation: {
    respondentCount: number;
    inviteCount: number;
    completedInvites: number;
    responseRate: number | null;
  };
  space: {
    dimensions: ReportDimension[];
    psychSafetyAverage: number | null;
    psychSafetyGate: 'OK' | 'BLOCKED' | 'NA';
    alerts: Array<{ id: string; severity: string; title: string; detail: string }>;
  };
  themes: ReportTheme[];
  journey: {
    sessionCount: number;
    stepCount: number;
    frictionCounts: { RED: number; YELLOW: number; GREEN: number };
    topFrictionSteps: ReportFrictionStep[];
  };
  blockers: ReportBlocker[];
  roadmap: {
    now: ReportBlocker[];
    next: ReportBlocker[];
    later: ReportBlocker[];
    excluded: ReportBlocker[];
    summary: { total: number; scored: number; unscored: number };
  };
  recommendations: {
    now: ReportBlocker[];
    next: ReportBlocker[];
    later: ReportBlocker[];
  };
}

const PRIORITY_COLOR: Record<string, string> = {
  P1: 'bg-rose-100 text-rose-700 border-rose-300',
  P2: 'bg-amber-100 text-amber-800 border-amber-300',
  P3: 'bg-sky-100 text-sky-700 border-sky-300',
  MONITOR: 'bg-emerald-100 text-emerald-700 border-emerald-300',
};
const FIT_COLOR: Record<AIFit, string> = {
  STRONG_FIT: 'bg-emerald-100 text-emerald-700 border-emerald-300',
  CANDIDATE: 'bg-sky-100 text-sky-700 border-sky-300',
  INVESTIGATE: 'bg-amber-100 text-amber-800 border-amber-300',
  NOT_FIT: 'bg-rose-100 text-rose-700 border-rose-300',
};

export default function ReportPage() {
  const role = useAuth((s) => s.user?.role);
  const userCompanyId = useAuth((s) => s.user?.companyId ?? null);
  const [companyId, setCompanyId] = useState<string | null>(userCompanyId);
  const [campaignId, setCampaignId] = useState<string | null>(null);

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

  return (
    <div className="space-y-6">
      <header className="print:hidden">
        <h1 className="text-xl font-semibold">Phase 6 — Executive Report</h1>
        <p className="text-sm text-slate-500">
          Consolidated view of every phase. Use <strong>Print</strong> (Ctrl/Cmd+P) and choose
          <em> Save as PDF</em> for distribution.
        </p>
      </header>

      <div className="bg-white rounded-lg border border-slate-200 p-4 flex flex-wrap gap-3 items-end print:hidden">
        {role === 'SUPER_ADMIN' && (
          <label className="text-sm">
            <span className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-1">
              Company
            </span>
            <select
              value={companyId ?? ''}
              onChange={(e) => {
                setCompanyId(e.target.value || null);
                setCampaignId(null);
              }}
              className="border border-slate-300 rounded px-2 py-1.5 text-sm"
            >
              <option value="">—</option>
              {companies.data?.items.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </label>
        )}
        <label className="text-sm">
          <span className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-1">
            Campaign
          </span>
          <select
            value={campaignId ?? ''}
            onChange={(e) => setCampaignId(e.target.value || null)}
            disabled={!companyId}
            className="border border-slate-300 rounded px-2 py-1.5 text-sm min-w-[240px]"
          >
            <option value="">—</option>
            {campaigns.data?.items.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title} ({c.status})
              </option>
            ))}
          </select>
        </label>
      </div>

      {companyId && campaignId ? (
        <ReportView companyId={companyId} campaignId={campaignId} />
      ) : (
        <div className="bg-white rounded-lg border border-slate-200 p-8 text-center text-sm text-slate-500">
          Pick a campaign to generate the report.
        </div>
      )}
    </div>
  );
}

function ReportView({ companyId, campaignId }: { companyId: string; campaignId: string }) {
  const report = useQuery({
    queryKey: ['report', campaignId],
    queryFn: () =>
      api<Report>(`/api/companies/${companyId}/campaigns/${campaignId}/report`),
  });

  if (report.isLoading) return <div className="text-sm text-slate-500">Generating report…</div>;
  if (report.error) return <div className="text-sm text-rose-600">{String(report.error)}</div>;
  if (!report.data) return null;

  const r = report.data;
  const downloadJson = () => {
    const blob = new Blob([JSON.stringify(r, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `space-report-${r.campaign.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const csvBase = `/api/companies/${companyId}/campaigns/${campaignId}/export`;
  const downloadCsv = async (name: 'answers' | 'blockers' | 'themes') => {
    const token = useAuth.getState().accessToken;
    const res = await fetch(`${csvBase}/${name}.csv`, {
      headers: token ? { authorization: `Bearer ${token}` } : undefined,
    });
    if (!res.ok) {
      alert(`Failed to download ${name}.csv (${res.status})`);
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `campaign-${campaignId}-${name}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <div className="flex flex-wrap gap-2 print:hidden">
        <button
          onClick={() => window.print()}
          className="text-sm px-4 py-1.5 rounded bg-slate-900 text-white hover:bg-slate-800"
        >
          Print / Save as PDF
        </button>
        <button
          onClick={downloadJson}
          className="text-sm px-4 py-1.5 rounded border border-slate-300 hover:bg-slate-50"
        >
          Download JSON
        </button>
        <button
          onClick={() => downloadCsv('answers')}
          className="text-sm px-4 py-1.5 rounded border border-slate-300 hover:bg-slate-50"
        >
          Answers CSV
        </button>
        <button
          onClick={() => downloadCsv('blockers')}
          className="text-sm px-4 py-1.5 rounded border border-slate-300 hover:bg-slate-50"
        >
          Blockers CSV
        </button>
        <button
          onClick={() => downloadCsv('themes')}
          className="text-sm px-4 py-1.5 rounded border border-slate-300 hover:bg-slate-50"
        >
          Themes CSV
        </button>
      </div>

      <article className="report bg-white border border-slate-200 rounded-lg p-8 space-y-8 print:border-0 print:rounded-none print:p-0">
        <ReportHeader r={r} />
        <ParticipationSection r={r} />
        <SpaceSection r={r} />
        <ThemesSection r={r} />
        <JourneySection r={r} />
        <BlockersSection r={r} />
        <RoadmapSection r={r} />
        <RecommendationsSection r={r} />
        <footer className="text-xs text-slate-400 border-t border-slate-200 pt-3">
          SPACE Developer Productivity Report · Generated {new Date(r.generatedAt).toLocaleString()}
        </footer>
      </article>
    </>
  );
}

function ReportHeader({ r }: { r: Report }) {
  return (
    <header className="border-b border-slate-200 pb-4">
      <div className="text-xs uppercase tracking-wide text-slate-500">SPACE Assessment</div>
      <h2 className="text-2xl font-bold">{r.campaign.title}</h2>
      <div className="text-sm text-slate-600 mt-1">
        {r.company.name} · {r.campaign.questionnaire.title} v{r.campaign.questionnaire.version}
        {r.campaign.startDate &&
          ` · ${new Date(r.campaign.startDate).toLocaleDateString()}`}
        {r.campaign.endDate && ` → ${new Date(r.campaign.endDate).toLocaleDateString()}`}
      </div>
    </header>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 break-inside-avoid">
      <h3 className="text-base font-semibold text-slate-800 border-b border-slate-200 pb-1">
        {title}
      </h3>
      {children}
    </section>
  );
}

function ParticipationSection({ r }: { r: Report }) {
  const p = r.participation;
  return (
    <Section title="Participation">
      <div className="grid grid-cols-4 gap-3">
        <Stat label="Respondents" value={p.respondentCount} />
        <Stat label="Invites" value={p.inviteCount} />
        <Stat label="Completed" value={p.completedInvites} />
        <Stat label="Response rate" value={p.responseRate !== null ? `${p.responseRate}%` : '—'} />
      </div>
    </Section>
  );
}

function SpaceSection({ r }: { r: Report }) {
  return (
    <Section title="SPACE Dimensions">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="text-left text-xs uppercase text-slate-500">
            <th className="py-1 pr-3">Dimension</th>
            <th className="py-1 pr-3">Avg</th>
            <th className="py-1 pr-3">Band</th>
            <th className="py-1 pr-3">Priority</th>
            <th className="py-1 pr-3">Δ vs prior</th>
          </tr>
        </thead>
        <tbody>
          {r.space.dimensions.map((d) => (
            <tr key={d.code} className="border-t border-slate-100">
              <td className="py-1.5 pr-3 font-medium">{d.code} · {d.name}</td>
              <td className="py-1.5 pr-3">{d.averageScore ?? '—'}</td>
              <td className="py-1.5 pr-3">{d.band}</td>
              <td className="py-1.5 pr-3">
                <span
                  className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${PRIORITY_COLOR[d.priority] ?? 'border-slate-300'}`}
                >
                  {d.priority}{d.trendOverridden ? ' ↑' : ''}
                </span>
              </td>
              <td className="py-1.5 pr-3">
                {d.trendDelta === null
                  ? '—'
                  : d.trendDelta > 0
                    ? <span className="text-emerald-700">+{d.trendDelta}</span>
                    : d.trendDelta < 0
                      ? <span className="text-rose-700">{d.trendDelta}</span>
                      : <span className="text-slate-500">0</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="text-xs text-slate-600">
        Psychological safety:{' '}
        <strong>{r.space.psychSafetyAverage ?? '—'}</strong> →{' '}
        <span
          className={
            r.space.psychSafetyGate === 'OK'
              ? 'text-emerald-700'
              : r.space.psychSafetyGate === 'BLOCKED'
                ? 'text-rose-700 font-semibold'
                : 'text-slate-500'
          }
        >
          {r.space.psychSafetyGate}
        </span>
      </div>

      {r.space.alerts.length > 0 && (
        <div>
          <div className="text-xs uppercase text-slate-500 mb-1">Cross-pattern alerts</div>
          <ul className="space-y-1 text-sm">
            {r.space.alerts.map((a) => (
              <li key={a.id} className="border-l-2 border-amber-400 pl-2">
                <strong>{a.title}</strong> — <span className="text-slate-600">{a.detail}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Section>
  );
}

function ThemesSection({ r }: { r: Report }) {
  if (r.themes.length === 0) return null;
  return (
    <Section title={`Phase 2 themes (${r.themes.length})`}>
      <ul className="space-y-2 text-sm">
        {r.themes.map((t) => (
          <li key={t.id} className="border-l-2 border-slate-300 pl-3">
            <div className="font-medium">
              {t.themeName}{' '}
              <span className="text-xs text-slate-500">
                · {t.status} · {t.sourceType ?? 'Source not set'} · {t.respondentCount} ({t.percentage}%)
              </span>
            </div>
            {t.jtbdStatement && (
              <div className="text-slate-700 italic">{t.jtbdStatement}</div>
            )}
            {t.representativeQuote && (
              <div className="text-slate-500 text-xs mt-0.5">“{t.representativeQuote}”</div>
            )}
          </li>
        ))}
      </ul>
    </Section>
  );
}

function JourneySection({ r }: { r: Report }) {
  if (r.journey.sessionCount === 0) return null;
  const f = r.journey.frictionCounts;
  return (
    <Section title="Journey mapping">
      <div className="grid grid-cols-4 gap-3">
        <Stat label="Sessions" value={r.journey.sessionCount} />
        <Stat label="Steps" value={r.journey.stepCount} />
        <Stat label="🔴 Red" value={f.RED} />
        <Stat label="🟡 Yellow" value={f.YELLOW} />
      </div>
      {r.journey.topFrictionSteps.length > 0 && (
        <div>
          <div className="text-xs uppercase text-slate-500 mb-1">Top friction steps</div>
          <ul className="space-y-1 text-sm">
            {r.journey.topFrictionSteps.map((s, i) => (
              <li key={i} className="border-l-2 border-rose-400 pl-3">
                <strong>{s.stepName}</strong>{' '}
                <span className="text-xs text-slate-500">· {s.dotVotes} votes</span>
                {s.rootCause && (
                  <div className="text-slate-700">Root cause: {s.rootCause}</div>
                )}
                {s.jtbdStatement && (
                  <div className="text-slate-700 italic">{s.jtbdStatement}</div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Section>
  );
}

function BlockersSection({ r }: { r: Report }) {
  if (r.blockers.length === 0) return null;
  return (
    <Section title={`Blockers (${r.blockers.length})`}>
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="text-left text-xs uppercase text-slate-500">
            <th className="py-1 pr-3">Sev</th>
            <th className="py-1 pr-3">Title</th>
            <th className="py-1 pr-3">SDLC</th>
            <th className="py-1 pr-3">Reach</th>
            <th className="py-1 pr-3">Hrs/wk</th>
            <th className="py-1 pr-3">AI fit</th>
          </tr>
        </thead>
        <tbody>
          {r.blockers.map((b) => (
            <tr key={b.blockerId} className="border-t border-slate-100">
              <td className="py-1.5 pr-3">
                <span
                  className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${PRIORITY_COLOR[b.severity] ?? 'border-slate-300'}`}
                >
                  {b.severity}
                </span>
              </td>
              <td className="py-1.5 pr-3">{b.title}</td>
              <td className="py-1.5 pr-3 text-slate-600">{b.sdlcPhase ?? '—'}</td>
              <td className="py-1.5 pr-3">{b.reachPercentage ?? '—'}%</td>
              <td className="py-1.5 pr-3">{b.estimatedHoursLost ?? '—'}</td>
              <td className="py-1.5 pr-3">
                {b.feasibilityClass ? (
                  <span
                    className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${FIT_COLOR[b.feasibilityClass]}`}
                  >
                    {b.feasibilityClass.replace('_', ' ')} · {b.feasibilityScore.toFixed(2)}
                  </span>
                ) : (
                  <span className="text-xs text-slate-400">unscored</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Section>
  );
}

function RoadmapSection({ r }: { r: Report }) {
  return (
    <Section title="Roadmap">
      <div className="text-xs text-slate-500 mb-2">
        {r.roadmap.summary.scored}/{r.roadmap.summary.total} blockers scored ·{' '}
        {r.roadmap.summary.unscored} pending
      </div>
      <div className="grid grid-cols-3 gap-3 text-sm">
        <RoadmapCol title="Now" rows={r.roadmap.now} />
        <RoadmapCol title="Next" rows={r.roadmap.next} />
        <RoadmapCol title="Later" rows={r.roadmap.later} />
      </div>
    </Section>
  );
}

function RoadmapCol({ title, rows }: { title: string; rows: ReportBlocker[] }) {
  return (
    <div>
      <div className="text-xs uppercase font-semibold text-slate-600 mb-1">
        {title} ({rows.length})
      </div>
      <ul className="space-y-1">
        {rows.length === 0 && <li className="text-xs text-slate-400 italic">— empty —</li>}
        {rows.map((b) => (
          <li key={b.blockerId} className="border-l-2 border-slate-300 pl-2">
            <div className="font-medium">{b.title}</div>
            <div className="text-[11px] text-slate-500">
              prio {b.priorityScore} · impact {b.impactScore} · feas{' '}
              {b.feasibilityScore.toFixed(2)}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function RecommendationsSection({ r }: { r: Report }) {
  const all = [
    ...r.recommendations.now.map((x) => ({ bucket: 'Now', b: x })),
    ...r.recommendations.next.map((x) => ({ bucket: 'Next', b: x })),
  ];
  if (all.length === 0) return null;
  return (
    <Section title="Top recommendations">
      <ol className="list-decimal list-inside space-y-1 text-sm">
        {all.map(({ bucket, b }, i) => (
          <li key={`${b.blockerId}-${i}`}>
            <strong>[{bucket}]</strong> {b.title}{' '}
            <span className="text-xs text-slate-500">
              (priority {b.priorityScore}, {b.severity}
              {b.feasibilityClass && `, ${b.feasibilityClass.replace('_', ' ')}`})
            </span>
          </li>
        ))}
      </ol>
    </Section>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="border border-slate-200 rounded p-3 text-center">
      <div className="text-lg font-semibold">{value}</div>
      <div className="text-[11px] uppercase tracking-wide text-slate-500 mt-0.5">{label}</div>
    </div>
  );
}
