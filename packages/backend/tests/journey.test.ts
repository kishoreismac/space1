import bcrypt from 'bcryptjs';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/prisma/client.js';

const app = createApp();
const TEST_EMAIL = `test-journey-${Date.now()}@example.com`;
const TEST_PASSWORD = 'TestPassword!123';
let token = '';
let companyId = '';
let campaignId = '';
let sessionId = '';
let stepIds: string[] = [];

beforeAll(async () => {
  await prisma.user.create({
    data: {
      name: 'Journey Tester',
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
    .send({ name: `Journey Co ${Date.now()}` });
  companyId = co.body.id;

  const camp = await request(app)
    .post(`/api/companies/${companyId}/campaigns`)
    .set('authorization', `Bearer ${token}`)
    .send({ questionnaireId: template.id, title: 'Journey Test' });
  campaignId = camp.body.id;
});

afterAll(async () => {
  if (campaignId) {
    await prisma.journeyMapStep.deleteMany({
      where: { session: { campaignId } },
    });
    await prisma.journeyMapSession.deleteMany({ where: { campaignId } });
  }
  if (companyId) {
    await prisma.surveyCampaign.deleteMany({ where: { companyId } });
    await prisma.team.deleteMany({ where: { companyId } });
    await prisma.company.delete({ where: { id: companyId } });
  }
  await prisma.user.deleteMany({ where: { email: TEST_EMAIL } });
});

const base = () =>
  `/api/companies/${companyId}/campaigns/${campaignId}/journey`;

describe('Journey mapping', () => {
  it('creates a journey session', async () => {
    const res = await request(app)
      .post(base())
      .set('authorization', `Bearer ${token}`)
      .send({
        facilitator: 'Alex',
        participantCount: 6,
        notes: 'Workshop with platform team',
      });
    expect(res.status).toBe(201);
    expect(res.body.id).toBeTruthy();
    sessionId = res.body.id;
  });

  it('lists sessions with step counts', async () => {
    const res = await request(app)
      .get(base())
      .set('authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].stepCount).toBe(0);
    expect(res.body.items[0].facilitator).toBe('Alex');
  });

  it('updates session metadata', async () => {
    const res = await request(app)
      .patch(`${base()}/${sessionId}`)
      .set('authorization', `Bearer ${token}`)
      .send({ participantCount: 8 });
    expect(res.status).toBe(200);
    expect(res.body.participantCount).toBe(8);
  });

  it('adds 3 steps with auto displayOrder', async () => {
    const names = ['Pick up ticket', 'Local build', 'Code review'];
    for (const name of names) {
      const r = await request(app)
        .post(`${base()}/${sessionId}/steps`)
        .set('authorization', `Bearer ${token}`)
        .send({ stepName: name, frictionLevel: 'GREEN' });
      expect(r.status).toBe(201);
      stepIds.push(r.body.id);
    }
    const list = await request(app)
      .get(`${base()}/${sessionId}/steps`)
      .set('authorization', `Bearer ${token}`);
    expect(list.body.items).toHaveLength(3);
    expect(list.body.items[0].displayOrder).toBe(10);
    expect(list.body.items[2].displayOrder).toBe(30);
  });

  it('updates a step with friction RED + votes + JTBD', async () => {
    const id = stepIds[1];
    const res = await request(app)
      .patch(`${base()}/${sessionId}/steps/${id}`)
      .set('authorization', `Bearer ${token}`)
      .send({
        frictionLevel: 'RED',
        dotVotes: 9,
        rootCause: 'Cold cache',
        jtbdStatement: 'When I rebuild, I want fast feedback so I can keep flow.',
      });
    expect(res.status).toBe(200);
    expect(res.body.frictionLevel).toBe('RED');
    expect(res.body.dotVotes).toBe(9);
  });

  it('reorders steps and returns new order', async () => {
    const reversed = [...stepIds].reverse();
    const res = await request(app)
      .post(`${base()}/${sessionId}/steps/reorder`)
      .set('authorization', `Bearer ${token}`)
      .send({ stepIds: reversed });
    expect(res.status).toBe(200);
    expect(res.body.items.map((s: { id: string }) => s.id)).toEqual(reversed);
    expect(res.body.items[0].displayOrder).toBe(10);
  });

  it('computes summary with heatmap + top pain points', async () => {
    const res = await request(app)
      .get(`${base()}/${sessionId}/summary`)
      .set('authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.stepCount).toBe(3);
    expect(res.body.totalVotes).toBe(9);
    expect(res.body.frictionCounts.RED).toBe(1);
    expect(res.body.frictionCounts.GREEN).toBe(2);
    expect(res.body.topPainPoints).toHaveLength(1);
    expect(res.body.topPainPoints[0].rootCause).toBe('Cold cache');
  });

  it('rejects reorder with unknown step id', async () => {
    const res = await request(app)
      .post(`${base()}/${sessionId}/steps/reorder`)
      .set('authorization', `Bearer ${token}`)
      .send({ stepIds: ['clxxxxxxxxxxxxxxxxxxxxxxx'] });
    expect(res.status).toBe(400);
  });

  it('deletes a step', async () => {
    const id = stepIds[0];
    const res = await request(app)
      .delete(`${base()}/${sessionId}/steps/${id}`)
      .set('authorization', `Bearer ${token}`);
    expect(res.status).toBe(204);
    const list = await request(app)
      .get(`${base()}/${sessionId}/steps`)
      .set('authorization', `Bearer ${token}`);
    expect(list.body.items).toHaveLength(2);
  });

  it('deletes the session and cascades remaining steps', async () => {
    const res = await request(app)
      .delete(`${base()}/${sessionId}`)
      .set('authorization', `Bearer ${token}`);
    expect(res.status).toBe(204);
    const remaining = await prisma.journeyMapStep.count({ where: { sessionId } });
    expect(remaining).toBe(0);
  });
});
