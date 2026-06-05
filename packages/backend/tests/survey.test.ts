import bcrypt from 'bcryptjs';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { REVERSE_QUESTION_NUMBERS, SPACE_QUESTIONS } from '@space/shared';
import { createApp } from '../src/app.js';
import { prisma } from '../src/prisma/client.js';

const app = createApp();
const TEST_EMAIL = `test-survey-${Date.now()}@example.com`;
const TEST_PASSWORD = 'TestPassword!123';
let accessToken = '';
let companyId = '';
let questionnaireId = '';
let campaignId = '';
let inviteToken = '';
let inviteId = '';

beforeAll(async () => {
  await prisma.user.create({
    data: {
      name: 'Test Admin',
      email: TEST_EMAIL,
      role: 'SUPER_ADMIN',
      passwordHash: await bcrypt.hash(TEST_PASSWORD, 4),
      status: 'ACTIVE',
    },
  });
  const login = await request(app)
    .post('/api/auth/login')
    .send({ email: TEST_EMAIL, password: TEST_PASSWORD });
  accessToken = login.body.accessToken;

  // Use the canonical SPACE-50 global template seeded by `npm run seed`.
  const template = await prisma.questionnaire.findFirst({
    where: { companyId: null, title: { contains: 'SPACE 50' } },
  });
  if (!template) throw new Error('SPACE-50 template missing; run `npm run seed` first');
  questionnaireId = template.id;
});

afterAll(async () => {
  if (campaignId) {
    await prisma.answer.deleteMany({ where: { submission: { campaignId } } });
    await prisma.submission.deleteMany({ where: { campaignId } });
    await prisma.surveyInvite.deleteMany({ where: { campaignId } });
    await prisma.surveyCampaign.delete({ where: { id: campaignId } }).catch(() => undefined);
  }
  if (companyId) {
    await prisma.team.deleteMany({ where: { companyId } });
    await prisma.company.delete({ where: { id: companyId } }).catch(() => undefined);
  }
  await prisma.user.delete({ where: { email: TEST_EMAIL } }).catch(() => undefined);
  await prisma.$disconnect();
});

describe('questionnaires read', () => {
  it('lists questionnaires for authenticated user', async () => {
    const r = await request(app)
      .get('/api/questionnaires')
      .set('authorization', `Bearer ${accessToken}`);
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body.items)).toBe(true);
    expect(r.body.items.some((q: { id: string }) => q.id === questionnaireId)).toBe(true);
  });

  it('returns 51 questions with dimensionCode', async () => {
    const r = await request(app)
      .get(`/api/questionnaires/${questionnaireId}`)
      .set('authorization', `Bearer ${accessToken}`);
    expect(r.status).toBe(200);
    expect(r.body.questions).toHaveLength(51);
    expect(r.body.questions[0].dimensionCode).toBeTruthy();
  });
});

describe('campaigns + invites', () => {
  it('creates a company for the campaign', async () => {
    const r = await request(app)
      .post('/api/companies')
      .set('authorization', `Bearer ${accessToken}`)
      .send({ name: `Survey Co ${Date.now()}` });
    expect(r.status).toBe(201);
    companyId = r.body.id;
  });

  it('creates a campaign', async () => {
    const r = await request(app)
      .post(`/api/companies/${companyId}/campaigns`)
      .set('authorization', `Bearer ${accessToken}`)
      .send({ questionnaireId, title: 'Q1 Pulse' });
    expect(r.status).toBe(201);
    expect(r.body.status).toBe('DRAFT');
    campaignId = r.body.id;
  });

  it('rejects campaign creation for unknown questionnaire', async () => {
    const r = await request(app)
      .post(`/api/companies/${companyId}/campaigns`)
      .set('authorization', `Bearer ${accessToken}`)
      .send({ questionnaireId: 'does-not-exist', title: 'Bad' });
    expect(r.status).toBe(404);
  });

  it('generates 2 anonymous invites and activates the campaign', async () => {
    const r = await request(app)
      .post(`/api/companies/${companyId}/campaigns/${campaignId}/invites`)
      .set('authorization', `Bearer ${accessToken}`)
      .send({ count: 2 });
    expect(r.status).toBe(201);
    expect(r.body.items).toHaveLength(2);
    inviteToken = r.body.items[0].uniqueToken;
    inviteId = r.body.items[0].id;

    const c = await prisma.surveyCampaign.findUnique({ where: { id: campaignId } });
    expect(c?.status).toBe('ACTIVE');
  });

  it('lists invites for the campaign', async () => {
    const r = await request(app)
      .get(`/api/companies/${companyId}/campaigns/${campaignId}/invites`)
      .set('authorization', `Bearer ${accessToken}`);
    expect(r.status).toBe(200);
    expect(r.body.items.length).toBeGreaterThanOrEqual(2);
  });
});

describe('public survey flow', () => {
  it('GET /api/public/survey/:token returns context and marks invite STARTED', async () => {
    const r = await request(app).get(`/api/public/survey/${inviteToken}`);
    expect(r.status).toBe(200);
    expect(r.body.questionnaire.questions).toHaveLength(51);
    expect(r.body.invite.status).toBe('STARTED');
  });

  it('rejects submit with missing required answers', async () => {
    const r = await request(app)
      .post(`/api/public/survey/${inviteToken}/submit`)
      .send({ answers: [{ questionNumber: 1, rawValue: 4 }] });
    expect(r.status).toBe(400);
  });

  it('accepts a full submission and applies reverse scoring', async () => {
    const answers = SPACE_QUESTIONS.map((q) => {
      if (q.type === 'OPEN_TEXT') {
        return { questionNumber: q.number, textValue: `Answer to Q${q.number}` };
      }
      return { questionNumber: q.number, rawValue: 4 };
    });
    const r = await request(app)
      .post(`/api/public/survey/${inviteToken}/submit`)
      .send({
        roleLabel: 'Engineer',
        yearsAtCompany: '1-3',
        primaryTechnology: 'TypeScript',
        answers,
      });
    expect(r.status).toBe(201);
    expect(r.body.submissionId).toBeTruthy();

    // Verify reverse scoring on a known reverse-scored question (e.g. Q3)
    const reverseQNumber = REVERSE_QUESTION_NUMBERS[0];
    const submission = await prisma.submission.findFirst({
      where: { campaignId, status: 'COMPLETED' },
      include: { answers: { include: { question: true } } },
    });
    expect(submission).toBeTruthy();
    const reverseAnswer = submission!.answers.find(
      (a) => a.question.questionNumber === reverseQNumber,
    );
    expect(reverseAnswer?.numericValue).toBe(4);
    expect(reverseAnswer?.scoredValue).toBe(2); // 6 - 4 = 2

    const normalAnswer = submission!.answers.find((a) => a.question.questionNumber === 1);
    expect(normalAnswer?.numericValue).toBe(4);
    expect(normalAnswer?.scoredValue).toBe(4);

    // Invite is COMPLETED
    const invite = await prisma.surveyInvite.findUnique({ where: { id: inviteId } });
    expect(invite?.status).toBe('COMPLETED');
  });

  it('rejects re-submission on a completed invite', async () => {
    const r = await request(app)
      .post(`/api/public/survey/${inviteToken}/submit`)
      .send({ answers: [{ questionNumber: 1, rawValue: 3 }] });
    expect(r.status).toBe(409);
  });
});
