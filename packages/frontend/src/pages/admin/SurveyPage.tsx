import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import type { Campaign, Company, PublicSurveyContext } from '@space/shared';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../stores/auth';
import { SurveyFlow } from '../survey/SurveyLanding';

interface CompaniesResponse { items: Company[]; }
interface CampaignsResponse { items: Campaign[]; }

/**
 * Admin Survey page.
 *
 * Replaces the old campaign workspace: the admin now sees the FULL
 * participant questionnaire inline and can submit a sample response that
 * feeds the downstream phases (P1 triage, P2 themes, etc.).
 *
 * Flow:
 *   1. Pick company + campaign at the top.
 *   2. POST /api/public/campaigns/:campaignId/join → mint a one-off anonymous invite token.
 *   3. GET /api/public/survey/:token → load the questionnaire.
 *   4. Reuse the existing <SurveyFlow> component used by /survey/:token participants.
 *
 * The admin can submit; the response is tracked on the campaign just like any
 * other respondent.
 */
export default function SurveyPage() {
  const role = useAuth((s) => s.user?.role);
  const userCompanyId = useAuth((s) => s.user?.companyId ?? null);
  const [companyId, setCompanyId] = useState<string | null>(userCompanyId);
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);

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
    const list = campaigns.data?.items ?? [];
    const firstActive = list.find((c) => c.status === 'ACTIVE') ?? list[0];
    if (!campaignId && firstActive) setCampaignId(firstActive.id);
  }, [campaigns.data, campaignId]);

  // Reset token when campaign changes
  useEffect(() => {
    setToken(null);
    setJoinError(null);
  }, [campaignId]);

  const join = useMutation({
    mutationFn: async (cid: string) => {
      const r = await api<{ token: string }>(`/api/public/campaigns/${cid}/join`, {
        method: 'POST',
        body: {},
        auth: false,
      });
      return r.token;
    },
    onSuccess: (t) => setToken(t),
    onError: (e) => setJoinError((e as ApiError).message),
  });

  const ctx = useQuery({
    queryKey: ['admin-survey', token],
    queryFn: () =>
      api<PublicSurveyContext>(`/api/public/survey/${token}`, { auth: false }),
    enabled: !!token,
    retry: false,
  });

  const selectedCampaign = campaigns.data?.items.find((c) => c.id === campaignId);

  return (
    <div className="space-y-6">
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="rounded-lg bg-slate-900 text-white p-6 md:p-8 relative overflow-hidden">
        <div className="absolute right-4 top-2 font-serif text-[6rem] leading-none text-white/5 select-none pointer-events-none">
          ◆
        </div>
        <div className="relative">
          <div className="text-[10px] font-mono uppercase tracking-[4px] text-teal-300 mb-2">
            Survey Preview & Test Submission
          </div>
          <h1 className="font-serif text-2xl md:text-3xl font-semibold">
            Take the full SPACE questionnaire
          </h1>
          <p className="text-sm text-slate-300 mt-2 max-w-2xl">
            Open the live survey for any campaign and submit a test response. Your answers will be
            recorded against the selected campaign and feed Phase 1 — Phase 5 analysis.
          </p>
        </div>
      </section>

      {/* ── Selector ─────────────────────────────────────────────────────── */}
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
        <div className="flex-1" />
        {campaignId && !token && (
          <button
            onClick={() => join.mutate(campaignId)}
            disabled={join.isPending}
            className="px-4 py-2 rounded bg-emerald-700 text-white text-sm font-semibold hover:bg-emerald-800 disabled:opacity-50"
          >
            {join.isPending ? 'Opening…' : '▶ Open survey'}
          </button>
        )}
        {token && (
          <button
            onClick={() => { setToken(null); setJoinError(null); }}
            className="px-3 py-2 rounded border border-slate-300 text-sm hover:bg-slate-50"
          >
            Start a new test submission
          </button>
        )}
      </div>

      {joinError && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded p-3 text-sm">
          {joinError}
        </div>
      )}

      {/* ── Empty state ──────────────────────────────────────────────────── */}
      {!campaignId && (
        <div className="bg-white rounded-lg border border-slate-200 p-8 text-center text-sm text-slate-500">
          Pick a campaign above to load its questionnaire.
        </div>
      )}

      {campaignId && !token && !join.isPending && (
        <div className="bg-white rounded-lg border border-slate-200 p-8 text-center text-sm text-slate-500">
          {selectedCampaign ? (
            <>
              Click <strong>Open survey</strong> to load the full questionnaire for{' '}
              <strong>{selectedCampaign.title}</strong> and submit a test response.
            </>
          ) : (
            'Loading campaign…'
          )}
        </div>
      )}

      {/* ── The survey itself ────────────────────────────────────────────── */}
      {token && ctx.isLoading && (
        <div className="bg-white rounded-lg border border-slate-200 p-8 text-center text-sm text-slate-500">
          Loading questionnaire…
        </div>
      )}
      {token && ctx.error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded p-4 text-sm">
          {(ctx.error as Error).message}
        </div>
      )}
      {token && ctx.data && (
        <div className="rounded-lg overflow-hidden border border-slate-200 shadow-sm">
          <SurveyFlow token={token} context={ctx.data} />
        </div>
      )}
    </div>
  );
}
