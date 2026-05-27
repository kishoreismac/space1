import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../stores/auth';
import type { UserRole } from '@space/shared';

interface Props {
  children: React.ReactNode;
  roles?: UserRole[];
}

export function RequireAuth({ children, roles }: Props) {
  const { user, accessToken } = useAuth();
  const location = useLocation();
  if (!user || !accessToken) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  if (roles && !roles.includes(user.role)) {
    return (
      <div className="p-8 text-center text-slate-600">
        Forbidden — your role ({user.role}) cannot access this page.
      </div>
    );
  }
  return <>{children}</>;
}
