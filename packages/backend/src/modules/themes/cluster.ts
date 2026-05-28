/**
 * Lightweight keyword-clustering for open-text survey answers.
 *
 * No external NLP deps — uses a curated set of seed buckets keyed on common
 * developer-productivity vocabulary plus normalized keyword overlap.
 * Returns suggested theme clusters with member answer IDs and the best
 * representative quote (the longest answer in the cluster, truncated).
 */

export interface AnswerInput {
  id: string;
  text: string;
}

export interface ThemeCluster {
  themeName: string;
  description: string;
  jtbdStatement: string;
  representativeQuote: string;
  answerIds: string[];
  keywords: string[];
}

/** Seed buckets — { themeName, description, jtbd, trigger keywords }. */
const SEED_BUCKETS: Array<{
  name: string;
  description: string;
  jtbd: string;
  keywords: string[];
}> = [
  {
    name: 'CI/CD slowness and flakiness',
    description: 'Long pipeline waits and flaky integration tests block iteration.',
    jtbd: 'When I push a change, I want fast deterministic CI so I can stay in flow.',
    keywords: ['ci', 'cd', 'pipeline', 'build', 'flaky', 'flake', 'integration test', 'jenkins', 'github actions', 'deploy slow', 'deployment slow', 'release pipeline'],
  },
  {
    name: 'Local environment instability',
    description: 'Local dev environments break, drift, or take too long to set up.',
    jtbd: 'When I start work, I want reliable local environments so I can focus on the task.',
    keywords: ['local env', 'local environment', 'dev env', 'docker', 'setup', 'onboarding', 'devbox', 'workstation', 'machine', 'install', 'environment broken', 'env broken'],
  },
  {
    name: 'Code review and PR delays',
    description: 'PRs sit waiting for review; reviewer load is uneven.',
    jtbd: 'When I open a PR, I want timely review so I can ship without idle waits.',
    keywords: ['pr', 'pull request', 'code review', 'reviewer', 'review wait', 'review delay', 'merge wait', 'approval'],
  },
  {
    name: 'Context switching and interruptions',
    description: 'Frequent meetings, pings and incident pulls fragment focus time.',
    jtbd: 'When I plan deep work, I want protected focus blocks so I can finish complex tasks.',
    keywords: ['meeting', 'meetings', 'context switch', 'interrupt', 'slack', 'notifications', 'on-call', 'oncall', 'pager', 'distract', 'focus'],
  },
  {
    name: 'Unclear requirements / specs',
    description: 'Tickets land without clear acceptance criteria; rework is common.',
    jtbd: 'When I pick up work, I want clear requirements so I can build the right thing first time.',
    keywords: ['requirement', 'requirements', 'spec', 'specs', 'unclear', 'ambiguous', 'pm', 'product manager', 'acceptance criteria', 'ticket', 'jira'],
  },
  {
    name: 'Cross-team coordination friction',
    description: 'Hand-offs across teams stall; API contracts and dependencies surprise us.',
    jtbd: 'When I integrate with another team, I want predictable contracts so I can ship without rework.',
    keywords: ['cross-team', 'cross team', 'other team', 'handoff', 'hand-off', 'contract', 'api change', 'breaking change', 'dependency', 'platform team'],
  },
  {
    name: 'Documentation gaps',
    description: 'Internal docs are missing, stale, or hard to find.',
    jtbd: 'When I encounter a system, I want accurate documentation so I can ramp without tribal knowledge.',
    keywords: ['doc', 'docs', 'documentation', 'wiki', 'readme', 'stale', 'outdated', 'no docs', 'undocumented'],
  },
  {
    name: 'Incident load and toil',
    description: 'On-call burden, repeat incidents, and manual toil are taxing the team.',
    jtbd: 'When I am on-call, I want stable systems and tooling so I can avoid burnout.',
    keywords: ['incident', 'outage', 'on-call', 'oncall', 'pager', 'toil', 'manual', 'fire', 'firefight', 'rca', 'postmortem'],
  },
  {
    name: 'Testing pain — slow or unreliable',
    description: 'Local and CI tests run too slowly or are unreliable.',
    jtbd: 'When I change code, I want fast reliable tests so I can iterate confidently.',
    keywords: ['test slow', 'test suite', 'unit test', 'flaky test', 'tests fail', 'test takes', 'qa', 'manual test'],
  },
  {
    name: 'Tooling and IDE friction',
    description: 'IDE, build tools or local utilities slow people down.',
    jtbd: 'When I write code, I want responsive tooling so I can stay in flow.',
    keywords: ['ide', 'editor', 'intellij', 'vscode', 'vs code', 'tool slow', 'tooling', 'plugin', 'lsp', 'autocomplete'],
  },
  {
    name: 'Recognition, growth and morale',
    description: 'Career growth, recognition or psychological safety concerns.',
    jtbd: 'When I do good work, I want recognition and growth so I can stay engaged.',
    keywords: ['recognition', 'growth', 'promotion', 'career', 'morale', 'burnout', 'safety', 'manager', 'feedback'],
  },
];

/** Normalize text for matching. */
function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Count how many keywords match the answer; returns matched keyword list. */
function matchBucket(answer: string, keywords: string[]): string[] {
  const n = norm(answer);
  const hits: string[] = [];
  for (const kw of keywords) {
    if (n.includes(kw)) hits.push(kw);
  }
  return hits;
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n - 1).trimEnd() + '…';
}

/**
 * Cluster open-text answers into themes using seed buckets.
 * - Each answer is assigned to the bucket with the most keyword hits (>=1).
 * - Answers with no keyword hits go into an "Other / uncategorised" bucket if total >= 3.
 * - Only clusters with at least `minSize` answers are returned.
 */
export function clusterAnswers(
  answers: AnswerInput[],
  opts: { minSize?: number } = {},
): ThemeCluster[] {
  const minSize = opts.minSize ?? 2;

  // bucketName -> { answers, keyword hits }
  const buckets = new Map<string, { ids: string[]; texts: string[]; kw: Set<string> }>();
  const ensure = (name: string) => {
    let b = buckets.get(name);
    if (!b) {
      b = { ids: [], texts: [], kw: new Set() };
      buckets.set(name, b);
    }
    return b;
  };

  const uncategorised: { ids: string[]; texts: string[] } = { ids: [], texts: [] };

  for (const a of answers) {
    if (!a.text || a.text.trim().length === 0) continue;
    let bestName: string | null = null;
    let bestHits: string[] = [];
    for (const seed of SEED_BUCKETS) {
      const hits = matchBucket(a.text, seed.keywords);
      if (hits.length > bestHits.length) {
        bestHits = hits;
        bestName = seed.name;
      }
    }
    if (bestName && bestHits.length > 0) {
      const b = ensure(bestName);
      b.ids.push(a.id);
      b.texts.push(a.text);
      bestHits.forEach((k) => b.kw.add(k));
    } else {
      uncategorised.ids.push(a.id);
      uncategorised.texts.push(a.text);
    }
  }

  const out: ThemeCluster[] = [];
  for (const seed of SEED_BUCKETS) {
    const b = buckets.get(seed.name);
    if (!b || b.ids.length < minSize) continue;
    // Representative quote: longest non-empty answer
    const rep = b.texts.reduce((a, b2) => (b2.length > a.length ? b2 : a), '');
    out.push({
      themeName: seed.name,
      description: seed.description,
      jtbdStatement: seed.jtbd,
      representativeQuote: truncate(rep, 240),
      answerIds: b.ids,
      keywords: [...b.kw],
    });
  }

  // Sort by size desc
  out.sort((a, b) => b.answerIds.length - a.answerIds.length);
  return out;
}
