import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from '../stores/auth';

type IconName =
  | 'dashboard'
  | 'setup'
  | 'questions'
  | 'survey'
  | 'upload'
  | 'triage'
  | 'themes'
  | 'triangulate'
  | 'journey'
  | 'feasibility'
  | 'report'
  | 'teams'
  | 'audit'
  | 'users'
  | 'logout';

const NAV = [
  { to: '/admin/dashboard', label: 'Dashboard', icon: 'dashboard' },
  { to: '/admin/setup', label: 'Setup', icon: 'setup' },
  { to: '/admin/questions', label: 'Questions', icon: 'questions' },
  { to: '/admin/survey', label: 'Survey', icon: 'survey' },
  { to: '/admin/upload', label: 'Upload', icon: 'upload' },
  { to: '/admin/p1', label: 'P1 · Triage', icon: 'triage' },
  { to: '/admin/p2', label: 'P2 · Themes', icon: 'themes' },
  { to: '/admin/p3', label: 'P3 · Triangulate', icon: 'triangulate' },
  { to: '/admin/p4', label: 'P4 · Journey', icon: 'journey' },
  { to: '/admin/p5', label: 'P5 · Feasibility', icon: 'feasibility' },
  { to: '/admin/p6', label: 'Report', icon: 'report' },
  { to: '/admin/p7', label: 'Teams', icon: 'teams' },
];
const SUPER_NAV = [{ to: '/admin/audit', label: 'Audit', icon: 'audit' }];
const ADMIN_NAV = [{ to: '/admin/users', label: 'Users', icon: 'users' }];

function NavIcon({ name }: { name: IconName }) {
  const common = {
    fill: 'none',
    stroke: 'currentColor',
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    strokeWidth: 2,
  };
  const paths: Record<IconName, ReactNode> = {
    dashboard: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1.5" {...common} />
        <rect x="14" y="3" width="7" height="7" rx="1.5" {...common} />
        <rect x="3" y="14" width="7" height="7" rx="1.5" {...common} />
        <rect x="14" y="14" width="7" height="7" rx="1.5" {...common} />
      </>
    ),
    setup: (
      <>
        <path d="M4 21V8l8-5 8 5v13" {...common} />
        <path d="M9 21v-7h6v7" {...common} />
      </>
    ),
    questions: (
      <>
        <circle cx="12" cy="12" r="9" {...common} />
        <path d="M9.5 9a2.7 2.7 0 0 1 5.1 1.2c0 1.8-2.6 2.2-2.6 4" {...common} />
        <path d="M12 17.5h.01" {...common} />
      </>
    ),
    survey: (
      <>
        <path d="M8 4h8l1 2h3v15H4V6h3l1-2z" {...common} />
        <path d="M9 12h6M9 16h4" {...common} />
      </>
    ),
    upload: (
      <>
        <path d="M12 16V4" {...common} />
        <path d="m7 9 5-5 5 5" {...common} />
        <path d="M5 20h14" {...common} />
      </>
    ),
    triage: (
      <>
        <path d="M4 19h16" {...common} />
        <path d="M7 16V9" {...common} />
        <path d="M12 16V5" {...common} />
        <path d="M17 16v-4" {...common} />
      </>
    ),
    themes: (
      <>
        <path d="M20 13V6a2 2 0 0 0-2-2h-7L4 11v7a2 2 0 0 0 2 2h7l7-7z" {...common} />
        <path d="M8 8h.01" {...common} />
      </>
    ),
    triangulate: (
      <>
        <path d="M12 3 3 20h18L12 3z" {...common} />
        <path d="M12 9v4M12 17h.01" {...common} />
      </>
    ),
    journey: (
      <>
        <path d="M5 6h4a4 4 0 0 1 0 8H7a3 3 0 0 0 0 6h12" {...common} />
        <circle cx="5" cy="6" r="2" {...common} />
        <circle cx="19" cy="20" r="2" {...common} />
      </>
    ),
    feasibility: (
      <>
        <path d="M20 7 10 17l-5-5" {...common} />
        <path d="M4 4h16v16H4z" {...common} />
      </>
    ),
    report: (
      <>
        <path d="M7 3h7l4 4v14H7V3z" {...common} />
        <path d="M14 3v5h5M9 13h6M9 17h6" {...common} />
      </>
    ),
    teams: (
      <>
        <circle cx="9" cy="8" r="3" {...common} />
        <circle cx="17" cy="10" r="2.5" {...common} />
        <path d="M3 20a6 6 0 0 1 12 0" {...common} />
        <path d="M14 17a5 5 0 0 1 7 3" {...common} />
      </>
    ),
    audit: (
      <>
        <path d="M12 3 5 6v5c0 4.5 3 8.5 7 10 4-1.5 7-5.5 7-10V6l-7-3z" {...common} />
        <path d="m9 12 2 2 4-4" {...common} />
      </>
    ),
    users: (
      <>
        <circle cx="8" cy="8" r="3" {...common} />
        <circle cx="16" cy="9" r="2.5" {...common} />
        <path d="M3 20a5 5 0 0 1 10 0" {...common} />
        <path d="M13 17a4 4 0 0 1 7 3" {...common} />
      </>
    ),
    logout: (
      <>
        <path d="M10 17v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v2" {...common} />
        <path d="M15 7l5 5-5 5" {...common} />
        <path d="M20 12H9" {...common} />
      </>
    ),
  };

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5">
      {paths[name]}
    </svg>
  );
}

export default function AdminLayout() {
  const { user, clear } = useAuth();
  const navigate = useNavigate();
  const navItems = [
    ...NAV,
    ...(user?.role === 'SUPER_ADMIN' || user?.role === 'COMPANY_ADMIN' ? ADMIN_NAV : []),
    ...(user?.role === 'SUPER_ADMIN' ? SUPER_NAV : []),
  ];
  const logout = () => {
    clear();
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 md:flex">
      <aside className="group bg-slate-900 text-white shadow md:sticky md:top-0 md:h-screen md:w-16 md:flex-shrink-0 md:overflow-hidden md:transition-all md:duration-200 md:hover:w-80 md:focus-within:w-80">
        <div className="px-5 py-5 flex flex-col gap-5 h-full">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-gradient-to-br from-space-s to-space-e flex-shrink-0" />
            <div className="min-w-0 md:opacity-0 md:transition-opacity md:duration-150 md:group-hover:opacity-100 md:group-focus-within:opacity-100">
              <div className="font-semibold leading-tight whitespace-nowrap">SPACE Assessment Platform</div>
              <div className="text-xs text-slate-400 whitespace-nowrap">Developer Productivity · Enterprise</div>
            </div>
          </div>

          <nav className="flex gap-1 overflow-x-auto pb-1 md:pb-0 md:overflow-visible md:flex-col">
            {navItems.map((item) => {
              return (
              <NavLink
                key={item.to}
                to={item.to}
                title={item.label}
                className={({ isActive }) =>
                  `whitespace-nowrap rounded text-sm font-medium text-left transition px-3 py-2 md:w-10 md:h-10 md:p-0 md:mx-auto md:flex md:items-center md:justify-center md:group-hover:w-full md:group-hover:h-auto md:group-hover:mx-0 md:group-hover:px-3 md:group-hover:py-2 md:group-hover:grid md:group-hover:grid-cols-[1.5rem_1fr] md:group-hover:gap-3 md:group-focus-within:w-full md:group-focus-within:h-auto md:group-focus-within:mx-0 md:group-focus-within:px-3 md:group-focus-within:py-2 md:group-focus-within:grid md:group-focus-within:grid-cols-[1.5rem_1fr] md:group-focus-within:gap-3 ${
                    isActive
                      ? 'bg-white text-slate-900'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`
                }
              >
                <span className="hidden md:flex h-6 w-6 flex-shrink-0 items-center justify-center">
                  <NavIcon name={item.icon as IconName} />
                </span>
                <span className="md:hidden md:opacity-0 md:transition-opacity md:duration-150 md:group-hover:block md:group-hover:opacity-100 md:group-focus-within:block md:group-focus-within:opacity-100">
                  {item.label}
                </span>
              </NavLink>
              );
            })}
          </nav>

          <div className="mt-auto flex items-center justify-between gap-3 border-t border-slate-800 pt-4 text-sm md:block">
            {user && (
              <div className="text-left md:mb-3 md:opacity-0 md:transition-opacity md:duration-150 md:group-hover:opacity-100 md:group-focus-within:opacity-100">
                <div className="font-medium leading-tight whitespace-nowrap">{user.name}</div>
                <div className="text-xs text-slate-400 whitespace-nowrap">{user.role}</div>
              </div>
            )}
            <button
              onClick={logout}
              title="Logout"
              className="text-xs px-2 py-1.5 rounded border border-slate-700 text-slate-300 hover:bg-slate-800 md:grid md:w-full md:grid-cols-[1.5rem_1fr] md:items-center md:gap-3 md:px-3 md:text-left"
            >
              <span className="md:hidden">Logout</span>
              <span className="hidden md:flex h-6 w-6 items-center justify-center">
                <NavIcon name="logout" />
              </span>
              <span className="hidden md:opacity-0 md:transition-opacity md:duration-150 md:group-hover:inline md:group-hover:opacity-100 md:group-focus-within:inline md:group-focus-within:opacity-100">
                Logout
              </span>
            </button>
          </div>
        </div>
      </aside>

      <div className="flex min-h-screen flex-1 flex-col">
        <main className="flex-1 w-full px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <Outlet />
          </div>
        </main>
        <footer className="bg-white border-t border-slate-200 py-3 text-xs text-slate-500 text-center">
          SPACE Platform · v0.1.0
        </footer>
      </div>
    </div>
  );
}
