import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Campaign, Company } from '@space/shared';
import { api } from '../../lib/api';
import { useAuth } from '../../stores/auth';
import { PhaseShell } from '../../components/PhaseShell';

interface CompaniesResponse { items: Company[]; }
interface CampaignsResponse { items: Campaign[]; }

type Severity = 'P1' | 'P2' | 'P3' | 'P4';
type AIFit = 'INVESTIGATE' | 'CANDIDATE' | 'STRONG_FIT' | 'NOT_FIT';
type BlockerStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'DROPPED';
type SignalType =
  | 'DORA' | 'PR' | 'CICD' | 'IDE' | 'INCIDENT'
  | 'CALENDAR' | 'SLACK' | 'JOURNEY_MAP' | 'SURVEY' | 'THEME' | 'OTHER';

interface Blocker {
  id: string;
  title: string;
  description: string | null;
  sourcePhase: string | null;
  dimensionCode: string | null;
  sdlcPhase: string | null;
  severity: Severity;
  affectedTeams: string | null;
  reachPercentage: number | null;
  estimatedHoursLost: number | null;
  evidenceSummary: string | null;
  aiFit: AIFit;
  status: BlockerStatus;
  signalCount: number;
  feasibilityScore: number | null;
  feasibilityClass: string | null;
}
interface BlockersResponse { items: Blocker[]; }

interface Signal {
  id: string;
  blockerId: string;
  signalType: SignalType;
  signalName: string;
  evidenceValue: string | null;
  evidenceDescription: string | null;
  confirmed: boolean;
}
interface SignalsResponse { items: Signal[]; }

interface Candidates {
  dimensions: { code: string; name: string; avgScore: number; responses: number }[];
  themes: {
    id: string;
    themeName: string;
    respondentCount: number;
    percentage: number;
    jtbdStatement: string | null;
    status: string;
  }[];
  journeySteps: {
    id: string;
    stepName: string;
    dotVotes: number;
    rootCause: string | null;
    jtbdStatement: string | null;
    facilitator: string | null;
  }[];
}

const SEV_COLORS: Record<Severity, string> = {
  P1: 'bg-red-100 text-red-700 border-red-300',
  P2: 'bg-orange-100 text-orange-700 border-orange-300',
  P3: 'bg-amber-100 text-amber-800 border-amber-300',
  P4: 'bg-slate-100 text-slate-600 border-slate-300',
};
const AI_FIT_COLORS: Record<AIFit, string> = {
  STRONG_FIT: 'bg-emerald-100 text-emerald-700 border-emerald-300',
  CANDIDATE: 'bg-sky-100 text-sky-700 border-sky-300',
  INVESTIGATE: 'bg-slate-100 text-slate-600 border-slate-300',
  NOT_FIT: 'bg-rose-100 text-rose-700 border-rose-300',
};

export default function TriangulationPage() {
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
    <PhaseShell phase="P3">
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
        <TriangulationWorkspace companyId={companyId} campaignId={campaignId} />
      ) : (
        <div className="bg-white rounded-lg border border-slate-200 p-8 text-center text-sm text-slate-500">
          Pick a campaign to triangulate.
        </div>
      )}
    </div>
    </PhaseShell>
  );
}

function TriangulationWorkspace({
  companyId,
  campaignId,
}: {
  companyId: string;
  campaignId: string;
}) {
  const qc = useQueryClient();
  const base = `/api/companies/${companyId}/campaigns/${campaignId}/triangulation`;
  const [selectedBlockerId, setSelectedBlockerId] = useState<string | null>(null);

  const blockers = useQuery({
    queryKey: ['blockers', campaignId],
    queryFn: () => api<BlockersResponse>(`${base}/blockers`),
  });
  const candidates = useQuery({
    queryKey: ['candidates', campaignId],
    queryFn: () => api<Candidates>(`${base}/candidates`),
  });

  useEffect(() => {
    if (!selectedBlockerId && blockers.data?.items[0]) {
      setSelectedBlockerId(blockers.data.items[0].id);
    }
  }, [blockers.data, selectedBlockerId]);

  const create = useMutation({
    mutationFn: (body: Partial<Blocker> & { title: string }) =>
      api<Blocker>(`${base}/blockers`, { method: 'POST', body }),
    onSuccess: (b) => {
      qc.invalidateQueries({ queryKey: ['blockers', campaignId] });
      setSelectedBlockerId(b.id);
    },
  });

  const seedFromDimension = (
    d: Candidates['dimensions'][number],
  ) =>
    create.mutate({
      title: `Low ${d.name} score (${d.avgScore})`,
      severity: 'P3',
      sourcePhase: 'QUANTITATIVE',
      dimensionCode: d.code,
      evidenceSummary: `Avg ${d.avgScore} across ${d.responses} responses`,
    });
  const seedFromTheme = (t: Candidates['themes'][number]) =>
    create.mutate({
      title: t.themeName,
      severity: 'P2',
      sourcePhase: 'OPEN_TEXT',
      reachPercentage: t.percentage,
      evidenceSummary: t.jtbdStatement ?? `${t.respondentCount} respondents`,
    });
  const seedFromStep = (s: Candidates['journeySteps'][number]) =>
    create.mutate({
      title: s.stepName,
      severity: 'P2',
      sourcePhase: 'JOURNEY',
      evidenceSummary: s.rootCause ?? `${s.dotVotes} dot-votes`,
    });

  return (
    <div className="space-y-6">
      <CandidatesPanel
        candidates={candidates.data}
        loading={candidates.isLoading}
        onSeedDim={seedFromDimension}
        onSeedTheme={seedFromTheme}
        onSeedStep={seedFromStep}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <aside className="lg:col-span-1 bg-white rounded-lg border border-slate-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-sm">Blockers</h2>
            <button
              onClick={() =>
                create.mutate({
                  title: 'New blocker',
                  severity: 'P3',
                  sourcePhase: 'MANUAL',
                })
              }
              className="text-xs px-2 py-1 rounded bg-slate-900 text-white hover:bg-slate-800"
            >
              + Manual
            </button>
          </div>
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
                    <span
                      className={`text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded border ${SEV_COLORS[b.severity]}`}
                    >
                      {b.severity}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    {b.signalCount} signals · {b.aiFit.replace('_', ' ')} · {b.status}
                  </div>
                </button>
              </li>
            ))}
            {!blockers.isLoading && (blockers.data?.items.length ?? 0) === 0 && (
              <li className="text-sm text-slate-500 py-2">No blockers yet — seed one above.</li>
            )}
          </ul>
        </aside>

        <section className="lg:col-span-2">
          {selectedBlockerId ? (
            <BlockerDetail
              base={base}
              campaignId={campaignId}
              blockerId={selectedBlockerId}
              onDeleted={() => {
                setSelectedBlockerId(null);
                qc.invalidateQueries({ queryKey: ['blockers', campaignId] });
              }}
            />
          ) : (
            <div className="bg-white rounded-lg border border-slate-200 p-8 text-center text-sm text-slate-500">
              Select or create a blocker.
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function CandidatesPanel({
  candidates,
  loading,
  onSeedDim,
  onSeedTheme,
  onSeedStep,
}: {
  candidates: Candidates | undefined;
  loading: boolean;
  onSeedDim: (d: Candidates['dimensions'][number]) => void;
  onSeedTheme: (t: Candidates['themes'][number]) => void;
  onSeedStep: (s: Candidates['journeySteps'][number]) => void;
}) {
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-5">
      <h3 className="font-semibold text-sm mb-3">Candidate signals</h3>
      {loading && <div className="text-sm text-slate-500">Loading…</div>}
      {candidates && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <Candidate
            title="Low-scoring dimensions"
            empty="All dimensions above 3.5."
            items={candidates.dimensions}
            render={(d) => (
              <>
                <div className="font-medium">
                  {d.name}{' '}
                  <span className="text-xs text-slate-500">({d.code})</span>
                </div>
                <div className="text-xs text-slate-600">
                  Avg {d.avgScore} · {d.responses} responses
                </div>
              </>
            )}
            onSeed={onSeedDim}
          />
          <Candidate
            title="Top themes"
            empty="No promote/investigate themes yet."
            items={candidates.themes}
            render={(t) => (
              <>
                <div className="font-medium">{t.themeName}</div>
                <div className="text-xs text-slate-600">
                  {t.percentage}% · {t.respondentCount} respondents · {t.status}
                </div>
              </>
            )}
            onSeed={onSeedTheme}
          />
          <Candidate
            title="Red journey steps"
            empty="No red friction steps logged."
            items={candidates.journeySteps}
            render={(s) => (
              <>
                <div className="font-medium">{s.stepName}</div>
                <div className="text-xs text-slate-600">
                  {s.dotVotes} votes
                  {s.rootCause ? ` · ${s.rootCause}` : ''}
                </div>
              </>
            )}
            onSeed={onSeedStep}
          />
        </div>
      )}
    </div>
  );
}

function Candidate<T>({
  title,
  items,
  empty,
  render,
  onSeed,
}: {
  title: string;
  items: T[];
  empty: string;
  render: (it: T) => React.ReactNode;
  onSeed: (it: T) => void;
}) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
        {title}
      </div>
      {items.length === 0 ? (
        <div className="text-xs text-slate-400 italic">{empty}</div>
      ) : (
        <ul className="space-y-2">
          {items.map((it, i) => (
            <li
              key={i}
              className="border border-slate-200 rounded p-2 flex items-start justify-between gap-2"
            >
              <div className="flex-1 min-w-0">{render(it)}</div>
              <button
                onClick={() => onSeed(it)}
                className="text-xs px-2 py-0.5 rounded bg-slate-900 text-white hover:bg-slate-800 shrink-0"
              >
                + Seed
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function BlockerDetail({
  base,
  campaignId,
  blockerId,
  onDeleted,
}: {
  base: string;
  campaignId: string;
  blockerId: string;
  onDeleted: () => void;
}) {
  const qc = useQueryClient();
  const blockers = useQuery({
    queryKey: ['blockers', campaignId],
    queryFn: () => api<BlockersResponse>(`${base}/blockers`),
  });
  const blocker = blockers.data?.items.find((b) => b.id === blockerId) ?? null;

  const signals = useQuery({
    queryKey: ['signals', blockerId],
    queryFn: () => api<SignalsResponse>(`${base}/blockers/${blockerId}/signals`),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['blockers', campaignId] });
    qc.invalidateQueries({ queryKey: ['signals', blockerId] });
  };

  const update = useMutation({
    mutationFn: (body: Partial<Blocker>) =>
      api<Blocker>(`${base}/blockers/${blockerId}`, { method: 'PATCH', body }),
    onSuccess: invalidate,
  });
  const del = useMutation({
    mutationFn: () => api(`${base}/blockers/${blockerId}`, { method: 'DELETE' }),
    onSuccess: onDeleted,
  });
  const addSignal = useMutation({
    mutationFn: (body: Partial<Signal> & { signalType: SignalType; signalName: string }) =>
      api<Signal>(`${base}/blockers/${blockerId}/signals`, {
        method: 'POST',
        body,
      }),
    onSuccess: invalidate,
  });
  const updateSignal = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<Signal> }) =>
      api<Signal>(`${base}/signals/${id}`, { method: 'PATCH', body }),
    onSuccess: invalidate,
  });
  const delSignal = useMutation({
    mutationFn: (id: string) => api(`${base}/signals/${id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  });

  if (!blocker) return <div className="text-sm text-slate-500">Loading blocker…</div>;

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg border border-slate-200 p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <input
            value={blocker.title}
            onChange={(e) => update.mutate({ title: e.target.value })}
            className="flex-1 font-semibold text-lg border-b border-transparent hover:border-slate-300 focus:border-slate-500 focus:outline-none"
          />
          <button
            onClick={() => {
              if (confirm(`Delete blocker "${blocker.title}"?`)) del.mutate();
            }}
            className="text-xs px-2 py-1 rounded border border-red-300 text-red-600 hover:bg-red-50"
          >
            Delete
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <Select
            label="Severity"
            value={blocker.severity}
            options={['P1', 'P2', 'P3', 'P4']}
            onChange={(v) => update.mutate({ severity: v as Severity })}
            badgeClass={SEV_COLORS[blocker.severity]}
          />
          <Select
            label="Status"
            value={blocker.status}
            options={['OPEN', 'IN_PROGRESS', 'RESOLVED', 'DROPPED']}
            onChange={(v) => update.mutate({ status: v as BlockerStatus })}
          />
          <Select
            label="AI fit"
            value={blocker.aiFit}
            options={['INVESTIGATE', 'CANDIDATE', 'STRONG_FIT', 'NOT_FIT']}
            onChange={(v) => update.mutate({ aiFit: v as AIFit })}
            badgeClass={AI_FIT_COLORS[blocker.aiFit]}
          />
          <Select
            label="Source"
            value={blocker.sourcePhase ?? 'MANUAL'}
            options={['QUANTITATIVE', 'OPEN_TEXT', 'JOURNEY', 'TRIANGULATION', 'MANUAL']}
            onChange={(v) => update.mutate({ sourcePhase: v })}
          />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
          <NumberField
            label="Reach %"
            value={blocker.reachPercentage}
            onSave={(v) => update.mutate({ reachPercentage: v })}
          />
          <NumberField
            label="Hours lost / wk"
            value={blocker.estimatedHoursLost}
            onSave={(v) => update.mutate({ estimatedHoursLost: v })}
          />
          <TextField
            label="Affected teams"
            value={blocker.affectedTeams}
            onSave={(v) => update.mutate({ affectedTeams: v })}
          />
        </div>

        <TextareaField
          label="Evidence summary"
          value={blocker.evidenceSummary}
          onSave={(v) => update.mutate({ evidenceSummary: v })}
        />
        <TextareaField
          label="Description"
          value={blocker.description}
          onSave={(v) => update.mutate({ description: v })}
        />
      </div>

      <div className="bg-white rounded-lg border border-slate-200 p-5">
        <h4 className="font-semibold text-sm mb-3">
          Validation signals ({signals.data?.items.length ?? 0})
        </h4>
        <SignalCreateForm onAdd={(b) => addSignal.mutate(b)} pending={addSignal.isPending} />
        {signals.isLoading ? (
          <div className="text-sm text-slate-500">Loading…</div>
        ) : (signals.data?.items.length ?? 0) === 0 ? (
          <div className="text-sm text-slate-500">No signals attached yet.</div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {signals.data!.items.map((s) => (
              <li key={s.id} className="py-3 text-sm flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={s.confirmed}
                  onChange={(e) =>
                    updateSignal.mutate({ id: s.id, body: { confirmed: e.target.checked } })
                  }
                  className="mt-1"
                  title="Confirmed"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] uppercase font-semibold bg-slate-200 text-slate-700 rounded px-1.5 py-0.5">
                      {s.signalType}
                    </span>
                    <span className="font-medium">{s.signalName}</span>
                    {s.evidenceValue && (
                      <span className="text-xs text-slate-500">→ {s.evidenceValue}</span>
                    )}
                  </div>
                  {s.evidenceDescription && (
                    <p className="text-xs text-slate-600 mt-1">{s.evidenceDescription}</p>
                  )}
                </div>
                <button
                  onClick={() => delSignal.mutate(s.id)}
                  className="text-xs px-2 py-0.5 rounded border border-slate-300 hover:bg-slate-50"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function SignalCreateForm({
  onAdd,
  pending,
}: {
  onAdd: (b: { signalType: SignalType; signalName: string; evidenceValue: string | null }) => void;
  pending: boolean;
}) {
  const [type, setType] = useState<SignalType>('SURVEY');
  const [name, setName] = useState('');
  const [value, setValue] = useState('');
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) return;
        onAdd({
          signalType: type,
          signalName: name.trim(),
          evidenceValue: value.trim() || null,
        });
        setName('');
        setValue('');
      }}
      className="flex flex-wrap gap-2 mb-4"
    >
      <select
        value={type}
        onChange={(e) => setType(e.target.value as SignalType)}
        className="border border-slate-300 rounded px-2 py-1 text-sm"
      >
        {['SURVEY', 'THEME', 'JOURNEY_MAP', 'DORA', 'PR', 'CICD', 'IDE', 'INCIDENT', 'CALENDAR', 'SLACK', 'OTHER'].map((t) => (
          <option key={t} value={t}>{t}</option>
        ))}
      </select>
      <input
        placeholder="Signal name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="flex-1 min-w-[180px] border border-slate-300 rounded px-2 py-1 text-sm"
      />
      <input
        placeholder="Evidence value (e.g. 12.7m)"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="w-44 border border-slate-300 rounded px-2 py-1 text-sm"
      />
      <button
        disabled={pending}
        className="text-xs px-3 py-1.5 rounded bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50"
      >
        + Signal
      </button>
    </form>
  );
}

function Select({
  label,
  value,
  options,
  onChange,
  badgeClass,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
  badgeClass?: string;
}) {
  return (
    <label>
      <span className="block text-[10px] uppercase font-semibold text-slate-600 mb-1">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full text-sm border rounded px-2 py-1 ${badgeClass ?? 'border-slate-300'}`}
      >
        {options.map((o) => (
          <option key={o} value={o}>{o.replace(/_/g, ' ')}</option>
        ))}
      </select>
    </label>
  );
}

function NumberField({
  label,
  value,
  onSave,
}: {
  label: string;
  value: number | null;
  onSave: (v: number | null) => void;
}) {
  const [draft, setDraft] = useState<string>(value?.toString() ?? '');
  useEffect(() => setDraft(value?.toString() ?? ''), [value]);
  return (
    <label>
      <span className="block text-[10px] uppercase font-semibold text-slate-600 mb-1">
        {label}
      </span>
      <input
        type="number"
        min={0}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          const n = draft === '' ? null : Number(draft);
          if (n !== value) onSave(n);
        }}
        className="w-full text-sm border border-slate-300 rounded px-2 py-1"
      />
    </label>
  );
}

function TextField({
  label,
  value,
  onSave,
}: {
  label: string;
  value: string | null;
  onSave: (v: string | null) => void;
}) {
  const [draft, setDraft] = useState<string>(value ?? '');
  useEffect(() => setDraft(value ?? ''), [value]);
  return (
    <label>
      <span className="block text-[10px] uppercase font-semibold text-slate-600 mb-1">
        {label}
      </span>
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          const v = draft.trim() === '' ? null : draft;
          if (v !== value) onSave(v);
        }}
        className="w-full text-sm border border-slate-300 rounded px-2 py-1"
      />
    </label>
  );
}

function TextareaField({
  label,
  value,
  onSave,
}: {
  label: string;
  value: string | null;
  onSave: (v: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? '');
  useEffect(() => {
    if (!editing) setDraft(value ?? '');
  }, [value, editing]);
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">
          {label}
        </span>
        <button
          onClick={() => setEditing((v) => !v)}
          className="text-xs text-slate-500 hover:text-slate-800"
        >
          {editing ? 'Cancel' : value ? 'Edit' : 'Add'}
        </button>
      </div>
      {editing ? (
        <div className="space-y-2">
          <textarea
            rows={3}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="w-full border border-slate-300 rounded px-3 py-2 text-sm"
          />
          <button
            onClick={() => {
              onSave(draft.trim() === '' ? null : draft);
              setEditing(false);
            }}
            className="text-xs px-3 py-1 rounded bg-slate-900 text-white hover:bg-slate-800"
          >
            Save
          </button>
        </div>
      ) : value ? (
        <p className="text-sm text-slate-700 whitespace-pre-wrap bg-slate-50 border border-slate-200 rounded p-3">
          {value}
        </p>
      ) : (
        <p className="text-xs text-slate-400 italic">— not set —</p>
      )}
    </div>
  );
}
