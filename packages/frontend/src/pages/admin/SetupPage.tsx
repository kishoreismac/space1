import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Company, Team } from '@space/shared';
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
