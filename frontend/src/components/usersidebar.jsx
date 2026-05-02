import {
  Calendar,
  AlertCircle,
  Headphones,
  Users,
  Megaphone,
  Settings,
  LogOut,
  X
} from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import newcablogo from '../assets/newcab.png';
import './usersidebar.css';

export default function Sidebar({ sidebarOpen, setSidebarOpen }) {
  const location = useLocation();
  const navigate = useNavigate();

  const HomeIcon = () => (
    <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
      <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />
    </svg>
  );

  const menuItems = [
    { icon: HomeIcon, label: 'Home', path: '/userdashboard' },
   
    /*{ icon: Megaphone, label: 'Announcements', path: '/userannouncements' },*/

    { icon: Calendar, label: 'Appointments', path: '/userappointments' },
    { icon: AlertCircle, label: 'Complaints', path: '/usercomplaints' },
    { icon: Headphones, label: 'Barangay Support', path: '/userbarangaysupport' },
    { icon: Users, label: 'Hotline Mapping', path: '/usersidehotlinemapping' },
  ];

  const isActive = (path) => {
    if (path === '/userdashboard') {
      return location.pathname === '/userdashboard' || location.pathname === '/';
    }
    return location.pathname === path || location.pathname.startsWith(path + '/');
  };

  return (
    <>
      {/* Mobile Overlay */}
      {sidebarOpen && (
        <div
          className="usb-overlay"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`usb-sidebar${sidebarOpen ? ' usb-sidebar--open' : ''}`}
      >
        {/* Brand/Header */}
        <div className="sidebar__brand">
          <img src={newcablogo} alt="New Cabalan" className="sidebar__brand-logo" />
          <span className="sidebar__brand-name">NCESS</span>
        </div>

        {/* Navigation */}
        <nav className="sidebar__nav">
          {menuItems.map((item, index) => {
            const active = isActive(item.path);
            return (
              <button
                key={index}
                onClick={() => {
                  navigate(item.path);
                  setSidebarOpen(false);
                }}
                className={`sidebar__nav-item${active ? ' sidebar__nav-item--active' : ''}`}
              >
                <span className="sidebar__nav-icon">
                  <item.icon size={18} />
                </span>
                <span className="sidebar__nav-label">{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="sidebar__bottom">
          <button
            className={`sidebar__nav-item${isActive('/usersettings') ? ' sidebar__nav-item--active' : ''}`}
            onClick={() => {
              navigate('/usersettings');
              setSidebarOpen(false);
            }}
          >
            <span className="sidebar__nav-icon"><Settings size={18} /></span>
            <span className="sidebar__nav-label">Settings</span>
          </button>
          <button
            className="sidebar__nav-item sidebar__nav-item--logout"
            onClick={() => {
              localStorage.removeItem('token');
              localStorage.removeItem('user');
              sessionStorage.removeItem('token');
              sessionStorage.removeItem('user');
              navigate('/userlogin');
              setSidebarOpen(false);
            }}
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