import { useEffect, useState, type ReactNode } from 'react';
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
  sourceType: 'Numeric Question' | 'Text Question' | 'Cross-Dimension Metric' | null;
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
  text: string | null;
  displayText: string | null;
  numericValue?: number | null;
  scoredValue?: number | null;
  questionType?: string;
  questionNumber: number;
  questionText: string;
  roleLabel: string | null;
}
interface TaggedResponse { items: TaggedAnswer[]; }

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
  const [misalignmentNotes, setMisalignmentNotes] = useState('');
  const [notesSaved, setNotesSaved] = useState(false);
  const [notesError, setNotesError] = useState<string | null>(null);
  const qc = useQueryClient();

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

  const analyseResults = useMutation({
    mutationFn: () => {
      if (!companyId || !campaignId) {
        return Promise.resolve({ created: 0, updated: 0, totalThemes: 0 });
      }
      return api<{ created: number; updated: number; totalThemes: number }>(
        `/api/companies/${companyId}/campaigns/${campaignId}/themes/auto-generate`,
        { method: 'POST', body: {} },
      );
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['themes', campaignId] }),
  });

  const saveNotes = useMutation({
    mutationFn: () => {
      if (!companyId || !campaignId) {
        return Promise.reject(new Error('Select a company and campaign first.'));
      }
      return api(
        `/api/companies/${companyId}/campaigns/${campaignId}/artifacts/notes`,
        {
          method: 'POST',
          body: {
            kind: 'jtbd-misalignment',
            misalignmentNotes,
          },
        },
      );
    },
    onSuccess: () => {
      setNotesSaved(true);
      setNotesError(null);
    },
    onError: (e) => {
      setNotesSaved(false);
      setNotesError(e instanceof Error ? e.message : 'Failed to save notes.');
    },
  });

  return (
    <PhaseShell phase="P2">
      <div className="space-y-6">
        {/* Company/Campaign Selectors */}
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
                <option value="">-</option>
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
              <option value="">-</option>
              {campaigns.data?.items.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title} ({c.status})
                </option>
              ))}
            </select>
          </label>
        </div>

        {/* Main Content: Three Sections */}
        {companyId && campaignId ? (
          <div className="space-y-6">
            <ActivityBlock
              num="1"
              title="Read & Analyse Results"
              subtitle="Review detected themes and run automatic analysis"
              defaultOpen
            >
              {analyseResults.isError && (
                <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {analyseResults.error?.message ?? 'Analysis failed'}
                </div>
              )}
              <ThemesWorkspace
                companyId={companyId}
                campaignId={campaignId}
                onAutoAnalyse={() => analyseResults.mutate()}
                autoAnalysing={analyseResults.isPending}
              />
            </ActivityBlock>

            {/* 2. Threshold rule */}
            <ActivityBlock num="2" title="Apply the 30% Threshold Rule" subtitle="Auto-applied to identified themes">
              <ThresholdGate companyId={companyId} campaignId={campaignId} />
            </ActivityBlock>

            {/* 3. JTBD and misalignment */}
            <ActivityBlock num="3" title="Extract JTBD & Check Misalignment" subtitle="Preserve developer language and identify hidden blockers">
              <div>
                <div className="mb-2 p-3 bg-yellow-50 border-l-4 border-yellow-400 text-sm text-yellow-900">
                  <span className="font-semibold">If a theme appears in &gt;30% of text, low Likert responses, or cross-pattern evidence but does NOT align with the expected dimension score, flag it for additional investigation in Phase 3.</span>
                </div>
                <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-1">
                  Themes needing Phase 3 corroboration notes
                </label>
                <textarea
                  className="w-full border border-slate-300 rounded px-2 py-1 text-sm mb-2"
                  rows={3}
                  placeholder="e.g. 'On-call rotation burden' appeared in 35% of Q40 responses but C dimension scored 3.4. Flag for Phase 3 DORA, incident, or journey evidence."
                  value={misalignmentNotes}
                  onChange={e => { setMisalignmentNotes(e.target.value); setNotesSaved(false); setNotesError(null); }}
                />
                <button
                  className="btn btn-outline border border-slate-200 bg-white text-slate-900 hover:bg-slate-100 font-semibold px-4 py-2 rounded disabled:opacity-50"
                  onClick={() => saveNotes.mutate()}
                  disabled={saveNotes.isPending || !misalignmentNotes.trim()}
                >
                  {saveNotes.isPending ? 'Saving…' : 'Save Notes'}
                </button>
                {notesSaved && !saveNotes.isPending && (
                  <span className="ml-3 text-green-600 text-xs font-semibold">✓ Notes saved to Azure Storage</span>
                )}
                {notesError && (
                  <span className="ml-3 text-red-600 text-xs font-semibold">{notesError}</span>
                )}
              </div>
            </ActivityBlock>
          </div>
        ) : (
          <div className="bg-white rounded-lg border border-slate-200 p-8 text-center text-sm text-slate-500">
            Pick a campaign to manage themes.
          </div>
        )}
      </div>
    </PhaseShell>
  );
}

function ActivityBlock({
  num,
  title,
  subtitle,
  defaultOpen = false,
  disabled = false,
  onTitleClick,
  children,
}: {
  num: string;
  title: string;
  subtitle?: string;
  defaultOpen?: boolean;
  disabled?: boolean;
  onTitleClick?: () => void;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const handleTitleClick = () => {
    if (onTitleClick && !disabled) {
      setOpen(true);
      onTitleClick();
      return;
    }
    setOpen((s) => !s);
  };

  return (
    <div className="bg-white rounded-lg border border-slate-300 overflow-hidden">
      <button
        type="button"
        onClick={handleTitleClick}
        className="w-full flex items-center gap-3 px-4 py-3 bg-slate-50 hover:bg-slate-100 text-left border-b border-slate-200 disabled:opacity-60"
      >
        <span className="w-7 h-7 rounded-full bg-amber-900 text-white font-semibold text-sm flex items-center justify-center shrink-0">
          {num}
        </span>
        <span className={`font-serif text-base font-semibold flex-1 ${onTitleClick ? 'text-amber-900 underline underline-offset-4' : 'text-slate-900'}`}>
          {title}
        </span>
        {subtitle && (
          <span className="text-[11px] font-mono uppercase tracking-[2px] text-slate-500 hidden md:block">
            {subtitle}
          </span>
        )}
        <span className={`text-slate-400 text-sm transition-transform ${open ? 'rotate-180' : ''}`}>v</span>
      </button>
      {open && <div className="p-5 space-y-5">{children}</div>}
    </div>
  );
}

function ThresholdGate({ companyId, campaignId }: { companyId: string; campaignId: string }) {
  const base = `/api/companies/${companyId}/campaigns/${campaignId}/themes`;
  const { data, isLoading } = useQuery({
    queryKey: ['themes', campaignId],
    queryFn: () => api<ThemesResponse>(base),
  });
  const promoted = data?.items.filter((t) => t.status === 'PROMOTE') ?? [];
  const investigate = data?.items.filter((t) => t.status === 'INVESTIGATE') ?? [];
  const monitor = data?.items.filter((t) => t.status === 'MONITOR') ?? [];
  return (
    <div>
      <div className="mb-2 p-3 bg-black text-white rounded text-sm">
        <span className="font-semibold">Decision Gate: Promoted vs. Investigate vs. Monitor</span><br />
        30%+ of respondents show the signal {'->'} <b>PROMOTED</b> to Phase 3 cross-validation. 15-29% {'->'} <b>INVESTIGATE</b>. Below 15% {'->'} <b>MONITOR</b>.
      </div>
      <div className="mb-2 p-2 bg-green-50 border-l-4 border-green-400 text-green-900 text-sm">
        {isLoading ? 'Loading...' : `${promoted.length} theme(s) at 30%+ - PROMOTED to Phase 3 cross-validation. Add these to the triangulation matrix.`}
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded bg-rose-100 text-rose-700 text-center py-4 font-bold text-lg">{promoted.length}<div className="text-xs font-normal mt-1">PROMOTED</div></div>
        <div className="rounded bg-amber-100 text-amber-800 text-center py-4 font-bold text-lg">{investigate.length}<div className="text-xs font-normal mt-1">INVESTIGATE</div></div>
        <div className="rounded bg-slate-100 text-slate-600 text-center py-4 font-bold text-lg">{monitor.length}<div className="text-xs font-normal mt-1">MONITOR</div></div>
      </div>
    </div>
  );
}

function ThemesWorkspace({
  companyId,
  campaignId,
  onAutoAnalyse,
  autoAnalysing,
}: {
  companyId: string;
  campaignId: string;
  onAutoAnalyse: () => void;
  autoAnalysing: boolean;
}) {
  const qc = useQueryClient();
  const base = `/api/companies/${companyId}/campaigns/${campaignId}/themes`;
  const [selectedThemeId, setSelectedThemeId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const themes = useQuery({
    queryKey: ['themes', campaignId],
    queryFn: () => api<ThemesResponse>(base),
  });

  useEffect(() => {
    if (!selectedThemeId && themes.data?.items[0]) {
      setSelectedThemeId(themes.data.items[0].id);
    }
  }, [themes.data, selectedThemeId]);

  const create = useMutation({
    mutationFn: (body: Partial<Theme>) => api<Theme>(base, { method: 'POST', body }),
    onSuccess: (t) => {
      qc.invalidateQueries({ queryKey: ['themes', campaignId] });
      setSelectedThemeId(t.id);
      setShowCreate(false);
    },
  });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <aside className="lg:col-span-1 bg-white rounded-lg border border-slate-200 p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-sm">Themes</h2>
          <div className="flex gap-1">
            <button
              onClick={onAutoAnalyse}
              disabled={autoAnalysing}
              className="text-xs px-2 py-1 rounded bg-amber-700 text-white hover:bg-amber-800 disabled:opacity-50"
            >
              {autoAnalysing ? 'Analysing...' : 'Auto Analyse'}
            </button>
            <button
              onClick={() => setShowCreate((v) => !v)}
              className="text-xs px-2 py-1 rounded bg-slate-900 text-white hover:bg-slate-800"
            >
              {showCreate ? 'Cancel' : '+ New'}
            </button>
          </div>
        </div>

        {showCreate && (
          <ThemeCreateForm
            pending={create.isPending}
            error={create.error?.message}
            onSubmit={(b) => create.mutate(b)}
          />
        )}

        {themes.isLoading && <div className="text-sm text-slate-500">Loading...</div>}
        <ul className="divide-y divide-slate-100">
          {themes.data?.items.map((theme) => (
            <li key={theme.id}>
              <button
                onClick={() => setSelectedThemeId(theme.id)}
                className={`w-full text-left py-2 px-2 rounded ${theme.id === selectedThemeId ? 'bg-slate-100' : 'hover:bg-slate-50'}`}
              >
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium truncate">{theme.themeName}</span>
                  <span className={`text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded border ${STATUS_COLORS[theme.status]}`}>
                    {theme.status}
                  </span>
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  {theme.sourceType ?? 'Source not set'} - {theme.respondentCount} respondents - {theme.percentage}% - {theme.tagCount} tags
                </div>
              </button>
            </li>
          ))}
          {!themes.isLoading && (themes.data?.items.length ?? 0) === 0 && (
            <li className="text-sm text-slate-500 py-2">No themes yet. Click Auto Analyse to generate questionnaire, numeric, and text themes automatically.</li>
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
  onSubmit: (body: Partial<Theme>) => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<Theme['status']>('MONITOR');
  const [sourceType, setSourceType] = useState<NonNullable<Theme['sourceType']>>('Text Question');
  const [representativeQuote, setRepresentativeQuote] = useState('');
  const [jtbdStatement, setJtbdStatement] = useState('');
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({
          themeName: name,
          description: description || null,
          status,
          sourceType,
          representativeQuote: representativeQuote || null,
          jtbdStatement: jtbdStatement || null,
        });
      }}
      className="space-y-2 bg-slate-50 border border-slate-200 rounded p-3 mb-3"
    >
      <label className="block">
        <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-600 mb-1">
          Theme Name
        </span>
      <input
        required
        placeholder="e.g. Slow CI pipeline"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="w-full border border-slate-300 rounded px-2 py-1 text-sm"
      />
      </label>
      <label className="block">
        <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-600 mb-1">
          Description
        </span>
      <textarea
        placeholder="Short description"
        rows={2}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        className="w-full border border-slate-300 rounded px-2 py-1 text-sm"
      />
      </label>
      <label className="block">
        <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-600 mb-1">
          Status
        </span>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as Theme['status'])}
          className="w-full border border-slate-300 rounded px-2 py-1 text-sm"
        >
          <option value="PROMOTE">Promote</option>
          <option value="INVESTIGATE">Investigate</option>
          <option value="MONITOR">Monitor</option>
        </select>
      </label>
      <label className="block">
        <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-600 mb-1">
          Source
        </span>
        <select
          value={sourceType}
          onChange={(e) => setSourceType(e.target.value as NonNullable<Theme['sourceType']>)}
          className="w-full border border-slate-300 rounded px-2 py-1 text-sm"
        >
          <option value="Numeric Question">Numeric Question</option>
          <option value="Text Question">Text Question</option>
        </select>
      </label>
      <label className="block">
        <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-600 mb-1">
          Representative Quote
        </span>
        <textarea
          placeholder="Paste a representative respondent quote"
          rows={2}
          value={representativeQuote}
          onChange={(e) => setRepresentativeQuote(e.target.value)}
          className="w-full border border-slate-300 rounded px-2 py-1 text-sm"
        />
      </label>
      <label className="block">
        <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-600 mb-1">
          JTBD
        </span>
        <textarea
          placeholder="When ___, I want ___, so I can ___"
          rows={2}
          value={jtbdStatement}
          onChange={(e) => setJtbdStatement(e.target.value)}
          className="w-full border border-slate-300 rounded px-2 py-1 text-sm"
        />
      </label>
      {error && <div className="text-xs text-red-600">{error}</div>}
      <button
        disabled={pending}
        className="w-full bg-slate-900 text-white text-xs py-1.5 rounded hover:bg-slate-800 disabled:opacity-50"
      >
        {pending ? 'Creating...' : 'Create theme'}
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
    queryFn: () => api<UntaggedResponse>(`${base}/untagged-answers?excludeTaggedBy=${themeId}`),
  });

  const update = useMutation({
    mutationFn: (body: Partial<Theme>) => api<Theme>(`${base}/${themeId}`, { method: 'PATCH', body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['themes', campaignId] }),
  });
  const tag = useMutation({
    mutationFn: (answerId: string) => api(`${base}/${themeId}/tags`, { method: 'POST', body: { answerId } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['theme-tagged', themeId] });
      qc.invalidateQueries({ queryKey: ['theme-untagged', campaignId, themeId] });
      qc.invalidateQueries({ queryKey: ['themes', campaignId] });
    },
  });
  const untag = useMutation({
    mutationFn: (answerId: string) => api(`${base}/${themeId}/tags/${answerId}`, { method: 'DELETE' }),
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

  if (!theme) return <div className="text-sm text-slate-500">Loading theme...</div>;

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg border border-slate-200 p-5 space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-semibold text-lg">{theme.themeName}</h3>
            {theme.description && <p className="text-sm text-slate-600 mt-1">{theme.description}</p>}
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
          <Stat label="Source" value={theme.sourceType ?? 'Not set'} />
        </div>

        <EditableField
          label="Representative Quote"
          value={theme.representativeQuote}
          placeholder="Paste a representative respondent quote..."
          onSave={(value) => update.mutate({ representativeQuote: value || null })}
        />
        <EditableField
          label="JTBD"
          value={theme.jtbdStatement}
          placeholder="When ___, I want ___, so I can ___"
          onSave={(value) => update.mutate({ jtbdStatement: value || null })}
        />
      </div>

      <RootCausePanel base={base} themeId={themeId} />

      <RelatedQuestionsPanel base={base} themeId={themeId} />

      <AnswersPanel
        title={`Tagged answers (${tagged.data?.items.length ?? 0})`}
        loading={tagged.isLoading}
        empty="No evidence tagged to this theme yet."
        answers={tagged.data?.items ?? []}
        actionLabel="Untag"
        onAction={(answerId) => untag.mutate(answerId)}
      />

      <AnswersPanel
        title={`Untagged answers (${untagged.data?.items.length ?? 0})`}
        loading={untagged.isLoading}
        empty="All open-text answers have been tagged."
        answers={untagged.data?.items ?? []}
        actionLabel="+ Tag"
        actionClassName="bg-slate-900 text-white hover:bg-slate-800"
        onAction={(answerId) => tag.mutate(answerId)}
      />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  const isNumber = typeof value === 'number' || /^\d+(\.\d+)?%?$/.test(value);
  return (
    <div className="bg-slate-50 border border-slate-200 rounded py-3">
      <div className={`${isNumber ? 'text-2xl' : 'text-sm px-2 min-h-8 flex items-center justify-center'} font-semibold`}>
        {value}
      </div>
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
  onSave: (value: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? '');
  useEffect(() => {
    if (!editing) setDraft(value ?? '');
  }, [value, editing]);

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">{label}</span>
        <button onClick={() => setEditing((v) => !v)} className="text-xs text-slate-500 hover:text-slate-800">
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
        <p className="text-xs text-slate-400 italic">- not set -</p>
      )}
    </div>
  );
}

type AnswerRow = TaggedAnswer | UntaggedAnswer;
function AnswersPanel({
  title,
  loading,
  empty,
  answers,
  actionLabel,
  actionClassName = 'border border-slate-300 hover:bg-slate-50',
  onAction,
}: {
  title: string;
  loading: boolean;
  empty: string;
  answers: AnswerRow[];
  actionLabel: string;
  actionClassName?: string;
  onAction: (answerId: string) => void;
}) {
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-5">
      <h4 className="font-semibold text-sm mb-3">{title}</h4>
      {loading ? (
        <div className="text-sm text-slate-500">Loading...</div>
      ) : answers.length === 0 ? (
        <div className="text-sm text-slate-500">{empty}</div>
      ) : (
        <ul className="divide-y divide-slate-100">
          {answers.map((answer) => (
            <li key={answer.answerId} className="py-3 text-sm flex items-start gap-3">
              <div className="flex-1">
                <div className="text-[11px] uppercase text-slate-400">
                  Q{answer.questionNumber} - {answer.questionText}
                  {answer.roleLabel && (
                    <span className="ml-2 normal-case text-slate-400 italic">({answer.roleLabel})</span>
                  )}
                  {'themes' in answer && answer.themes.length > 0 && (
                    <span className="ml-2 text-slate-500">
                      already in: {answer.themes.map((theme) => theme.themeName).join(', ')}
                    </span>
                  )}
                </div>
                <p className="text-slate-800 whitespace-pre-wrap">
                  {'displayText' in answer ? (answer.displayText ?? answer.text ?? '-') : answer.text}
                </p>
              </div>
              <button onClick={() => onAction(answer.answerId)} className={`text-xs px-2 py-1 rounded ${actionClassName}`}>
                {actionLabel}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}


// Related questions panel for a selected theme
interface VerbatimAnswer { answerId: string; text: string; roleLabel: string | null; submissionId: string }
interface RootCauseDetail {
  id: string;
  possibleRootCauses: string[];
}
interface RelatedQuestionRow {
  questionId: string;
  questionNumber: number;
  questionText: string;
  respondentCount: number;
  answerCount: number;
  percentage: number;
  answers: VerbatimAnswer[];
}
interface RoleBreakdown { roleLabel: string; respondentCount: number; percentage: number }
interface ThemeDetail {
  id: string;
  totalRespondents: number;
  possibleRootCauses: string[];
  questions: RelatedQuestionRow[];
  roles: RoleBreakdown[];
}

function RootCausePanel({ base, themeId }: { base: string; themeId: string }) {
  const [selectedRootCauses, setSelectedRootCauses] = useState<string[]>([]);
  const [customRootCause, setCustomRootCause] = useState('');
  const [submittedRootCauses, setSubmittedRootCauses] = useState<string[]>([]);
  const [isRootCauseDropdownOpen, setIsRootCauseDropdownOpen] = useState(true);
  const detail = useQuery({
    queryKey: ['theme-detail', themeId],
    queryFn: () => api<RootCauseDetail>(`${base}/${themeId}/detail`),
  });

  useEffect(() => {
    setSelectedRootCauses([]);
    setCustomRootCause('');
    setSubmittedRootCauses([]);
    setIsRootCauseDropdownOpen(true);
  }, [themeId]);

  const causes = detail.data?.possibleRootCauses ?? [];
  const toggleRootCause = (cause: string) => {
    setSelectedRootCauses((current) =>
      current.includes(cause)
        ? current.filter((item) => item !== cause)
        : [...current, cause],
    );
  };
  const submitRootCauses = () => {
    const custom = customRootCause.trim();
    const nextSelection = custom
      ? [...selectedRootCauses, custom]
      : selectedRootCauses;
    setSubmittedRootCauses((current) => [...new Set([...current, ...nextSelection])]);
    setSelectedRootCauses([]);
    setCustomRootCause('');
    setIsRootCauseDropdownOpen(false);
  };
  const canSubmit = selectedRootCauses.length > 0 || customRootCause.trim().length > 0;

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-5">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div>
          <h4 className="font-semibold text-sm">Possible root causes</h4>
          <p className="text-xs text-slate-500 mt-0.5">
            Select all root causes that apply to this blocker, or add one if none fit.
          </p>
        </div>
        <span className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">
          {causes.length || 10} options
        </span>
      </div>
      {detail.isLoading ? (
        <div className="text-sm text-slate-500">Loading root causes...</div>
      ) : (
        <div className="space-y-4">
          <button
            type="button"
            onClick={() => setIsRootCauseDropdownOpen((open) => !open)}
            className="flex w-full items-center justify-between rounded border border-slate-300 bg-white px-3 py-2 text-left text-sm font-semibold text-slate-800 hover:bg-slate-50"
          >
            <span>
              Root Cause Choices
              {selectedRootCauses.length > 0 && (
                <span className="ml-2 text-xs font-normal text-slate-500">
                  {selectedRootCauses.length} selected
                </span>
              )}
            </span>
            <span className={`text-slate-400 transition-transform ${isRootCauseDropdownOpen ? 'rotate-180' : ''}`}>
              v
            </span>
          </button>

          {isRootCauseDropdownOpen && (
            <div className="space-y-4 rounded border border-slate-200 bg-white p-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {causes.map((cause, idx) => (
                  <label
                    key={cause}
                    className={`flex items-start gap-2 rounded border px-3 py-2 text-sm cursor-pointer ${
                      selectedRootCauses.includes(cause)
                        ? 'border-amber-400 bg-amber-50 text-amber-950'
                        : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <input
                      type="checkbox"
                      name={`root-cause-${themeId}`}
                      checked={selectedRootCauses.includes(cause)}
                      onChange={() => toggleRootCause(cause)}
                      className="mt-1"
                    />
                    <span>
                      <span className="text-[11px] font-semibold uppercase text-slate-400 mr-1">
                        {idx + 1}.
                      </span>
                      {cause}
                    </span>
                  </label>
                ))}
              </div>
              <label className="block">
                <span className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-1">
                  Root Cause Not Listed?
                </span>
                <textarea
                  rows={3}
                  value={customRootCause}
                  onChange={(e) => setCustomRootCause(e.target.value)}
                  placeholder="Type the root cause you believe is driving this blocker..."
                  className="w-full border border-slate-300 rounded px-3 py-2 text-sm"
                />
              </label>
              <button
                type="button"
                disabled={!canSubmit}
                onClick={submitRootCauses}
                className="rounded bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
              >
                Submit Root Causes
              </button>
            </div>
          )}

          <div className="rounded border border-slate-200 bg-slate-50 p-3">
            <h5 className="text-xs font-semibold uppercase tracking-wide text-slate-600">
              Selected Root Causes
            </h5>
            {submittedRootCauses.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">No root causes submitted yet.</p>
            ) : (
              <ul className="mt-2 space-y-1.5">
                {submittedRootCauses.map((cause, idx) => (
                  <li key={cause} className="text-sm text-slate-800">
                    <span className="text-[11px] font-semibold uppercase text-slate-400 mr-1">
                      {idx + 1}.
                    </span>
                    {cause}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function RelatedQuestionsPanel({ base, themeId }: { base: string; themeId: string }) {
  const detail = useQuery({
    queryKey: ['theme-detail', themeId],
    queryFn: () => api<ThemeDetail>(`${base}/${themeId}/detail`),
  });
  if (detail.isLoading) {
    return <div className="bg-white rounded-lg border border-slate-200 p-5 text-sm text-slate-500">Loading related questions...</div>;
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
          {questions.length} question{questions.length === 1 ? '' : 's'} - {totalRespondents} respondents
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
        <div className="px-5 py-3 border-t border-slate-200 flex flex-wrap gap-2 text-[11px] bg-slate-50">
          <span className="text-slate-500 uppercase font-semibold tracking-wide mr-1">Roles:</span>
          {roles.map((r) => (
            <span key={r.roleLabel} className="px-1.5 py-0.5 rounded bg-white border border-slate-200 text-slate-700 font-medium">
              {r.roleLabel} - {r.respondentCount}
            </span>
          ))}
        </div>
      )}
      {questions.length > 0 && (
        <div className="border-t border-slate-200">
          <div className="px-5 pt-4 pb-2 flex items-center justify-between">
            <h5 className="font-semibold text-sm text-slate-900">Respondent evidence</h5>
            <span className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">grouped by question</span>
          </div>
          <div className="divide-y divide-slate-100">
            {questions.map((q) => (
              <div key={q.questionId} className="px-5 py-3">
                <div className="flex items-baseline gap-2 mb-2">
                  <span className="text-[11px] font-bold uppercase text-emerald-700 tabular-nums">Q{q.questionNumber}</span>
                  <span className="text-sm text-slate-800 flex-1">{q.questionText}</span>
                  <span className="text-[11px] text-slate-500 tabular-nums whitespace-nowrap">{q.respondentCount} resp - {q.percentage.toFixed(0)}%</span>
                </div>
                {q.answers.length === 0 ? (
                  <p className="text-xs text-slate-400 italic ml-5">No answer-level evidence captured for this question.</p>
                ) : (
                  <ul className="space-y-1.5 ml-5">
                    {q.answers.map((a) => (
                      <li key={a.answerId} className="text-sm text-slate-700 bg-slate-50 border-l-2 border-emerald-400 px-3 py-2 rounded-r">
                        <span className={a.text.startsWith('Score ') || a.text.startsWith('Value ') ? '' : 'italic'}>
                          {a.text.startsWith('Score ') || a.text.startsWith('Value ') ? a.text : `"${a.text}"`}
                        </span>
                        {a.roleLabel && <span className="ml-2 text-[11px] text-slate-500 not-italic">- {a.roleLabel}</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}


