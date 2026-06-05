import bcrypt from 'bcryptjs';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SPACE_QUESTIONS } from '@space/shared';
import { createApp } from '../src/app.js';
import { prisma } from '../src/prisma/client.js';

const app = createApp();
const TEST_EMAIL = `test-themes-${Date.now()}@example.com`;
const TEST_PASSWORD = 'TestPassword!123';
let token = '';
let companyId = '';
let campaignId = '';
let answerIds: string[] = [];
let themeId = '';

beforeAll(async () => {
  await prisma.user.create({
    data: {
      name: 'Themes Tester',
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
  const questionnaireId = template.id;

  const co = await request(app)
    .post('/api/companies')
    .set('authorization', `Bearer ${token}`)
    .send({ name: `Themes Co ${Date.now()}` });
  companyId = co.body.id;

  const camp = await request(app)
    .post(`/api/companies/${companyId}/campaigns`)
    .set('authorization', `Bearer ${token}`)
    .send({ questionnaireId, title: 'Themes Test' });
  campaignId = camp.body.id;

  const inv = await request(app)
    .post(`/api/companies/${companyId}/campaigns/${campaignId}/invites`)
    .set('authorization', `Bearer ${token}`)
    .send({ count: 2 });
  const tokens: string[] = inv.body.items.map((i: { uniqueToken: string }) => i.uniqueToken);

  for (const t of tokens) {
    await request(app).get(`/api/public/survey/${t}`);
    const answers = SPACE_QUESTIONS.map((q) =>
      q.type === 'OPEN_TEXT'
        ? { questionNumber: q.number, textValue: `Open answer to Q${q.number}` }
        : { questionNumber: q.number, rawValue: 4 },
    );
    await request(app)
      .post(`/api/public/survey/${t}/submit`)
      .send({ answers });
  }

  const openAnswers = await prisma.answer.findMany({
    where: {
      submission: { campaignId },
      question: { questionType: 'OPEN_TEXT' },
    },
    orderBy: { id: 'asc' },
  });
  answerIds = openAnswers.map((a) => a.id);
});

afterAll(async () => {
  if (campaignId) {
    await prisma.openTextThemeTag.deleteMany({ where: { theme: { campaignId } } });
    await prisma.openTextTheme.deleteMany({ where: { campaignId } });
    await prisma.answer.deleteMany({ where: { submission: { campaignId } } });
    await prisma.submission.deleteMany({ where: { campaignId } });
    await prisma.surveyInvite.deleteMany({ where: { campaignId } });
    await prisma.surveyCampaign.delete({ where: { id: campaignId } }).catch(() => undefined);
  }
  if (companyId) {
    await prisma.company.delete({ where: { id: companyId } }).catch(() => undefined);
  }
  await prisma.user.delete({ where: { email: TEST_EMAIL } }).catch(() => undefined);
  await prisma.$disconnect();
});

describe('themes', () => {
  const base = () => `/api/companies/${companyId}/campaigns/${campaignId}/themes`;

  it('returns 503 for ai-analyze when Foundry is not configured', async () => {
    const r = await request(app)
      .post(`${base()}/ai-analyze`)
      .set('authorization', `Bearer ${token}`)
      .send({ replaceExisting: true });

    expect(r.status).toBe(503);
    expect(r.body.error).toMatch(/Azure Foundry is not configured/i);
  });

  it('creates a theme', async () => {
    const r = await request(app)
      .post(base())
      .set('authorization', `Bearer ${token}`)
      .send({
        themeName: 'Open-ended efficiency blocker',
        description: 'CI takes too long',
        jtbdStatement: 'When I push code, I want fast feedback so I can iterate.',
        status: 'INVESTIGATE',
      });
    expect(r.status).toBe(201);
    themeId = r.body.id;
    expect(r.body.status).toBe('INVESTIGATE');
  });

  it('lists themes', async () => {
    const r = await request(app)
      .get(base())
      .set('authorization', `Bearer ${token}`);
    expect(r.status).toBe(200);
    expect(r.body.items.length).toBe(1);
    expect(r.body.items[0].tagCount).toBe(0);
  });

  it('returns untagged answers (excluding ones tagged to current theme)', async () => {
    const r = await request(app)
      .get(`${base()}/untagged-answers?excludeTaggedBy=${themeId}`)
      .set('authorization', `Bearer ${token}`);
    expect(r.status).toBe(200);
    // 16 open-text questions × 2 respondents = 32 answers, none tagged yet
    expect(r.body.items.length).toBe(32);
  });

  it('tags two answers from different submissions', async () => {
    // Pick two answers with different submission ids
    const distinct = await prisma.answer.findMany({
      where: { id: { in: answerIds } },
      select: { id: true, submissionId: true },
    });
    const seen = new Set<string>();
    const picks: string[] = [];
    for (const a of distinct) {
      if (!seen.has(a.submissionId)) {
        seen.add(a.submissionId);
        picks.push(a.id);
      }
      if (picks.length === 2) break;
    }
    for (const aid of picks) {
      const r = await request(app)
        .post(`${base()}/${themeId}/tags`)
        .set('authorization', `Bearer ${token}`)
        .send({ answerId: aid });
      expect(r.status).toBe(201);
    }

    // Stats: 2 unique respondents / 2 total = 100%
    const r = await request(app)
      .get(base())
      .set('authorization', `Bearer ${token}`);
    const t = r.body.items[0];
    expect(t.respondentCount).toBe(2);
    expect(t.percentage).toBe(100);
    expect(t.tagCount).toBe(2);
  });

  it('lists tagged answers for the theme', async () => {
    const r = await request(app)
      .get(`${base()}/${themeId}/tags`)
      .set('authorization', `Bearer ${token}`);
    expect(r.status).toBe(200);
    expect(r.body.items.length).toBe(2);
  });

  it('removes a tag and recomputes stats', async () => {
    const tags = await prisma.openTextThemeTag.findMany({ where: { themeId } });
    const first = tags[0]!;
    const r = await request(app)
      .delete(`${base()}/${themeId}/tags/${first.answerId}`)
      .set('authorization', `Bearer ${token}`);
    expect(r.status).toBe(204);

    const list = await request(app)
      .get(base())
      .set('authorization', `Bearer ${token}`);
    const t = list.body.items[0];
    expect(t.respondentCount).toBe(1);
    expect(t.percentage).toBe(50);
  });

  it('rejects tagging a non-text answer', async () => {
    const numericAnswer = await prisma.answer.findFirst({
      where: { submission: { campaignId }, textValue: null },
    });
    expect(numericAnswer).toBeTruthy();
    const r = await request(app)
      .post(`${base()}/${themeId}/tags`)
      .set('authorization', `Bearer ${token}`)
      .send({ answerId: numericAnswer!.id });
    // Numeric answers may have textValue=null AND not be open-text type.
    // We still allow lookup but reject empty textValue.
    expect([400, 404]).toContain(r.status);
  });

  it('updates a theme status', async () => {
    const r = await request(app)
      .patch(`${base()}/${themeId}`)
      .set('authorization', `Bearer ${token}`)
      .send({ status: 'PROMOTE' });
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('PROMOTE');
  });

  it('deletes a theme', async () => {
    const r = await request(app)
      .delete(`${base()}/${themeId}`)
      .set('authorization', `Bearer ${token}`);
    expect(r.status).toBe(204);
    const list = await request(app)
      .get(base())
      .set('authorization', `Bearer ${token}`);
    expect(list.body.items.length).toBe(0);
  });
});
