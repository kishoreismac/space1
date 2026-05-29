import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Campaign, Company } from '@space/shared';
import { PhaseShell } from '../../components/PhaseShell';
import { api } from '../../lib/api';
import { useAuth } from '../../stores/auth';

interface CompaniesResponse { items: Company[]; }
interface CampaignsResponse { items: Campaign[]; }

type Severity = 'P1' | 'P2' | 'P3' | 'P4';
type SignalType = 'DORA' | 'SURVEY' | 'THEME';
type ScoreValue = 'CONFIRMED' | 'PARTIAL' | 'NOT_CONFIRMED';

interface DoraMetrics {
  leadTimeForChanges: string | null;
  deploymentFrequency: string | null;
  mttr: string | null;
  changeFailureRate: string | null;
  avgBuildTimeMinutes: string | null;
  flakyTestFailureRate: string | null;
  prAvgReviewIterations: string | null;
  prFirstReviewLagHours: string | null;
  ideAvgActiveSessionLengthMinutes: string | null;
}

interface DoraMetricsResponse {
  current: DoraMetrics;
  previous: DoraMetrics;
  updatedAt: { current: string | null; previous: string | null };
}

interface Blocker {
  id: string;
  title: string;
  description: string | null;
  sourcePhase: string | null;
  dimensionCode: string | null;
  severity: Severity;
  evidenceSummary: string | null;
  status: string;
  aiFit: string;
}

interface Signal {
  id: string;
  blockerId: string;
  signalType: SignalType;
  signalName: string;
  evidenceValue: string | null;
  evidenceDescription: string | null;
  confirmed: boolean;
}

type MatrixBlocker = Blocker & { signals: Signal[] };
interface MatrixResponse { items: MatrixBlocker[]; }
interface AutoSeedResponse {
  created: number;
  totalRespondents: number;
  blockers: Array<{ id: string; title: string; severity: Severity; sources: number }>;
}

const EMPTY_DORA: DoraMetrics = {
  leadTimeForChanges: null,
  deploymentFrequency: null,
  mttr: null,
  changeFailureRate: null,
  avgBuildTimeMinutes: null,
  flakyTestFailureRate: null,
  prAvgReviewIterations: null,
  prFirstReviewLagHours: null,
  ideAvgActiveSessionLengthMinutes: null,
};

const DORA_FIELDS: Array<{
  key: keyof DoraMetrics;
  label: string;
  placeholder: string;
  help: string;
}> = [
  {
    key: 'leadTimeForChanges',
    label: 'Lead Time for Changes',
    placeholder: 'e.g. 3.2 days',
    help: 'Maps to P dimension (performance) + E dimension (efficiency)',
  },
  {
    key: 'deploymentFrequency',
    label: 'Deployment Frequency',
    placeholder: 'e.g. 2.3 per week',
    help: 'Maps to E dimension (efficiency) + C dimension (approval gates)',
  },
  {
    key: 'mttr',
    label: 'MTTR (Mean Time to Restore)',
    placeholder: 'e.g. 3.1 hours',
    help: 'Maps to E dimension (incident RCA speed)',
  },
  {
    key: 'changeFailureRate',
    label: 'Change Failure Rate',
    placeholder: 'e.g. 18%',
    help: 'Maps to P dimension + C dimension (requirements)',
  },
  {
    key: 'avgBuildTimeMinutes',
    label: 'Avg Build Time (Minutes)',
    placeholder: 'e.g. 38',
    help: 'Confirms build and pipeline drag.',
  },
  {
    key: 'flakyTestFailureRate',
    label: 'Flaky Test / Failure Rate (%)',
    placeholder: 'e.g. 22',
    help: 'Confirms CI reliability friction.',
  },
  {
    key: 'prAvgReviewIterations',
    label: 'PR Avg Review Iterations',
    placeholder: 'e.g. 3.2',
    help: 'Maps to C and A dimensions.',
  },
  {
    key: 'prFirstReviewLagHours',
    label: 'PR First-Review Lag (Hrs)',
    placeholder: 'e.g. 22',
    help: 'Confirms review wait states.',
  },
  {
    key: 'ideAvgActiveSessionLengthMinutes',
    label: 'IDE Avg Active Session Length (Minutes)',
    placeholder: 'e.g. 11',
    help: 'Below 20 min can confirm context-switch overload.',
  },
];

const SCORE_OPTIONS: Array<{ value: ScoreValue; label: string }> = [
  { value: 'CONFIRMED', label: 'Confirmed' },
  { value: 'PARTIAL', label: 'Partial / needs follow-up' },
  { value: 'NOT_CONFIRMED', label: 'Not confirmed' },
];

const SIGNAL_COPY: Record<SignalType, { name: string; label: string }> = {
  SURVEY: { name: 'Survey signal', label: 'Survey Signal Confirmed?' },
  DORA: { name: 'Quantitative data', label: 'Quant Data Confirmed?' },
  THEME: { name: 'Open text theme', label: 'Open Text Confirmed?' },
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
    <PhaseShell phase="P3" showOverview={false}>
      <div className="space-y-6">
        <div className="flex flex-wrap items-end gap-3 rounded-lg border border-stone-200 bg-[#f8f5ee] px-4 py-3">
          {role === 'SUPER_ADMIN' && (
            <label className="text-sm">
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-[0.18em] text-stone-500">
                Company
              </span>
              <select
                value={companyId ?? ''}
                onChange={(e) => {
                  setCompanyId(e.target.value || null);
                  setCampaignId(null);
                }}
                className="min-w-[220px] rounded-md border border-stone-300 bg-white px-3 py-2 text-sm"
              >
                <option value="">Select company</option>
                {companies.data?.items.map((company) => (
                  <option key={company.id} value={company.id}>{company.name}</option>
                ))}
              </select>
            </label>
          )}
          <label className="text-sm">
            <span className="mb-1 block text-[11px] font-bold uppercase tracking-[0.18em] text-stone-500">
              Campaign
            </span>
            <select
              value={campaignId ?? ''}
              onChange={(e) => setCampaignId(e.target.value || null)}
              disabled={!companyId}
              className="min-w-[280px] rounded-md border border-stone-300 bg-white px-3 py-2 text-sm disabled:opacity-60"
            >
              <option value="">Select campaign</option>
              {campaigns.data?.items.map((campaign) => (
                <option key={campaign.id} value={campaign.id}>
                  {campaign.title} ({campaign.status})
                </option>
              ))}
            </select>
          </label>
        </div>

        {companyId && campaignId ? (
          <TriangulationWorkspace companyId={companyId} campaignId={campaignId} />
        ) : (
          <div className="rounded-lg border border-stone-200 bg-[#f8f5ee] p-8 text-center text-sm text-stone-500">
            Select a campaign to enter DORA metrics and triangulate blockers.
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
  const base = `/api/companies/${companyId}/campaigns/${campaignId}/triangulation`;

  return (
    <div className="space-y-4">
      <ActivityBlock
        number="1"
        title="DORA Metrics Baseline Template"
        helper="Enter current cycle DORA data"
        defaultOpen
      >
        <DoraMetricsSection base={base} campaignId={campaignId} />
      </ActivityBlock>

      <ActivityBlock
        number="2"
        title="Signal Triangulation Matrix"
        helper="Add each candidate blocker and score its signal sources"
        defaultOpen
      >
        <SignalTriangulationMatrix base={base} campaignId={campaignId} />
      </ActivityBlock>
    </div>
  );
}

function ActivityBlock({
  number,
  title,
  helper,
  defaultOpen = false,
  children,
}: {
  number: string;
  title: string;
  helper: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="overflow-hidden rounded-md border border-stone-300 bg-[#f8f5ee] shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-3 bg-[#fffaf0] px-4 py-3 text-left hover:bg-[#f5ead7]"
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#135b31] text-sm font-bold text-white">
          {number}
        </span>
        <span className="min-w-0 flex-1 font-semibold text-stone-950">{title}</span>
        <span className="hidden text-xs font-medium text-stone-500 md:block">{helper}</span>
        <span className="text-xs font-bold text-stone-600">{open ? 'v' : '>'}</span>
      </button>
      {open && <div className="border-t border-stone-300 px-5 py-6">{children}</div>}
    </section>
  );
}

function DoraMetricsSection({ base, campaignId }: { base: string; campaignId: string }) {
  const qc = useQueryClient();
  const [current, setCurrent] = useState<DoraMetrics>(EMPTY_DORA);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const dora = useQuery({
    queryKey: ['dora-metrics', campaignId],
    queryFn: () => api<DoraMetricsResponse>(`${base}/dora-metrics`),
  });

  useEffect(() => {
    if (dora.data) {
      setCurrent({ ...EMPTY_DORA, ...dora.data.current });
    }
  }, [dora.data]);

  const save = useMutation({
    mutationFn: async () => {
      return api(`${base}/dora-metrics/current`, {
        method: 'PUT',
        body: normalizeMetrics(current),
      });
    },
    onSuccess: () => {
      setSaveError(null);
      setSaveMessage('DORA metrics saved successfully.');
      qc.invalidateQueries({ queryKey: ['dora-metrics', campaignId] });
    },
    onError: (error) => {
      setSaveMessage(null);
      setSaveError(error instanceof Error ? error.message : 'Could not save DORA metrics.');
    },
  });

  return (
    <div className="space-y-5">
      {dora.isError && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Could not load saved DORA data.
        </div>
      )}
      <div>
        <DoraCycleCard
          title=""
          metrics={current}
          onChange={setCurrent}
          updatedAt={dora.data?.updatedAt.current ?? null}
        />
      </div>
      <div>
        <button
          type="button"
          onClick={() => save.mutate()}
          disabled={save.isPending} //change the color of the button
          className={`rounded-md px-5 py-3 text-sm font-bold text-white shadow-md shadow-emerald-900/20 ${
            save.isPending ? 'bg-[#126a5a]' : 'bg-[#17806d] hover:bg-[#126a5a]'
          }`}
        >
          {save.isPending ? 'Saving DORA Data...' : 'Save DORA Data'}
        </button>
        {saveMessage && <div className="mt-3 text-sm font-semibold text-[#135b31]">{saveMessage}</div>}
        {saveError && <div className="mt-3 text-sm font-semibold text-red-700">{saveError}</div>}
      </div>
    </div>
  );
}

function DoraCycleCard({
  title,
  metrics,
  onChange,
  updatedAt,
}: {
  title: string;
  metrics: DoraMetrics;
  onChange: (metrics: DoraMetrics) => void;
  updatedAt: string | null;
}) {
  return (
    <div className="rounded-lg border border-stone-300 bg-[#fffaf0] p-5 shadow-sm">
      <div className={title ? 'mb-5 flex flex-wrap items-baseline justify-between gap-2' : 'mb-0 flex justify-end'}>
        {title && <h3 className="font-semibold text-stone-950">{title}</h3>}
        {updatedAt && (
          <span className="text-xs text-stone-400">
            Saved {new Date(updatedAt).toLocaleString()}
          </span>
        )}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {DORA_FIELDS.map((field) => (
          <label
            key={field.key}
            className={field.key === 'ideAvgActiveSessionLengthMinutes' ? 'md:col-span-2' : ''}
          >
            <span className="mb-2 block text-[11px] font-bold uppercase tracking-[0.18em] text-stone-700">
              {field.label}
            </span>
            <input
              value={metrics[field.key] ?? ''}
              onChange={(event) =>
                onChange({ ...metrics, [field.key]: event.target.value })
              }
              placeholder={field.placeholder}
              className="w-full rounded-md border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-950 outline-none focus:border-[#17806d] focus:ring-2 focus:ring-[#17806d]/15"
            />
            <span className="mt-2 block text-xs leading-relaxed text-stone-600">{field.help}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

function SignalTriangulationMatrix({ base, campaignId }: { base: string; campaignId: string }) {
  const qc = useQueryClient();
  const [autoSeedMessage, setAutoSeedMessage] = useState<string | null>(null);
  const [autoSeedError, setAutoSeedError] = useState<string | null>(null);
  const matrix = useQuery({
    queryKey: ['triangulation-matrix', campaignId],
    queryFn: () => api<MatrixResponse>(`${base}/matrix`),
  });
  const dora = useQuery({
    queryKey: ['dora-metrics', campaignId],
    queryFn: () => api<DoraMetricsResponse>(`${base}/dora-metrics`),
  });

  const doraSummary = useMemo(
    () => buildDoraSummary(dora.data?.current ?? EMPTY_DORA),
    [dora.data],
  );

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['triangulation-matrix', campaignId] });
    qc.invalidateQueries({ queryKey: ['blockers', campaignId] });
    qc.invalidateQueries({ queryKey: ['program-output', campaignId] });
  };

  const autoSeed = useMutation({
    mutationFn: () => api<AutoSeedResponse>(`${base}/auto-seed`, { method: 'POST', body: {} }),
    onSuccess: (result) => {
      setAutoSeedError(null);
      setAutoSeedMessage(
        result.created > 0
          ? `Created ${result.created} validated blocker${result.created === 1 ? '' : 's'} from Phase 2 themes and supporting signals. P5 registry and AI feasibility matrix will use these blockers.`
          : 'Auto analysis completed. No new blockers were created because matching blockers already exist or no qualifying themes were found.',
      );
      invalidate();
    },
    onError: (error) => {
      setAutoSeedMessage(null);
      setAutoSeedError(error instanceof Error ? error.message : 'Auto analysis failed.');
    },
  });

  const createBlocker = useMutation({
    mutationFn: async (payload: NewBlockerPayload) => {
      const confirmedCount = countConfirmed(payload.survey, payload.quant, payload.openText);
      const blocker = await api<Blocker>(`${base}/blockers`, {
        method: 'POST',
        body: {
          title: payload.title,
          description: payload.description || null,
          sourcePhase: 'TRIANGULATION',
          severity: severityFromSources(confirmedCount),
          evidenceSummary: payload.quantEvidence || doraSummary || null,
          aiFit: confirmedCount >= 2 ? 'CANDIDATE' : 'INVESTIGATE',
          status: 'OPEN',
        },
      });
      await Promise.all([
        api<Signal>(`${base}/blockers/${blocker.id}/signals`, {
          method: 'POST',
          body: signalBody('SURVEY', payload.survey, null),
        }),
        api<Signal>(`${base}/blockers/${blocker.id}/signals`, {
          method: 'POST',
          body: signalBody('DORA', payload.quant, payload.quantEvidence || doraSummary),
        }),
        api<Signal>(`${base}/blockers/${blocker.id}/signals`, {
          method: 'POST',
          body: signalBody('THEME', payload.openText, payload.openTextEvidence || null),
        }),
      ]);
      return blocker;
    },
    onSuccess: invalidate,
  });

  const rows = matrix.data?.items ?? [];

  return (
    <div className="space-y-7">
      <div className="rounded-xl border border-[#d8c6a8] bg-[#eee4d3] p-5 shadow-sm">
        <div className="rounded-lg bg-[#171411] px-7 py-5 text-white shadow-md">
          <div className="flex items-start gap-4">
            <span className="mt-1 text-lg font-black text-[#d83b78]">^</span>
            <div>
              <h3 className="font-semibold text-[#ffd84d]">
                Triangulation Gate - 2+ sources required for registry entry
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-stone-200">
                Survey alone is not sufficient. Add DORA or pipeline data as the second signal.
                A blocker with 3/3 sources is P1 fast-track, 2/3 is P1 or P2 depending on
                severity, and 1/3 should be investigated further.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-[#135b31]/30 bg-[#ecf7ef] p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#135b31]">
              Auto Seed Validation
            </div>
            <h3 className="mt-1 font-semibold text-stone-950">
              Auto analyse Phase 2 themes and create validated blockers
            </h3>
            <p className="mt-1 max-w-3xl text-sm leading-relaxed text-stone-700">
              Pulls promoted and investigate themes, low survey dimensions, and journey signals into
              the triangulation matrix. These blockers feed the P5 Validated Blocker Registry and AI
              Feasibility Matrix automatically.
            </p>
          </div>
          <button
            type="button"
            onClick={() => autoSeed.mutate()}
            disabled={autoSeed.isPending}
            className="rounded-md bg-[#135b31] px-5 py-3 text-sm font-bold text-white shadow-md shadow-emerald-900/20 hover:bg-[#0d4625] disabled:opacity-60"
          >
            {autoSeed.isPending ? 'Running Auto Analysis...' : 'Auto Analyse & Seed Blockers'}
          </button>
        </div>
        {autoSeedMessage && (
          <div className="mt-3 rounded-md border border-[#135b31]/20 bg-white px-3 py-2 text-sm font-semibold text-[#135b31]">
            {autoSeedMessage}
          </div>
        )}
        {autoSeedError && (
          <div className="mt-3 rounded-md border border-red-200 bg-white px-3 py-2 text-sm font-semibold text-red-700">
            {autoSeedError}
          </div>
        )}
      </div>

      {matrix.isLoading ? (
        <div className="py-12 text-center text-sm text-stone-400">Loading triangulation matrix...</div>
      ) : rows.length === 0 ? (
        <EmptyMatrixState />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-stone-300 bg-[#fffaf0] shadow-sm">
          <table className="min-w-[1080px] w-full text-sm">
            <thead className="border-b border-stone-300 bg-[#dfd3bd] text-left text-[11px] uppercase tracking-[0.16em] text-stone-800">
              <tr>
                <th className="px-4 py-3">Blocker</th>
                <th className="px-4 py-3">Survey</th>
                <th className="px-4 py-3">Quant</th>
                <th className="px-4 py-3">Open Text</th>
                <th className="px-4 py-3">Sources</th>
                <th className="px-4 py-3">Priority</th>
                <th className="px-4 py-3">Evidence</th>
                <th className="px-4 py-3">Update</th>
                <th className="px-4 py-3">Delete</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-200 bg-[#fffaf0]">
              {rows.map((row) => (
                <MatrixRow key={row.id} base={base} campaignId={campaignId} row={row} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="rounded-xl border border-[#d8c6a8] bg-[#eee4d3] p-5 shadow-sm">
        <NewBlockerForm
          currentDoraSummary={doraSummary}
          pending={createBlocker.isPending}
          onSubmit={(payload) => createBlocker.mutate(payload)}
        />
      </div>
    </div>
  );
}

function EmptyMatrixState() {
  return (
    <div className="rounded-lg border border-stone-300 bg-[#fffaf0] py-12 text-center shadow-sm">
      <div className="mx-auto mb-6 h-0 w-0 border-x-[10px] border-b-[18px] border-x-transparent border-b-[#d83b78]" />
      <p className="text-sm font-medium text-stone-600">
        No blockers in triangulation matrix yet. Add promoted themes from Phase 2.
      </p>
    </div>
  );
}

function MatrixRow({
  base,
  campaignId,
  row,
}: {
  base: string;
  campaignId: string;
  row: MatrixBlocker;
}) {
  const qc = useQueryClient();
  const surveySignal = findSignal(row, 'SURVEY');
  const doraSignal = findSignal(row, 'DORA');
  const themeSignal = findSignal(row, 'THEME');
  const [survey, setSurvey] = useState<ScoreValue>(scoreFromSignal(surveySignal));
  const [quant, setQuant] = useState<ScoreValue>(scoreFromSignal(doraSignal));
  const [openText, setOpenText] = useState<ScoreValue>(scoreFromSignal(themeSignal));
  const [evidence, setEvidence] = useState(doraSignal?.evidenceDescription ?? row.evidenceSummary ?? '');

  useEffect(() => {
    setSurvey(scoreFromSignal(surveySignal));
    setQuant(scoreFromSignal(doraSignal));
    setOpenText(scoreFromSignal(themeSignal));
    setEvidence(doraSignal?.evidenceDescription ?? row.evidenceSummary ?? '');
  }, [doraSignal, row.evidenceSummary, surveySignal, themeSignal]);

  const confirmedCount = countConfirmed(survey, quant, openText);
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['triangulation-matrix', campaignId] });
    qc.invalidateQueries({ queryKey: ['blockers', campaignId] });
  };
  const update = useMutation({
    mutationFn: async () => {
      await Promise.all([
        upsertSignal(base, row.id, surveySignal, 'SURVEY', survey, null),
        upsertSignal(base, row.id, doraSignal, 'DORA', quant, evidence),
        upsertSignal(base, row.id, themeSignal, 'THEME', openText, themeSignal?.evidenceDescription ?? null),
      ]);
      await api<Blocker>(`${base}/blockers/${row.id}`, {
        method: 'PATCH',
        body: {
          severity: severityFromSources(confirmedCount),
          evidenceSummary: evidence.trim() || null,
          aiFit: confirmedCount >= 2 ? 'CANDIDATE' : 'INVESTIGATE',
        },
      });
    },
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: () => api(`${base}/blockers/${row.id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  });

  return (
    <tr className="align-top odd:bg-[#fffaf0] even:bg-[#f8f0df]">
      <td className="px-4 py-4">
        <div className="font-semibold text-stone-950">{row.title}</div>
        {row.description && <div className="mt-1 text-xs text-stone-500">{row.description}</div>}
      </td>
      <td className="px-4 py-4">
        <ScoreSelect value={survey} onChange={setSurvey} />
      </td>
      <td className="px-4 py-4">
        <ScoreSelect value={quant} onChange={setQuant} />
      </td>
      <td className="px-4 py-4">
        <ScoreSelect value={openText} onChange={setOpenText} />
      </td>
      <td className="px-4 py-4">
        <span className={sourceBadgeClass(confirmedCount)}>{confirmedCount}/3</span>
      </td>
      <td className="px-4 py-4">
        <span className="rounded-full bg-stone-100 px-2.5 py-1 text-xs font-bold text-stone-700">
          {severityFromSources(confirmedCount)}
        </span>
      </td>
      <td className="px-4 py-4">
        <textarea
          value={evidence}
          onChange={(event) => setEvidence(event.target.value)}
          rows={2}
          className="min-w-[260px] rounded-md border border-stone-300 bg-white px-3 py-2 text-sm text-stone-950 outline-none focus:border-[#17806d] focus:ring-2 focus:ring-[#17806d]/15"
          placeholder="Specific metric value or triangulation evidence"
        />
      </td>
      <td className="px-4 py-4">
        <button
          type="button"
          onClick={() => update.mutate()}
          disabled={update.isPending}
          className="rounded-md bg-[#171411] px-3 py-2 text-xs font-bold text-white hover:bg-black disabled:opacity-60"
        >
          {update.isPending ? 'Saving...' : 'Save'}
        </button>
      </td>
      <td className="px-4 py-4">
        <button
          type="button"
          onClick={() => {
            if (confirm(`Delete matrix row "${row.title}"?`)) remove.mutate();
          }}
          disabled={remove.isPending}
          className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-xs font-bold text-red-700 hover:bg-red-100 disabled:opacity-60"
        >
          {remove.isPending ? 'Deleting...' : 'Delete'}
        </button>
      </td>
    </tr>
  );
}

interface NewBlockerPayload {
  title: string;
  description: string;
  survey: ScoreValue;
  quant: ScoreValue;
  openText: ScoreValue;
  quantEvidence: string;
  openTextEvidence: string;
}

function NewBlockerForm({
  currentDoraSummary,
  pending,
  onSubmit,
}: {
  currentDoraSummary: string;
  pending: boolean;
  onSubmit: (payload: NewBlockerPayload) => void;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [survey, setSurvey] = useState<ScoreValue>('CONFIRMED');
  const [quant, setQuant] = useState<ScoreValue>('CONFIRMED');
  const [openText, setOpenText] = useState<ScoreValue>('CONFIRMED');
  const [quantEvidence, setQuantEvidence] = useState('');
  const [openTextEvidence, setOpenTextEvidence] = useState('');

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (!title.trim()) return;
        onSubmit({
          title: title.trim(),
          description: description.trim(),
          survey,
          quant,
          openText,
          quantEvidence: quantEvidence.trim(),
          openTextEvidence: openTextEvidence.trim(),
        });
        setTitle('');
        setDescription('');
        setQuantEvidence('');
        setOpenTextEvidence('');
      }}
      className="rounded-lg border border-stone-200 bg-[#fbf8f1] p-5 shadow-md shadow-stone-900/10"
    >
      <div className="mb-5 flex flex-wrap items-center gap-3 border-b border-stone-300 pb-4">
        <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-800">
          New Row
        </span>
        <h3 className="font-semibold text-stone-950">Add Blocker to Triangulation Matrix</h3>
      </div>
      <div className="grid gap-4 lg:grid-cols-4">
        <label className="lg:col-span-1">
          <FormLabel required>Blocker Name</FormLabel>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="e.g. Build pipeline failures and flaky tests"
            className="w-full rounded-md border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-950 outline-none focus:border-[#17806d] focus:ring-2 focus:ring-[#17806d]/15"
          />
        </label>
        <label>
          <FormLabel>Survey Signal Confirmed?</FormLabel>
          <ScoreSelect value={survey} onChange={setSurvey} />
        </label>
        <label>
          <FormLabel>Quant Data Confirmed?</FormLabel>
          <ScoreSelect value={quant} onChange={setQuant} />
        </label>
        <label>
          <FormLabel>Open Text Confirmed?</FormLabel>
          <ScoreSelect value={openText} onChange={setOpenText} confirmedLabel="Confirmed (>=30%)" />
        </label>
      </div>
      <label className="mt-4 block">
        <FormLabel>Quantitative Evidence (Specific Metric Value)</FormLabel>
        <input
          value={quantEvidence}
          onChange={(event) => setQuantEvidence(event.target.value)}
          placeholder={currentDoraSummary || 'e.g. Avg build time 38 min; flaky test rate 22% of runs'}
          className="w-full rounded-md border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-950 outline-none focus:border-[#17806d] focus:ring-2 focus:ring-[#17806d]/15"
        />
      </label>
      <label className="mt-4 block">
        <FormLabel>Open Text Evidence</FormLabel>
        <input
          value={openTextEvidence}
          onChange={(event) => setOpenTextEvidence(event.target.value)}
          placeholder="e.g. Theme appeared in 35% of Phase 2 responses"
          className="w-full rounded-md border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-950 outline-none focus:border-[#17806d] focus:ring-2 focus:ring-[#17806d]/15"
        />
      </label>
      <label className="mt-4 block">
        <FormLabel>Notes</FormLabel>
        <textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          rows={2}
          placeholder="Optional context for reporting and subsequent phases"
          className="w-full rounded-md border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-950 outline-none focus:border-[#17806d] focus:ring-2 focus:ring-[#17806d]/15"
        />
      </label>
      <button
        type="submit"
        disabled={pending || !title.trim()}
        className="mt-4 rounded-md bg-[#171411] px-5 py-3 text-sm font-bold text-white shadow-md shadow-stone-900/15 hover:bg-black disabled:opacity-60"
      >
        {pending ? 'Adding...' : '+ Add to Matrix'}
      </button>
    </form>
  );
}

function FormLabel({ children, required = false }: { children: ReactNode; required?: boolean }) {
  return (
    <span className="mb-2 block text-[11px] font-bold uppercase tracking-[0.18em] text-stone-700">
      {children} {required && <span className="text-[#d83b78]">*</span>}
    </span>
  );
}

function ScoreSelect({
  value,
  onChange,
  confirmedLabel,
}: {
  value: ScoreValue;
  onChange: (value: ScoreValue) => void;
  confirmedLabel?: string;
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value as ScoreValue)}
      className="w-full rounded-md border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-950 outline-none focus:border-[#17806d] focus:ring-2 focus:ring-[#17806d]/15"
    >
      {SCORE_OPTIONS.map((option) => (
        <option key={option.value} value={option.value}>
          {option.value === 'CONFIRMED' && confirmedLabel ? confirmedLabel : option.label}
        </option>
      ))}
    </select>
  );
}

function normalizeMetrics(metrics: DoraMetrics): DoraMetrics {
  return Object.fromEntries(
    DORA_FIELDS.map((field) => {
      const value = metrics[field.key];
      return [field.key, value && value.trim() ? value.trim() : null];
    }),
  ) as unknown as DoraMetrics;
}

function buildDoraSummary(metrics: DoraMetrics): string {
  const normalized = normalizeMetrics(metrics);
  return DORA_FIELDS
    .map((field) => {
      const value = normalized[field.key];
      return value ? `${field.label}: ${value}` : null;
    })
    .filter(Boolean)
    .join('; ');
}

function findSignal(row: MatrixBlocker, signalType: SignalType): Signal | undefined {
  return row.signals.find((signal) => signal.signalType === signalType);
}

function scoreFromSignal(signal: Signal | undefined): ScoreValue {
  if (!signal) return 'NOT_CONFIRMED';
  if (signal.confirmed) return 'CONFIRMED';
  if (signal.evidenceValue === 'Partial / needs follow-up') return 'PARTIAL';
  return 'NOT_CONFIRMED';
}

function countConfirmed(...values: ScoreValue[]): number {
  return values.filter((value) => value === 'CONFIRMED').length;
}

function severityFromSources(sourceCount: number): Severity {
  if (sourceCount >= 3) return 'P1';
  if (sourceCount === 2) return 'P2';
  if (sourceCount === 1) return 'P3';
  return 'P4';
}

function signalBody(type: SignalType, score: ScoreValue, evidence: string | null) {
  return {
    signalType: type,
    signalName: SIGNAL_COPY[type].name,
    evidenceValue: scoreLabel(score),
    evidenceDescription: evidence,
    confirmed: score === 'CONFIRMED',
  };
}

async function upsertSignal(
  base: string,
  blockerId: string,
  existing: Signal | undefined,
  type: SignalType,
  score: ScoreValue,
  evidence: string | null,
) {
  const body = signalBody(type, score, evidence?.trim() || null);
  if (existing) {
    return api<Signal>(`${base}/signals/${existing.id}`, { method: 'PATCH', body });
  }
  return api<Signal>(`${base}/blockers/${blockerId}/signals`, { method: 'POST', body });
}

function scoreLabel(score: ScoreValue): string {
  return SCORE_OPTIONS.find((option) => option.value === score)?.label ?? score;
}

function sourceBadgeClass(count: number): string {
  const base = 'rounded-full px-2.5 py-1 text-xs font-bold';
  if (count >= 3) return `${base} bg-emerald-100 text-emerald-800`;
  if (count === 2) return `${base} bg-amber-100 text-amber-800`;
  return `${base} bg-stone-100 text-stone-600`;
}
