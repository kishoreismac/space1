import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Campaign, Company } from '@space/shared';
import { api } from '../../lib/api';
import { useAuth } from '../../stores/auth';
import { PhaseShell } from '../../components/PhaseShell';

// ─── Types from API ─────────────────────────────────────────────────────
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
  patternId?: string;
  crossPattern?: string;
  trigger?: string;
  scoreSignal?: string;
  diagnosis?: string;
  whatItMeans?: string;
  likelyRootCause?: string;
  validationEvidence?: string;
  leadershipAction?: string;
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

interface CampaignDetail extends Campaign {
  stats?: { inviteCount: number; submissionCount: number; completedInvites: number };
}

// ─── Design tokens (mirrors HTML mockup) ────────────────────────────────
const DIM_NAMES: Record<string, string> = {
  S: 'Satisfaction',
  P: 'Performance',
  A: 'Activity',
  C: 'Communication',
  E: 'Efficiency',
};

type DimTheme = { letter: string; accent: string; soft: string };
const DEFAULT_THEME: DimTheme = { letter: 'text-slate-700', accent: 'border-slate-400', soft: 'bg-slate-50' };
const DIM_THEME: Record<string, DimTheme> = {
  S: { letter: 'text-teal-700', accent: 'border-teal-500', soft: 'bg-teal-50' },
  P: { letter: 'text-violet-700', accent: 'border-violet-500', soft: 'bg-violet-50' },
  A: { letter: 'text-amber-600', accent: 'border-amber-500', soft: 'bg-amber-50' },
  C: { letter: 'text-rose-600', accent: 'border-rose-500', soft: 'bg-rose-50' },
  E: { letter: 'text-sky-700', accent: 'border-sky-500', soft: 'bg-sky-50' },
};
const themeOf = (code: string): DimTheme => DIM_THEME[code] ?? DEFAULT_THEME;

const BAND_BADGE: Record<string, string> = {
  CRITICAL: 'bg-red-600 text-white',
  SIGNIFICANT: 'bg-orange-500 text-white',
  MODERATE: 'bg-amber-400 text-amber-900',
  HEALTHY: 'bg-emerald-500 text-white',
  EXCELLENT: 'bg-teal-600 text-white',
};

const PRIORITY_BADGE: Record<string, string> = {
  P1: 'bg-red-600 text-white',
  P2: 'bg-amber-500 text-white',
  P3: 'bg-sky-500 text-white',
  MONITOR: 'bg-slate-300 text-slate-700',
};

const DIMENSION_ACTIONS: Record<string, Record<string, string>> = {
  S: {
    CRITICAL: 'Emergency: 48hr deep-dive. Journey mapping within 5 days.',
    SIGNIFICANT: 'Investigation within 2 weeks. Cross-validate with 2+ quant signals.',
    MODERATE: 'Monitor trend. Explore next cycle. Watch for further decline.',
    HEALTHY: 'Cross-validate with DORA. Watch for drift between cycles.',
    EXCELLENT: 'Benchmark and document what is working. Replicate across teams.',
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

function crossPatternsFor(dims: DimensionResult[]): Array<{ tone: 'red' | 'amber' | 'green'; message: string }> {
  const get = (c: string) => dims.find((d) => d.code === c);
  const S = get('S')?.averageScore;
  const P = get('P')?.averageScore;
  const A = get('A')?.averageScore;
  const C = get('C')?.averageScore;
  const E = get('E')?.averageScore;
  const isLow = (v: number | null | undefined): boolean => v !== null && v !== undefined && v < 2.9;
  const isHealthy = (v: number | null | undefined): boolean => v !== null && v !== undefined && v >= 3.3;
  const isHigh = (v: number | null | undefined): boolean => v !== null && v !== undefined && v >= 3.5;
  const out: Array<{ tone: 'red' | 'amber' | 'green'; message: string }> = [];
  if (isLow(S) && isLow(E)) {
    out.push({ tone: 'red', message: '🔴 Low S + Low E — Tooling is actively harming developer wellbeing. This is the highest-ROI AI intervention target in the SPACE framework. Prioritise E-dimension interventions first.' });
  }
  if (isLow(S) && isHealthy(P)) {
    out.push({ tone: 'amber', message: '🟡 Low S + Moderate/Healthy P — Unsustainable heroics pattern. Developers are delivering despite the environment, not because of it. Attrition risk not visible in output metrics.' });
  }
  if (isHigh(A) && isLow(S)) {
    out.push({ tone: 'amber', message: '🟠 High A + Low S — Hidden toil pattern. Developers are busy but not on meaningful work. Velocity reviews would celebrate this team while they burn out.' });
  }
  if (isLow(S) && isLow(C)) {
    out.push({ tone: 'red', message: '🔴 Low S + Low C — Coordination is destroying satisfaction. Handoff friction, unclear requirements, and knowledge gaps are the primary satisfaction drivers here.' });
  }
  if (!out.length) {
    out.push({ tone: 'green', message: '✓ No high-risk cross-dimension patterns detected at current score levels. Monitor trend between cycles.' });
  }
  return out;
}

// ─── Page ───────────────────────────────────────────────────────────────
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
        <div className="bg-white rounded-lg border border-slate-200 p-4 flex flex-wrap gap-3 items-end">
          {role === 'SUPER_ADMIN' && (
            <label className="text-sm">
              <span className="block text-[11px] font-mono uppercase tracking-[2px] text-slate-500 mb-1">
                Company
              </span>
              <select
                value={companyId ?? ''}
                onChange={(e) => {
                  setCompanyId(e.target.value || null);
                  setCampaignId(null);
                }}
                className="border border-slate-300 rounded px-2 py-1.5 text-sm min-w-[220px]"
              >
                <option value="">—</option>
                {companies.data?.items.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </label>
          )}
          <label className="text-sm">
            <span className="block text-[11px] font-mono uppercase tracking-[2px] text-slate-500 mb-1">
              Campaign
            </span>
            <select
              value={campaignId ?? ''}
              onChange={(e) => setCampaignId(e.target.value || null)}
              disabled={!companyId}
              className="border border-slate-300 rounded px-2 py-1.5 text-sm min-w-[260px]"
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
            Pick a campaign to view triage results.
          </div>
        )}
      </div>
    </PhaseShell>
  );
}

// ─── Body ───────────────────────────────────────────────────────────────
function ResultsBody({ companyId, campaignId }: { companyId: string; campaignId: string }) {
  const qc = useQueryClient();
  const base = `/api/companies/${companyId}/campaigns/${campaignId}/results`;

  const overview = useQuery({
    queryKey: ['results', campaignId, 'overview'],
    queryFn: () => api<OverviewResponse>(base),
  });
  const campaign = useQuery({
    queryKey: ['campaigns', companyId, campaignId, 'detail'],
    queryFn: () => api<CampaignDetail>(`/api/companies/${companyId}/campaigns/${campaignId}`),
  });
  const snapshot = useMutation({
    mutationFn: () => api(`${base}/snapshot`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['results', campaignId] }),
  });

  if (overview.isLoading || campaign.isLoading) {
    return <div className="text-sm text-slate-500">Loading results…</div>;
  }
  if (overview.error) {
    return (
      <div className="bg-white rounded-lg border border-slate-200 p-6 text-sm text-red-600">
        {(overview.error as Error).message}
      </div>
    );
  }
  if (!overview.data || !campaign.data) return null;
  const o = overview.data;
  const c = campaign.data;

  if (o.respondentCount === 0) {
    return (
      <div className="bg-white rounded-lg border border-slate-200 p-8 text-center text-sm text-slate-500">
        No completed submissions yet. Generate invites and collect responses to see results.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg border border-slate-200 px-5 py-3 flex flex-wrap gap-4 items-center justify-between">
        <div className="flex flex-wrap gap-4 items-baseline">
          <div>
            <div className="text-[10px] font-mono uppercase tracking-[3px] text-slate-500">Respondents</div>
            <div className="text-lg font-semibold text-slate-800">{o.respondentCount}<span className="text-xs font-normal text-slate-500"> / {o.inviteCount} invited</span></div>
          </div>
          {o.responseRate !== null && (
            <div>
              <div className="text-[10px] font-mono uppercase tracking-[3px] text-slate-500">Response rate</div>
              <div className="text-lg font-semibold text-slate-800">{o.responseRate}%</div>
            </div>
          )}
          {o.psychSafetyAverage !== null && (
            <div>
              <div className="text-[10px] font-mono uppercase tracking-[3px] text-slate-500">Psych safety (Q7)</div>
              <div className={`text-lg font-semibold ${o.psychSafetyAverage < 2.5 ? 'text-red-600' : 'text-slate-800'}`}>
                {o.psychSafetyAverage.toFixed(2)}
                {o.psychSafetyAverage < 2.5 && <span className="ml-2 text-[11px] font-mono">⚠ below 2.5 gate</span>}
              </div>
            </div>
          )}
        </div>
        <button
          onClick={() => snapshot.mutate()}
          disabled={snapshot.isPending}
          className="text-xs px-3 py-1.5 rounded border border-slate-300 hover:bg-slate-50 disabled:opacity-50"
        >
          {snapshot.isPending ? 'Saving…' : '💾 Save snapshot'}
        </button>
      </div>

      <ActivityBlock num="1" title="Apply Score Range Bands" subtitle="Auto-calculated from survey responses" defaultOpen>
        <ScoreCardsRow dims={o.dimensions} />
        <TriageTable dims={o.dimensions} />
        <DecisionGate />
      </ActivityBlock>

      <ActivityBlock num="2" title="Cross-Pattern Detection" subtitle="Auto-generated from dimension scores" defaultOpen>
        <CrossPatternList alerts={o.alerts} />
      </ActivityBlock>

      <ActivityBlock num="3" title="Executive Summary Template" subtitle="Send to VP Engineering same day" defaultOpen>
        <ExecSummaryForm companyId={companyId} campaignId={campaignId} campaign={c} dims={o.dimensions} />
      </ActivityBlock>
    </div>
  );
}

// ─── Activity accordion shell ───────────────────────────────────────────
function ActivityBlock({
  num, title, subtitle, defaultOpen = false, children,
}: {
  num: string; title: string; subtitle?: string; defaultOpen?: boolean; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-white rounded-lg border border-slate-300 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((s) => !s)}
        className="w-full flex items-center gap-3 px-4 py-3 bg-slate-50 hover:bg-slate-100 text-left border-b border-slate-200"
      >
        <span className="w-7 h-7 rounded-full bg-red-600 text-white font-semibold text-sm flex items-center justify-center shrink-0">
          {num}
        </span>
        <span className="font-serif text-base font-semibold text-slate-900 flex-1">{title}</span>
        {subtitle && (
          <span className="text-[11px] font-mono uppercase tracking-[2px] text-slate-500 hidden md:block">
            {subtitle}
          </span>
        )}
        <span className={`text-slate-400 text-sm transition-transform ${open ? 'rotate-180' : ''}`}>▾</span>
      </button>
      {open && <div className="p-5 space-y-5">{children}</div>}
    </div>
  );
}

// ─── SPACE letter cards (Activity 1 top row) ────────────────────────────
function ScoreCardsRow({ dims }: { dims: DimensionResult[] }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
      {(['S','P','A','C','E'] as const).map((code) => {
        const d = dims.find((x) => x.code === code);
        const theme = themeOf(code);
        const drop = d && d.trendDelta !== null && d.trendDelta <= -0.4;
        return (
          <div
            key={code}
            className={`rounded-lg border ${theme.accent} border-l-4 bg-white shadow-sm p-3 flex flex-col`}
          >
            <div className="flex items-baseline justify-between">
              <span className={`font-serif text-4xl font-bold leading-none ${theme.letter}`}>{code}</span>
              {d?.priority && (
                <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${PRIORITY_BADGE[d.priority] ?? ''}`}>
                  {d.priority}
                </span>
              )}
            </div>
            <div className="text-[11px] font-mono uppercase tracking-[2px] text-slate-500 mt-1">
              {DIM_NAMES[code]}
            </div>
            <div className="font-serif text-3xl font-semibold text-slate-900 mt-2 leading-none">
              {d?.averageScore != null ? d.averageScore.toFixed(2) : '—'}
            </div>
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              {d?.band && (
                <span className={`text-[10px] font-mono uppercase tracking-wide px-1.5 py-0.5 rounded ${BAND_BADGE[d.band] ?? ''}`}>
                  {d.band}
                </span>
              )}
              {d && d.trendDelta !== null && (
                <span className={`text-[10px] font-mono ${d.trendDelta < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                  {d.trendDelta > 0 ? '↑' : d.trendDelta < 0 ? '↓' : '·'} {Math.abs(d.trendDelta).toFixed(1)}
                </span>
              )}
            </div>
            {drop && (
              <div className="mt-1 text-[10px] font-mono uppercase tracking-wide text-red-600 font-semibold">
                ⚠ Drop &gt; 0.4
              </div>
            )}
            <div className="mt-1 text-[10px] text-slate-400">n={d?.responseCount ?? 0}</div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Triage table (Activity 1 main) ─────────────────────────────────────
function TriageTable({ dims }: { dims: DimensionResult[] }) {
  return (
    <div className="overflow-x-auto border border-slate-200 rounded">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="text-left text-[10px] font-mono uppercase tracking-[2px] text-slate-500 bg-slate-50 border-b border-slate-200">
            <th className="py-2 px-3">Dimension</th>
            <th className="py-2 px-3 text-right">Score</th>
            <th className="py-2 px-3">Band</th>
            <th className="py-2 px-3">Priority</th>
            <th className="py-2 px-3 text-right">Trend vs Prev</th>
            <th className="py-2 px-3 text-center">Drop &gt; 0.4?</th>
            <th className="py-2 px-3">Immediate Action</th>
          </tr>
        </thead>
        <tbody>
          {dims.map((d) => {
            const dropped = d.trendDelta !== null && d.trendDelta <= -0.4;
            const action = (d.band && DIMENSION_ACTIONS[d.code]?.[d.band]) ?? '—';
            const theme = themeOf(d.code);
            return (
              <tr key={d.code} className="border-b border-slate-100 align-top hover:bg-slate-50/60">
                <td className={`py-2 px-3 font-semibold ${theme.letter}`}>
                  {d.code} — {d.name}
                </td>
                <td className="py-2 px-3 text-right font-mono font-semibold text-slate-900">
                  {d.averageScore !== null ? d.averageScore.toFixed(2) : '—'}
                </td>
                <td className="py-2 px-3">
                  {d.band && (
                    <span className={`inline-block text-[10px] font-mono uppercase tracking-wide px-1.5 py-0.5 rounded ${BAND_BADGE[d.band] ?? ''}`}>
                      {d.band}
                    </span>
                  )}
                </td>
                <td className="py-2 px-3">
                  <span className={`inline-block text-[10px] font-mono px-1.5 py-0.5 rounded ${PRIORITY_BADGE[d.priority] ?? ''}`}>
                    {d.priority}
                  </span>
                  {d.trendOverridden && (
                    <span className="ml-1 text-[10px] bg-red-600 text-white px-1.5 py-0.5 rounded">↑ trend</span>
                  )}
                </td>
                <td className="py-2 px-3 text-right font-mono text-xs">
                  {d.trendDelta === null ? (
                    <span className="text-slate-400">No prev data</span>
                  ) : (
                    <span className={d.trendDelta < 0 ? 'text-red-700 font-semibold' : 'text-emerald-700'}>
                      {d.trendDelta > 0 ? '↑ +' : d.trendDelta < 0 ? '↓ ' : '· '}
                      {Math.abs(d.trendDelta).toFixed(2)} pts
                      {d.previousAverage !== null && (
                        <span className="text-slate-400 ml-1">vs {d.previousAverage.toFixed(1)}</span>
                      )}
                    </span>
                  )}
                </td>
                <td className="py-2 px-3 text-center">
                  {dropped ? (
                    <span className="inline-block text-[10px] font-mono px-1.5 py-0.5 rounded bg-red-600 text-white">⚠ YES</span>
                  ) : (
                    <span className="text-slate-400 text-xs">no</span>
                  )}
                </td>
                <td className="py-2 px-3 text-xs text-slate-700 leading-snug max-w-md">{action}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function DecisionGate() {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4">
      <span className="text-2xl leading-none">⚡</span>
      <div>
        <div className="text-[10px] font-mono uppercase tracking-[2px] text-amber-700 mb-1">Decision Gate</div>
        <h4 className="font-serif text-base font-semibold text-amber-900 mb-1">
          Emergency vs. Standard Track
        </h4>
        <p className="text-xs text-amber-900/90 leading-relaxed">
          Score below 2.0 → <strong>Emergency</strong>: 48hr deep-dive, journey mapping within 5 days.
          Score 2.0–2.9 → <strong>Standard</strong>: investigation within 2 weeks.
          Q7 (Psych Safety) below 2.5 → replace workshops with 1:1 interviews in Phase 4.
        </p>
      </div>
    </div>
  );
}

function CrossPatternList({ alerts }: { alerts: Alert[] }) {
  const visibleAlerts = alerts.length
    ? alerts
    : [{
        code: 'NO_PATTERN',
        severity: 'INFO' as const,
        crossPattern: 'No high-risk cross-pattern detected',
        trigger: 'Current SPACE scores do not match a configured risk pattern',
        diagnosis: 'No high-risk cross-dimension pattern detected at current score levels.',
        leadershipAction: 'Monitor trend between cycles.',
        message: 'No high-risk cross-dimension pattern detected at current score levels. Monitor trend between cycles.',
      }];
  const toneCls: Record<Alert['severity'], string> = {
    CRITICAL: 'border-red-300 bg-red-50 text-red-950',
    WARNING: 'border-amber-300 bg-amber-50 text-amber-950',
    INFO: 'border-emerald-300 bg-emerald-50 text-emerald-950',
  };
  return (
    <ul className="space-y-2">
      {visibleAlerts.map((a) => (
        <li key={a.patternId ?? a.code} className={`border-l-4 rounded px-4 py-3 text-sm leading-snug ${toneCls[a.severity]}`}>
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className="font-mono text-[11px] font-semibold tracking-wide">{a.patternId ?? a.code}</span>
            <span className="font-semibold">{a.crossPattern ?? a.message}</span>
          </div>
          {a.trigger && <div className="text-xs font-mono opacity-80 mb-2">Trigger: {a.trigger}</div>}
          {(a.diagnosis || a.whatItMeans) && (
            <p className="mb-2">
              {a.diagnosis}
              {a.whatItMeans ? ` ${a.whatItMeans}` : ''}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}

function autoFindings(dims: DimensionResult[]): string {
  const rows = [...dims]
    .filter((d) => d.averageScore !== null)
    .sort((a, b) => (a.averageScore ?? 5) - (b.averageScore ?? 5))
    .slice(0, 3);
  return rows
    .map((d, i) => {
      const drop = d.trendDelta !== null && d.trendDelta < 0
        ? ` — drop of ${Math.abs(d.trendDelta).toFixed(1)} pts from previous cycle`
        : '';
      const band = d.band ? ` (${d.band} band)` : '';
      return `${i + 1}. ${d.code} — ${d.name} scored ${d.averageScore?.toFixed(2)}/5${band}${drop}`;
    })
    .join('\n');
}

function ExecSummaryForm({
  companyId, campaignId, campaign, dims,
}: {
  companyId: string;
  campaignId: string;
  campaign: CampaignDetail;
  dims: DimensionResult[];
}) {
  const qc = useQueryClient();
  const defaultSubject = `SPACE Survey Results — ${campaign.cycle ?? campaign.title} — Initial Triage`;
  const [to, setTo] = useState(campaign.vpEmail ?? '');
  const [subject, setSubject] = useState(campaign.execSummarySubject ?? defaultSubject);
  const [findings, setFindings] = useState(campaign.execSummaryFindings ?? autoFindings(dims));
  const [nextSteps, setNextSteps] = useState(
    campaign.execSummaryNextSteps ??
      `1. Phase 2 open text analysis: [Date]\n2. Journey mapping workshops scheduled for: [Date range]\n3. Phase 5 registry and AI feasibility complete by: [Date]\n4. Results presentation to team: [Date]`,
  );
  const [immediate, setImmediate] = useState(
    campaign.execSummaryImmediate ??
      `e.g. Journey mapping sessions booked for [dates]. Reached out to team leads to discuss findings.`,
  );
  const [copied, setCopied] = useState(false);

  const save = useMutation({
    mutationFn: () =>
      api(`/api/companies/${companyId}/campaigns/${campaignId}`, {
        method: 'PATCH',
        body: {
          vpEmail: to || null,
          execSummarySubject: subject || null,
          execSummaryFindings: findings || null,
          execSummaryNextSteps: nextSteps || null,
          execSummaryImmediate: immediate || null,
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['campaigns', companyId, campaignId, 'detail'] });
      qc.invalidateQueries({ queryKey: ['campaigns', companyId] });
    },
  });

  const copy = async () => {
    const body =
      `To: ${to}\nSubject: ${subject}\n\n` +
      `KEY FINDINGS\n${findings}\n\n` +
      `COMMITTED NEXT STEPS\n${nextSteps}\n\n` +
      `IMMEDIATE ACTIONS\n${immediate}\n`;
    await navigator.clipboard.writeText(body);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="space-y-4">
      <div className="rounded border-l-4 border-amber-400 bg-amber-50 px-4 py-2 text-xs text-amber-900 leading-snug">
        ⏱️ This summary must be sent within 24 hours of survey close. Visible action prevents survey fatigue from taking hold.
      </div>

      <ExecField label="To (VP Engineering)">
        <input
          type="email"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          placeholder="vpeng@company.com"
          className="w-full border border-slate-300 rounded px-3 py-2 text-sm"
        />
      </ExecField>

      <ExecField label="Subject line">
        <input
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className="w-full border border-slate-300 rounded px-3 py-2 text-sm"
        />
      </ExecField>

      <ExecField label="Key findings (top 1–3)" hint="Auto-suggested from lowest dimension scores. Edit as needed.">
        <textarea
          value={findings}
          onChange={(e) => setFindings(e.target.value)}
          rows={4}
          className="w-full border border-slate-300 rounded px-3 py-2 text-sm font-mono"
        />
      </ExecField>

      <ExecField label="Committed next steps with dates" hint="Specific dates are critical. Vague commitments destroy survey trust.">
        <textarea
          value={nextSteps}
          onChange={(e) => setNextSteps(e.target.value)}
          rows={5}
          className="w-full border border-slate-300 rounded px-3 py-2 text-sm font-mono"
        />
      </ExecField>

      <ExecField label="Immediate actions (before full analysis)" hint="Shows the VP that action is already in motion.">
        <textarea
          value={immediate}
          onChange={(e) => setImmediate(e.target.value)}
          rows={3}
          className="w-full border border-slate-300 rounded px-3 py-2 text-sm font-mono"
        />
      </ExecField>

      <div className="flex gap-2 items-center flex-wrap">
        <button
          onClick={() => save.mutate()}
          disabled={save.isPending}
          className="text-xs px-3 py-2 rounded bg-emerald-700 text-white font-semibold hover:bg-emerald-800 disabled:opacity-50"
        >
          {save.isPending ? 'Saving…' : '💾 Save Summary'}
        </button>
        <button
          onClick={copy}
          className="text-xs px-3 py-2 rounded border border-slate-300 hover:bg-slate-50"
        >
          📋 {copied ? 'Copied!' : 'Copy to Clipboard'}
        </button>
        {save.isSuccess && !save.isPending && (
          <span className="text-xs text-emerald-700">✓ Saved</span>
        )}
        {save.error && (
          <span className="text-xs text-red-600">{(save.error as Error).message}</span>
        )}
      </div>
    </div>
  );
}

function ExecField({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[10px] font-mono uppercase tracking-[2px] text-slate-500 mb-1">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-slate-400 mt-1">{hint}</span>}
    </label>
  );
}
