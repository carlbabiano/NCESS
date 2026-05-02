import { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import Sidebar from '../../components/adminsidebar';
import AdminTopbar from '../../components/admintopbar';
import { AdminFilterBar } from '../../components/adminfilterbar';
import './adminannouncements.css';

const API_URL = import.meta.env.VITE_BACKEND_URL;

const CATEGORY_COLORS = {
  Environment: 'category--environment',
  Health: 'category--health',
  Safety: 'category--safety',
  Events: 'category--events',
  Services: 'category--services',
};

const EMPTY_FORM = {
  category: 'Environment',
  author: '',
  title: '',
  body: '',
  pinned: false,
  imageFile: null,
  imagePreview: null,
};

const FILTERS = ['All', 'Environment', 'Health', 'Safety', 'Events', 'Services'];

const fmtDateTime = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
};

// Helper functions for role-based access
function getAdminToken() {
  return (
    localStorage.getItem('admin_token') ||
    sessionStorage.getItem('admin_token') ||
    localStorage.getItem('adminToken') ||
    sessionStorage.getItem('adminToken') || ''
  );
}

function decodeAdminToken(token) {
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(base64));
  } catch { return null; }
}

const ADMIN_EDIT_ROLES = ['barangaycaptain', 'secretary'];
const normalizeRole = (role) => String(role || '').toLowerCase().replace(/\s+/g, '');

/* ─── Component ─────────────────────────────────── */
export default function AdminAnnouncements() {
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading]             = useState(true);
  const [activeFilter, setActiveFilter]   = useState('All');
  const [search, setSearch]               = useState('');
  const [showModal, setShowModal]         = useState(false);
  const [selectedAnn, setSelectedAnn]     = useState(null);
  const [showPostModal, setShowPostModal] = useState(false);
  const [editingAnn, setEditingAnn]       = useState(null);
  const [form, setForm]                   = useState(EMPTY_FORM);
  const [formError, setFormError]         = useState('');
  const [showSuccess, setShowSuccess]     = useState('');
  const [deleteTarget, setDeleteTarget]   = useState(null);
  const [dragOver, setDragOver]           = useState(false);
  const [sidebarOpen, setSidebarOpen]     = useState(false);
  const [adminRole, setAdminRole]         = useState(null);

  // Get current admin's role
  useEffect(() => {
    const token = getAdminToken();
    const decoded = decodeAdminToken(token);
    setAdminRole(normalizeRole(decoded?.adminRole));
  }, []);

  const canEdit = ADMIN_EDIT_ROLES.includes(adminRole);

  /* ── Fetch announcements on mount ── */
  useEffect(() => {
    const fetchAnnouncements = async () => {
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
    fetchAnnouncements();
  }, []);

  /* ── Real-time sync via Socket.io ── */
  useEffect(() => {
    const token =
      localStorage.getItem('admin_token') ||
      sessionStorage.getItem('admin_token') ||
      localStorage.getItem('adminToken') ||
      sessionStorage.getItem('adminToken') || '';

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
      setAnnouncements((prev) => {
        // Avoid duplicate if this tab already added it optimistically
        if (prev.some((a) => a._id === ann._id)) return prev;
        return [ann, ...prev];
      });
    });

    socket.on('announcement_updated', (updated) => {
      console.log('[Socket.io] announcement_updated:', updated._id);
      setAnnouncements((prev) =>
        prev.map((a) => (a._id === updated._id ? updated : a))
      );
      // Keep read modal in sync if it's open for this announcement
      setSelectedAnn((prev) => (prev?._id === updated._id ? updated : prev));
    });

    socket.on('announcement_deleted', ({ _id }) => {
      console.log('[Socket.io] announcement_deleted:', _id);
      setAnnouncements((prev) => prev.filter((a) => a._id !== _id));
      setSelectedAnn((prev) => (prev?._id === _id ? null : prev));
      setShowModal((open) => (open && _id ? false : open));
    });

    return () => socket.disconnect();
  }, []);

  /* ── Image helpers ── */
  const applyImageFile = (file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setFormError('Only image files are allowed (JPEG, PNG, WebP, etc.).');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setFormError('Image must be smaller than 5 MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      setForm((prev) => ({ ...prev, imageFile: file, imagePreview: e.target.result }));
      setFormError('');
    };
    reader.readAsDataURL(file);
  };

  const handleImageInput = (e) => applyImageFile(e.target.files[0]);

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    applyImageFile(e.dataTransfer.files[0]);
  };

  const removeImage = () => setForm((prev) => ({ ...prev, imageFile: null, imagePreview: null }));

  /* ── Filtering ── */
  const filtered = announcements
    .filter((a) => {
      const matchFilter = activeFilter === 'All' || a.category === activeFilter;
      const matchSearch =
        a.title.toLowerCase().includes(search.toLowerCase()) ||
        a.body.toLowerCase().includes(search.toLowerCase());
      return matchFilter && matchSearch;
    })
    .sort((a, b) => {
      if (b.pinned !== a.pinned) return (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0);
      return new Date(b.createdAt) - new Date(a.createdAt);
    });

  /* ── Read modal ── */
  const openModal = (ann) => { setSelectedAnn(ann); setShowModal(true); };
  const closeModal = () => { setShowModal(false); setSelectedAnn(null); };

  /* ── Post / Edit modal ── */
  const openPostModal = () => {
    if (!canEdit) return;
    setEditingAnn(null);
    setForm(EMPTY_FORM);
    setFormError('');
    setShowPostModal(true);
  };

  const openEditModal = (ann) => {
    if (!canEdit) return;
    setEditingAnn(ann);
    setForm({
      category:     ann.category,
      author:       ann.author,
      title:        ann.title,
      body:         ann.body,
      pinned:       ann.pinned,
      imageFile:    null,
      imagePreview: ann.image || null,
    });
    setFormError('');
    setShowPostModal(true);
  };

  const closePostModal = () => { setShowPostModal(false); setEditingAnn(null); setFormError(''); };

  const handleFormChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (formError) setFormError('');
  };

const handleSubmit = async () => {
  if (!canEdit) return setFormError('You only have read-only access to announcements.');
  if (!form.author.trim()) return setFormError('Author / office name is required.');
  if (!form.title.trim())  return setFormError('Title is required.');
  if (!form.body.trim())   return setFormError('Content body is required.');

  const fd = new FormData();
  fd.append('category',      form.category);
  fd.append('categoryColor', CATEGORY_COLORS[form.category]);
  fd.append('author',        form.author);
  fd.append('title',         form.title);
  fd.append('body',          form.body);
  fd.append('pinned',        form.pinned);

  if (form.imageFile) {
    fd.append('image', form.imageFile);          // actual File object → multer handles it
  } else if (form.imagePreview) {
    fd.append('image', form.imagePreview);       // keep existing URL when editing
  }
  // if neither, send no image → stored as null/empty, user side shows placeholder

  try {
    if (editingAnn) {
      const res = await fetch(`${API_URL}/announcements/${editingAnn._id}`, {
        method: 'PUT',
        body:   fd,   // NO 'Content-Type' header — browser sets it automatically for FormData
      });
      if (!res.ok) {
        const err = await res.json();
        return setFormError(err.message || 'Failed to update announcement');
      }
      setShowSuccess('Announcement updated successfully!');
    } else {
      const res = await fetch(`${API_URL}/announcements`, {
        method: 'POST',
        body:   fd,
      });
      if (!res.ok) {
        const err = await res.json();
        return setFormError(err.message || 'Failed to post announcement');
      }
      setShowSuccess('Announcement posted successfully!');
    }
    closePostModal();
    setTimeout(() => setShowSuccess(''), 3500);
  } catch (error) {
    console.error('Announcement error:', error);
    setFormError('Something went wrong. Please try again.');
  }
};

  /* ── Delete ── */
 const handleDelete = async (id) => {
    if (!canEdit) return;
    try {
      await fetch(`${API_URL}/announcements/${id}`, { method: 'DELETE' });
      setAnnouncements((prev) => prev.filter((a) => a._id !== id));
      setDeleteTarget(null);
    } catch {
      console.error('Delete failed');
    }
  };

  /* ─── Render ─────────────────────────────────── */
  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />
      <div style={{ flex: 1, height: '100vh', overflowY: 'auto' }}>
        <div className="ann-page">

          {/* Toast */}
          {showSuccess && (
            <div className="ann-toast">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="16" height="16">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              {showSuccess}
            </div>
          )}

          {/* Topbar */}
          <AdminTopbar
            placeholder="Search..."
            search={search}
            onSearch={setSearch}
            onHamburger={() => setSidebarOpen(prev => !prev)}
            sidebarOpen={sidebarOpen}
            setSidebarOpen={setSidebarOpen}
          />

          {/* Page Header */}
          <div className="ann-header">
            <div className="ann-header__left">
              <h1>Announcements</h1>
              <p>Manage and publish barangay-wide announcements for residents.</p>
            </div>
            {canEdit && (
              <button className="ann-header__btn" onClick={openPostModal}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                Post Announcement
              </button>
            )}
          </div>

          <AdminFilterBar
            groups={[{
              label: 'Category',
              value: activeFilter,
              onChange: setActiveFilter,
              options: FILTERS,
            }]}
            count={`Showing ${filtered.length} announcements`}
          />

          {/* Announcement Cards */}
          <div className="ann-list">
            {loading && (
              <div className="ann-empty">Loading announcements...</div>
            )}
            {!loading && filtered.length === 0 && (
              <div className="ann-empty">No announcements found.</div>
            )}
            {!loading && filtered.map((ann) => (
              <div className="ann-card" key={ann._id}>
                <div className="ann-card__image-wrap">
                  {ann.image
                    ? <img src={ann.image} alt={ann.title} className="ann-card__image" />
                    : <div className="ann-card__no-img">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="32" height="32"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                        <span>No Image Provided</span>
                      </div>
                  }
                  <span className={`ann-card__category ${ann.categoryColor}`}>
                    {ann.category}
                  </span>
                  {ann.pinned && (
                    <span className="ann-card__pinned">
                      📌 Pinned
                    </span>
                  )}
                </div>

                <div className="ann-card__body">
                  <p className="ann-card__meta">
                    <span className="ann-card__author">{ann.author}</span>
                    <span className="ann-card__dot">•</span>
                    <span className="ann-card__date">{ann.date}</span>
                  </p>
                  <h2 className="ann-card__title">{ann.title}</h2>
                  <p className="ann-card__desc">{ann.body}</p>

                  <div className="ann-card__footer">
                    <button className="ann-card__read-btn" onClick={() => openModal(ann)}>
                      Read Full Announcement
                    </button>
                    {canEdit && (
                      <div className="ann-card__actions">
                        <button className="ann-card__icon-btn" title="Edit" onClick={() => openEditModal(ann)}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                          </svg>
                        </button>
                        <button className="ann-card__icon-btn ann-card__icon-btn--delete" title="Delete" onClick={() => setDeleteTarget(ann)}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
                            <path d="M10 11v6M14 11v6" />
                            <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" />
                          </svg>
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="ann-card__timestamps">
                    <span className="ann-card__ts">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="12" height="12"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                      Posted: {fmtDateTime(ann.createdAt)}
                    </span>
                    {ann.updatedAt && ann.updatedAt !== ann.createdAt && (
                      <span className="ann-card__ts ann-card__ts--updated">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="12" height="12"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                        Updated: {fmtDateTime(ann.updatedAt)}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Read Modal ─────────────────────────── */}
        {showModal && selectedAnn && (
          <div className="ann-modal-overlay" onClick={closeModal}>
            <div className="ann-modal" onClick={(e) => e.stopPropagation()}>
              <div className="ann-modal__image-wrap">
                {selectedAnn.image
                  ? <img src={selectedAnn.image} alt={selectedAnn.title} className="ann-modal__image" />
                  : <div className="ann-card__no-img ann-modal__no-img">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="36" height="36"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                      <span>No Image Provided</span>
                    </div>
                }
                <span className={`ann-card__category ${selectedAnn.categoryColor}`}>
                  {selectedAnn.category}
                </span>
                <button className="ann-modal__close" onClick={closeModal}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
              <div className="ann-modal__body">
                <p className="ann-card__meta">
                  <span className="ann-card__author">{selectedAnn.author}</span>
                  <span className="ann-card__dot">•</span>
                  <span className="ann-card__date">{selectedAnn.date}</span>
                </p>
                <h2 className="ann-modal__title">{selectedAnn.title}</h2>
                <p className="ann-modal__desc">{selectedAnn.body}</p>
                <div className="ann-card__timestamps ann-modal__timestamps">
                  <span className="ann-card__ts">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="12" height="12"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                    Posted: {fmtDateTime(selectedAnn.createdAt)}
                  </span>
                  {selectedAnn.updatedAt && selectedAnn.updatedAt !== selectedAnn.createdAt && (
                    <span className="ann-card__ts ann-card__ts--updated">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="12" height="12"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                      Updated: {fmtDateTime(selectedAnn.updatedAt)}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Post / Edit Modal ─────────────────── */}
        {showPostModal && (
          <div className="ann-modal-overlay" onClick={closePostModal}>
            <div className="ann-modal ann-post-modal" onClick={(e) => e.stopPropagation()}>
              <div className="ann-post-modal__header">
                <div>
                  <h2 className="ann-post-modal__title">
                    {editingAnn ? 'Edit Announcement' : 'Post New Announcement'}
                  </h2>
                  <p className="ann-post-modal__subtitle">
                    {editingAnn ? 'Update the details below.' : 'Fill in the details to publish a barangay-wide announcement.'}
                  </p>
                </div>
                <button className="ann-modal__close ann-modal__close--inline" onClick={closePostModal}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>

              <div className="ann-post-modal__body">
                {/* Category */}
                <div className="ann-form-group">
                  <label className="ann-form-label">Category</label>
                  <div className="ann-form-category-row">
                    {Object.keys(CATEGORY_COLORS).map((cat) => (
                      <button
                        key={cat}
                        type="button"
                        className={`ann-form-cat-btn ${CATEGORY_COLORS[cat]}${form.category === cat ? ' ann-form-cat-btn--active' : ''}`}
                        onClick={() => handleFormChange('category', cat)}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Author */}
                <div className="ann-form-group">
                  <label className="ann-form-label">Author / Office</label>
                  <input
                    className="ann-form-input"
                    type="text"
                    placeholder="e.g. Hon. Roberto Santos"
                    value={form.author}
                    onChange={(e) => handleFormChange('author', e.target.value)}
                  />
                </div>

                {/* Title */}
                <div className="ann-form-group">
                  <label className="ann-form-label">Announcement Title</label>
                  <input
                    className="ann-form-input"
                    type="text"
                    placeholder="e.g. Community Clean-up Drive: Purok 2 Initiative"
                    value={form.title}
                    onChange={(e) => handleFormChange('title', e.target.value)}
                  />
                </div>

                {/* Body */}
                <div className="ann-form-group">
                  <label className="ann-form-label">Content</label>
                  <textarea
                    className="ann-form-input ann-form-textarea"
                    placeholder="Write the full announcement content here..."
                    value={form.body}
                    onChange={(e) => handleFormChange('body', e.target.value)}
                    rows={5}
                  />
                </div>

                {/* Image Upload */}
                <div className="ann-form-group">
                  <label className="ann-form-label">
                    Cover Image
                    <span className="ann-form-label__hint"> — optional, defaults to category image</span>
                  </label>

                  {form.imagePreview ? (
                    <div className="ann-img-preview">
                      <img src={form.imagePreview} alt="Preview" className="ann-img-preview__img" />
                      <div className="ann-img-preview__overlay">
                        <label className="ann-img-preview__change" htmlFor="ann-img-input">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="15" height="15">
                            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                          </svg>
                          Change
                        </label>
                        <button type="button" className="ann-img-preview__remove" onClick={removeImage}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="15" height="15">
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
                            <path d="M10 11v6M14 11v6" />
                            <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" />
                          </svg>
                          Remove
                        </button>
                      </div>
                    </div>
                  ) : (
                    <label
                      htmlFor="ann-img-input"
                      className={`ann-img-dropzone${dragOver ? ' ann-img-dropzone--over' : ''}`}
                      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                      onDragLeave={() => setDragOver(false)}
                      onDrop={handleDrop}
                    >
                      <div className="ann-img-dropzone__icon">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="28" height="28">
                          <rect x="3" y="3" width="18" height="18" rx="3" />
                          <circle cx="8.5" cy="8.5" r="1.5" />
                          <polyline points="21 15 16 10 5 21" />
                        </svg>
                      </div>
                      <p className="ann-img-dropzone__text">
                        <strong>Click to upload</strong> or drag & drop
                      </p>
                      <p className="ann-img-dropzone__hint">PNG, JPG, WebP — max 5 MB</p>
                    </label>
                  )}

                  <input
                    id="ann-img-input"
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={handleImageInput}
                  />
                </div>

                {/* Pinned toggle */}
                <div className="ann-form-group ann-form-group--row">
                  <label className="ann-form-toggle">
                    <input
                      type="checkbox"
                      checked={form.pinned}
                      onChange={(e) => handleFormChange('pinned', e.target.checked)}
                    />
                    <span className="ann-form-toggle__track">
                      <span className="ann-form-toggle__thumb" />
                    </span>
                    <span className="ann-form-toggle__label">Pin this announcement to the top</span>
                  </label>
                </div>

                {/* Error */}
                {formError && (
                  <div className="ann-form-error">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="8" x2="12" y2="12" />
                      <line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                    {formError}
                  </div>
                )}
              </div>

              <div className="ann-post-modal__footer">
                <button className="ann-post-modal__cancel" onClick={closePostModal}>Cancel</button>
                <button className="ann-post-modal__submit" onClick={handleSubmit}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="15" height="15">
                    {editingAnn
                      ? <><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></>
                      : <><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></>
                    }
                  </svg>
                  {editingAnn ? 'Save Changes' : 'Post Announcement'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Delete Confirm Modal ──────────────── */}
        {deleteTarget && (
          <div className="ann-modal-overlay" onClick={() => setDeleteTarget(null)}>
            <div className="ann-confirm-modal" onClick={(e) => e.stopPropagation()}>
              <div className="ann-confirm-modal__icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
                  <path d="M10 11v6M14 11v6" />
                  <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" />
                </svg>
              </div>
              <h3 className="ann-confirm-modal__title">Delete Announcement?</h3>
              <p className="ann-confirm-modal__desc">
                "<strong>{deleteTarget.title}</strong>" will be permanently removed. This cannot be undone.
              </p>
              <div className="ann-confirm-modal__actions">
                <button className="ann-post-modal__cancel" onClick={() => setDeleteTarget(null)}>Cancel</button>
                <button className="ann-confirm-modal__delete" onClick={() => handleDelete(deleteTarget._id)}>Yes, Delete</button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
