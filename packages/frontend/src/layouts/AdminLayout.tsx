import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../stores/auth';

const NAV = [
  { to: '/admin/dashboard', label: 'Dashboard' },
  { to: '/admin/setup', label: 'Setup' },
  { to: '/admin/questions', label: 'Questions' },
  { to: '/admin/survey', label: 'Survey' },
  { to: '/admin/upload', label: 'Upload' },
  { to: '/admin/p1', label: 'P1 · Triage' },
  { to: '/admin/p2', label: 'P2 · Themes' },
  { to: '/admin/p3', label: 'P3 · Triangulate' },
  { to: '/admin/p4', label: 'P4 · Journey' },
  { to: '/admin/p5', label: 'P5 · Feasibility' },
  { to: '/admin/p6', label: 'Report' },
  { to: '/admin/p7', label: 'Teams' },
];
const SUPER_NAV = [{ to: '/admin/audit', label: 'Audit' }];
const ADMIN_NAV = [{ to: '/admin/users', label: 'Users' }];

export default function AdminLayout() {
  const { user, clear } = useAuth();
  const navigate = useNavigate();
  const logout = () => {
    clear();
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-slate-900 text-white shadow">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-gradient-to-br from-space-s to-space-e" />
            <div>
              <div className="font-semibold leading-tight">SPACE Assessment Platform</div>
              <div className="text-xs text-slate-400">Developer Productivity · Enterprise</div>
            </div>
          </div>
          <nav className="flex gap-1">
            {[
              ...NAV,
              ...(user?.role === 'SUPER_ADMIN' || user?.role === 'COMPANY_ADMIN' ? ADMIN_NAV : []),
              ...(user?.role === 'SUPER_ADMIN' ? SUPER_NAV : []),
            ].map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `px-3 py-1.5 rounded text-sm font-medium transition ${
                    isActive
                      ? 'bg-white text-slate-900'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="flex items-center gap-3 text-sm">
            {user && (
              <div className="text-right">
                <div className="font-medium leading-tight">{user.name}</div>
                <div className="text-xs text-slate-400">{user.role}</div>
              </div>
            )}
            <button
              onClick={logout}
              className="text-xs px-2 py-1 rounded border border-slate-700 text-slate-300 hover:bg-slate-800"
            >
              Logout
            </button>
          </div>
        </div>
      </header>
      <main className="flex-1 max-w-7xl mx-auto w-full px-6 py-8">
        <Outlet />
      </main>
      <footer className="bg-white border-t border-slate-200 py-3 text-xs text-slate-500 text-center">
        SPACE Platform · v0.1.0
      </footer>
    </div>
  );
}
