import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Campaign, Company } from '@space/shared';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../stores/auth';

interface CompaniesResponse { items: Company[]; }
interface CampaignsResponse { items: Campaign[]; }

interface BulkResponse {
  created: number;
  skipped: Array<{ row: number; reason: string }>;
  answerCount: number;
  totalRows: number;
  replace: boolean;
}
interface ManualResponse {
  created: number;
  dims: { S: number; P: number; A: number; C: number; E: number };
}

type Tab = 'csv' | 'manual';

const CSV_TEMPLATE =
  'team,role,name,years,primary,Q1,Q2,Q3,Q4,Q5,Q6,Q7,Q8,Q9,Q10\n' +
  'Precision Ag,Senior Engineer,Anon-001,3-5,TypeScript,3,2,4,3,2,3,4,3,2,"CI is slow today"\n' +
  'Precision Ag,Tech Lead,Anon-002,5-10,Go,2,3,3,2,3,3,3,2,3,"Local env broke again"\n';

export default function BulkUploadPage() {
  const role = useAuth((s) => s.user?.role);
  const userCompanyId = useAuth((s) => s.user?.companyId ?? null);
  const canUpload = role === 'SUPER_ADMIN' || role === 'COMPANY_ADMIN';

  const [companyId, setCompanyId] = useState<string | null>(userCompanyId);
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('csv');

  const companies = useQuery({
    queryKey: ['companies'],
    queryFn: () => api<CompaniesResponse>('/api/companies'),
  });
  useEffect(() => {
    if (!companyId && companies.data?.items[0]) setCompanyId(companies.data.items[0].id);
  }, [companies.data, companyId]);

  const campaigns = useQuery({
    queryKey: ['campaigns', companyId],
    queryFn: () => api<CampaignsResponse>(`/api/companies/${companyId}/campaigns`),
    enabled: !!companyId,
  });
  useEffect(() => {
    if (!campaignId && campaigns.data?.items[0]) setCampaignId(campaigns.data.items[0].id);
  }, [campaigns.data, campaignId]);

  if (!canUpload) {
    return (
      <div className="bg-white border border-slate-200 rounded p-8 text-center text-sm text-slate-500">
        You do not have permission to upload survey results.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold">Upload survey results</h1>
        <p className="text-sm text-slate-500">
          Bulk-import completed SPACE responses without using invite links — paste CSV rows or
          enter pre-computed dimension averages.
        </p>
      </header>

      <div className="bg-white rounded-lg border border-slate-200 p-4 flex flex-wrap gap-3 items-center">
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
            className="border border-slate-300 rounded px-2 py-1.5 text-sm min-w-[260px]"
          >
            <option value="">—</option>
            {campaigns.data?.items.map((c) => (
              <option key={c.id} value={c.id}>{c.title} · {c.status}</option>
            ))}
          </select>
        </label>
      </div>

      {companyId && campaignId ? (
        <>
          <div className="bg-white rounded-lg border border-slate-200 inline-flex p-1">
            <TabButton active={tab === 'csv'} onClick={() => setTab('csv')}>Paste CSV</TabButton>
            <TabButton active={tab === 'manual'} onClick={() => setTab('manual')}>
              Manual dimension entry
            </TabButton>
          </div>
          {tab === 'csv' ? (
            <CsvPanel companyId={companyId} campaignId={campaignId} />
          ) : (
            <ManualPanel companyId={companyId} campaignId={campaignId} />
          )}
        </>
      ) : (
        <div className="bg-white rounded-lg border border-slate-200 p-8 text-center text-sm text-slate-500">
          Pick a campaign to upload results.
        </div>
      )}
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`text-sm px-4 py-1.5 rounded ${
        active ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
      }`}
    >
      {children}
    </button>
  );
}

function CsvPanel({ companyId, campaignId }: { companyId: string; campaignId: string }) {
  const qc = useQueryClient();
  const [csv, setCsv] = useState(CSV_TEMPLATE);
  const [replace, setReplace] = useState(false);
  const [result, setResult] = useState<BulkResponse | null>(null);

  const upload = useMutation({
    mutationFn: () =>
      api<BulkResponse>(
        `/api/companies/${companyId}/campaigns/${campaignId}/upload/bulk`,
        { method: 'POST', body: { csv, replace } },
      ),
    onSuccess: (data) => {
      setResult(data);
      qc.invalidateQueries({ queryKey: ['results', campaignId] });
      qc.invalidateQueries({ queryKey: ['campaigns', companyId] });
    },
  });

  const handleFile = async (file: File) => {
    const text = await file.text();
    setCsv(text);
  };

  return (
    <section className="bg-white rounded-lg border border-slate-200 p-5 space-y-3">
      <div className="text-sm text-slate-700">
        Paste rows with one respondent per row. First row is the header. Required columns:
        <code className="mx-1 px-1 bg-slate-100 rounded">team</code>,
        <code className="mx-1 px-1 bg-slate-100 rounded">role</code>,
        and at least one <code className="mx-1 px-1 bg-slate-100 rounded">Q1</code>…<code className="px-1 bg-slate-100 rounded">QN</code> column.
        Numeric values become LIKERT answers; text values become open-text.
      </div>
      <div className="flex items-center gap-3">
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          className="text-xs"
        />
        <label className="text-xs flex items-center gap-2 ml-auto">
          <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} />
          Replace prior bulk uploads
        </label>
      </div>
      <textarea
        value={csv}
        onChange={(e) => setCsv(e.target.value)}
        rows={14}
        spellCheck={false}
        className="w-full border border-slate-300 rounded px-2 py-1.5 text-xs font-mono"
      />
      {upload.error instanceof ApiError && (
        <div className="text-sm text-red-600">{upload.error.message}</div>
      )}
      {result && (
        <div className="bg-emerald-50 border border-emerald-200 rounded p-3 text-sm text-emerald-800">
          ✓ Created <strong>{result.created}</strong> submissions ({result.answerCount} answers).
          {result.skipped.length > 0 && <> Skipped {result.skipped.length} rows.</>}
          {result.replace && ' Prior bulk uploads were replaced.'}
        </div>
      )}
      <button
        onClick={() => upload.mutate()}
        disabled={upload.isPending || !csv.trim()}
        className="text-sm px-4 py-1.5 rounded bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50"
      >
        {upload.isPending ? 'Uploading…' : 'Upload CSV'}
      </button>
    </section>
  );
}

function ManualPanel({ companyId, campaignId }: { companyId: string; campaignId: string }) {
  const qc = useQueryClient();
  const [scores, setScores] = useState({ S: 3.0, P: 3.0, A: 3.0, C: 3.0, E: 3.0 });
  const [respondents, setRespondents] = useState(20);
  const [label, setLabel] = useState('');
  const [result, setResult] = useState<ManualResponse | null>(null);

  const submit = useMutation({
    mutationFn: () =>
      api<ManualResponse>(
        `/api/companies/${companyId}/campaigns/${campaignId}/upload/manual`,
        {
          method: 'POST',
          body: { ...scores, respondents, label: label.trim() || undefined },
        },
      ),
    onSuccess: (data) => {
      setResult(data);
      qc.invalidateQueries({ queryKey: ['results', campaignId] });
    },
  });

  const dimMeta: Array<{ key: 'S' | 'P' | 'A' | 'C' | 'E'; name: string; color: string }> = [
    { key: 'S', name: 'Satisfaction',  color: 'bg-blue-50 border-blue-200' },
    { key: 'P', name: 'Performance',   color: 'bg-emerald-50 border-emerald-200' },
    { key: 'A', name: 'Activity',      color: 'bg-amber-50 border-amber-200' },
    { key: 'C', name: 'Communication', color: 'bg-violet-50 border-violet-200' },
    { key: 'E', name: 'Efficiency',    color: 'bg-rose-50 border-rose-200' },
  ];

  return (
    <section className="bg-white rounded-lg border border-slate-200 p-5 space-y-4">
      <div className="text-sm text-slate-700">
        Enter pre-computed dimension averages (1–5) plus respondent count. The system synthesises
        that many submissions whose answers round to the target average per dimension. Reverse-scored
        questions are inverted automatically. Re-running replaces all prior manual entries for this campaign.
      </div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {dimMeta.map((d) => (
          <label key={d.key} className={`block border rounded p-3 ${d.color}`}>
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-700">
              {d.key} · {d.name}
            </span>
            <input
              type="number"
              min={1}
              max={5}
              step={0.1}
              value={scores[d.key]}
              onChange={(e) =>
                setScores({ ...scores, [d.key]: Number(e.target.value) })
              }
              className="mt-2 w-full border border-slate-300 rounded px-2 py-1.5 text-lg font-semibold bg-white"
            />
          </label>
        ))}
      </div>
      <div className="flex flex-wrap gap-3 items-end">
        <label className="text-xs">
          <span className="block font-semibold uppercase tracking-wide text-slate-600 mb-1">Respondents</span>
          <input
            type="number"
            min={1}
            max={500}
            value={respondents}
            onChange={(e) => setRespondents(Number(e.target.value))}
            className="border border-slate-300 rounded px-2 py-1.5 text-sm w-28"
          />
        </label>
        <label className="text-xs flex-1">
          <span className="block font-semibold uppercase tracking-wide text-slate-600 mb-1">Note (optional)</span>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Imported from Q1 2025 vendor survey"
            className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm"
          />
        </label>
        <button
          onClick={() => submit.mutate()}
          disabled={submit.isPending}
          className="text-sm px-4 py-1.5 rounded bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {submit.isPending ? 'Saving…' : 'Generate submissions'}
        </button>
      </div>
      {submit.error instanceof ApiError && (
        <div className="text-sm text-red-600">{submit.error.message}</div>
      )}
      {result && (
        <div className="bg-emerald-50 border border-emerald-200 rounded p-3 text-sm text-emerald-800">
          ✓ Created <strong>{result.created}</strong> synthetic submissions targeting
          {' '}S={result.dims.S} P={result.dims.P} A={result.dims.A} C={result.dims.C} E={result.dims.E}.
        </div>
      )}
    </section>
  );
}
