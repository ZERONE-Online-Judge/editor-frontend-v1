import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/authContext';
import AuthenticationError from './AuthenticationError';

export default function AuthGuard() {
  const location = useLocation();
  const { user, loading, connectionError, retryAuthentication } = useAuth();
  if (loading)
    return (
      <div className="loading" role="status">
        계정을 확인하고 있습니다.
      </div>
    );
  if (connectionError && !user)
    return (
      <AuthenticationError
        message={connectionError}
        onRetry={retryAuthentication}
      />
    );
  return user ? (
    <Outlet />
  ) : (
    <Navigate
      to={
        '/login?' +
        new URLSearchParams({
          next: location.pathname + location.search + location.hash,
        })
      }
      replace
    />
  );
}
