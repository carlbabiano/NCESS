import { useState, useEffect, useCallback } from 'react';
import { io } from 'socket.io-client';
import Sidebar from '../../components/adminsidebar';
import AdminTopbar from '../../components/admintopbar';
import { AdminFilterBar } from '../../components/adminfilterbar';
import './admincomplaints.css';

const API_URL = import.meta.env.VITE_BACKEND_URL;
const PAGE_SIZE = 10;

/* ─── Constants ─────────────────────────────────── */
const STATUS_META = {
  Pending:       { className: 'cs--pending',    icon: 'clock' },
  'In Progress': { className: 'cs--inprogress', icon: 'arrow' },
  Resolved:      { className: 'cs--resolved',   icon: 'check' },
  Escalated:     { className: 'cs--escalated',  icon: 'alert' },
};

const PRIORITY_META = {
  High:   { dot: '#ef4444' },
  Medium: { dot: '#f59e0b' },
  Low:    { dot: '#22c55e' },
};

const STATUS_FILTERS = ['All', 'Pending', 'In Progress', 'Resolved', 'Escalated'];

const CATEGORY_OPTIONS = [
  'Waste Management', 'Noise Complaint', 'Infrastructure', 'Illegal Parking',
  'Stray Animals', 'Street Lighting', 'Flooding', 'Illegal Structures',
  'Domestic Dispute', 'Public Disturbance', 'Drug-Related', 'Other',
];

const OFFICIAL_OPTIONS = [
  'Kgd. Roberto Chen', 'Tanod Chief B. Reyes', 'Engr. L. Gomez',
  'Police Sgt. Manalo', 'Brgy. Health Office', 'Barangay Captain',
];

const EMPTY_FORM = {
  resident: '', address: '', contact: '',
  priority: 'Medium', category: '', customCategory: '',
  description: '', assignedOfficial: '', status: 'Pending',
};

function getToken() {
  return (
    localStorage.getItem('admin_token')   ||
    sessionStorage.getItem('admin_token') ||
    localStorage.getItem('adminToken')    ||
    sessionStorage.getItem('adminToken')
  );
}

function decodeAdminToken(token) {
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(base64));
  } catch { return null; }
}

const ADMIN_EDIT_ROLES = ['barangaycaptain', 'secretary'];

/* ─── Sub-components ─────────────────────────────── */
function StatusIcon({ type }) {
  if (type === 'clock') return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
    </svg>
  );
  if (type === 'arrow') return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="7" y1="17" x2="17" y2="7" /><polyline points="7 7 17 7 17 17" />
    </svg>
  );
  if (type === 'check') return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" /><path d="M9 12l2 2 4-4" />
    </svg>
  );
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <circle cx="12" cy="16" r="0.5" fill="currentColor" />
    </svg>
  );
}

/* ─── Main Component ─────────────────────────────── */
export default function AdminComplaints() {
  const [complaints,     setComplaints]     = useState([]);
  const [sidebarOpen,    setSidebarOpen]    = useState(window.innerWidth >= 1024);
  const [loading,        setLoading]        = useState(true);
  const [fetchError,     setFetchError]     = useState('');
  const [search,         setSearch]         = useState('');
  const [statusFilter,   setStatusFilter]   = useState('All');
  const [page,           setPage]           = useState(1);
  const [toast,          setToast]          = useState('');

  // File complaint modal
  const [showFileModal, setShowFileModal] = useState(false);
  const [form,          setForm]          = useState(EMPTY_FORM);
  const [formError,     setFormError]     = useState('');
  const [submitting,    setSubmitting]    = useState(false);

  // View details modal
  const [viewTarget,  setViewTarget]  = useState(null);
  const [updatingId,  setUpdatingId]  = useState(null);

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting,     setDeleting]     = useState(false);
  const [adminRole,    setAdminRole]    = useState(null);

  const showToast = msg => { setToast(msg); setTimeout(() => setToast(''), 3500); };

  // Get current admin's role
  useEffect(() => {
    const token = getToken();
    const decoded = decodeAdminToken(token);
    setAdminRole(decoded?.adminRole || null);
  }, []);

  const canEdit = ADMIN_EDIT_ROLES.includes(adminRole);

  /* ── Fetch ── */
  const fetchComplaints = useCallback(async () => {
    setLoading(true); setFetchError('');
    try {
      const token = getToken();
      if (!token) throw new Error('No admin token');
      const res = await fetch(`${API_URL}/admin/complaints`, {
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

  /* ── Real-time socket: admin room events ── */
  useEffect(() => {
    const token = getToken();
    if (!token) return;

    const socket = io(
      import.meta.env.VITE_SOCKET_URL ||
      import.meta.env.VITE_BACKEND_URL?.replace('/api', '') || '',
      { auth: { token }, transports: ['websocket'], reconnection: true }
    );

    // A resident filed a new complaint — prepend it to the list
    socket.on('complaint_created', (newComplaint) => {
      setComplaints(prev => {
        // Avoid duplicates (e.g. if the admin themselves just filed it)
        if (prev.some(c => c._id === newComplaint._id)) return prev;
        return [newComplaint, ...prev];
      });
    });

    // A complaint was updated (status change or field edit from another admin tab)
    socket.on('complaint_updated', (updated) => {
      setComplaints(prev => prev.map(c => c._id === updated._id ? updated : c));
      // If the view modal is open for this complaint, patch it live too
      setViewTarget(prev => prev?._id === updated._id ? updated : prev);
    });

    // A complaint was deleted from another admin tab
    socket.on('complaint_deleted', ({ _id }) => {
      setComplaints(prev => prev.filter(c => c._id !== _id));
      setViewTarget(prev => prev?._id === _id ? null : prev);
      setDeleteTarget(prev => prev?._id === _id ? null : prev);
    });

    return () => socket.disconnect();
  }, []);

  /* ── Derived stats ── */
  const stats = {
    pending:   complaints.filter(c => c.status === 'Pending').length,
    active:    complaints.filter(c => c.status === 'In Progress').length,
    resolved:  complaints.filter(c => c.status === 'Resolved').length,
    escalated: complaints.filter(c => c.status === 'Escalated').length,
  };

  const filtered = complaints.filter(c => {
    const q = search.toLowerCase();
    const matchSearch =
      c.id?.toLowerCase().includes(q)       ||
      c.resident.toLowerCase().includes(q)  ||
      c.category.toLowerCase().includes(q);
    const matchStatus = statusFilter === 'All' || c.status === statusFilter;
    return matchSearch && matchStatus;
  });

  useEffect(() => { setPage(1); }, [search, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage   = Math.min(page, totalPages);
  const paginated  = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  /* ── File modal handlers ── */
  const openFileModal  = () => { setForm(EMPTY_FORM); setFormError(''); setShowFileModal(true); };
  const closeFileModal = () => { setShowFileModal(false); setFormError(''); };

  const handleChange = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }));
    if (formError) setFormError('');
  };

  const handleSubmit = async () => {
    if (!form.resident.trim())   return setFormError('Resident full name is required.');
    if (!form.address.trim())    return setFormError('Home address / zone is required.');
    const categoryVal = form.category === 'Other' ? form.customCategory.trim() : form.category;
    if (!categoryVal)            return setFormError('Complaint category is required.');
    if (!form.description.trim()) return setFormError('Complaint description is required.');

    setSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/admin/complaints`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({
          resident:         form.resident.trim(),
          category:         categoryVal,
          location:         form.address.trim(),
          description:      form.description.trim(),
          priority:         form.priority,
          assignedOfficial: form.assignedOfficial || 'Unassigned',
          status:           form.status,
        }),
      });
      const data = await res.json();
      if (!res.ok) return setFormError(data.message || 'Creation failed.');
      setComplaints(prev => [data, ...prev]);
      closeFileModal();
      showToast('Complaint filed successfully!');
    } catch {
      setFormError('Unable to connect to the server.');
    } finally {
      setSubmitting(false);
    }
  };

  /* ── Status update from view modal ── */
  const handleStatusUpdate = async (complaint, newStatus) => {
    setUpdatingId(complaint._id);
    try {
      const res = await fetch(`${API_URL}/admin/complaints/${complaint._id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ status: newStatus }),
      });
      const data = await res.json();
      if (!res.ok) return showToast(data.message || 'Update failed.');
      setComplaints(prev => prev.map(c => c._id === complaint._id ? data : c));
      setViewTarget(data);
      showToast(`Status updated to "${newStatus}".`);
    } catch {
      showToast('Unable to connect to server.');
    } finally {
      setUpdatingId(null);
    }
  };

  /* ── Delete ── */
  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`${API_URL}/admin/complaints/${deleteTarget._id}`, {
        method: 'DELETE', headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) { const d = await res.json(); return showToast(d.message || 'Delete failed.'); }
      setComplaints(prev => prev.filter(c => c._id !== deleteTarget._id));
      showToast('Complaint record deleted.');
    } catch {
      showToast('Unable to connect to server.');
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  /* ── Pagination helpers ── */
  const pageNums = () => {
    const nums = [];
    for (let i = 1; i <= totalPages; i++) {
      if (i === 1 || i === totalPages || Math.abs(i - safePage) <= 1) nums.push(i);
      else if (nums[nums.length - 1] !== '…') nums.push('…');
    }
    return nums;
  };

  /* ─── Render ──────────────────────────────────── */
  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />
      <div style={{ flex: 1, height: '100vh', overflowY: 'auto' }}>
        <div className="cmp-page">

          {/* Toast */}
          {toast && (
            <div className="cmp-toast">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="16" height="16">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              {toast}
            </div>
          )}

          <AdminTopbar
            placeholder="Search complaints..."
            search={search}
            onSearch={setSearch}
            onHamburger={() => setSidebarOpen(v => !v)}
            sidebarOpen={sidebarOpen}
            setSidebarOpen={setSidebarOpen}
          />

          {/* Page Title */}
          <div className="cmp-header">
            <div>
              <h1>Complaints</h1>
              <p>Monitor and resolve barangay complaints filed by residents.</p>
            </div>
            {canEdit && (
              <button className="cmp-header__btn" onClick={openFileModal}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                File Complaint
              </button>
            )}
          </div>

          {/* Stat Cards */}
          <div className="cmp-stats">
            <div className="cmp-stat">
              <div className="cmp-stat__icon cmp-stat__icon--default">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                </svg>
              </div>
              <div>
                <p className="cmp-stat__label">PENDING</p>
                <p className="cmp-stat__value">{stats.pending}</p>
              </div>
            </div>
            <div className="cmp-stat">
              <div className="cmp-stat__icon cmp-stat__icon--default">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="7" y1="17" x2="17" y2="7" /><polyline points="7 7 17 7 17 17" />
                </svg>
              </div>
              <div>
                <p className="cmp-stat__label">ACTIVE</p>
                <p className="cmp-stat__value">{stats.active}</p>
              </div>
            </div>
            <div className="cmp-stat">
              <div className="cmp-stat__icon cmp-stat__icon--default">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" /><path d="M9 12l2 2 4-4" />
                </svg>
              </div>
              <div>
                <p className="cmp-stat__label">RESOLVED</p>
                <p className="cmp-stat__value">{stats.resolved}</p>
              </div>
            </div>
            <div className="cmp-stat">
              <div className="cmp-stat__icon cmp-stat__icon--escalated">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <circle cx="12" cy="16" r="0.5" fill="currentColor" />
                </svg>
              </div>
              <div>
                <p className="cmp-stat__label">ESCALATED</p>
                <p className="cmp-stat__value cmp-stat__value--escalated">{stats.escalated}</p>
              </div>
            </div>
          </div>

          <AdminFilterBar
            groups={[{
              label: 'Status',
              value: statusFilter,
              onChange: (v) => { setStatusFilter(v); setPage(1); },
              options: STATUS_FILTERS.map(s => ({
                value: s,
                label: s,
                count: s === 'All'
                  ? complaints.length
                  : complaints.filter(c => c.status === s).length,
              })),
            }]}
          />

          {/* Loading / Error */}
          {loading && (
            <div className="cmp-table-wrap" style={{ margin: '0 32px' }}>
              <p className="cmp-table__empty">Loading complaints…</p>
            </div>
          )}
          {!loading && fetchError && (
            <div className="cmp-table-wrap" style={{ margin: '0 32px' }}>
              <p className="cmp-table__empty" style={{ color: '#dc2626' }}>{fetchError}</p>
            </div>
          )}

          {/* Table */}
          {!loading && !fetchError && (
            <div className="cmp-table-wrap">
              <table className="cmp-table">
                <thead>
                  <tr>
                    <th>Resident</th>
                    <th>Category</th>
                    <th>Status</th>
                    <th>Date Filed</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {paginated.length === 0 && (
                    <tr><td colSpan="5" className="cmp-table__empty">No complaints found.</td></tr>
                  )}
                  {paginated.map(c => {
                    const sm = STATUS_META[c.status]   || STATUS_META['Pending'];
                    const pm = PRIORITY_META[c.priority] || PRIORITY_META['Medium'];
                    return (
                      <tr key={c._id} className="cmp-table__row">
                        <td>
                          <div className="cmp-table__resident">
                            <div className="cmp-table__avatar-placeholder">
                              {c.resident.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <p className="cmp-table__name">{c.resident}</p>
                              {c.residentEmail && (
                                <p className="cmp-table__email">{c.residentEmail}</p>
                              )}
                              <p className="cmp-table__priority">
                                <span className="cmp-priority-dot" style={{ background: pm.dot }} />
                                {c.priority}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td data-label="Category" className="cmp-table__category">{c.category}</td>
                        <td data-label="Status">
                          <span className={`cmp-status ${sm.className}`}>
                            <span className="cmp-status__icon"><StatusIcon type={sm.icon} /></span>
                            {c.status}
                          </span>
                        </td>
                        <td data-label="Date Filed" className="cmp-table__date">{c.dateFiled}</td>
                        <td>
                          <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                            <button
                              className="cmp-table__view-btn"
                              title="View Details"
                              onClick={() => setViewTarget(c)}
                            >
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                <circle cx="12" cy="12" r="3" />
                              </svg>
                            </button>
                            {canEdit && (
                              <button
                                className="cmp-table__view-btn cmp-table__delete-btn"
                                title="Delete"
                                onClick={() => setDeleteTarget(c)}
                              >
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <polyline points="3 6 5 6 21 6" />
                                  <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
                                  <path d="M10 11v6M14 11v6" />
                                  <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" />
                                </svg>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="cmp-pagination">
                  <p className="cmp-pagination__info">
                    Showing <strong>{(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filtered.length)}</strong> of <strong>{filtered.length}</strong>
                  </p>
                  <div className="cmp-pagination__controls">
                    <button className="cmp-page-btn" onClick={() => setPage(p => p - 1)} disabled={safePage === 1}>← Prev</button>
                    {pageNums().map((n, i) =>
                      n === '…'
                        ? <span key={`e${i}`} className="cmp-page-ellipsis">…</span>
                        : <button key={n} className={`cmp-page-num${safePage === n ? ' cmp-page-num--active' : ''}`} onClick={() => setPage(n)}>{n}</button>
                    )}
                    <button className="cmp-page-btn" onClick={() => setPage(p => p + 1)} disabled={safePage === totalPages}>Next →</button>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="cmp-footer">
            Showing <strong>{filtered.length}</strong> of <strong>{complaints.length}</strong> complaints
          </div>
        </div>

        {/* ══ FILE COMPLAINT MODAL ═══════════════════ */}
        {showFileModal && (
          <div className="cmp-overlay" onClick={closeFileModal}>
            <div className="cmp-modal cmp-file-modal" onClick={e => e.stopPropagation()}>
              <div className="cmp-modal__header">
                <div>
                  <h2 className="cmp-modal__title">File a Complaint</h2>
                  <p className="cmp-modal__subtitle">
                    For walk-in residents not registered in the app. Fields marked <span style={{ color: '#ef4444' }}>*</span> are required.
                  </p>
                </div>
                <button className="cmp-modal__close" onClick={closeFileModal}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>

              <div className="cmp-modal__body">
                {/* Resident Info */}
                <div className="cmp-form-section">
                  <p className="cmp-form-section__label">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                      <circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
                    </svg>
                    Resident Information
                  </p>
                  <div className="cmp-form-row">
                    <div className="cmp-form-group">
                      <label className="cmp-form-label">Full Name <span className="cmp-req">*</span></label>
                      <input className="cmp-form-input" type="text" placeholder="e.g. Maria Santos"
                        value={form.resident} onChange={e => handleChange('resident', e.target.value)} />
                    </div>
                    <div className="cmp-form-group">
                      <label className="cmp-form-label">Contact Number</label>
                      <input className="cmp-form-input" type="text" placeholder="e.g. 09XX-XXX-XXXX"
                        value={form.contact} onChange={e => handleChange('contact', e.target.value)} />
                    </div>
                  </div>
                  <div className="cmp-form-group">
                    <label className="cmp-form-label">Home Address / Zone <span className="cmp-req">*</span></label>
                    <input className="cmp-form-input" type="text" placeholder="e.g. Blk 4 Lot 12, Purok 3"
                      value={form.address} onChange={e => handleChange('address', e.target.value)} />
                  </div>
                </div>

                {/* Complaint Details */}
                <div className="cmp-form-section">
                  <p className="cmp-form-section__label">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                    </svg>
                    Complaint Details
                  </p>
                  <div className="cmp-form-row">
                    <div className="cmp-form-group">
                      <label className="cmp-form-label">Category <span className="cmp-req">*</span></label>
                      <select className="cmp-form-input cmp-form-select"
                        value={form.category} onChange={e => handleChange('category', e.target.value)}>
                        <option value="">Select category...</option>
                        {CATEGORY_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <div className="cmp-form-group">
                      <label className="cmp-form-label">Priority Level</label>
                      <div className="cmp-priority-row">
                        {['Low', 'Medium', 'High'].map(p => (
                          <button key={p} type="button"
                            className={`cmp-priority-btn cmp-priority-btn--${p.toLowerCase()}${form.priority === p ? ' cmp-priority-btn--active' : ''}`}
                            onClick={() => handleChange('priority', p)}>
                            <span className="cmp-priority-btn__dot" />{p}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                  {form.category === 'Other' && (
                    <div className="cmp-form-group">
                      <label className="cmp-form-label">Specify Category <span className="cmp-req">*</span></label>
                      <input className="cmp-form-input" type="text" placeholder="Describe the type of complaint..."
                        value={form.customCategory} onChange={e => handleChange('customCategory', e.target.value)} />
                    </div>
                  )}
                  <div className="cmp-form-group">
                    <label className="cmp-form-label">Complaint Description <span className="cmp-req">*</span></label>
                    <textarea className="cmp-form-input cmp-form-textarea" rows={4}
                      placeholder="Describe the complaint in detail — include location, time of incident, and involved parties if any..."
                      value={form.description} onChange={e => handleChange('description', e.target.value)} />
                  </div>
                </div>

                {/* Assignment */}
                <div className="cmp-form-section">
                  <p className="cmp-form-section__label">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" />
                      <path d="M23 21v-2a4 4 0 00-3-3.87" /><path d="M16 3.13a4 4 0 010 7.75" />
                    </svg>
                    Assignment & Status
                  </p>
                  <div className="cmp-form-row">
                    <div className="cmp-form-group">
                      <label className="cmp-form-label">Assigned Official</label>
                      <select className="cmp-form-input cmp-form-select"
                        value={form.assignedOfficial} onChange={e => handleChange('assignedOfficial', e.target.value)}>
                        <option value="">Unassigned</option>
                        {OFFICIAL_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    </div>
                    <div className="cmp-form-group">
                      <label className="cmp-form-label">Initial Status</label>
                      <select className="cmp-form-input cmp-form-select"
                        value={form.status} onChange={e => handleChange('status', e.target.value)}>
                        <option value="Pending">Pending</option>
                        <option value="In Progress">In Progress</option>
                        <option value="Escalated">Escalated</option>
                      </select>
                    </div>
                  </div>
                </div>

                {formError && (
                  <div className="cmp-form-error">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="8" x2="12" y2="12" />
                      <line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                    {formError}
                  </div>
                )}
              </div>

              <div className="cmp-modal__footer">
                <button className="cmp-modal__cancel" onClick={closeFileModal} disabled={submitting}>Cancel</button>
                <button className="cmp-modal__submit" onClick={handleSubmit} disabled={submitting}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="15" height="15">
                    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  {submitting ? 'Filing…' : 'File Complaint'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ══ VIEW DETAILS MODAL ═════════════════════ */}
        {viewTarget && (
          <div className="cmp-overlay" onClick={() => setViewTarget(null)}>
            <div className="cmp-modal cmp-view-modal" onClick={e => e.stopPropagation()}>
              <div className="cmp-modal__header">
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div className="cmp-table__avatar-placeholder cmp-table__avatar-placeholder--lg">
                    {viewTarget.resident.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h2 className="cmp-modal__title" style={{ marginBottom: 2 }}>{viewTarget.resident}</h2>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span className="cmp-table__id" style={{ fontSize: 13 }}>{viewTarget.id}</span>
                      {viewTarget.walkinFiled && <span className="cmp-walkin-badge">Walk-in</span>}
                    </div>
                    {viewTarget.residentEmail && (
                      <p style={{ fontSize: 12, color: '#6b7280', margin: '2px 0 0' }}>{viewTarget.residentEmail}</p>
                    )}
                  </div>
                </div>
                <button className="cmp-modal__close" onClick={() => setViewTarget(null)}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
              <div className="cmp-modal__body">
                <div className="cmp-view-grid">
                  <div className="cmp-view-item">
                    <span className="cmp-view-item__label">Category</span>
                    <span className="cmp-view-item__value">{viewTarget.category}</span>
                  </div>
                  <div className="cmp-view-item">
                    <span className="cmp-view-item__label">Priority</span>
                    <span className="cmp-view-item__value" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span className="cmp-priority-dot" style={{ background: (PRIORITY_META[viewTarget.priority] || PRIORITY_META['Medium']).dot, width: 8, height: 8 }} />
                      {viewTarget.priority}
                    </span>
                  </div>
                  <div className="cmp-view-item">
                    <span className="cmp-view-item__label">Date Filed</span>
                    <span className="cmp-view-item__value">{viewTarget.dateFiled}</span>
                  </div>
                  <div className="cmp-view-item">
                    <span className="cmp-view-item__label">Assigned To</span>
                    <span className="cmp-view-item__value">{viewTarget.assignedOfficial}</span>
                  </div>
                  {viewTarget.location && (
                    <div className="cmp-view-item">
                      <span className="cmp-view-item__label">Location / Zone</span>
                      <span className="cmp-view-item__value">{viewTarget.location}</span>
                    </div>
                  )}
                </div>

                {viewTarget.description && (
                  <div className="cmp-view-desc">
                    <p className="cmp-view-item__label" style={{ marginBottom: 6 }}>Description</p>
                    <p className="cmp-view-desc__text">{viewTarget.description}</p>
                  </div>
                )}

                {/* Status updater */}
                {canEdit && (
                  <div>
                    <p className="cmp-view-item__label" style={{ marginBottom: 8 }}>Update Status</p>
                    <div className="cmp-view-status-row">
                      {['Pending', 'In Progress', 'Resolved', 'Escalated'].map(s => {
                        const sm = STATUS_META[s];
                        return (
                          <button
                            key={s}
                            className={`cmp-view-status-btn ${sm.className}${viewTarget.status === s ? ' cmp-view-status-btn--active' : ''}`}
                            onClick={() => handleStatusUpdate(viewTarget, s)}
                            disabled={updatingId === viewTarget._id}
                          >
                            {s}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
              <div className="cmp-modal__footer">
                {canEdit && (
                  <button
                    className="cmp-modal__cancel cmp-modal__cancel--danger"
                    onClick={() => { setDeleteTarget(viewTarget); setViewTarget(null); }}
                  >
                    Delete Record
                  </button>
                )}
                <button className="cmp-modal__submit" onClick={() => setViewTarget(null)}>Done</button>
              </div>
            </div>
          </div>
        )}

        {/* ══ DELETE CONFIRM MODAL ═══════════════════ */}
        {deleteTarget && (
          <div className="cmp-overlay" onClick={() => setDeleteTarget(null)}>
            <div className="cmp-confirm-modal" onClick={e => e.stopPropagation()}>
              <div className="cmp-confirm-modal__icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
                  <path d="M10 11v6M14 11v6" />
                  <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" />
                </svg>
              </div>
              <h3 className="cmp-confirm-modal__title">Delete Complaint?</h3>
              <p className="cmp-confirm-modal__desc">
                Case <strong>{deleteTarget.id}</strong> filed by <strong>{deleteTarget.resident}</strong> will be permanently removed.
              </p>
              <div className="cmp-confirm-modal__actions">
                <button className="cmp-modal__cancel" onClick={() => setDeleteTarget(null)} disabled={deleting}>Cancel</button>
                <button className="cmp-confirm-modal__delete" onClick={handleDelete} disabled={deleting}>
                  {deleting ? 'Deleting…' : 'Yes, Delete'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}