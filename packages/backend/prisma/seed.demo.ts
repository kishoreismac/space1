/**
 * DEV-ONLY demo seed (Land O'Lakes worked example).
 * Run AFTER `npm run seed`. Safe to re-run — wipes its own prior demo artefacts.
 *
 * Produces the end-to-end SPACE handbook example:
 *   • Company   : Land O'Lakes Engineering (demo)
 *   • Team      : Precision Ag Platform
 *   • Campaign  : SPACE Q2 2025 (CLOSED), baselined to a prior cycle
 *   • 38 synthesised submissions whose dimension averages match
 *       S=2.4  P=3.1  A=3.8  C=2.6  E=2.2  (prev S=2.7 P=3.1 A=4.3 C=3.0 E=2.8)
 *   • ScoreSummary snapshots
 *   • 4 open-text themes (3 promoted, 1 investigate)
 *   • 3 blockers with AI-feasibility tagging
 *   • 1 completed journey-mapping session
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const COMPANY_ID = 'demo-landolakes';
const TEAM_ID = 'demo-team-precision';
const CAMPAIGN_ID = 'demo-camp-q2-2025';

const TARGET = { S: 2.4, P: 3.1, A: 3.8, C: 2.6, E: 2.2 } as const;
const PRIOR = { S: 2.7, P: 3.1, A: 4.3, C: 3.0, E: 2.8 } as const;
const RESPONDENTS = 38;

type DimCode = keyof typeof TARGET;

async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to run demo seed in production');
  }

  // 1) Canonical SPACE-50 template must exist (run `npm run seed` first)
  const template = await prisma.questionnaire.findFirst({
    where: { companyId: null, title: { contains: 'SPACE 50' } },
    include: {
      dimensions: true,
      questions: { include: { dimension: true } },
    },
  });
  if (!template) {
    throw new Error('SPACE-50 template missing. Run `npm run seed` first.');
  }

  // 2) Company + team (idempotent)
  const company = await prisma.company.upsert({
    where: { id: COMPANY_ID },
    update: {},
    create: {
      id: COMPANY_ID,
      name: "Land O'Lakes Engineering (demo)",
      industry: 'Agriculture / Food',
      contactEmail: 'demo@landolakes.example',
    },
  });
  const team = await prisma.team.upsert({
    where: { id: TEAM_ID },
    update: {},
    create: {
      id: TEAM_ID,
      companyId: company.id,
      name: 'Precision Ag Platform',
      managerName: 'D. Manager',
    },
  });

  // 3) Wipe prior demo campaign artefacts
  await prisma.answer.deleteMany({
    where: { submission: { campaignId: CAMPAIGN_ID } },
  });
  await prisma.submission.deleteMany({ where: { campaignId: CAMPAIGN_ID } });
  await prisma.scoreSummary.deleteMany({ where: { campaignId: CAMPAIGN_ID } });
  await prisma.openTextTheme.deleteMany({ where: { campaignId: CAMPAIGN_ID } });
  await prisma.blocker.deleteMany({ where: { campaignId: CAMPAIGN_ID } });
  await prisma.journeyMapSession.deleteMany({ where: { campaignId: CAMPAIGN_ID } });
  await prisma.surveyCampaign
    .delete({ where: { id: CAMPAIGN_ID } })
    .catch(() => undefined);

  // 4) Campaign (CLOSED) with prior baseline
  const campaign = await prisma.surveyCampaign.create({
    data: {
      id: CAMPAIGN_ID,
      companyId: company.id,
      questionnaireId: template.id,
      title: 'SPACE Q2 2025',
      cycle: 'Q2-2025',
      startDate: new Date('2025-04-15'),
      closeDate: new Date('2025-04-30'),
      targetRespondents: 50,
      status: 'CLOSED',
      notes: 'Worked example used throughout the SPACE handbook documentation.',
      previousS: PRIOR.S,
      previousP: PRIOR.P,
      previousA: PRIOR.A,
      previousC: PRIOR.C,
      previousE: PRIOR.E,
    },
  });

  // 5) Synthesise 38 respondents
  const dimOf = new Map<number, DimCode>(
    template.questions.map((q) => [q.questionNumber, q.dimension.code as DimCode]),
  );
  const byNum = new Map(template.questions.map((q) => [q.questionNumber, q]));

  function sampleAround(target: number): number {
    const noise = (Math.random() - 0.5) * 1.6;
    return Math.max(1, Math.min(5, Math.round(target + noise)));
  }

  const openSeeds: Record<number, string[]> = {
    10: [
      'Local environment breaks weekly after platform upgrades.',
      'Constant context switching between PRs, prod issues and meetings.',
      'CI is so slow it kills any chance of flow.',
      'Tooling feels like it fights me every day.',
      'Promotion paths are unclear for senior engineers.',
    ],
    20: [
      'Spec changed mid-sprint after I had already cut three PRs.',
      "Blocked four days waiting for a security review I couldn't expedite.",
      'Flaky integration env caused a hotfix rollback I owned.',
    ],
    40: [
      'Platform team rolled out a breaking helm chart change with no notice.',
      'API contract change from data-services landed quietly in their changelog.',
      'On-call rotation skews heavily to two senior folks.',
    ],
    50: [
      'Replace the legacy Jenkins pipeline with something deterministic.',
      'Give us reproducible local dev environments in under five minutes.',
      'Automate the boilerplate for new microservices end-to-end.',
      'Make incident RCA tooling actually useful instead of grep-the-logs.',
    ],
  };

  const roles = ['Tech Lead', 'Senior Engineer', 'Software Engineer'];
  const tenures = ['< 1', '1-3', '3-5', '5-10', '10+'];
  const stacks = ['TypeScript', 'Python', 'Go', 'Java'];

  for (let i = 0; i < RESPONDENTS; i++) {
    const submission = await prisma.submission.create({
      data: {
        campaignId: campaign.id,
        questionnaireId: template.id,
        anonymousParticipantKey: `demo-${i}`,
        teamId: team.id,
        roleLabel: roles[i % roles.length]!,
        yearsAtCompany: tenures[i % tenures.length]!,
        primaryTechnology: stacks[i % stacks.length]!,
        submittedAt: new Date(`2025-04-${20 + (i % 10)}T10:${String((i * 7) % 60).padStart(2, '0')}:00Z`),
        status: 'COMPLETED',
      },
    });

    const answers: Array<{
      submissionId: string;
      questionId: string;
      rawValue: string | null;
      numericValue: number | null;
      textValue: string | null;
    }> = [];

    for (const [num, code] of dimOf.entries()) {
      const q = byNum.get(num)!;
      if (q.questionType === 'OPEN_TEXT') {
        const seeds = openSeeds[num] ?? [];
        if (seeds.length === 0) continue;
        if (Math.random() < 0.4) {
          answers.push({
            submissionId: submission.id,
            questionId: q.id,
            rawValue: null,
            numericValue: null,
            textValue: seeds[i % seeds.length]!,
          });
        }
        continue;
      }

      let target = TARGET[code];
      if (num === 7) target = Math.max(target, 2.7); // keep psych-safety gate green
      const min = q.minScale ?? 1;
      const max = q.maxScale ?? 5;
      const scored = sampleAround(target);
      const raw = q.isReverseScored ? max + min - scored : scored;
      answers.push({
        submissionId: submission.id,
        questionId: q.id,
        rawValue: String(raw),
        numericValue: raw,
        textValue: null,
      });
    }

    await prisma.answer.createMany({ data: answers });
  }

  // 6) Score summaries — snapshot the worked-example numbers exactly
  const DIMENSIONS = [
    { code: 'S', name: 'Satisfaction',  avg: TARGET.S, prior: PRIOR.S, band: 'CRITICAL',   priority: 'P1' },
    { code: 'P', name: 'Performance',   avg: TARGET.P, prior: PRIOR.P, band: 'MODERATE',   priority: 'P2' },
    { code: 'A', name: 'Activity',      avg: TARGET.A, prior: PRIOR.A, band: 'HEALTHY',    priority: 'P1' },
    { code: 'C', name: 'Communication', avg: TARGET.C, prior: PRIOR.C, band: 'CRITICAL',   priority: 'P1' },
    { code: 'E', name: 'Efficiency',    avg: TARGET.E, prior: PRIOR.E, band: 'CRITICAL',   priority: 'P1' },
  ] as const;

  for (const d of DIMENSIONS) {
    const delta = Math.round((d.avg - d.prior) * 100) / 100;
    await prisma.scoreSummary.create({
      data: {
        campaignId: campaign.id,
        dimensionCode: d.code,
        dimensionName: d.name,
        averageScore: d.avg,
        responseCount: RESPONDENTS,
        scoreBand: d.band,
        priorityLevel: d.priority,
        trendDelta: delta,
        trendOverridden: false,
      },
    });
  }

  // 7) Open-text themes (Phase 2)
  const themes = [
    {
      themeName: 'Local environment instability',
      description: 'Local dev env breaks after weekly platform helm upgrades.',
      respondentCount: 14,
      percentage: 36.8,
      status: 'PROMOTE',
      representativeQuote: 'Local environment breaks weekly after platform upgrades.',
      jtbdStatement:
        'When the platform team ships an upgrade, I want my local env to keep working so I can ship without losing a day.',
    },
    {
      themeName: 'CI/CD slowness and flakiness',
      description: 'Long pipeline waits and flaky integration tests block iteration.',
      respondentCount: 12,
      percentage: 31.6,
      status: 'PROMOTE',
      representativeQuote: 'CI is so slow it kills any chance of flow.',
      jtbdStatement:
        'When I push a change, I want fast deterministic CI so I can stay in flow.',
    },
    {
      themeName: 'Cross-team contract surprises',
      description: 'Breaking API/contract changes from adjacent teams land without notice.',
      respondentCount: 11,
      percentage: 28.9,
      status: 'PROMOTE',
      representativeQuote: 'API contract change from data-services landed quietly in their changelog.',
      jtbdStatement:
        "When a partner team changes a contract, I want explicit notice so my integration doesn't break in prod.",
    },
    {
      themeName: 'Promotion path opacity',
      description: 'Senior engineers describe unclear levelling and growth conversations.',
      respondentCount: 6,
      percentage: 15.8,
      status: 'INVESTIGATE',
      representativeQuote: 'Promotion paths are unclear for senior engineers.',
      jtbdStatement: null,
    },
  ];
  for (const t of themes) {
    await prisma.openTextTheme.create({
      data: { campaignId: campaign.id, ...t },
    });
  }

  // 8) Blockers (Phase 5)
  const blockers = [
    {
      title: 'Local env breaks weekly after platform helm upgrades',
      description:
        'Engineers on Precision Ag lose ~0.5 day/week reconstituting their local dev env after platform upgrades. Confirmed in journey mapping.',
      sourcePhase: 'PHASE_2',
      dimensionCode: 'E',
      sdlcPhase: 'CODE',
      severity: 'P1',
      affectedTeams: 'Precision Ag Platform',
      reachPercentage: 36.8,
      estimatedHoursLost: 60,
      evidenceSummary: '14 mentions in open text; confirmed live in journey map workshop.',
      aiFit: 'YES',
      status: 'IN_PROGRESS',
    },
    {
      title: 'CI pipeline P95 wait time > 35 min',
      description:
        'Pipeline wall-clock + flaky integration tests force context switches; correlated with low S and low E scores.',
      sourcePhase: 'PHASE_2',
      dimensionCode: 'E',
      sdlcPhase: 'BUILD_TEST',
      severity: 'P1',
      affectedTeams: 'Precision Ag Platform',
      reachPercentage: 31.6,
      estimatedHoursLost: 48,
      evidenceSummary: '12 open-text mentions; DORA lead-time-for-changes trending down quarter-over-quarter.',
      aiFit: 'INVESTIGATE',
      status: 'OPEN',
    },
    {
      title: 'Silent breaking changes from data-services API',
      description:
        'Partner team ships breaking contract changes without RFC; surfaces only when integration env fails.',
      sourcePhase: 'PHASE_2',
      dimensionCode: 'C',
      sdlcPhase: 'INTEGRATE',
      severity: 'P2',
      affectedTeams: 'Precision Ag Platform',
      reachPercentage: 28.9,
      estimatedHoursLost: 24,
      evidenceSummary: '11 open-text mentions; 2 production incidents traced to undocumented schema changes.',
      aiFit: 'NO',
      status: 'OPEN',
    },
  ];
  for (const b of blockers) {
    await prisma.blocker.create({
      data: { campaignId: campaign.id, ...b },
    });
  }

  // 9) Journey map session (Phase 4)
  const session = await prisma.journeyMapSession.create({
    data: {
      campaignId: campaign.id,
      teamId: team.id,
      sessionDate: new Date('2025-05-05'),
      facilitator: 'Platform Engineering Lead',
      participantCount: 7,
      notes:
        'Live 90-minute workshop with 7 ICs from Precision Ag Platform. Mapped the journey from ticket-assigned to code-in-production. Five-Whys on local env failure and CI flakiness. Confirmed both top blockers; surfaced one additional non-AI workstream (RFC discipline for cross-team API changes).',
    },
  });

  const steps = [
    { stepName: 'Pick up ticket',              timeSpent: '15m',  frictionLevel: 'GREEN', dotVotes: 0, quote: 'Backlog is clear, easy to grab a card.' },
    { stepName: 'Spin up local environment',   timeSpent: '90m',  frictionLevel: 'RED',   dotVotes: 6, quote: 'Helm chart from platform broke my db again.', rootCause: 'Unversioned helm upgrades', jtbdStatement: 'Reproducible local env in < 5 min' },
    { stepName: 'Write code + unit tests',     timeSpent: '3h',   frictionLevel: 'GREEN', dotVotes: 0, quote: 'This is the part I actually enjoy.' },
    { stepName: 'Open PR + wait for CI',       timeSpent: '35m',  frictionLevel: 'RED',   dotVotes: 5, quote: 'CI is so slow it kills my flow.', rootCause: 'Pipeline not sharded; flaky tests', jtbdStatement: 'Deterministic CI under 10 min' },
    { stepName: 'Code review',                 timeSpent: '4h',   frictionLevel: 'AMBER', dotVotes: 2, quote: 'Two senior reviewers carry the load.' },
    { stepName: 'Integration env validation',  timeSpent: '1h',   frictionLevel: 'RED',   dotVotes: 4, quote: 'Data-services changed their API silently again.', rootCause: 'No contract test gates', jtbdStatement: 'Explicit cross-team contract notices' },
    { stepName: 'Merge + deploy',              timeSpent: '20m',  frictionLevel: 'GREEN', dotVotes: 0, quote: 'Once it merges the deploy is smooth.' },
  ];
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i]!;
    await prisma.journeyMapStep.create({
      data: {
        sessionId: session.id,
        displayOrder: i,
        stepName: s.stepName,
        timeSpent: s.timeSpent,
        frictionLevel: s.frictionLevel,
        dotVotes: s.dotVotes,
        quote: s.quote ?? null,
        rootCause: s.rootCause ?? null,
        jtbdStatement: s.jtbdStatement ?? null,
      },
    });
  }

  console.log("✓ Demo company:   Land O'Lakes Engineering (demo)");
  console.log('✓ Demo team:      Precision Ag Platform');
  console.log('✓ Demo campaign:  SPACE Q2 2025 (CLOSED) — 38 submissions');
  console.log('  Scores:         S=2.4  P=3.1  A=3.8  C=2.6  E=2.2');
  console.log('  Prior:          S=2.7  P=3.1  A=4.3  C=3.0  E=2.8');
  console.log('✓ 5 score summaries, 4 themes, 3 blockers, 1 journey session (7 steps) inserted.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
