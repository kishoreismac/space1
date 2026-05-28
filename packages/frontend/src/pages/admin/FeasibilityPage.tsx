import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Campaign, Company } from '@space/shared';
import { api } from '../../lib/api';
import { useAuth } from '../../stores/auth';
import { PhaseShell } from '../../components/PhaseShell';

interface CompaniesResponse { items: Company[]; }
interface CampaignsResponse { items: Campaign[]; }

type Severity = 'P1' | 'P2' | 'P3' | 'P4';
type Band = 'Quick Win' | 'Strategic Bet' | 'Monitor' | 'Defer' | 'Non-AI';

interface RegistryRow {
  n: number;
  id: string;
  title: string;
  sdlcPhase: string;
  dimensionCode: string;
  dimensionScore: number | null;
  sourcesLabel: string;
  sourcesConfirmed: number;
  sourcesTotal: number;
  reachPercentage: number | null;
  estimatedHoursLost: number | null;
  aiFit: 'YES' | 'NO';
  priority: Severity;
  evidenceSummary: string | null;
}

interface MatrixRow {
  id: string;
  title: string;
  toolMaturity: number;
  integrationEase: number;
  costEfficiency: number;
  dataAvailability: number;
  developerAdoption: number;
  score: number;
  classification: Band;
  tool: string;
  auto: boolean;
}

interface ProgramOutput {
  campaignId: string;
  totalRespondents: number;
  registry: RegistryRow[];
  matrix: MatrixRow[];
  summary: {
    quickWins: number;
    strategicBets: number;
    monitor: number;
    nonAi: number;
    totalBlockers: number;
    scoredBlockers: number;
    estTimeRecoveredHrs: number;
  };
}

export default function FeasibilityPage() {
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
    <PhaseShell phase="P5">
      <div className="space-y-6">
        <div className="bg-white rounded-lg border border-slate-200 p-4 flex flex-wrap gap-3 items-end">
          {role === 'SUPER_ADMIN' && (
            <label className="text-sm">
              <span className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-1">Company</span>
              <select
                value={companyId ?? ''}
                onChange={(e) => { setCompanyId(e.target.value || null); setCampaignId(null); }}
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
            <span className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-1">Campaign</span>
            <select
              value={campaignId ?? ''}
              onChange={(e) => setCampaignId(e.target.value || null)}
              disabled={!companyId}
              className="border border-slate-300 rounded px-2 py-1.5 text-sm min-w-[240px]"
            >
              <option value="">—</option>
              {campaigns.data?.items.map((c) => (
                <option key={c.id} value={c.id}>{c.title} ({c.status})</option>
              ))}
            </select>
          </label>
        </div>

        {companyId && campaignId ? (
          <FeasibilityWorkspace companyId={companyId} campaignId={campaignId} />
        ) : (
          <div className="bg-white rounded-lg border border-slate-200 p-8 text-center text-sm text-slate-500">
            Pick a campaign to surface the validated blocker registry and AI feasibility matrix.
          </div>
        )}
      </div>
    </PhaseShell>
  );
}

function FeasibilityWorkspace({ companyId, campaignId }: { companyId: string; campaignId: string }) {
  const base = `/api/companies/${companyId}/campaigns/${campaignId}/feasibility`;
  const program = useQuery({
    queryKey: ['program-output', campaignId],
    queryFn: () => api<ProgramOutput>(`${base}/program-output`),
  });

  if (program.isLoading) {
    return <div className="bg-white rounded-lg border border-slate-200 p-8 text-sm text-slate-500">Computing program output from survey signals…</div>;
  }
  if (!program.data) {
    return <div className="bg-white rounded-lg border border-slate-200 p-8 text-sm text-slate-500">No program output yet.</div>;
  }

  const d = program.data;
  const hasBlockers = d.registry.length > 0;

  return (
    <div className="space-y-8">
      {!hasBlockers && (
        <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-lg p-4 text-sm">
          No validated blockers yet. Run <strong>P3 · Triangulate → Auto-seed</strong> first to derive blockers from survey, themes and journey data.
        </div>
      )}
      <RegistrySection registry={d.registry} totalRespondents={d.totalRespondents} />
      <MatrixSection matrix={d.matrix} />
      <ProgramOutputCard summary={d.summary} />
    </div>
  );
}

function RegistrySection({ registry, totalRespondents }: { registry: RegistryRow[]; totalRespondents: number }) {
  return (
    <section className="bg-white rounded-lg border border-slate-200 overflow-hidden">
      <header className="px-5 py-4 border-b border-slate-200 flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Validated Blocker Registry</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Survey-derived blockers with multi-source confirmation, reach, and triage signal. {totalRespondents} respondents in this campaign.
          </p>
        </div>
        <span className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">
          {registry.length} blocker{registry.length === 1 ? '' : 's'}
        </span>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-900 text-slate-100">
            <tr>
              <Th>#</Th><Th>Blocker</Th><Th>SDLC Phase</Th><Th>Dimension</Th><Th>Score</Th>
              <Th>Sources Confirmed</Th><Th>Dev Reach</Th><Th>Hrs/Sprint</Th><Th>AI Fit</Th><Th>Priority</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {registry.length === 0 && (
              <tr><td colSpan={10} className="px-4 py-8 text-center text-slate-400 italic">No validated blockers</td></tr>
            )}
            {registry.map((r) => {
              const respondents = r.reachPercentage !== null
                ? Math.round((r.reachPercentage / 100) * totalRespondents) : null;
              return (
                <tr key={r.id} className="hover:bg-slate-50">
                  <Td className="text-slate-400 tabular-nums">{r.n}</Td>
                  <Td className="font-medium text-slate-900 max-w-[280px]">
                    <div className="truncate" title={r.title}>{r.title}</div>
                    {r.evidenceSummary && (
                      <div className="text-[11px] text-slate-500 mt-0.5 truncate">{r.evidenceSummary}</div>
                    )}
                  </Td>
                  <Td className="text-slate-600">{r.sdlcPhase}</Td>
                  <Td><DimensionBadge code={r.dimensionCode} /></Td>
                  <Td>{r.dimensionScore !== null ? <ScoreBadge value={r.dimensionScore} /> : <span className="text-slate-400">—</span>}</Td>
                  <Td className="text-slate-700 text-[12px]">{r.sourcesLabel}</Td>
                  <Td className="tabular-nums text-slate-700">
                    {r.reachPercentage !== null
                      ? <>{Math.round(r.reachPercentage)}% <span className="text-slate-400">({respondents}/{totalRespondents})</span></>
                      : <span className="text-slate-400">—</span>}
                  </Td>
                  <Td className="tabular-nums text-slate-700">
                    {r.estimatedHoursLost !== null ? `~${r.estimatedHoursLost}` : <span className="text-slate-400">—</span>}
                  </Td>
                  <Td>
                    {r.aiFit === 'YES'
                      ? <span className="text-emerald-700 font-semibold">✓ YES</span>
                      : <span className="text-rose-600 font-semibold">✗ NO <span className="text-[10px] font-normal text-slate-500">— mgmt</span></span>}
                  </Td>
                  <Td><PriorityFlag p={r.priority} /></Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function MatrixSection({ matrix }: { matrix: MatrixRow[] }) {
  return (
    <section className="bg-white rounded-lg border border-slate-200 overflow-hidden">
      <header className="px-5 py-4 border-b border-slate-200">
        <h2 className="text-base font-semibold text-slate-900">AI Feasibility Scoring Matrix</h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Each blocker scored on five weighted criteria. Composite displayed on 0–10 scale, auto-derived from survey signals where no manual review exists.
        </p>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-900 text-slate-100">
            <tr>
              <Th>Blocker</Th>
              <Th><div>Tool Maturity</div><div className="text-[10px] font-normal opacity-70">25%</div></Th>
              <Th><div>Integration</div><div className="text-[10px] font-normal opacity-70">20%</div></Th>
              <Th><div>Cost Eff.</div><div className="text-[10px] font-normal opacity-70">25%</div></Th>
              <Th><div>Data Avail.</div><div className="text-[10px] font-normal opacity-70">15%</div></Th>
              <Th><div>Dev Adoption</div><div className="text-[10px] font-normal opacity-70">15%</div></Th>
              <Th>Score</Th><Th>Class</Th><Th>Recommended Tool</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {matrix.length === 0 && (
              <tr><td colSpan={9} className="px-4 py-8 text-center text-slate-400 italic">No AI-fit blockers in registry</td></tr>
            )}
            {matrix.map((m) => (
              <tr key={m.id} className="hover:bg-slate-50">
                <Td className="font-medium text-slate-900 max-w-[260px]">
                  <div className="truncate" title={m.title}>{m.title}</div>
                  {m.auto && <div className="text-[10px] text-slate-400 mt-0.5">auto-scored from survey</div>}
                </Td>
                <Td><Chip5 v={m.toolMaturity} /></Td>
                <Td><Chip5 v={m.integrationEase} /></Td>
                <Td><Chip5 v={m.costEfficiency} /></Td>
                <Td><Chip5 v={m.dataAvailability} /></Td>
                <Td><Chip5 v={m.developerAdoption} /></Td>
                <Td><span className="font-semibold text-base tabular-nums text-slate-900">{m.score.toFixed(1)}</span></Td>
                <Td><BandBadge band={m.classification} /></Td>
                <Td className="text-slate-700 text-[12px]">{m.tool}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ProgramOutputCard({ summary }: { summary: ProgramOutput['summary'] }) {
  return (
    <section className="rounded-lg p-6 text-slate-100 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 border border-slate-700">
      <div className="text-[11px] uppercase tracking-[0.25em] font-semibold text-amber-300 mb-1">Program Output</div>
      <h2 className="text-xl font-semibold text-white mb-1">Ranked AI Opportunity Map</h2>
      <p className="text-sm text-slate-300 mb-6">Ready for Step 2 handoff · derived solely from validated survey signals.</p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat label="Quick Wins" value={summary.quickWins} sub="Score ≥ 8.0" tone="emerald" />
        <Stat label="Strategic Bets" value={summary.strategicBets} sub="Score 6.0 – 8.0" tone="sky" />
        <Stat label="Non-AI Routes" value={summary.nonAi} sub="Mgmt / process" tone="rose" />
        <Stat label="Est. Time Recovered" value={`~${summary.estTimeRecoveredHrs}`} sub="hrs / sprint" tone="amber" />
      </div>
      <div className="mt-6 pt-4 border-t border-slate-700 text-xs text-slate-400 flex flex-wrap gap-4">
        <span>{summary.totalBlockers} blockers triaged</span>
        <span>·</span>
        <span>{summary.scoredBlockers} scored on AI feasibility</span>
        <span>·</span>
        <span>{summary.monitor} in monitor band</span>
      </div>
    </section>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide">{children}</th>;
}
function Td({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-3 py-2.5 align-top ${className}`}>{children}</td>;
}
function DimensionBadge({ code }: { code: string }) {
  const colours: Record<string, string> = {
    S: 'bg-rose-100 text-rose-700 border-rose-200',
    P: 'bg-amber-100 text-amber-800 border-amber-200',
    A: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    C: 'bg-violet-100 text-violet-700 border-violet-200',
    E: 'bg-sky-100 text-sky-700 border-sky-200',
  };
  const cls = colours[code] ?? 'bg-slate-100 text-slate-700 border-slate-200';
  return <span className={`inline-block px-1.5 py-0.5 rounded border text-[11px] font-semibold ${cls}`}>{code}</span>;
}
function ScoreBadge({ value }: { value: number }) {
  let tone = 'bg-emerald-100 text-emerald-700 border-emerald-200';
  if (value < 2.5) tone = 'bg-rose-100 text-rose-700 border-rose-200';
  else if (value < 3.0) tone = 'bg-amber-100 text-amber-800 border-amber-200';
  return <span className={`inline-block px-1.5 py-0.5 rounded border text-[11px] font-semibold tabular-nums ${tone}`}>{value.toFixed(2)}</span>;
}
function PriorityFlag({ p }: { p: Severity }) {
  const tones: Record<Severity, string> = {
    P1: 'bg-rose-600 text-white',
    P2: 'bg-amber-500 text-white',
    P3: 'bg-sky-600 text-white',
    P4: 'bg-slate-400 text-white',
  };
  return <span className={`inline-block px-1.5 py-0.5 rounded text-[11px] font-semibold ${tones[p]}`}>{p}</span>;
}
function Chip5({ v }: { v: number }) {
  const tones = [
    'bg-rose-100 text-rose-700',
    'bg-rose-100 text-rose-700',
    'bg-amber-100 text-amber-800',
    'bg-sky-100 text-sky-700',
    'bg-emerald-100 text-emerald-700',
    'bg-emerald-200 text-emerald-800',
  ];
  const idx = Math.max(0, Math.min(5, Math.round(v)));
  return <span className={`inline-block w-7 text-center px-1.5 py-0.5 rounded text-[11px] font-semibold tabular-nums ${tones[idx]}`}>{v}</span>;
}
function BandBadge({ band }: { band: Band }) {
  const tones: Record<Band, string> = {
    'Quick Win': 'bg-emerald-600 text-white',
    'Strategic Bet': 'bg-sky-600 text-white',
    Monitor: 'bg-amber-500 text-white',
    Defer: 'bg-slate-400 text-white',
    'Non-AI': 'bg-rose-600 text-white',
  };
  return <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-semibold ${tones[band]}`}>{band}</span>;
}
function Stat({ label, value, sub, tone }: { label: string; value: number | string; sub: string; tone: 'emerald' | 'sky' | 'rose' | 'amber' }) {
  const tones = {
    emerald: 'text-emerald-300',
    sky: 'text-sky-300',
    rose: 'text-rose-300',
    amber: 'text-amber-300',
  } as const;
  return (
    <div className="bg-slate-800/60 rounded-lg p-4 border border-slate-700">
      <div className="text-[10px] uppercase tracking-wide font-semibold text-slate-400">{label}</div>
      <div className={`mt-1 text-3xl font-semibold tabular-nums ${tones[tone]}`}>{value}</div>
      <div className="text-[11px] text-slate-400 mt-1">{sub}</div>
    </div>
  );
}
