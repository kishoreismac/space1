import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import type { LoginResponse } from '@space/shared';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../stores/auth';

export default function LoginPage() {
  const setSession = useAuth((s) => s.setSession);
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('admin@example.com');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const data = await api<LoginResponse>('/api/auth/login', {
        method: 'POST',
        body: { email, password },
        auth: false,
      });
      setSession(data);
      const from = (location.state as { from?: string } | null)?.from ?? '/admin';
      navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100">
      <form
        onSubmit={onSubmit}
        className="bg-white rounded-lg shadow-md p-8 w-full max-w-sm space-y-4"
      >
        <div className="flex items-center gap-3 mb-2">
          <div className="w-8 h-8 rounded bg-gradient-to-br from-space-s to-space-e" />
          <div>
            <div className="font-semibold">SPACE Platform</div>
            <div className="text-xs text-slate-500">Sign in to continue</div>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-space-s"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-space-s"
          />
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded px-3 py-2">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-slate-900 text-white rounded py-2 text-sm font-medium hover:bg-slate-800 disabled:opacity-50"
        >
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
