import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Campaign, Company } from '@space/shared';
import { api } from '../../lib/api';
import { useAuth } from '../../stores/auth';
import { PhaseShell } from '../../components/PhaseShell';

interface CompaniesResponse { items: Company[]; }
interface CampaignsResponse { items: Campaign[]; }

interface DimensionResult {
  code: 'S' | 'P' | 'A' | 'C' | 'E';
  name: string;
  averageScore: number | null;
  responseCount: number;
  band: string | null;
  priority: 'P1' | 'P2' | 'P3' | 'MONITOR';
  trendOverridden: boolean;
  previousAverage: number | null;
  trendDelta: number | null;
}

interface Alert {
  code: string;
  severity: 'CRITICAL' | 'WARNING' | 'INFO';
  message: string;
}

interface OverviewResponse {
  campaignId: string;
  respondentCount: number;
  inviteCount: number;
  responseRate: number | null;
  psychSafetyAverage: number | null;
  dimensions: DimensionResult[];
  alerts: Alert[];
}

interface QuestionRow {
  questionNumber: number;
  dimensionCode: string;
  text: string;
  isReverseScored: boolean;
  blockerSignal: string | null;
  average: number | null;
  responseCount: number;
}
interface QuestionBreakdown { items: QuestionRow[]; }

interface OpenTextRow {
  questionNumber: number;
  questionText: string;
  text: string;
  roleLabel: string | null;
  teamId: string | null;
}
interface OpenTextResponse { items: OpenTextRow[]; }

const BAND_COLORS: Record<string, string> = {
  CRITICAL: 'bg-red-100 text-red-700 border-red-300',
  SIGNIFICANT: 'bg-orange-100 text-orange-700 border-orange-300',
  MODERATE: 'bg-amber-100 text-amber-800 border-amber-300',
  HEALTHY: 'bg-emerald-100 text-emerald-700 border-emerald-300',
  EXCELLENT: 'bg-teal-100 text-teal-700 border-teal-300',
};

const PRIORITY_COLORS: Record<string, string> = {
  P1: 'bg-red-600 text-white',
  P2: 'bg-amber-500 text-white',
  P3: 'bg-sky-500 text-white',
  MONITOR: 'bg-slate-300 text-slate-700',
};

const DIMENSION_ACTIONS: Record<string, Record<string, string>> = {
  S: {
    CRITICAL: 'Run a satisfaction listening tour within 2 weeks; pause non-essential roadmap.',
    SIGNIFICANT: 'Schedule 1:1 listening sessions; surface top 3 dissatisfiers per team.',
    MODERATE: 'Investigate decliners; benchmark vs healthy teams.',
    HEALTHY: 'Maintain; share what is working with adjacent teams.',
    EXCELLENT: 'Codify and replicate the practices driving high satisfaction.',
  },
  P: {
    CRITICAL: 'Audit goal clarity, scope creep, and review-cycle latency immediately.',
    SIGNIFICANT: 'Clarify ownership and acceptance criteria; cap WIP.',
    MODERATE: 'Review delivery cadence; surface hand-off friction.',
    HEALTHY: 'Maintain; experiment with stretch outcomes.',
    EXCELLENT: 'Document and share delivery operating model.',
  },
  A: {
    CRITICAL: 'Investigate burnout/over-utilisation before any new commitments.',
    SIGNIFICANT: 'Inspect WIP and meeting load; redistribute work.',
    MODERATE: 'Check whether activity is healthy or hiding heroics.',
    HEALTHY: 'Confirm activity correlates with outcomes, not toil.',
    EXCELLENT: 'Verify high activity is sustainable; rotate on-call/load.',
  },
  C: {
    CRITICAL: 'Stand up a cross-team contract-change protocol immediately.',
    SIGNIFICANT: 'Run a communication audit; clarify decision channels.',
    MODERATE: 'Tighten async update cadence and meeting hygiene.',
    HEALTHY: 'Maintain; lightweight async-first norms.',
    EXCELLENT: 'Mentor adjacent teams on collaboration patterns.',
  },
  E: {
    CRITICAL: 'Funnel investment into reproducible local dev + CI reliability.',
    SIGNIFICANT: 'Identify top 3 toil sources via journey map; staff a fix.',
    MODERATE: 'Track DORA + DevEx friction signals weekly.',
    HEALTHY: 'Maintain; invest in golden-path tooling.',
    EXCELLENT: 'Share platform investments with the wider org.',
  },
};

function crossPatternsFor(code: string, dims: DimensionResult[]): string[] {
  const get = (c: string) => dims.find((d) => d.code === c);
  const S = get('S'); const P = get('P'); const A = get('A'); const E = get('E');
  const out: string[] = [];
  const isLow = (v: number | null | undefined) => v !== null && v !== undefined && v <= 2.9;
  const isHigh = (v: number | null | undefined) => v !== null && v !== undefined && v >= 4.3;
  const isHealthy = (v: number | null | undefined) => v !== null && v !== undefined && v >= 3.5;

  if (code === 'S' && isLow(S?.averageScore) && isLow(E?.averageScore)) {
    out.push('Tooling friction is harming satisfaction (Low S + Low E)');
  }
  if (code === 'S' && isLow(S?.averageScore) && isHealthy(P?.averageScore)) {
    out.push('High delivery despite low satisfaction — heroics / attrition risk');
  }
  if (code === 'A' && isHigh(A?.averageScore) && isLow(S?.averageScore)) {
    out.push('High activity + Low S → hidden toil');
  }
  if (code === 'E' && isLow(E?.averageScore) && isLow(S?.averageScore)) {
    out.push('Efficiency drag is driving dissatisfaction');
  }
  return out;
}

export default function ResultsPage() {
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
    <PhaseShell phase="P1">
    <div className="space-y-6">

      <div className="bg-white rounded-lg border border-slate-200 p-4 flex flex-wrap gap-3 items-center">
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
        <ResultsBody companyId={companyId} campaignId={campaignId} />
      ) : (
        <div className="bg-white rounded-lg border border-slate-200 p-8 text-center text-sm text-slate-500">
          Pick a campaign to view results.
        </div>
      )}
    </div>
    </PhaseShell>
  );
}

function ResultsBody({ companyId, campaignId }: { companyId: string; campaignId: string }) {
  const qc = useQueryClient();
  const base = `/api/companies/${companyId}/campaigns/${campaignId}/results`;

  const overview = useQuery({
    queryKey: ['results', campaignId, 'overview'],
    queryFn: () => api<OverviewResponse>(base),
  });
  const breakdown = useQuery({
    queryKey: ['results', campaignId, 'questions'],
    queryFn: () => api<QuestionBreakdown>(`${base}/questions`),
  });
  const openText = useQuery({
    queryKey: ['results', campaignId, 'open-text'],
    queryFn: () => api<OpenTextResponse>(`${base}/open-text`),
  });

  const snapshot = useMutation({
    mutationFn: () => api(`${base}/snapshot`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['results', campaignId] }),
  });

  if (overview.isLoading) {
    return <div className="text-sm text-slate-500">Loading results…</div>;
  }
  if (overview.error) {
    return (
      <div className="bg-white rounded-lg border border-slate-200 p-6 text-sm text-red-600">
        {(overview.error as Error).message}
      </div>
    );
  }
  if (!overview.data) return null;
  const o = overview.data;

  if (o.respondentCount === 0) {
    return (
      <div className="bg-white rounded-lg border border-slate-200 p-8 text-center text-sm text-slate-500">
        No completed submissions yet. Generate invites and collect responses to see results.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="bg-white rounded-lg border border-slate-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-semibold">Response summary</h2>
            <p className="text-xs text-slate-500">
              {o.respondentCount} of {o.inviteCount} invited
              {o.responseRate !== null && ` (${o.responseRate}%)`}
            </p>
          </div>
          <button
            onClick={() => snapshot.mutate()}
            disabled={snapshot.isPending}
            className="text-xs px-3 py-1.5 rounded border border-slate-300 hover:bg-slate-50 disabled:opacity-50"
          >
            {snapshot.isPending ? 'Saving…' : 'Save snapshot'}
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {o.dimensions.map((d) => (
            <DimensionCard key={d.code} d={d} />
          ))}
        </div>

        {o.psychSafetyAverage !== null && (
          <div className="mt-4 text-xs text-slate-500">
            Psychological safety (Q7) average:&nbsp;
            <strong>{o.psychSafetyAverage.toFixed(2)}</strong>
            {o.psychSafetyAverage < 2.5 && (
              <span className="ml-2 text-red-600 font-semibold">⚠ below gate threshold</span>
            )}
          </div>
        )}
      </section>

      <section className="bg-white rounded-lg border border-slate-200 p-5">
        <h2 className="font-semibold mb-1">Phase 1 triage</h2>
        <p className="text-xs text-slate-500 mb-4">
          Score band, trend, drop detection, cross-pattern alert, and the immediate action this band calls for.
        </p>
        <TriageTable dims={o.dimensions} />
      </section>

      {o.alerts.length > 0 && (
        <section className="bg-white rounded-lg border border-slate-200 p-5">
          <h2 className="font-semibold mb-3">Cross-pattern alerts</h2>
          <ul className="space-y-2">
            {o.alerts.map((a) => (
              <li
                key={a.code}
                className={`border-l-4 pl-3 py-1 text-sm ${
                  a.severity === 'CRITICAL'
                    ? 'border-red-600 bg-red-50'
                    : 'border-amber-500 bg-amber-50'
                }`}
              >
                <div className="text-xs font-semibold uppercase tracking-wide">
                  {a.severity} · {a.code}
                </div>
                <div className="text-slate-700">{a.message}</div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="bg-white rounded-lg border border-slate-200 p-5">
        <h2 className="font-semibold mb-3">Question-level breakdown</h2>
        {breakdown.isLoading ? (
          <div className="text-sm text-slate-500">Loading…</div>
        ) : (
          <QuestionTable rows={breakdown.data?.items ?? []} />
        )}
      </section>

      <section className="bg-white rounded-lg border border-slate-200 p-5">
        <h2 className="font-semibold mb-3">Open-text responses</h2>
        {openText.isLoading ? (
          <div className="text-sm text-slate-500">Loading…</div>
        ) : (openText.data?.items.length ?? 0) === 0 ? (
          <div className="text-sm text-slate-500">No open-text responses yet.</div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {openText.data!.items.map((r, i) => (
              <li key={i} className="py-3 text-sm">
                <div className="text-[11px] uppercase tracking-wide text-slate-400">
                  Q{r.questionNumber} · {r.roleLabel ?? 'unattributed'}
                </div>
                <div className="text-slate-500 text-xs mb-1">{r.questionText}</div>
                <p className="text-slate-800 whitespace-pre-wrap">{r.text}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function DimensionCard({ d }: { d: DimensionResult }) {
  const bandClass = d.band ? BAND_COLORS[d.band] ?? '' : 'bg-slate-100 text-slate-500';
  return (
    <div className={`border rounded p-3 ${bandClass}`}>
      <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide">
        <span>{d.code} · {d.name}</span>
        <span className={`text-[10px] px-1.5 py-0.5 rounded ${PRIORITY_COLORS[d.priority] ?? ''}`}>
          {d.priority}
        </span>
      </div>
      <div className="mt-2 text-3xl font-semibold">
        {d.averageScore !== null ? d.averageScore.toFixed(2) : '—'}
      </div>
      <div className="text-[11px] mt-1 opacity-80">
        {d.band ?? 'no data'} · n={d.responseCount}
      </div>
      {d.trendDelta !== null && (
        <div className="mt-2 text-[11px] flex items-center gap-1">
          <span className={d.trendDelta < 0 ? 'text-red-700 font-semibold' : 'text-emerald-700'}>
            {d.trendDelta > 0 ? '▲' : d.trendDelta < 0 ? '▼' : '·'}
            {Math.abs(d.trendDelta).toFixed(2)}
          </span>
          <span className="opacity-70">vs {d.previousAverage?.toFixed(2)}</span>
          {d.trendOverridden && (
            <span className="ml-auto text-[10px] bg-red-600 text-white px-1.5 py-0.5 rounded">
              TREND →P1
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function QuestionTable({ rows }: { rows: QuestionRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase text-slate-500 border-b border-slate-200">
            <th className="py-2 pr-2">#</th>
            <th className="py-2 pr-2">Dim</th>
            <th className="py-2 pr-2">Question</th>
            <th className="py-2 pr-2 text-right">Avg</th>
            <th className="py-2 pr-2 text-right">n</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.questionNumber} className="border-b border-slate-100">
              <td className="py-1.5 pr-2 text-xs text-slate-500">Q{r.questionNumber}</td>
              <td className="py-1.5 pr-2 text-xs font-semibold">{r.dimensionCode}</td>
              <td className="py-1.5 pr-2">
                {r.text}
                {r.isReverseScored && (
                  <span className="ml-1 text-[10px] text-slate-400">[reverse]</span>
                )}
              </td>
              <td className="py-1.5 pr-2 text-right font-semibold">
                {r.average !== null ? r.average.toFixed(2) : '—'}
              </td>
              <td className="py-1.5 pr-2 text-right text-xs text-slate-500">{r.responseCount}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TriageTable({ dims }: { dims: DimensionResult[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500 border-b border-slate-200">
            <th className="py-2 pr-3">Dimension</th>
            <th className="py-2 pr-3 text-right">Score</th>
            <th className="py-2 pr-3">Band</th>
            <th className="py-2 pr-3">Priority</th>
            <th className="py-2 pr-3 text-right">Trend</th>
            <th className="py-2 pr-3 text-center">Drop &gt; 0.4?</th>
            <th className="py-2 pr-3">Cross-pattern alert</th>
            <th className="py-2 pr-3">Immediate action</th>
          </tr>
        </thead>
        <tbody>
          {dims.map((d) => {
            const dropped = d.trendDelta !== null && d.trendDelta <= -0.4;
            const patterns = crossPatternsFor(d.code, dims);
            const action =
              (d.band && DIMENSION_ACTIONS[d.code]?.[d.band]) ?? '—';
            return (
              <tr key={d.code} className="border-b border-slate-100 align-top">
                <td className="py-2 pr-3 font-semibold">
                  {d.code} · {d.name}
                </td>
                <td className="py-2 pr-3 text-right font-mono font-semibold">
                  {d.averageScore !== null ? d.averageScore.toFixed(2) : '—'}
                </td>
                <td className="py-2 pr-3">
                  {d.band && (
                    <span className={`inline-block text-[11px] px-2 py-0.5 rounded border ${BAND_COLORS[d.band] ?? ''}`}>
                      {d.band}
                    </span>
                  )}
                </td>
                <td className="py-2 pr-3">
                  <span className={`inline-block text-[11px] px-1.5 py-0.5 rounded ${PRIORITY_COLORS[d.priority] ?? ''}`}>
                    {d.priority}
                  </span>
                  {d.trendOverridden && (
                    <span className="ml-1 text-[10px] bg-red-600 text-white px-1.5 py-0.5 rounded">↑ trend</span>
                  )}
                </td>
                <td className="py-2 pr-3 text-right font-mono text-xs">
                  {d.trendDelta === null ? (
                    <span className="text-slate-400">—</span>
                  ) : (
                    <span className={d.trendDelta < 0 ? 'text-red-700 font-semibold' : 'text-emerald-700'}>
                      {d.trendDelta > 0 ? '▲ +' : d.trendDelta < 0 ? '▼ ' : '· '}
                      {d.trendDelta.toFixed(2)}
                      {d.previousAverage !== null && (
                        <span className="text-slate-400 ml-1">vs {d.previousAverage.toFixed(1)}</span>
                      )}
                    </span>
                  )}
                </td>
                <td className="py-2 pr-3 text-center">
                  {dropped ? (
                    <span className="inline-block text-[11px] px-1.5 py-0.5 rounded bg-red-600 text-white">YES</span>
                  ) : (
                    <span className="text-slate-400 text-xs">no</span>
                  )}
                </td>
                <td className="py-2 pr-3">
                  {patterns.length > 0 ? (
                    <ul className="space-y-0.5">
                      {patterns.map((p, i) => (
                        <li key={i} className="text-[11px] text-amber-700 leading-snug">
                          ⚠ {p}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <span className="text-slate-400 text-xs">—</span>
                  )}
                </td>
                <td className="py-2 pr-3 text-xs text-slate-700 leading-snug max-w-md">{action}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}


