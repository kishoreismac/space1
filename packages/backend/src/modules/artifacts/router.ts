/**
 * Generic artifacts router — persists JSON blobs to Azure Storage.
 *
 * Mounted at: /api/companies/:companyId/campaigns/:campaignId/artifacts
 *
 * Endpoints:
 *   POST   /:kind         → save a JSON artifact (returns metadata + id)
 *   GET    /:kind         → list saved artifacts (newest first)
 *   GET    /:kind/:id     → fetch one artifact (metadata + data)
 *
 * Valid `:kind` values: snapshots | executive-summaries | notes | dora-metrics | reports
 */
import { Router } from 'express';
import { HttpError } from '../../middleware/error.js';
import { assertCompanyAccess, requireAuth, requireRole } from '../auth/middleware.js';
import {
  ARTIFACT_KINDS,
  type ArtifactKind,
  getArtifact,
  isStorageConfigured,
  listArtifacts,
  saveArtifact,
} from '../../lib/storage.js';

export const artifactsRouter = Router({ mergeParams: true });
artifactsRouter.use(requireAuth);

function parseKind(raw: string): ArtifactKind {
  if (!(ARTIFACT_KINDS as string[]).includes(raw)) {
    throw new HttpError(400, `Unknown artifact kind. Valid: ${ARTIFACT_KINDS.join(', ')}`);
  }
  return raw as ArtifactKind;
}

function ensureConfigured(): void {
  if (!isStorageConfigured()) {
    throw new HttpError(
      503,
      'Azure Storage is not configured. Set AZURE_STORAGE_CONNECTION_STRING on the API.',
    );
  }
}

// List
artifactsRouter.get('/:kind', async (req, res, next) => {
  try {
    const { companyId, campaignId, kind: kindRaw } = req.params as {
      companyId: string;
      campaignId: string;
      kind: string;
    };
    assertCompanyAccess(req.auth, companyId);
    const kind = parseKind(kindRaw);
    ensureConfigured();
    const items = await listArtifacts(kind, companyId, campaignId);
    res.json({ items });
  } catch (e) {
    next(e);
  }
});

// Get one
artifactsRouter.get('/:kind/:id', async (req, res, next) => {
  try {
    const { companyId, campaignId, kind: kindRaw, id } = req.params as {
      companyId: string;
      campaignId: string;
      kind: string;
      id: string;
    };
    assertCompanyAccess(req.auth, companyId);
    const kind = parseKind(kindRaw);
    ensureConfigured();
    const record = await getArtifact(kind, companyId, campaignId, id);
    if (!record) throw new HttpError(404, 'Artifact not found');
    res.json(record);
  } catch (e) {
    next(e);
  }
});

// Save
artifactsRouter.post(
  '/:kind',
  requireRole('SUPER_ADMIN', 'COMPANY_ADMIN', 'ANALYST'),
  async (req, res, next) => {
    try {
      const { companyId, campaignId, kind: kindRaw } = req.params as {
        companyId: string;
        campaignId: string;
        kind: string;
      };
      assertCompanyAccess(req.auth, companyId);
      const kind = parseKind(kindRaw);
      ensureConfigured();
      const body = (req.body ?? {}) as Record<string, unknown>;
      const payload = {
        kind,
        companyId,
        campaignId,
        savedBy: req.auth?.sub ?? null,
        savedAt: new Date().toISOString(),
        data: body,
      };
      const meta = await saveArtifact(kind, companyId, campaignId, payload);
      if (!meta) throw new HttpError(500, 'Failed to persist artifact');
      res.status(201).json(meta);
    } catch (e) {
      next(e);
    }
  },
);
