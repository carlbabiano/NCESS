import {
  LayoutDashboard,
  Calendar,
  AlertCircle,
  Headphones,
  Users,
  Megaphone,
  Settings,
  LogOut,
  ShieldCheck,
  QrCode,
  ChevronDown,
} from 'lucide-react';
import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import newcablogo from '../assets/newcab.png';
import './adminsidebar.css';

// ── Decode JWT payload without a library ────────────────────────────────────
function decodeToken(token) {
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(base64));
  } catch {
    return null;
  }
}

function getAdminRole() {
  const token =
    localStorage.getItem('admin_token') ||
    sessionStorage.getItem('admin_token') || '';
  if (!token) return null;
  const payload = decodeToken(token);
  return String(payload?.adminRole || '').toLowerCase().replace(/\s+/g, '');
}

// Roles that can see the Admin & Roles management page
const SUPER_ADMIN_ROLES = ['barangaycaptain', 'secretary'];

export default function Sidebar({ sidebarOpen, setSidebarOpen }) {
  const location  = useLocation();
  const navigate  = useNavigate();
  const [residentsOpen, setResidentsOpen] = useState(true);
  const adminRole = getAdminRole();
  const canManageAdmins = SUPER_ADMIN_ROLES.includes(adminRole);
  const canViewRestrictedSections = canManageAdmins;

  const menuItems = [
    { icon: LayoutDashboard, label: 'Dashboard',        path: '/admindashboard' },
    { icon: Megaphone,       label: 'Announcements',    path: '/adminannouncements' },
    { icon: Calendar,        label: 'Appointments',     path: '/adminappointments' },
    { icon: AlertCircle,     label: 'Complaints',       path: '/admincomplaints' },
    { icon: Headphones,      label: 'Barangay Support', path: '/adminbarangaysupport' },
    { icon: QrCode,          label: 'Scan QR',          path: '/adminscanqr', isScanQR: true },
  ];

  const isActive = (path) => {
    if (path === '/admindashboard')
      return location.pathname === '/admindashboard' || location.pathname === '/';
    return location.pathname === path || location.pathname.startsWith(path + '/');
  };

  const handleNav = (path) => {
    navigate(path);
    setSidebarOpen(false);
  };

  const residentsActive = location.pathname.startsWith('/adminresidents') || location.pathname === '/adminprofilerequest';

  const handleLogout = () => {
    ['admin_token', 'admin'].forEach(k => {
      localStorage.removeItem(k);
      sessionStorage.removeItem(k);
    });
    navigate('/adminlogin');
    setSidebarOpen(false);
  };

  return (
    <>
      {sidebarOpen && (
        <div
          className="asb-overlay"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={`sidebar${sidebarOpen ? ' sidebar--open' : ''}`}
      >
        <div className="sidebar__brand">
          <img src={newcablogo} alt="New Cabalan" className="sidebar__brand-logo" />
          <span className="sidebar__brand-name">NCESS</span>
        </div>

        <nav className="sidebar__nav">
          {menuItems
            .slice(0, 5)
            .filter((item) => (
              canViewRestrictedSections ||
              !['/admincomplaints', '/adminbarangaysupport'].includes(item.path)
            ))
            .map((item, index) => {
            const active = isActive(item.path);
            return (
              <button
                key={index}
                onClick={() => handleNav(item.path)}
                className={`sidebar__nav-item${active ? ' sidebar__nav-item--active' : ''}`}
              >
                <span className="sidebar__nav-icon"><item.icon size={18} /></span>
                <span className="sidebar__nav-label">{item.label}</span>
              </button>
            );
          })}

          {canViewRestrictedSections && (
            <div className="sidebar__group">
              <button
                className={`sidebar__nav-item sidebar__nav-item--with-chevron${residentsActive ? ' sidebar__nav-item--active' : ''}`}
                onClick={() => setResidentsOpen(open => !open)}
                aria-expanded={residentsOpen}
              >
                <span className="sidebar__nav-icon"><Users size={18} /></span>
                <span className="sidebar__nav-label">Residents</span>
                <ChevronDown className={`sidebar__chevron${residentsOpen ? ' sidebar__chevron--open' : ''}`} size={15} />
              </button>
              {residentsOpen && (
                <div className="sidebar__submenu">
                  <button
                    className={`sidebar__submenu-item${location.pathname === '/adminresidents/account-approval' ? ' sidebar__submenu-item--active' : ''}`}
                    onClick={() => handleNav('/adminresidents/account-approval')}
                  >
                    Account Approval
                  </button>
                  <button
                    className={`sidebar__submenu-item${location.pathname === '/adminprofilerequest' ? ' sidebar__submenu-item--active' : ''}`}
                    onClick={() => handleNav('/adminprofilerequest')}
                  >
                    Profile Update Request
                  </button>
                </div>
              )}
            </div>
          )}

          <button
            onClick={() => handleNav('/adminscanqr')}
            className={`sidebar__nav-item${isActive('/adminscanqr') ? ' sidebar__nav-item--active' : ''}`}
          >
            <span className="sidebar__nav-icon"><QrCode size={18} /></span>
            <span className="sidebar__nav-label">Scan QR</span>
          </button>
        </nav>

        <div className="sidebar__bottom">
          <button
            className={`sidebar__nav-item${isActive('/adminsettings') ? ' sidebar__nav-item--active' : ''}`}
            onClick={() => handleNav('/adminsettings')}
          >
            <span className="sidebar__nav-icon"><Settings size={18} /></span>
            <span className="sidebar__nav-label">Settings</span>
          </button>

          {/* Admin & Roles — only visible to Captain and Secretary */}
          {canManageAdmins && (
            <button
              className={`sidebar__nav-item${isActive('/adminroles') ? ' sidebar__nav-item--active' : ''}`}
              onClick={() => handleNav('/adminroles')}
            >
              <span className="sidebar__nav-icon"><ShieldCheck size={18} /></span>
              <span className="sidebar__nav-label">Admin & Roles</span>
            </button>
          )}

          <button
            className="sidebar__nav-item sidebar__nav-item--logout"
            onClick={handleLogout}
          >
            <span className="sidebar__nav-icon"><LogOut size={18} /></span>
            <span className="sidebar__nav-label">Logout</span>
          </button>
        </div>

        <div className="sidebar__copyright-separator" />
        <div style={{ padding: '16px 0', textAlign: 'center', fontSize: '12px', color: '#6b7280' }}>
          © 2026 Barangay System
        </div>
      </aside>
    </>
  );
}
