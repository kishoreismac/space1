import type { DimensionDef, QuestionDef } from '../types/index.js';

/**
 * Canonical SPACE questionnaire.
 * 50 main SPACE questions plus one overall SDLC blocker prompt.
 * This is shipped as the default GLOBAL questionnaire template (created by
 * the production seed, not as worked-example data).
 */

export const SPACE_DIMENSIONS: DimensionDef[] = [
  {
    code: 'S',
    name: 'Satisfaction & Wellbeing',
    description: 'How developers feel about their work, tools, and culture',
    color: '#0F766E',
  },
  {
    code: 'P',
    name: 'Performance & Outcomes',
    description: 'Quality and reliability of work delivered — not just volume',
    color: '#4F46E5',
  },
  {
    code: 'A',
    name: 'Activity & Output Patterns',
    description:
      'Visible work distribution — always pair with Satisfaction to avoid misreading hidden toil',
    color: '#D97706',
  },
  {
    code: 'C',
    name: 'Communication & Collaboration',
    description: 'Team health, handoffs, and cross-functional coordination',
    color: '#DC2626',
  },
  {
    code: 'E',
    name: 'Efficiency & Flow',
    description: 'How well tooling and pipelines support uninterrupted work',
    color: '#2563EB',
  },
];

const REVERSE_QS = new Set([
  3, 12, 17, 22, 23, 25, 26, 27, 32, 37, 41, 42, 45,
]);
const OPEN_QS = new Set([
  8, 9, 10,
  18, 19, 20,
  28, 29, 30,
  38, 39, 40,
  48, 49, 50,
  51,
]);

/** Compact source table. Format: [n, dim, text, signal, lowLabel, highLabel] */
const RAW: Array<[number, 'S' | 'P' | 'A' | 'C' | 'E', string, string, string, string]> = [
  // S — Satisfaction
  [1, 'S', 'How satisfied are you with your overall developer experience at this organisation?', 'Systemic friction & culture', 'Very dissatisfied', 'Very satisfied'],
  [2, 'S', 'Do you feel proud of the work you ship each sprint?', 'Code quality & autonomy', 'Not at all', 'Very proud'],
  [3, 'S', 'How often does work spill into your personal time due to blockers or pressure?', 'Workload & burnout risk', 'Always (worst)', 'Never (best)'],
  [4, 'S', 'How well does your organisation support your professional growth as a developer?', 'Career & learning friction', 'Very poorly', 'Excellent'],
  [5, 'S', 'How satisfied are you with the quality of your local development environment?', 'Tooling & environment quality', 'Very dissatisfied', 'Very satisfied'],
  [6, 'S', 'How often do you feel a sense of accomplishment at the end of a working day?', 'Flow & meaningful work', 'Rarely', 'Every day'],
  [7, 'S', 'How psychologically safe do you feel raising technical concerns or suggesting improvements?', 'Psychological safety — CRITICAL GATE', 'Very unsafe', 'Very safe'],
  [8, 'S', 'What most reduces your satisfaction or wellbeing during a typical sprint?', 'Open-ended satisfaction blocker', '', ''],
  [9, 'S', 'Where do you feel the team or organisation could better support your growth, autonomy, or motivation?', 'Open-ended growth and motivation blocker', '', ''],
  [10, 'S', 'What repetitive or low-value work most affects your energy or sense of accomplishment?', 'Open-ended toil and morale blocker', '', ''],
  // P — Performance
  [11, 'P', 'How often does your code pass review without requiring significant rework?', 'Code review friction', 'Rarely', 'Almost always'],
  [12, 'P', 'How reliable is your code in production — how often are you paged for issues you introduced?', 'Production stability', 'Very frequently', 'Never'],
  [13, 'P', 'Does your output this sprint reflect your true capability, or were you constrained by external blockers?', 'Capability vs. blocker gap', 'Very constrained', 'Full capability'],
  [14, 'P', 'How well do you understand the business or user impact of the features you build?', 'Requirements & context clarity', 'Not at all', 'Very well'],
  [15, 'P', 'How often do features you ship reach users without post-release hotfixes?', 'Release quality', 'Rarely', 'Almost always'],
  [16, 'P', 'How confident are you in the correctness of your code before submitting a PR?', 'Testing & debugging friction', 'Not confident', 'Very confident'],
  [17, 'P', 'How often does technical debt in the codebase reduce the quality of your current output?', 'Technical debt impact', 'All the time', 'Never'],
  [18, 'P', 'Describe a recent blocker that prevented you from delivering work at the quality you expected.', 'Open-ended performance blocker', '', ''],
  [19, 'P', 'What usually causes rework, quality issues, or late changes after you believe a task is complete?', 'Open-ended rework and quality blocker', '', ''],
  [20, 'P', 'What would help you understand unfamiliar code or business context faster when making a safe change?', 'Open-ended codebase comprehension blocker', '', ''],
  // A — Activity
  [21, 'A', 'What percentage of your working day feels genuinely productive (not waiting, interrupted, or in meetings)?', 'Effective vs. total time ratio', '<20%', '>80%'],
  [22, 'A', 'How many significant context switches do you estimate making per day?', 'Context-switch overload', '10+ per day', '0–2 per day'],
  [23, 'A', 'How many hours per sprint are lost to unplanned interruptions (Slack, ad-hoc requests, unexpected meetings)?', 'Interruption-driven toil', '>10 hrs', '<2 hrs'],
  [24, 'A', "How much of your sprint time is spent on tasks clearly aligned with your team's top priority?", 'Priority alignment & task clarity', 'Very little', 'Most of it'],
  [25, 'A', 'How often do you work on more than 3 tasks simultaneously within a single sprint?', 'WIP overload', 'Every sprint', 'Never'],
  [26, 'A', 'How much time per week do you spend on manual, repetitive tasks that could reasonably be automated?', 'Automation & AI opportunity', '>5 hours', '<30 min'],
  [27, 'A', 'How often do you attend meetings that add no value to your work?', 'Meeting overhead & time waste', 'Daily', 'Never'],
  [28, 'A', 'Which activities consume the most time without clearly moving priority work forward?', 'Open-ended low-value activity blocker', '', ''],
  [29, 'A', 'What interrupts your deep work most often, and when does it usually happen?', 'Open-ended focus and interruption blocker', '', ''],
  [30, 'A', 'Where do you spend the most time waiting, such as reviews, builds, environments, approvals, or decisions?', 'Open-ended queue and wait blocker', '', ''],
  // C — Communication
  [31, 'C', 'When blocked waiting for information or a decision, how long does it typically take to get unblocked?', 'Decision & response latency', 'Days', 'Minutes'],
  [32, 'C', 'How often do unclear requirements or acceptance criteria cause rework after you start coding?', 'Requirements clarity & rework', 'Every sprint', 'Rarely'],
  [33, 'C', 'How collaborative and constructive do code reviews feel on your team?', 'Code review culture & friction', 'Adversarial', 'Very collaborative'],
  [34, 'C', 'How well do teams you depend on communicate changes that affect your work?', 'Cross-team dependency visibility', 'Very poorly', 'Very well'],
  [35, 'C', 'How easy is it to find the right person to answer a technical question about an unfamiliar service?', 'Knowledge ownership discoverability', 'Very difficult', 'Very easy'],
  [36, 'C', 'How fair and timely is the feedback you receive from your manager or tech lead?', 'Feedback loop quality', 'Rarely & unfair', 'Regular & fair'],
  [37, 'C', 'How often do API or service contract changes from other teams surprise you at integration time?', 'API contract surprises', 'Every sprint', 'Very rarely'],
  [38, 'C', 'Describe a recent communication or collaboration breakdown that blocked your productivity.', 'Open-ended coordination blocker', '', ''],
  [39, 'C', 'Where do unclear requirements, ownership gaps, or decision delays most often show up for your team?', 'Open-ended planning and ownership blocker', '', ''],
  [40, 'C', 'What cross-team dependency, API contract, or handoff issue creates the most friction for you?', 'Open-ended dependency and handoff blocker', '', ''],
  // E — Efficiency
  [41, 'E', 'How often are you blocked waiting for a build or test pipeline to complete before you can continue?', 'Build & pipeline wait — HIGH SIGNAL', 'Multiple times daily', 'Never'],
  [42, 'E', 'How much time per week is wasted on flaky tests that fail for reasons unrelated to your change?', 'Flaky test toil', '>3 hours', '<15 min'],
  [43, 'E', 'How clearly do CI/CD failure messages explain what went wrong and how to fix it?', 'Pipeline error observability', 'Completely cryptic', 'Always clear'],
  [44, 'E', 'How quickly can you provision a fresh development or test environment when you need one?', 'Environment provisioning wait', 'Hours or days', 'Under 5 minutes'],
  [45, 'E', 'How much time do you spend per incident on RCA before you can begin remediation?', 'Incident RCA speed — HIGH SIGNAL', 'Hours', 'Minutes'],
  [46, 'E', 'How well does your toolchain support staying in a state of flow — does switching between tools break focus?', 'Toolchain integration & flow', 'Constantly broken', 'Seamlessly integrated'],
  [47, 'E', 'How confident are you in understanding the blast radius of your code changes before merging?', 'Change impact analysis', 'Not at all', 'Very confident'],
  [48, 'E', 'Which tool, pipeline, or environment issue wastes the most time in your normal development workflow?', 'Open-ended tooling efficiency blocker', '', ''],
  [49, 'E', 'What documentation, knowledge, or observability gap makes it harder to diagnose or fix issues quickly?', 'Open-ended knowledge and observability blocker', '', ''],
  [50, 'E', 'If one tooling or process inefficiency could be fixed tomorrow, what should it be and why?', 'Open-ended efficiency blocker', '', ''],
  // Overall — SDLC
  [51, 'E', 'Thinking across the full SDLC - planning, coding, review, testing, release, operations, and support - what is the biggest blocker that slows you or your team down?', 'Overall SDLC blocker', '', ''],
];

export const SPACE_QUESTIONS: QuestionDef[] = RAW.map(
  ([n, dim, text, signal, lo, hi]): QuestionDef => {
    const isOpen = OPEN_QS.has(n);
    return {
      number: n,
      dimensionCode: dim,
      text,
      type: isOpen ? 'OPEN_TEXT' : 'LIKERT',
      isReverseScored: REVERSE_QS.has(n),
      isRequired: true,
      minScale: isOpen ? undefined : 1,
      maxScale: isOpen ? undefined : 5,
      lowLabel: isOpen ? undefined : lo,
      highLabel: isOpen ? undefined : hi,
      blockerSignal: signal,
    };
  },
);

export const REVERSE_QUESTION_NUMBERS = [...REVERSE_QS].sort((a, b) => a - b);
export const OPEN_TEXT_QUESTION_NUMBERS = [...OPEN_QS].sort((a, b) => a - b);
export const PSYCH_SAFETY_QUESTION_NUMBER = 7;
export const OVERALL_SDLC_BLOCKER_QUESTION_NUMBER = 51;
