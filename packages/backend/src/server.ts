import { createApp } from './app.js';
import { config } from './config/env.js';

const app = createApp();
app.listen(config.port, () => {
  console.log(`SPACE backend listening on http://localhost:${config.port}`);
  console.log(`  health:    GET  /api/health`);
  console.log(`  auth:      POST /api/auth/login | POST /api/auth/refresh | GET /api/auth/me`);
  console.log(`  companies: GET/POST/PATCH/DELETE /api/companies (+ /:id/teams)`);
  console.log(`  scoring:   POST /api/scoring/score-submission | /score-campaign`);
});
