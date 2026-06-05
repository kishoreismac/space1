import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { OPEN_TEXT_QUESTION_NUMBERS, REVERSE_QUESTION_NUMBERS } from '@space/shared';
import { createApp } from '../src/app.js';

const app = createApp();

const OPEN = new Set(OPEN_TEXT_QUESTION_NUMBERS);
const REVERSE = new Set(REVERSE_QUESTION_NUMBERS);

describe('health', () => {
  it('GET /api/health → 200', async () => {
    const r = await request(app).get('/api/health');
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('ok');
  });
});

describe('scoring API', () => {
  it('scores a submission', async () => {
    const answers = Array.from({ length: 51 }, (_, i) => ({
      questionNumber: i + 1,
      rawValue: OPEN.has(i + 1) ? null : 4,
    }));
    const r = await request(app).post('/api/scoring/score-submission').send({ answers });
    expect(r.status).toBe(200);
    expect(r.body.dimensions).toHaveLength(5);
  });

  it('scores a campaign with cross-pattern alerts', async () => {
    // Build a submission where post-reverse every dimension averages 2 →
    // S≤2.9 AND E≤2.9 ⇒ TOOLING_HARM fires.
    const lowAnswers = Array.from({ length: 51 }, (_, i) => {
      const q = i + 1;
      if (OPEN.has(q)) return { questionNumber: q, rawValue: null };
      // raw 4 for reverse (becomes 2 post-reverse), raw 2 for the rest
      return { questionNumber: q, rawValue: REVERSE.has(q) ? 4 : 2 };
    });
    const r = await request(app)
      .post('/api/scoring/score-campaign')
      .send({ submissions: [lowAnswers, lowAnswers] });
    expect(r.status).toBe(200);
    const alertCodes: string[] = r.body.alerts.map((a: { code: string }) => a.code);
    expect(alertCodes).toContain('TOOLING_HARM');
  });

  it('rejects malformed input', async () => {
    const r = await request(app).post('/api/scoring/score-submission').send({});
    expect(r.status).toBe(400);
  });
});
