import bcrypt from 'bcryptjs';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/prisma/client.js';

const app = createApp();
const SUPER_EMAIL = `audit-super-${Date.now()}@example.com`;
const ADMIN_EMAIL = `audit-admin-${Date.now()}@example.com`;
const PASSWORD = 'TestPassword!123';
let superToken = '';
let adminToken = '';
let companyId = '';
let campaignId = '';

beforeAll(async () => {
  await prisma.user.create({
    data: {
      name: 'Audit Super',
      email: SUPER_EMAIL,
      role: 'SUPER_ADMIN',
      passwordHash: await bcrypt.hash(PASSWORD, 4),
      status: 'ACTIVE',
    },
  });
  superToken = (
    await request(app).post('/api/auth/login').send({ email: SUPER_EMAIL, password: PASSWORD })
  ).body.accessToken;

  // Wrong-password login attempt → produces audit failure
  await request(app)
    .post('/api/auth/login')
    .send({ email: SUPER_EMAIL, password: 'wrong-password' });

  const template = await prisma.questionnaire.findFirst({
    where: { companyId: null, title: { contains: 'SPACE 50' } },
  });
  if (!template) throw new Error('SPACE-50 template missing');

  const co = await request(app)
    .post('/api/companies')
    .set('authorization', `Bearer ${superToken}`)
    .send({ name: `Audit Co ${Date.now()}` });
  companyId = co.body.id;

  const camp = await request(app)
    .post(`/api/companies/${companyId}/campaigns`)
    .set('authorization', `Bearer ${superToken}`)
    .send({ questionnaireId: template.id, title: 'Audit Test' });
  campaignId = camp.body.id;

  await request(app)
    .post(`/api/companies/${companyId}/campaigns/${campaignId}/triangulation/blockers`)
    .set('authorization', `Bearer ${superToken}`)
    .send({ title: 'Audit Block', severity: 'P2', reachPercentage: 40, estimatedHoursLost: 2 });

  await prisma.user.create({
    data: {
      name: 'Audit Admin',
      email: ADMIN_EMAIL,
      role: 'COMPANY_ADMIN',
      companyId,
      passwordHash: await bcrypt.hash(PASSWORD, 4),
      status: 'ACTIVE',
    },
  });
  adminToken = (
    await request(app).post('/api/auth/login').send({ email: ADMIN_EMAIL, password: PASSWORD })
  ).body.accessToken;
});

afterAll(async () => {
  if (campaignId) {
    await prisma.blocker.deleteMany({ where: { campaignId } });
    await prisma.surveyCampaign.delete({ where: { id: campaignId } }).catch(() => undefined);
  }
  if (companyId) {
    await prisma.company.delete({ where: { id: companyId } }).catch(() => undefined);
  }
  await prisma.user.deleteMany({ where: { email: { in: [SUPER_EMAIL, ADMIN_EMAIL] } } });
  await prisma.auditLog.deleteMany({ where: { actorRole: 'SUPER_ADMIN', action: { startsWith: 'company.' } } });
  await prisma.$disconnect();
});

describe('GET /audit', () => {
  it('records auth, company, campaign and blocker events', async () => {
    const r = await request(app)
      .get('/api/audit?limit=200')
      .set('authorization', `Bearer ${superToken}`);
    expect(r.status).toBe(200);
    const actions = r.body.items.map((i: { action: string }) => i.action);
    expect(actions).toContain('auth.login.success');
    expect(actions).toContain('auth.login.failed');
    expect(actions).toContain('company.create');
    expect(actions).toContain('campaign.create');
    expect(actions).toContain('blocker.create');
  });

  it('filters by entityType', async () => {
    const r = await request(app)
      .get('/api/audit?entityType=Blocker&limit=50')
      .set('authorization', `Bearer ${superToken}`);
    expect(r.status).toBe(200);
    expect(r.body.items.length).toBeGreaterThan(0);
    for (const item of r.body.items) {
      expect(item.entityType).toBe('Blocker');
    }
  });

  it('rejects non-super-admin', async () => {
    const r = await request(app)
      .get('/api/audit')
      .set('authorization', `Bearer ${adminToken}`);
    expect(r.status).toBe(403);
  });
});
