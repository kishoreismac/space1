import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PublicQuestion, PublicQuestionnaire } from '@space/shared';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../stores/auth';

interface QuestionnaireListItem {
  id: string;
  title: string;
  companyId: string | null;
  status: string;
  version: number;
  updatedAt: string;
}
interface QuestionnaireListResponse {
  items: QuestionnaireListItem[];
}

interface QuestionFormState {
  questionNumber: number | '';
  dimensionCode: string;
  questionText: string;
  questionType: 'LIKERT' | 'OPEN_TEXT';
  isReverseScored: boolean;
  isRequired: boolean;
  minScale: number;
  maxScale: number;
  lowLabel: string;
  highLabel: string;
  blockerSignal: string;
}

const EMPTY_FORM: QuestionFormState = {
  questionNumber: '',
  dimensionCode: 'S',
  questionText: '',
  questionType: 'LIKERT',
  isReverseScored: false,
  isRequired: true,
  minScale: 1,
  maxScale: 5,
  lowLabel: 'Strongly disagree',
  highLabel: 'Strongly agree',
  blockerSignal: '',
};

const DIM_COLORS: Record<string, string> = {
  S: 'bg-rose-100 text-rose-700 border-rose-200',
  P: 'bg-amber-100 text-amber-800 border-amber-200',
  A: 'bg-sky-100 text-sky-700 border-sky-200',
  C: 'bg-violet-100 text-violet-700 border-violet-200',
  E: 'bg-emerald-100 text-emerald-700 border-emerald-200',
};

export default function QuestionsPage() {
  const role = useAuth((s) => s.user?.role);
  const userCompanyId = useAuth((s) => s.user?.companyId ?? null);
  const canEdit = role === 'SUPER_ADMIN' || role === 'COMPANY_ADMIN';
  const qc = useQueryClient();

  const list = useQuery({
    queryKey: ['questionnaires'],
    queryFn: () => api<QuestionnaireListResponse>('/api/questionnaires'),
  });

  const editable = useMemo(() => {
    const items = list.data?.items ?? [];
    if (role === 'SUPER_ADMIN') return items;
    return items.filter((q) => q.companyId === userCompanyId);
  }, [list.data, role, userCompanyId]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  useEffect(() => {
    if (!selectedId && editable[0]) setSelectedId(editable[0].id);
  }, [editable, selectedId]);

  const detail = useQuery({
    queryKey: ['questionnaire', selectedId],
    queryFn: () => api<PublicQuestionnaire>(`/api/questionnaires/${selectedId}`),
    enabled: !!selectedId,
  });

  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const dimensions = useMemo(() => {
    const seen = new Map<string, number>();
    for (const q of detail.data?.questions ?? []) {
      seen.set(q.dimensionCode, (seen.get(q.dimensionCode) ?? 0) + 1);
    }
    return Array.from(seen.entries()).map(([code, count]) => ({ code, count }));
  }, [detail.data]);

  const createQ = useMutation({
    mutationFn: (body: unknown) =>
      api(`/api/questionnaires/${selectedId}/questions`, { method: 'POST', body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['questionnaire', selectedId] });
      setShowAdd(false);
    },
  });
  const updateQ = useMutation({
    mutationFn: ({ qid, body }: { qid: string; body: unknown }) =>
      api(`/api/questionnaires/${selectedId}/questions/${qid}`, { method: 'PATCH', body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['questionnaire', selectedId] });
      setEditingId(null);
    },
  });
  const deleteQ = useMutation({
    mutationFn: (qid: string) =>
      api(`/api/questionnaires/${selectedId}/questions/${qid}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['questionnaire', selectedId] }),
  });

  if (!canEdit) {
    return (
      <div className="bg-white border border-slate-200 rounded p-8 text-center text-sm text-slate-500">
        You do not have permission to edit questionnaires.
      </div>
    );
  }

  const questions = detail.data?.questions ?? [];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold">Question library</h1>
        <p className="text-sm text-slate-500">
          View, add, edit, or remove questions on a questionnaire. Global templates require SUPER_ADMIN.
        </p>
      </header>

      <div className="bg-white rounded-lg border border-slate-200 p-4 flex flex-wrap items-center gap-3">
        <label className="text-sm">
          <span className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-1">
            Questionnaire
          </span>
          <select
            value={selectedId ?? ''}
            onChange={(e) => {
              setSelectedId(e.target.value || null);
              setEditingId(null);
              setShowAdd(false);
            }}
            className="border border-slate-300 rounded px-2 py-1.5 text-sm min-w-[320px]"
          >
            <option value="">—</option>
            {editable.map((q) => (
              <option key={q.id} value={q.id}>
                {q.title} (v{q.version}, {q.status}){q.companyId ? '' : ' · global'}
              </option>
            ))}
          </select>
        </label>
        {selectedId && (
          <button
            onClick={() => {
              setShowAdd((v) => !v);
              setEditingId(null);
            }}
            className="text-sm px-3 py-1.5 rounded bg-slate-900 text-white hover:bg-slate-800"
          >
            {showAdd ? 'Cancel' : '+ Add question'}
          </button>
        )}
        <div className="ml-auto flex gap-2 text-xs">
          {dimensions.map((d) => (
            <span
              key={d.code}
              className={`px-2 py-1 rounded border ${DIM_COLORS[d.code] ?? 'bg-slate-100 text-slate-700 border-slate-200'}`}
            >
              {d.code} · {d.count}
            </span>
          ))}
        </div>
      </div>

      {showAdd && selectedId && (
        <QuestionForm
          initial={{ ...EMPTY_FORM, dimensionCode: dimensions[0]?.code ?? 'S' }}
          dimensions={dimensions.map((d) => d.code)}
          pending={createQ.isPending}
          error={createQ.error instanceof ApiError ? createQ.error.message : undefined}
          submitLabel="Create question"
          onCancel={() => setShowAdd(false)}
          onSubmit={(body) => createQ.mutate(body)}
        />
      )}

      {detail.isLoading && <div className="text-sm text-slate-500">Loading…</div>}

      {!detail.isLoading && (
        <div className="bg-white rounded-lg border border-slate-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-500 border-b border-slate-200">
                <th className="py-2 px-3 w-12">#</th>
                <th className="py-2 px-3 w-16">Dim</th>
                <th className="py-2 px-3">Question</th>
                <th className="py-2 px-3 w-20 text-center">Type</th>
                <th className="py-2 px-3 w-20 text-center">Reverse</th>
                <th className="py-2 px-3 w-32 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {questions.map((q) => (
                <QuestionRow
                  key={q.id}
                  q={q}
                  isEditing={editingId === q.id}
                  dimensions={dimensions.map((d) => d.code)}
                  onEdit={() => {
                    setEditingId(q.id);
                    setShowAdd(false);
                  }}
                  onCancel={() => setEditingId(null)}
                  onSave={(body) => updateQ.mutate({ qid: q.id, body })}
                  onDelete={() => {
                    if (window.confirm(`Delete question Q${q.questionNumber}? Cannot be undone.`)) {
                      deleteQ.mutate(q.id);
                    }
                  }}
                  pending={updateQ.isPending || deleteQ.isPending}
                />
              ))}
              {questions.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-sm text-slate-400">
                    No questions yet. Use “+ Add question” above.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {deleteQ.error instanceof ApiError && (
        <div className="text-sm text-red-600">
          Delete failed: {deleteQ.error.message}
          {deleteQ.error.status === 409 && ' (this question already has answers).'}
        </div>
      )}
    </div>
  );
}

function QuestionRow({
  q,
  isEditing,
  dimensions,
  onEdit,
  onCancel,
  onSave,
  onDelete,
  pending,
}: {
  q: PublicQuestion;
  isEditing: boolean;
  dimensions: string[];
  onEdit: () => void;
  onCancel: () => void;
  onSave: (body: unknown) => void;
  onDelete: () => void;
  pending: boolean;
}) {
  if (isEditing) {
    return (
      <tr className="bg-amber-50/40 border-b border-slate-100">
        <td colSpan={6} className="p-3">
          <QuestionForm
            initial={{
              questionNumber: q.questionNumber,
              dimensionCode: q.dimensionCode,
              questionText: q.text,
              questionType: q.type === 'OPEN_TEXT' ? 'OPEN_TEXT' : 'LIKERT',
              isReverseScored: q.isReverseScored,
              isRequired: q.isRequired,
              minScale: q.minScale ?? 1,
              maxScale: q.maxScale ?? 5,
              lowLabel: q.lowLabel ?? '',
              highLabel: q.highLabel ?? '',
              blockerSignal: q.blockerSignal ?? '',
            }}
            dimensions={dimensions}
            pending={pending}
            submitLabel="Save changes"
            onCancel={onCancel}
            onSubmit={onSave}
          />
        </td>
      </tr>
    );
  }
  return (
    <tr className="border-b border-slate-100 hover:bg-slate-50/50">
      <td className="py-2 px-3 text-xs text-slate-500">Q{q.questionNumber}</td>
      <td className="py-2 px-3">
        <span
          className={`text-[11px] px-1.5 py-0.5 rounded border ${
            DIM_COLORS[q.dimensionCode] ?? 'bg-slate-100 text-slate-700 border-slate-200'
          }`}
        >
          {q.dimensionCode}
        </span>
      </td>
      <td className="py-2 px-3">
        <div className="text-slate-800">{q.text}</div>
        {q.blockerSignal && (
          <div className="text-[11px] text-amber-700 mt-0.5">⚑ {q.blockerSignal}</div>
        )}
      </td>
      <td className="py-2 px-3 text-center text-[11px] text-slate-500">{q.type}</td>
      <td className="py-2 px-3 text-center text-[11px]">
        {q.isReverseScored ? <span className="text-amber-700">↩ yes</span> : <span className="text-slate-400">no</span>}
      </td>
      <td className="py-2 px-3 text-right space-x-2">
        <button
          onClick={onEdit}
          className="text-xs px-2 py-1 rounded border border-slate-300 hover:bg-slate-100"
        >
          Edit
        </button>
        <button
          onClick={onDelete}
          disabled={pending}
          className="text-xs px-2 py-1 rounded border border-red-300 text-red-700 hover:bg-red-50 disabled:opacity-50"
        >
          Delete
        </button>
      </td>
    </tr>
  );
}

function QuestionForm({
  initial,
  dimensions,
  onSubmit,
  onCancel,
  pending,
  error,
  submitLabel,
}: {
  initial: QuestionFormState;
  dimensions: string[];
  onSubmit: (body: unknown) => void;
  onCancel: () => void;
  pending: boolean;
  error?: string;
  submitLabel: string;
}) {
  const [s, setS] = useState(initial);
  const dimChoices = dimensions.length > 0 ? dimensions : ['S', 'P', 'A', 'C', 'E'];

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const body: Record<string, unknown> = {
          dimensionCode: s.dimensionCode,
          questionText: s.questionText.trim(),
          questionType: s.questionType,
          isReverseScored: s.isReverseScored,
          isRequired: s.isRequired,
          blockerSignal: s.blockerSignal.trim() || null,
        };
        if (s.questionNumber !== '') body.questionNumber = Number(s.questionNumber);
        if (s.questionType === 'LIKERT') {
          body.minScale = s.minScale;
          body.maxScale = s.maxScale;
          body.lowLabel = s.lowLabel || null;
          body.highLabel = s.highLabel || null;
        } else {
          body.minScale = null;
          body.maxScale = null;
          body.lowLabel = null;
          body.highLabel = null;
        }
        onSubmit(body);
      }}
      className="space-y-3 bg-slate-50 border border-slate-200 rounded p-4"
    >
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
        <label className="md:col-span-2 text-xs">
          <span className="block font-semibold uppercase tracking-wide text-slate-600 mb-1">
            Number
          </span>
          <input
            type="number"
            min={1}
            placeholder="auto"
            value={s.questionNumber}
            onChange={(e) => setS({ ...s, questionNumber: e.target.value === '' ? '' : Number(e.target.value) })}
            className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm"
          />
        </label>
        <label className="md:col-span-2 text-xs">
          <span className="block font-semibold uppercase tracking-wide text-slate-600 mb-1">
            Dimension
          </span>
          <select
            value={s.dimensionCode}
            onChange={(e) => setS({ ...s, dimensionCode: e.target.value })}
            className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm"
          >
            {dimChoices.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </label>
        <label className="md:col-span-2 text-xs">
          <span className="block font-semibold uppercase tracking-wide text-slate-600 mb-1">
            Type
          </span>
          <select
            value={s.questionType}
            onChange={(e) => setS({ ...s, questionType: e.target.value as 'LIKERT' | 'OPEN_TEXT' })}
            className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm"
          >
            <option value="LIKERT">LIKERT</option>
            <option value="OPEN_TEXT">OPEN_TEXT</option>
          </select>
        </label>
        <label className="md:col-span-3 text-xs flex items-end gap-2">
          <input
            id="reverse"
            type="checkbox"
            checked={s.isReverseScored}
            onChange={(e) => setS({ ...s, isReverseScored: e.target.checked })}
            className="h-4 w-4"
          />
          <span>Reverse scored</span>
        </label>
        <label className="md:col-span-3 text-xs flex items-end gap-2">
          <input
            id="required"
            type="checkbox"
            checked={s.isRequired}
            onChange={(e) => setS({ ...s, isRequired: e.target.checked })}
            className="h-4 w-4"
          />
          <span>Required</span>
        </label>
      </div>

      <label className="block text-xs">
        <span className="block font-semibold uppercase tracking-wide text-slate-600 mb-1">
          Question text
        </span>
        <textarea
          required
          rows={2}
          value={s.questionText}
          onChange={(e) => setS({ ...s, questionText: e.target.value })}
          className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm"
        />
      </label>

      {s.questionType === 'LIKERT' && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <label className="text-xs">
            <span className="block font-semibold uppercase tracking-wide text-slate-600 mb-1">
              Min scale
            </span>
            <input
              type="number"
              min={0}
              max={20}
              value={s.minScale}
              onChange={(e) => setS({ ...s, minScale: Number(e.target.value) })}
              className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm"
            />
          </label>
          <label className="text-xs">
            <span className="block font-semibold uppercase tracking-wide text-slate-600 mb-1">
              Max scale
            </span>
            <input
              type="number"
              min={1}
              max={20}
              value={s.maxScale}
              onChange={(e) => setS({ ...s, maxScale: Number(e.target.value) })}
              className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm"
            />
          </label>
          <label className="text-xs">
            <span className="block font-semibold uppercase tracking-wide text-slate-600 mb-1">
              Low label
            </span>
            <input
              type="text"
              value={s.lowLabel}
              onChange={(e) => setS({ ...s, lowLabel: e.target.value })}
              className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm"
            />
          </label>
          <label className="text-xs">
            <span className="block font-semibold uppercase tracking-wide text-slate-600 mb-1">
              High label
            </span>
            <input
              type="text"
              value={s.highLabel}
              onChange={(e) => setS({ ...s, highLabel: e.target.value })}
              className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm"
            />
          </label>
        </div>
      )}

      <label className="block text-xs">
        <span className="block font-semibold uppercase tracking-wide text-slate-600 mb-1">
          Blocker signal (optional)
        </span>
        <input
          type="text"
          value={s.blockerSignal}
          onChange={(e) => setS({ ...s, blockerSignal: e.target.value })}
          placeholder="e.g. low scores indicate CI flakiness"
          className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm"
        />
      </label>

      {error && <div className="text-xs text-red-600">{error}</div>}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="text-xs px-3 py-1.5 rounded border border-slate-300 hover:bg-slate-100"
        >
          Cancel
        </button>
        <button
          disabled={pending}
          className="text-xs px-3 py-1.5 rounded bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {pending ? 'Saving…' : submitLabel}
        </button>
      </div>
    </form>
  );
}
