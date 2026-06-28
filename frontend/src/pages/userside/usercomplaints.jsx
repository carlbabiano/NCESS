import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { io } from 'socket.io-client';
import { createPortal } from 'react-dom';
import QRCode from 'react-qr-code';
import UserSidebar from '../../components/usersidebar';
import UserTopbar from '../../components/usertopbar';

import './usercomplaints.css';

function getComplaintUniqueId(c) {
  if (!c) return '';
  if (c.uniqueID) return String(c.uniqueID);
  if (c.id)       return String(c.id);
  return `CMP-${String(c._id || '').slice(-6).toUpperCase()}`;
}

function getComplaintQrValue(c) {
  return JSON.stringify({
    complaintId: String(c?._id  || ''),
    type:        'complaint',
    uniqueID:    getComplaintUniqueId(c),
  });
}


const API_URL = import.meta.env.VITE_BACKEND_URL;

const CATEGORIES = [
  'Waste Management', 'Flooding', 'Street Lighting', 'Noise Complaint',
  'Illegal Parking', 'Stray Animals', 'Infrastructure', 'Other',
];

const DEFAULT_PRIORITY_BY_CATEGORY = {
  'Waste Management': 'Normal',
  Flooding: 'High',
  'Street Lighting': 'Medium',
  'Noise Complaint': 'Normal',
  'Illegal Parking': 'Medium',
  'Stray Animals': 'Medium',
  Infrastructure: 'High',
  Other: 'Normal',
};

const PRIORITY_DOT = { High: '#ef4444', Medium: '#f59e0b', Normal: '#22c55e' };
const OTHER_PRIORITY_OPTIONS = [
  { label: 'Normal', value: 'Normal' },
  { label: 'Medium', value: 'Medium' },
  { label: 'High', value: 'High' },
];
const STATUS_CLS = {
  'In Progress': 'ucs--inprogress',
  Resolved:      'ucs--resolved',
  Pending:       'ucs--pending',
  Escalated:     'ucs--escalated',
};

function getToken() {
  return (
    localStorage.getItem('token')   ||
    sessionStorage.getItem('token') ||
    localStorage.getItem('userToken') ||
    sessionStorage.getItem('userToken')
  );
}

const EMPTY_FORM = { category: '', customCategory: '', location: '', description: '', priority: 'Normal' };

function getDefaultPriority(category) {
  return DEFAULT_PRIORITY_BY_CATEGORY[category] || DEFAULT_PRIORITY_BY_CATEGORY.Other;
}


export default function UserComplaints() {
  const [sidebarOpen, setSidebarOpen] = useState(window.innerWidth >= 1024);
  const [complaints,  setComplaints]  = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [fetchError,  setFetchError]  = useState('');
  const [search,      setSearch]      = useState('');

  // File modal
  const [showModal,   setShowModal]   = useState(false);
  const [form,        setForm]        = useState(EMPTY_FORM);
  const [formError,   setFormError]   = useState('');
  const [submitting,  setSubmitting]  = useState(false);

  // View modal
  const [showTrack, setShowTrack] = useState(null);

  // 3-dot menu
  const [openMenu, setOpenMenu] = useState(null);
  const menuRefs = useRef({});

  // QR modal
  const [qrComplaint, setQrComplaint] = useState(null);
  const qrRef = useRef(null);

  // Toast
  const [toast, setToast] = useState('');
  const showToast = msg => { setToast(msg); setTimeout(() => setToast(''), 3500); };

  /* ── Close dropdown on outside click ── */
  useEffect(() => {
    const handler = () => setOpenMenu(null);
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, []);

  /* ── Fetch ── */
  const fetchComplaints = useCallback(async () => {
    setLoading(true); setFetchError('');
    try {
      const token = getToken();
      if (!token) throw new Error('Not logged in');
      const res = await fetch(`${API_URL}/complaints`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setComplaints(await res.json());
    } catch (err) {
      setFetchError('Failed to load complaints.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchComplaints(); }, [fetchComplaints]);

  /* ── Real-time socket ── */
  useEffect(() => {
    const token = getToken() || '';
    if (!token) return;
    const socket = io(
      import.meta.env.VITE_SOCKET_URL ||
      import.meta.env.VITE_BACKEND_URL?.replace('/api', '') || '',
      { auth: { token }, transports: ['websocket'], reconnection: true }
    );
    socket.on('complaint_status_updated', (updated) => {
      setComplaints(prev => prev.map(c => c._id === updated._id ? updated : c));
      setShowTrack(prev => prev?._id === updated._id ? updated : prev);
    });
    return () => socket.disconnect();
  }, []);

  /* ── Derived stats ── */
  const stats = {
    total:      complaints.length,
    pending:    complaints.filter(c => c.status === 'Pending').length,
    inProgress: complaints.filter(c => c.status === 'In Progress').length,
    resolved:   complaints.filter(c => c.status === 'Resolved').length,
  };

  /* ── Filtered list ── */
  const filtered = complaints.filter(c => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return [c.id, c._id, c.category, c.status, c.priority, c.location, c.description, c.dateFiled]
      .some((value) => String(value || '').toLowerCase().includes(q));
  });

  /* ── Form helpers ── */
  const openModal  = () => { setForm(EMPTY_FORM); setFormError(''); setShowModal(true); };
  const closeModal = () => { setShowModal(false); setFormError(''); };
  const handleChange = (field, val) => {
    setForm(prev => {
      if (field === 'category') {
        return {
          ...prev,
          category: val,
          customCategory: val === 'Other' ? prev.customCategory : '',
          priority: getDefaultPriority(val),
        };
      }
      return { ...prev, [field]: val };
    });
    if (formError) setFormError('');
  };

  /* ── Submit complaint ── */
  const handleSubmit = async () => {
    const categoryVal = form.category === 'Other' ? form.customCategory.trim() : form.category;
    const priorityVal = form.category === 'Other' ? form.priority : getDefaultPriority(form.category);
    if (!categoryVal)              return setFormError('Please select a category.');
    if (!form.location.trim())    return setFormError('Location is required.');
    if (!form.description.trim()) return setFormError('Description is required.');

    setSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/complaints`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({
          category:    categoryVal,
          location:    form.location.trim(),
          description: form.description.trim(),
          priority:    priorityVal,
        }),
      });
      const data = await res.json();
      if (!res.ok) return setFormError(data.message || 'Submission failed.');
      setComplaints(prev => [data, ...prev]);
      closeModal();
      showToast('Complaint submitted successfully!');
    } catch {
      setFormError('Unable to connect to the server.');
    } finally {
      setSubmitting(false);
    }
  };

  /* ── QR download ── */
  const downloadQr = useCallback(() => {
    if (!qrComplaint || !qrRef.current) return;
    const svg = qrRef.current.querySelector('svg');
    if (!svg) return;
    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement('canvas');
    const size = 320;
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, size, size);
    const img = new Image();
    const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      ctx.drawImage(img, 0, 0, size, size);
      URL.revokeObjectURL(url);
      const link = document.createElement('a');
      link.download = `${getComplaintUniqueId(qrComplaint)}-qr.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    };
    img.src = url;
  }, [qrComplaint]);

  /* ── Menu toggle ── */
  const toggleMenu = (id) => setOpenMenu(prev => prev === id ? null : id);

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <UserSidebar sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />
      <div style={{ flex: 1, height: '100vh', overflowY: 'auto' }}>
        <div className="ucmp-page">

          {/* Toast */}
          {toast && (
            <div className="ucmp-toast">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="15" height="15">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              {toast}
            </div>
          )}

          <UserTopbar
            placeholder="Search complaints..."
            search={search}
            onSearch={setSearch}
            onHamburger={() => setSidebarOpen(v => !v)}
            sidebarOpen={sidebarOpen}
            setSidebarOpen={setSidebarOpen}
          />

          <div className="ucmp-header">
            <div>
              <h1>My Complaints</h1>
              <p>Track and manage complaints you have filed with the barangay.</p>
            </div>
            <button className="ucmp-new-btn" onClick={openModal}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              File a Complaint
            </button>
          </div>

          {/* Stat bar */}
          <div className="ucmp-stats">
            {[
              { label: 'TOTAL FILED',  value: stats.total      },
              { label: 'PENDING',      value: stats.pending     },
              { label: 'IN PROGRESS',  value: stats.inProgress  },
              { label: 'RESOLVED',     value: stats.resolved    },
            ].map(s => (
              <div className="ucmp-stat" key={s.label}>
                <p className="ucmp-stat__label">{s.label}</p>
                <p className="ucmp-stat__value">{s.value}</p>
              </div>
            ))}
          </div>

          {/* Loading / Error */}
          {loading && (
            <div className="ucmp-table-wrap">
              <p style={{ textAlign: 'center', color: '#9ca3af', padding: 48, fontSize: 14 }}>Loading complaints…</p>
            </div>
          )}
          {!loading && fetchError && (
            <div className="ucmp-table-wrap">
              <p style={{ textAlign: 'center', color: '#dc2626', padding: 48, fontSize: 14 }}>{fetchError}</p>
            </div>
          )}

          {/* Table */}
          {!loading && !fetchError && (
            <div className="ucmp-table-wrap">
              <table className="ucmp-table">
                <thead>
                  <tr>
                    <th>Complaint ID</th>
                    <th>Category</th>
                    <th>Priority</th>
                    <th>Date Filed</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 && (
                    <tr><td colSpan="6" className="ucmp-empty">No complaints found.</td></tr>
                  )}
                  {filtered.map(c => (
                    <tr key={c._id} className="ucmp-row">
                      <td data-label="Complaint ID">
                        <span className="ucmp-id">{getComplaintUniqueId(c)}</span>
                      </td>
                      <td data-label="Category" className="ucmp-cat">{c.category}</td>
                      <td data-label="Priority">
                        <span className="ucmp-priority">
                          <span className="ucmp-priority__dot" style={{ background: PRIORITY_DOT[c.priority] || PRIORITY_DOT.Medium }} />
                          {c.priority}
                        </span>
                      </td>
                      <td data-label="Date Filed" className="ucmp-date">{c.dateFiled}</td>
                      <td data-label="Status">
                        <span className={`ucmp-badge ${STATUS_CLS[c.status] || 'ucs--pending'}`}>{c.status}</span>
                      </td>
                      <td className="ucmp-menu-cell" onClick={e => e.stopPropagation()}>
                        <button
                          ref={el => menuRefs.current[c._id] = el}
                          className="ucmp-menu-btn"
                          onClick={() => toggleMenu(c._id)}
                        >
                          <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                            <circle cx="12" cy="5"  r="1.5"/>
                            <circle cx="12" cy="12" r="1.5"/>
                            <circle cx="12" cy="19" r="1.5"/>
                          </svg>
                        </button>
                        {openMenu === c._id && (
                          <UcmpDropdownPortal anchorEl={menuRefs.current[c._id]}>
                            <p className="ucmp-dropdown__label">Options</p>
                            <button
                              className="ucmp-dropdown__item ucmp-dropdown__item--view"
                              onClick={() => { setShowTrack(c); setOpenMenu(null); }}
                            >
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                                <circle cx="12" cy="12" r="3"/>
                              </svg>
                              View
                            </button>
                            <div className="ucmp-dropdown__divider" />
                            <button
                              className="ucmp-dropdown__item ucmp-dropdown__item--qr"
                              onClick={() => { setQrComplaint(c); setOpenMenu(null); }}
                            >
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                                <rect x="3" y="3" width="7" height="7" rx="1"/>
                                <rect x="14" y="3" width="7" height="7" rx="1"/>
                                <rect x="3" y="14" width="7" height="7" rx="1"/>
                                <path d="M14 14h3v3"/><path d="M21 14v7h-7"/><path d="M17 17h4"/>
                              </svg>
                              Show QR Code
                            </button>
                          </UcmpDropdownPortal>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <p className="ucmp-footer">
            Showing <strong>{filtered.length}</strong> of <strong>{complaints.length}</strong> complaints
          </p>

        </div>

        {/* ── File Complaint Modal ── */}
        {showModal && (
          <div className="ucmp-overlay" onClick={closeModal}>
            <div className="ucmp-modal" onClick={e => e.stopPropagation()}>
              <div className="ucmp-modal__header">
                <h2>File a Complaint</h2>
                <button className="ucmp-modal__close" onClick={closeModal}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>
              <div className="ucmp-modal__body">
                <div className="ucmp-fg">
                  <label>Category <span>*</span></label>
                  <select value={form.category} onChange={e => handleChange('category', e.target.value)}>
                    <option value="">Select...</option>
                    {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                {form.category === 'Other' && (
                  <div className="ucmp-fg">
                    <label>Specify Category <span>*</span></label>
                    <input type="text" placeholder="Describe the type of complaint..."
                      value={form.customCategory} onChange={e => handleChange('customCategory', e.target.value)} />
                  </div>
                )}
                {form.category === 'Other' ? (
                  <div className="ucmp-fg">
                    <label>Priority <span>*</span></label>
                    <div className="ucmp-priority-row">
                      {OTHER_PRIORITY_OPTIONS.map(p => (
                        <button key={p.value} type="button"
                          className={`ucmp-priority-btn ucmp-priority-btn--${p.label.toLowerCase()}${form.priority === p.value ? ' ucmp-priority-btn--active' : ''}`}
                          onClick={() => handleChange('priority', p.value)}>
                          <span className="ucmp-priority-btn__dot" />{p.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="ucmp-fg">
                    <label>Assigned Priority</label>
                    <div className="ucmp-priority-readonly">
                      <span
                        className="ucmp-priority__dot"
                        style={{ background: PRIORITY_DOT[getDefaultPriority(form.category)] || PRIORITY_DOT.Normal }}
                      />
                      {form.category ? getDefaultPriority(form.category) : 'Select a category first'}
                    </div>
                  </div>
                )}
                <div className="ucmp-fg">
                  <label>Location <span>*</span></label>
                  <input type="text" value={form.location} onChange={e => handleChange('location', e.target.value)}
                    placeholder="e.g. Purok 4, Narra St." />
                </div>
                <div className="ucmp-fg">
                  <label>Description <span>*</span></label>
                  <textarea value={form.description} onChange={e => handleChange('description', e.target.value)}
                    placeholder="Describe your complaint in detail..." rows={4} />
                </div>
                {formError && (
                  <div className="ucmp-form-error">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                      <circle cx="12" cy="12" r="10"/>
                      <line x1="12" y1="8" x2="12" y2="12"/>
                      <line x1="12" y1="16" x2="12.01" y2="16"/>
                    </svg>
                    {formError}
                  </div>
                )}
              </div>
              <div className="ucmp-modal__footer">
                <button className="ucmp-ghost-btn" onClick={closeModal} disabled={submitting}>Cancel</button>
                <button className="ucmp-submit-btn" onClick={handleSubmit} disabled={submitting}>
                  {submitting ? 'Submitting…' : 'Submit Complaint'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── View / Track Modal ── */}
        {showTrack && (
          <div className="ucmp-overlay" onClick={() => setShowTrack(null)}>
            <div className="ucmp-modal" onClick={e => e.stopPropagation()}>
              <div className="ucmp-modal__header">
                <div>
                  <h2>{showTrack.category}</h2>
                  <p style={{ margin: '2px 0 0', fontSize: 12, color: '#2563eb', fontWeight: 700 }}>
                    {getComplaintUniqueId(showTrack)}
                  </p>
                </div>
                <button className="ucmp-modal__close" onClick={() => setShowTrack(null)}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>
              <div className="ucmp-modal__body">
                {/* Info grid */}
                <div className="ucmp-track-grid">
                  <div className="ucmp-track-item">
                    <span className="ucmp-track-label">Priority</span>
                    <span className="ucmp-track-value" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: PRIORITY_DOT[showTrack.priority] || PRIORITY_DOT.Medium, display: 'inline-block' }} />
                      {showTrack.priority}
                    </span>
                  </div>
                  <div className="ucmp-track-item">
                    <span className="ucmp-track-label">Date Filed</span>
                    <span className="ucmp-track-value">{showTrack.dateFiled}</span>
                  </div>
                  {showTrack.location && (
                    <div className="ucmp-track-item">
                      <span className="ucmp-track-label">Location</span>
                      <span className="ucmp-track-value">{showTrack.location}</span>
                    </div>
                  )}
                </div>

                {showTrack.description && (
                  <div className="ucmp-track-desc">
                    <p className="ucmp-track-label" style={{ marginBottom: 6 }}>Your Description</p>
                    <p style={{ fontSize: 13.5, color: '#374151', margin: 0, lineHeight: 1.6 }}>{showTrack.description}</p>
                  </div>
                )}

                {/* Timeline */}
                <div>
                  <p className="ucmp-tl-label">PROGRESS TIMELINE</p>
                  <ul className="ucmp-timeline">
                    {buildTimeline(showTrack.status).map((step, i, arr) => (
                      <li key={i} className={`ucmp-tl-item${i === arr.length - 1 ? ' ucmp-tl-item--last' : ''}`}>
                        <span className={`ucmp-tl-dot${step.active ? ' ucmp-tl-dot--active' : ''}`} />
                        <p className="ucmp-tl-text">{step.label}</p>
                      </li>
                    ))}
                  </ul>
                </div>

                {showTrack.resolutionNote && (
                  <div className="ucmp-track-desc">
                    <p className="ucmp-track-label" style={{ marginBottom: 6 }}>Note from Barangay</p>
                    <p style={{ fontSize: 13.5, color: '#374151', margin: 0, lineHeight: 1.6 }}>{showTrack.resolutionNote}</p>
                  </div>
                )}
              </div>
              <div className="ucmp-modal__footer" style={{ justifyContent: 'space-between' }}>
                <span className={`ucmp-badge ${STATUS_CLS[showTrack.status] || 'ucs--pending'}`}>{showTrack.status}</span>
                <button className="ucmp-ghost-btn" onClick={() => setShowTrack(null)}>Close</button>
              </div>
            </div>
          </div>
        )}

        {/* ── QR Code Modal ── */}
        {qrComplaint && (
          <div className="ucmp-overlay" onClick={() => setQrComplaint(null)}>
            <div className="ucmp-modal ucmp-modal--sm ucmp-modal--qr" onClick={e => e.stopPropagation()}>
              <div className="ucmp-modal__header">
                <div>
                  <h2>Complaint QR Code</h2>
                  <p className="ucmp-qr-subtitle">{getComplaintUniqueId(qrComplaint)}</p>
                </div>
                <button className="ucmp-modal__close" onClick={() => setQrComplaint(null)}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>
              <div className="ucmp-modal__body ucmp-qr-body" ref={qrRef}>
                <div className="ucmp-qr-code-wrap">
                  <QRCode value={getComplaintQrValue(qrComplaint)} size={220} />
                </div>
                <div className="ucmp-qr-info">
                  <div className="ucmp-qr-row">
                    <span>Category</span>
                    <strong>{qrComplaint.category}</strong>
                  </div>
                  <div className="ucmp-qr-row">
                    <span>Date Filed</span>
                    <strong>{qrComplaint.dateFiled}</strong>
                  </div>
                  <div className="ucmp-qr-row">
                    <span>Status</span>
                    <strong>
                      <span className={`ucmp-badge ${STATUS_CLS[qrComplaint.status] || 'ucs--pending'}`} style={{ fontSize: 11, padding: '2px 8px' }}>
                        {qrComplaint.status}
                      </span>
                    </strong>
                  </div>
                </div>
                <p className="ucmp-qr-hint">Present this QR code at the barangay hall for your complaint reference.</p>
              </div>
              <div className="ucmp-modal__footer">
                <button className="ucmp-ghost-btn" onClick={() => setQrComplaint(null)}>Close</button>
                <button className="ucmp-submit-btn ucmp-download-btn" onClick={downloadQr}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="14" height="14">
                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                    <polyline points="7 10 12 15 17 10"/>
                    <line x1="12" y1="15" x2="12" y2="3"/>
                  </svg>
                  Download QR
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Dropdown portal (matches appointments pattern) ── */
function UcmpDropdownPortal({ children, anchorEl }) {
  const style = useMemo(() => {
    if (anchorEl) {
      const rect = anchorEl.getBoundingClientRect();
      return { position: 'fixed', top: rect.bottom + 4, left: rect.right - 190, zIndex: 9999 };
    }
    return {};
  }, [anchorEl]);
  return createPortal(
    <div className="ucmp-dropdown" style={style}>{children}</div>,
    document.body
  );
}

/* ── Build timeline steps from status ── */
function buildTimeline(status) {
  const all = [
    { label: 'Complaint received',            statuses: ['Pending', 'In Progress', 'Resolved', 'Escalated'] },
    { label: 'Assigned to official',          statuses: ['In Progress', 'Resolved', 'Escalated'] },
    { label: 'Investigation / action ongoing',statuses: ['In Progress', 'Escalated'] },
    { label: 'Escalated to higher authority', statuses: ['Escalated'] },
    { label: 'Resolved',                      statuses: ['Resolved'] },
  ];
  return all
    .filter(s => s.statuses.includes(status) || s.statuses[0] === 'Pending')
    .map(s => ({ label: s.label, active: s.statuses.includes(status) }))
    .filter((s, i, arr) => {
      const lastActiveIdx = [...arr].reverse().findIndex(x => x.active);
      const lastActive    = arr.length - 1 - lastActiveIdx;
      return s.active || i <= lastActive;
    });
}