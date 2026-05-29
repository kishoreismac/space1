import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import type {
  PublicQuestion,
  PublicSurveyContext,
  SubmissionAnswerInput,
  SubmissionPayload,
} from '@space/shared';
import { api, ApiError } from '../../lib/api';
import './survey-theme.css';

const YEARS_OPTIONS = ['< 1', '1-3', '3-5', '5-10', '10+'];
const ROLE_OPTIONS = [
  'Software Engineer',
  'Senior Engineer',
  'Tech Lead',
  'Engineering Manager',
  'Architect',
  'QA / SDET',
  'DevOps / SRE',
  'Other',
];

const DIM_ORDER = ['S', 'P', 'A', 'C', 'E'] as const;
type DimKey = (typeof DIM_ORDER)[number];

const DIM_META: Record<DimKey, { name: string; desc: string; cls: string }> = {
  S: {
    name: 'Satisfaction & Wellbeing',
    desc: 'How developers feel about their work, tools, and culture',
    cls: 's',
  },
  P: {
    name: 'Performance & Outcomes',
    desc: 'Quality and reliability of work delivered — not just volume',
    cls: 'p',
  },
  A: {
    name: 'Activity & Output Patterns',
    desc: 'Visible work distribution — always pair with Satisfaction',
    cls: 'a',
  },
  C: {
    name: 'Communication & Collaboration',
    desc: 'Team health, handoffs, and cross-functional coordination',
    cls: 'c',
  },
  E: {
    name: 'Efficiency & Flow',
    desc: 'How well tooling and pipelines support uninterrupted work',
    cls: 'e',
  },
};

function dimKey(code: string): DimKey {
  const c = code.trim().toUpperCase().charAt(0);
  return (DIM_ORDER as readonly string[]).includes(c) ? (c as DimKey) : 'S';
}

export default function SurveyLanding() {
  const { token } = useParams<{ token: string }>();

  const ctx = useQuery({
    queryKey: ['survey', token],
    queryFn: () =>
      api<PublicSurveyContext>(`/api/public/survey/${token}`, { auth: false }),
    retry: false,
  });

  if (ctx.isLoading) {
    return (
      <div className="survey-theme">
        <main style={{ padding: '4rem 1.5rem', textAlign: 'center' }}>
          <p style={{ color: 'var(--muted)' }}>Loading survey…</p>
        </main>
      </div>
    );
  }
  if (ctx.error) {
    const err = ctx.error as ApiError;
    return (
      <div className="survey-theme">
        <main style={{ padding: '4rem 1.5rem', textAlign: 'center' }}>
          <h1 style={{ fontFamily: "'Fraunces',serif", fontSize: '1.5rem', marginBottom: '.5rem' }}>
            Survey unavailable
          </h1>
          <p style={{ color: 'var(--muted)' }}>{err.message}</p>
        </main>
      </div>
    );
  }
  if (!ctx.data) return null;
  return <SurveyFlow token={token!} context={ctx.data} />;
}

export { SurveyFlow };

function SurveyFlow({ token, context }: { token: string; context: PublicSurveyContext }) {
  const { questionnaire, campaign, company, teams, invite } = context;

  const [teamId, setTeamId] = useState<string | null>(invite.teamId);
  const [roleLabel, setRoleLabel] = useState<string | null>(invite.roleLabel);
  const [yearsAtCompany, setYearsAtCompany] = useState<string | null>(null);
  const [primaryTechnology, setPrimaryTechnology] = useState<string>('');
  const [answers, setAnswers] = useState<Record<number, SubmissionAnswerInput>>({});
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const toastTimer = useRef<number | null>(null);

  const submit = useMutation({
    mutationFn: (payload: SubmissionPayload) =>
      api<{ submissionId: string }>(`/api/public/survey/${token}/submit`, {
        method: 'POST',
        body: payload,
        auth: false,
      }),
    onSuccess: () => {
      setSubmitted(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    onError: (err) => setErrorMsg((err as Error).message),
  });

  // Group questions by dimension preserving original order
  const grouped = useMemo(() => {
    const m = new Map<DimKey, PublicQuestion[]>();
    for (const q of questionnaire.questions) {
      const k = dimKey(q.dimensionCode);
      const arr = m.get(k) ?? [];
      arr.push(q);
      m.set(k, arr);
    }
    return m;
  }, [questionnaire.questions]);

  const totalScalable = useMemo(
    () => questionnaire.questions.filter((q) => q.type !== 'OPEN_TEXT').length,
    [questionnaire.questions],
  );
  const totalQuestions = questionnaire.questions.length;
  const completed = useMemo(() => {
    let n = 0;
    for (const q of questionnaire.questions) {
      const a = answers[q.questionNumber];
      if (!a) continue;
      if (q.type === 'OPEN_TEXT') {
        if (a.textValue && a.textValue.trim().length > 0) n++;
      } else if (a.rawValue != null) {
        n++;
      }
    }
    return n;
  }, [answers, questionnaire.questions]);
  const progressPct = totalQuestions === 0 ? 0 : (completed / totalQuestions) * 100;

  function setAnswer(num: number, patch: Partial<SubmissionAnswerInput>) {
    setAnswers((prev) => ({
      ...prev,
      [num]: { questionNumber: num, ...prev[num], ...patch },
    }));
  }

  function showToast(msg: string) {
    setToastMsg(msg);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToastMsg(null), 2800);
  }

  // Compute SPACE dimension averages (1–5) honouring reverse scoring
  const dimAverages = useMemo(() => {
    const acc: Record<DimKey, { sum: number; n: number }> = {
      S: { sum: 0, n: 0 },
      P: { sum: 0, n: 0 },
      A: { sum: 0, n: 0 },
      C: { sum: 0, n: 0 },
      E: { sum: 0, n: 0 },
    };
    for (const q of questionnaire.questions) {
      if (q.type === 'OPEN_TEXT') continue;
      const raw = answers[q.questionNumber]?.rawValue;
      if (raw == null) continue;
      const max = q.maxScale ?? 5;
      const min = q.minScale ?? 1;
      const v = q.isReverseScored ? max + min - raw : raw;
      const k = dimKey(q.dimensionCode);
      acc[k].sum += v;
      acc[k].n += 1;
    }
    const out: Record<DimKey, number | null> = { S: null, P: null, A: null, C: null, E: null };
    for (const k of DIM_ORDER) {
      out[k] = acc[k].n > 0 ? acc[k].sum / acc[k].n : null;
    }
    return out;
  }, [answers, questionnaire.questions]);

  function handleSubmit() {
    setErrorMsg(null);

    // Validate required
    const missing: number[] = [];
    for (const q of questionnaire.questions) {
      if (!q.isRequired) continue;
      const a = answers[q.questionNumber];
      if (q.type === 'OPEN_TEXT') {
        if (!a?.textValue || a.textValue.trim().length === 0) missing.push(q.questionNumber);
      } else if (a?.rawValue == null) {
        missing.push(q.questionNumber);
      }
    }
    if (missing.length > 0) {
      const first = missing[0];
      setErrorMsg(
        `Please answer all required questions before submitting. ${missing.length} remaining (next: Q${first}).`,
      );
      const el = document.getElementById(`q-${first}`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      showToast(`Q${first} still needs an answer`);
      return;
    }

    const payload: SubmissionPayload = {
      teamId: teamId || null,
      roleLabel: roleLabel || null,
      yearsAtCompany: yearsAtCompany || null,
      primaryTechnology: primaryTechnology || null,
      answers: Object.values(answers),
    };
    submit.mutate(payload);
  }

  if (submitted) {
    return (
      <div className="survey-theme">
        <header className="site-header">
          <p className="eyebrow">{company.name} · Platform Engineering</p>
          <h1>
            Thank you<br />
            <em>your response is recorded</em>
          </h1>
          <p>
            Your answers for <strong style={{ color: '#5EEAD4' }}>{campaign.title}</strong> have
            been submitted anonymously. You can safely close this tab.
          </p>
        </header>
        <main>
          <div className="results-panel show">
            <div className="results-title">Your SPACE profile (preview)</div>
            <p
              style={{
                fontSize: 12,
                color: 'var(--muted)',
                marginBottom: '1.25rem',
              }}
            >
              Aggregated, anonymous results are reviewed by your Platform Engineering team. You
              will not be identified individually.
            </p>
            {DIM_ORDER.map((k) => {
              const v = dimAverages[k];
              const pct = v == null ? 0 : (v / 5) * 100;
              return (
                <div className="dim-row" key={k}>
                  <div className="dim-row-label">
                    {k} — {DIM_META[k].name}
                  </div>
                  <div className="dim-bar-track">
                    <div
                      className={`dim-bar-fill bf-${DIM_META[k].cls}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="dim-row-val">{v == null ? '—' : v.toFixed(1)}</div>
                </div>
              );
            })}
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="survey-theme">
      <header className="site-header">
        <p className="eyebrow">{company.name} · Platform Engineering</p>
        <h1>
          SPACE Developer<br />
          <em>Productivity Survey</em>
        </h1>
        <p>
          Help your Platform Engineering team identify where AI and tooling can best support your
          workflow.{' '}
          {questionnaire.isAnonymous
            ? 'All responses are anonymous'
            : 'Responses are linked to your invite'}{' '}
          and take approximately {questionnaire.estimatedMinutes} minutes.
        </p>
        <div className="header-meta">
          <div className="meta-badge">
            <strong>{totalQuestions}</strong> questions
          </div>
          <div className="meta-badge">
            <strong>5</strong> dimensions
          </div>
          <div className="meta-badge">
            ~<strong>{questionnaire.estimatedMinutes} min</strong>
          </div>
          <div className="meta-badge">{questionnaire.isAnonymous ? 'Anonymous' : 'Attributed'}</div>
          {campaign.cycle && (
            <div className="meta-badge">
              Cycle <strong>{campaign.cycle}</strong>
            </div>
          )}
        </div>
      </header>

      <div className="sticky-bar">
        <div className="prog-track">
          <div className="prog-fill" style={{ width: `${progressPct}%` }} />
        </div>
        <div className="prog-text">
          {completed} / {totalQuestions}
        </div>
      </div>

      <main>
        {/* Context card */}
        <div className="ctx-card">
          <div className="ctx-title">About you — context helps us interpret results</div>
          <div className="ctx-grid">
            <div className="field-group">
              <label className="field-label">Team / Squad</label>
              <select
                className="field-select"
                value={teamId ?? ''}
                onChange={(e) => setTeamId(e.target.value || null)}
              >
                <option value="">— prefer not to say —</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field-group">
              <label className="field-label">Role</label>
              <select
                className="field-select"
                value={roleLabel ?? ''}
                onChange={(e) => setRoleLabel(e.target.value || null)}
              >
                <option value="">Select your role</option>
                {ROLE_OPTIONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
            <div className="field-group">
              <label className="field-label">Years at company</label>
              <select
                className="field-select"
                value={yearsAtCompany ?? ''}
                onChange={(e) => setYearsAtCompany(e.target.value || null)}
              >
                <option value="">Select</option>
                {YEARS_OPTIONS.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
            <div className="field-group">
              <label className="field-label">Primary language</label>
              <input
                className="field-input"
                value={primaryTechnology}
                onChange={(e) => setPrimaryTechnology(e.target.value)}
                placeholder="e.g. Python, TypeScript"
              />
            </div>
          </div>
        </div>

        {/* Dimension sections */}
        {DIM_ORDER.map((k) => {
          const qs = grouped.get(k) ?? [];
          if (qs.length === 0) return null;
          const meta = DIM_META[k];
          const avg = dimAverages[k];
          return (
            <section className="dim-section" key={k}>
              <div className={`dim-header dh-${meta.cls}`}>
                <div className={`dim-letter dl-${meta.cls}`}>{k}</div>
                <div className="dim-info">
                  <h2>{meta.name}</h2>
                  <p>{meta.desc}</p>
                </div>
                <div className="dim-score-preview">
                  <strong>{avg == null ? '—' : avg.toFixed(1)}</strong>
                  / 5.0
                </div>
              </div>

              {qs.map((q) => (
                <QuestionCard
                  key={q.id}
                  question={q}
                  answer={answers[q.questionNumber]}
                  dimCls={meta.cls}
                  onScale={(v) => setAnswer(q.questionNumber, { rawValue: v })}
                  onText={(v) => setAnswer(q.questionNumber, { textValue: v })}
                />
              ))}
            </section>
          );
        })}

        {/* Submit */}
        <div className="submit-section">
          <h3>Ready to submit?</h3>
          <p>
            You&apos;ve answered <strong style={{ color: '#5EEAD4' }}>{completed}</strong> of{' '}
            {totalQuestions} questions.
            <br />
            Review your answers above, then submit when you&apos;re ready — you cannot edit
            afterwards.
          </p>
          {errorMsg && (
            <p
              style={{
                color: '#FCA5A5',
                fontSize: 12,
                marginBottom: '1rem',
                fontWeight: 500,
              }}
            >
              {errorMsg}
            </p>
          )}
          <button
            className="submit-btn"
            onClick={handleSubmit}
            disabled={submit.isPending}
            style={submit.isPending ? { opacity: 0.6, cursor: 'wait' } : undefined}
          >
            {submit.isPending
              ? 'Submitting…'
              : `Submit ${completed}/${totalQuestions} responses ▶`}
          </button>
          <p className="submit-note">
            Required: {totalScalable} scaled questions ·{' '}
            {questionnaire.questions.filter((q) => q.type === 'OPEN_TEXT').length} open-ended
          </p>
        </div>
      </main>

      <div id="toast" className={toastMsg ? 'show' : ''}>
        {toastMsg}
      </div>
    </div>
  );
}

function QuestionCard({
  question: q,
  answer,
  dimCls,
  onScale,
  onText,
}: {
  question: PublicQuestion;
  answer: SubmissionAnswerInput | undefined;
  dimCls: string;
  onScale: (v: number) => void;
  onText: (v: string) => void;
}) {
  const isOpen = q.type === 'OPEN_TEXT';
  const isAnswered = isOpen
    ? !!answer?.textValue && answer.textValue.trim().length > 0
    : answer?.rawValue != null;
  const min = q.minScale ?? 1;
  const max = q.maxScale ?? 5;
  const scale: number[] = [];
  for (let i = min; i <= max; i++) scale.push(i);

  return (
    <div
      id={`q-${q.questionNumber}`}
      className={`q-card${isAnswered ? ` done done-${dimCls}` : ''}`}
    >
      <div className="q-top">
        <span className="q-num">Q{q.questionNumber}</span>
        <p className="q-text">
          {q.text}
          {q.isReverseScored && <span className="rev-tag">Reverse</span>}
        </p>
      </div>
      {q.blockerSignal && <div className="q-sig">↳ {q.blockerSignal}</div>}

      {isOpen ? (
        <>
          <span className="open-prompt">Optional — your words help us interpret the data.</span>
          <textarea
            className="q-open"
            placeholder="Type your answer…"
            value={answer?.textValue ?? ''}
            onChange={(e) => onText(e.target.value)}
          />
        </>
      ) : (
        <div className="scale-wrap">
          <span className="scale-lbl">{q.lowLabel ?? 'Strongly disagree'}</span>
          <div className="scale-btns">
            {scale.map((n) => (
              <button
                type="button"
                key={n}
                className={`sb${answer?.rawValue === n ? ` sel-${dimCls}` : ''}`}
                onClick={() => onScale(n)}
              >
                {n}
              </button>
            ))}
          </div>
          <span className="scale-lbl r">{q.highLabel ?? 'Strongly agree'}</span>
        </div>
      )}
    </div>
  );
}
