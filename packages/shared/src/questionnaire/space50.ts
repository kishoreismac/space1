import type { DimensionDef, QuestionDef } from '../types/index.js';

/**
 * Canonical SPACE 50-question questionnaire.
 * Extracted verbatim from SPACE_Survey_Instrument.xlsx and space_survey.html.
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
  3, 8, 12, 17, 19, 22, 23, 25, 26, 27, 30, 32, 37, 41, 42, 45, 48, 49,
]);
const OPEN_QS = new Set([10, 20, 40, 50]);

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
  [8, 'S', 'How often do repetitive, low-value tasks dominate your workday?', 'Toil & automation opportunity', 'Constantly (worst)', 'Never (best)'],
  [9, 'S', 'Would you recommend this organisation as a great place to work as a developer?', 'Developer NPS', 'Definitely not', 'Definitely yes'],
  [10, 'S', 'In your own words: what one thing most negatively impacts your day-to-day satisfaction?', 'Open-ended satisfaction blocker', '', ''],
  // P — Performance
  [11, 'P', 'How often does your code pass review without requiring significant rework?', 'Code review friction', 'Rarely', 'Almost always'],
  [12, 'P', 'How reliable is your code in production — how often are you paged for issues you introduced?', 'Production stability', 'Very frequently', 'Never'],
  [13, 'P', 'Does your output this sprint reflect your true capability, or were you constrained by external blockers?', 'Capability vs. blocker gap', 'Very constrained', 'Full capability'],
  [14, 'P', 'How well do you understand the business or user impact of the features you build?', 'Requirements & context clarity', 'Not at all', 'Very well'],
  [15, 'P', 'How often do features you ship reach users without post-release hotfixes?', 'Release quality', 'Rarely', 'Almost always'],
  [16, 'P', 'How confident are you in the correctness of your code before submitting a PR?', 'Testing & debugging friction', 'Not confident', 'Very confident'],
  [17, 'P', 'How often does technical debt in the codebase reduce the quality of your current output?', 'Technical debt impact', 'All the time', 'Never'],
  [18, 'P', 'How quickly can you understand an unfamiliar part of the codebase to make a safe change?', 'Codebase onboarding — HIGH AI SIGNAL', 'Very slowly (days)', 'Very quickly (mins)'],
  [19, 'P', 'How often do you revisit completed work due to changing or unclear requirements?', 'Requirements churn & rework', 'Constantly', 'Very rarely'],
  [20, 'P', 'Describe a recent time when an external blocker prevented you from delivering quality work.', 'Open-ended performance blocker', '', ''],
  // A — Activity
  [21, 'A', 'What percentage of your working day feels genuinely productive (not waiting, interrupted, or in meetings)?', 'Effective vs. total time ratio', '<20%', '>80%'],
  [22, 'A', 'How many significant context switches do you estimate making per day?', 'Context-switch overload', '10+ per day', '0–2 per day'],
  [23, 'A', 'How many hours per sprint are lost to unplanned interruptions (Slack, ad-hoc requests, unexpected meetings)?', 'Interruption-driven toil', '>10 hrs', '<2 hrs'],
  [24, 'A', "How much of your sprint time is spent on tasks clearly aligned with your team's top priority?", 'Priority alignment & task clarity', 'Very little', 'Most of it'],
  [25, 'A', 'How often do you work on more than 3 tasks simultaneously within a single sprint?', 'WIP overload', 'Every sprint', 'Never'],
  [26, 'A', 'How much time per week do you spend on manual, repetitive tasks that could reasonably be automated?', 'Automation & AI opportunity', '>5 hours', '<30 min'],
  [27, 'A', 'How often do you attend meetings that add no value to your work?', 'Meeting overhead & time waste', 'Daily', 'Never'],
  [28, 'A', 'How often do you get a continuous block of 2+ hours for deep focused coding work?', 'Deep work & flow availability', 'Rarely', 'Every day'],
  [29, 'A', 'How much time in a typical sprint do you spend on debugging vs. writing new code?', 'Debugging-to-coding ratio', 'Mostly debugging', 'Mostly coding'],
  [30, 'A', 'Estimate: how many hours per sprint are lost to waiting (reviews, builds, environments, approvals)?', 'Queue & wait time — HIGH SIGNAL', '>8 hours', '<1 hour'],
  // C — Communication
  [31, 'C', 'When blocked waiting for information or a decision, how long does it typically take to get unblocked?', 'Decision & response latency', 'Days', 'Minutes'],
  [32, 'C', 'How often do unclear requirements or acceptance criteria cause rework after you start coding?', 'Requirements clarity & rework', 'Every sprint', 'Rarely'],
  [33, 'C', 'How collaborative and constructive do code reviews feel on your team?', 'Code review culture & friction', 'Adversarial', 'Very collaborative'],
  [34, 'C', 'How well do teams you depend on communicate changes that affect your work?', 'Cross-team dependency visibility', 'Very poorly', 'Very well'],
  [35, 'C', 'How easy is it to find the right person to answer a technical question about an unfamiliar service?', 'Knowledge ownership discoverability', 'Very difficult', 'Very easy'],
  [36, 'C', 'How fair and timely is the feedback you receive from your manager or tech lead?', 'Feedback loop quality', 'Rarely & unfair', 'Regular & fair'],
  [37, 'C', 'How often do API or service contract changes from other teams surprise you at integration time?', 'API contract surprises', 'Every sprint', 'Very rarely'],
  [38, 'C', 'How effective are your sprint planning sessions at giving you clarity for the week ahead?', 'Planning effectiveness', 'Not effective', 'Very effective'],
  [39, 'C', 'How well does your on-call rotation distribute burden fairly across the team?', 'On-call toil & rotation health', 'Very unfairly', 'Very fairly'],
  [40, 'C', 'Describe the biggest communication or collaboration breakdown that blocked your productivity recently.', 'Open-ended coordination blocker', '', ''],
  // E — Efficiency
  [41, 'E', 'How often are you blocked waiting for a build or test pipeline to complete before you can continue?', 'Build & pipeline wait — HIGH SIGNAL', 'Multiple times daily', 'Never'],
  [42, 'E', 'How much time per week is wasted on flaky tests that fail for reasons unrelated to your change?', 'Flaky test toil', '>3 hours', '<15 min'],
  [43, 'E', 'How clearly do CI/CD failure messages explain what went wrong and how to fix it?', 'Pipeline error observability', 'Completely cryptic', 'Always clear'],
  [44, 'E', 'How quickly can you provision a fresh development or test environment when you need one?', 'Environment provisioning wait', 'Hours or days', 'Under 5 minutes'],
  [45, 'E', 'How much time do you spend per incident on RCA before you can begin remediation?', 'Incident RCA speed — HIGH SIGNAL', 'Hours', 'Minutes'],
  [46, 'E', 'How well does your toolchain support staying in a state of flow — does switching between tools break focus?', 'Toolchain integration & flow', 'Constantly broken', 'Seamlessly integrated'],
  [47, 'E', 'How confident are you in understanding the blast radius of your code changes before merging?', 'Change impact analysis', 'Not at all', 'Very confident'],
  [48, 'E', 'How much time per week do you spend searching for documentation, wikis, or past decisions before finding what you need?', 'Knowledge discoverability', 'Hours per week', 'Minutes per week'],
  [49, 'E', 'How often does local environment config drift or instability block you from running the project?', 'Local environment reliability', 'Frequently', 'Never'],
  [50, 'E', 'If you could wave a magic wand and fix one tooling or process inefficiency tomorrow, what would it be?', 'Open-ended efficiency blocker', '', ''],
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
