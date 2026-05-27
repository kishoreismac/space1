import bcrypt from 'bcryptjs';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/prisma/client.js';

const app = createApp();
const EMAIL = `clone-${Date.now()}@example.com`;
const PW = 'TestPassword!123';
let token = '';
let companyId = '';
let sourceCampaign = '';
let clonedId = '';

beforeAll(async () => {
  await prisma.user.create({
    data: {
      name: 'Clone Tester',
      email: EMAIL,
      role: 'SUPER_ADMIN',
      passwordHash: await bcrypt.hash(PW, 4),
      status: 'ACTIVE',
    },
  });
  token = (await request(app).post('/api/auth/login').send({ email: EMAIL, password: PW })).body
    .accessToken;

  const template = await prisma.questionnaire.findFirst({
    where: { companyId: null, title: { contains: 'SPACE 50' } },
  });
  if (!template) throw new Error('SPACE-50 template missing');

  const co = await request(app)
    .post('/api/companies')
    .set('authorization', `Bearer ${token}`)
    .send({ name: `Clone Co ${Date.now()}` });
  companyId = co.body.id;

  const c = await request(app)
    .post(`/api/companies/${companyId}/campaigns`)
    .set('authorization', `Bearer ${token}`)
    .send({ questionnaireId: template.id, title: 'Source Campaign' });
  sourceCampaign = c.body.id;

  // Seed score summaries for S/P/A/C/E
  for (const [code, val, name] of [
    ['S', 3.8, 'Satisfaction'],
    ['P', 4.1, 'Performance'],
    ['A', 3.5, 'Activity'],
    ['C', 4.0, 'Collaboration'],
    ['E', 3.2, 'Efficiency'],
  ] as const) {
    await prisma.scoreSummary.create({
      data: {
        campaignId: sourceCampaign,
        dimensionCode: code,
        dimensionName: name,
        averageScore: val,
        responseCount: 10,
      },
    });
  }
});

afterAll(async () => {
  for (const id of [sourceCampaign, clonedId]) {
    if (!id) continue;
    await prisma.scoreSummary.deleteMany({ where: { campaignId: id } });
    await prisma.surveyCampaign.delete({ where: { id } }).catch(() => undefined);
  }
  if (companyId) await prisma.company.delete({ where: { id: companyId } }).catch(() => undefined);
  await prisma.user.delete({ where: { email: EMAIL } }).catch(() => undefined);
  await prisma.$disconnect();
});

describe('POST /campaigns/:id/clone', () => {
  it('creates a new campaign with previous SPACE baked from source summaries', async () => {
    const r = await request(app)
      .post(`/api/companies/${companyId}/campaigns/${sourceCampaign}/clone`)
      .set('authorization', `Bearer ${token}`)
      .send({ title: 'Cycle 2', cycle: '2026-Q3' });
    expect(r.status).toBe(201);
    clonedId = r.body.id;
    expect(r.body.title).toBe('Cycle 2');
    expect(r.body.cycle).toBe('2026-Q3');
    expect(r.body.previousS).toBeCloseTo(3.8, 5);
    expect(r.body.previousP).toBeCloseTo(4.1, 5);
    expect(r.body.previousA).toBeCloseTo(3.5, 5);
    expect(r.body.previousC).toBeCloseTo(4.0, 5);
    expect(r.body.previousE).toBeCloseTo(3.2, 5);
    expect(r.body.questionnaireId).toBeTruthy();
    expect(r.body.status).toBe('DRAFT');
  });
});
