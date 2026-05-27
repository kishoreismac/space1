import bcrypt from 'bcryptjs';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/prisma/client.js';

const app = createApp();
const TEST_EMAIL = `test-admin-${Date.now()}@example.com`;
const TEST_PASSWORD = 'TestPassword!123';
let accessToken = '';
let createdCompanyId = '';

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
});

afterAll(async () => {
  // Best-effort cleanup
  if (createdCompanyId) {
    await prisma.team.deleteMany({ where: { companyId: createdCompanyId } });
    await prisma.company.delete({ where: { id: createdCompanyId } }).catch(() => undefined);
  }
  await prisma.user.delete({ where: { email: TEST_EMAIL } }).catch(() => undefined);
  await prisma.$disconnect();
});

describe('auth', () => {
  it('rejects wrong password', async () => {
    const r = await request(app)
      .post('/api/auth/login')
      .send({ email: TEST_EMAIL, password: 'wrong' });
    expect(r.status).toBe(401);
  });

  it('logs in with correct credentials', async () => {
    const r = await request(app)
      .post('/api/auth/login')
      .send({ email: TEST_EMAIL, password: TEST_PASSWORD });
    expect(r.status).toBe(200);
    expect(r.body.accessToken).toBeTruthy();
    expect(r.body.user.role).toBe('SUPER_ADMIN');
    accessToken = r.body.accessToken;
  });

  it('GET /api/auth/me with bearer returns user', async () => {
    const r = await request(app)
      .get('/api/auth/me')
      .set('authorization', `Bearer ${accessToken}`);
    expect(r.status).toBe(200);
    expect(r.body.user.email).toBe(TEST_EMAIL);
  });

  it('GET /api/auth/me without bearer is 401', async () => {
    const r = await request(app).get('/api/auth/me');
    expect(r.status).toBe(401);
  });
});

describe('companies + teams CRUD', () => {
  it('rejects unauthenticated list', async () => {
    const r = await request(app).get('/api/companies');
    expect(r.status).toBe(401);
  });

  it('creates a company', async () => {
    const r = await request(app)
      .post('/api/companies')
      .set('authorization', `Bearer ${accessToken}`)
      .send({ name: `Test Co ${Date.now()}`, industry: 'Tech' });
    expect(r.status).toBe(201);
    expect(r.body.id).toBeTruthy();
    expect(r.body.status).toBe('ACTIVE');
    createdCompanyId = r.body.id;
  });

  it('lists companies (super admin sees all)', async () => {
    const r = await request(app)
      .get('/api/companies')
      .set('authorization', `Bearer ${accessToken}`);
    expect(r.status).toBe(200);
    expect(r.body.items.some((c: { id: string }) => c.id === createdCompanyId)).toBe(true);
  });

  it('updates a company', async () => {
    const r = await request(app)
      .patch(`/api/companies/${createdCompanyId}`)
      .set('authorization', `Bearer ${accessToken}`)
      .send({ industry: 'Software' });
    expect(r.status).toBe(200);
    expect(r.body.industry).toBe('Software');
  });

  it('creates and lists a team', async () => {
    const create = await request(app)
      .post(`/api/companies/${createdCompanyId}/teams`)
      .set('authorization', `Bearer ${accessToken}`)
      .send({ name: 'Platform', managerName: 'Alice' });
    expect(create.status).toBe(201);

    const list = await request(app)
      .get(`/api/companies/${createdCompanyId}/teams`)
      .set('authorization', `Bearer ${accessToken}`);
    expect(list.status).toBe(200);
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0].name).toBe('Platform');
  });

  it('rejects invalid company body', async () => {
    const r = await request(app)
      .post('/api/companies')
      .set('authorization', `Bearer ${accessToken}`)
      .send({});
    expect(r.status).toBe(400);
  });

  it('archives a company on DELETE', async () => {
    const r = await request(app)
      .delete(`/api/companies/${createdCompanyId}`)
      .set('authorization', `Bearer ${accessToken}`);
    expect(r.status).toBe(204);
    const after = await prisma.company.findUnique({ where: { id: createdCompanyId } });
    expect(after?.status).toBe('ARCHIVED');
  });
});
