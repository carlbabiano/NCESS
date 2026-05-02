import { useState, useEffect } from 'react'; 
import { io } from 'socket.io-client';
import UserSidebar from '../../components/usersidebar';
import UserTopbar from '../../components/usertopbar';
import './userannouncements.css';


const API_URL = import.meta.env.VITE_BACKEND_URL;
const FILTERS = ['All','Environment','Health','Safety','Events','Services'];

const FILTER_CLASS = {
  All:         'uann-filter--all',
  Environment: 'uann-filter--environment',
  Health:      'uann-filter--health',
  Safety:      'uann-filter--safety',
  Events:      'uann-filter--events',
  Services:    'uann-filter--services',
};

const CAT_CLASS = {
  Health:      'uann-cat--health',
  Environment: 'uann-cat--environment',
  Events:      'uann-cat--events',
  Safety:      'uann-cat--safety',
  Services:    'uann-cat--services',
};

const fmtDateTime = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
};

export default function UserAnnouncements() {
  const [sidebarOpen, setSidebarOpen]   = useState(false);
  const [filter, setFilter]             = useState('All');
  const [search, setSearch]             = useState('');
  const [selected, setSelected]         = useState(null);
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading]           = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res  = await fetch(`${API_URL}/announcements`);
        const data = await res.json();
        setAnnouncements(data);
      } catch {
        console.error('Failed to load announcements');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  /* ── Real-time sync via Socket.io ── */
  useEffect(() => {
    const token =
      localStorage.getItem('token') ||
      sessionStorage.getItem('token') || '';

    const socketUrl = import.meta.env.VITE_SOCKET_URL || import.meta.env.VITE_BACKEND_URL?.replace('/api', '') || '';
    console.log('[Socket.io] Attempting to connect to:', socketUrl);

    const socket = io(socketUrl, {
      auth: { token },
      transports: ['websocket'],
    });

    socket.on('connect', () => {
      console.log('[Socket.io] ✓ Connected. Socket ID:', socket.id);
    });

    socket.on('disconnect', () => {
      console.log('[Socket.io] ✗ Disconnected');
    });

    socket.on('connect_error', (error) => {
      console.error('[Socket.io] Connection error:', error);
    });

    socket.on('announcement_created', (ann) => {
      console.log('[Socket.io] announcement_created:', ann._id);
      console.log('[Socket.io] Announcement details:', { title: ann.title, category: ann.category });
      setAnnouncements((prev) => {
        if (prev.some((a) => a._id === ann._id)) {
          console.log('[Socket.io] Announcement already exists, skipping duplicate');
          return prev;
        }
        console.log('[Socket.io] Adding new announcement to list');
        return [ann, ...prev];
      });
    });

    socket.on('announcement_updated', (updated) => {
      console.log('[Socket.io] announcement_updated:', updated._id);
      console.log('[Socket.io] Updated announcement details:', { title: updated.title, category: updated.category });
      setAnnouncements((prev) => {
        const found = prev.some((a) => a._id === updated._id);
        if (found) {
          console.log('[Socket.io] Updating existing announcement in list');
        } else {
          console.log('[Socket.io] WARNING: Updated announcement not found in list, adding it');
        }
        return prev.map((a) => (a._id === updated._id ? updated : a));
      });
      // Keep modal in sync if the updated announcement is open
      setSelected((prev) => (prev?._id === updated._id ? updated : prev));
    });

    socket.on('announcement_deleted', ({ _id }) => {
      console.log('[Socket.io] announcement_deleted:', _id);
      setAnnouncements((prev) => prev.filter((a) => a._id !== _id));
      // Close modal if the deleted announcement was open
      setSelected((prev) => (prev?._id === _id ? null : prev));
    });

    return () => socket.disconnect();
  }, []);

  const displayed = announcements
    .filter((a) => {
      const q = search.trim().toLowerCase();
      return (filter === 'All' || a.category === filter) &&
        (!q || [a.title, a.body, a.category, a.author]
          .some((value) => String(value || '').toLowerCase().includes(q)));
    })
    .sort((a, b) => {
      if (b.pinned !== a.pinned) return (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0);
      return new Date(b.createdAt) - new Date(a.createdAt);
    });

  return (
    <div style={{ display:'flex', minHeight:'100vh' }}>
      <UserSidebar sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />
      <div style={{ flex:1, minWidth:0, display:'flex', flexDirection:'column', height:'100vh' }}>
        <UserTopbar
          placeholder="Search announcements..."
          search={search}
          onSearch={setSearch}
          onHamburger={() => setSidebarOpen(v => !v)}
          sidebarOpen={sidebarOpen}
          setSidebarOpen={setSidebarOpen}
        />
        <div style={{ flex:1, overflowY:'auto' }}>
        <div className="uann-page">
          <div className="uann-header"><h1>Announcements</h1><p>Stay informed with the latest updates from your barangay.</p></div>

          <div className="uann-body">
            <div className="uann-filters">
              {FILTERS.map(f => (
                <button
                  key={f}
                  className={`uann-filter-btn ${FILTER_CLASS[f]}${filter===f?' uann-filter-btn--active':''}`}
                  onClick={() => setFilter(f)}
                >{f}</button>
              ))}
            </div>

            <div className="uann-list">
              {displayed.map(a => (
                <div className="uann-card" key={a._id}>
                  <div className="uann-card__img-wrap">
                    {a.image
                      ? <img src={a.image} alt={a.title} className="uann-card__img" />
                      : <div className="uann-card__no-img"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="32" height="32"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg><span>No Image Provided</span></div>
                    }
                    <span className={`uann-card__cat ${CAT_CLASS[a.category]}`}>{a.category}</span>
                    {a.pinned && (
                      <span className="uann-card__pinned">
                        📌 Pinned by Admin
                      </span>
                    )}
                  </div>
                  <div className="uann-card__body">
                    <p className="uann-card__meta"><span className="uann-card__author">{a.author}</span></p>
                    <h2 className="uann-card__title">{a.title}</h2>
                    <p className="uann-card__desc">{a.body}</p>
                    <div className="uann-card__footer">
                      <button className="uann-read-btn" onClick={() => setSelected(a)}>Read Full Announcement</button>
                    </div>
                    <div className="uann-card__timestamps">
                      <span className="uann-card__ts">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="12" height="12"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                        Posted: {fmtDateTime(a.createdAt)}
                      </span>
                      {a.updatedAt && a.updatedAt !== a.createdAt && (
                        <span className="uann-card__ts uann-card__ts--updated">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="12" height="12"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                          Updated: {fmtDateTime(a.updatedAt)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {displayed.length===0 && <div className="uann-empty">No announcements found.</div>}
            </div>
          </div>
        </div>

        </div>{/* end scrollable */}

        {selected && (
          <div className="uann-overlay" onClick={() => setSelected(null)}>
            <div className="uann-modal" onClick={e => e.stopPropagation()}>
              <div className="uann-modal__img-wrap">
                {selected.image
                  ? <img src={selected.image} alt={selected.title} />
                  : <div className="uann-modal__no-img"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="36" height="36"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg><span>No Image Provided</span></div>
                }
                <span className={`uann-card__cat ${CAT_CLASS[selected.category]}`}>{selected.category}</span>
                <button className="uann-modal__close" onClick={() => setSelected(null)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
              </div>
              <div className="uann-modal__body">
                <p className="uann-card__meta"><span className="uann-card__author">{selected.author}</span></p>
                <h2 className="uann-modal__title">{selected.title}</h2>
                <p className="uann-modal__desc">{selected.body}</p>
                <div className="uann-card__timestamps uann-modal__timestamps">
                  <span className="uann-card__ts">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="12" height="12"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                    Posted: {fmtDateTime(selected.createdAt)}
                  </span>
                  {selected.updatedAt && selected.updatedAt !== selected.createdAt && (
                    <span className="uann-card__ts uann-card__ts--updated">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="12" height="12"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                      Updated: {fmtDateTime(selected.updatedAt)}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>{/* end outer flex col */}
    </div>
  );
}