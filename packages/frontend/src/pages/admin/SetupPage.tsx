// ─── Card 4 ─ Submission Tracker ─────────────────────────────────────
function SubmissionTrackerCard({ companyId, campaignId }: { companyId: string; campaignId: string }) {
  const teams = useQuery({
    queryKey: ['teams', companyId],
    queryFn: () => api<TeamsResponse>(`/api/companies/${companyId}/teams`),
    enabled: !!companyId,
  });
  const invites = useQuery({
    queryKey: ['invites', campaignId],
    queryFn: () => api<InvitesResponse>(`/api/companies/${companyId}/campaigns/${campaignId}/invites`),
    enabled: !!companyId && !!campaignId,
  });

  if (teams.isLoading || invites.isLoading) return <div className="text-sm text-slate-500">Loading…</div>;
  if (teams.error || invites.error) return <div className="text-sm text-rose-600">Error loading tracker.</div>;
  const teamList = teams.data?.items ?? [];
  const inviteList = invites.data?.items ?? [];

  // Map teamId to stats
  const tracker = teamList.map((team) => {
    const teamInvites = inviteList.filter((inv) => inv.teamId === team.id);
    const completed = teamInvites.filter((inv) => inv.status === 'COMPLETED').length;
    return {
      teamName: team.name,
      total: teamInvites.length,
      completed,
    };
  });
  // Unassigned invites
  const unassignedInvites = inviteList.filter((inv) => !inv.teamId);
  const unassignedCompleted = unassignedInvites.filter((inv) => inv.status === 'COMPLETED').length;

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-6 mt-6">
      <div className="flex items-start gap-3 mb-5">
        <div className="w-9 h-9 rounded bg-blue-100 text-blue-700 flex items-center justify-center text-base">📊</div>
        <div>
          <h3 className="font-semibold text-base">Submission Tracker</h3>
          <p className="text-xs text-slate-500">Track survey completion by team for this cycle.</p>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-left text-xs uppercase text-slate-500 bg-slate-50 border-b border-slate-200">
              <th className="py-2 px-3">Team</th>
              <th className="py-2 px-3">Invited</th>
              <th className="py-2 px-3">Completed</th>
              <th className="py-2 px-3">Progress</th>
            </tr>
          </thead>
          <tbody>
            {tracker.map((row) => (
              <tr key={row.teamName} className="border-t border-slate-100">
                <td className="py-2 px-3">{row.teamName}</td>
                <td className="py-2 px-3">{row.total}</td>
                <td className="py-2 px-3">{row.completed}</td>
                <td className="py-2 px-3">
                  <div className="w-32 bg-slate-100 rounded-full h-3">
                    <div
                      className="bg-emerald-500 h-3 rounded-full"
                      style={{ width: `${row.total ? (100 * row.completed / row.total) : 0}%` }}
                    />
                  </div>
                  <span className="text-xs ml-2">{row.total ? Math.round(100 * row.completed / row.total) : 0}%</span>
                </td>
              </tr>
            ))}
            {unassignedInvites.length > 0 && (
              <tr className="border-t border-slate-100">
                <td className="py-2 px-3 text-slate-500">Unassigned</td>
                <td className="py-2 px-3">{unassignedInvites.length}</td>
                <td className="py-2 px-3">{unassignedCompleted}</td>
                <td className="py-2 px-3">
                  <div className="w-32 bg-slate-100 rounded-full h-3">
                    <div
                      className="bg-emerald-500 h-3 rounded-full"
                      style={{ width: `${unassignedInvites.length ? (100 * unassignedCompleted / unassignedInvites.length) : 0}%` }}
                    />
                  </div>
                  <span className="text-xs ml-2">{unassignedInvites.length ? Math.round(100 * unassignedCompleted / unassignedInvites.length) : 0}%</span>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Campaign as CampaignType, Company, Team } from '@space/shared';
import { api } from '../../lib/api';
import { useAuth } from '../../stores/auth';

interface CompaniesResponse { items: Company[]; }
interface TeamsResponse { items: Team[]; }

export default function SetupPage() {
  const role = useAuth((s) => s.user?.role);
  const qc = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const companies = useQuery({
    queryKey: ['companies'],
    queryFn: () => api<CompaniesResponse>('/api/companies'),
  });

  const items = companies.data?.items ?? [];
  const selectedCompany = items.find((c) => c.id === selected) ?? items[0] ?? null;
  const selectedId = selectedCompany?.id ?? null;

  const createCompany = useMutation({
    mutationFn: (body: { name: string; industry?: string; contactEmail?: string }) =>
      api<Company>('/api/companies', { method: 'POST', body }),
    onSuccess: (created) => {
      qc.invalidateQueries({ queryKey: ['companies'] });
      setSelected(created.id);
      setShowCreate(false);
    },
  });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <section className="lg:col-span-1 bg-white rounded-lg border border-slate-200 p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold">Companies</h2>
          {role === 'SUPER_ADMIN' && (
            <button
              onClick={() => setShowCreate((v) => !v)}
              className="text-xs px-2 py-1 rounded bg-slate-900 text-white hover:bg-slate-800"
            >
              {showCreate ? 'Cancel' : '+ New'}
            </button>
          )}
        </div>

        {showCreate && (
          <CompanyCreateForm
            onSubmit={(b) => createCompany.mutate(b)}
            pending={createCompany.isPending}
            error={createCompany.error?.message}
          />
        )}

        {companies.isLoading && <div className="text-sm text-slate-500">Loading…</div>}
        {companies.error && (
          <div className="text-sm text-red-600">{(companies.error as Error).message}</div>
        )}

        <ul className="divide-y divide-slate-100">
          {items.map((c) => (
            <li key={c.id}>
              <button
                onClick={() => setSelected(c.id)}
                className={`w-full text-left py-2 px-2 rounded text-sm flex items-center justify-between ${
                  c.id === selectedId ? 'bg-slate-100' : 'hover:bg-slate-50'
                }`}
              >
                <span>
                  <span className="font-medium">{c.name}</span>
                  {c.industry && <span className="text-slate-500 ml-2">· {c.industry}</span>}
                </span>
                {c.status === 'ARCHIVED' && (
                  <span className="text-xs text-slate-400">archived</span>
                )}
              </button>
            </li>
          ))}
          {!companies.isLoading && items.length === 0 && (
            <li className="text-sm text-slate-500 py-2">No companies yet.</li>
          )}
        </ul>
      </section>

      <section className="lg:col-span-2 space-y-6">
        {selectedCompany ? (
          <>
            <CompanyDetailCard company={selectedCompany} canEdit={role === 'SUPER_ADMIN' || role === 'COMPANY_ADMIN'} />
            <TeamsPanel companyId={selectedCompany.id} canEdit={role === 'SUPER_ADMIN' || role === 'COMPANY_ADMIN'} />
            <CampaignSetupSection companyId={selectedCompany.id} companyName={selectedCompany.name} canEdit={role === 'SUPER_ADMIN' || role === 'COMPANY_ADMIN' || role === 'ANALYST'} />
          </>
        ) : (
          <div className="bg-white rounded-lg border border-slate-200 p-8 text-center text-slate-500 text-sm">
            Select or create a company to begin.
          </div>
        )}
      </section>
    </div>
  );
}

function CompanyCreateForm({
  onSubmit,
  pending,
  error,
}: {
  onSubmit: (b: { name: string; industry?: string; contactEmail?: string }) => void;
  pending: boolean;
  error?: string;
}) {
  const [name, setName] = useState('');
  const [industry, setIndustry] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({
          name,
          industry: industry || undefined,
          contactEmail: contactEmail || undefined,
        });
      }}
      className="space-y-2 bg-slate-50 border border-slate-200 rounded p-3 mb-3"
    >
      <input
        required
        placeholder="Company name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="w-full border border-slate-300 rounded px-2 py-1 text-sm"
      />
      <input
        placeholder="Industry (optional)"
        value={industry}
        onChange={(e) => setIndustry(e.target.value)}
        className="w-full border border-slate-300 rounded px-2 py-1 text-sm"
      />
      <input
        type="email"
        placeholder="Contact email (optional)"
        value={contactEmail}
        onChange={(e) => setContactEmail(e.target.value)}
        className="w-full border border-slate-300 rounded px-2 py-1 text-sm"
      />
      {error && <div className="text-xs text-red-600">{error}</div>}
      <button
        disabled={pending}
        className="w-full bg-slate-900 text-white text-xs py-1.5 rounded hover:bg-slate-800 disabled:opacity-50"
      >
        {pending ? 'Creating…' : 'Create company'}
      </button>
    </form>
  );
}

function CompanyDetailCard({ company, canEdit }: { company: Company; canEdit: boolean }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(company.name);
  const [industry, setIndustry] = useState(company.industry ?? '');
  const [contactEmail, setContactEmail] = useState(company.contactEmail ?? '');

  const update = useMutation({
    mutationFn: (body: Partial<Company>) =>
      api<Company>(`/api/companies/${company.id}`, { method: 'PATCH', body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['companies'] });
      setEditing(false);
    },
  });

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold">{company.name}</h2>
        {canEdit && (
          <button
            onClick={() => setEditing((v) => !v)}
            className="text-xs px-2 py-1 rounded border border-slate-300 hover:bg-slate-50"
          >
            {editing ? 'Cancel' : 'Edit'}
          </button>
        )}
      </div>
      {editing ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            update.mutate({
              name,
              industry: industry || null,
              contactEmail: contactEmail || null,
            });
          }}
          className="space-y-2"
        >
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full border border-slate-300 rounded px-2 py-1 text-sm"
          />
          <input
            value={industry}
            onChange={(e) => setIndustry(e.target.value)}
            placeholder="Industry"
            className="w-full border border-slate-300 rounded px-2 py-1 text-sm"
          />
          <input
            type="email"
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
            placeholder="Contact email"
            className="w-full border border-slate-300 rounded px-2 py-1 text-sm"
          />
          {update.error && (
            <div className="text-xs text-red-600">{(update.error as Error).message}</div>
          )}
          <button
            disabled={update.isPending}
            className="bg-slate-900 text-white text-xs px-3 py-1.5 rounded hover:bg-slate-800 disabled:opacity-50"
          >
            {update.isPending ? 'Saving…' : 'Save'}
          </button>
        </form>
      ) : (
        <dl className="grid grid-cols-2 gap-2 text-sm">
          <dt className="text-slate-500">Industry</dt>
          <dd>{company.industry ?? '—'}</dd>
          <dt className="text-slate-500">Contact</dt>
          <dd>{company.contactEmail ?? '—'}</dd>
          <dt className="text-slate-500">Status</dt>
          <dd>{company.status}</dd>
          <dt className="text-slate-500">Named reporting</dt>
          <dd>{company.allowNamedReporting ? 'Allowed' : 'Anonymous only'}</dd>
        </dl>
      )}
    </div>
  );
}

function TeamsPanel({ companyId, canEdit }: { companyId: string; canEdit: boolean }) {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const teams = useQuery({
    queryKey: ['teams', companyId],
    queryFn: () => api<TeamsResponse>(`/api/companies/${companyId}/teams`),
  });

  const create = useMutation({
    mutationFn: (body: { name: string; managerName?: string; description?: string }) =>
      api<Team>(`/api/companies/${companyId}/teams`, { method: 'POST', body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['teams', companyId] });
      setShowCreate(false);
    },
  });

  const archive = useMutation({
    mutationFn: (teamId: string) =>
      api<void>(`/api/companies/${companyId}/teams/${teamId}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['teams', companyId] }),
  });

  const items = teams.data?.items ?? [];

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold">Teams</h2>
        {canEdit && (
          <button
            onClick={() => setShowCreate((v) => !v)}
            className="text-xs px-2 py-1 rounded bg-slate-900 text-white hover:bg-slate-800"
          >
            {showCreate ? 'Cancel' : '+ New team'}
          </button>
        )}
      </div>

      {showCreate && (
        <TeamCreateForm
          onSubmit={(b) => create.mutate(b)}
          pending={create.isPending}
          error={create.error?.message}
        />
      )}

      {teams.isLoading && <div className="text-sm text-slate-500">Loading…</div>}
      <table className="w-full text-sm">
        <thead className="text-left text-xs uppercase text-slate-500 border-b border-slate-200">
          <tr>
            <th className="py-2">Name</th>
            <th>Manager</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {items.map((t) => (
            <tr key={t.id} className="border-b border-slate-100">
              <td className="py-2 font-medium">{t.name}</td>
              <td>{t.managerName ?? '—'}</td>
              <td>
                <span
                  className={`text-xs px-2 py-0.5 rounded ${
                    t.status === 'ACTIVE'
                      ? 'bg-green-100 text-green-800'
                      : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {t.status}
                </span>
              </td>
              <td className="text-right">
                {canEdit && t.status === 'ACTIVE' && (
                  <button
                    onClick={() => archive.mutate(t.id)}
                    className="text-xs text-slate-500 hover:text-red-600"
                  >
                    Archive
                  </button>
                )}
              </td>
            </tr>
          ))}
          {items.length === 0 && !teams.isLoading && (
            <tr>
              <td colSpan={4} className="py-4 text-center text-slate-500 text-sm">
                No teams yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function TeamCreateForm({
  onSubmit,
  pending,
  error,
}: {
  onSubmit: (b: { name: string; managerName?: string; description?: string }) => void;
  pending: boolean;
  error?: string;
}) {
  const [name, setName] = useState('');
  const [managerName, setManagerName] = useState('');
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ name, managerName: managerName || undefined });
      }}
      className="flex gap-2 mb-3"
    >
      <input
        required
        placeholder="Team name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="flex-1 border border-slate-300 rounded px-2 py-1 text-sm"
      />
      <input
        placeholder="Manager (optional)"
        value={managerName}
        onChange={(e) => setManagerName(e.target.value)}
        className="flex-1 border border-slate-300 rounded px-2 py-1 text-sm"
      />
      <button
        disabled={pending}
        className="bg-slate-900 text-white text-xs px-3 rounded hover:bg-slate-800 disabled:opacity-50"
      >
        {pending ? '…' : 'Add'}
      </button>
      {error && <span className="text-xs text-red-600 self-center">{error}</span>}
    </form>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Campaign Setup Section (Survey Cycle / Survey Link Generator / Previous Cycle Scores)
// ─────────────────────────────────────────────────────────────────────────

interface CampaignsListResponse { items: CampaignType[]; }
interface QListItem { id: string; title: string; companyId: string | null; isActive: boolean }
interface QListResponse { items: QListItem[] }
interface InviteRow {
  id: string;
  campaignId: string;
  participantEmail: string | null;
  participantName: string | null;
  teamId: string | null;
  roleLabel: string | null;
  uniqueToken: string;
  status: string;
  createdAt: string;
}
interface InvitesResponse { items: InviteRow[] }

function CampaignSetupSection({
  companyId,
  companyName,
  canEdit,
}: {
  companyId: string;
  companyName: string;
  canEdit: boolean;
}) {
  const qc = useQueryClient();
  const [activeCampaignId, setActiveCampaignId] = useState<string | null>(null);
  const [creatingCampaign, setCreatingCampaign] = useState(false);

  const campaigns = useQuery({
    queryKey: ['campaigns', companyId],
    queryFn: () => api<CampaignsListResponse>(`/api/companies/${companyId}/campaigns`),
  });
  useEffect(() => {
    if (campaigns.data && !activeCampaignId) {
      const first = campaigns.data.items[0];
      if (first) setActiveCampaignId(first.id);
    }
  }, [campaigns.data, activeCampaignId]);
  // Reset selected campaign when switching companies
  useEffect(() => { setActiveCampaignId(null); }, [companyId]);

  const questionnaires = useQuery({
    queryKey: ['questionnaires'],
    queryFn: () => api<QListResponse>('/api/questionnaires'),
  });

  const createCampaign = useMutation({
    mutationFn: (body: { title: string; cycle?: string | null; questionnaireId: string }) =>
      api<CampaignType>(`/api/companies/${companyId}/campaigns`, { method: 'POST', body }),
    onSuccess: (created) => {
      qc.invalidateQueries({ queryKey: ['campaigns', companyId] });
      setActiveCampaignId(created.id);
      setCreatingCampaign(false);
    },
  });

  const items = campaigns.data?.items ?? [];
  const active = items.find((c) => c.id === activeCampaignId) ?? items[0] ?? null;
  const defaultQuestionnaireId = questionnaires.data?.items.find((q) => q.isActive)?.id
    ?? questionnaires.data?.items[0]?.id ?? '';

  return (
    <div className="space-y-6">
      {/* Cycle selector strip */}
      <div className="bg-white rounded-lg border border-slate-200 p-4 flex flex-wrap gap-3 items-center">
        <label className="text-xs uppercase tracking-wide text-slate-500 font-semibold">Survey cycle</label>
        <select
          value={active?.id ?? ''}
          onChange={(e) => setActiveCampaignId(e.target.value || null)}
          className="border border-slate-300 rounded px-2 py-1.5 text-sm min-w-[220px]"
        >
          {items.length === 0 && <option value="">— no cycles yet —</option>}
          {items.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}{c.cycle ? ` · ${c.cycle}` : ''} ({c.status})
            </option>
          ))}
        </select>
        {canEdit && (
          <button
            onClick={() => setCreatingCampaign((v) => !v)}
            className="ml-auto text-xs px-3 py-1.5 rounded bg-slate-900 text-white hover:bg-slate-800"
          >
            {creatingCampaign ? 'Cancel' : '+ New cycle'}
          </button>
        )}
      </div>

      {creatingCampaign && (
        <NewCycleForm
          pending={createCampaign.isPending}
          error={createCampaign.error?.message}
          defaultQuestionnaireId={defaultQuestionnaireId}
          onSubmit={(b) => createCampaign.mutate(b)}
        />
      )}

      {active ? (
        <>
          <OrgSetupCard companyName={companyName} campaign={active} canEdit={canEdit} companyId={companyId} />
          <SurveyLinkGeneratorCard campaignId={active.id} canEdit={canEdit} />
          <PreviousCycleScoresCard campaign={active} canEdit={canEdit} companyId={companyId} />
          <SubmissionTrackerCard companyId={companyId} campaignId={active.id} />
        </>
      ) : (
        !creatingCampaign && (
          <div className="bg-white rounded-lg border border-slate-200 p-8 text-center text-sm text-slate-500">
            Create a survey cycle to capture organisation setup, generate invitation links, and record previous-cycle baselines.
          </div>
        )
      )}
    </div>
  );
}

function NewCycleForm({
  onSubmit,
  pending,
  error,
  defaultQuestionnaireId,
}: {
  onSubmit: (b: { title: string; cycle: string | null; questionnaireId: string }) => void;
  pending: boolean;
  error?: string;
  defaultQuestionnaireId: string;
}) {
  const [title, setTitle] = useState('');
  const [cycle, setCycle] = useState('');
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!defaultQuestionnaireId) return;
        onSubmit({ title, cycle: cycle || null, questionnaireId: defaultQuestionnaireId });
      }}
      className="bg-white rounded-lg border border-slate-200 p-4 space-y-3"
    >
      <h3 className="font-semibold text-sm">Create new survey cycle</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Cycle title *">
          <input required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Platform Eng Q2 2026" className="w-full border border-slate-300 rounded px-3 py-2 text-sm" />
        </Field>
        <Field label="Cycle label">
          <input value={cycle} onChange={(e) => setCycle(e.target.value)} placeholder="e.g. Q2 2026" className="w-full border border-slate-300 rounded px-3 py-2 text-sm" />
        </Field>
      </div>
      {!defaultQuestionnaireId && (
        <div className="text-xs text-amber-700">No active questionnaire found — go to Questions and publish one first.</div>
      )}
      {error && <div className="text-xs text-red-600">{error}</div>}
      <button disabled={pending || !defaultQuestionnaireId} className="text-xs px-3 py-1.5 rounded bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-50">
        {pending ? 'Creating…' : 'Create cycle'}
      </button>
    </form>
  );
}

// ─── Card 1 ─ Organisation & Survey Setup ────────────────────────────────
function OrgSetupCard({
  companyName,
  campaign,
  canEdit,
  companyId,
}: {
  companyName: string;
  campaign: CampaignType;
  canEdit: boolean;
  companyId: string;
}) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState({
    title: campaign.title,
    cycle: campaign.cycle ?? '',
    assessmentLead: campaign.assessmentLead ?? '',
    vpEmail: campaign.vpEmail ?? '',
    targetRespondents: campaign.targetRespondents ?? '',
    previousCycleLabel: campaign.previousCycleLabel ?? '',
    closeDate: campaign.closeDate ? campaign.closeDate.slice(0, 10) : '',
    notes: campaign.notes ?? '',
  });
  useEffect(() => {
    setDraft({
      title: campaign.title,
      cycle: campaign.cycle ?? '',
      assessmentLead: campaign.assessmentLead ?? '',
      vpEmail: campaign.vpEmail ?? '',
      targetRespondents: campaign.targetRespondents ?? '',
      previousCycleLabel: campaign.previousCycleLabel ?? '',
      closeDate: campaign.closeDate ? campaign.closeDate.slice(0, 10) : '',
      notes: campaign.notes ?? '',
    });
  }, [campaign.id]);

  const save = useMutation({
    mutationFn: () =>
      api<CampaignType>(`/api/companies/${companyId}/campaigns/${campaign.id}`, {
        method: 'PATCH',
        body: {
          title: draft.title,
          cycle: draft.cycle || null,
          assessmentLead: draft.assessmentLead || null,
          vpEmail: draft.vpEmail || null,
          targetRespondents: draft.targetRespondents === '' ? null : Number(draft.targetRespondents),
          previousCycleLabel: draft.previousCycleLabel || null,
          closeDate: draft.closeDate ? new Date(draft.closeDate).toISOString() : null,
          notes: draft.notes || null,
        },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['campaigns', companyId] }),
  });

  const set = (k: keyof typeof draft, v: string | number) => setDraft({ ...draft, [k]: v });

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-6">
      <div className="flex items-start gap-3 mb-5">
        <div className="w-9 h-9 rounded bg-violet-100 text-violet-700 flex items-center justify-center text-base">🏢</div>
        <div>
          <h3 className="font-semibold text-base">Organisation &amp; Survey Setup</h3>
          <p className="text-xs text-slate-500">All fields here populate the survey header and phase reports</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Company name *">
          <input value={companyName} disabled className="w-full border border-slate-300 rounded px-3 py-2 text-sm bg-slate-50 text-slate-600" />
        </Field>
        <Field label="Cycle title *">
          <input value={draft.title} onChange={(e) => set('title', e.target.value)} disabled={!canEdit} className="w-full border border-slate-300 rounded px-3 py-2 text-sm" />
        </Field>
        <p className="text-[11px] text-slate-500 -mt-2 md:col-span-2 font-mono">Appears in all phase reports and survey headers</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
        <Field label="Survey cycle *">
          <input value={draft.cycle} onChange={(e) => set('cycle', e.target.value)} placeholder="e.g. Q2 2026" disabled={!canEdit} className="w-full border border-slate-300 rounded px-3 py-2 text-sm" />
        </Field>
        <Field label="Assessment lead *">
          <input value={draft.assessmentLead} onChange={(e) => set('assessmentLead', e.target.value)} placeholder="e.g. Jane Smith" disabled={!canEdit} className="w-full border border-slate-300 rounded px-3 py-2 text-sm" />
        </Field>
        <Field label="VP engineering email">
          <input type="email" value={draft.vpEmail} onChange={(e) => set('vpEmail', e.target.value)} placeholder="vp@company.com" disabled={!canEdit} className="w-full border border-slate-300 rounded px-3 py-2 text-sm" />
        </Field>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
        <Field label="Target respondents">
          <input type="number" min={1} value={draft.targetRespondents} onChange={(e) => set('targetRespondents', e.target.value)} placeholder="e.g. 50" disabled={!canEdit} className="w-full border border-slate-300 rounded px-3 py-2 text-sm" />
        </Field>
        <Field label="Previous cycle (for trend)">
          <input value={draft.previousCycleLabel} onChange={(e) => set('previousCycleLabel', e.target.value)} placeholder="e.g. Q1 2026" disabled={!canEdit} className="w-full border border-slate-300 rounded px-3 py-2 text-sm" />
        </Field>
        <Field label="Survey close date">
          <input type="date" value={draft.closeDate} onChange={(e) => set('closeDate', e.target.value)} disabled={!canEdit} className="w-full border border-slate-300 rounded px-3 py-2 text-sm" />
        </Field>
      </div>

      <div className="mt-4">
        <Field label="Assessment context / notes">
          <textarea value={draft.notes} onChange={(e) => set('notes', e.target.value)} rows={3} placeholder="e.g. Team recently migrated to Azure DevOps. First SPACE cycle for this team." disabled={!canEdit} className="w-full border border-slate-300 rounded px-3 py-2 text-sm resize-y min-h-[80px]" />
        </Field>
      </div>

      {canEdit && (
        <div className="mt-5 flex gap-2 items-center">
          <button
            onClick={() => save.mutate()}
            disabled={save.isPending}
            className="px-4 py-2 rounded bg-emerald-700 text-white text-sm font-semibold hover:bg-emerald-600 disabled:opacity-50"
          >
            {save.isPending ? 'Saving…' : '💾 Save setup'}
          </button>
          {save.isSuccess && <span className="text-xs text-emerald-700">Saved</span>}
          {save.error && <span className="text-xs text-red-600">{(save.error as Error).message}</span>}
        </div>
      )}
    </div>
  );
}

// ─── Card 2 ─ Survey Link Generator ─────────────────────────────────────
function SurveyLinkGeneratorCard({ campaignId, canEdit }: { campaignId: string; canEdit: boolean }) {
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-6">
      <div className="flex items-start gap-3 mb-5">
        <div className="w-9 h-9 rounded bg-indigo-100 text-indigo-700 flex items-center justify-center text-base">🔗</div>
        <div>
          <h3 className="font-semibold text-base">Survey Link Generator</h3>
          <p className="text-xs text-slate-500">Generate unique links for each developer, or copy the shared team link.</p>
        </div>
      </div>
      <SurveyLinkInner campaignId={campaignId} canEdit={canEdit} />
    </div>
  );
}

function SurveyLinkInner({ campaignId, canEdit }: { campaignId: string; canEdit: boolean }) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [squad, setSquad] = useState('');
  const [roleLabel, setRoleLabel] = useState('');
  const [copied, setCopied] = useState<string | null>(null);

  // Look up companyId for this campaign by reading from cached campaigns list (any key)
  const userCompanyId = useAuth.getState().user?.companyId ?? null;
  // We pass companyId via parent indirectly — but simplest is to require user's company OR fall back to URL search.
  // Use a robust approach: find any cached query holding this campaign.
  const allCampaignQueries = qc.getQueriesData<CampaignsListResponse>({ queryKey: ['campaigns'] });
  let companyId: string | null = userCompanyId;
  for (const [, data] of allCampaignQueries) {
    const hit = data?.items.find((c) => c.id === campaignId);
    if (hit) { companyId = hit.companyId; break; }
  }

  const invites = useQuery({
    queryKey: ['invites', campaignId],
    queryFn: () => api<InvitesResponse>(`/api/companies/${companyId}/campaigns/${campaignId}/invites`),
    enabled: !!companyId,
  });

  const create = useMutation({
    mutationFn: (body: { participantName?: string; participantEmail?: string; roleLabel?: string }) =>
      api<{ items: InviteRow[] }>(`/api/companies/${companyId}/campaigns/${campaignId}/invites`, {
        method: 'POST',
        body: { invites: [{ ...body, teamId: null }] },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invites', campaignId] });
      qc.invalidateQueries({ queryKey: ['campaigns', companyId] });
      setName(''); setEmail(''); setSquad(''); setRoleLabel('');
    },
  });

  const baseUrl = `${window.location.origin}/survey`;
  const sharedLink = `${baseUrl}/c/${campaignId}`;

  function inviteUrl(token: string) { return `${baseUrl}/${token}`; }

  async function copy(label: string, value: string) {
    try { await navigator.clipboard.writeText(value); setCopied(label); setTimeout(() => setCopied(null), 1500); } catch {}
  }

  const items = invites.data?.items ?? [];

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Field label="Developer name / email">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. alex@company.com" disabled={!canEdit} className="w-full border border-slate-300 rounded px-3 py-2 text-sm" />
        </Field>
        <Field label="Squad / sub-team">
          <input value={squad} onChange={(e) => setSquad(e.target.value)} placeholder="e.g. Precision Ag Platform" disabled={!canEdit} className="w-full border border-slate-300 rounded px-3 py-2 text-sm" />
        </Field>
        <Field label="Role">
          <select value={roleLabel} onChange={(e) => setRoleLabel(e.target.value)} disabled={!canEdit} className="w-full border border-slate-300 rounded px-3 py-2 text-sm">
            <option value="">Select role</option>
            <option>Engineer</option>
            <option>Senior Engineer</option>
            <option>Tech Lead</option>
            <option>Engineering Manager</option>
            <option>Architect</option>
            <option>SRE / DevOps</option>
            <option>QA / Test</option>
            <option>Other</option>
          </select>
        </Field>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
        <Field label="Email (optional)">
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="alex@company.com" disabled={!canEdit} className="w-full border border-slate-300 rounded px-3 py-2 text-sm" />
        </Field>
      </div>

      {canEdit && (
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            onClick={() => create.mutate({
              participantName: name || undefined,
              participantEmail: email || undefined,
              roleLabel: roleLabel ? `${roleLabel}${squad ? ` · ${squad}` : ''}` : (squad || undefined),
            })}
            disabled={create.isPending || !companyId}
            className="px-4 py-2 rounded bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 disabled:opacity-50"
          >
            {create.isPending ? 'Generating…' : '+ Add & generate link'}
          </button>
          <button
            onClick={() => copy('shared', sharedLink)}
            className="px-4 py-2 rounded border border-slate-300 text-slate-800 text-sm font-semibold hover:bg-slate-50"
          >
            📋 Copy shared team link
          </button>
        </div>
      )}

      <div className="mt-5 bg-slate-900 rounded-lg p-3 flex items-center gap-3 flex-wrap">
        <span className="font-mono text-[11px] text-emerald-300 uppercase tracking-wider">Shared link:</span>
        <code className="text-[12px] text-emerald-200 font-mono break-all flex-1 min-w-[200px]">{sharedLink}</code>
        <button onClick={() => copy('shared', sharedLink)} className="px-3 py-1 rounded bg-emerald-400 text-slate-900 text-xs font-bold hover:bg-emerald-300">
          {copied === 'shared' ? '✓ Copied' : 'Copy'}
        </button>
      </div>

      <div className="mt-5">
        <h4 className="text-xs uppercase tracking-wide font-semibold text-slate-500 mb-2">Individual survey links</h4>
        {!companyId && <div className="text-sm text-slate-500">Loading…</div>}
        {companyId && invites.isLoading && <div className="text-sm text-slate-500">Loading invites…</div>}
        {companyId && !invites.isLoading && items.length === 0 && (
          <div className="text-center text-sm text-slate-500 py-6 border border-dashed border-slate-200 rounded">
            <div className="text-2xl mb-1">📬</div>
            No recipients added yet. Add a developer above to generate their personalised link.
          </div>
        )}
        {items.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead className="bg-slate-900 text-slate-100 text-[10px] uppercase tracking-wider">
                <tr>
                  <th className="px-3 py-2 text-left">Name / Email</th>
                  <th className="px-3 py-2 text-left">Role / Squad</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-left">Link</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((inv) => (
                  <tr key={inv.id} className="border-b border-slate-100">
                    <td className="px-3 py-2 font-mono text-[11px]">{inv.participantName ?? inv.participantEmail ?? '—'}</td>
                    <td className="px-3 py-2 font-mono text-[11px] text-slate-600">{inv.roleLabel ?? '—'}</td>
                    <td className="px-3 py-2"><span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase ${inv.status === 'COMPLETED' ? 'bg-emerald-100 text-emerald-700' : inv.status === 'STARTED' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>{inv.status}</span></td>
                    <td className="px-3 py-2 font-mono text-[11px] text-emerald-700 truncate max-w-[260px]">{inviteUrl(inv.uniqueToken)}</td>
                    <td className="px-3 py-2 text-right">
                      <button onClick={() => copy(inv.id, inviteUrl(inv.uniqueToken))} className="text-xs px-2 py-1 rounded bg-emerald-600 text-white hover:bg-emerald-500">
                        {copied === inv.id ? '✓' : 'Copy'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

// ─── Card 3 ─ Previous Cycle Scores ─────────────────────────────────────
function PreviousCycleScoresCard({
  campaign,
  canEdit,
  companyId,
}: {
  campaign: CampaignType;
  canEdit: boolean;
  companyId: string;
}) {
  const qc = useQueryClient();
  const [values, setValues] = useState({
    S: campaign.previousS?.toString() ?? '',
    P: campaign.previousP?.toString() ?? '',
    A: campaign.previousA?.toString() ?? '',
    C: campaign.previousC?.toString() ?? '',
    E: campaign.previousE?.toString() ?? '',
  });
  useEffect(() => {
    setValues({
      S: campaign.previousS?.toString() ?? '',
      P: campaign.previousP?.toString() ?? '',
      A: campaign.previousA?.toString() ?? '',
      C: campaign.previousC?.toString() ?? '',
      E: campaign.previousE?.toString() ?? '',
    });
  }, [campaign.id]);

  const save = useMutation({
    mutationFn: () =>
      api<CampaignType>(`/api/companies/${companyId}/campaigns/${campaign.id}`, {
        method: 'PATCH',
        body: {
          previousS: values.S === '' ? null : Number(values.S),
          previousP: values.P === '' ? null : Number(values.P),
          previousA: values.A === '' ? null : Number(values.A),
          previousC: values.C === '' ? null : Number(values.C),
          previousE: values.E === '' ? null : Number(values.E),
        },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['campaigns', companyId] }),
  });

  const dims: { code: keyof typeof values; label: string }[] = [
    { code: 'S', label: 'Satisfaction (prev)' },
    { code: 'P', label: 'Performance (prev)' },
    { code: 'A', label: 'Activity (prev)' },
    { code: 'C', label: 'Communication (prev)' },
    { code: 'E', label: 'Efficiency (prev)' },
  ];

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-6">
      <div className="flex items-start gap-3 mb-2">
        <div className="w-9 h-9 rounded bg-amber-100 text-amber-700 flex items-center justify-center text-base">📈</div>
        <div>
          <h3 className="font-semibold text-base">Previous Cycle Scores <span className="text-xs font-normal text-slate-500 ml-1">(for trend analysis)</span></h3>
          <p className="text-xs text-slate-500">Enter the last cycle's dimension averages to enable Phase 1 trend detection. Leave blank for first cycle.</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-5">
        {dims.map(({ code, label }) => (
          <Field key={code} label={`${code} — ${label}`}>
            <input
              type="number"
              min={0}
              max={5}
              step={0.1}
              value={values[code]}
              onChange={(e) => setValues({ ...values, [code]: e.target.value })}
              placeholder={`e.g. 3.${code === 'S' ? '2' : code === 'P' ? '5' : code === 'A' ? '8' : code === 'C' ? '1' : '0'}`}
              disabled={!canEdit}
              className="w-full border border-slate-300 rounded px-3 py-2 text-sm"
            />
          </Field>
        ))}
      </div>

      {canEdit && (
        <div className="mt-4 flex gap-2 items-center">
          <button
            onClick={() => save.mutate()}
            disabled={save.isPending}
            className="px-4 py-2 rounded border border-slate-300 text-slate-800 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50"
          >
            {save.isPending ? 'Saving…' : 'Save previous scores'}
          </button>
          {save.isSuccess && <span className="text-xs text-emerald-700">Saved</span>}
          {save.error && <span className="text-xs text-red-600">{(save.error as Error).message}</span>}
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-600 mb-1">{label}</span>
      {children}
    </label>
  );
}
