import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Campaign, Company } from '@space/shared';
import { api } from '../../lib/api';
import { useAuth } from '../../stores/auth';

interface CompaniesResponse { items: Company[]; }
interface CampaignsResponse { items: Campaign[]; }

type DimCode = 'S' | 'P' | 'A' | 'C' | 'E';
const DIM_NAMES: Record<DimCode, string> = {
  S: 'Satisfaction',
  P: 'Performance',
  A: 'Activity',
  C: 'Communication',
  E: 'Efficiency',
};

interface TeamDim {
  code: DimCode;
  averageScore: number | null;
  responseCount: number;
  band: string;
  delta: number | null;
  flagged: boolean;
}
interface TeamRow {
  teamId: string | null;
  teamName: string;
  respondentCount: number;
  dimensions: TeamDim[];
}
interface CompareResp {
  campaignId: string;
  threshold: number;
  teamRows: TeamRow[];
  totalRespondents: number;
  unassignedCount: number;
}

const BAND_COLOR: Record<string, string> = {
  STRONG: 'text-emerald-700',
  MODERATE: 'text-sky-700',
  CONCERNING: 'text-amber-700',
  CRITICAL: 'text-rose-700',
  INSUFFICIENT_DATA: 'text-slate-400',
};

export default function CompareTeamsPage() {
  const role = useAuth((s) => s.user?.role);
  const userCompanyId = useAuth((s) => s.user?.companyId ?? null);
  const [companyId, setCompanyId] = useState<string | null>(userCompanyId);
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [threshold, setThreshold] = useState(0.5);

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
      <header>
        <h1 className="text-xl font-semibold">Phase 7 — Team Comparison</h1>
        <p className="text-sm text-slate-500">
          Per-team SPACE scores with delta vs the campaign-wide average.
          Cells diverging by more than ±{threshold.toFixed(1)} are flagged for investigation.
        </p>
      </header>

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
        <label className="text-sm">
          <span className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-1">
            Flag threshold (±)
          </span>
          <input
            type="number"
            min={0.1}
            max={5}
            step={0.1}
            value={threshold}
            onChange={(e) => setThreshold(Number(e.target.value) || 0.5)}
            className="border border-slate-300 rounded px-2 py-1.5 text-sm w-24"
          />
        </label>
      </div>

      {companyId && campaignId ? (
        <CompareTable companyId={companyId} campaignId={campaignId} threshold={threshold} />
      ) : (
        <div className="bg-white rounded-lg border border-slate-200 p-8 text-center text-sm text-slate-500">
          Pick a campaign to see per-team scores.
        </div>
      )}
    </div>
  );
}

function CompareTable({
  companyId,
  campaignId,
  threshold,
}: {
  companyId: string;
  campaignId: string;
  threshold: number;
}) {
  const compare = useQuery({
    queryKey: ['teams-compare', campaignId, threshold],
    queryFn: () =>
      api<CompareResp>(
        `/api/companies/${companyId}/campaigns/${campaignId}/results/teams?threshold=${threshold}`,
      ),
  });

  if (compare.isLoading) return <div className="text-sm text-slate-500">Loading…</div>;
  if (compare.error) return <div className="text-sm text-rose-600">{String(compare.error)}</div>;
  if (!compare.data) return null;
  const r = compare.data;
  if (r.totalRespondents === 0) {
    return (
      <div className="bg-white rounded-lg border border-slate-200 p-8 text-center text-sm text-slate-500">
        No completed submissions yet for this campaign.
      </div>
    );
  }

  const teamRowsOnly = r.teamRows.filter((t) => t.teamId !== null || t.teamName === 'Unassigned');
  const flaggedTotal = teamRowsOnly.reduce(
    (acc, t) => acc + t.dimensions.filter((d) => d.flagged).length,
    0,
  );

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-lg border border-slate-200 p-4 grid grid-cols-4 gap-3 text-center">
        <Stat label="Total respondents" value={r.totalRespondents} />
        <Stat label="Teams compared" value={teamRowsOnly.length} />
        <Stat label="Unassigned" value={r.unassignedCount} />
        <Stat label="Flagged cells" value={flaggedTotal} />
      </div>

      <div className="bg-white rounded-lg border border-slate-200 overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-left text-xs uppercase text-slate-500 bg-slate-50 border-b border-slate-200">
              <th className="py-2 px-3">Team</th>
              <th className="py-2 px-3">N</th>
              {(['S', 'P', 'A', 'C', 'E'] as DimCode[]).map((c) => (
                <th key={c} className="py-2 px-3" title={DIM_NAMES[c]}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {r.teamRows.map((row, idx) => {
              const isBaseline = idx === 0;
              return (
                <tr
                  key={`${row.teamId ?? 'na'}-${row.teamName}`}
                  className={
                    isBaseline
                      ? 'border-t border-slate-200 bg-slate-50 font-semibold'
                      : 'border-t border-slate-100'
                  }
                >
                  <td className="py-2 px-3">{row.teamName}</td>
                  <td className="py-2 px-3 text-slate-600">{row.respondentCount}</td>
                  {row.dimensions.map((d) => (
                    <td
                      key={d.code}
                      className={`py-2 px-3 ${
                        d.flagged
                          ? d.delta !== null && d.delta > 0
                            ? 'bg-emerald-50'
                            : 'bg-rose-50'
                          : ''
                      }`}
                    >
                      <div className={`font-medium ${BAND_COLOR[d.band] ?? ''}`}>
                        {d.averageScore ?? '—'}
                      </div>
                      <div className="text-[10px] text-slate-500">
                        {d.delta === null
                          ? d.band
                          : d.delta === 0
                            ? '±0.00'
                            : d.delta > 0
                              ? `+${d.delta.toFixed(2)}`
                              : d.delta.toFixed(2)}
                      </div>
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-slate-500">
        Color legend: green = team scoring meaningfully <strong>above</strong> campaign average;
        rose = meaningfully <strong>below</strong>. Numbers under each score show the delta
        vs the All-teams baseline (top row).
      </p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div>
      <div className="text-lg font-semibold">{value}</div>
      <div className="text-[11px] uppercase tracking-wide text-slate-500 mt-0.5">{label}</div>
    </div>
  );
}
