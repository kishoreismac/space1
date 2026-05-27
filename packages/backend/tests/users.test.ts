import bcrypt from 'bcryptjs';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/prisma/client.js';

const app = createApp();
const SUPER = `users-super-${Date.now()}@example.com`;
const ADMIN = `users-admin-${Date.now()}@example.com`;
const OTHER_ADMIN = `users-other-${Date.now()}@example.com`;
const PW = 'TestPassword!123';
let superToken = '';
let adminToken = '';
let otherToken = '';
let companyA = '';
let companyB = '';
let createdId = '';

beforeAll(async () => {
  await prisma.user.create({
    data: {
      name: 'Super',
      email: SUPER,
      role: 'SUPER_ADMIN',
      passwordHash: await bcrypt.hash(PW, 4),
      status: 'ACTIVE',
    },
  });
  superToken = (
    await request(app).post('/api/auth/login').send({ email: SUPER, password: PW })
  ).body.accessToken;

  const a = await request(app)
    .post('/api/companies')
    .set('authorization', `Bearer ${superToken}`)
    .send({ name: `Users Co A ${Date.now()}` });
  companyA = a.body.id;
  const b = await request(app)
    .post('/api/companies')
    .set('authorization', `Bearer ${superToken}`)
    .send({ name: `Users Co B ${Date.now()}` });
  companyB = b.body.id;

  await prisma.user.create({
    data: {
      name: 'Admin A',
      email: ADMIN,
      role: 'COMPANY_ADMIN',
      companyId: companyA,
      passwordHash: await bcrypt.hash(PW, 4),
      status: 'ACTIVE',
    },
  });
  adminToken = (
    await request(app).post('/api/auth/login').send({ email: ADMIN, password: PW })
  ).body.accessToken;

  await prisma.user.create({
    data: {
      name: 'Admin B',
      email: OTHER_ADMIN,
      role: 'COMPANY_ADMIN',
      companyId: companyB,
      passwordHash: await bcrypt.hash(PW, 4),
      status: 'ACTIVE',
    },
  });
  otherToken = (
    await request(app).post('/api/auth/login').send({ email: OTHER_ADMIN, password: PW })
  ).body.accessToken;
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { companyId: { in: [companyA, companyB] } } });
  await prisma.user.deleteMany({ where: { email: { in: [SUPER, ADMIN, OTHER_ADMIN] } } });
  if (companyA) await prisma.company.delete({ where: { id: companyA } }).catch(() => undefined);
  if (companyB) await prisma.company.delete({ where: { id: companyB } }).catch(() => undefined);
  await prisma.$disconnect();
});

describe('User management', () => {
  it('super-admin lists all users', async () => {
    const r = await request(app).get('/api/users').set('authorization', `Bearer ${superToken}`);
    expect(r.status).toBe(200);
    expect(r.body.items.length).toBeGreaterThanOrEqual(3);
  });

  it('company-admin sees only same-company users', async () => {
    const r = await request(app).get('/api/users').set('authorization', `Bearer ${adminToken}`);
    expect(r.status).toBe(200);
    for (const u of r.body.items) expect(u.companyId).toBe(companyA);
  });

  it('company-admin can create ANALYST in own company', async () => {
    const r = await request(app)
      .post('/api/users')
      .set('authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Analyst One',
        email: `analyst-${Date.now()}@example.com`,
        role: 'ANALYST',
        password: 'AnotherPass!1',
      });
    expect(r.status).toBe(201);
    expect(r.body.companyId).toBe(companyA);
    createdId = r.body.id;
  });

  it('company-admin cannot create SUPER_ADMIN', async () => {
    const r = await request(app)
      .post('/api/users')
      .set('authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Bad',
        email: `bad-${Date.now()}@example.com`,
        role: 'SUPER_ADMIN',
        password: 'AnotherPass!1',
      });
    expect(r.status).toBe(403);
  });

  it('company-admin cannot modify user from other company', async () => {
    const r = await request(app)
      .patch(`/api/users/${createdId}`)
      .set('authorization', `Bearer ${otherToken}`)
      .send({ name: 'Hacked' });
    expect(r.status).toBe(403);
  });

  it('rejects self-disable', async () => {
    const me = await request(app)
      .get('/api/auth/me')
      .set('authorization', `Bearer ${adminToken}`);
    const r = await request(app)
      .patch(`/api/users/${me.body.user.id}`)
      .set('authorization', `Bearer ${adminToken}`)
      .send({ status: 'DISABLED' });
    expect(r.status).toBe(400);
  });

  it('password reset works and login succeeds with new password', async () => {
    const r = await request(app)
      .post(`/api/users/${createdId}/reset-password`)
      .set('authorization', `Bearer ${adminToken}`)
      .send({ password: 'NewPass!12345' });
    expect(r.status).toBe(204);
    const target = await prisma.user.findUnique({ where: { id: createdId } });
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: target!.email, password: 'NewPass!12345' });
    expect(login.status).toBe(200);
  });

  it('rejects PARTICIPANT role from regular endpoints', async () => {
    const r = await request(app).get('/api/users');
    expect(r.status).toBe(401);
  });
});
