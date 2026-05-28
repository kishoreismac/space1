import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Campaign, Company } from '@space/shared';
import { api } from '../../lib/api';
import { useAuth } from '../../stores/auth';
import { PhaseShell } from '../../components/PhaseShell';

interface CompaniesResponse { items: Company[]; }
interface CampaignsResponse { items: Campaign[]; }

interface Theme {
  id: string;
  themeName: string;
  description: string | null;
  representativeQuote: string | null;
  jtbdStatement: string | null;
  status: 'PROMOTE' | 'INVESTIGATE' | 'MONITOR';
  respondentCount: number;
  percentage: number;
  tagCount: number;
}
interface ThemesResponse { items: Theme[]; }

interface UntaggedAnswer {
  answerId: string;
  text: string;
  questionNumber: number;
  questionText: string;
  roleLabel: string | null;
  themes: { id: string; themeName: string; status: string }[];
}
interface UntaggedResponse { items: UntaggedAnswer[]; }

interface TaggedAnswer {
  id: string;
  answerId: string;
  text: string;
  questionNumber: number;
  questionText: string;
  roleLabel: string | null;
}
interface TaggedResponse { items: TaggedAnswer[]; }

interface AiAnalyzeResponse {
  createdCount: number;
  tagCount: number;
  predefinedThemeCount?: number;
  items: Array<{
    id: string;
    themeName: string;
    status: 'PROMOTE' | 'INVESTIGATE' | 'MONITOR';
    respondentCount: number;
    percentage: number;
    tagCount: number;
  }>;
  note?: string;
}

const STATUS_COLORS: Record<string, string> = {
  PROMOTE: 'bg-emerald-100 text-emerald-700 border-emerald-300',
  INVESTIGATE: 'bg-amber-100 text-amber-800 border-amber-300',
  MONITOR: 'bg-slate-100 text-slate-600 border-slate-300',
};

export default function ThemesPage() {
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
    <PhaseShell phase="P2">
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
        <ThemesWorkspace companyId={companyId} campaignId={campaignId} />
      ) : (
        <div className="bg-white rounded-lg border border-slate-200 p-8 text-center text-sm text-slate-500">
          Pick a campaign to manage themes.
        </div>
      )}
    </div>
    </PhaseShell>
  );
}

function ThemesWorkspace({ companyId, campaignId }: { companyId: string; campaignId: string }) {
  const qc = useQueryClient();
  const base = `/api/companies/${companyId}/campaigns/${campaignId}/themes`;
  const [selectedThemeId, setSelectedThemeId] = useState<string | null>(null);
  const [replaceExistingWithAi, setReplaceExistingWithAi] = useState(true);

  const themes = useQuery({
    queryKey: ['themes', campaignId],
    queryFn: () => api<ThemesResponse>(base),
  });

  useEffect(() => {
    if (!selectedThemeId && themes.data?.items[0]) {
      setSelectedThemeId(themes.data.items[0].id);
    }
  }, [themes.data, selectedThemeId]);

  const aiAnalyze = useMutation({
    mutationFn: () =>
      api<AiAnalyzeResponse>(`${base}/ai-analyze`, {
        method: 'POST',
        body: { replaceExisting: replaceExistingWithAi },
      }),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['themes', campaignId] });
      qc.invalidateQueries({ queryKey: ['theme-untagged'] });
      qc.invalidateQueries({ queryKey: ['theme-tagged'] });
      if (result.items[0]) setSelectedThemeId(result.items[0].id);
    },
  });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <aside className="lg:col-span-1 bg-white rounded-lg border border-slate-200 p-4">
        <div className="mb-3 rounded border border-blue-200 bg-blue-50 p-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-blue-700 mb-2">
            AI Phase 2
          </div>
          <div className="text-[11px] text-slate-700 mb-2">
            AI does not create new theme names. It tags each response to the closest predefined questionnaire theme.
          </div>
          <label className="flex items-center gap-2 text-xs text-slate-700 mb-2">
            <input
              type="checkbox"
              checked={replaceExistingWithAi}
              onChange={(e) => setReplaceExistingWithAi(e.target.checked)}
            />
            Replace existing themes before AI run
          </label>
          <button
            onClick={() => aiAnalyze.mutate()}
            disabled={aiAnalyze.isPending}
            className="w-full text-xs px-2 py-1.5 rounded bg-blue-700 text-white hover:bg-blue-800 disabled:opacity-50"
          >
            {aiAnalyze.isPending ? 'Analyzing with Azure Foundry...' : 'Run AI Open-Text Analysis'}
          </button>
          {aiAnalyze.isSuccess && (
            <div className="mt-2 text-[11px] text-slate-700">
              Created {aiAnalyze.data.createdCount} predefined themes and {aiAnalyze.data.tagCount} AI tags.
              {aiAnalyze.data.note ? ` ${aiAnalyze.data.note}` : ''}
            </div>
          )}
          {aiAnalyze.error && (
            <div className="mt-2 text-[11px] text-red-600">{aiAnalyze.error.message}</div>
          )}
        </div>

        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-sm">Themes</h2>
          <div className="text-[11px] text-slate-500">Predefined by questionnaire</div>
        </div>

        {themes.isLoading && <div className="text-sm text-slate-500">Loading…</div>}
        <ul className="divide-y divide-slate-100">
          {themes.data?.items.map((t) => (
            <li key={t.id}>
              <button
                onClick={() => setSelectedThemeId(t.id)}
                className={`w-full text-left py-2 px-2 rounded ${
                  t.id === selectedThemeId ? 'bg-slate-100' : 'hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium truncate">{t.themeName}</span>
                  <span
                    className={`text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded border ${
                      STATUS_COLORS[t.status]
                    }`}
                  >
                    {t.status}
                  </span>
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  {t.respondentCount} respondents · {t.percentage}% · {t.tagCount} tags
                </div>
              </button>
            </li>
          ))}
          {!themes.isLoading && (themes.data?.items.length ?? 0) === 0 && (
            <li className="text-sm text-slate-500 py-2">No themes yet.</li>
          )}
        </ul>
      </aside>

      <section className="lg:col-span-2">
        {selectedThemeId ? (
          <ThemeDetail
            companyId={companyId}
            campaignId={campaignId}
            themeId={selectedThemeId}
            onDeleted={() => {
              setSelectedThemeId(null);
              qc.invalidateQueries({ queryKey: ['themes', campaignId] });
            }}
          />
        ) : (
          <div className="bg-white rounded-lg border border-slate-200 p-8 text-center text-sm text-slate-500">
            Select or create a theme.
          </div>
        )}
      </section>
    </div>
  );
}

function ThemeCreateForm({
  pending,
  error,
  onSubmit,
}: {
  pending: boolean;
  error?: string;
  onSubmit: (b: Partial<Theme>) => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({
          themeName: name,
          description: description || null,
          status: 'MONITOR',
        });
      }}
      className="space-y-2 bg-slate-50 border border-slate-200 rounded p-3 mb-3"
    >
      <input
        required
        placeholder="Theme name (e.g. Slow CI pipeline)"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="w-full border border-slate-300 rounded px-2 py-1 text-sm"
      />
      <textarea
        placeholder="Short description (optional)"
        rows={2}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        className="w-full border border-slate-300 rounded px-2 py-1 text-sm"
      />
      {error && <div className="text-xs text-red-600">{error}</div>}
      <button
        disabled={pending}
        className="w-full bg-slate-900 text-white text-xs py-1.5 rounded hover:bg-slate-800 disabled:opacity-50"
      >
        {pending ? 'Creating…' : 'Create theme'}
      </button>
    </form>
  );
}

function ThemeDetail({
  companyId,
  campaignId,
  themeId,
  onDeleted,
}: {
  companyId: string;
  campaignId: string;
  themeId: string;
  onDeleted: () => void;
}) {
  const qc = useQueryClient();
  const base = `/api/companies/${companyId}/campaigns/${campaignId}/themes`;

  const themesList = useQuery({
    queryKey: ['themes', campaignId],
    queryFn: () => api<ThemesResponse>(base),
  });
  const theme = themesList.data?.items.find((t) => t.id === themeId) ?? null;

  const tagged = useQuery({
    queryKey: ['theme-tagged', themeId],
    queryFn: () => api<TaggedResponse>(`${base}/${themeId}/tags`),
  });
  const untagged = useQuery({
    queryKey: ['theme-untagged', campaignId, themeId],
    queryFn: () =>
      api<UntaggedResponse>(`${base}/untagged-answers?excludeTaggedBy=${themeId}`),
  });

  const update = useMutation({
    mutationFn: (body: Partial<Theme>) =>
      api<Theme>(`${base}/${themeId}`, { method: 'PATCH', body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['themes', campaignId] }),
  });
  const tag = useMutation({
    mutationFn: (answerId: string) =>
      api(`${base}/${themeId}/tags`, { method: 'POST', body: { answerId } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['theme-tagged', themeId] });
      qc.invalidateQueries({ queryKey: ['theme-untagged', campaignId, themeId] });
      qc.invalidateQueries({ queryKey: ['themes', campaignId] });
    },
  });
  const untag = useMutation({
    mutationFn: (answerId: string) =>
      api(`${base}/${themeId}/tags/${answerId}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['theme-tagged', themeId] });
      qc.invalidateQueries({ queryKey: ['theme-untagged', campaignId, themeId] });
      qc.invalidateQueries({ queryKey: ['themes', campaignId] });
    },
  });
  const del = useMutation({
    mutationFn: () => api(`${base}/${themeId}`, { method: 'DELETE' }),
    onSuccess: onDeleted,
  });

  if (!theme) return <div className="text-sm text-slate-500">Loading theme…</div>;

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg border border-slate-200 p-5 space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-semibold text-lg">{theme.themeName}</h3>
            {theme.description && (
              <p className="text-sm text-slate-600 mt-1">{theme.description}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <select
              value={theme.status}
              onChange={(e) => update.mutate({ status: e.target.value as Theme['status'] })}
              className="text-xs border border-slate-300 rounded px-2 py-1"
            >
              <option value="MONITOR">MONITOR</option>
              <option value="INVESTIGATE">INVESTIGATE</option>
              <option value="PROMOTE">PROMOTE</option>
            </select>
            <button
              onClick={() => {
                if (confirm(`Delete theme "${theme.themeName}"?`)) del.mutate();
              }}
              className="text-xs px-2 py-1 rounded border border-red-300 text-red-600 hover:bg-red-50"
            >
              Delete
            </button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 text-center">
          <Stat label="Respondents" value={theme.respondentCount} />
          <Stat label="% of campaign" value={`${theme.percentage}%`} />
          <Stat label="Tags" value={theme.tagCount} />
        </div>

        <EditableField
          label="Representative quote"
          value={theme.representativeQuote}
          placeholder="Paste a representative respondent quote…"
          onSave={(v) => update.mutate({ representativeQuote: v || null })}
        />
        <EditableField
          label="JTBD statement"
          value={theme.jtbdStatement}
          placeholder="When ___, I want ___, so I can ___"
          onSave={(v) => update.mutate({ jtbdStatement: v || null })}
        />
      </div>

      <RelatedQuestionsPanel base={base} themeId={themeId} />

      <div className="bg-white rounded-lg border border-slate-200 p-5">
        <h4 className="font-semibold text-sm mb-3">Tagged answers ({tagged.data?.items.length ?? 0})</h4>
        {tagged.isLoading ? (
          <div className="text-sm text-slate-500">Loading…</div>
        ) : (tagged.data?.items.length ?? 0) === 0 ? (
          <div className="text-sm text-slate-500">No answers tagged to this theme yet.</div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {tagged.data!.items.map((a) => (
              <li key={a.id} className="py-3 text-sm flex items-start gap-3">
                <div className="flex-1">
                  <div className="text-[11px] uppercase text-slate-400">
                    Q{a.questionNumber} · {a.roleLabel ?? 'unattributed'}
                  </div>
                  <p className="text-slate-800 whitespace-pre-wrap">{a.text}</p>
                </div>
                <button
                  onClick={() => untag.mutate(a.answerId)}
                  className="text-xs px-2 py-1 rounded border border-slate-300 hover:bg-slate-50"
                >
                  Untag
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="bg-white rounded-lg border border-slate-200 p-5">
        <h4 className="font-semibold text-sm mb-3">
          Untagged answers ({untagged.data?.items.length ?? 0})
        </h4>
        {untagged.isLoading ? (
          <div className="text-sm text-slate-500">Loading…</div>
        ) : (untagged.data?.items.length ?? 0) === 0 ? (
          <div className="text-sm text-slate-500">All open-text answers have been tagged.</div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {untagged.data!.items.map((a) => (
              <li key={a.answerId} className="py-3 text-sm flex items-start gap-3">
                <div className="flex-1">
                  <div className="text-[11px] uppercase text-slate-400">
                    Q{a.questionNumber} · {a.roleLabel ?? 'unattributed'}
                    {a.themes.length > 0 && (
                      <span className="ml-2 text-slate-500">
                        already in: {a.themes.map((t) => t.themeName).join(', ')}
                      </span>
                    )}
                  </div>
                  <p className="text-slate-800 whitespace-pre-wrap">{a.text}</p>
                </div>
                <button
                  onClick={() => tag.mutate(a.answerId)}
                  className="text-xs px-2 py-1 rounded bg-slate-900 text-white hover:bg-slate-800"
                >
                  + Tag
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-slate-50 border border-slate-200 rounded py-3">
      <div className="text-2xl font-semibold">{value}</div>
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
    </div>
  );
}

function EditableField({
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
            placeholder={placeholder}
            className="w-full border border-slate-300 rounded px-3 py-2 text-sm"
          />
          <button
            onClick={() => {
              onSave(draft);
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

// ─── Auto-generate themes from open-text survey answers ─────────────────
function AutoGenerateButton({ base, onDone }: { base: string; onDone: () => void }) {
  const mutation = useMutation({
    mutationFn: () => api<{ created: number; updated: number; totalThemes: number }>(
      `${base}/auto-generate`,
      { method: 'POST', body: {} },
    ),
    onSuccess: () => onDone(),
  });
  return (
    <button
      onClick={() => mutation.mutate()}
      disabled={mutation.isPending}
      title="Cluster open-text answers and auto-create / update themes"
      className="text-xs px-2 py-1 rounded bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-50"
    >
      {mutation.isPending ? '…' : '✨ Auto'}
    </button>
  );
}

// ─── Related questions panel for a selected theme ───────────────────────
interface RelatedQuestionRow {
  questionId: string;
  questionNumber: number;
  questionText: string;
  respondentCount: number;
  answerCount: number;
  percentage: number;
}
interface RoleBreakdown { roleLabel: string; respondentCount: number; percentage: number }
interface ThemeDetail {
  id: string;
  totalRespondents: number;
  questions: RelatedQuestionRow[];
  roles: RoleBreakdown[];
}
function RelatedQuestionsPanel({ base, themeId }: { base: string; themeId: string }) {
  const detail = useQuery({
    queryKey: ['theme-detail', themeId],
    queryFn: () => api<ThemeDetail>(`${base}/${themeId}/detail`),
  });
  if (detail.isLoading) {
    return <div className="bg-white rounded-lg border border-slate-200 p-5 text-sm text-slate-500">Loading related questions…</div>;
  }
  if (!detail.data) return null;
  const d = detail.data;
  const questions = d.questions ?? [];
  const roles = d.roles ?? [];
  const totalRespondents = d.totalRespondents ?? 0;
  return (
    <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
      <header className="px-5 py-3 border-b border-slate-200 flex items-center justify-between">
        <h4 className="font-semibold text-sm">Related questions</h4>
        <span className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">
          {questions.length} question{questions.length === 1 ? '' : 's'} · {totalRespondents} respondents
        </span>
      </header>
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-slate-600">
          <tr>
            <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase">Q#</th>
            <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase">Question</th>
            <th className="px-3 py-2 text-right text-[11px] font-semibold uppercase">Respondents</th>
            <th className="px-3 py-2 text-right text-[11px] font-semibold uppercase">Answers</th>
            <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase w-40">% of campaign</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {questions.length === 0 && (
            <tr><td colSpan={5} className="px-3 py-6 text-center text-slate-400 italic">No related questions yet</td></tr>
          )}
          {questions.map((q) => (
            <tr key={q.questionId} className="hover:bg-slate-50">
              <td className="px-3 py-2 text-slate-500 tabular-nums">Q{q.questionNumber}</td>
              <td className="px-3 py-2 text-slate-800 max-w-[420px]"><div className="truncate" title={q.questionText}>{q.questionText}</div></td>
              <td className="px-3 py-2 text-right tabular-nums">{q.respondentCount}</td>
              <td className="px-3 py-2 text-right tabular-nums">{q.answerCount}</td>
              <td className="px-3 py-2">
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 bg-slate-100 rounded overflow-hidden">
                    <div className="h-full bg-emerald-500" style={{ width: `${Math.min(100, q.percentage)}%` }} />
                  </div>
                  <span className="text-[11px] text-slate-600 tabular-nums w-10 text-right">{q.percentage.toFixed(0)}%</span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {roles.length > 0 && (
        <div className="px-5 py-3 border-t border-slate-200 flex flex-wrap gap-2 text-[11px]">
          <span className="text-slate-500 uppercase font-semibold tracking-wide mr-1">Roles:</span>
          {roles.map((r) => (
            <span key={r.roleLabel} className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-medium">
              {r.roleLabel} · {r.respondentCount}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
