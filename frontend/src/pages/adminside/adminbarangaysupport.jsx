import { useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import Sidebar     from '../../components/adminsidebar';
import AdminTopbar from '../../components/admintopbar';
import { AdminFilterBar } from '../../components/adminfilterbar';
import './adminbarangaysupport.css';

const API  = import.meta.env.VITE_BACKEND_URL
const SOCK = import.meta.env.VITE_SOCKET_URL || import.meta.env.VITE_BACKEND_URL?.replace('/api', '') || ''

function getToken() {
  return localStorage.getItem('admin_token') || sessionStorage.getItem('admin_token');
}

function formatTime(date) {
  return new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function timeAgo(date) {
  const diff = Math.floor((Date.now() - new Date(date)) / 1000);
  if (diff < 60)    return 'just now';
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return new Date(date).toLocaleDateString();
}


const STATUS_COLOR = {
  open:    { bg: '#f0fdf4', color: '#16a34a' },
  pending: { bg: '#fef9c3', color: '#854d0e' },
  closed:  { bg: '#f3f4f6', color: '#6b7280' },
};

function InitialAvatar({ name }) {
  const initials = name?.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase() || '??';
  const colors   = ['#2563eb','#7c3aed','#16a34a','#ea580c','#0891b2'];
  const idx      = name?.charCodeAt(0) % colors.length || 0;
  return (
    <div style={{
      width: 38, height: 38, borderRadius: '50%',
      background: colors[idx], color: '#fff',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 13, fontWeight: 700, flexShrink: 0,
    }}>
      {initials}
    </div>
  );
}

export default function AdminHotline() {
  const [search,          setSearch]          = useState('');
  const [sidebarOpen,     setSidebarOpen]     = useState(window.innerWidth >= 1024);
  const [conversations,   setConversations]   = useState([]);
  const [activeConvId,    setActiveConvId]    = useState(null);
  const [messages,        setMessages]        = useState([]);
  const [input,           setInput]           = useState('');
  const [loading,         setLoading]         = useState(true);
  const [msgLoading,      setMsgLoading]      = useState(false);
  const [sending,         setSending]         = useState(false);
  const [userTyping,      setUserTyping]       = useState(false);
  const [connected,       setConnected]       = useState(false);
  const [openMenu,        setOpenMenu]        = useState(null);
  const [filterStatus,    setFilterStatus]    = useState('all');
  const [mobileShowChat,  setMobileShowChat]  = useState(false);

  const socketRef      = useRef(null);
  const messagesEndRef = useRef(null);
  const typingTimer    = useRef(null);
  const prevConvRef    = useRef(null);

  const activeConv = conversations.find(c => c._id === activeConvId);

  // ── Load all conversations ─────────────────────────────────────────────────
  const loadConversations = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    try {
      const res  = await fetch(`${API}/chat/admin/conversations`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setConversations(data);
      if (!activeConvId && data.length > 0) setActiveConvId(data[0]._id);
    } catch (err) {
      console.error('Load convs error:', err);
    } finally {
      setLoading(false);
    }
  }, [activeConvId]);

  // ── Load messages for active conversation ─────────────────────────────────
  const loadMessages = useCallback(async (convId) => {
    const token = getToken();
    if (!token || !convId) return;
    setMsgLoading(true);
    try {
      const res  = await fetch(`${API}/chat/admin/conversations/${convId}/messages`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setMessages(data);
      // Reset unread count locally
      setConversations(prev => prev.map(c => c._id === convId ? { ...c, unreadAdmin: 0 } : c));
    } catch (err) {
      console.error('Load msgs error:', err);
    } finally {
      setMsgLoading(false);
    }
  }, []);

  // ── Socket.io ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const token = getToken();
    if (!token) return;

    const socket = io(SOCK, { auth: { token }, transports: ['websocket'], reconnection: true, reconnectionAttempts: 10 });
    socketRef.current = socket;

    socket.on('connect',    () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));

    socket.on('new_message', (msg) => {
      setMessages(prev => {
        // Remove optimistic message if present
        let filtered = prev.filter(m => !(m.optimistic && m.text === msg.text && m.sender === msg.sender));
        // Prevent duplicate real messages
        if (filtered.find(m => m._id === msg._id)) return filtered;
        return [...filtered, msg];
      });
      setUserTyping(false);

      // If the new message is for the active conversation and sent by user, mark as read
      if (msg.conversationId === activeConvId && msg.sender === "user") {
        // Reset unread count locally
        setConversations(prev => prev.map(c => c._id === activeConvId ? { ...c, unreadAdmin: 0 } : c));
        // Mark as read on backend and reload conversations
        const token = getToken();
        fetch(`${API}/chat/admin/conversations/${activeConvId}/read`, {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${token}` },
        }).then(() => {
          // Ensure UI is in sync with backend
          loadConversations();
        });
      }
    });

    socket.on('conversation_updated', (updatedConv) => {
      setConversations(prev => {
        const exists = prev.find(c => c._id === updatedConv._id);
        if (exists) return prev.map(c => c._id === updatedConv._id ? updatedConv : c);
        return [updatedConv, ...prev];
      });
    });

    socket.on('user_typing', ({ conversationId, isAdmin }) => {
      if (!isAdmin && conversationId === activeConvId) setUserTyping(true);
    });

    socket.on('user_stopped_typing', ({ conversationId }) => {
      if (conversationId === activeConvId) setUserTyping(false);
    });

    return () => socket.disconnect();
  }, []);

  // ── Update active conversation socket room ─────────────────────────────────
  useEffect(() => {
    if (!socketRef.current) return;
    if (prevConvRef.current) socketRef.current.emit('leave_conversation', prevConvRef.current);
    if (activeConvId)        socketRef.current.emit('join_conversation',  activeConvId);
    prevConvRef.current = activeConvId;
    setUserTyping(false);
  }, [activeConvId]);

  useEffect(() => { loadConversations(); }, []);
  useEffect(() => {
    if (activeConvId) {
      loadMessages(activeConvId);
      // Mark as read on backend
      const token = getToken();
      fetch(`${API}/chat/admin/conversations/${activeConvId}/read`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` },
      });
      // Reset unread count locally
      setConversations(prev => prev.map(c => c._id === activeConvId ? { ...c, unreadAdmin: 0 } : c));
    }
  }, [activeConvId]);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, userTyping]);

  // ── Send message ──────────────────────────────────────────────────────────
  const sendMessage = async () => {
    if (!input.trim() || !activeConvId || sending) return;
    setSending(true);

    const optimistic = {
      _id:       `opt_${Date.now()}`,
      text:      input.trim(),
      sender:    'admin',
      senderName:'Barangay Admin',
      createdAt: new Date().toISOString(),
      optimistic: true,
    };
    setMessages(prev => [...prev, optimistic]);
    setInput('');

    if (socketRef.current) {
      socketRef.current.emit('typing_stop', { conversationId: activeConvId });
      socketRef.current.emit('send_message', {
        conversationId: activeConvId,
        text:           optimistic.text,
      });
    } else {
      const token = getToken();
      await fetch(`${API}/chat/admin/conversations/${activeConvId}/messages`, {
        method:  'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body:    JSON.stringify({ text: optimistic.text }),
      });
      await loadConversations();
    }

    setSending(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const handleInputChange = (e) => {
    setInput(e.target.value);
    if (!activeConvId || !socketRef.current) return;
    socketRef.current.emit('typing_start', { conversationId: activeConvId });
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => {
      socketRef.current?.emit('typing_stop', { conversationId: activeConvId });
    }, 1500);
  };

  // ── Update conversation status ─────────────────────────────────────────────
  const updateStatus = async (convId, status) => {
    const token = getToken();
    await fetch(`${API}/chat/admin/conversations/${convId}/status`, {
      method:  'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify({ status }),
    });
    setConversations(prev => prev.map(c => c._id === convId ? { ...c, status } : c));
    setOpenMenu(null);
  };

  // ── Filtered conversations ─────────────────────────────────────────────────
  const filtered = conversations.filter(c => {
    const matchSearch = c.userName.toLowerCase().includes(search.toLowerCase()) ||
                        c.userEmail.toLowerCase().includes(search.toLowerCase());
    let matchStatus = true;
    if (filterStatus === 'unread') {
      matchStatus = c.unreadAdmin > 0;
    } else if (filterStatus === 'groups') {
      // Placeholder: show all, or update this logic if you add a group property
      matchStatus = false; // No group property, so show none for now
    }
    return matchSearch && matchStatus;
  });

  const totalUnread = conversations.reduce((s, c) => s + (c.unreadAdmin || 0), 0);

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />
      <div style={{ flex: 1, height: '100vh', overflowY: 'auto' }}>
        <div className="htl-page">

          <AdminTopbar
            placeholder="Search chat..."
            search={search}
            onSearch={setSearch}
            onHamburger={() => setSidebarOpen(v => !v)}
            sidebarOpen={sidebarOpen}
            setSidebarOpen={setSidebarOpen}
          />

          <div className="htl-heading">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div>
                <h1 style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  Chat Operator
                  {totalUnread > 0 && (
                    <span style={{ fontSize: 13, fontWeight: 700, background: '#ef4444', color: '#fff', borderRadius: 20, padding: '2px 9px' }}>
                      {totalUnread}
                    </span>
                  )}
                </h1>
                <p>Manage resident conversations and respond to inquiries in real-time.</p>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 11.5, color: connected ? '#16a34a' : '#9ca3af', display: 'flex', alignItems: 'center', gap: 5, fontWeight: 600 }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: connected ? '#16a34a' : '#9ca3af', display: 'inline-block' }}/>
                {connected ? 'Live' : 'Connecting...'}
              </span>
            </div>
          </div>

          <div className="htl-body htl-chat-body">

            {/* ── LEFT: Conversation List ── */}
            <div className={`htl-conv-list${mobileShowChat ? ' htl-conv-list--hidden' : ''}`}>
              <div style={{ padding: '14px 16px 10px', borderBottom: '1px solid #f3f4f6', flexShrink: 0 }}>
                <p style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', margin: '0 0 10px', letterSpacing: '0.4px', textTransform: 'uppercase' }}>Conversations</p>
                <AdminFilterBar
                  compact
                  groups={[{
                    value: filterStatus,
                    onChange: setFilterStatus,
                    options: [
                      { value: 'all', label: 'All' },
                      { value: 'unread', label: 'Unread' },
                    ],
                  }]}
                />
              </div>

              <div style={{ flex: 1, overflowY: 'auto' }}>
                {loading ? (
                  <div style={{ padding: 24, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>Loading…</div>
                ) : filtered.length === 0 ? (
                  <div style={{ padding: 24, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>No conversations found</div>
                ) : filtered.map(conv => (
                  <div
                    key={conv._id}
                    onClick={() => { setActiveConvId(conv._id); setMobileShowChat(true); }}
                    style={{
                      padding: '12px 16px',
                      borderBottom: '1px solid #f9fafb',
                      cursor: 'pointer',
                      background: activeConvId === conv._id ? '#eff6ff' : 'transparent',
                      borderLeft: activeConvId === conv._id ? '3px solid #2563eb' : '3px solid transparent',
                      transition: 'background 0.12s',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                      <InitialAvatar name={conv.userName} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
                          <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {conv.userName}
                          </p>
                          <span style={{ fontSize: 11, color: '#9ca3af', flexShrink: 0, marginLeft: 6 }}>{timeAgo(conv.lastMessageAt)}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                          <p style={{ margin: 0, fontSize: 12, color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                            {conv.lastMessage || 'No messages yet'}
                          </p>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
                            {conv.unreadAdmin > 0 && (
                              <span style={{ width: 18, height: 18, borderRadius: '50%', background: '#ef4444', color: '#fff', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                {conv.unreadAdmin > 9 ? '9+' : conv.unreadAdmin}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* ── RIGHT: Chat Window ── */}
            <div className={`htl-chat-window${mobileShowChat ? ' htl-chat-window--visible' : ''}`}>
              {!activeConv ? (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, color: '#9ca3af' }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ width: 40, height: 40, stroke: '#d1d5db' }}>
                    <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
                  </svg>
                  <p style={{ fontSize: 14, color: '#9ca3af', margin: 0 }}>Select a conversation to start replying</p>
                </div>
              ) : (
                <>
                  {/* Conversation Header */}
                  <div className="htl-caller htl-conv-header" style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <button className="htl-back-btn" onClick={() => setMobileShowChat(false)} aria-label="Back to conversations">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ width: 18, height: 18 }}>
                        <polyline points="15 18 9 12 15 6"/>
                      </svg>
                    </button>
                    <InitialAvatar name={activeConv.userName} />
                    <div className="htl-caller__info">
                      <div className="htl-caller__name-row">
                        <h2 className="htl-caller__name">{activeConv.userName}</h2>
                        <span className="htl-caller__verified">Resident</span>
                        <span style={{
                          fontSize: 11.5, fontWeight: 600, padding: '2px 8px', borderRadius: 6,
                          background: STATUS_COLOR[activeConv.status]?.bg,
                          color: STATUS_COLOR[activeConv.status]?.color,
                          textTransform: 'capitalize',
                        }}>{activeConv.status}</span>
                      </div>
                      <div className="htl-caller__meta-row">
                        <span className="htl-caller__meta-item">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 13, height: 13 }}><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                          {activeConv.userEmail}
                        </span>
                        <span className="htl-caller__dot">•</span>
                        <span className="htl-caller__meta-item">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 13, height: 13 }}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                          Last active: {timeAgo(activeConv.lastMessageAt)}
                        </span>
                      </div>
                    </div>
                    <div className="htl-caller__badge-wrap">
                      {/* Actions menu */}
                      <div className="htl-table__menu-wrap" onClick={e => e.stopPropagation()}>
                        <button className="htl-table__menu-btn" onClick={() => setOpenMenu(openMenu === 'header' ? null : 'header')}>
                          <svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/></svg>
                        </button>
                        {openMenu === 'header' && (
                          <div className="htl-dropdown">
                            <button className="htl-dropdown__item" onClick={() => updateStatus(activeConv._id, 'open')}>Mark as Open</button>
                            <button className="htl-dropdown__item" onClick={() => updateStatus(activeConv._id, 'pending')}>Mark as Pending</button>
                            <div className="htl-dropdown__divider"/>
                            <button className="htl-dropdown__item htl-dropdown__item--danger" onClick={() => updateStatus(activeConv._id, 'closed')}>Close Conversation</button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Messages */}
                  <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10, background: '#fafbfc' }}>
                    {msgLoading ? (
                      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <p style={{ color: '#9ca3af', fontSize: 13 }}>Loading messages…</p>
                      </div>
                    ) : messages.length === 0 ? (
                      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <p style={{ color: '#9ca3af', fontSize: 13 }}>No messages yet. Reply to start the conversation.</p>
                      </div>
                    ) : messages.map((msg) => {
                      const isAdmin = msg.sender === 'admin';
                      return (
                        <div key={msg._id} style={{ display: 'flex', justifyContent: isAdmin ? 'flex-end' : 'flex-start', gap: 8, alignItems: 'flex-end' }}>
                          {!isAdmin && <InitialAvatar name={activeConv.userName} />}
                          <div style={{ maxWidth: '68%' }}>
                            {!isAdmin && (
                              <p style={{ fontSize: 11, color: '#9ca3af', margin: '0 0 3px 4px' }}>{activeConv.userName}</p>
                            )}
                            <div style={{
                              padding: '10px 14px',
                              borderRadius: isAdmin ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                              background: isAdmin ? '#2563eb' : '#fff',
                              color: isAdmin ? '#fff' : '#111827',
                              fontSize: 13.5,
                              lineHeight: 1.5,
                              border: isAdmin ? 'none' : '1px solid #e9ecef',
                              boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                              opacity: msg.optimistic ? 0.7 : 1,
                              whiteSpace: 'pre-wrap',
                              wordBreak: 'break-word',
                            }}>
                              {msg.text}
                            </div>
                            <p style={{ fontSize: 10.5, color: '#9ca3af', margin: '3px 4px 0', textAlign: isAdmin ? 'right' : 'left' }}>
                              {formatTime(msg.createdAt)}
                            </p>
                          </div>
                        </div>
                      );
                    })}

                    {userTyping && (
                      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
                        <InitialAvatar name={activeConv.userName} />
                        <div style={{ padding: '10px 14px', borderRadius: '14px 14px 14px 4px', background: '#fff', border: '1px solid #e9ecef', display: 'flex', gap: 4, alignItems: 'center' }}>
                          {[0,1,2].map(i => (
                            <span key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: '#9ca3af', display: 'inline-block', animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite` }}/>
                          ))}
                        </div>
                      </div>
                    )}
                    <div ref={messagesEndRef}/>
                  </div>

                  {/* Input */}
                  {activeConv.status !== 'closed' ? (
                    <div style={{ padding: '12px 16px', borderTop: '1px solid #f3f4f6', display: 'flex', gap: 10, alignItems: 'flex-end', background: '#fff', borderRadius: '0 0 16px 0' }}>
                      <textarea
                        value={input}
                        onChange={handleInputChange}
                        onKeyDown={handleKeyDown}
                        placeholder="Reply to resident… (Enter to send)"
                        rows={1}
                        disabled={sending || msgLoading}
                        style={{
                          flex: 1, padding: '9px 12px', border: '1px solid #e5e7eb', borderRadius: 10,
                          fontSize: 13.5, fontFamily: 'DM Sans, sans-serif', color: '#374151',
                          resize: 'none', outline: 'none', lineHeight: 1.5,
                          transition: 'border-color 0.15s, box-shadow 0.15s',
                        }}
                        onFocus={e => { e.target.style.borderColor = '#2563eb'; e.target.style.boxShadow = '0 0 0 3px rgba(37,99,235,0.1)'; }}
                        onBlur={e => { e.target.style.borderColor = '#e5e7eb'; e.target.style.boxShadow = 'none'; }}
                      />
                      <button
                        onClick={sendMessage}
                        disabled={!input.trim() || sending}
                        style={{
                          width: 40, height: 40, borderRadius: 10, border: 'none',
                          background: input.trim() ? '#2563eb' : '#e5e7eb',
                          color: '#fff', cursor: input.trim() ? 'pointer' : 'default',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          flexShrink: 0, transition: 'background 0.15s',
                        }}
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ width: 16, height: 16 }}>
                          <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
                        </svg>
                      </button>
                    </div>
                  ) : (
                    <div style={{ padding: '14px 20px', borderTop: '1px solid #f3f4f6', background: '#f9fafb', borderRadius: '0 0 16px 0', textAlign: 'center' }}>
                      <p style={{ margin: 0, fontSize: 13, color: '#9ca3af' }}>
                        This conversation is closed. 
                        <button onClick={() => updateStatus(activeConv._id, 'open')} style={{ background: 'none', border: 'none', color: '#2563eb', fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: '0 0 0 4px', fontFamily: 'DM Sans, sans-serif' }}>
                          Reopen
                        </button>
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
