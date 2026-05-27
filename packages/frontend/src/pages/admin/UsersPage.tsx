import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Company, User, UserRole } from '@space/shared';
import { api } from '../../lib/api';
import { useAuth } from '../../stores/auth';

const ROLES: UserRole[] = ['SUPER_ADMIN', 'COMPANY_ADMIN', 'ANALYST', 'PARTICIPANT'];

export default function UsersPage() {
  const me = useAuth((s) => s.user);
  const qc = useQueryClient();

  const users = useQuery({
    queryKey: ['users'],
    queryFn: () => api<{ items: User[] }>('/api/users'),
  });
  const companies = useQuery({
    queryKey: ['companies'],
    queryFn: () => api<{ items: Company[] }>('/api/companies'),
    enabled: me?.role === 'SUPER_ADMIN',
  });

  // Create form state
  const [form, setForm] = useState({
    name: '',
    email: '',
    role: 'ANALYST' as UserRole,
    companyId: me?.role === 'COMPANY_ADMIN' ? me.companyId : '',
    password: '',
  });
  const create = useMutation({
    mutationFn: () =>
      api<User>('/api/users', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          role: form.role,
          companyId: form.role === 'SUPER_ADMIN' ? null : form.companyId || null,
          password: form.password,
        }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      setForm({ ...form, name: '', email: '', password: '' });
    },
  });

  const setStatus = useMutation({
    mutationFn: (vars: { id: string; status: 'ACTIVE' | 'DISABLED' }) =>
      api<User>(`/api/users/${vars.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: vars.status }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });

  const setRole = useMutation({
    mutationFn: (vars: { id: string; role: UserRole }) =>
      api<User>(`/api/users/${vars.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ role: vars.role }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });

  const resetPw = useMutation({
    mutationFn: (vars: { id: string; password: string }) =>
      api(`/api/users/${vars.id}/reset-password`, {
        method: 'POST',
        body: JSON.stringify({ password: vars.password }),
      }),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Users</h1>
        <p className="text-slate-600 text-sm mt-1">
          Invite teammates, assign roles, reset passwords, disable accounts.
        </p>
      </div>

      <section className="bg-white rounded-lg border border-slate-200 p-4">
        <h2 className="text-sm font-semibold mb-3">Create user</h2>
        <form
          className="grid grid-cols-1 md:grid-cols-5 gap-2 items-end"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <Field label="Name">
            <input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="border border-slate-300 rounded px-2 py-1.5 text-sm w-full"
            />
          </Field>
          <Field label="Email">
            <input
              required
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="border border-slate-300 rounded px-2 py-1.5 text-sm w-full"
            />
          </Field>
          <Field label="Role">
            <select
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })}
              className="border border-slate-300 rounded px-2 py-1.5 text-sm w-full"
            >
              {ROLES.filter((r) =>
                me?.role === 'SUPER_ADMIN' ? true : r !== 'SUPER_ADMIN',
              ).map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </Field>
          {me?.role === 'SUPER_ADMIN' && form.role !== 'SUPER_ADMIN' && (
            <Field label="Company">
              <select
                required
                value={form.companyId ?? ''}
                onChange={(e) => setForm({ ...form, companyId: e.target.value })}
                className="border border-slate-300 rounded px-2 py-1.5 text-sm w-full"
              >
                <option value="">—</option>
                {companies.data?.items.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <Field label="Initial password">
            <input
              required
              minLength={8}
              type="text"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="border border-slate-300 rounded px-2 py-1.5 text-sm w-full font-mono"
            />
          </Field>
          <button
            type="submit"
            disabled={create.isPending}
            className="md:col-span-5 justify-self-start bg-slate-900 text-white text-sm px-4 py-1.5 rounded hover:bg-slate-700 disabled:opacity-50"
          >
            {create.isPending ? 'Creating…' : 'Create user'}
          </button>
          {create.isError && (
            <div className="md:col-span-5 text-sm text-rose-600">
              {(create.error as Error).message}
            </div>
          )}
        </form>
      </section>

      <section className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        {users.isLoading && <div className="p-4 text-sm text-slate-500">Loading…</div>}
        {users.data && (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-600">
              <tr>
                <th className="text-left px-3 py-2">User</th>
                <th className="text-left px-3 py-2">Role</th>
                <th className="text-left px-3 py-2">Status</th>
                <th className="text-left px-3 py-2">Created</th>
                <th className="text-right px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.data.items.map((u) => (
                <tr key={u.id}>
                  <td className="px-3 py-2">
                    <div className="font-medium">{u.name}</div>
                    <div className="text-xs text-slate-500">{u.email}</div>
                  </td>
                  <td className="px-3 py-2">
                    <select
                      value={u.role}
                      disabled={u.id === me?.id}
                      onChange={(e) =>
                        setRole.mutate({ id: u.id, role: e.target.value as UserRole })
                      }
                      className="border border-slate-300 rounded px-1.5 py-0.5 text-xs"
                    >
                      {ROLES.filter((r) =>
                        me?.role === 'SUPER_ADMIN' ? true : r !== 'SUPER_ADMIN',
                      ).map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`text-[10px] font-semibold border rounded px-1.5 py-0.5 ${
                        u.status === 'ACTIVE'
                          ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                          : 'bg-slate-100 border-slate-300 text-slate-600'
                      }`}
                    >
                      {u.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-500">
                    {new Date(u.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-3 py-2 text-right space-x-2">
                    <button
                      type="button"
                      onClick={() => {
                        const pw = window.prompt(`New password for ${u.email}:`);
                        if (pw && pw.length >= 8) resetPw.mutate({ id: u.id, password: pw });
                      }}
                      className="text-xs underline text-sky-700"
                    >
                      Reset password
                    </button>
                    <button
                      type="button"
                      disabled={u.id === me?.id}
                      onClick={() =>
                        setStatus.mutate({
                          id: u.id,
                          status: u.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE',
                        })
                      }
                      className="text-xs underline text-rose-700 disabled:text-slate-400 disabled:no-underline"
                    >
                      {u.status === 'ACTIVE' ? 'Disable' : 'Re-enable'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="text-sm block">
      <span className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-1">
        {label}
      </span>
      {children}
    </label>
  );
}
