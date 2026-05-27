import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Campaign, Company, Invite, PublicQuestionnaire } from '@space/shared';
import { api } from '../../lib/api';
import { useAuth } from '../../stores/auth';

interface CompaniesResponse { items: Company[]; }
interface CampaignsResponse { items: Campaign[]; }
interface InvitesResponse { items: Invite[]; }
interface QuestionnairesResponse { items: PublicQuestionnaire[]; }
interface CampaignDetail extends Campaign {
  stats: { inviteCount: number; submissionCount: number; completedInvites: number };
}

export default function SurveyPage() {
  const role = useAuth((s) => s.user?.role);
  const userCompanyId = useAuth((s) => s.user?.companyId ?? null);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(userCompanyId);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);

  const companies = useQuery({
    queryKey: ['companies'],
    queryFn: () => api<CompaniesResponse>('/api/companies'),
  });

  useEffect(() => {
    const first = companies.data?.items[0];
    if (!selectedCompanyId && first) {
      setSelectedCompanyId(first.id);
    }
  }, [companies.data, selectedCompanyId]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold">Survey campaigns</h1>
        <p className="text-sm text-slate-500">
          Create a campaign tied to a questionnaire, generate invite links, and track responses.
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {role === 'SUPER_ADMIN' && (
          <aside className="lg:col-span-1 bg-white rounded-lg border border-slate-200 p-4">
            <h2 className="font-semibold mb-2 text-sm">Company</h2>
            <select
              value={selectedCompanyId ?? ''}
              onChange={(e) => {
                setSelectedCompanyId(e.target.value || null);
                setSelectedCampaignId(null);
              }}
              className="w-full border border-slate-300 rounded px-2 py-1 text-sm"
            >
              <option value="">— pick a company —</option>
              {companies.data?.items.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </aside>
        )}

        <section className={role === 'SUPER_ADMIN' ? 'lg:col-span-2' : 'lg:col-span-3'}>
          {selectedCompanyId ? (
            <CampaignWorkspace
              companyId={selectedCompanyId}
              selectedCampaignId={selectedCampaignId}
              onSelect={setSelectedCampaignId}
            />
          ) : (
            <div className="bg-white rounded-lg border border-slate-200 p-8 text-center text-sm text-slate-500">
              Select a company to manage its campaigns.
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function CampaignWorkspace({
  companyId,
  selectedCampaignId,
  onSelect,
}: {
  companyId: string;
  selectedCampaignId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);

  const campaigns = useQuery({
    queryKey: ['campaigns', companyId],
    queryFn: () => api<CampaignsResponse>(`/api/companies/${companyId}/campaigns`),
  });
  const questionnaires = useQuery({
    queryKey: ['questionnaires'],
    queryFn: () => api<QuestionnairesResponse>('/api/questionnaires'),
  });

  const create = useMutation({
    mutationFn: (body: { questionnaireId: string; title: string }) =>
      api<Campaign>(`/api/companies/${companyId}/campaigns`, { method: 'POST', body }),
    onSuccess: (created) => {
      qc.invalidateQueries({ queryKey: ['campaigns', companyId] });
      onSelect(created.id);
      setShowCreate(false);
    },
  });

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg border border-slate-200 p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-sm">Campaigns</h2>
          <button
            onClick={() => setShowCreate((v) => !v)}
            className="text-xs px-2 py-1 rounded bg-slate-900 text-white hover:bg-slate-800"
          >
            {showCreate ? 'Cancel' : '+ New campaign'}
          </button>
        </div>

        {showCreate && (
          <CampaignCreateForm
            questionnaires={questionnaires.data?.items ?? []}
            pending={create.isPending}
            error={create.error?.message}
            onSubmit={(b) => create.mutate(b)}
          />
        )}

        {campaigns.isLoading && <div className="text-sm text-slate-500">Loading…</div>}
        <ul className="divide-y divide-slate-100">
          {campaigns.data?.items.map((c) => (
            <li key={c.id}>
              <button
                onClick={() => onSelect(c.id)}
                className={`w-full text-left py-2 px-2 rounded text-sm flex items-center justify-between ${
                  c.id === selectedCampaignId ? 'bg-slate-100' : 'hover:bg-slate-50'
                }`}
              >
                <span>
                  <span className="font-medium">{c.title}</span>
                  {c.cycle && <span className="text-slate-500 ml-2">· {c.cycle}</span>}
                </span>
                <StatusPill status={c.status} />
              </button>
            </li>
          ))}
          {!campaigns.isLoading && (campaigns.data?.items.length ?? 0) === 0 && (
            <li className="text-sm text-slate-500 py-2">No campaigns yet.</li>
          )}
        </ul>
      </div>

      {selectedCampaignId && (
        <CampaignDetailPanel companyId={companyId} campaignId={selectedCampaignId} />
      )}
    </div>
  );
}

function CampaignCreateForm({
  questionnaires,
  pending,
  error,
  onSubmit,
}: {
  questionnaires: PublicQuestionnaire[];
  pending: boolean;
  error?: string;
  onSubmit: (b: { questionnaireId: string; title: string }) => void;
}) {
  const [title, setTitle] = useState('');
  const [questionnaireId, setQuestionnaireId] = useState(questionnaires[0]?.id ?? '');

  useEffect(() => {
    if (!questionnaireId && questionnaires[0]) setQuestionnaireId(questionnaires[0].id);
  }, [questionnaires, questionnaireId]);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!questionnaireId) return;
        onSubmit({ questionnaireId, title });
      }}
      className="space-y-2 bg-slate-50 border border-slate-200 rounded p-3 mb-3"
    >
      <input
        required
        placeholder="Campaign title (e.g. Q1 2026 Pulse)"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="w-full border border-slate-300 rounded px-2 py-1 text-sm"
      />
      <select
        value={questionnaireId}
        onChange={(e) => setQuestionnaireId(e.target.value)}
        className="w-full border border-slate-300 rounded px-2 py-1 text-sm"
      >
        {questionnaires.map((q) => (
          <option key={q.id} value={q.id}>
            {q.title}
          </option>
        ))}
      </select>
      {error && <div className="text-xs text-red-600">{error}</div>}
      <button
        disabled={pending || !questionnaireId}
        className="w-full bg-slate-900 text-white text-xs py-1.5 rounded hover:bg-slate-800 disabled:opacity-50"
      >
        {pending ? 'Creating…' : 'Create campaign'}
      </button>
    </form>
  );
}

function CampaignDetailPanel({ companyId, campaignId }: { companyId: string; campaignId: string }) {
  const qc = useQueryClient();
  const base = `/api/companies/${companyId}/campaigns/${campaignId}`;

  const detail = useQuery({
    queryKey: ['campaign', campaignId],
    queryFn: () => api<CampaignDetail>(base),
  });
  const invites = useQuery({
    queryKey: ['invites', campaignId],
    queryFn: () => api<InvitesResponse>(`${base}/invites`),
  });

  const [count, setCount] = useState(5);
  const addInvites = useMutation({
    mutationFn: (n: number) =>
      api<InvitesResponse>(`${base}/invites`, { method: 'POST', body: { count: n } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invites', campaignId] });
      qc.invalidateQueries({ queryKey: ['campaign', campaignId] });
    },
  });

  const updateStatus = useMutation({
    mutationFn: (status: Campaign['status']) =>
      api<Campaign>(base, { method: 'PATCH', body: { status } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['campaign', campaignId] });
      qc.invalidateQueries({ queryKey: ['campaigns', companyId] });
    },
  });

  if (detail.isLoading) return <div className="text-sm text-slate-500">Loading campaign…</div>;
  if (!detail.data) return null;
  const c = detail.data;

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-5 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold">{c.title}</h3>
          <p className="text-xs text-slate-500">{c.cycle ?? 'No cycle set'}</p>
        </div>
        <div className="flex items-center gap-2">
          <StatusPill status={c.status} />
          {c.status !== 'CLOSED' && c.status !== 'ARCHIVED' && (
            <button
              onClick={() => updateStatus.mutate('CLOSED')}
              className="text-xs px-2 py-1 rounded border border-slate-300 hover:bg-slate-50"
            >
              Close
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 text-center">
        <Stat label="Invites" value={c.stats.inviteCount} />
        <Stat label="Started/Completed" value={c.stats.completedInvites} />
        <Stat label="Submissions" value={c.stats.submissionCount} />
      </div>

      <div className="border-t border-slate-100 pt-4">
        <div className="flex items-center justify-between mb-3">
          <h4 className="font-semibold text-sm">Invites</h4>
          <form
            className="flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              addInvites.mutate(count);
            }}
          >
            <input
              type="number"
              min={1}
              max={500}
              value={count}
              onChange={(e) => setCount(Math.max(1, Number(e.target.value || 1)))}
              className="w-20 border border-slate-300 rounded px-2 py-1 text-xs"
            />
            <button
              disabled={addInvites.isPending}
              className="text-xs px-3 py-1 rounded bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {addInvites.isPending ? 'Generating…' : '+ Generate invites'}
            </button>
          </form>
        </div>

        {invites.isLoading && <div className="text-sm text-slate-500">Loading…</div>}
        {invites.data && invites.data.items.length === 0 && (
          <div className="text-sm text-slate-500">
            No invites yet. Generate some to share survey links.
          </div>
        )}
        {invites.data && invites.data.items.length > 0 && (
          <InviteList items={invites.data.items} />
        )}
      </div>
    </div>
  );
}

function InviteList({ items }: { items: Invite[] }) {
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
  return (
    <ul className="divide-y divide-slate-100 text-sm">
      {items.map((inv) => {
        const url = `${baseUrl}/survey/${inv.uniqueToken}`;
        return (
          <li key={inv.id} className="py-2 flex items-center gap-3">
            <span className="w-24 text-xs">
              <StatusPill status={inv.status} />
            </span>
            <code className="flex-1 truncate text-xs text-slate-600">{url}</code>
            <button
              onClick={() => navigator.clipboard?.writeText(url)}
              className="text-xs px-2 py-1 rounded border border-slate-300 hover:bg-slate-50"
            >
              Copy
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-slate-50 border border-slate-200 rounded py-3">
      <div className="text-2xl font-semibold">{value}</div>
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
    </div>
  );
}

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-slate-200 text-slate-700',
  ACTIVE: 'bg-emerald-100 text-emerald-700',
  CLOSED: 'bg-amber-100 text-amber-800',
  ARCHIVED: 'bg-slate-100 text-slate-500',
  SENT: 'bg-sky-100 text-sky-700',
  STARTED: 'bg-indigo-100 text-indigo-700',
  COMPLETED: 'bg-emerald-100 text-emerald-700',
  EXPIRED: 'bg-amber-100 text-amber-800',
  VOIDED: 'bg-red-100 text-red-700',
};

function StatusPill({ status }: { status: string }) {
  return (
    <span
      className={`inline-block text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded ${
        STATUS_COLORS[status] ?? 'bg-slate-100 text-slate-600'
      }`}
    >
      {status}
    </span>
  );
}

// end
