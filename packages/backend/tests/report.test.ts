import bcrypt from 'bcryptjs';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SPACE_QUESTIONS } from '@space/shared';
import { createApp } from '../src/app.js';
import { prisma } from '../src/prisma/client.js';

const app = createApp();
const TEST_EMAIL = `test-report-${Date.now()}@example.com`;
const TEST_PASSWORD = 'TestPassword!123';
let token = '';
let companyId = '';
let campaignId = '';
let strongBlockerId = '';

function buildAnswers(likertValue: number) {
  return SPACE_QUESTIONS.map((q) =>
    q.type === 'OPEN_TEXT'
      ? { questionNumber: q.number, textValue: `Text Q${q.number}` }
      : { questionNumber: q.number, rawValue: likertValue },
  );
}

beforeAll(async () => {
  await prisma.user.create({
    data: {
      name: 'Report Tester',
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
    .send({ name: `Report Co ${Date.now()}` });
  companyId = co.body.id;

  const camp = await request(app)
    .post(`/api/companies/${companyId}/campaigns`)
    .set('authorization', `Bearer ${token}`)
    .send({ questionnaireId: template.id, title: 'Report Test' });
  campaignId = camp.body.id;

  // Two completed submissions
  const inv = await request(app)
    .post(`/api/companies/${companyId}/campaigns/${campaignId}/invites`)
    .set('authorization', `Bearer ${token}`)
    .send({ count: 2 });
  const tokens: string[] = inv.body.items.map((i: { uniqueToken: string }) => i.uniqueToken);
  for (const t of tokens) {
    await request(app).get(`/api/public/survey/${t}`);
    await request(app).post(`/api/public/survey/${t}/submit`).send({ answers: buildAnswers(4) });
  }

  // One theme
  await request(app)
    .post(`/api/companies/${companyId}/campaigns/${campaignId}/themes`)
    .set('authorization', `Bearer ${token}`)
    .send({ themeName: 'Slow CI', jtbdStatement: 'When my PR is open, I want fast CI…' });

  // One journey session + 1 RED step
  const sess = await request(app)
    .post(`/api/companies/${companyId}/campaigns/${campaignId}/journey`)
    .set('authorization', `Bearer ${token}`)
    .send({ facilitator: 'Tester', participantCount: 4 });
  await request(app)
    .post(`/api/companies/${companyId}/campaigns/${campaignId}/journey/${sess.body.id}/steps`)
    .set('authorization', `Bearer ${token}`)
    .send({
      stepName: 'Wait for CI',
      frictionLevel: 'RED',
      dotVotes: 5,
      rootCause: 'Slow test suite',
    });

  // Two blockers; score one as STRONG_FIT
  const triBase = `/api/companies/${companyId}/campaigns/${campaignId}/triangulation`;
  const feasBase = `/api/companies/${companyId}/campaigns/${campaignId}/feasibility`;
  const b1 = await request(app)
    .post(`${triBase}/blockers`)
    .set('authorization', `Bearer ${token}`)
    .send({
      title: 'Flaky integration tests',
      severity: 'P1',
      reachPercentage: 80,
      estimatedHoursLost: 16,
      sdlcPhase: 'TEST',
    });
  strongBlockerId = b1.body.id;
  await request(app)
    .put(`${feasBase}/blockers/${strongBlockerId}/feasibility`)
    .set('authorization', `Bearer ${token}`)
    .send({
      toolMaturityScore: 5,
      integrationEaseScore: 5,
      costEfficiencyScore: 4,
      dataAvailabilityScore: 5,
      developerAdoptionScore: 4,
    });
  await request(app)
    .post(`${triBase}/blockers`)
    .set('authorization', `Bearer ${token}`)
    .send({ title: 'Misc nit', severity: 'P4' });
});

afterAll(async () => {
  if (campaignId) {
    await prisma.aIFeasibilityScore.deleteMany({ where: { blocker: { campaignId } } });
    await prisma.blocker.deleteMany({ where: { campaignId } });
    await prisma.journeyMapStep.deleteMany({ where: { session: { campaignId } } });
    await prisma.journeyMapSession.deleteMany({ where: { campaignId } });
    await prisma.openTextTheme.deleteMany({ where: { campaignId } });
    await prisma.answer.deleteMany({ where: { submission: { campaignId } } });
    await prisma.submission.deleteMany({ where: { campaignId } });
    await prisma.surveyInvite.deleteMany({ where: { campaignId } });
    await prisma.scoreSummary.deleteMany({ where: { campaignId } });
    await prisma.surveyCampaign.delete({ where: { id: campaignId } }).catch(() => undefined);
  }
  if (companyId) {
    await prisma.company.delete({ where: { id: companyId } }).catch(() => undefined);
  }
  await prisma.user.delete({ where: { email: TEST_EMAIL } }).catch(() => undefined);
  await prisma.$disconnect();
});

describe('executive report', () => {
  it('aggregates all phases into a single payload', async () => {
    const r = await request(app)
      .get(`/api/companies/${companyId}/campaigns/${campaignId}/report`)
      .set('authorization', `Bearer ${token}`);
    expect(r.status).toBe(200);
    expect(r.body.generatedAt).toBeTruthy();
    expect(r.body.company.id).toBe(companyId);
    expect(r.body.campaign.id).toBe(campaignId);

    // Participation
    expect(r.body.participation.respondentCount).toBe(2);
    expect(r.body.participation.inviteCount).toBe(2);
    expect(r.body.participation.responseRate).toBe(100);

    // SPACE
    expect(r.body.space.dimensions).toHaveLength(5);
    for (const d of r.body.space.dimensions) {
      expect(['S', 'P', 'A', 'C', 'E']).toContain(d.code);
      expect(d.name).toBeTruthy();
    }
    expect(r.body.space.psychSafetyGate).toBe('OK');

    // Themes
    expect(r.body.themes).toHaveLength(1);
    expect(r.body.themes[0].themeName).toBe('Slow CI');

    // Journey
    expect(r.body.journey.sessionCount).toBe(1);
    expect(r.body.journey.stepCount).toBe(1);
    expect(r.body.journey.frictionCounts.RED).toBe(1);
    expect(r.body.journey.topFrictionSteps).toHaveLength(1);

    // Blockers + roadmap
    expect(r.body.blockers).toHaveLength(2);
    // P1 first
    expect(r.body.blockers[0].severity).toBe('P1');
    expect(r.body.roadmap.summary.total).toBe(2);
    expect(r.body.roadmap.now.length).toBeGreaterThanOrEqual(1);
    expect(r.body.roadmap.now[0].blockerId).toBe(strongBlockerId);

    // Recommendations
    expect(r.body.recommendations.now[0].blockerId).toBe(strongBlockerId);
  });

  it('rejects access from a different company', async () => {
    const otherEmail = `other-${Date.now()}@example.com`;
    await prisma.user.create({
      data: {
        name: 'Other',
        email: otherEmail,
        role: 'COMPANY_ADMIN',
        passwordHash: await bcrypt.hash(TEST_PASSWORD, 4),
        status: 'ACTIVE',
      },
    });
    const co = await request(app)
      .post('/api/companies')
      .set('authorization', `Bearer ${token}`)
      .send({ name: `Other Co ${Date.now()}` });
    await prisma.user.update({
      where: { email: otherEmail },
      data: { companyId: co.body.id },
    });
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: otherEmail, password: TEST_PASSWORD });
    const r = await request(app)
      .get(`/api/companies/${companyId}/campaigns/${campaignId}/report`)
      .set('authorization', `Bearer ${login.body.accessToken}`);
    expect(r.status).toBe(403);
    await prisma.user.delete({ where: { email: otherEmail } });
    await prisma.company.delete({ where: { id: co.body.id } });
  });
});
