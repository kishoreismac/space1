import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Campaign, Company } from '@space/shared';
import { api } from '../../lib/api';
import { useAuth } from '../../stores/auth';
import { PhaseShell } from '../../components/PhaseShell';

interface CompaniesResponse { items: Company[]; }
interface CampaignsResponse { items: Campaign[]; }

interface Session {
  id: string;
  teamId: string | null;
  teamName: string | null;
  facilitator: string | null;
  sessionDate: string | null;
  participantCount: number;
  notes: string | null;
  stepCount: number;
}
interface SessionsResponse { items: Session[]; }

type Friction = 'GREEN' | 'YELLOW' | 'RED';
interface Step {
  id: string;
  sessionId: string;
  stepName: string;
  description: string | null;
  timeSpent: string | null;
  frictionLevel: Friction;
  dotVotes: number;
  quote: string | null;
  rootCause: string | null;
  jtbdStatement: string | null;
  displayOrder: number;
}
interface StepsResponse { items: Step[]; }

interface Summary {
  stepCount: number;
  totalVotes: number;
  frictionCounts: Record<Friction, number>;
  topPainPoints: {
    id: string;
    stepName: string;
    dotVotes: number;
    frictionLevel: Friction;
    rootCause: string | null;
    jtbdStatement: string | null;
  }[];
}

const FRICTION_BG: Record<Friction, string> = {
  GREEN: 'bg-emerald-100 border-emerald-300',
  YELLOW: 'bg-amber-100 border-amber-300',
  RED: 'bg-red-100 border-red-300',
};
const FRICTION_DOT: Record<Friction, string> = {
  GREEN: 'bg-emerald-500',
  YELLOW: 'bg-amber-500',
  RED: 'bg-red-500',
};

export default function JourneyPage() {
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
    <PhaseShell phase="P4">
    <div className="space-y-6">
      <WorkshopGuide />

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
        <JourneyWorkspace companyId={companyId} campaignId={campaignId} />
      ) : (
        <div className="bg-white rounded-lg border border-slate-200 p-8 text-center text-sm text-slate-500">
          Pick a campaign to manage journey sessions.
        </div>
      )}
    </div>
    </PhaseShell>
  );
}

function JourneyWorkspace({ companyId, campaignId }: { companyId: string; campaignId: string }) {
  const qc = useQueryClient();
  const base = `/api/companies/${companyId}/campaigns/${campaignId}/journey`;
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const sessions = useQuery({
    queryKey: ['journey-sessions', campaignId],
    queryFn: () => api<SessionsResponse>(base),
  });

  useEffect(() => {
    if (!selectedSessionId && sessions.data?.items[0]) {
      setSelectedSessionId(sessions.data.items[0].id);
    }
  }, [sessions.data, selectedSessionId]);

  const create = useMutation({
    mutationFn: (b: { facilitator: string | null; participantCount: number; notes: string | null }) =>
      api<Session>(base, { method: 'POST', body: b }),
    onSuccess: (s) => {
      qc.invalidateQueries({ queryKey: ['journey-sessions', campaignId] });
      setSelectedSessionId(s.id);
      setShowCreate(false);
    },
  });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <aside className="lg:col-span-1 bg-white rounded-lg border border-slate-200 p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-sm">Sessions</h2>
          <button
            onClick={() => setShowCreate((v) => !v)}
            className="text-xs px-2 py-1 rounded bg-slate-900 text-white hover:bg-slate-800"
          >
            {showCreate ? 'Cancel' : '+ New session'}
          </button>
        </div>
        {showCreate && (
          <SessionCreateForm
            pending={create.isPending}
            error={create.error?.message}
            onSubmit={(b) => create.mutate(b)}
          />
        )}
        <ul className="divide-y divide-slate-100">
          {sessions.data?.items.map((s) => (
            <li key={s.id}>
              <button
                onClick={() => setSelectedSessionId(s.id)}
                className={`w-full text-left py-2 px-2 rounded ${
                  s.id === selectedSessionId ? 'bg-slate-100' : 'hover:bg-slate-50'
                }`}
              >
                <div className="text-sm font-medium truncate">
                  {s.facilitator ?? 'Unnamed facilitator'}
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  {s.teamName ?? 'No team'} · {s.participantCount} ppl · {s.stepCount} steps
                </div>
              </button>
            </li>
          ))}
          {!sessions.isLoading && (sessions.data?.items.length ?? 0) === 0 && (
            <li className="text-sm text-slate-500 py-2">No sessions yet.</li>
          )}
        </ul>
      </aside>

      <section className="lg:col-span-2">
        {selectedSessionId ? (
          <SessionDetail
            companyId={companyId}
            campaignId={campaignId}
            sessionId={selectedSessionId}
            onDeleted={() => {
              setSelectedSessionId(null);
              qc.invalidateQueries({ queryKey: ['journey-sessions', campaignId] });
            }}
          />
        ) : (
          <div className="bg-white rounded-lg border border-slate-200 p-8 text-center text-sm text-slate-500">
            Select or create a session.
          </div>
        )}
      </section>
    </div>
  );
}

function SessionCreateForm({
  pending,
  error,
  onSubmit,
}: {
  pending: boolean;
  error?: string;
  onSubmit: (b: { facilitator: string | null; participantCount: number; notes: string | null }) => void;
}) {
  const [facilitator, setFacilitator] = useState('');
  const [count, setCount] = useState(0);
  const [notes, setNotes] = useState('');
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({
          facilitator: facilitator || null,
          participantCount: count,
          notes: notes || null,
        });
      }}
      className="space-y-2 bg-slate-50 border border-slate-200 rounded p-3 mb-3"
    >
      <input
        placeholder="Facilitator name"
        value={facilitator}
        onChange={(e) => setFacilitator(e.target.value)}
        className="w-full border border-slate-300 rounded px-2 py-1 text-sm"
      />
      <input
        type="number"
        min={0}
        placeholder="Participants"
        value={count}
        onChange={(e) => setCount(Number(e.target.value))}
        className="w-full border border-slate-300 rounded px-2 py-1 text-sm"
      />
      <textarea
        placeholder="Notes (optional)"
        rows={2}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        className="w-full border border-slate-300 rounded px-2 py-1 text-sm"
      />
      {error && <div className="text-xs text-red-600">{error}</div>}
      <button
        disabled={pending}
        className="w-full bg-slate-900 text-white text-xs py-1.5 rounded hover:bg-slate-800 disabled:opacity-50"
      >
        {pending ? 'Creating…' : 'Create session'}
      </button>
    </form>
  );
}

function SessionDetail({
  companyId,
  campaignId,
  sessionId,
  onDeleted,
}: {
  companyId: string;
  campaignId: string;
  sessionId: string;
  onDeleted: () => void;
}) {
  const qc = useQueryClient();
  const base = `/api/companies/${companyId}/campaigns/${campaignId}/journey`;

  const sessions = useQuery({
    queryKey: ['journey-sessions', campaignId],
    queryFn: () => api<SessionsResponse>(base),
  });
  const session = sessions.data?.items.find((s) => s.id === sessionId) ?? null;

  const steps = useQuery({
    queryKey: ['journey-steps', sessionId],
    queryFn: () => api<StepsResponse>(`${base}/${sessionId}/steps`),
  });

  const summary = useQuery({
    queryKey: ['journey-summary', sessionId],
    queryFn: () => api<Summary>(`${base}/${sessionId}/summary`),
  });

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ['journey-steps', sessionId] });
    qc.invalidateQueries({ queryKey: ['journey-summary', sessionId] });
    qc.invalidateQueries({ queryKey: ['journey-sessions', campaignId] });
  };

  const addStep = useMutation({
    mutationFn: (name: string) =>
      api<Step>(`${base}/${sessionId}/steps`, {
        method: 'POST',
        body: { stepName: name, frictionLevel: 'GREEN' },
      }),
    onSuccess: invalidateAll,
  });
  const patchStep = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<Step> }) =>
      api<Step>(`${base}/${sessionId}/steps/${id}`, { method: 'PATCH', body }),
    onSuccess: invalidateAll,
  });
  const delStep = useMutation({
    mutationFn: (id: string) =>
      api(`${base}/${sessionId}/steps/${id}`, { method: 'DELETE' }),
    onSuccess: invalidateAll,
  });
  const reorder = useMutation({
    mutationFn: (stepIds: string[]) =>
      api(`${base}/${sessionId}/steps/reorder`, {
        method: 'POST',
        body: { stepIds },
      }),
    onSuccess: invalidateAll,
  });
  const delSession = useMutation({
    mutationFn: () => api(`${base}/${sessionId}`, { method: 'DELETE' }),
    onSuccess: onDeleted,
  });

  const [newStepName, setNewStepName] = useState('');

  if (!session) return <div className="text-sm text-slate-500">Loading session…</div>;

  const items = steps.data?.items ?? [];
  const move = (idx: number, dir: -1 | 1) => {
    const next = idx + dir;
    if (next < 0 || next >= items.length) return;
    const ids = items.map((s) => s.id);
    [ids[idx], ids[next]] = [ids[next]!, ids[idx]!];
    reorder.mutate(ids);
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg border border-slate-200 p-5">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-semibold text-lg">
              {session.facilitator ?? 'Unnamed session'}
            </h3>
            <div className="text-sm text-slate-500">
              {session.teamName ?? 'No team'} · {session.participantCount} participants
            </div>
          </div>
          <button
            onClick={() => {
              if (confirm('Delete this session and all its steps?')) delSession.mutate();
            }}
            className="text-xs px-2 py-1 rounded border border-red-300 text-red-600 hover:bg-red-50"
          >
            Delete session
          </button>
        </div>
        {session.notes && (
          <p className="text-sm text-slate-700 mt-3 whitespace-pre-wrap">
            {session.notes}
          </p>
        )}
        {summary.data && (
          <div className="grid grid-cols-4 gap-3 mt-4">
            <Stat label="Steps" value={summary.data.stepCount} />
            <Stat label="Total votes" value={summary.data.totalVotes} />
            <Stat
              label="🔴 Red"
              value={summary.data.frictionCounts.RED ?? 0}
              color="text-red-600"
            />
            <Stat
              label="🟡 Yellow"
              value={summary.data.frictionCounts.YELLOW ?? 0}
              color="text-amber-600"
            />
          </div>
        )}
      </div>

      <div className="bg-white rounded-lg border border-slate-200 p-5">
        <h4 className="font-semibold text-sm mb-3">Journey steps</h4>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (newStepName.trim()) {
              addStep.mutate(newStepName.trim());
              setNewStepName('');
            }
          }}
          className="flex gap-2 mb-4"
        >
          <input
            placeholder="New step name (e.g. Pick up ticket)"
            value={newStepName}
            onChange={(e) => setNewStepName(e.target.value)}
            className="flex-1 border border-slate-300 rounded px-2 py-1.5 text-sm"
          />
          <button
            disabled={addStep.isPending}
            className="text-xs px-3 py-1.5 rounded bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50"
          >
            + Add step
          </button>
        </form>

        {items.length === 0 ? (
          <div className="text-sm text-slate-500">No steps yet — add the first one above.</div>
        ) : (
          <ul className="space-y-3">
            {items.map((s, idx) => (
              <li
                key={s.id}
                className={`border-2 rounded-lg p-4 ${FRICTION_BG[s.frictionLevel]}`}
              >
                <div className="flex items-start gap-3">
                  <span className={`mt-1.5 w-3 h-3 rounded-full ${FRICTION_DOT[s.frictionLevel]}`} />
                  <div className="flex-1 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <input
                        value={s.stepName}
                        onChange={(e) =>
                          patchStep.mutate({ id: s.id, body: { stepName: e.target.value } })
                        }
                        className="flex-1 bg-transparent font-semibold text-sm border-b border-transparent hover:border-slate-300 focus:border-slate-500 focus:outline-none"
                      />
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => move(idx, -1)}
                          disabled={idx === 0}
                          className="text-xs px-1.5 py-0.5 rounded hover:bg-white/60 disabled:opacity-30"
                          title="Move up"
                        >
                          ↑
                        </button>
                        <button
                          onClick={() => move(idx, 1)}
                          disabled={idx === items.length - 1}
                          className="text-xs px-1.5 py-0.5 rounded hover:bg-white/60 disabled:opacity-30"
                          title="Move down"
                        >
                          ↓
                        </button>
                        <button
                          onClick={() => {
                            if (confirm(`Delete step "${s.stepName}"?`)) delStep.mutate(s.id);
                          }}
                          className="text-xs px-1.5 py-0.5 rounded text-red-700 hover:bg-red-100"
                        >
                          ✕
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                      <label>
                        <span className="block text-[10px] uppercase font-semibold text-slate-600">
                          Friction
                        </span>
                        <select
                          value={s.frictionLevel}
                          onChange={(e) =>
                            patchStep.mutate({
                              id: s.id,
                              body: { frictionLevel: e.target.value as Friction },
                            })
                          }
                          className="w-full border border-slate-300 rounded px-1 py-0.5 bg-white"
                        >
                          <option value="GREEN">🟢 Smooth</option>
                          <option value="YELLOW">🟡 Friction</option>
                          <option value="RED">🔴 Pain</option>
                        </select>
                      </label>
                      <label>
                        <span className="block text-[10px] uppercase font-semibold text-slate-600">
                          Dot votes
                        </span>
                        <input
                          type="number"
                          min={0}
                          value={s.dotVotes}
                          onChange={(e) =>
                            patchStep.mutate({
                              id: s.id,
                              body: { dotVotes: Number(e.target.value) },
                            })
                          }
                          className="w-full border border-slate-300 rounded px-1 py-0.5 bg-white"
                        />
                      </label>
                      <label className="col-span-2">
                        <span className="block text-[10px] uppercase font-semibold text-slate-600">
                          Time spent
                        </span>
                        <input
                          value={s.timeSpent ?? ''}
                          onChange={(e) =>
                            patchStep.mutate({
                              id: s.id,
                              body: { timeSpent: e.target.value || null },
                            })
                          }
                          placeholder="e.g. 30 min"
                          className="w-full border border-slate-300 rounded px-1 py-0.5 bg-white"
                        />
                      </label>
                    </div>

                    <InlineTextarea
                      label="Root cause"
                      value={s.rootCause}
                      onSave={(v) =>
                        patchStep.mutate({ id: s.id, body: { rootCause: v || null } })
                      }
                    />
                    <InlineTextarea
                      label="JTBD"
                      value={s.jtbdStatement}
                      onSave={(v) =>
                        patchStep.mutate({ id: s.id, body: { jtbdStatement: v || null } })
                      }
                      placeholder="When ___, I want ___, so I can ___"
                    />
                    <InlineTextarea
                      label="Quote"
                      value={s.quote}
                      onSave={(v) =>
                        patchStep.mutate({ id: s.id, body: { quote: v || null } })
                      }
                    />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {summary.data && summary.data.topPainPoints.length > 0 && (
        <div className="bg-white rounded-lg border border-slate-200 p-5">
          <h4 className="font-semibold text-sm mb-3">Top pain points</h4>
          <ol className="space-y-2">
            {summary.data.topPainPoints.map((p, i) => (
              <li key={p.id} className="text-sm flex items-start gap-3">
                <span className="font-semibold text-slate-500">#{i + 1}</span>
                <div className="flex-1">
                  <div className="font-medium">
                    {p.stepName}{' '}
                    <span className="text-xs text-slate-500">
                      ({p.dotVotes} votes · {p.frictionLevel})
                    </span>
                  </div>
                  {p.rootCause && (
                    <div className="text-xs text-slate-600">Root cause: {p.rootCause}</div>
                  )}
                  {p.jtbdStatement && (
                    <div className="text-xs text-slate-600 italic">{p.jtbdStatement}</div>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  color,
}: {
  label: string;
  value: string | number;
  color?: string;
}) {
  return (
    <div className="bg-slate-50 border border-slate-200 rounded py-3 text-center">
      <div className={`text-2xl font-semibold ${color ?? ''}`}>{value}</div>
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
    </div>
  );
}

function InlineTextarea({
  label,
  value,
  placeholder,
  onSave,
}: {
  label: string;
  value: string | null;
  placeholder?: string;
  onSave: (v: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? '');
  useEffect(() => {
    if (!editing) setDraft(value ?? '');
  }, [value, editing]);

  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="block text-[10px] uppercase font-semibold text-slate-600">
          {label}
        </span>
        <button
          onClick={() => setEditing((v) => !v)}
          className="text-[10px] text-slate-500 hover:text-slate-800"
        >
          {editing ? 'Cancel' : value ? 'Edit' : 'Add'}
        </button>
      </div>
      {editing ? (
        <div className="space-y-1 mt-1">
          <textarea
            rows={2}
            value={draft}
            placeholder={placeholder}
            onChange={(e) => setDraft(e.target.value)}
            className="w-full border border-slate-300 rounded px-2 py-1 text-xs bg-white"
          />
          <button
            onClick={() => {
              onSave(draft);
              setEditing(false);
            }}
            className="text-[10px] px-2 py-0.5 rounded bg-slate-900 text-white hover:bg-slate-800"
          >
            Save
          </button>
        </div>
      ) : value ? (
        <p className="text-xs text-slate-700 whitespace-pre-wrap">{value}</p>
      ) : (
        <p className="text-[11px] text-slate-400 italic">— {label.toLowerCase()} not set —</p>
      )}
    </div>
  );
}

// ─── Step-by-step facilitator guide ────────────────────────────────────
function WorkshopGuide() {
  const [open, setOpen] = useState(false);
  const steps = [
    {
      n: 1,
      title: 'Frame the session (5 min)',
      body:
        'State the objective: "Map the developer journey from ticket-assigned to code-in-production and identify the top 3 friction points." Remind attendees this is non-attributed; aim for honesty over politeness.',
    },
    {
      n: 2,
      title: 'List the journey steps (10 min)',
      body:
        'On a virtual whiteboard, have the team brain-dump every step in their typical SDLC flow. Resequence into a linear journey. Aim for 6–10 steps.',
    },
    {
      n: 3,
      title: 'Colour-code friction (10 min)',
      body:
        'For each step apply a colour: GREEN = smooth, AMBER = annoying, RED = blocking. Disagreement is data — record the spread, not just the mode.',
    },
    {
      n: 4,
      title: 'Dot-vote the worst (5 min)',
      body:
        'Give each participant 3 dots. They place them on the steps that hurt them most this quarter. Highest-vote steps become the focus for root-cause analysis.',
    },
    {
      n: 5,
      title: 'Five-Whys per top step (15 min each)',
      body:
        'For the top 1–3 steps, ask "Why?" five times to drill from symptom to root cause. Capture the root-cause sentence verbatim in the step row.',
    },
    {
      n: 6,
      title: 'Write JTBD statements (10 min)',
      body:
        'For each confirmed pain, write a Jobs-To-Be-Done sentence: "When <context>, I want <outcome> so that <reason>." This becomes the brief for Phase 5 blocker selection.',
    },
    {
      n: 7,
      title: 'Confirm or reject Phase 1 hypotheses (5 min)',
      body:
        'Cross-check the journey against the dimensions flagged in Phase 1. Confirm each blocker hypothesis or mark it as not-supported. Unconfirmed hypotheses go back to Phase 2 for more open-text mining.',
    },
    {
      n: 8,
      title: 'Close with next-step owners (5 min)',
      body:
        'For every RED step with ≥1 dot vote, assign a single owner to draft the AI-feasibility brief or non-AI workstream proposal for Phase 5.',
    },
  ];

  return (
    <section className="bg-white rounded-lg border border-slate-200">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-3 text-left"
      >
        <div>
          <h2 className="font-semibold">Workshop facilitator guide</h2>
          <p className="text-xs text-slate-500">
            Step-by-step run-of-show for a 75-minute remote journey-mapping session.
          </p>
        </div>
        <span className="text-xs text-slate-500">{open ? 'Hide' : 'Show'}</span>
      </button>
      {open && (
        <ol className="border-t border-slate-200 divide-y divide-slate-100">
          {steps.map((s) => (
            <li key={s.n} className="flex gap-4 px-5 py-4">
              <span className="flex-shrink-0 w-7 h-7 rounded-full bg-slate-900 text-white text-xs font-semibold flex items-center justify-center">
                {s.n}
              </span>
              <div>
                <h3 className="text-sm font-semibold text-slate-800">{s.title}</h3>
                <p className="text-xs text-slate-600 leading-relaxed mt-1">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
