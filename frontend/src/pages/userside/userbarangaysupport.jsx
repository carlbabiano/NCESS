import { useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import UserSidebar from '../../components/usersidebar';
import UserTopbar from '../../components/usertopbar';
import './userbarangaysupport.css';

const API  = import.meta.env.VITE_BACKEND_URL
const SOCK = import.meta.env.VITE_SOCKET_URL || import.meta.env.VITE_BACKEND_URL?.replace('/api', '') || ''

const FAQS = [
  {
    q: 'How do I get a Barangay Clearance?',
    a: 'Visit the Barangay Hall during office hours with a valid ID and proof of residency. Processing takes 1–2 business days. You may also request via this chat for guidance.',
  },
  {
    q: 'What are the requirements for a Certificate of Indigency?',
    a: 'Bring a valid ID, proof of residency, and a brief letter of request. A barangay official may conduct a home visit before issuance.',
  },
  {
    q: 'How do I report a noise complaint or neighbor dispute?',
    a: 'You can message us directly in this chat, or visit the Barangay Hall. For urgent situations, our Lupong Tagapamayapa handles mediation.',
  },
  {
    q: 'How long does it take to get a response in this chat?',
    a: 'During office hours (Mon–Fri 8AM–5PM, Sat 8AM–12PM), expect a response within 30 minutes. Outside hours, messages are answered the next business day.',
  },
  {
    q: 'Can I request documents online?',
    a: 'You can initiate requests through this chat. A staff member will confirm requirements and schedule your pickup or delivery.',
  },
];

function getToken() {
  return localStorage.getItem('token') || sessionStorage.getItem('token');
}

function getUserFromToken() {
  try {
    const token = getToken();
    if (!token) return null;
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload;
  } catch { return null; }
}

function timeAgo(date) {
  const diff = Math.floor((Date.now() - new Date(date)) / 1000);
  if (diff < 60)   return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400)return `${Math.floor(diff / 3600)}h ago`;
  return new Date(date).toLocaleDateString();
}

function formatTime(date) {
  return new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function UserBarangaySupport() {
  const [sidebarOpen,   setSidebarOpen]   = useState(window.innerWidth >= 1024);
  const [search,        setSearch]        = useState('');
  const [openFaq,       setOpenFaq]       = useState(null);
  // Report Incident state removed

  // Chat state
  const [conversation,  setConversation]  = useState(null);
  const [messages,      setMessages]      = useState([]);
  const [input,         setInput]         = useState('');
  const [loading,       setLoading]       = useState(true);
  const [sending,       setSending]       = useState(false);
  const [adminTyping,   setAdminTyping]   = useState(false);
  const [connected,     setConnected]     = useState(false);
  const [showChatOpen,  setShowChatOpen]  = useState(false);

  const socketRef          = useRef(null);
  const messagesEndRef     = useRef(null);
  const messagesContainerRef = useRef(null);
  const typingTimer        = useRef(null);
  const currentUser    = getUserFromToken();
  const normalizedSearch = search.trim().toLowerCase();
  const filteredFaqs = FAQS
    .map((faq, index) => ({ ...faq, index }))
    .filter((faq) => {
      if (!normalizedSearch) return true;
      return `${faq.q} ${faq.a}`.toLowerCase().includes(normalizedSearch);
    });

  // ── Fetch conversation + messages ──────────────────────────────────────────
  const loadConversation = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    setLoading(true);
    try {
      const res  = await fetch(`${API}/chat/my-conversation`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const conv = await res.json();
      setConversation(conv);

      const mRes = await fetch(`${API}/chat/conversations/${conv._id}/messages`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const msgs = await mRes.json();
      setMessages(msgs);
    } catch (err) {
      console.error('Load error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Socket.io ───────────────────────────────────────────────────────────────
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
      setAdminTyping(false);
    });

    socket.on('user_typing', ({ isAdmin }) => {
      if (isAdmin) setAdminTyping(true);
    });

    socket.on('user_stopped_typing', () => setAdminTyping(false));

    return () => socket.disconnect();
  }, []);

  // ── Join room once conversation is known ───────────────────────────────────
  useEffect(() => {
    if (conversation && socketRef.current) {
      socketRef.current.emit('join_conversation', conversation._id);
    }
  }, [conversation]);

  useEffect(() => { loadConversation(); }, [loadConversation]);

  // ── Auto-scroll the chat container only ────────────────────────────────────
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    container.scrollTop = container.scrollHeight;
  }, [messages, adminTyping]);


  // ── Send message ───────────────────────────────────────────────────────────
  const sendMessage = async () => {
    if (!input.trim() || !conversation || sending) return;
    setSending(true);

    // Optimistic
    const optimistic = {
      _id:       `opt_${Date.now()}`,
      text:      input.trim(),
      sender:    'user',
      senderName: currentUser?.fullName || 'You',
      createdAt: new Date().toISOString(),
      optimistic: true,
    };
    setMessages(prev => [...prev, optimistic]);
    setInput('');

    if (socketRef.current) {
      socketRef.current.emit('typing_stop', { conversationId: conversation._id });
      socketRef.current.emit('send_message', {
        conversationId: conversation._id,
        text:           optimistic.text,
      });
    } else {
      // Fallback REST
      const token = getToken();
      await fetch(`${API}/chat/conversations/${conversation._id}/messages`, {
        method:  'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body:    JSON.stringify({ text: optimistic.text }),
      });
      await loadConversation();
    }

    setSending(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  // ── Typing indicator ───────────────────────────────────────────────────────
  const handleInputChange = (e) => {
    setInput(e.target.value);
    if (!conversation || !socketRef.current) return;
    socketRef.current.emit('typing_start', { conversationId: conversation._id });
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => {
      socketRef.current?.emit('typing_stop', { conversationId: conversation._id });
    }, 1500);
  };


  // Report Incident submit removed


  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <UserSidebar sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />
      <div style={{ flex: 1, height: '100vh', overflowY: 'auto' }}>
        <div className="uhtl-page">

          <UserTopbar
            placeholder="Search FAQs..."
            search={search}
            onSearch={setSearch}
            onHamburger={() => setSidebarOpen(v => !v)}
            sidebarOpen={sidebarOpen}
            setSidebarOpen={setSidebarOpen}
          />

          <main className="uhtl-main">
            <div className="uhtl-heading">
              <div>
                <h1>Barangay Chat Support</h1>
                <p>Message barangay officials directly. We're here to help with inquiries, complaints, and emergencies.</p>
              </div>
              {/* Report Incident button removed */}
            </div>

            <div className="uhtl-body">
              {/* ── Left: Chat Window ── */}
              <div className="uhtl-left">
                <div className="uhtl-panel uhtl-chat-panel">
                  {/* Chat Header */}
                  <div className="uhtl-panel__header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2" style={{ width: 18, height: 18 }}>
                          <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
                        </svg>
                      </div>
                      <div>
                        <p className="uhtl-panel__title" style={{ margin: 0 }}>Barangay Support</p>
                        <p style={{ margin: 0, fontSize: 11.5, color: connected ? '#16a34a' : '#9ca3af', display: 'flex', alignItems: 'center', gap: 4 }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: connected ? '#16a34a' : '#9ca3af', display: 'inline-block' }}/>
                          {connected ? 'Online' : 'Connecting...'}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Messages */}
                  <div ref={messagesContainerRef} style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10, background: '#fafbfc' }}>
                    {loading ? (
                      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <p style={{ color: '#9ca3af', fontSize: 13 }}>Loading messages…</p>
                      </div>
                    ) : messages.length === 0 ? (
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                        <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2" style={{ width: 22, height: 22 }}>
                            <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
                          </svg>
                        </div>
                        <p style={{ fontSize: 14, fontWeight: 600, color: '#374151', margin: 0 }}>Start a conversation</p>
                        <p style={{ fontSize: 13, color: '#9ca3af', margin: 0, textAlign: 'center' }}>Send a message and a barangay official will respond shortly.</p>
                      </div>
                    ) : (
                      messages.map((msg) => {
                        const isMe = msg.sender === 'user';
                        return (
                          <div key={msg._id} style={{ display: 'flex', justifyContent: isMe ? 'flex-end' : 'flex-start', gap: 8, alignItems: 'flex-end' }}>
                            {!isMe && (
                              <div style={{ width: 30, height: 30, borderRadius: '50%', background: '#1e40af', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 11, fontWeight: 700, color: '#fff' }}>
                                BA
                              </div>
                            )}
                            <div style={{ maxWidth: '70%' }}>
                              {!isMe && (
                                <p style={{ fontSize: 11, color: '#9ca3af', margin: '0 0 3px 4px' }}>Barangay Admin</p>
                              )}
                              <div style={{
                                padding: '10px 14px',
                                borderRadius: isMe ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                                background: isMe ? '#2563eb' : '#fff',
                                color: isMe ? '#fff' : '#111827',
                                fontSize: 13.5,
                                lineHeight: 1.5,
                                border: isMe ? 'none' : '1px solid #e9ecef',
                                boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                                opacity: msg.optimistic ? 0.7 : 1,
                                whiteSpace: 'pre-wrap',
                                wordBreak: 'break-word',
                              }}>
                                {msg.text}
                              </div>
                              <p style={{ fontSize: 10.5, color: '#9ca3af', margin: '3px 4px 0', textAlign: isMe ? 'right' : 'left' }}>
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
                        <div style={{ width: 30, height: 30, borderRadius: '50%', background: '#1e40af', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 11, fontWeight: 700, color: '#fff' }}>BA</div>
                        <div style={{ padding: '10px 14px', borderRadius: '14px 14px 14px 4px', background: '#fff', border: '1px solid #e9ecef', display: 'flex', gap: 4, alignItems: 'center' }}>
                          {[0,1,2].map(i => (
                            <span key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: '#9ca3af', display: 'inline-block', animation: `uhtlPulse 1.2s ease-in-out ${i * 0.2}s infinite` }}/>
                          ))}
                        </div>
                      </div>
                    )}
                    <div ref={messagesEndRef}/>
                  </div>

                  {/* Input */}
                  <div style={{ padding: '12px 16px', borderTop: '1px solid #f3f4f6', display: 'flex', gap: 10, alignItems: 'flex-end', background: '#fff' }}>
                    <textarea
                      value={input}
                      onChange={handleInputChange}
                      onKeyDown={handleKeyDown}
                      placeholder="Type your message… (Enter to send)"
                      rows={1}
                      disabled={sending || loading}
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
                      disabled={!input.trim() || sending || loading}
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
                </div>
              </div>

              {/* ── Right: Sidebar Info ── */}
              <aside className="uhtl-right">

                {/* Conversation Info */}
                {conversation && (
                  <section className="uhtl-panel">
                    <div className="uhtl-panel__header">
                      <h2 className="uhtl-panel__title">Your Conversation</h2>
                    </div>
                    <ul className="uhtl-hours">
                      <li className="uhtl-hours-item">
                        <span className="uhtl-hours-day">Status</span>
                        <span style={{
                          fontSize: 12, fontWeight: 700, padding: '2px 9px', borderRadius: 6,
                          background: conversation.status === 'open' ? '#f0fdf4' : '#f3f4f6',
                          color: conversation.status === 'open' ? '#16a34a' : '#6b7280',
                          textTransform: 'capitalize',
                        }}>{conversation.status}</span>
                      </li>
                      <li className="uhtl-hours-item">
                        <span className="uhtl-hours-day">Messages</span>
                        <span className="uhtl-hours-time">{messages.length}</span>
                      </li>
                      <li className="uhtl-hours-item">
                        <span className="uhtl-hours-day">Last activity</span>
                        <span style={{ fontSize: 11.5, color: '#9ca3af' }}>{timeAgo(conversation.lastMessageAt)}</span>
                      </li>
                    </ul>
                  </section>
                )}

                {/* FAQ */}
                <section className="uhtl-panel">
                  <div className="uhtl-panel__header">
                    <h2 className="uhtl-panel__title">Frequently Asked Questions</h2>
                    <p className="uhtl-panel__sub">Tap a question to expand</p>
                  </div>
                  <ul className="uhtl-faq-list">
                    {filteredFaqs.length === 0 && (
                      <li className="uhtl-faq-empty">No FAQs found for "{search}".</li>
                    )}
                    {filteredFaqs.map((faq) => (
                      <li key={faq.index} className={`uhtl-faq-item${openFaq === faq.index ? ' uhtl-faq-item--open' : ''}`}>
                        <button
                          className="uhtl-faq-q"
                          onClick={() => setOpenFaq(openFaq === faq.index ? null : faq.index)}
                        >
                          <span>{faq.q}</span>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="uhtl-faq-chevron">
                            <polyline points="6 9 12 15 18 9"/>
                          </svg>
                        </button>
                        {openFaq === faq.index && (
                          <p className="uhtl-faq-a">{faq.a}</p>
                        )}
                      </li>
                    ))}
                  </ul>
                </section>

                {/* Tips */}
                <section className="uhtl-panel">
                  <div className="uhtl-panel__header">
                    <h2 className="uhtl-panel__title">Chat Tips</h2>
                  </div>
                  <ul className="uhtl-tips">
                    {[
                      {  tip: '• Include your address or nearest landmark for location-related concerns.' },
                      {  tip: '• Be clear and concise. Our staff will respond as soon as possible.' },
                      {  tip: '• Staffed Monday–Friday, 8AM–6PM. Emergency line available 24/7.' },
                    ].map((t) => (
                      <li key={t.tip} className="uhtl-tip">
                        <span className="uhtl-tip__icon">{t.icon}</span>
                        <p className="uhtl-tip__text">{t.tip}</p>
                      </li>
                    ))}
                  </ul>
                </section>

                
              </aside>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
