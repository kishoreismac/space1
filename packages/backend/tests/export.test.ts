import bcrypt from 'bcryptjs';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SPACE_QUESTIONS } from '@space/shared';
import { createApp } from '../src/app.js';
import { prisma } from '../src/prisma/client.js';

const app = createApp();
const TEST_EMAIL = `test-export-${Date.now()}@example.com`;
const TEST_PASSWORD = 'TestPassword!123';
let token = '';
let companyId = '';
let campaignId = '';

beforeAll(async () => {
  await prisma.user.create({
    data: {
      name: 'Export Tester',
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
    .send({ name: `Export Co ${Date.now()}` });
  companyId = co.body.id;

  const camp = await request(app)
    .post(`/api/companies/${companyId}/campaigns`)
    .set('authorization', `Bearer ${token}`)
    .send({ questionnaireId: template.id, title: 'Export Test' });
  campaignId = camp.body.id;

  const inv = await request(app)
    .post(`/api/companies/${companyId}/campaigns/${campaignId}/invites`)
    .set('authorization', `Bearer ${token}`)
    .send({ count: 1 });
  const t = inv.body.items[0].uniqueToken;
  await request(app).get(`/api/public/survey/${t}`);
  await request(app)
    .post(`/api/public/survey/${t}/submit`)
    .send({
      answers: SPACE_QUESTIONS.map((q) =>
        q.type === 'OPEN_TEXT'
          ? { questionNumber: q.number, textValue: `Text, with "quote"` }
          : { questionNumber: q.number, rawValue: 4 },
      ),
    });

  await request(app)
    .post(`/api/companies/${companyId}/campaigns/${campaignId}/themes`)
    .set('authorization', `Bearer ${token}`)
    .send({ themeName: 'Theme A', jtbdStatement: 'JTBD' });
  await request(app)
    .post(`/api/companies/${companyId}/campaigns/${campaignId}/triangulation/blockers`)
    .set('authorization', `Bearer ${token}`)
    .send({ title: 'Block 1', severity: 'P1', reachPercentage: 50, estimatedHoursLost: 4 });
});

afterAll(async () => {
  if (campaignId) {
    await prisma.openTextThemeTag.deleteMany({ where: { theme: { campaignId } } });
    await prisma.openTextTheme.deleteMany({ where: { campaignId } });
    await prisma.blocker.deleteMany({ where: { campaignId } });
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

describe('CSV exports', () => {
  it('answers.csv has header + one row per answer, escapes quotes', async () => {
    const r = await request(app)
      .get(`/api/companies/${companyId}/campaigns/${campaignId}/export/answers.csv`)
      .set('authorization', `Bearer ${token}`);
    expect(r.status).toBe(200);
    expect(r.header['content-type']).toContain('text/csv');
    expect(r.header['content-disposition']).toContain('attachment');
    const lines = r.text.trimEnd().split('\r\n');
    expect(lines[0]).toBe('submissionId,submittedAt,teamId,roleLabel,qNum,qType,qText,numericValue,textValue');
    expect(lines.length).toBe(1 + SPACE_QUESTIONS.length);
    // Quote escaping on open-text answers
    expect(r.text).toMatch(/"Text, with ""quote"""/);
  });

  it('blockers.csv contains the seeded blocker', async () => {
    const r = await request(app)
      .get(`/api/companies/${companyId}/campaigns/${campaignId}/export/blockers.csv`)
      .set('authorization', `Bearer ${token}`);
    expect(r.status).toBe(200);
    expect(r.text).toContain('Block 1');
    expect(r.text).toContain('P1');
  });

  it('themes.csv contains the seeded theme', async () => {
    const r = await request(app)
      .get(`/api/companies/${companyId}/campaigns/${campaignId}/export/themes.csv`)
      .set('authorization', `Bearer ${token}`);
    expect(r.status).toBe(200);
    expect(r.text).toContain('Theme A');
    expect(r.text).toContain('JTBD');
  });
});
