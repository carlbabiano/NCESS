
import { Navigate, useLocation } from 'react-router-dom';

function decodeToken(token) {
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(base64));
  } catch {
    return null;
  }
}

function normalizeRole(role) {
  return String(role || '').toLowerCase().replace(/\s+/g, '');
}

// Usage: <PrivateRoute><Dashboard /></PrivateRoute>
export default function PrivateRoute({ children, allowedAdminRoles, redirectTo = '/adminannouncements' }) {
  const location = useLocation();
  const isAdmin = location.pathname.startsWith('/admin');
  // Admin pages require admin_token, user pages require user token
  const adminToken = localStorage.getItem('admin_token') || sessionStorage.getItem('admin_token');
  const userToken = localStorage.getItem('token') || sessionStorage.getItem('token') || localStorage.getItem('userToken') || sessionStorage.getItem('userToken');

  if (isAdmin) {
    if (!adminToken) {
      return <Navigate to="/adminlogin" replace />;
    }
    if (allowedAdminRoles?.length) {
      const payload = decodeToken(adminToken);
      const adminRole = normalizeRole(payload?.adminRole);
      const allowedRoles = allowedAdminRoles.map(normalizeRole);

      if (!allowedRoles.includes(adminRole)) {
        return <Navigate to={redirectTo} replace />;
      }
    }
  } else {
    if (!userToken) {
      return <Navigate to="/userlogin" replace />;
    }
  }
  return children;
}
