import bcrypt from 'bcryptjs';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/prisma/client.js';

const app = createApp();
const EMAIL = `test-qcrud-${Date.now()}@example.com`;
const PASSWORD = 'TestPassword!123';
let accessToken = '';
let questionnaireId = '';
let createdQuestionId = '';

beforeAll(async () => {
  await prisma.user.create({
    data: {
      name: 'Q CRUD Admin',
      email: EMAIL,
      role: 'SUPER_ADMIN',
      passwordHash: await bcrypt.hash(PASSWORD, 4),
      status: 'ACTIVE',
    },
  });
  const login = await request(app)
    .post('/api/auth/login')
    .send({ email: EMAIL, password: PASSWORD });
  accessToken = login.body.accessToken;

  // Use a fresh dedicated questionnaire so deletes don't disrupt the global template.
  const template = await prisma.questionnaire.findFirst({
    where: { companyId: null, title: { contains: 'SPACE 50' } },
    include: { dimensions: true, questions: true },
  });
  if (!template) throw new Error('SPACE-50 template missing; run `npm run seed` first');

  const clone = await prisma.questionnaire.create({
    data: {
      title: `Q-CRUD Test ${Date.now()}`,
      description: 'CRUD test questionnaire',
      version: 1,
      status: 'ACTIVE',
      estimatedMinutes: 5,
      isAnonymous: true,
    },
  });
  questionnaireId = clone.id;
  // Clone dimensions S/P only — enough for tests
  for (const d of template.dimensions.filter((x) => ['S', 'P'].includes(x.code))) {
    await prisma.questionDimension.create({
      data: {
        questionnaireId: clone.id,
        code: d.code,
        name: d.name,
        description: d.description,
        displayOrder: d.displayOrder,
        color: d.color,
      },
    });
  }
});

afterAll(async () => {
  await prisma.question.deleteMany({ where: { questionnaireId } });
  await prisma.questionDimension.deleteMany({ where: { questionnaireId } });
  await prisma.questionnaire
    .delete({ where: { id: questionnaireId } })
    .catch(() => undefined);
  await prisma.user.delete({ where: { email: EMAIL } }).catch(() => undefined);
  await prisma.$disconnect();
});

describe('question CRUD', () => {
  it('creates a new question and auto-assigns a question number', async () => {
    const r = await request(app)
      .post(`/api/questionnaires/${questionnaireId}/questions`)
      .set('authorization', `Bearer ${accessToken}`)
      .send({
        dimensionCode: 'S',
        questionText: 'Are you happy with your tools?',
        questionType: 'LIKERT',
        blockerSignal: 'Tooling friction',
        isReverseScored: false,
        lowLabel: 'Not at all',
        highLabel: 'Very happy',
      });
    expect(r.status).toBe(201);
    expect(r.body.id).toBeTruthy();
    expect(r.body.questionNumber).toBe(1);
    expect(r.body.minScale).toBe(1);
    expect(r.body.maxScale).toBe(5);
    createdQuestionId = r.body.id;
  });

  it('rejects duplicate question numbers', async () => {
    const r = await request(app)
      .post(`/api/questionnaires/${questionnaireId}/questions`)
      .set('authorization', `Bearer ${accessToken}`)
      .send({
        dimensionCode: 'S',
        questionNumber: 1,
        questionText: 'Duplicate',
      });
    expect(r.status).toBe(409);
  });

  it('updates a question text and dimension', async () => {
    const r = await request(app)
      .patch(`/api/questionnaires/${questionnaireId}/questions/${createdQuestionId}`)
      .set('authorization', `Bearer ${accessToken}`)
      .send({
        questionText: 'Updated text',
        dimensionCode: 'P',
        isReverseScored: true,
      });
    expect(r.status).toBe(200);
    expect(r.body.questionText).toBe('Updated text');
    expect(r.body.isReverseScored).toBe(true);
  });

  it('rejects unknown dimension', async () => {
    const r = await request(app)
      .patch(`/api/questionnaires/${questionnaireId}/questions/${createdQuestionId}`)
      .set('authorization', `Bearer ${accessToken}`)
      .send({ dimensionCode: 'ZZ' });
    expect(r.status).toBe(400);
  });

  it('returns the new question in the questionnaire detail', async () => {
    const r = await request(app)
      .get(`/api/questionnaires/${questionnaireId}`)
      .set('authorization', `Bearer ${accessToken}`);
    expect(r.status).toBe(200);
    expect(r.body.questions.find((q: { id: string }) => q.id === createdQuestionId)).toBeTruthy();
  });

  it('deletes the question', async () => {
    const r = await request(app)
      .delete(`/api/questionnaires/${questionnaireId}/questions/${createdQuestionId}`)
      .set('authorization', `Bearer ${accessToken}`);
    expect(r.status).toBe(204);

    const verify = await prisma.question.findUnique({ where: { id: createdQuestionId } });
    expect(verify).toBeNull();
  });
});
