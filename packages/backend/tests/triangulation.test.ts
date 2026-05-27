import bcrypt from 'bcryptjs';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SPACE_QUESTIONS } from '@space/shared';
import { createApp } from '../src/app.js';
import { prisma } from '../src/prisma/client.js';

const app = createApp();
const TEST_EMAIL = `test-triangulation-${Date.now()}@example.com`;
const TEST_PASSWORD = 'TestPassword!123';
let token = '';
let companyId = '';
let campaignId = '';
let blockerId = '';
let signalId = '';

beforeAll(async () => {
  await prisma.user.create({
    data: {
      name: 'Triangulation Tester',
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
    .send({ name: `Triangulation Co ${Date.now()}` });
  companyId = co.body.id;

  const camp = await request(app)
    .post(`/api/companies/${companyId}/campaigns`)
    .set('authorization', `Bearer ${token}`)
    .send({ questionnaireId: template.id, title: 'Triangulation Test' });
  campaignId = camp.body.id;

  // Seed a couple of low-scoring submissions so /candidates surfaces dims
  const inv = await request(app)
    .post(`/api/companies/${companyId}/campaigns/${campaignId}/invites`)
    .set('authorization', `Bearer ${token}`)
    .send({ count: 2 });
  const tokens: string[] = inv.body.items.map((i: { uniqueToken: string }) => i.uniqueToken);
  for (const t of tokens) {
    await request(app).get(`/api/public/survey/${t}`);
    const answers = SPACE_QUESTIONS.map((q) =>
      q.type === 'OPEN_TEXT'
        ? { questionNumber: q.number, textValue: `Open answer ${q.number}` }
        : { questionNumber: q.number, rawValue: 2 },
    );
    await request(app)
      .post(`/api/public/survey/${t}/submit`)
      .send({ answers });
  }
});

afterAll(async () => {
  if (campaignId) {
    await prisma.validationSignal.deleteMany({ where: { campaignId } });
    await prisma.blocker.deleteMany({ where: { campaignId } });
  }
  if (companyId) {
    await prisma.surveyCampaign.deleteMany({ where: { companyId } });
    await prisma.company.delete({ where: { id: companyId } });
  }
  await prisma.user.deleteMany({ where: { email: TEST_EMAIL } });
});

const base = () =>
  `/api/companies/${companyId}/campaigns/${campaignId}/triangulation`;

describe('Triangulation: blockers + signals', () => {
  it('creates a blocker', async () => {
    const res = await request(app)
      .post(`${base()}/blockers`)
      .set('authorization', `Bearer ${token}`)
      .send({
        title: 'Slow CI pipeline',
        severity: 'P2',
        sourcePhase: 'TRIANGULATION',
        dimensionCode: 'PERF',
        reachPercentage: 80,
        estimatedHoursLost: 12,
        evidenceSummary: 'Low PERF score + RED journey step',
      });
    expect(res.status).toBe(201);
    blockerId = res.body.id;
    expect(res.body.severity).toBe('P2');
  });

  it('lists blockers with signal count', async () => {
    const res = await request(app)
      .get(`${base()}/blockers`)
      .set('authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].signalCount).toBe(0);
  });

  it('updates a blocker', async () => {
    const res = await request(app)
      .patch(`${base()}/blockers/${blockerId}`)
      .set('authorization', `Bearer ${token}`)
      .send({ aiFit: 'STRONG_FIT', status: 'IN_PROGRESS' });
    expect(res.status).toBe(200);
    expect(res.body.aiFit).toBe('STRONG_FIT');
    expect(res.body.status).toBe('IN_PROGRESS');
  });

  it('attaches a signal', async () => {
    const res = await request(app)
      .post(`${base()}/blockers/${blockerId}/signals`)
      .set('authorization', `Bearer ${token}`)
      .send({
        signalType: 'CICD',
        signalName: 'p95 build duration > 12min',
        evidenceValue: '12.7m',
        confirmed: true,
      });
    expect(res.status).toBe(201);
    signalId = res.body.id;
    expect(res.body.confirmed).toBe(true);
  });

  it('lists signals for a blocker', async () => {
    const res = await request(app)
      .get(`${base()}/blockers/${blockerId}/signals`)
      .set('authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].signalType).toBe('CICD');
  });

  it('updates a signal', async () => {
    const res = await request(app)
      .patch(`${base()}/signals/${signalId}`)
      .set('authorization', `Bearer ${token}`)
      .send({ evidenceValue: '13.2m' });
    expect(res.status).toBe(200);
    expect(res.body.evidenceValue).toBe('13.2m');
  });

  it('blocker list reflects signal count', async () => {
    const res = await request(app)
      .get(`${base()}/blockers`)
      .set('authorization', `Bearer ${token}`);
    expect(res.body.items[0].signalCount).toBe(1);
  });

  it('returns candidate suggestions from quant + qual + journey', async () => {
    const res = await request(app)
      .get(`${base()}/candidates`)
      .set('authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    // All raw answers were 2 → all dimension averages 2 < 3.5
    expect(res.body.dimensions.length).toBeGreaterThan(0);
    expect(res.body.dimensions[0].avgScore).toBeLessThan(3.5);
    expect(Array.isArray(res.body.themes)).toBe(true);
    expect(Array.isArray(res.body.journeySteps)).toBe(true);
  });

  it('deletes a signal', async () => {
    const res = await request(app)
      .delete(`${base()}/signals/${signalId}`)
      .set('authorization', `Bearer ${token}`);
    expect(res.status).toBe(204);
  });

  it('deletes a blocker', async () => {
    const res = await request(app)
      .delete(`${base()}/blockers/${blockerId}`)
      .set('authorization', `Bearer ${token}`);
    expect(res.status).toBe(204);
    const list = await request(app)
      .get(`${base()}/blockers`)
      .set('authorization', `Bearer ${token}`);
    expect(list.body.items).toHaveLength(0);
  });
});
