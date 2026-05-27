import bcrypt from 'bcryptjs';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { classifyComposite, computeCompositeScore } from '@space/shared';
import { createApp } from '../src/app.js';
import { prisma } from '../src/prisma/client.js';

const app = createApp();
const TEST_EMAIL = `test-feasibility-${Date.now()}@example.com`;
const TEST_PASSWORD = 'TestPassword!123';
let token = '';
let companyId = '';
let campaignId = '';
let strongBlockerId = '';
let weakBlockerId = '';
let unscoredBlockerId = '';

beforeAll(async () => {
  await prisma.user.create({
    data: {
      name: 'Feasibility Tester',
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
    .send({ name: `Feasibility Co ${Date.now()}` });
  companyId = co.body.id;

  const camp = await request(app)
    .post(`/api/companies/${companyId}/campaigns`)
    .set('authorization', `Bearer ${token}`)
    .send({ questionnaireId: template.id, title: 'Feasibility Test' });
  campaignId = camp.body.id;

  // Seed 3 blockers
  const tBase = `/api/companies/${companyId}/campaigns/${campaignId}/triangulation`;
  const a = await request(app)
    .post(`${tBase}/blockers`)
    .set('authorization', `Bearer ${token}`)
    .send({ title: 'Strong AI candidate', severity: 'P1', reachPercentage: 80, estimatedHoursLost: 24 });
  strongBlockerId = a.body.id;
  const b = await request(app)
    .post(`${tBase}/blockers`)
    .set('authorization', `Bearer ${token}`)
    .send({ title: 'Weak candidate', severity: 'P3', reachPercentage: 20, estimatedHoursLost: 2 });
  weakBlockerId = b.body.id;
  const c = await request(app)
    .post(`${tBase}/blockers`)
    .set('authorization', `Bearer ${token}`)
    .send({ title: 'Unscored', severity: 'P2', reachPercentage: 40, estimatedHoursLost: 6 });
  unscoredBlockerId = c.body.id;
});

afterAll(async () => {
  if (campaignId) {
    await prisma.aIFeasibilityScore.deleteMany({
      where: { blocker: { campaignId } },
    });
    await prisma.blocker.deleteMany({ where: { campaignId } });
  }
  if (companyId) {
    await prisma.surveyCampaign.deleteMany({ where: { companyId } });
    await prisma.company.delete({ where: { id: companyId } });
  }
  await prisma.user.deleteMany({ where: { email: TEST_EMAIL } });
});

const base = () =>
  `/api/companies/${companyId}/campaigns/${campaignId}/feasibility`;

describe('AI feasibility scoring', () => {
  it('computes composite and classifies STRONG_FIT', () => {
    const score = computeCompositeScore({
      toolMaturityScore: 4.5,
      integrationEaseScore: 4.0,
      costEfficiencyScore: 4.0,
      dataAvailabilityScore: 4.0,
      developerAdoptionScore: 4.0,
    });
    expect(score).toBeGreaterThanOrEqual(4.0);
    expect(classifyComposite(score)).toBe('STRONG_FIT');
  });

  it('classifies NOT_FIT for very low composites', () => {
    expect(classifyComposite(1.5)).toBe('NOT_FIT');
    expect(classifyComposite(2.5)).toBe('INVESTIGATE');
    expect(classifyComposite(3.5)).toBe('CANDIDATE');
  });

  it('upserts STRONG_FIT feasibility on the strong blocker', async () => {
    const res = await request(app)
      .put(`${base()}/blockers/${strongBlockerId}/feasibility`)
      .set('authorization', `Bearer ${token}`)
      .send({
        toolMaturityScore: 4.5,
        integrationEaseScore: 4.0,
        costEfficiencyScore: 4.0,
        dataAvailabilityScore: 4.5,
        developerAdoptionScore: 4.0,
        notes: 'Mature copilot tooling available.',
      });
    expect(res.status).toBe(200);
    expect(res.body.classification).toBe('STRONG_FIT');
    expect(res.body.weightedCompositeScore).toBeGreaterThanOrEqual(4.0);

    // Mirrored on blocker
    const blocker = await prisma.blocker.findUnique({ where: { id: strongBlockerId } });
    expect(blocker?.aiFit).toBe('STRONG_FIT');
  });

  it('upserts NOT_FIT feasibility on the weak blocker', async () => {
    const res = await request(app)
      .put(`${base()}/blockers/${weakBlockerId}/feasibility`)
      .set('authorization', `Bearer ${token}`)
      .send({
        toolMaturityScore: 1.0,
        integrationEaseScore: 1.0,
        costEfficiencyScore: 1.5,
        dataAvailabilityScore: 1.0,
        developerAdoptionScore: 1.0,
      });
    expect(res.status).toBe(200);
    expect(res.body.classification).toBe('NOT_FIT');
  });

  it('GET returns null when no feasibility scored', async () => {
    const res = await request(app)
      .get(`${base()}/blockers/${unscoredBlockerId}/feasibility`)
      .set('authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toBeNull();
  });

  it('rejects out-of-range score', async () => {
    const res = await request(app)
      .put(`${base()}/blockers/${strongBlockerId}/feasibility`)
      .set('authorization', `Bearer ${token}`)
      .send({
        toolMaturityScore: 7,
        integrationEaseScore: 4,
        costEfficiencyScore: 4,
        dataAvailabilityScore: 4,
        developerAdoptionScore: 4,
      });
    expect(res.status).toBe(400);
  });

  it('returns roadmap with now/next/later buckets', async () => {
    const res = await request(app)
      .get(`${base()}/roadmap`)
      .set('authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    // Strong blocker is STRONG_FIT → Now
    expect(res.body.now.map((r: { blockerId: string }) => r.blockerId)).toContain(
      strongBlockerId,
    );
    // Weak blocker is NOT_FIT → excluded
    expect(res.body.excluded.map((r: { blockerId: string }) => r.blockerId)).toContain(
      weakBlockerId,
    );
    // Unscored ends up in next (feasibilityClass === null, priorityScore === 0)
    expect(
      [...res.body.next, ...res.body.later].map((r: { blockerId: string }) => r.blockerId),
    ).toContain(unscoredBlockerId);
    expect(res.body.summary.total).toBe(3);
    expect(res.body.summary.scored).toBe(2);
    expect(res.body.summary.unscored).toBe(1);
  });

  it('roadmap priority is impact × feasibility', async () => {
    const res = await request(app)
      .get(`${base()}/roadmap`)
      .set('authorization', `Bearer ${token}`);
    const strong = res.body.now.find(
      (r: { blockerId: string }) => r.blockerId === strongBlockerId,
    );
    expect(strong.impactScore).toBeGreaterThan(0);
    expect(strong.feasibilityScore).toBeGreaterThanOrEqual(4.0);
    expect(strong.priorityScore).toBeCloseTo(
      Math.round(strong.impactScore * strong.feasibilityScore * 100) / 100,
      2,
    );
  });

  it('deletes feasibility', async () => {
    const res = await request(app)
      .delete(`${base()}/blockers/${strongBlockerId}/feasibility`)
      .set('authorization', `Bearer ${token}`);
    expect(res.status).toBe(204);
    const after = await request(app)
      .get(`${base()}/blockers/${strongBlockerId}/feasibility`)
      .set('authorization', `Bearer ${token}`);
    expect(after.body).toBeNull();
  });
});
