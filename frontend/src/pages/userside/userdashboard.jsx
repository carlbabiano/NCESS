import { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import UserSidebar from '../../components/usersidebar';
import UserTopbar from '../../components/usertopbar';
import './userannouncements.css';
import './userdashboard.css';

const API_URL = import.meta.env.VITE_BACKEND_URL;
const SOCK = import.meta.env.VITE_SOCKET_URL || import.meta.env.VITE_BACKEND_URL?.replace('/api', '') || '';

const FILTERS = ['All', 'Environment', 'Health', 'Safety', 'Events', 'Services'];
const FILTER_CLASS = {
  All:         'uann-filter--all',
  Environment: 'uann-filter--environment',
  Health:      'uann-filter--health',
  Safety:      'uann-filter--safety',
  Events:      'uann-filter--events',
  Services:    'uann-filter--services',
};

function getToken() {
  return (
    localStorage.getItem('token') ||
    sessionStorage.getItem('token') ||
    localStorage.getItem('userToken') ||
    sessionStorage.getItem('userToken') ||
    ''
  );
}

function getUserFromToken() {
  try {
    const token = getToken();
    if (!token) return null;
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload;
  } catch { return null; }
}

function formatTime(date) {
  return new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

const CAT_CLASS = {
  Health:      'uann-cat--health',
  Environment: 'uann-cat--environment',
  Events:      'uann-cat--events',
  Safety:      'uann-cat--safety',
  Services:    'uann-cat--services',
};

const PURPOSES = [
  'Barangay Clearance',
  'Indigency Certificate',
  'Barangay ID',
  'Health Certificate',
  'Business Permit',
  'Complaint Filing',
];

function fmtDateTime(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  return d.toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  });
}

function StatCard({ label, value, note, icon, tone }) {
  return (
    <div className="udsh-stat">
      <div className="udsh-stat__content">
        <p className="udsh-stat__label">{label}</p>
        <p className="udsh-stat__value">{value}</p>
        <p className="udsh-stat__delta">{note}</p>
      </div>
      <div className={`udsh-stat__icon udsh-stat__icon--${tone}`}>
        {icon}
      </div>
    </div>
  );
}

function AnnouncementPost({ item, onRead }) {
  const catClass = CAT_CLASS[item.category] || 'uann-cat--update';
  const hasUpdated = item.updatedAt && item.updatedAt !== item.createdAt;

  return (
    <article className="uann-card udsh-announcement-card">
      <div className="uann-card__img-wrap">
        {item.image
          ? <img src={item.image} alt={item.title} className="uann-card__img" />
          : (
            <div className="uann-card__no-img">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="32" height="32"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
              <span>No Image Provided</span>
            </div>
          )
        }
        <span className={`uann-card__cat ${catClass}`}>{item.category || 'Update'}</span>
        {item.pinned && <span className="uann-card__pinned">Pinned by Admin</span>}
      </div>
      <div className="uann-card__body">
        <p className="uann-card__meta">
          <span className="uann-card__author">{item.author || 'Barangay New Cabalan'}</span>
        </p>
        <h2 className="uann-card__title">{item.title}</h2>
        <p className="uann-card__desc">{item.body}</p>
        <div className="uann-card__footer">
          <button className="uann-read-btn" type="button" onClick={() => onRead(item)}>Read Full Announcement</button>
        </div>
        <div className="uann-card__timestamps">
          <span className="uann-card__ts">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="12" height="12"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            Posted: {fmtDateTime(item.createdAt)}
          </span>
          {hasUpdated && (
            <span className="uann-card__ts uann-card__ts--updated">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="12" height="12"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              Updated: {fmtDateTime(item.updatedAt)}
            </span>
          )}
        </div>
      </div>
    </article>
  );
}

function UserDashboard() {
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('All');
  const [appointments, setAppointments] = useState([]);
  const [complaints, setComplaints] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [selectedAnnouncement, setSelectedAnnouncement] = useState(null);
  const [loading, setLoading] = useState(true);

  // Chat widget state
  const [showChatWidget, setShowChatWidget] = useState(false);
  const [showFloatingWidget, setShowFloatingWidget] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [chatConversation, setChatConversation] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(true);
  const [chatSending, setChatSending] = useState(false);
  const [adminTyping, setAdminTyping] = useState(false);
  const [connected, setConnected] = useState(false);

  const socketRef = useRef(null);
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const typingTimer = useRef(null);
  const currentUser = getUserFromToken();

  useEffect(() => {
    async function fetchAll() {
      setLoading(true);
      try {
        const token = getToken();
        const [aptRes, cmpRes, annRes] = await Promise.all([
          fetch(`${API_URL}/appointments`, { headers: { Authorization: `Bearer ${token}` } }),
          fetch(`${API_URL}/complaints`, { headers: { Authorization: `Bearer ${token}` } }),
          fetch(`${API_URL}/announcements`),
        ]);
        setAppointments(aptRes.ok ? await aptRes.json() : []);
        setComplaints(cmpRes.ok ? await cmpRes.json() : []);
        setAnnouncements(annRes.ok ? await annRes.json() : []);
      } catch {
        setAppointments([]);
        setComplaints([]);
        setAnnouncements([]);
      } finally {
        setLoading(false);
      }
    }
    fetchAll();
  }, []);

  // ── Chat: Load conversation ──────────────────────────────────────────────
  const loadChatConversation = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    setChatLoading(true);
    try {
      const res = await fetch(`${API_URL}/chat/my-conversation`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const conv = await res.json();
      setChatConversation(conv);

      const mRes = await fetch(`${API_URL}/chat/conversations/${conv._id}/messages`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const msgs = await mRes.json();
      // Ensure msgs is always an array
      setChatMessages(Array.isArray(msgs) ? msgs : (msgs?.messages || []));
    } catch (err) {
      console.error('Chat load error:', err);
      setChatMessages([]);
    } finally {
      setChatLoading(false);
    }
  }, []);

  // ── Chat: Socket.io setup ───────────────────────────────────────────────
  useEffect(() => {
    const token = getToken();
    if (!token) return;

    const socket = io(SOCK, { auth: { token }, transports: ['websocket'], reconnection: true, reconnectionAttempts: 10 });
    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('[Socket.io] Dashboard connected:', socket.id);
      setConnected(true);
    });
    socket.on('disconnect', () => {
      console.log('[Socket.io] Dashboard disconnected');
      setConnected(false);
    });

    socket.on('new_message', (msg) => {
      setChatMessages(prev => {
        let filtered = prev.filter(m => !(m.optimistic && m.text === msg.text && m.sender === msg.sender));
        if (filtered.find(m => m._id === msg._id)) return filtered;
        return [...filtered, msg];
      });
      setAdminTyping(false);
    });

    socket.on('user_typing', ({ isAdmin }) => {
      if (isAdmin) setAdminTyping(true);
    });

    socket.on('user_stopped_typing', () => setAdminTyping(false));

    // ── Announcements: Real-time updates ─────────────────────────────────
    socket.on('announcement_created', (ann) => {
      console.log('[Socket.io] announcement_created in dashboard:', ann._id);
      setAnnouncements(prev => {
        if (prev.some((a) => a._id === ann._id)) return prev;
        return [ann, ...prev];
      });
    });

    socket.on('announcement_updated', (updated) => {
      console.log('[Socket.io] announcement_updated in dashboard:', updated._id);
      setAnnouncements(prev =>
        prev.map((a) => (a._id === updated._id ? updated : a))
      );
      if (selectedAnnouncement?._id === updated._id) {
        setSelectedAnnouncement(updated);
      }
    });

    socket.on('announcement_deleted', ({ _id }) => {
      console.log('[Socket.io] announcement_deleted in dashboard:', _id);
      setAnnouncements(prev => prev.filter((a) => a._id !== _id));
      if (selectedAnnouncement?._id === _id) {
        setSelectedAnnouncement(null);
      }
    });

    return () => socket.disconnect();
  }, []);

  // ── Chat: Join room ─────────────────────────────────────────────────────
  useEffect(() => {
    if (chatConversation && socketRef.current) {
      socketRef.current.emit('join_conversation', chatConversation._id);
    }
  }, [chatConversation]);

  useEffect(() => { loadChatConversation(); }, [loadChatConversation]);

  // ── Chat: Auto-scroll ───────────────────────────────────────────────────
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    container.scrollTop = container.scrollHeight;
  }, [chatMessages, adminTyping]);

  // ── Chat: Send message ──────────────────────────────────────────────────
  const sendChatMessage = async () => {
    if (!chatInput.trim() || !chatConversation || chatSending) return;
    setChatSending(true);

    const optimistic = {
      _id: `opt_${Date.now()}`,
      text: chatInput.trim(),
      sender: 'user',
      senderName: currentUser?.fullName || 'You',
      createdAt: new Date().toISOString(),
      optimistic: true,
    };
    setChatMessages(prev => [...prev, optimistic]);
    setChatInput('');

    if (socketRef.current) {
      socketRef.current.emit('typing_stop', { conversationId: chatConversation._id });
      socketRef.current.emit('send_message', {
        conversationId: chatConversation._id,
        text: optimistic.text,
      });
    } else {
      const token = getToken();
      await fetch(`${API_URL}/chat/conversations/${chatConversation._id}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: optimistic.text }),
      });
      await loadChatConversation();
    }

    setChatSending(false);
  };

  const handleChatKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage(); }
  };

  const handleChatInputChange = (e) => {
    setChatInput(e.target.value);
    if (!chatConversation || !socketRef.current) return;
    socketRef.current.emit('typing_start', { conversationId: chatConversation._id });
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => {
      socketRef.current?.emit('typing_stop', { conversationId: chatConversation._id });
    }, 1500);
  };

  const activeAppointments = useMemo(
    () => appointments.filter(a => ['Pending', 'Approved', 'Scheduled'].includes(a.status)),
    [appointments]
  );
  const nextApt = useMemo(() => {
    const future = activeAppointments
      .filter(a => a.date)
      .sort((a, b) => new Date(`${a.date} ${a.time || ''}`) - new Date(`${b.date} ${b.time || ''}`));
    return future[0] || null;
  }, [activeAppointments]);
  const openComplaints = complaints.filter(c => c.status === 'In Progress' || c.status === 'Pending');
  const resolvedComplaints = complaints.filter(c => c.status === 'Resolved');
  const docPurposes = ['Barangay Clearance', 'Indigency Certificate', 'Barangay ID', 'Health Certificate', 'Business Permit', 'Senior Citizen ID', 'PWD ID', 'Cedula Issuance'];
  const documentsRequested = appointments.filter(a => docPurposes.includes(a.purpose)).length;
  const docsReady = appointments.filter(a => ['Completed', 'Closed'].includes(a.status) && docPurposes.includes(a.purpose)).length;
  const normalizedSearch = search.trim().toLowerCase();

  // Sort pinned first, then newest, with category filter
  const feed = announcements
    .filter((a) => {
      const matchFilter = filter === 'All' || a.category === filter;
      if (!normalizedSearch) return matchFilter;
      return matchFilter && [a.title, a.body, a.category, a.author]
        .some((value) => String(value || '').toLowerCase().includes(normalizedSearch));
    })
    .sort((a, b) => {
      if (b.pinned !== a.pinned) return (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0);
      return new Date(b.createdAt) - new Date(a.createdAt);
    });

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <UserSidebar sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />
      <div className="udsh-shell">
        <div className="udsh-page">
          <UserTopbar
            placeholder="Search dashboard..."
            search={search}
            onSearch={setSearch}
            onHamburger={() => setSidebarOpen(v => !v)}
            sidebarOpen={sidebarOpen}
            setSidebarOpen={setSidebarOpen}
          />

          <main className="udsh-main">
            <div className="udsh-heading">
              <div>
                <h1>Community Feed</h1>
                <p>Announcements, services, and support updates from Barangay New Cabalan.</p>
              </div>
              <div className="udsh-stats-toggle-group">
                <button
                  className="udsh-stats-toggle"
                  onClick={() => setShowStats(!showStats)}
                  title={showStats ? 'Hide stats' : 'Show stats'}
                  aria-label={showStats ? 'Hide stats' : 'Show stats'}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                  </svg>
                  {showStats ? 'Hide Stats' : 'My Stats'}
                </button>
              </div>
            </div>

            <div className={`udsh-stats ${showStats ? 'udsh-stats--visible' : ''}`}>
              <StatCard
                label="Active Appointments"
                value={activeAppointments.length}
                note={nextApt ? `Next: ${nextApt.date}` : 'No upcoming'}
                tone="blue"
                icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>}
              />
              <StatCard
                label="Open Complaints"
                value={openComplaints.length}
                note={openComplaints.length ? 'Awaiting updates' : 'None open'}
                tone="amber"
                icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><circle cx="12" cy="16" r=".5" fill="currentColor"/></svg>}
              />
              <StatCard
                label="Resolved Complaints"
                value={resolvedComplaints.length}
                note={resolvedComplaints.length ? 'Completed cases' : 'No resolved cases'}
                tone="green"
                icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M9 12l2 2 4-4"/></svg>}
              />
              <StatCard
                label="Documents Requested"
                value={documentsRequested}
                note={docsReady ? `${docsReady} ready to pick up` : 'None ready'}
                tone="violet"
                icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>}
              />
            </div>

            <div className="udsh-feed-layout">
              {/* ── Scrollable feed ── */}
              <section className="udsh-feed">
                <div className="udsh-feed__header">
                  <div>
                    <h2>Announcements Feed</h2>
                    <p>Scroll through the latest official barangay posts.</p>
                  </div>
                </div>
                <div className="udsh-feed__filters">
                  {FILTERS.map(f => (
                    <button
                      key={f}
                      className={`uann-filter-btn ${FILTER_CLASS[f]}${filter === f ? ' uann-filter-btn--active' : ''}`}
                      onClick={() => setFilter(f)}
                    >{f}</button>
                  ))}
                </div>

                <div className="udsh-feed__scroll">
                  {loading && <div className="udsh-feed-empty">Loading announcements...</div>}
                  {!loading && feed.length === 0 && (
                    <div className="udsh-feed-empty">
                      {normalizedSearch ? `No announcements found for "${search}".` : 'No announcements yet.'}
                    </div>
                  )}
                  {feed.map((item) => (
                    <AnnouncementPost key={item._id} item={item} onRead={setSelectedAnnouncement} />
                  ))}
                </div>
              </section>

              {/* ── Sticky side panel ── */}
              <aside className="udsh-side">
                {/* Barangay Support */}
                <section className="udsh-support-card">
                  <div className="udsh-support-card__icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
                    </svg>
                  </div>
                  <h2>Barangay Support</h2>
                  <p>Need help with requirements, documents, or a concern? Start a chat with barangay staff.</p>
                  <button onClick={() => navigate('/userbarangaysupport')}>Open Support Chat</button>
                </section>

                {/* Quick Actions */}
                <section className="udsh-panel">
                  <div className="udsh-panel__header">
                    <h2 className="udsh-panel__title">Quick Actions</h2>
                  </div>
                  <div className="udsh-quicklinks">
                    {PURPOSES.map((purpose) => (
                      <button
                        key={purpose}
                        className="udsh-quicklink"
                        type="button"
                        onClick={() => navigate('/userappointments', { state: { quickPurpose: purpose } })}
                      >
                        {purpose}
                      </button>
                    ))}
                  </div>
                </section>
              </aside>
            </div>
          </main>
        </div>

        {selectedAnnouncement && (
          <div className="uann-overlay" onClick={() => setSelectedAnnouncement(null)}>
            <div className="uann-modal" onClick={(e) => e.stopPropagation()}>
              <div className="uann-modal__img-wrap">
                {selectedAnnouncement.image ? (
                  <img src={selectedAnnouncement.image} alt={selectedAnnouncement.title} />
                ) : (
                  <div className="uann-modal__no-img">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="36" height="36"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                    <span>No Image Provided</span>
                  </div>
                )}
                <span className={`uann-card__cat ${CAT_CLASS[selectedAnnouncement.category] || 'uann-cat--update'}`}>
                  {selectedAnnouncement.category || 'Update'}
                </span>
                <button className="uann-modal__close" type="button" onClick={() => setSelectedAnnouncement(null)} aria-label="Close announcement">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
              <div className="uann-modal__body">
                <p className="uann-card__meta">
                  <span className="uann-card__author">{selectedAnnouncement.author || 'Barangay New Cabalan'}</span>
                </p>
                <h2 className="uann-modal__title">{selectedAnnouncement.title}</h2>
                <p className="uann-modal__desc">{selectedAnnouncement.body}</p>
                <div className="uann-card__timestamps uann-modal__timestamps">
                  <span className="uann-card__ts">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="12" height="12"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                    Posted: {fmtDateTime(selectedAnnouncement.createdAt)}
                  </span>
                  {selectedAnnouncement.updatedAt && selectedAnnouncement.updatedAt !== selectedAnnouncement.createdAt && (
                    <span className="uann-card__ts uann-card__ts--updated">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="12" height="12"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                      Updated: {fmtDateTime(selectedAnnouncement.updatedAt)}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Floating Quick Actions Widget (Mobile Only) ── */}
        <button
          className="udsh-floating-widget-btn"
          onClick={() => setShowFloatingWidget(true)}
          title="Quick actions"
          aria-label="Quick actions"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
          </svg>
        </button>

        {showFloatingWidget && (
          <div className="udsh-floating-widget-overlay" onClick={() => setShowFloatingWidget(false)}>
            <div className="udsh-floating-widget-panel" onClick={e => e.stopPropagation()}>
              <div className="udsh-floating-widget-header">
                <h3 className="udsh-floating-widget-title">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
                  </svg>
                  Quick Actions
                </h3>
                <button
                  onClick={() => setShowFloatingWidget(false)}
                  className="udsh-floating-widget-close"
                  aria-label="Close actions"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
              <div className="udsh-floating-widget-body">
                {PURPOSES.map((purpose) => (
                  <button
                    key={purpose}
                    className="udsh-floating-widget-item"
                    onClick={() => {
                      navigate('/userappointments', { state: { quickPurpose: purpose } });
                      setShowFloatingWidget(false);
                    }}
                  >
                    {purpose}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Floating Chat Widget (Mobile Only) ── */}
        {/* Floating button */}
        <button
          className="udsh-chat-widget-btn"
          onClick={() => setShowChatWidget(true)}
          title="Open chat support"
          aria-label="Open chat support"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
          </svg>
        </button>

        {/* Chat panel modal */}
        {showChatWidget && (
          <div className="udsh-chat-widget-overlay">
            <div className="udsh-chat-widget-panel">
              {/* Header */}
              <div className="udsh-chat-widget-header">
                <div>
                  <p className="udsh-chat-widget-title">Barangay Support</p>
                  <p className="udsh-chat-widget-status">
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: connected ? '#16a34a' : '#9ca3af', display: 'inline-block', marginRight: 4 }}/>
                    {connected ? 'Online' : 'Connecting...'}
                  </p>
                </div>
                <button
                  onClick={() => setShowChatWidget(false)}
                  className="udsh-chat-widget-close"
                  aria-label="Close chat"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>

              {/* Messages */}
              <div ref={messagesContainerRef} className="udsh-chat-widget-messages">
                {chatLoading ? (
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <p style={{ color: '#9ca3af', fontSize: 13 }}>Loading messages…</p>
                  </div>
                ) : !Array.isArray(chatMessages) || chatMessages.length === 0 ? (
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                    <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2" style={{ width: 18, height: 18 }}>
                        <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
                      </svg>
                    </div>
                    <p style={{ fontSize: 13, fontWeight: 600, color: '#374151', margin: 0 }}>Start a conversation</p>
                    <p style={{ fontSize: 12, color: '#9ca3af', margin: 0, textAlign: 'center' }}>Send a message and a barangay official will respond shortly.</p>
                  </div>
                ) : (
                  Array.isArray(chatMessages) && chatMessages.map((msg) => {
                    const isMe = msg.sender === 'user';
                    return (
                      <div key={msg._id} style={{ display: 'flex', justifyContent: isMe ? 'flex-end' : 'flex-start', gap: 8, alignItems: 'flex-end', marginBottom: 10 }}>
                        {!isMe && (
                          <div style={{ width: 24, height: 24, borderRadius: '50%', background: '#1e40af', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 9, fontWeight: 700, color: '#fff' }}>
                            BA
                          </div>
                        )}
                        <div style={{ maxWidth: '70%' }}>
                          {!isMe && (
                            <p style={{ fontSize: 10, color: '#9ca3af', margin: '0 0 2px 4px' }}>Barangay Admin</p>
                          )}
                          <div style={{
                            padding: '8px 12px',
                            borderRadius: isMe ? '12px 12px 3px 12px' : '12px 12px 12px 3px',
                            background: isMe ? '#2563eb' : '#fff',
                            color: isMe ? '#fff' : '#111827',
                            fontSize: 12,
                            lineHeight: 1.4,
                            border: isMe ? 'none' : '1px solid #e9ecef',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                            opacity: msg.optimistic ? 0.7 : 1,
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word',
                          }}>
                            {msg.text}
                          </div>
                          <p style={{ fontSize: 9, color: '#9ca3af', margin: '2px 4px 0', textAlign: isMe ? 'right' : 'left' }}>
                            {formatTime(msg.createdAt)}
                          </p>
                        </div>
                      </div>
                    );
                  })
                )}

                {/* Typing indicator */}
                {adminTyping && (
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
                    <div style={{ width: 24, height: 24, borderRadius: '50%', background: '#1e40af', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 9, fontWeight: 700, color: '#fff' }}>BA</div>
                    <div style={{ padding: '8px 12px', borderRadius: '12px 12px 12px 3px', background: '#fff', border: '1px solid #e9ecef', display: 'flex', gap: 3, alignItems: 'center' }}>
                      {[0,1,2].map(i => (
                        <span key={i} style={{ width: 4, height: 4, borderRadius: '50%', background: '#9ca3af', display: 'inline-block', animation: `udshPulse 1.2s ease-in-out ${i * 0.2}s infinite` }}/>
                      ))}
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef}/>
              </div>

              {/* Input */}
              <div className="udsh-chat-widget-input-wrapper">
                <textarea
                  value={chatInput}
                  onChange={handleChatInputChange}
                  onKeyDown={handleChatKeyDown}
                  placeholder="Type a message…"
                  rows={1}
                  disabled={chatSending || chatLoading}
                  style={{
                    flex: 1, padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: 8,
                    fontSize: 12, fontFamily: 'DM Sans, sans-serif', color: '#374151',
                    resize: 'none', outline: 'none', lineHeight: 1.4,
                  }}
                />
                <button
                  onClick={sendChatMessage}
                  disabled={!chatInput.trim() || chatSending || chatLoading}
                  style={{
                    width: 32, height: 32, borderRadius: 8, border: 'none',
                    background: chatInput.trim() ? '#2563eb' : '#e5e7eb',
                    color: '#fff', cursor: chatInput.trim() ? 'pointer' : 'default',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0, transition: 'background 0.15s',
                  }}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ width: 14, height: 14 }}>
                    <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
                  </svg>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default UserDashboard;