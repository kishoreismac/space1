import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import { config } from './config/env.js';
import { errorHandler, notFound } from './middleware/error.js';
import { authRouter } from './modules/auth/router.js';
import { campaignsRouter } from './modules/campaigns/router.js';
import { companiesRouter } from './modules/companies/router.js';
import { publicRouter } from './modules/public/router.js';
import { questionnairesRouter } from './modules/questionnaires/router.js';
import { resultsRouter } from './modules/results/router.js';
import { bulkUploadRouter } from './modules/results/bulk.js';
import { scoringRouter } from './modules/scoring/router.js';
import { themesRouter } from './modules/themes/router.js';
import { journeyRouter } from './modules/journey/router.js';
import { triangulationRouter } from './modules/triangulation/router.js';
import { feasibilityRouter } from './modules/feasibility/router.js';
import { reportRouter } from './modules/report/router.js';
import { exportRouter } from './modules/export/router.js';
import { dashboardRouter } from './modules/dashboard/router.js';
import { auditRouter } from './modules/audit/router.js';
import { usersRouter } from './modules/users/router.js';
import { artifactsRouter } from './modules/artifacts/router.js';

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: config.corsOrigins, credentials: true }));
  app.use(express.json({ limit: '2mb' }));
  if (config.nodeEnv !== 'test') app.use(morgan('dev'));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', service: 'space-backend', env: config.nodeEnv });
  });

  app.use('/api/auth', authRouter);
  app.use('/api/companies', companiesRouter);
  app.use('/api/companies/:companyId/campaigns', campaignsRouter);
  app.use('/api/companies/:companyId/campaigns/:campaignId/results', resultsRouter);
  app.use('/api/companies/:companyId/campaigns/:campaignId/upload', bulkUploadRouter);
  app.use('/api/companies/:companyId/campaigns/:campaignId/themes', themesRouter);
  app.use('/api/companies/:companyId/campaigns/:campaignId/journey', journeyRouter);
  app.use('/api/companies/:companyId/campaigns/:campaignId/triangulation', triangulationRouter);
  app.use('/api/companies/:companyId/campaigns/:campaignId/feasibility', feasibilityRouter);
  app.use('/api/companies/:companyId/campaigns/:campaignId/report', reportRouter);
  app.use('/api/companies/:companyId/campaigns/:campaignId/export', exportRouter);
  app.use('/api/companies/:companyId/campaigns/:campaignId/artifacts', artifactsRouter);
  app.use('/api/companies/:companyId/dashboard', dashboardRouter);
  app.use('/api/audit', auditRouter);
  app.use('/api/users', usersRouter);
  app.use('/api/questionnaires', questionnairesRouter);
  app.use('/api/public', publicRouter);
  app.use('/api/scoring', scoringRouter);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
