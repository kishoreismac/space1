import { type ReactNode } from 'react';

export type PhaseId = 'P1' | 'P2' | 'P3' | 'P4' | 'P5';

export interface PhaseActivity {
  title: string;
  body: string;
  tools?: string[];
}
export interface PhaseConfig {
  id: PhaseId;
  number: string;            // "01"
  tag: string;               // eyebrow
  title: string;
  timing: string;
  accent: string;            // hex
  activities: PhaseActivity[];
  gate: { title: string; body: string };
}

export const PHASE_CONFIG: Record<PhaseId, PhaseConfig> = {
  P1: {
    id: 'P1', number: '01', tag: 'PHASE 1 · SIGNAL TRIAGE',
    title: 'Score Triage & Cross-Pattern Detection',
    timing: 'Week 1 · 2-3 days · Triage lead + 1 analyst',
    accent: '#B8320A',
    activities: [
      { title: 'Apply Range Bands to Dimension Scores',
        body: 'For each of S/P/A/C/E compute the team mean (5-pt Likert). Classify each dimension as Critical (<2.5), Caution (2.5–3.4), Healthy (3.5–4.2), or Excellent (>4.2). Flag every Critical and Caution band for downstream phases.' },
      { title: 'Cross-Pattern Anti-Confirmation Check',
        body: 'Detect known multi-dimension patterns: low Performance + low Activity → workflow drag; low Communication + low Effectiveness → coordination tax; low Satisfaction + low Performance → burnout risk. Cross-patterns escalate priority by one level.' },
      { title: 'Psychological Safety Gate (Q7)',
        body: 'Inspect Q7 (psych-safety reversed item) alongside the Satisfaction mean. If Q7 ≥ 3.5 while Satisfaction < 3.0 the data is suspect — survey may need re-running with anonymity guarantees before continuing.' },
      { title: 'Produce Triage Output for Executive Read-Out',
        body: 'Output: a ranked dimension list with band, cross-pattern flags, trend vs last campaign, and a recommended next phase (P2 themes for soft signals, P3 quant for hard signals).',
        tools: ['Range bands', 'Cross-patterns', 'Trend Δ', 'Drop >0.4 alarm'] },
    ],
    gate: { title: 'Decision Gate · Emergency vs Standard Track',
      body: 'If 2+ dimensions are Critical OR psych-safety is suspect → Emergency Track: skip directly to P4 Journey Workshops and convene leadership. Otherwise proceed on the Standard Track through P2 → P3 → P4 → P5.' },
  },
  P2: {
    id: 'P2', number: '02', tag: 'PHASE 2 · OPEN TEXT ANALYSIS',
    title: 'Theme Clustering & JTBD Extraction',
    timing: 'Week 1-2 · 3-4 days · 2 analysts + facilitator',
    accent: '#B06A10',
    activities: [
      { title: 'Cluster Open-Text Responses into Themes',
        body: 'Inductive coding of every free-text answer. Group semantically related phrases into named themes. Capture a representative verbatim quote per theme for executive read-outs.' },
      { title: 'Apply the 30 % Threshold Rule',
        body: 'A theme is Promoted only when it appears in ≥30 % of respondents. 15-29 % → Investigate (needs corroboration in P3). <15 % → Monitor and park.' },
      { title: 'Extract Jobs-to-be-Done Statements',
        body: 'For each promoted theme, restate the underlying job: "When ___ I want to ___ so I can ___." JTBD statements feed P4 journey mapping and P5 blocker registry.' },
      { title: 'Anti-Confirmation: Misalignment Check',
        body: 'Compare each theme against the quantitative score for its parent dimension. If a high-frequency theme contradicts the score, flag it as Investigate — do not promote until P3 cross-validation confirms.',
        tools: ['Inductive coding', '30 % rule', 'JTBD', 'Verbatim quote'] },
    ],
    gate: { title: 'Decision Gate · Promote vs Investigate vs Monitor',
      body: 'Promoted themes carry forward as candidate blockers into P3 triangulation. Investigate themes wait for quantitative corroboration. Monitor themes are documented but excluded from this cycle.' },
  },
  P3: {
    id: 'P3', number: '03', tag: 'PHASE 3 · QUANTITATIVE CROSS-VALIDATION',
    title: 'Triangulate Survey Signals with Engineering Telemetry',
    timing: 'Week 2 · 2-3 days · Eng analytics + DevOps',
    accent: '#1A6B3C',
    activities: [
      { title: 'Pull DORA Baselines',
        body: 'Deployment Frequency, Lead Time for Changes, Change Failure Rate, MTTR for the assessment window. Compare against prior baseline; movement >25 % is a signal.' },
      { title: 'Pipeline & Build Telemetry',
        body: 'Build success/failure rates, average build duration, flaky-test counts, CI queue times. Confirms Performance-dimension complaints from P2.' },
      { title: 'PR & Code Review Data',
        body: 'PR cycle time, review wait time, review iterations, stale-PR counts. Corroborates Communication / Activity signals.' },
      { title: 'IDE & Developer Tooling Telemetry',
        body: 'Local build times, test execution times, context-switch frequency from IDE plugins. Corroborates Satisfaction / Effectiveness signals.',
        tools: ['DORA', 'CI/CD', 'PR data', 'IDE telemetry'] },
    ],
    gate: { title: 'Decision Gate · 2+ Source Triangulation Required',
      body: 'A candidate blocker is promoted to the Validated Blocker Registry only when ≥2 independent sources confirm it (survey + quant, or survey + open text + quant). 1-source signals route to P4 for qualitative validation.' },
  },
  P4: {
    id: 'P4', number: '04', tag: 'PHASE 4 · JOURNEY MAPPING WORKSHOPS',
    title: 'Qualitative Validation with Engineers in the Room',
    timing: 'Week 3 · 2 × 90-min sessions · 6-8 engineers per team',
    accent: '#4A3080',
    activities: [
      { title: 'Session Setup & Persona Framing',
        body: 'Choose the one user journey most implicated by P1-P3 signals (e.g., "onboard to codebase", "ship a feature", "respond to an incident"). Invite 6-8 engineers representing seniority and team breadth.' },
      { title: 'Walk the Journey End-to-End',
        body: 'On a shared canvas, lay out every step of the journey from trigger to completion. Capture tools used, hand-offs, and wait states at each step. Do not solution — observe only.' },
      { title: 'Annotate Friction + Dot Vote',
        body: 'Each participant annotates friction (red), delight (green), and questions (yellow) on every step. Then 5 dot-votes per person on the steps that hurt most. Top-voted steps become candidate blockers.' },
      { title: '5-Whys Root Cause on Top-Voted Steps',
        body: 'For each top-voted step run a structured 5-Whys with the group. Capture the root cause, the affected dimension(s), and the dev reach (% of team affected).',
        tools: ['Journey canvas', 'Dot vote', '5-Whys', 'Persona'] },
    ],
    gate: { title: 'Decision Gate · Confirmed Blocker vs Symptom-Only',
      body: 'Root causes confirmed by the workshop graduate to the Validated Blocker Registry in P5. Symptoms with no agreed root cause are returned to P2/P3 for further investigation in the next cycle.' },
  },
  P5: {
    id: 'P5', number: '05', tag: 'PHASE 5 · BLOCKER REGISTRY + AI FEASIBILITY',
    title: 'Score, Sequence & Output the AI Opportunity Map',
    timing: 'Week 3-4 · 3-4 days · Program lead + AI architect',
    accent: '#0B7A75',
    activities: [
      { title: 'Compile the Validated Blocker Registry',
        body: 'Pull every blocker that cleared P3 triangulation OR P4 root-cause confirmation. Capture title, SDLC phase, affected dimension, severity, dev reach %, and hrs/sprint lost.' },
      { title: 'AI Fit Flag (First Pass)',
        body: 'Classify each blocker on the AI-fit axis: Strong Fit (clear AI lever), Candidate (worth scoring), Investigate (data dependent), Not Fit (process/organisational only).' },
      { title: 'Score Feasibility on 5 Dimensions',
        body: 'For Candidate and Strong-Fit blockers, score Tool Maturity (25 %), Integration Ease (20 %), Cost Efficiency (25 %), Data Availability (15 %), Developer Adoption (15 %). Weighted composite drives sequencing.' },
      { title: 'Classify & Sequence',
        body: 'Composite ≥8.0 → Quick Win (now). 6.0-7.9 → Strategic Bet (next). 4.0-5.9 → Monitor (later). <4.0 → Defer or route to a Non-AI Workstream.',
        tools: ['Weighted scoring', '5-dim matrix', 'Quick Win / Strategic Bet', 'Non-AI route'] },
    ],
    gate: { title: 'Decision Gate · AI Backlog vs Non-AI Workstream',
      body: 'Quick Wins and Strategic Bets ship to the AI delivery backlog with reach × hours saved estimates. Non-AI Routes are handed to the platform / process owners with the same evidence pack.' },
  },
};

function PhaseHeader({ cfg }: { cfg: PhaseConfig }) {
  return (
    <div
      className="relative overflow-hidden rounded-2xl text-white px-8 py-7 mb-6 shadow-lg"
      style={{ background: `linear-gradient(135deg, ${cfg.accent} 0%, ${shade(cfg.accent, -25)} 100%)` }}
    >
      <div
        className="absolute -right-6 -top-10 font-black select-none leading-none"
        style={{ fontSize: '160px', opacity: 0.15, letterSpacing: '-0.04em' }}
      >
        {cfg.number}
      </div>
      <div className="relative">
        <div className="text-xs font-semibold tracking-[0.18em] uppercase opacity-80">{cfg.tag}</div>
        <h1 className="mt-2 text-3xl font-bold tracking-tight" style={{ fontFamily: '"Syne", system-ui, sans-serif' }}>{cfg.title}</h1>
        <div className="mt-2 text-sm opacity-90 italic" style={{ fontFamily: '"Lora", serif' }}>{cfg.timing}</div>
      </div>
    </div>
  );
}

function ActivityGrid({ cfg }: { cfg: PhaseConfig }) {
  return (
    <div className="grid gap-4 mb-6" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
      {cfg.activities.map((a, i) => (
        <div
          key={i}
          className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm hover:shadow-md transition"
          style={{ borderTop: `3px solid ${cfg.accent}` }}
        >
          <div className="text-[11px] font-semibold tracking-wider uppercase mb-1" style={{ color: cfg.accent }}>
            Activity {i + 1}
          </div>
          <h3 className="text-base font-semibold text-slate-900 mb-2 leading-snug">{a.title}</h3>
          <p className="text-sm text-slate-600 leading-relaxed">{a.body}</p>
          {a.tools && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {a.tools.map((t) => (
                <span key={t} className="text-[10px] font-medium uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                  {t}
                </span>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function DecisionGate({ cfg }: { cfg: PhaseConfig }) {
  return (
    <div
      className="rounded-xl px-6 py-5 mb-8 text-white shadow"
      style={{ background: 'linear-gradient(135deg, #1A3050 0%, #0D1B2A 100%)' }}
    >
      <div className="flex items-start gap-4">
        <div
          className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm"
          style={{ background: cfg.accent }}
        >
          ◆
        </div>
        <div>
          <div className="text-xs font-semibold tracking-[0.18em] uppercase mb-1" style={{ color: cfg.accent }}>
            Decision Gate
          </div>
          <h3 className="font-semibold text-lg mb-1">{cfg.gate.title.replace(/^Decision Gate · /, '')}</h3>
          <p className="text-sm text-slate-200 leading-relaxed">{cfg.gate.body}</p>
        </div>
      </div>
    </div>
  );
}

export function PhaseShell({ phase, children }: { phase: PhaseId; children: ReactNode }) {
  const cfg = PHASE_CONFIG[phase];
  return (
    <div>
      <PhaseHeader cfg={cfg} />
      <ActivityGrid cfg={cfg} />
      <DecisionGate cfg={cfg} />
      <div>{children}</div>
    </div>
  );
}

// shade hex by percent (-100..100) - simple lightness shift
function shade(hex: string, pct: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const adj = (c: number) => Math.max(0, Math.min(255, Math.round(c + (c * pct) / 100)));
  return `#${[adj(r), adj(g), adj(b)].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}
