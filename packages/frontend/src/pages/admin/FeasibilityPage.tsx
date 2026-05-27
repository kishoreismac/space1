import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Campaign, Company } from '@space/shared';
import { FEASIBILITY_WEIGHTS } from '@space/shared';
import { api } from '../../lib/api';
import { useAuth } from '../../stores/auth';
import { PhaseShell } from '../../components/PhaseShell';

interface CompaniesResponse { items: Company[]; }
interface CampaignsResponse { items: Campaign[]; }

type Severity = 'P1' | 'P2' | 'P3' | 'P4';
type AIFit = 'STRONG_FIT' | 'CANDIDATE' | 'INVESTIGATE' | 'NOT_FIT';

interface Blocker {
  id: string;
  title: string;
  severity: Severity;
  reachPercentage: number | null;
  estimatedHoursLost: number | null;
  aiFit: AIFit;
  status: string;
  feasibilityScore: number | null;
  feasibilityClass: AIFit | null;
}
interface BlockersResponse { items: Blocker[]; }

interface Feasibility {
  id: string;
  blockerId: string;
  toolMaturityScore: number;
  integrationEaseScore: number;
  costEfficiencyScore: number;
  dataAvailabilityScore: number;
  developerAdoptionScore: number;
  weightedCompositeScore: number;
  classification: AIFit;
  notes: string | null;
}

interface RoadmapRow {
  blockerId: string;
  title: string;
  severity: Severity;
  reachPercentage: number | null;
  estimatedHoursLost: number | null;
  impactScore: number;
  feasibilityScore: number;
  feasibilityClass: AIFit | null;
  priorityScore: number;
  aiFit: AIFit;
  status: string;
}
interface Roadmap {
  now: RoadmapRow[];
  next: RoadmapRow[];
  later: RoadmapRow[];
  excluded: RoadmapRow[];
  summary: { total: number; scored: number; unscored: number };
}

const CLASS_COLORS: Record<AIFit, string> = {
  STRONG_FIT: 'bg-emerald-100 text-emerald-700 border-emerald-300',
  CANDIDATE: 'bg-sky-100 text-sky-700 border-sky-300',
  INVESTIGATE: 'bg-amber-100 text-amber-800 border-amber-300',
  NOT_FIT: 'bg-rose-100 text-rose-700 border-rose-300',
};

const SCORE_FIELDS = [
  { key: 'toolMaturityScore', label: 'Tool maturity', weight: FEASIBILITY_WEIGHTS.toolMaturity },
  { key: 'integrationEaseScore', label: 'Integration ease', weight: FEASIBILITY_WEIGHTS.integrationEase },
  { key: 'costEfficiencyScore', label: 'Cost efficiency', weight: FEASIBILITY_WEIGHTS.costEfficiency },
  { key: 'dataAvailabilityScore', label: 'Data availability', weight: FEASIBILITY_WEIGHTS.dataAvailability },
  { key: 'developerAdoptionScore', label: 'Dev adoption', weight: FEASIBILITY_WEIGHTS.developerAdoption },
] as const;

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
        <FeasibilityWorkspace companyId={companyId} campaignId={campaignId} />
      ) : (
        <div className="bg-white rounded-lg border border-slate-200 p-8 text-center text-sm text-slate-500">
          Pick a campaign to score and prioritize.
        </div>
      )}
    </div>
    </PhaseShell>
  );
}

function FeasibilityWorkspace({
  companyId,
  campaignId,
}: {
  companyId: string;
  campaignId: string;
}) {
  const triBase = `/api/companies/${companyId}/campaigns/${campaignId}/triangulation`;
  const feasBase = `/api/companies/${companyId}/campaigns/${campaignId}/feasibility`;
  const [selectedBlockerId, setSelectedBlockerId] = useState<string | null>(null);

  const blockers = useQuery({
    queryKey: ['blockers', campaignId],
    queryFn: () => api<BlockersResponse>(`${triBase}/blockers`),
  });
  const roadmap = useQuery({
    queryKey: ['roadmap', campaignId],
    queryFn: () => api<Roadmap>(`${feasBase}/roadmap`),
  });

  useEffect(() => {
    if (!selectedBlockerId && blockers.data?.items[0]) {
      setSelectedBlockerId(blockers.data.items[0].id);
    }
  }, [blockers.data, selectedBlockerId]);

  return (
    <div className="space-y-6">
      <RoadmapPanel data={roadmap.data} loading={roadmap.isLoading} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <aside className="lg:col-span-1 bg-white rounded-lg border border-slate-200 p-4">
          <h2 className="font-semibold text-sm mb-3">Blockers</h2>
          {blockers.isLoading && <div className="text-sm text-slate-500">Loading…</div>}
          <ul className="divide-y divide-slate-100">
            {blockers.data?.items.map((b) => (
              <li key={b.id}>
                <button
                  onClick={() => setSelectedBlockerId(b.id)}
                  className={`w-full text-left py-2 px-2 rounded ${
                    b.id === selectedBlockerId ? 'bg-slate-100' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="font-medium truncate">{b.title}</span>
                    {b.feasibilityClass && (
                      <span
                        className={`text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded border ${CLASS_COLORS[b.feasibilityClass]}`}
                      >
                        {b.feasibilityClass.replace('_', ' ')}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    {b.severity} ·{' '}
                    {b.feasibilityScore !== null
                      ? `${b.feasibilityScore.toFixed(2)} composite`
                      : 'unscored'}
                  </div>
                </button>
              </li>
            ))}
            {!blockers.isLoading && (blockers.data?.items.length ?? 0) === 0 && (
              <li className="text-sm text-slate-500 py-2">
                No blockers — go to Triangulation first.
              </li>
            )}
          </ul>
        </aside>

        <section className="lg:col-span-2">
          {selectedBlockerId ? (
            <BlockerScoring
              feasBase={feasBase}
              triBase={triBase}
              campaignId={campaignId}
              blockerId={selectedBlockerId}
            />
          ) : (
            <div className="bg-white rounded-lg border border-slate-200 p-8 text-center text-sm text-slate-500">
              Select a blocker to score it.
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function RoadmapPanel({ data, loading }: { data: Roadmap | undefined; loading: boolean }) {
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-sm">Roadmap</h3>
        {data && (
          <span className="text-xs text-slate-500">
            {data.summary.scored}/{data.summary.total} scored · {data.summary.unscored} pending
          </span>
        )}
      </div>
      {loading && <div className="text-sm text-slate-500">Loading…</div>}
      {data && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <RoadmapColumn title="Now" tone="emerald" rows={data.now} />
          <RoadmapColumn title="Next" tone="sky" rows={data.next} />
          <RoadmapColumn title="Later" tone="slate" rows={data.later} />
        </div>
      )}
      {data && data.excluded.length > 0 && (
        <details className="mt-4">
          <summary className="text-xs text-slate-500 cursor-pointer">
            {data.excluded.length} excluded (NOT_FIT / DROPPED)
          </summary>
          <ul className="mt-2 text-xs text-slate-500 space-y-1">
            {data.excluded.map((r) => (
              <li key={r.blockerId}>
                • {r.title} ({r.feasibilityClass ?? '—'} / {r.status})
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function RoadmapColumn({
  title,
  tone,
  rows,
}: {
  title: string;
  tone: 'emerald' | 'sky' | 'slate';
  rows: RoadmapRow[];
}) {
  const head: Record<typeof tone, string> = {
    emerald: 'bg-emerald-600',
    sky: 'bg-sky-600',
    slate: 'bg-slate-500',
  };
  return (
    <div className="border border-slate-200 rounded overflow-hidden">
      <div className={`px-3 py-2 text-white text-xs font-semibold uppercase ${head[tone]}`}>
        {title} ({rows.length})
      </div>
      <ul className="divide-y divide-slate-100">
        {rows.length === 0 && (
          <li className="text-xs text-slate-400 italic px-3 py-2">— empty —</li>
        )}
        {rows.map((r) => (
          <li key={r.blockerId} className="px-3 py-2 text-sm">
            <div className="font-medium truncate">{r.title}</div>
            <div className="text-xs text-slate-500 mt-0.5">
              priority {r.priorityScore} · impact {r.impactScore} ·{' '}
              feasibility {r.feasibilityScore.toFixed(2)} · {r.severity}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function BlockerScoring({
  feasBase,
  triBase,
  campaignId,
  blockerId,
}: {
  feasBase: string;
  triBase: string;
  campaignId: string;
  blockerId: string;
}) {
  const qc = useQueryClient();
  const blockers = useQuery({
    queryKey: ['blockers', campaignId],
    queryFn: () => api<BlockersResponse>(`${triBase}/blockers`),
  });
  const blocker = blockers.data?.items.find((b) => b.id === blockerId) ?? null;

  const feasibility = useQuery({
    queryKey: ['feasibility', blockerId],
    queryFn: () => api<Feasibility | null>(`${feasBase}/blockers/${blockerId}/feasibility`),
  });

  const [scores, setScores] = useState<Record<string, number>>({
    toolMaturityScore: 3,
    integrationEaseScore: 3,
    costEfficiencyScore: 3,
    dataAvailabilityScore: 3,
    developerAdoptionScore: 3,
  });
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (feasibility.data) {
      setScores({
        toolMaturityScore: feasibility.data.toolMaturityScore,
        integrationEaseScore: feasibility.data.integrationEaseScore,
        costEfficiencyScore: feasibility.data.costEfficiencyScore,
        dataAvailabilityScore: feasibility.data.dataAvailabilityScore,
        developerAdoptionScore: feasibility.data.developerAdoptionScore,
      });
      setNotes(feasibility.data.notes ?? '');
    } else {
      setScores({
        toolMaturityScore: 3,
        integrationEaseScore: 3,
        costEfficiencyScore: 3,
        dataAvailabilityScore: 3,
        developerAdoptionScore: 3,
      });
      setNotes('');
    }
  }, [feasibility.data]);

  const save = useMutation({
    mutationFn: () =>
      api<Feasibility>(`${feasBase}/blockers/${blockerId}/feasibility`, {
        method: 'PUT',
        body: { ...scores, notes: notes || null },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['feasibility', blockerId] });
      qc.invalidateQueries({ queryKey: ['blockers', campaignId] });
      qc.invalidateQueries({ queryKey: ['roadmap', campaignId] });
    },
  });
  const clear = useMutation({
    mutationFn: () =>
      api(`${feasBase}/blockers/${blockerId}/feasibility`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['feasibility', blockerId] });
      qc.invalidateQueries({ queryKey: ['blockers', campaignId] });
      qc.invalidateQueries({ queryKey: ['roadmap', campaignId] });
    },
  });

  if (!blocker) return <div className="text-sm text-slate-500">Loading blocker…</div>;

  // Live composite preview
  const livePreview = Math.round(
    SCORE_FIELDS.reduce(
      (sum, f) => sum + (scores[f.key] ?? 0) * f.weight,
      0,
    ) * 100,
  ) / 100;
  const liveClass: AIFit =
    livePreview >= 4 ? 'STRONG_FIT'
    : livePreview >= 3 ? 'CANDIDATE'
    : livePreview >= 2 ? 'INVESTIGATE'
    : 'NOT_FIT';

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-5 space-y-5">
      <div>
        <h3 className="font-semibold text-lg">{blocker.title}</h3>
        <div className="text-sm text-slate-500">
          {blocker.severity} · {blocker.reachPercentage ?? 0}% reach ·{' '}
          {blocker.estimatedHoursLost ?? 0}h lost/wk
        </div>
      </div>

      <div className="space-y-3">
        {SCORE_FIELDS.map((f) => (
          <div key={f.key}>
            <div className="flex items-center justify-between text-sm mb-1">
              <span className="font-medium">
                {f.label}{' '}
                <span className="text-xs text-slate-500">
                  (weight {(f.weight * 100).toFixed(0)}%)
                </span>
              </span>
              <span className="text-sm font-semibold">{scores[f.key]?.toFixed(1)}</span>
            </div>
            <input
              type="range"
              min={0}
              max={5}
              step={0.5}
              value={scores[f.key] ?? 0}
              onChange={(e) =>
                setScores((s) => ({ ...s, [f.key]: Number(e.target.value) }))
              }
              className="w-full"
            />
          </div>
        ))}
      </div>

      <div className="bg-slate-50 border border-slate-200 rounded p-4 grid grid-cols-2 gap-3">
        <Stat label="Composite (live)" value={livePreview.toFixed(2)} />
        <Stat
          label="Classification (live)"
          value={liveClass.replace('_', ' ')}
          badge={CLASS_COLORS[liveClass]}
        />
      </div>

      <label className="block">
        <span className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-1">
          Notes
        </span>
        <textarea
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Rationale, links, tool candidates…"
          className="w-full border border-slate-300 rounded px-3 py-2 text-sm"
        />
      </label>

      <div className="flex gap-2">
        <button
          onClick={() => save.mutate()}
          disabled={save.isPending}
          className="text-sm px-4 py-1.5 rounded bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {save.isPending ? 'Saving…' : feasibility.data ? 'Update score' : 'Save score'}
        </button>
        {feasibility.data && (
          <button
            onClick={() => {
              if (confirm('Clear feasibility score?')) clear.mutate();
            }}
            className="text-sm px-4 py-1.5 rounded border border-slate-300 hover:bg-slate-50"
          >
            Clear
          </button>
        )}
        {save.isSuccess && !save.isPending && (
          <span className="text-xs text-emerald-600 self-center">Saved ✓</span>
        )}
      </div>

      {feasibility.data && (
        <div className="text-xs text-slate-500">
          Saved composite: <span className="font-semibold">{feasibility.data.weightedCompositeScore}</span>{' '}
          → <span className="font-semibold">{feasibility.data.classification.replace('_', ' ')}</span>
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  badge,
}: {
  label: string;
  value: string | number;
  badge?: string;
}) {
  return (
    <div className="text-center">
      <div
        className={`text-xl font-semibold ${
          badge ? `inline-block px-2 py-1 rounded border ${badge}` : ''
        }`}
      >
        {value}
      </div>
      <div className="text-[11px] uppercase tracking-wide text-slate-500 mt-1">
        {label}
      </div>
    </div>
  );
}
