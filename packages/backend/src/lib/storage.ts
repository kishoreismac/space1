/**
 * Azure Blob Storage helper for persisting JSON artifacts
 * (snapshots, executive summaries, notes, DORA metrics, reports).
 *
 * Reads connection string from AZURE_STORAGE_CONNECTION_STRING.
 * When the env var is missing (e.g. local dev), all calls become safe no-ops
 * so the application keeps running on SQLite-only storage.
 */
import { BlobServiceClient, ContainerClient } from '@azure/storage-blob';

export type ArtifactKind =
  | 'snapshots'
  | 'executive-summaries'
  | 'notes'
  | 'dora-metrics'
  | 'reports'
  | 'survey-responses'
  | 'participant-exports'
  | 'themes'
  | 'analysis-results';

export const ARTIFACT_KINDS: ArtifactKind[] = [
  'snapshots',
  'executive-summaries',
  'notes',
  'dora-metrics',
  'reports',
  'survey-responses',
  'participant-exports',
  'themes',
  'analysis-results',
];

const connStr = process.env.AZURE_STORAGE_CONNECTION_STRING ?? '';
let _service: BlobServiceClient | null = null;

function service(): BlobServiceClient | null {
  if (!connStr) return null;
  if (!_service) {
    try {
      _service = BlobServiceClient.fromConnectionString(connStr);
    } catch (err) {
      console.warn('[storage] failed to init BlobServiceClient:', err);
      _service = null;
    }
  }
  return _service;
}

export function isStorageConfigured(): boolean {
  return !!connStr;
}

function container(kind: ArtifactKind): ContainerClient | null {
  const svc = service();
  if (!svc) return null;
  return svc.getContainerClient(kind);
}

function blobKey(companyId: string, campaignId: string, id: string): string {
  return `${companyId}/${campaignId}/${id}.json`;
}

export interface ArtifactMeta {
  id: string;
  key: string;
  kind: ArtifactKind;
  companyId: string;
  campaignId: string;
  savedAt: string;
  size: number;
}

export interface ArtifactRecord<T = unknown> extends ArtifactMeta {
  data: T;
}

function newArtifactId(): string {
  // Sortable timestamp + short random suffix
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${ts}_${suffix}`;
}

/**
 * Upload a JSON artifact. Returns metadata.
 * Safe no-op if storage is not configured (returns null).
 */
export async function saveArtifact<T>(
  kind: ArtifactKind,
  companyId: string,
  campaignId: string,
  data: T,
  options?: { id?: string; tags?: Record<string, string> },
): Promise<ArtifactMeta | null> {
  const c = container(kind);
  if (!c) return null;
  const id = options?.id ?? newArtifactId();
  const key = blobKey(companyId, campaignId, id);
  const payload = Buffer.from(JSON.stringify(data, null, 2), 'utf8');
  const block = c.getBlockBlobClient(key);
  await block.uploadData(payload, {
    blobHTTPHeaders: { blobContentType: 'application/json; charset=utf-8' },
    metadata: {
      companyId,
      campaignId,
      kind,
      savedAt: new Date().toISOString(),
      ...(options?.tags ?? {}),
    },
  });
  return {
    id,
    key,
    kind,
    companyId,
    campaignId,
    savedAt: new Date().toISOString(),
    size: payload.byteLength,
  };
}

/**
 * Fetch one artifact JSON by id.
 */
export async function getArtifact<T = unknown>(
  kind: ArtifactKind,
  companyId: string,
  campaignId: string,
  id: string,
): Promise<ArtifactRecord<T> | null> {
  const c = container(kind);
  if (!c) return null;
  const key = blobKey(companyId, campaignId, id);
  const block = c.getBlockBlobClient(key);
  if (!(await block.exists())) return null;
  const buffer = await block.downloadToBuffer();
  const props = await block.getProperties();
  const text = buffer.toString('utf8');
  let data: T;
  try {
    data = JSON.parse(text) as T;
  } catch {
    data = text as unknown as T;
  }
  return {
    id,
    key,
    kind,
    companyId,
    campaignId,
    savedAt: (props.metadata?.savedAt as string) ?? (props.lastModified?.toISOString() ?? ''),
    size: buffer.byteLength,
    data,
  };
}

/**
 * List all artifacts for a company+campaign in a kind, newest first.
 */
export async function listArtifacts(
  kind: ArtifactKind,
  companyId: string,
  campaignId: string,
): Promise<ArtifactMeta[]> {
  const c = container(kind);
  if (!c) return [];
  const prefix = `${companyId}/${campaignId}/`;
  const items: ArtifactMeta[] = [];
  for await (const blob of c.listBlobsFlat({ prefix, includeMetadata: true })) {
    const name = blob.name;
    const id = name.substring(prefix.length).replace(/\.json$/i, '');
    items.push({
      id,
      key: name,
      kind,
      companyId,
      campaignId,
      savedAt:
        (blob.metadata?.savedAt as string) ??
        blob.properties?.lastModified?.toISOString() ??
        '',
      size: Number(blob.properties?.contentLength ?? 0),
    });
  }
  items.sort((a, b) => (a.savedAt < b.savedAt ? 1 : -1));
  return items;
}

/**
 * Convenience: save without throwing — log and swallow errors.
 * Used when blob mirror is best-effort beside the primary DB write.
 */
export async function trySaveArtifact<T>(
  kind: ArtifactKind,
  companyId: string,
  campaignId: string,
  data: T,
  options?: { id?: string; tags?: Record<string, string> },
): Promise<ArtifactMeta | null> {
  try {
    return await saveArtifact(kind, companyId, campaignId, data, options);
  } catch (err) {
    console.warn(`[storage] failed to mirror ${kind} for ${companyId}/${campaignId}:`, err);
    return null;
  }
}
