import bcrypt from 'bcryptjs';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SPACE_QUESTIONS } from '@space/shared';
import { createApp } from '../src/app.js';
import { prisma } from '../src/prisma/client.js';

const app = createApp();
const TEST_EMAIL = `test-teams-${Date.now()}@example.com`;
const TEST_PASSWORD = 'TestPassword!123';
let token = '';
let companyId = '';
let campaignId = '';
let teamAId = '';
let teamBId = '';

function buildAnswers(likertValue: number) {
  return SPACE_QUESTIONS.map((q) =>
    q.type === 'OPEN_TEXT'
      ? { questionNumber: q.number, textValue: `T${q.number}` }
      : { questionNumber: q.number, rawValue: likertValue },
  );
}

beforeAll(async () => {
  await prisma.user.create({
    data: {
      name: 'Teams Tester',
      email: TEST_EMAIL,
      role: 'SUPER_ADMIN',
      passwordHash: await bcrypt.hash(TEST_PASSWORD, 4),
      status: 'ACTIVE',
    },
  });
  const login = await request(app)
    .post('/api/auth/login')
    .send({ email: TEST_EMAIL, password: TEST_PASSWORD });
  token = login.body.accessToken;

  const template = await prisma.questionnaire.findFirst({
    where: { companyId: null, title: { contains: 'SPACE 50' } },
  });
  if (!template) throw new Error('SPACE-50 template missing');

  const co = await request(app)
    .post('/api/companies')
    .set('authorization', `Bearer ${token}`)
    .send({ name: `Teams Co ${Date.now()}` });
  companyId = co.body.id;

  const teamA = await request(app)
    .post(`/api/companies/${companyId}/teams`)
    .set('authorization', `Bearer ${token}`)
    .send({ name: 'Platform' });
  teamAId = teamA.body.id;
  const teamB = await request(app)
    .post(`/api/companies/${companyId}/teams`)
    .set('authorization', `Bearer ${token}`)
    .send({ name: 'Frontend' });
  teamBId = teamB.body.id;

  const camp = await request(app)
    .post(`/api/companies/${companyId}/campaigns`)
    .set('authorization', `Bearer ${token}`)
    .send({ questionnaireId: template.id, title: 'Teams Test' });
  campaignId = camp.body.id;

  // 2 invites for team A (high scores), 2 for team B (low scores), 1 unassigned (mid).
  const seed = async (teamId: string | null, score: number) => {
    const body =
      teamId === null
        ? { count: 1 }
        : { invites: [{ teamId }] };
    const inv = await request(app)
      .post(`/api/companies/${companyId}/campaigns/${campaignId}/invites`)
      .set('authorization', `Bearer ${token}`)
      .send(body);
    const t = inv.body.items[0].uniqueToken;
    await request(app).get(`/api/public/survey/${t}`);
    const r = await request(app)
      .post(`/api/public/survey/${t}/submit`)
      .send({ answers: buildAnswers(score) });
    expect(r.status).toBe(201);
  };
  await seed(teamAId, 5);
  await seed(teamAId, 5);
  await seed(teamBId, 2);
  await seed(teamBId, 2);
  await seed(null, 3);
});

afterAll(async () => {
  if (campaignId) {
    await prisma.answer.deleteMany({ where: { submission: { campaignId } } });
    await prisma.submission.deleteMany({ where: { campaignId } });
    await prisma.surveyInvite.deleteMany({ where: { campaignId } });
    await prisma.scoreSummary.deleteMany({ where: { campaignId } });
    await prisma.surveyCampaign.delete({ where: { id: campaignId } }).catch(() => undefined);
  }
  if (companyId) {
    await prisma.team.deleteMany({ where: { companyId } });
    await prisma.company.delete({ where: { id: companyId } }).catch(() => undefined);
  }
  await prisma.user.delete({ where: { email: TEST_EMAIL } }).catch(() => undefined);
  await prisma.$disconnect();
});

describe('per-team comparison', () => {
  it('returns rows for All teams + each team + Unassigned with deltas', async () => {
    const r = await request(app)
      .get(`/api/companies/${companyId}/campaigns/${campaignId}/results/teams`)
      .set('authorization', `Bearer ${token}`);
    expect(r.status).toBe(200);
    expect(r.body.totalRespondents).toBe(5);
    expect(r.body.unassignedCount).toBe(1);
    expect(r.body.threshold).toBe(0.5);

    const names = r.body.teamRows.map((row: { teamName: string }) => row.teamName);
    expect(names[0]).toBe('All teams (campaign avg)');
    expect(names).toContain('Platform');
    expect(names).toContain('Frontend');
    expect(names).toContain('Unassigned');

    const platform = r.body.teamRows.find((x: { teamName: string }) => x.teamName === 'Platform');
    const frontend = r.body.teamRows.find((x: { teamName: string }) => x.teamName === 'Frontend');
    expect(platform.respondentCount).toBe(2);
    expect(frontend.respondentCount).toBe(2);

    // Platform and Frontend chose extreme opposing raw answers, so per dimension
    // their deltas vs the campaign mean must move in opposite directions.
    for (let i = 0; i < 5; i++) {
      const pd = platform.dimensions[i].delta;
      const fd = frontend.dimensions[i].delta;
      expect(pd).not.toBe(0);
      expect(fd).not.toBe(0);
      expect(Math.sign(pd) * Math.sign(fd)).toBe(-1);
    }

    // At least one dim flagged on both Platform and Frontend since |delta| ≥ 0.5
    expect(platform.dimensions.some((d: { flagged: boolean }) => d.flagged)).toBe(true);
    expect(frontend.dimensions.some((d: { flagged: boolean }) => d.flagged)).toBe(true);

    // All-teams row dims should all have delta === null.
    const all = r.body.teamRows[0];
    expect(all.dimensions.every((d: { delta: number | null }) => d.delta === null)).toBe(true);
  });

  it('honors custom threshold query', async () => {
    const r = await request(app)
      .get(`/api/companies/${companyId}/campaigns/${campaignId}/results/teams?threshold=10`)
      .set('authorization', `Bearer ${token}`);
    expect(r.status).toBe(200);
    expect(r.body.threshold).toBe(5); // capped at 5
    for (const row of r.body.teamRows) {
      for (const d of row.dimensions) expect(d.flagged).toBe(false);
    }
  });
});
