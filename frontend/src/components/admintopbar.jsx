import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import './admintopbar.css';

const API = import.meta.env.VITE_BACKEND_URL;
const ADMIN_NOTIF_SEEN_KEY = 'atb_notification_seen';

const EMPTY_SEEN = {
  chatAll: '',
  chatByConv: {},
  complaints: '',
  appointments: '',
  accountApprovals: '',
  profileUpdates: '',
};

function getAdminToken() {
  return (
    localStorage.getItem('admin_token')   ||
    sessionStorage.getItem('admin_token') ||
    localStorage.getItem('adminToken')    ||
    sessionStorage.getItem('adminToken')  || ''
  );
}

function getStoredAdmin() {
  try {
    const raw = localStorage.getItem('admin') || sessionStorage.getItem('admin');
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function decodeAdminToken(token) {
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(base64));
  } catch {
    return {};
  }
}

const ROLE_LABELS = {
  barangaycaptain: 'Barangay Captain',
  secretary: 'Secretary',
  treasurer: 'Treasurer',
  barangaytanod: 'Barangay Tanod',
  clerk: 'Clerk',
};

function normalizeAdminProfile(admin = {}) {
  return {
    _id: admin._id || admin.id || '',
    firstName: admin.firstName || '',
    lastName: admin.lastName || '',
    email: admin.email || '',
    mobileNo: admin.mobileNo || '',
    role: admin.role || admin.adminRole || '',
    accountStatus: admin.accountStatus || 'active',
    createdAt: admin.createdAt || '',
  };
}

function formatProfileDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });
}

function latestTimestamp(items) {
  return items.reduce((latest, item) => {
    const ts = itemTimestamp(item);
    if (!ts) return latest;
    if (!latest) return ts;
    return new Date(ts).getTime() > new Date(latest).getTime() ? ts : latest;
  }, '');
}

function itemTimestamp(item) {
  if (!item) return '';
  return [item.updatedAt, item.createdAt, item.reviewedAt]
    .filter(Boolean)
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] || '';
}

function newerTimestamp(a, b) {
  if (!a) return b || '';
  if (!b) return a || '';
  return new Date(a).getTime() >= new Date(b).getTime() ? a : b;
}

function isNewerThanSeen(ts, seenTs) {
  if (!ts) return !seenTs;
  if (!seenTs) return true;
  const time = new Date(ts).getTime();
  const seenTime = new Date(seenTs).getTime();
  if (!Number.isFinite(time) || !Number.isFinite(seenTime)) return true;
  return time > seenTime;
}

function countItemsAfterSeen(items, seenTs) {
  return items.reduce((sum, item) => (
    isNewerThanSeen(itemTimestamp(item), seenTs) ? sum + 1 : sum
  ), 0);
}

function loadAdminSeen() {
  try {
    const parsed = JSON.parse(localStorage.getItem(ADMIN_NOTIF_SEEN_KEY) || '{}');
    return {
      ...EMPTY_SEEN,
      ...parsed,
      chatByConv: parsed.chatByConv || {},
    };
  } catch {
    return { ...EMPTY_SEEN };
  }
}

function saveAdminSeen(seen) {
  try {
    localStorage.setItem(ADMIN_NOTIF_SEEN_KEY, JSON.stringify(seen));
  } catch {
    /* ignore storage failures */
  }
}

function unseenChatCount(convs, seen) {
  return convs.reduce((sum, conv) => {
    const convSeen = newerTimestamp(seen.chatAll, seen.chatByConv?.[conv._id]);
    return isNewerThanSeen(conv.lastMessageAt, convSeen)
      ? sum + (conv.unreadAdmin || 0)
      : sum;
  }, 0);
}

function incrementGroup(setGroup, ts) {
  setGroup(prev => prev
    ? { ...prev, count: prev.count + 1, lastTs: ts || prev.lastTs }
    : { count: 1, lastTs: ts || new Date().toISOString() }
  );
}

function decrementGroup(setGroup, ts) {
  setGroup(prev => {
    if (!prev) return null;
    if (prev.count <= 1) return null;
    return { ...prev, count: prev.count - 1, lastTs: ts || prev.lastTs };
  });
}

export default function AdminTopbar({ placeholder = 'Search...', search = '', onSearch, onHamburger, sidebarOpen, setSidebarOpen }) {
  const [unreadChat,          setUnreadChat]          = useState(0);
  const [chatNotifs,          setChatNotifs]          = useState([]);

  // Complaints: one grouped card { count, lastTs } or null
  const [complaintGroup,      setComplaintGroup]      = useState(null);
  const [unreadComplaints,    setUnreadComplaints]    = useState(0);

  // Appointments: one grouped card { count, lastTs } or null
  const [appointmentGroup,    setAppointmentGroup]    = useState(null);
  const [unreadAppointments,  setUnreadAppointments]  = useState(0);

  // Residents: grouped account approval + profile update request cards
  const [accountApprovalGroup, setAccountApprovalGroup] = useState(null);
  const [profileUpdateGroup,   setProfileUpdateGroup]   = useState(null);
  const [unreadResidents,      setUnreadResidents]      = useState(0);

  const [bellOpen, setBellOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [adminProfile, setAdminProfile] = useState(() => {
    const tokenProfile = decodeAdminToken(getAdminToken());
    return normalizeAdminProfile({ ...tokenProfile, ...getStoredAdmin() });
  });
  const [nowMs, setNowMs] = useState(() => new Date().getTime());
  const [seenState, setSeenState] = useState(() => loadAdminSeen());
  const bellRef = useRef(null);
  const seenRef = useRef(seenState);

  const totalUnread = unreadChat + unreadComplaints + unreadAppointments + unreadResidents;
  const adminDisplayName = [adminProfile.firstName, adminProfile.lastName].filter(Boolean).join(' ') || adminProfile.email || 'Admin';
  const adminInitials = (
    (adminProfile.firstName?.charAt(0) || '') +
    (adminProfile.lastName?.charAt(0) || '')
  ).toUpperCase() || (adminProfile.email?.charAt(0) || 'A').toUpperCase();
  const adminFields = [
    ['First Name', adminProfile.firstName || '-'],
    ['Last Name', adminProfile.lastName || '-'],
    ['Email Address', adminProfile.email || '-'],
    ['Mobile Number', adminProfile.mobileNo || '-'],
    ['Role', ROLE_LABELS[adminProfile.role] || adminProfile.role || '-'],
    ['Account Status', adminProfile.accountStatus ? adminProfile.accountStatus.charAt(0).toUpperCase() + adminProfile.accountStatus.slice(1) : '-'],
  ];

  useEffect(() => {
    seenRef.current = seenState;
  }, [seenState]);

  useEffect(() => {
    const token = getAdminToken();
    if (!token) return;

    fetch(`${API}/admin/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() : null)
      .then(admin => {
        if (!admin) return;
        const normalized = normalizeAdminProfile(admin);
        setAdminProfile(normalized);
        const storage = localStorage.getItem('admin') ? localStorage : sessionStorage;
        storage.setItem('admin', JSON.stringify({ ...normalized, adminRole: normalized.role }));
      })
      .catch(() => {});
  }, []);

  // Load initial unread chat count
  useEffect(() => {
    const token = getAdminToken();
    if (!token) return;
    fetch(`${API}/chat/admin/conversations`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() : [])
      .then(convs => {
        setUnreadChat(unseenChatCount(convs, seenRef.current));
        const pending = convs
          .filter(c => c.unreadAdmin > 0)
          .map(c => ({ convId: c._id, userName: c.userName, lastMessage: c.lastMessage, ts: c.lastMessageAt, unreadAdmin: c.unreadAdmin || 0 }));
        setChatNotifs(pending);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(new Date().getTime()), 60000);
    return () => window.clearInterval(timer);
  }, []);

  // Load initial resident work queue counts
  useEffect(() => {
    const token = getAdminToken();
    if (!token) return;

    Promise.all([
      fetch(`${API}/users`, { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.ok ? r.json() : []),
      fetch(`${API}/profile-change-requests?status=pending`, { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.ok ? r.json() : []),
    ])
      .then(([users, requests]) => {
        const pendingUsers = Array.isArray(users) ? users.filter(user => user.status === 'pending') : [];
        const pendingRequests = Array.isArray(requests) ? requests : [];

        setAccountApprovalGroup(pendingUsers.length > 0
          ? { count: pendingUsers.length, lastTs: latestTimestamp(pendingUsers) }
          : null
        );
        setProfileUpdateGroup(pendingRequests.length > 0
          ? { count: pendingRequests.length, lastTs: latestTimestamp(pendingRequests) }
          : null
        );
        setUnreadResidents(
          countItemsAfterSeen(pendingUsers, seenRef.current.accountApprovals) +
          countItemsAfterSeen(pendingRequests, seenRef.current.profileUpdates)
        );
      })
      .catch(() => {});
  }, []);

  // Socket: listen for chat + complaint + appointment events
  useEffect(() => {
    const token = getAdminToken();
    if (!token) return;
    const socket = io(
      import.meta.env.VITE_SOCKET_URL ||
      import.meta.env.VITE_BACKEND_URL?.replace('/api', '') || '',
      { auth: { token }, transports: ['websocket'], reconnection: true }
    );

    socket.on('conversation_updated', (conv) => {
      const t = getAdminToken();
      fetch(`${API}/chat/admin/conversations`, {
        headers: { Authorization: `Bearer ${t}` },
      })
        .then(r => r.ok ? r.json() : [])
        .then(convs => {
          setUnreadChat(unseenChatCount(convs, seenRef.current));
          if (conv.unreadAdmin > 0) {
            setChatNotifs(prev => {
              const without = prev.filter(n => n.convId !== conv._id);
              return [
                { convId: conv._id, userName: conv.userName, lastMessage: conv.lastMessage, ts: conv.lastMessageAt, unreadAdmin: conv.unreadAdmin || 0 },
                ...without,
              ].slice(0, 20);
            });
          }
        })
        .catch(() => {});
    });

    // 100 users filing at once = still just 1 card incrementing its counter
    socket.on('complaint_created', (complaint) => {
      const now = complaint.createdAt || new Date().toISOString();
      setComplaintGroup(prev => prev
        ? { ...prev, count: prev.count + 1, lastTs: now }
        : { count: 1, lastTs: now }
      );
      if (isNewerThanSeen(now, seenRef.current.complaints)) {
        setUnreadComplaints(prev => prev + 1);
      }
    });

    // Same pattern for appointments — 100 bookings = 1 card, not 100 rows
    socket.on('appointment_created', (appointment) => {
      const now = appointment.createdAt || new Date().toISOString();
      setAppointmentGroup(prev => prev
        ? { ...prev, count: prev.count + 1, lastTs: now }
        : { count: 1, lastTs: now }
      );
      if (isNewerThanSeen(now, seenRef.current.appointments)) {
        setUnreadAppointments(prev => prev + 1);
      }
    });

    socket.on('resident_account_submitted', (resident) => {
      const ts = itemTimestamp(resident) || new Date().toISOString();
      incrementGroup(setAccountApprovalGroup, ts);
      if (isNewerThanSeen(ts, seenRef.current.accountApprovals)) {
        setUnreadResidents(prev => prev + 1);
      }
    });

    socket.on('resident_account_status_updated', ({ user, previousStatus, status }) => {
      const ts = itemTimestamp(user) || new Date().toISOString();
      if (previousStatus === 'pending' && status !== 'pending') {
        decrementGroup(setAccountApprovalGroup, ts);
        if (isNewerThanSeen(ts, seenRef.current.accountApprovals)) {
          setUnreadResidents(prev => Math.max(0, prev - 1));
        }
      } else if (previousStatus !== 'pending' && status === 'pending') {
        incrementGroup(setAccountApprovalGroup, ts);
        if (isNewerThanSeen(ts, seenRef.current.accountApprovals)) {
          setUnreadResidents(prev => prev + 1);
        }
      }
    });

    socket.on('profile_change_request_created', (request) => {
      const ts = itemTimestamp(request) || new Date().toISOString();
      incrementGroup(setProfileUpdateGroup, ts);
      if (isNewerThanSeen(ts, seenRef.current.profileUpdates)) {
        setUnreadResidents(prev => prev + 1);
      }
    });

    socket.on('profile_change_request_updated', (request) => {
      const ts = itemTimestamp(request) || new Date().toISOString();
      if (request.previousStatus === 'pending' && request.status !== 'pending') {
        decrementGroup(setProfileUpdateGroup, ts);
        if (isNewerThanSeen(request.createdAt || ts, seenRef.current.profileUpdates)) {
          setUnreadResidents(prev => Math.max(0, prev - 1));
        }
      }
    });

    return () => socket.disconnect();
  }, []);

  // Close bell panel on outside click
  useEffect(() => {
    function handler(e) {
      if (bellOpen && bellRef.current && !bellRef.current.contains(e.target) &&
          !e.target.closest('.admin-topbar__bell')) {
        setBellOpen(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [bellOpen]);

  useEffect(() => {
    if (!profileOpen) return;
    function handler(e) {
      if (
        !e.target.closest('.admin-profile-modal') &&
        !e.target.closest('.admin-topbar__avatar')
      ) {
        setProfileOpen(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [profileOpen]);

  // Close sidebar on outside click (mobile)
  useEffect(() => {
    if (!sidebarOpen) return;
    function handler(e) {
      if (e.target.closest('.admin-topbar__hamburger')) return; // let hamburger toggle handle it
      if (e.target.closest('.sidebar')) return;                 // ignore clicks inside drawer
      setSidebarOpen?.(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [sidebarOpen, setSidebarOpen]);

  function handleBellOpen() {
    const opening = !bellOpen;
    setBellOpen(opening);
    if (opening) {
      markCurrentNotificationsSeen();
      // Clear badge counts visually when panel is opened
      setUnreadChat(0);
      setUnreadComplaints(0);
      setUnreadAppointments(0);
      setUnreadResidents(0);
    }
  }

  function persistSeen(nextSeen) {
    seenRef.current = nextSeen;
    setSeenState(nextSeen);
    saveAdminSeen(nextSeen);
  }

  function markCurrentNotificationsSeen() {
    const now = new Date().toISOString();
    const chatByConv = { ...(seenRef.current.chatByConv || {}) };
    chatNotifs.forEach(n => {
      if (n.convId) {
        chatByConv[n.convId] = newerTimestamp(chatByConv[n.convId], n.ts || now);
      }
    });

    persistSeen({
      ...seenRef.current,
      chatAll: now,
      chatByConv,
      complaints: now,
      appointments: now,
      accountApprovals: now,
      profileUpdates: now,
    });
  }

  function markSectionSeen(sectionKey, ts = new Date().toISOString()) {
    persistSeen({
      ...seenRef.current,
      [sectionKey]: newerTimestamp(seenRef.current[sectionKey], ts),
    });
  }

  function clearChat() {
    const now = new Date().toISOString();
    const chatByConv = { ...(seenRef.current.chatByConv || {}) };
    chatNotifs.forEach(n => {
      if (n.convId) chatByConv[n.convId] = newerTimestamp(chatByConv[n.convId], n.ts || now);
    });
    persistSeen({ ...seenRef.current, chatAll: now, chatByConv });
    setChatNotifs([]);
    setUnreadChat(0);
  }

  function clearComplaints() {
    markSectionSeen('complaints', complaintGroup?.lastTs || new Date().toISOString());
    setComplaintGroup(null);
    setUnreadComplaints(0);
  }

  function clearAppointments() {
    markSectionSeen('appointments', appointmentGroup?.lastTs || new Date().toISOString());
    setAppointmentGroup(null);
    setUnreadAppointments(0);
  }

  function clearResidents() {
    const now = new Date().toISOString();
    persistSeen({
      ...seenRef.current,
      accountApprovals: newerTimestamp(seenRef.current.accountApprovals, accountApprovalGroup?.lastTs || now),
      profileUpdates: newerTimestamp(seenRef.current.profileUpdates, profileUpdateGroup?.lastTs || now),
    });
    setAccountApprovalGroup(null);
    setProfileUpdateGroup(null);
    setUnreadResidents(0);
  }

  function fmtRelative(iso) {
    if (!iso) return '';
    const diff = nowMs - new Date(iso).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1)  return 'Just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  }

  const hasAnyResidentNotif = accountApprovalGroup !== null || profileUpdateGroup !== null;
  const hasAnyNotif = chatNotifs.length > 0 || complaintGroup !== null || appointmentGroup !== null || hasAnyResidentNotif;

  return (
    <header className="admin-topbar">
      {/* Hamburger — mobile only (hidden via CSS on desktop) */}
      <button
        className="admin-topbar__hamburger"
        onClick={onHamburger || (() => setSidebarOpen?.(prev => !prev))}
        aria-label="Open menu"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="22" height="22">
          <line x1="3" y1="6"  x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>
      <div className="admin-topbar__search">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          type="text"
          placeholder={placeholder}
          value={search}
          onChange={(e) => onSearch?.(e.target.value)}
        />
      </div>

      <div className="admin-topbar__actions">
        <div style={{ position: 'relative' }}>
          <button
            className={`admin-topbar__bell${bellOpen ? ' admin-topbar__bell--active' : ''}`}
            aria-label="Notifications"
            onClick={handleBellOpen}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 01-3.46 0" />
            </svg>
            {totalUnread > 0 && (
              <span className="admin-topbar__bell-badge">
                {totalUnread > 99 ? '99+' : totalUnread}
              </span>
            )}
          </button>

          {bellOpen && (
            <div className="admin-notif-panel" ref={bellRef}>

              {/* RESIDENTS SECTION */}
              <div className="admin-notif-section-header">
                <span className="admin-notif-header__title">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                    <path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2"/>
                    <circle cx="9" cy="7" r="4"/>
                    <path d="M22 21v-2a4 4 0 00-3-3.87"/>
                    <path d="M16 3.13a4 4 0 010 7.75"/>
                  </svg>
                  Residents
                </span>
                {hasAnyResidentNotif && (
                  <button className="admin-notif-clear" onClick={clearResidents}>Clear</button>
                )}
              </div>

              {hasAnyResidentNotif ? (
                <>
                  {accountApprovalGroup && (
                    <div className="admin-notif-group-card">
                      <div className="admin-notif-group-icon admin-notif-group-icon--resident">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
                          <path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2"/>
                          <circle cx="9" cy="7" r="4"/>
                          <polyline points="17 11 19 13 23 9"/>
                        </svg>
                      </div>
                      <div className="admin-notif-group-body">
                        <div className="admin-notif-group-title">
                          {accountApprovalGroup.count === 1
                            ? '1 account approval request'
                            : `${accountApprovalGroup.count} account approval requests`}
                        </div>
                        <div className="admin-notif-group-sub">
                          {accountApprovalGroup.count === 1
                            ? 'A resident is waiting for account approval.'
                            : `${accountApprovalGroup.count} residents are waiting for account approval.`}
                        </div>
                      </div>
                      <span className="admin-notif-time">{fmtRelative(accountApprovalGroup.lastTs)}</span>
                    </div>
                  )}

                  {profileUpdateGroup && (
                    <div className="admin-notif-group-card">
                      <div className="admin-notif-group-icon admin-notif-group-icon--resident-update">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
                          <path d="M12 20h9"/>
                          <path d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4 12.5-12.5z"/>
                        </svg>
                      </div>
                      <div className="admin-notif-group-body">
                        <div className="admin-notif-group-title">
                          {profileUpdateGroup.count === 1
                            ? '1 profile update request'
                            : `${profileUpdateGroup.count} profile update requests`}
                        </div>
                        <div className="admin-notif-group-sub">
                          {profileUpdateGroup.count === 1
                            ? 'A resident submitted an information update request.'
                            : `${profileUpdateGroup.count} residents submitted information update requests.`}
                        </div>
                      </div>
                      <span className="admin-notif-time">{fmtRelative(profileUpdateGroup.lastTs)}</span>
                    </div>
                  )}
                </>
              ) : (
                <div className="admin-notif-empty admin-notif-empty--sm">
                  <span>No resident updates</span>
                </div>
              )}

              <div className="admin-notif-divider" />

              {/* APPOINTMENTS SECTION */}
              <div className="admin-notif-section-header">
                <span className="admin-notif-header__title">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                    <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>
                    <line x1="3" y1="10" x2="21" y2="10"/>
                  </svg>
                  Appointments
                </span>
                {appointmentGroup && (
                  <button className="admin-notif-clear" onClick={clearAppointments}>Clear</button>
                )}
              </div>

              {appointmentGroup ? (
                <div className="admin-notif-group-card">
                  <div className="admin-notif-group-icon admin-notif-group-icon--appointment">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
                      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                      <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>
                      <line x1="3" y1="10" x2="21" y2="10"/>
                    </svg>
                  </div>
                  <div className="admin-notif-group-body">
                    <div className="admin-notif-group-title">
                      {appointmentGroup.count === 1
                        ? '1 new appointment booked'
                        : `${appointmentGroup.count} new appointments booked`}
                    </div>
                    <div className="admin-notif-group-sub">
                      {appointmentGroup.count === 1
                        ? 'A resident just booked an appointment.'
                        : `${appointmentGroup.count} residents booked appointments — review them on the Appointments page.`}
                    </div>
                  </div>
                  <span className="admin-notif-time">{fmtRelative(appointmentGroup.lastTs)}</span>
                </div>
              ) : (
                <div className="admin-notif-empty admin-notif-empty--sm">
                  <span>No new appointments</span>
                </div>
              )}

              <div className="admin-notif-divider" />

              {/* COMPLAINTS SECTION */}
              <div className="admin-notif-section-header">
                <span className="admin-notif-header__title">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                    <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                    <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                  </svg>
                  Complaints
                </span>
                {complaintGroup && (
                  <button className="admin-notif-clear" onClick={clearComplaints}>Clear</button>
                )}
              </div>

              {complaintGroup ? (
                <div className="admin-notif-group-card">
                  <div className="admin-notif-group-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
                      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                      <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                    </svg>
                  </div>
                  <div className="admin-notif-group-body">
                    <div className="admin-notif-group-title">
                      {complaintGroup.count === 1
                        ? '1 new complaint filed'
                        : `${complaintGroup.count} new complaints filed`}
                    </div>
                    <div className="admin-notif-group-sub">
                      {complaintGroup.count === 1
                        ? 'A resident just submitted a complaint.'
                        : `${complaintGroup.count} residents submitted complaints — review them on the Complaints page.`}
                    </div>
                  </div>
                  <span className="admin-notif-time">{fmtRelative(complaintGroup.lastTs)}</span>
                </div>
              ) : (
                <div className="admin-notif-empty admin-notif-empty--sm">
                  <span>No new complaints</span>
                </div>
              )}

              <div className="admin-notif-divider" />

              {/* CHAT SECTION */}
              <div className="admin-notif-section-header">
                <span className="admin-notif-header__title">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                    <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
                  </svg>
                  Chat Messages
                </span>
                {chatNotifs.length > 0 && (
                  <button className="admin-notif-clear" onClick={clearChat}>Clear</button>
                )}
              </div>

              <div className="admin-notif-list">
                {chatNotifs.length === 0 ? (
                  <div className="admin-notif-empty admin-notif-empty--sm">
                    <span>No new messages</span>
                  </div>
                ) : chatNotifs.map(n => (
                  <div key={n.convId} className="admin-notif-item">
                    <div className="admin-notif-avatar">
                      {n.userName?.charAt(0).toUpperCase() || '?'}
                    </div>
                    <div className="admin-notif-body">
                      <div className="admin-notif-name">{n.userName}</div>
                      <div className="admin-notif-msg">
                        {n.lastMessage}
                      </div>
                    </div>
                    <span className="admin-notif-time">{fmtRelative(n.ts)}</span>
                  </div>
                ))}
              </div>

              {!hasAnyNotif && (
                <div className="admin-notif-empty" style={{ paddingTop: 4 }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="28" height="28" style={{ stroke: '#d1d5db' }}>
                    <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                    <path d="M13.73 21a2 2 0 01-3.46 0"/>
                  </svg>
                  <span>All caught up!</span>
                </div>
              )}

            </div>
          )}
        </div>

        <button
          type="button"
          className="admin-topbar__avatar"
          aria-label="View admin profile"
          onClick={() => setProfileOpen(true)}
        >
          {adminInitials}
        </button>
      </div>

      {profileOpen && (
        <div className="admin-profile-overlay" onClick={(e) => { if (e.target === e.currentTarget) setProfileOpen(false); }}>
          <div className="admin-profile-modal" role="dialog" aria-modal="true" aria-label="Admin Profile">
            <div className="admin-profile-modal__header">
              <div className="admin-profile-modal__identity">
                <div className="admin-profile-modal__avatar">{adminInitials}</div>
                <div>
                  <h2>{adminDisplayName}</h2>
                  <p>{ROLE_LABELS[adminProfile.role] || adminProfile.role || 'Admin'}</p>
                </div>
              </div>
              <button className="admin-profile-modal__close" onClick={() => setProfileOpen(false)} aria-label="Close profile">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"/>
                  <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>

            <div className="admin-profile-modal__body">
              {adminFields.map(([label, value]) => (
                <div className="admin-profile-modal__row" key={label}>
                  <span>{label}</span>
                  <strong>{value}</strong>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
