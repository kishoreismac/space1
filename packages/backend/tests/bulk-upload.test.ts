import bcrypt from 'bcryptjs';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/prisma/client.js';

const app = createApp();
const EMAIL = `test-bulk-${Date.now()}@example.com`;
const PASSWORD = 'TestPassword!123';
let accessToken = '';
let companyId = '';
let campaignId = '';
let questionnaireId = '';

beforeAll(async () => {
  await prisma.user.create({
    data: {
      name: 'Bulk Admin',
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

  const template = await prisma.questionnaire.findFirst({
    where: { companyId: null, title: { contains: 'SPACE 50' } },
  });
  if (!template) throw new Error('SPACE-50 template missing');
  questionnaireId = template.id;

  const co = await request(app)
    .post('/api/companies')
    .set('authorization', `Bearer ${accessToken}`)
    .send({ name: `Bulk Co ${Date.now()}` });
  companyId = co.body.id;

  const cmp = await request(app)
    .post(`/api/companies/${companyId}/campaigns`)
    .set('authorization', `Bearer ${accessToken}`)
    .send({ questionnaireId, title: 'Bulk Pulse', cycle: 'Q2-2025' });
  campaignId = cmp.body.id;
});

afterAll(async () => {
  if (campaignId) {
    await prisma.answer.deleteMany({ where: { submission: { campaignId } } });
    await prisma.submission.deleteMany({ where: { campaignId } });
    await prisma.surveyCampaign.delete({ where: { id: campaignId } }).catch(() => undefined);
  }
  if (companyId) {
    await prisma.company.delete({ where: { id: companyId } }).catch(() => undefined);
  }
  await prisma.user.delete({ where: { email: EMAIL } }).catch(() => undefined);
  await prisma.$disconnect();
});

describe('bulk results upload', () => {
  it('parses CSV with team/role + Q1..Q5 columns', async () => {
    const csv = [
      'team,role,name,Q1,Q2,Q3,Q11,Q21,Q31,Q41,Q10',
      ',Engineer,Anon1,5,4,2,5,4,3,2,"Tools are slow"',
      ',Engineer,Anon2,4,5,1,4,3,2,2,',
      ',Senior Engineer,Anon3,3,3,3,3,3,3,3,',
    ].join('\n');
    const r = await request(app)
      .post(`/api/companies/${companyId}/campaigns/${campaignId}/upload/bulk`)
      .set('authorization', `Bearer ${accessToken}`)
      .send({ csv });
    expect(r.status).toBe(201);
    expect(r.body.created).toBe(3);
    expect(r.body.answerCount).toBeGreaterThan(0);

    // Verify text answer was stored for Q10 (OPEN_TEXT)
    const subs = await prisma.submission.findMany({
      where: { campaignId },
      include: { answers: { include: { question: true } } },
    });
    expect(subs.length).toBe(3);
    const q10ans = subs[0]!.answers.find((a) => a.question.questionNumber === 10);
    expect(q10ans?.textValue).toBe('Tools are slow');
  });

  it('accepts JSON rows with answers map', async () => {
    const r = await request(app)
      .post(`/api/companies/${companyId}/campaigns/${campaignId}/upload/bulk`)
      .set('authorization', `Bearer ${accessToken}`)
      .send({
        rows: [
          {
            role: 'Tech Lead',
            answers: { '1': 4, '2': 3, '3': 2 },
          },
          {
            role: 'Engineer',
            answers: { '1': 5, '2': 5, '3': 1 },
          },
        ],
      });
    expect(r.status).toBe(201);
    expect(r.body.created).toBe(2);
  });

  it('imports long-format CSV downloaded from the survey page', async () => {
    const csv = [
      'participantName,teamId,teamName,roleLabel,yearsAtCompany,primaryTechnology,company,campaign,cycle,questionNumber,questionText,dimensionCode,questionType,rawValue,textValue',
      'Taylor Demo,,Platform,Senior Engineer,3-5,TypeScript,Demo Co,Bulk Pulse,Q2-2025,1,Question 1,S,LIKERT,4,',
      'Taylor Demo,,Platform,Senior Engineer,3-5,TypeScript,Demo Co,Bulk Pulse,Q2-2025,2,Question 2,S,LIKERT,3,',
      'Taylor Demo,,Platform,Senior Engineer,3-5,TypeScript,Demo Co,Bulk Pulse,Q2-2025,10,Open question,S,OPEN_TEXT,,Build pipelines are slow',
    ].join('\n');

    const r = await request(app)
      .post(`/api/companies/${companyId}/campaigns/${campaignId}/upload/bulk`)
      .set('authorization', `Bearer ${accessToken}`)
      .send({ csv });

    expect(r.status).toBe(201);
    expect(r.body.created).toBe(1);
    expect(r.body.answerCount).toBe(3);

    const imported = await prisma.submission.findFirst({
      where: { campaignId, roleLabel: 'Senior Engineer', primaryTechnology: 'TypeScript' },
      include: { answers: { include: { question: true } } },
      orderBy: { createdAt: 'desc' },
    });
    expect(imported).toBeTruthy();
    expect(imported?.yearsAtCompany).toBe('3-5');
    expect(imported?.answers.find((a) => a.question.questionNumber === 10)?.textValue)
      .toBe('Build pipelines are slow');
  });

  it('rejects empty rows', async () => {
    const r = await request(app)
      .post(`/api/companies/${companyId}/campaigns/${campaignId}/upload/bulk`)
      .set('authorization', `Bearer ${accessToken}`)
      .send({ rows: [] });
    expect(r.status).toBe(422);
  });
});

describe('manual dimension entry', () => {
  it('synthesises submissions from manual S/P/A/C/E averages', async () => {
    const r = await request(app)
      .post(`/api/companies/${companyId}/campaigns/${campaignId}/upload/manual`)
      .set('authorization', `Bearer ${accessToken}`)
      .send({ S: 2.4, P: 3.1, A: 3.8, C: 2.6, E: 2.2, respondents: 5, label: 'Demo input' });
    expect(r.status).toBe(201);
    expect(r.body.created).toBe(5);

    // Verify results endpoint now reports dimensions
    const overview = await request(app)
      .get(`/api/companies/${companyId}/campaigns/${campaignId}/results`)
      .set('authorization', `Bearer ${accessToken}`);
    expect(overview.status).toBe(200);
    const sDim = overview.body.dimensions.find((d: { code: string }) => d.code === 'S');
    expect(sDim).toBeTruthy();
    expect(sDim.averageScore).toBeGreaterThan(0);
    expect(sDim.averageScore).toBeLessThanOrEqual(5);
  });

  it('re-running manual entry replaces previous synthetic rows', async () => {
    const r = await request(app)
      .post(`/api/companies/${companyId}/campaigns/${campaignId}/upload/manual`)
      .set('authorization', `Bearer ${accessToken}`)
      .send({ S: 4, P: 4, A: 4, C: 4, E: 4, respondents: 3 });
    expect(r.status).toBe(201);
    expect(r.body.created).toBe(3);

    const synth = await prisma.submission.count({
      where: { campaignId, anonymousParticipantKey: { startsWith: 'manual-' } },
    });
    expect(synth).toBe(3);
  });
});
