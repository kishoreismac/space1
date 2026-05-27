import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';

interface AuditItem {
  id: string;
  createdAt: string;
  action: string;
  entityType: string;
  entityId: string | null;
  actorUserId: string | null;
  actorRole: string | null;
  actor: { id: string; name: string; email: string } | null;
  ipAddress: string | null;
  userAgent: string | null;
  metadata: unknown;
}

interface AuditResponse {
  items: AuditItem[];
  nextCursor: string | null;
}

export default function AuditPage() {
  const [entityType, setEntityType] = useState('');
  const [action, setAction] = useState('');
  const [entityId, setEntityId] = useState('');

  const params = new URLSearchParams();
  if (entityType) params.set('entityType', entityType);
  if (action) params.set('action', action);
  if (entityId) params.set('entityId', entityId);
  params.set('limit', '100');

  const q = useQuery({
    queryKey: ['audit', params.toString()],
    queryFn: () => api<AuditResponse>(`/api/audit?${params.toString()}`),
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Audit log</h1>
        <p className="text-slate-600 text-sm mt-1">
          Security-relevant events recorded server-side. Visible to super-admins only.
        </p>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 p-3 flex flex-wrap gap-3">
        <Field label="Entity type">
          <select
            value={entityType}
            onChange={(e) => setEntityType(e.target.value)}
            className="border border-slate-300 rounded px-2 py-1 text-sm"
          >
            <option value="">All</option>
            <option value="User">User</option>
            <option value="Company">Company</option>
            <option value="SurveyCampaign">Campaign</option>
            <option value="Blocker">Blocker</option>
          </select>
        </Field>
        <Field label="Action">
          <input
            value={action}
            onChange={(e) => setAction(e.target.value)}
            placeholder="e.g. company.create"
            className="border border-slate-300 rounded px-2 py-1 text-sm w-56"
          />
        </Field>
        <Field label="Entity ID">
          <input
            value={entityId}
            onChange={(e) => setEntityId(e.target.value)}
            placeholder="cuid"
            className="border border-slate-300 rounded px-2 py-1 text-sm w-56"
          />
        </Field>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        {q.isLoading && <div className="p-4 text-sm text-slate-500">Loading…</div>}
        {q.isError && (
          <div className="p-4 text-sm text-rose-600">Failed to load audit log.</div>
        )}
        {q.data && q.data.items.length === 0 && (
          <div className="p-6 text-center text-sm text-slate-500">
            No audit entries match the filter.
          </div>
        )}
        {q.data && q.data.items.length > 0 && (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-600">
              <tr>
                <th className="text-left px-3 py-2">When</th>
                <th className="text-left px-3 py-2">Actor</th>
                <th className="text-left px-3 py-2">Action</th>
                <th className="text-left px-3 py-2">Entity</th>
                <th className="text-left px-3 py-2">IP</th>
                <th className="text-left px-3 py-2">Metadata</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {q.data.items.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="px-3 py-2 whitespace-nowrap text-xs text-slate-600">
                    {new Date(r.createdAt).toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {r.actor ? (
                      <div>
                        <div className="font-medium">{r.actor.name}</div>
                        <div className="text-slate-500">{r.actor.email}</div>
                      </div>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded">
                      {r.action}
                    </code>
                  </td>
                  <td className="px-3 py-2 text-xs">
                    <div>{r.entityType}</div>
                    {r.entityId && (
                      <div className="text-slate-500 font-mono text-[10px]">{r.entityId}</div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-500 font-mono">
                    {r.ipAddress ?? '—'}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {r.metadata ? (
                      <code className="block max-w-xs truncate text-slate-600">
                        {JSON.stringify(r.metadata)}
                      </code>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="text-sm">
      <span className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-1">
        {label}
      </span>
      {children}
    </label>
  );
}
