import type { CrossPatternAlert, DimensionCode, DimensionScore } from '../types/index.js';

type Scores = Record<DimensionCode, number | null>;
type Rule = Omit<CrossPatternAlert, 'code' | 'message'> & {
  patternId: string;
  crossPattern: string;
  trigger: string;
  matches: (scores: Scores) => boolean;
};

const low = (v: number | null): boolean => v !== null && v <= 3.0;
const high = (v: number | null): boolean => v !== null && v >= 3.5;
const moderate = (v: number | null): boolean => v !== null && v > 3.0 && v < 3.5;
const moderateOrHigh = (v: number | null): boolean => moderate(v) || high(v);
const weakCount = (scores: Scores): number =>
  (Object.values(scores) as Array<number | null>).filter(low).length;

const rule = (
  patternId: string,
  crossPattern: string,
  trigger: string,
  scoreSignal: string,
  diagnosis: string,
  whatItMeans: string,
  likelyRootCause: string,
  validationEvidence: string,
  leadershipAction: string,
  severity: CrossPatternAlert['severity'],
  matches: (scores: Scores) => boolean,
): Rule => ({
  patternId,
  crossPattern,
  trigger,
  scoreSignal,
  diagnosis,
  whatItMeans,
  likelyRootCause,
  validationEvidence,
  leadershipAction,
  severity,
  matches,
});

const CROSS_PATTERN_RULES: Rule[] = [
  rule('S-P-01', 'Low Satisfaction + Low Performance', 'S < 3.0 and P < 3.0', 'Developers are dissatisfied and delivery outcomes are weak', 'Developer experience and delivery quality are both under pressure', 'The engineering system is affecting morale and output quality', 'Burnout, unclear goals, excessive rework, poor tooling, unrealistic expectations', 'Defect rate, rework rate, sprint misses, open-text feedback, attrition signals', 'Treat as executive-level productivity risk and investigate immediately', 'CRITICAL', ({ S, P }) => low(S) && low(P)),
  rule('S-A-01', 'Low Satisfaction + High Activity', 'S < 3.0 and A > 3.5', 'Developers are busy but unhappy', 'High activity may be masking hidden toil or burnout', 'Teams are working hard, but not in a healthy or sustainable way', 'Overload, interruptions, context switching, after-hours work, repetitive tasks', 'Calendar load, after-hours commits, meeting hours, sprint spillover, sentiment comments', 'Reduce workload friction and protect focus time', 'WARNING', ({ S, A }) => low(S) && high(A)),
  rule('S-A-02', 'Low Satisfaction + Low Activity', 'S < 3.0 and A < 3.0', 'Developers are unhappy and not progressing effectively', 'Low morale plus low work flow', 'Developers may be blocked, disengaged, or waiting for clarity', 'Blocked tickets, unclear backlog, dependency delays, weak management support', 'Blocked work age, backlog readiness, developer interviews, waiting time', 'Identify blockers and restore meaningful work flow', 'WARNING', ({ S, A }) => low(S) && low(A)),
  rule('S-C-01', 'Low Satisfaction + Low Communication', 'S < 3.0 and C <= 3.0', 'Developers are unhappy and collaboration is weak', 'Poor communication is hurting morale', 'Developers may feel unsupported, unheard, or unclear about priorities', 'Poor feedback loops, unclear ownership, low psychological safety, weak leadership communication', 'Open-text responses, manager feedback data, dependency delays, team sentiment', 'Improve communication rituals, ownership clarity, and feedback loops', 'CRITICAL', ({ S, C }) => low(S) && low(C)),
  rule('S-E-01', 'Low Satisfaction + Low Efficiency', 'S < 3.0 and E < 3.0', 'Developers are frustrated and the system is inefficient', 'Tooling and workflow friction are damaging developer experience', 'Developers are losing energy to avoidable friction', 'Slow CI/CD, flaky tests, poor documentation, local setup issues, manual toil', 'CI/CD logs, flaky test rate, build wait time, environment tickets, docs search time', 'Prioritize developer experience and platform improvements', 'CRITICAL', ({ S, E }) => low(S) && low(E)),

  rule('P-A-01', 'Low Performance + High Activity', 'P < 3.0 and A > 3.5', 'High work volume but weak outcomes', 'Lots of motion, weak productivity', 'Teams are busy, but effort is not converting into quality outcomes', 'Rework, poor prioritization, low-value tasks, unclear business outcomes', 'Ticket volume vs value delivered, defect rate, reopened tickets, sprint carryover', 'Shift focus from activity volume to business and quality outcomes', 'CRITICAL', ({ P, A }) => low(P) && high(A)),
  rule('P-A-02', 'Low Performance + Low Activity', 'P < 3.0 and A < 3.0', 'Low activity and weak delivery outcomes', 'Work is not flowing and outcomes are poor', 'Developers may not have enough clear, ready, or unblocked work', 'Waiting, approval delays, dependency queues, unclear priorities', 'Blocked ticket data, approval cycle time, backlog readiness, dependency aging', 'Remove waiting states and improve planning discipline', 'CRITICAL', ({ P, A }) => low(P) && low(A)),
  rule('P-C-01', 'Low Performance + Low Communication', 'P < 3.0 and C < 3.0', 'Delivery quality is weak and collaboration is poor', 'Communication breakdowns are damaging performance', 'Requirements, handoffs, or reviews are causing avoidable rework', 'Ambiguous requirements, poor ownership, delayed reviews, dependency friction', 'Requirement churn, PR review delay, rework rate, reopened stories', 'Improve requirements quality, ownership, and code review flow', 'CRITICAL', ({ P, C }) => low(P) && low(C)),
  rule('P-E-01', 'Low Performance + Low Efficiency', 'P < 3.0 and E < 3.0', 'Delivery outcomes are weak and systems are inefficient', 'Engineering systems are hurting delivery quality', 'Toolchain and process friction are preventing quality delivery', 'Technical debt, unstable pipelines, poor test reliability, deployment friction', 'DORA metrics, build failures, escaped defects, hotfixes, deployment delays', 'Improve CI/CD, test reliability, automation, and engineering platform health', 'CRITICAL', ({ P, E }) => low(P) && low(E)),
  rule('P-S-01', 'Healthy Performance + Low Satisfaction', 'P > 3.5 and S < 3.0', 'Delivery looks good but morale is weak', 'Performance may be sustained by heroics', 'Teams are delivering, but the model may not be sustainable', 'Overtime, senior engineer dependency, pressure, hidden rework', 'Attrition risk, workload distribution, overtime, on-call burden, sentiment comments', 'Protect sustainability before performance drops', 'WARNING', ({ P, S }) => high(P) && low(S)),
  rule('P-E-02', 'Healthy Performance + Low Efficiency', 'P > 3.5 and E < 3.0', 'Teams deliver despite inefficient systems', 'Hidden workarounds are preserving output', 'Productivity is fragile and dependent on extra effort', 'Manual workarounds, expert dependency, poor automation, unstable tooling', 'Manual effort logs, pipeline delays, repeated fixes, overtime signals', 'Fix system friction before it becomes a performance problem', 'WARNING', ({ P, E }) => high(P) && low(E)),

  rule('A-C-01', 'High Activity + Low Communication', 'A > 3.5 and C < 3.0', 'Teams are busy but poorly coordinated', 'Activity is being consumed by coordination overhead', 'Developers may be spending too much effort clarifying, aligning, or correcting', 'Unclear priorities, dependency confusion, excessive meetings, repeated clarification', 'Meeting load, dependency delay, ticket reopen rate, repeated Slack/Teams questions', 'Reduce coordination waste and improve decision clarity', 'WARNING', ({ A, C }) => high(A) && low(C)),
  rule('A-E-01', 'High Activity + Low Efficiency', 'A > 3.5 and E < 3.0', 'Developers are active but effort is leaking', 'High motion, low leverage', 'Developers are doing work, but systems make the work harder than necessary', 'Manual toil, repeated failures, waiting time, duplicate effort, poor automation', 'Build wait time, pipeline retry rate, manual task hours, duplicate tickets', 'Identify automation opportunities and remove toil', 'WARNING', ({ A, E }) => high(A) && low(E)),
  rule('A-P-01', 'High Activity + Low Performance', 'A > 3.5 and P < 3.0', 'High effort but weak delivery outcomes', 'Busyness is not translating into value', 'Teams may be doing too much low-value or rework-heavy activity', 'Poor prioritization, unclear outcomes, quality issues, fragmented work', 'Sprint output quality, defect leakage, story churn, business value tracking', 'Reconnect activity to measurable outcomes', 'CRITICAL', ({ A, P }) => high(A) && low(P)),
  rule('A-S-01', 'High Activity + Low Satisfaction', 'A > 3.5 and S < 3.0', 'High workload and low morale', 'Burnout or hidden toil risk', 'Developers may be overextended even if work appears to be moving', 'Context switching, excessive meetings, after-hours work, delivery pressure', 'Calendar data, after-hours commits, sprint spillover, open-text comments', 'Reduce overload and protect deep work', 'WARNING', ({ A, S }) => high(A) && low(S)),
  rule('A-C-02', 'Low Activity + Low Communication', 'A < 3.0 and C < 3.0', 'Work is slow and communication is weak', 'Developers may be waiting for clarity or decisions', 'Poor communication is preventing work from moving', 'Slow approvals, unclear ownership, dependency delays, poor escalation', 'Blocked ticket age, dependency aging, decision wait time, unresolved questions', 'Create ownership maps and faster escalation paths', 'WARNING', ({ A, C }) => low(A) && low(C)),
  rule('A-E-02', 'Low Activity + Low Efficiency', 'A < 3.0 and E < 3.0', 'Work is not flowing and systems are inefficient', 'Developers are blocked by poor workflow or tooling', 'Inefficient systems may be preventing meaningful activity', 'Environment failures, slow pipelines, waiting, access issues, tooling friction', 'Environment tickets, build delays, access request delays, wait-state analysis', 'Diagnose wait states and fix toolchain blockers', 'WARNING', ({ A, E }) => low(A) && low(E)),

  rule('C-E-01', 'Low Communication + Low Efficiency', 'C < 3.0 and E < 3.0', 'Developers cannot find answers or get unblocked efficiently', 'Knowledge and workflow systems are fragmented', 'Developers lose time searching, asking, waiting, or escalating', 'Tribal knowledge, poor documentation, unclear owners, fragmented tools', 'Documentation search time, onboarding time, repeated questions, ownership gaps', 'Build knowledge systems, ownership maps, and RAG-style engineering assistant', 'CRITICAL', ({ C, E }) => low(C) && low(E)),
  rule('C-P-01', 'Low Communication + Low Performance', 'C < 3.0 and P < 3.0', 'Poor collaboration is weakening delivery', 'Communication problems are creating performance problems', 'Delivery quality is being hurt by unclear inputs and slow feedback', 'Requirement ambiguity, poor handoffs, delayed PR reviews, dependency friction', 'Requirement churn, review delay, rework rate, blocked dependencies', 'Fix planning, acceptance criteria, handoffs, and review discipline', 'CRITICAL', ({ C, P }) => low(C) && low(P)),
  rule('C-S-01', 'Low Communication + Low Satisfaction', 'C < 3.0 and S < 3.0', 'Poor communication is hurting morale', 'Poor communication is hurting morale', 'Developers may feel unclear, unsupported, or unheard', 'Weak feedback, unclear priorities, low trust, poor manager communication', 'Open-text themes, team sentiment, manager feedback, psychological safety indicators', 'Strengthen communication norms and psychological safety', 'CRITICAL', ({ C, S }) => low(C) && low(S)),
  rule('C-A-01', 'Low Communication + High Activity', 'C < 3.0 and A > 3.5', 'Teams are active but correcting misunderstandings', 'Rework and repeated alignment are inflating activity', 'More work is happening because clarity is missing', 'Duplicate work, repeated clarification, meeting overload, unclear ownership', 'Meeting hours, reopened tickets, clarification threads, dependency escalations', 'Reduce ambiguity and improve operating rhythm', 'WARNING', ({ C, A }) => low(C) && high(A)),
  rule('C-P-02', 'Healthy Communication + Low Performance', 'C > 3.5 and P < 3.0', 'Collaboration seems healthy but outcomes are weak', 'The issue may be technical or process-related, not communication-related', 'Teams communicate well, but engineering systems or quality practices may be weak', 'Technical debt, skill gaps, poor automation, weak testing, tooling limitations', 'Defects, hotfixes, test coverage, build failures, technical debt backlog', 'Investigate technical delivery systems and quality practices', 'WARNING', ({ C, P }) => high(C) && low(P)),

  rule('E-S-01', 'Low Efficiency + Low Satisfaction', 'E < 3.0 and S < 3.0', 'Inefficient systems are frustrating developers', 'Toolchain friction is damaging developer experience', 'Developers are spending too much energy fighting the system', 'Slow pipelines, flaky tests, poor local setup, poor docs, repetitive work', 'Build time, flaky test data, environment tickets, docs search time, survey comments', 'Prioritize platform, tooling, and developer experience improvements', 'CRITICAL', ({ E, S }) => low(E) && low(S)),
  rule('E-P-01', 'Low Efficiency + Low Performance', 'E < 3.0 and P < 3.0', 'Inefficiency is damaging delivery outcomes', 'Delivery quality is being constrained by weak systems', 'Toolchain, testing, deployment, or automation gaps are hurting output', 'Unstable CI/CD, manual deployment, test unreliability, release friction', 'DORA metrics, build failures, hotfixes, deployment failures, escaped defects', 'Improve engineering platform reliability and automation', 'CRITICAL', ({ E, P }) => low(E) && low(P)),
  rule('E-A-01', 'Low Efficiency + High Activity', 'E < 3.0 and A > 3.5', 'Developers are working hard but wasting effort', 'Automation opportunity is likely high', 'High effort is being consumed by low-value or repetitive work', 'Manual tasks, repeated errors, waiting, duplicate work, poor integration', 'Manual effort hours, retry rate, queue time, duplicate tickets', 'Target AI automation and workflow redesign', 'WARNING', ({ E, A }) => low(E) && high(A)),
  rule('E-C-01', 'Low Efficiency + Low Communication', 'E < 3.0 and C < 3.0', 'Knowledge and workflow systems are fragmented', 'Knowledge and workflow systems are fragmented', 'Developers cannot move efficiently because information is hard to access', 'Poor docs, unclear ownership, missing decision history, tribal knowledge', 'Search logs, onboarding feedback, repeated questions, unresolved blockers', 'Build engineering knowledge base, ownership directory, and AI knowledge assistant', 'CRITICAL', ({ E, C }) => low(E) && low(C)),
  rule('E-P-02', 'Low Efficiency + Healthy Performance', 'E < 3.0 and P > 3.5', 'Teams deliver despite inefficient systems', 'Heroics and workarounds are hiding system weakness', 'Performance is currently protected by extra human effort', 'Overtime, manual fixes, senior engineer dependency, repeated workarounds', 'Workload data, manual task logs, key-person dependency, after-hours activity', 'Remove friction before performance becomes unsustainable', 'WARNING', ({ E, P }) => low(E) && high(P)),

  rule('M-01', 'Hidden Toil Pattern', 'A > 3.5, E < 3.0, S < 3.0', 'High activity, low efficiency, low satisfaction', 'Developers are busy, inefficient, and frustrated', 'Work is happening, but it requires too much human effort', 'Manual toil, poor automation, pipeline friction, repetitive work', 'Manual task hours, pipeline delays, repeated errors, open-text frustration', 'Launch toil-reduction and automation initiative', 'CRITICAL', ({ A, E, S }) => high(A) && low(E) && low(S)),
  rule('M-02', 'Heroics Pattern', 'P > 3.5, S < 3.0, E < 3.0', 'Good delivery, low satisfaction, low efficiency', 'Delivery looks healthy but is fragile', 'Output is being maintained through extra effort and workarounds', 'Senior dependency, overtime, poor tooling, manual fixes', 'Overtime, workload imbalance, manual workarounds, attrition signals', 'Protect sustainability and remove friction before delivery drops', 'CRITICAL', ({ P, S, E }) => high(P) && low(S) && low(E)),
  rule('M-03', 'Rework Pattern', 'P < 3.0, C < 3.0, A > 3.5', 'Low performance, low communication, high activity', 'Teams are busy because they are correcting avoidable mistakes', 'Activity is inflated by rework, not value creation', 'Unclear requirements, weak handoffs, poor review loops', 'Reopened tickets, PR rework, requirement churn, defect leakage', 'Improve requirements quality, handoffs, and review discipline', 'CRITICAL', ({ P, C, A }) => low(P) && low(C) && high(A)),
  rule('M-04', 'Toolchain Drag Pattern', 'E < 3.0, P < 3.0, S < 3.0', 'Low efficiency, low performance, low satisfaction', 'Tools and delivery systems are hurting morale and outcomes', 'Engineering infrastructure is blocking productivity', 'Slow CI/CD, flaky tests, unstable environments, poor automation', 'CI/CD failures, build wait time, defect data, environment issues', 'Prioritize engineering platform modernization', 'CRITICAL', ({ E, P, S }) => low(E) && low(P) && low(S)),
  rule('M-05', 'Knowledge Fragmentation Pattern', 'C < 3.0, E < 3.0, A < 3.5', 'Low communication, low efficiency, moderate/low activity', 'Developers cannot find answers or move smoothly', 'Knowledge access is slowing delivery flow', 'Tribal knowledge, missing docs, unclear ownership, poor onboarding', 'Search time, onboarding duration, repeated questions, dependency escalations', 'Build RAG knowledge assistant, ownership map, and decision repository', 'CRITICAL', ({ C, E, A }) => low(C) && low(E) && A !== null && A < 3.5),
  rule('M-06', 'Burnout Risk Pattern', 'S <= 3.0, A >= 3.5, P > 3.0', 'Low satisfaction, high activity, moderate/high performance', 'Teams are delivering under pressure', 'Delivery may be sustainable only in the short term', 'Overload, meetings, after-hours work, high expectations', 'Calendar load, overtime, sprint spillover, sentiment comments', 'Reduce load, improve focus time, and monitor retention risk', 'CRITICAL', ({ S, A, P }) => low(S) && high(A) && moderateOrHigh(P)),
  rule('M-07', 'Coordination Overhead Pattern', 'C <= 3.0, A >= 3.5, P > 3.0', 'Low communication, high activity, moderate/high performance', 'Teams are active but coordination is expensive', 'Productivity is being consumed by alignment effort', 'Excess meetings, dependency friction, unclear decision rights', 'Meeting hours, dependency delays, repeated clarification, blocked tickets', 'Redesign operating model and reduce coordination waste', 'WARNING', ({ C, A, P }) => low(C) && high(A) && moderateOrHigh(P)),
  rule('M-08', 'Low Flow Pattern', 'A < 3.0, E < 3.0, C < 3.0', 'Low activity, low efficiency, low communication', 'Developers are stuck or waiting', 'Work is not flowing through the system', 'Waiting states, slow decisions, poor tooling, blocked dependencies', 'Blocked ticket age, approval delays, pipeline wait time, unresolved questions', 'Diagnose flow blockers and create escalation paths', 'CRITICAL', ({ A, E, C }) => low(A) && low(E) && low(C)),
  rule('M-09', 'Quality Risk Pattern', 'P < 3.0, E < 3.0, C < 3.0', 'Low performance, low efficiency, low communication', 'Delivery quality is structurally at risk', 'Poor systems and poor collaboration are increasing defect and delay risk', 'Weak testing, unclear requirements, poor deployment process, communication gaps', 'Escaped defects, hotfixes, deployment failures, rework rate', 'Treat as high-priority quality and delivery risk', 'CRITICAL', ({ P, E, C }) => low(P) && low(E) && low(C)),
  rule('M-10', 'False Productivity Pattern', 'A > 3.5 and any of S/P/C/E < 3.0', 'High activity with at least one weak dimension', 'Activity may be hiding productivity problems', 'Busyness is being mistaken for productivity', 'Activity-based management, rework, manual toil, lack of outcome metrics', 'Ticket volume vs outcome value, rework, developer comments, cycle time', 'Stop using activity alone as productivity evidence', 'WARNING', ({ A, S, P, C, E }) => high(A) && [S, P, C, E].some(low)),
  rule('M-11', 'Systemic Friction Pattern', 'Any 3 dimensions < 3.0', 'Three weak SPACE dimensions', 'Multiple productivity signals are unhealthy', 'This is not a local team issue; it is system-level friction', 'Combined process, tooling, communication, and morale issues', 'Survey scorecard, interviews, operational metrics, journey mapping', 'Launch leadership-level productivity improvement program', 'CRITICAL', (scores) => weakCount(scores) === 3),
  rule('M-12', 'Critical Operating Risk Pattern', 'Any 4 or 5 dimensions < 3.0', 'Four or more weak SPACE dimensions', 'Broad engineering productivity breakdown', 'The engineering system requires immediate attention', 'Severe tooling, communication, morale, flow, and delivery problems', 'Full scorecard, DORA, PR data, incident data, attrition data', 'Create immediate executive action plan', 'CRITICAL', (scores) => weakCount(scores) >= 4),
  rule('M-13', 'Healthy System Pattern', 'All 5 dimensions > 3.5', 'All dimensions healthy', 'Strong developer productivity environment', 'The system supports sustainable delivery', 'Good tooling, clear communication, healthy morale, strong flow', 'Stable delivery metrics, positive feedback, low rework, healthy DORA', 'Maintain and scale best practices', 'INFO', ({ S, P, A, C, E }) => [S, P, A, C, E].every(high)),
  rule('M-14', 'Uneven Productivity Pattern', '1 or 2 dimensions < 3.0, others > 3.5', 'One or two weak dimensions inside an otherwise healthy system', 'Specific bottlenecks exist', 'The organization needs targeted intervention, not full transformation', 'Localized tooling, communication, or workload issues', 'Dimension-level scores, hotspot questions, team-level segmentation', 'Prioritize focused improvement experiments', 'WARNING', (scores) => {
    const values = Object.values(scores) as Array<number | null>;
    const weak = values.filter(low).length;
    return (weak === 1 || weak === 2) && values.every((v) => low(v) || high(v));
  }),
  rule('M-15', 'Silent Risk Pattern', 'S < 3.0, P >= 3.5, A >= 3.5', 'Low satisfaction with healthy performance and activity', 'Developers are producing but emotionally disengaged', 'Attrition or burnout risk may appear later', 'Hidden pressure, lack of recognition, repeated toil, poor growth support', 'Sentiment comments, attrition indicators, workload data, manager feedback', 'Act before morale issues become retention or performance problems', 'WARNING', ({ S, P, A }) => low(S) && P !== null && P >= 3.5 && A !== null && A >= 3.5),
];

const DUPLICATE_PATTERN_GROUPS: Record<string, string> = {
  'S-A-01': 'S-low_A-high',
  'A-S-01': 'S-low_A-high',
  'S-C-01': 'S-low_C-low',
  'C-S-01': 'S-low_C-low',
  'S-E-01': 'S-low_E-low',
  'E-S-01': 'S-low_E-low',
  'P-A-01': 'P-low_A-high',
  'A-P-01': 'P-low_A-high',
  'P-C-01': 'P-low_C-low',
  'C-P-01': 'P-low_C-low',
  'P-E-01': 'P-low_E-low',
  'E-P-01': 'P-low_E-low',
  'P-E-02': 'P-high_E-low',
  'E-P-02': 'P-high_E-low',
  'A-C-01': 'A-high_C-low',
  'C-A-01': 'A-high_C-low',
  'A-E-01': 'A-high_E-low',
  'E-A-01': 'A-high_E-low',
  'C-E-01': 'C-low_E-low',
  'E-C-01': 'C-low_E-low',
};

const toAlert = (r: Rule): CrossPatternAlert => ({
  code: r.patternId,
  patternId: r.patternId,
  crossPattern: r.crossPattern,
  trigger: r.trigger.replaceAll('< 3.0', '<= 3.0').replaceAll('> 3.5', '>= 3.5'),
  scoreSignal: r.scoreSignal,
  diagnosis: r.diagnosis,
  whatItMeans: r.whatItMeans,
  likelyRootCause: r.likelyRootCause,
  validationEvidence: r.validationEvidence,
  leadershipAction: r.leadershipAction,
  severity: r.severity,
  message: `${r.crossPattern}: ${r.diagnosis}. ${r.leadershipAction}.`,
});

export interface CrossPatternThemeRule extends CrossPatternAlert {
  dimensions: DimensionCode[];
  matches: (scores: Scores) => boolean;
}

const dimensionsFromRule = (r: Rule): DimensionCode[] => {
  const found = new Set<DimensionCode>();
  const haystack = `${r.patternId} ${r.trigger} ${r.crossPattern}`;
  for (const code of ['S', 'P', 'A', 'C', 'E'] as DimensionCode[]) {
    if (new RegExp(`\\b${code}\\b`).test(haystack)) found.add(code);
  }
  return [...found];
};

const toThemeRule = (r: Rule): CrossPatternThemeRule => ({
  ...toAlert(r),
  dimensions: dimensionsFromRule(r),
  matches: r.matches,
});

export function allCrossPatternThemeRules(): CrossPatternThemeRule[] {
  const seenGroups = new Set<string>();
  return CROSS_PATTERN_RULES
    .filter((r) => {
      const group = DUPLICATE_PATTERN_GROUPS[r.patternId];
      if (!group) return true;
      if (seenGroups.has(group)) return false;
      seenGroups.add(group);
      return true;
    })
    .map(toThemeRule);
}

export function matchedCrossPatternThemeRules(scores: Scores): CrossPatternThemeRule[] {
  const seenGroups = new Set<string>();
  return CROSS_PATTERN_RULES
    .filter((r) => {
      if (!r.matches(scores)) return false;
      const group = DUPLICATE_PATTERN_GROUPS[r.patternId];
      if (!group) return true;
      if (seenGroups.has(group)) return false;
      seenGroups.add(group);
      return true;
    })
    .map(toThemeRule);
}

/**
 * Cross-pattern alerts for Phase 1 triage.
 * The psych-safety alert is fired when Q7 average drops below 2.5;
 * callers must pass that value separately because it is a sub-question, not a dimension.
 */
export function crossPatternAlerts(
  scoresByCode: Record<DimensionCode, DimensionScore>,
  psychSafetyAvg: number | null = null,
): CrossPatternAlert[] {
  const scores: Scores = {
    S: scoresByCode.S.averageScore,
    P: scoresByCode.P.averageScore,
    A: scoresByCode.A.averageScore,
    C: scoresByCode.C.averageScore,
    E: scoresByCode.E.averageScore,
  };
  const seenGroups = new Set<string>();
  const out = CROSS_PATTERN_RULES
    .filter((r) => {
      if (!r.matches(scores)) return false;
      const group = DUPLICATE_PATTERN_GROUPS[r.patternId];
      if (!group) return true;
      if (seenGroups.has(group)) return false;
      seenGroups.add(group);
      return true;
    })
    .map(toAlert);

  if (psychSafetyAvg !== null && psychSafetyAvg < 2.5) {
    out.push({
      code: 'PSYCH_SAFETY_GATE',
      patternId: 'PSYCH-SAFETY-GATE',
      crossPattern: 'Psychological Safety Gate',
      trigger: 'Q7 average < 2.5',
      scoreSignal: 'Psychological safety below threshold',
      diagnosis: 'All other survey scores may be understated',
      whatItMeans: 'Respondents may not feel safe giving direct feedback in group settings.',
      likelyRootCause: 'Low trust, fear of consequences, weak anonymity guarantees, poor manager communication',
      validationEvidence: 'Q7 average, open-text tone, interview feedback, manager feedback, participation patterns',
      leadershipAction: 'Replace workshops with anonymous 1:1 interviews before continuing.',
      severity: 'CRITICAL',
      message:
        'Psychological Safety Gate: all other scores may be understated. Replace journey workshops with anonymous 1:1 interviews before continuing.',
    });
  }
  return out;
}
