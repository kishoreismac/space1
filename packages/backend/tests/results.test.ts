import bcrypt from 'bcryptjs';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SPACE_QUESTIONS } from '@space/shared';
import { createApp } from '../src/app.js';
import { prisma } from '../src/prisma/client.js';

const app = createApp();
const TEST_EMAIL = `test-results-${Date.now()}@example.com`;
const TEST_PASSWORD = 'TestPassword!123';
let token = '';
let companyId = '';
let questionnaireId = '';
let campaignId = '';

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
      name: 'Results Tester',
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
  questionnaireId = template.id;

  const co = await request(app)
    .post('/api/companies')
    .set('authorization', `Bearer ${token}`)
    .send({ name: `Results Co ${Date.now()}` });
  companyId = co.body.id;

  const camp = await request(app)
    .post(`/api/companies/${companyId}/campaigns`)
    .set('authorization', `Bearer ${token}`)
    .send({ questionnaireId, title: 'Results Test' });
  campaignId = camp.body.id;

  // Generate 3 invites and submit a mix of scores (4, 4, 2)
  const inv = await request(app)
    .post(`/api/companies/${companyId}/campaigns/${campaignId}/invites`)
    .set('authorization', `Bearer ${token}`)
    .send({ count: 3 });
  const tokens: string[] = inv.body.items.map((i: { uniqueToken: string }) => i.uniqueToken);

  const scores = [4, 4, 2];
  for (let i = 0; i < tokens.length; i++) {
    await request(app).get(`/api/public/survey/${tokens[i]}`);
    const r = await request(app)
      .post(`/api/public/survey/${tokens[i]}/submit`)
      .send({ answers: buildAnswers(scores[i]!) });
    expect(r.status).toBe(201);
  }
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
    await prisma.company.delete({ where: { id: companyId } }).catch(() => undefined);
  }
  await prisma.user.delete({ where: { email: TEST_EMAIL } }).catch(() => undefined);
  await prisma.$disconnect();
});

describe('results overview', () => {
  it('returns dimension scores, response rate, and alerts', async () => {
    const r = await request(app)
      .get(`/api/companies/${companyId}/campaigns/${campaignId}/results`)
      .set('authorization', `Bearer ${token}`);
    expect(r.status).toBe(200);
    expect(r.body.respondentCount).toBe(3);
    expect(r.body.inviteCount).toBe(3);
    expect(r.body.responseRate).toBe(100);
    expect(r.body.dimensions).toHaveLength(5);
    for (const d of r.body.dimensions) {
      expect(['S', 'P', 'A', 'C', 'E']).toContain(d.code);
      expect(d.averageScore).toBeGreaterThan(0);
      expect(d.band).toBeTruthy();
      expect(d.priority).toMatch(/^(P1|P2|P3|MONITOR)$/);
    }
    // psychSafetyAverage from Q7 (raw 4 twice and 2 once → mean ~3.33)
    expect(r.body.psychSafetyAverage).toBeCloseTo(3.33, 1);
  });

  it('returns question-level breakdown', async () => {
    const r = await request(app)
      .get(`/api/companies/${companyId}/campaigns/${campaignId}/results/questions`)
      .set('authorization', `Bearer ${token}`);
    expect(r.status).toBe(200);
    expect(r.body.items.length).toBeGreaterThan(40);
    const sample = r.body.items[0];
    expect(sample.average).toBeGreaterThan(0);
    expect(sample.responseCount).toBe(3);
  });

  it('returns open-text answers', async () => {
    const r = await request(app)
      .get(`/api/companies/${companyId}/campaigns/${campaignId}/results/open-text`)
      .set('authorization', `Bearer ${token}`);
    expect(r.status).toBe(200);
    // 16 open-text questions × 3 submissions = 48
    expect(r.body.items.length).toBe(48);
  });

  it('persists a score snapshot', async () => {
    const r = await request(app)
      .post(`/api/companies/${companyId}/campaigns/${campaignId}/results/snapshot`)
      .set('authorization', `Bearer ${token}`);
    expect(r.status).toBe(200);
    expect(r.body.summaries).toHaveLength(5);
    const dbRows = await prisma.scoreSummary.findMany({ where: { campaignId } });
    expect(dbRows).toHaveLength(5);
  });

  it('applies trend override when previous score drops > 0.4', async () => {
    // Set a prior S avg much higher than current to trigger override
    await prisma.surveyCampaign.update({
      where: { id: campaignId },
      data: { previousS: 4.5 },
    });
    const r = await request(app)
      .get(`/api/companies/${companyId}/campaigns/${campaignId}/results`)
      .set('authorization', `Bearer ${token}`);
    const s = r.body.dimensions.find((d: { code: string }) => d.code === 'S');
    expect(s.previousAverage).toBe(4.5);
    expect(s.trendDelta).toBeLessThan(0);
    expect(s.trendOverridden).toBe(true);
    expect(s.priority).toBe('P1');
  });
});
