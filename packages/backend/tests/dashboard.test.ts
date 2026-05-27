import bcrypt from 'bcryptjs';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SPACE_QUESTIONS } from '@space/shared';
import { createApp } from '../src/app.js';
import { prisma } from '../src/prisma/client.js';

const app = createApp();
const TEST_EMAIL = `test-dashboard-${Date.now()}@example.com`;
const TEST_PASSWORD = 'TestPassword!123';
let token = '';
let companyId = '';
let campaignId = '';

beforeAll(async () => {
  await prisma.user.create({
    data: {
      name: 'Dashboard Tester',
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
    .send({ name: `Dashboard Co ${Date.now()}` });
  companyId = co.body.id;

  await request(app)
    .post(`/api/companies/${companyId}/teams`)
    .set('authorization', `Bearer ${token}`)
    .send({ name: 'Team A' });

  const camp = await request(app)
    .post(`/api/companies/${companyId}/campaigns`)
    .set('authorization', `Bearer ${token}`)
    .send({ questionnaireId: template.id, title: 'Dashboard Test' });
  campaignId = camp.body.id;
  await request(app)
    .patch(`/api/companies/${companyId}/campaigns/${campaignId}`)
    .set('authorization', `Bearer ${token}`)
    .send({ status: 'ACTIVE' });

  const inv = await request(app)
    .post(`/api/companies/${companyId}/campaigns/${campaignId}/invites`)
    .set('authorization', `Bearer ${token}`)
    .send({ count: 2 });
  const t = inv.body.items[0].uniqueToken;
  await request(app).get(`/api/public/survey/${t}`);
  await request(app)
    .post(`/api/public/survey/${t}/submit`)
    .send({
      answers: SPACE_QUESTIONS.map((q) =>
        q.type === 'OPEN_TEXT'
          ? { questionNumber: q.number, textValue: 'note' }
          : { questionNumber: q.number, rawValue: 4 },
      ),
    });

  await request(app)
    .post(`/api/companies/${companyId}/campaigns/${campaignId}/triangulation/blockers`)
    .set('authorization', `Bearer ${token}`)
    .send({ title: 'DB Blocker', severity: 'P1', reachPercentage: 50, estimatedHoursLost: 4 });
});

afterAll(async () => {
  if (campaignId) {
    await prisma.blocker.deleteMany({ where: { campaignId } });
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

describe('GET /companies/:id/dashboard', () => {
  it('returns aggregated counts, recent campaigns and blockers', async () => {
    const r = await request(app)
      .get(`/api/companies/${companyId}/dashboard`)
      .set('authorization', `Bearer ${token}`);
    expect(r.status).toBe(200);
    expect(r.body.counts.teams).toBeGreaterThanOrEqual(1);
    expect(r.body.counts.campaigns.active).toBeGreaterThanOrEqual(1);
    expect(r.body.counts.invites.total).toBe(2);
    expect(r.body.counts.invites.completed).toBe(1);
    expect(r.body.counts.responseRate).toBe(50);
    expect(r.body.counts.submissions).toBe(1);
    expect(r.body.counts.openBlockers).toBeGreaterThanOrEqual(1);
    expect(r.body.recentCampaigns.some((c: { id: string }) => c.id === campaignId)).toBe(true);
    expect(r.body.recentBlockers.some((b: { title: string }) => b.title === 'DB Blocker')).toBe(
      true,
    );
    expect(r.body.blockerAiFit).toHaveProperty('STRONG_FIT');
    expect(r.body.themes).toHaveProperty('MONITOR');
  });

  it('rejects access from another company admin', async () => {
    // Create a second user belonging to a brand-new company
    const otherEmail = `other-${Date.now()}@example.com`;
    const other = await prisma.company.create({ data: { name: `Other Co ${Date.now()}` } });
    await prisma.user.create({
      data: {
        name: 'Other Admin',
        email: otherEmail,
        role: 'COMPANY_ADMIN',
        companyId: other.id,
        passwordHash: await bcrypt.hash(TEST_PASSWORD, 4),
        status: 'ACTIVE',
      },
    });
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: otherEmail, password: TEST_PASSWORD });
    const otherToken = login.body.accessToken;

    const r = await request(app)
      .get(`/api/companies/${companyId}/dashboard`)
      .set('authorization', `Bearer ${otherToken}`);
    expect(r.status).toBe(403);

    await prisma.user.delete({ where: { email: otherEmail } });
    await prisma.company.delete({ where: { id: other.id } });
  });
});
