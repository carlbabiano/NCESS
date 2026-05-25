import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import AdminSidebar from '../../components/adminsidebar';
import AdminTopbar from '../../components/admintopbar';
import { AdminFilterBar } from '../../components/adminfilterbar';
import './adminroles.css';

const API_URL = import.meta.env.VITE_BACKEND_URL;

function getToken() {
  return (
    localStorage.getItem('admin_token') ||
    sessionStorage.getItem('admin_token') || ''
  );
}

function decodeToken(token) {
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(base64));
  } catch { return null; }
}

const ROLES = [
  { value: 'barangaycaptain', label: 'Barangay Captain' },
  { value: 'secretary',       label: 'Secretary'         },
  { value: 'admin',           label: 'Admin'             },
];

const ROLE_LABELS = {
  barangaycaptain: 'Barangay Captain',
  secretary:       'Secretary',
  admin:           'Admin',
};

const ROLE_AVATARS = {
  barangaycaptain: { bg: '#fef9c3', color: '#854d0e' },
  secretary:       { bg: '#dbeafe', color: '#1e40af' },
  admin:           { bg: '#e5e7eb', color: '#374151' },
};

const ACCOUNT_STATUS_LABELS = {
  active:   'Active',
  inactive: 'Inactive',
  archived: 'Archived',
};

const SUPER_ADMIN_ROLES = ['barangaycaptain', 'secretary'];

// ── Avatar helpers ────────────────────────────────────────────────────────────
function DefaultAvatar({ admin, size = 46, className = '' }) {
  const firstName = admin?.firstName || '';
  const lastName  = admin?.lastName  || '';
  const initials  = (firstName.charAt(0) + lastName.charAt(0)).toUpperCase() || '?';
  const fontSize  = Math.round(size * 0.35);
  return (
    <div className={className} style={{
      width: size, height: size, borderRadius: '50%', background: '#d1d5db',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize, fontWeight: 600, color: '#374151',
      fontFamily: "'DM Sans', sans-serif", flexShrink: 0, userSelect: 'none',
    }}>
      {initials}
    </div>
  );
}

function AdminAvatar({ admin, size = 46, className = '', style = {} }) {
  const [imgError, setImgError] = useState(false);
  const src = admin?.profilePhoto || admin?.photo || admin?.avatar || null;
  if (src && !imgError) {
    return (
      <img src={src} alt={[admin.firstName, admin.lastName].filter(Boolean).join(' ') || 'Admin'}
        width={size} height={size} onError={() => setImgError(true)}
        style={{ borderRadius: '50%', objectFit: 'cover', display: 'block', flexShrink: 0, ...style }}
        className={className}
      />
    );
  }
  return <DefaultAvatar admin={admin} size={size} className={className} />;
}

// ── Shared sub-components ─────────────────────────────────────────────────────
function EyeIcon({ open }) {
  return open ? (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/>
      <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/>
      <line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  );
}

function ModalError({ msg }) {
  if (!msg) return null;
  return (
    <div className="aroles-modal__error">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/>
        <circle cx="12" cy="16" r=".5" fill="currentColor"/>
      </svg>
      {msg}
    </div>
  );
}

function CloseBtn({ onClick }) {
  return (
    <button className="aroles-modal__close" onClick={onClick}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
      </svg>
    </button>
  );
}

// ── Account Status Badge ──────────────────────────────────────────────────────
function StatusBadge({ status }) {
  if (!status || status === 'active') return null;
  return (
    <span className={`aroles-status-badge aroles-status--${status}`}>
      {status === 'inactive' ? 'Inactive' : 'Archived'}
    </span>
  );
}

// ── Create / Edit Modal ───────────────────────────────────────────────────────
function AdminFormModal({ mode, admin, currentAdminId, onClose, onSaved }) {
  const isEdit = mode === 'edit';
  const [form, setForm] = useState({
    firstName:  admin?.firstName  || '',
    middleName: admin?.middleName || '',
    lastName:   admin?.lastName   || '',
    suffix:     admin?.suffix     || '',
    email:      admin?.email      || '',
    role:       admin?.role       || 'secretary',
    mobileNo:   admin?.mobileNo   || '',
    password:   '',
    reason:     '',
  });
  const [showPw, setShowPw]   = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));
  const isSelf = isEdit && admin?._id === currentAdminId;

  // Detect whether role changed (for showing reason field in edit mode)
  const roleChanged = isEdit && form.role !== (admin?.role || '');

  const handleSubmit = async () => {
    setError('');
    if (!form.email.trim()) { setError('Email is required.'); return; }
    if (!isEdit && !form.password) { setError('Password is required.'); return; }
    if (!isEdit && form.password.length < 6) { setError('Password must be at least 6 characters.'); return; }
    if (roleChanged && !form.reason.trim()) { setError('Please provide a reason for the role change.'); return; }

    setLoading(true);
    try {
      const token = getToken();
      let body;
      
      if (isEdit) {
        // For edit mode, only include role if it actually changed
        body = { firstName: form.firstName, middleName: form.middleName, lastName: form.lastName, suffix: form.suffix, mobileNo: form.mobileNo };
        if (roleChanged) {
          body.role = form.role;
          body.reason = form.reason;
        }
      } else {
        // For create mode, always include all fields
        body = {
          email:      form.email.trim(),
          password:   form.password,
          role:       form.role,
          firstName:  form.firstName,
          middleName: form.middleName,
          lastName:   form.lastName,
          suffix:     form.suffix,
          mobileNo:   form.mobileNo,
        };
      }

      const res = await fetch(
        isEdit ? `${API_URL}/admins/${admin._id}` : `${API_URL}/admins`,
        {
          method:  isEdit ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body:    JSON.stringify(body),
        }
      );
      const data = await res.json();
      if (!res.ok) { setError(data.message || 'Something went wrong.'); return; }
      onSaved(data.admin, isEdit ? 'edit' : 'create');
      onClose();
    } catch {
      setError('Unable to connect to the server.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="aroles-overlay" onClick={onClose}>
      <div className="aroles-modal" onClick={e => e.stopPropagation()}>
        <div className="aroles-modal__header">
          <h2>{isEdit ? 'Edit Admin Account' : 'Create Admin Account'}</h2>
          <CloseBtn onClick={onClose} />
        </div>

        <div className="aroles-modal__body">
          <ModalError msg={error} />

          <div className="aroles-field__row">
            <div className="aroles-field">
              <label>First Name</label>
              <input placeholder="Juan" value={form.firstName} onChange={set('firstName')} />
            </div>
            <div className="aroles-field">
              <label>Middle Name <span style={{ color: '#9ca3af', fontWeight: 400 }}>(optional)</span></label>
              <input placeholder="Santos" value={form.middleName} onChange={set('middleName')} />
            </div>
          </div>

          <div className="aroles-field__row">
            <div className="aroles-field">
              <label>Last Name</label>
              <input placeholder="Dela Cruz" value={form.lastName} onChange={set('lastName')} />
            </div>
            <div className="aroles-field">
              <label>Suffix <span style={{ color: '#9ca3af', fontWeight: 400 }}>(optional)</span></label>
              <select value={form.suffix} onChange={set('suffix')}>
                <option value="">None</option>
                <option value="Jr.">Jr.</option>
                <option value="Sr.">Sr.</option>
                <option value="II">II</option>
                <option value="III">III</option>
                <option value="IV">IV</option>
                <option value="V">V</option>
              </select>
            </div>
          </div>

          <div className="aroles-field">
            <label>Email Address</label>
            <input
              type="email" placeholder="admin@newcabalan.gov.ph"
              value={form.email} onChange={set('email')}
              disabled={isEdit}
              style={isEdit ? { background: '#f9fafb', color: '#9ca3af' } : {}}
            />
          </div>

          <div className="aroles-field">
            <label>Mobile Number <span style={{ color: '#9ca3af', fontWeight: 400 }}>(optional)</span></label>
            <input
              type="tel" placeholder="09XX XXX XXXX"
              value={form.mobileNo} onChange={set('mobileNo')}
            />
          </div>

          <div className="aroles-field">
            <label>Role</label>
            <select value={form.role} onChange={set('role')} disabled={isSelf}>
              {ROLES.map(r => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
            {isSelf && (
              <span style={{ fontSize: '12px', color: '#9ca3af', marginTop: '2px' }}>
                You cannot change your own role.
              </span>
            )}
          </div>

          {/* Reason field — required when changing a role in edit mode */}
          {isEdit && (
            <div className="aroles-field">
              <label>
                Reason for Change
                {roleChanged && <span style={{ color: '#ef4444', marginLeft: 2 }}>*</span>}
              </label>
              <input
                placeholder={roleChanged ? 'Required — explain why this role is being changed' : 'Optional note for audit log'}
                value={form.reason}
                onChange={set('reason')}
              />
              <span className="aroles-field__hint">
                Logged in the audit trail for accountability.
              </span>
            </div>
          )}

          {!isEdit && (
            <div className="aroles-field">
              <label>Password</label>
              <div className="aroles-pw-wrap">
                <input
                  type={showPw ? 'text' : 'password'}
                  placeholder="Min. 6 characters"
                  value={form.password} onChange={set('password')}
                />
                <button type="button" className="aroles-pw-toggle" onClick={() => setShowPw(s => !s)}>
                  <EyeIcon open={showPw} />
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="aroles-modal__footer">
          <button className="aroles-modal__cancel" onClick={onClose}>Cancel</button>
          <button className="aroles-modal__save" onClick={handleSubmit} disabled={loading}>
            {loading ? <><span className="aroles-spinner" /> Saving...</> : (isEdit ? 'Save Changes' : 'Create Account')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Reset Password Modal ──────────────────────────────────────────────────────
function ResetPasswordModal({ admin, onClose, onDone }) {
  const [password, setPassword] = useState('');
  const [reason, setReason]     = useState('');
  const [showPw, setShowPw]     = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');

  const displayName = [admin.firstName, admin.lastName].filter(Boolean).join(' ') || admin.email;

  const handleSubmit = async () => {
    setError('');
    if (!password || password.length < 6) { setError('Password must be at least 6 characters.'); return; }
    setLoading(true);
    try {
      const token = getToken();
      const res   = await fetch(`${API_URL}/admins/${admin._id}/password`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ password, reason }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.message || 'Something went wrong.'); return; }
      onDone();
      onClose();
    } catch {
      setError('Unable to connect to the server.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="aroles-overlay" onClick={onClose}>
      <div className="aroles-modal" onClick={e => e.stopPropagation()}>
        <div className="aroles-modal__header">
          <h2>Reset Password</h2>
          <CloseBtn onClick={onClose} />
        </div>
        <p className="aroles-pwreset__info">Set a new password for <strong>{displayName}</strong>.</p>
        <div className="aroles-modal__body">
          <ModalError msg={error} />
          <div className="aroles-field">
            <label>New Password</label>
            <div className="aroles-pw-wrap">
              <input
                type={showPw ? 'text' : 'password'}
                placeholder="Min. 6 characters"
                value={password} onChange={e => setPassword(e.target.value)}
              />
              <button type="button" className="aroles-pw-toggle" onClick={() => setShowPw(s => !s)}>
                <EyeIcon open={showPw} />
              </button>
            </div>
          </div>
          <div className="aroles-field">
            <label>Reason <span style={{ color: '#9ca3af', fontWeight: 400 }}>(optional)</span></label>
            <input
              placeholder="e.g. Admin forgot their password"
              value={reason} onChange={e => setReason(e.target.value)}
            />
            <span className="aroles-field__hint">Logged in the audit trail.</span>
          </div>
        </div>
        <div className="aroles-modal__footer">
          <button className="aroles-modal__cancel" onClick={onClose}>Cancel</button>
          <button className="aroles-modal__save" onClick={handleSubmit} disabled={loading}>
            {loading ? <><span className="aroles-spinner" /> Saving...</> : 'Reset Password'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Deactivate Modal ──────────────────────────────────────────────────────────
function DeactivateModal({ admin, onClose, onUpdated }) {
  const [reason, setReason]   = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const displayName = [admin.firstName, admin.lastName].filter(Boolean).join(' ') || admin.email;

  const handleConfirm = async () => {
    setError('');
    if (!reason.trim()) { setError('Please provide a reason for deactivation.'); return; }
    setLoading(true);
    try {
      const token = getToken();
      const res   = await fetch(`${API_URL}/admins/${admin._id}/status`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ accountStatus: 'inactive', reason }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.message || 'Something went wrong.'); return; }
      onUpdated(data.admin);
      onClose();
    } catch {
      setError('Unable to connect to the server.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="aroles-overlay" onClick={onClose}>
      <div className="aroles-modal" onClick={e => e.stopPropagation()}>
        <div className="aroles-modal__header">
          <h2>Deactivate Account</h2>
          <CloseBtn onClick={onClose} />
        </div>
        <div className="aroles-confirm__body">
          <div className="aroles-confirm__icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/><line x1="10" y1="15" x2="10" y2="9"/>
              <line x1="14" y1="15" x2="14" y2="9"/>
            </svg>
          </div>
          <p><strong>{displayName}</strong> will no longer be able to log in. Their account will be moved to the Deactivated area and can be reactivated at any time.</p>
        </div>
        <div className="aroles-modal__body" style={{ paddingTop: 0 }}>
          <ModalError msg={error} />
          <div className="aroles-field">
            <label>Reason <span style={{ color: '#ef4444', marginLeft: 2 }}>*</span></label>
            <input
              placeholder="e.g. Term ended, resigned, etc."
              value={reason} onChange={e => setReason(e.target.value)}
            />
            <span className="aroles-field__hint">Logged in the audit trail for accountability.</span>
          </div>
        </div>
        <div className="aroles-modal__footer">
          <button className="aroles-modal__cancel" onClick={onClose}>Cancel</button>
          <button
            className="aroles-modal__save aroles-modal__save--warning"
            onClick={handleConfirm}
            disabled={loading}
          >
            {loading ? <><span className="aroles-spinner" /> Processing...</> : 'Deactivate Account'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Delete Admin Modal ────────────────────────────────────────────────────────
function DeleteAdminModal({ admin, onClose, onDeleted }) {
  const [confirmText, setConfirmText] = useState('');
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState('');
  const displayName = [admin.firstName, admin.lastName].filter(Boolean).join(' ') || admin.email;
  const requiredText = displayName;

  const handleConfirm = async () => {
    setError('');
    if (confirmText !== requiredText) { setError(`Please type "${requiredText}" exactly to confirm.`); return; }
    setLoading(true);
    try {
      const token = getToken();
      const res   = await fetch(`${API_URL}/admins/${admin._id}`, {
        method:  'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.message || 'Something went wrong.'); return; }
      onDeleted(admin._id);
      onClose();
    } catch {
      setError('Unable to connect to the server.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="aroles-overlay" onClick={onClose}>
      <div className="aroles-modal" onClick={e => e.stopPropagation()}>
        <div className="aroles-modal__header">
          <h2>Delete Account Permanently</h2>
          <CloseBtn onClick={onClose} />
        </div>
        <div className="aroles-confirm__body">
          <div className="aroles-confirm__icon" style={{ color: '#ef4444' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
            </svg>
          </div>
          <p><strong>{displayName}</strong>'s account and all associated data will be permanently deleted. <strong style={{ color: '#ef4444' }}>This action cannot be undone.</strong></p>
        </div>
        <div className="aroles-modal__body" style={{ paddingTop: 0 }}>
          <ModalError msg={error} />
          <div className="aroles-field">
            <label>
              To confirm, type <code style={{ background: '#f3f4f6', padding: '2px 6px', borderRadius: '4px', fontFamily: 'monospace' }}>"{requiredText}"</code> below
              <span style={{ color: '#ef4444', marginLeft: 2 }}>*</span>
            </label>
            <input
              type="text"
              placeholder={requiredText}
              value={confirmText} onChange={e => setConfirmText(e.target.value)}
            />
            <span className="aroles-field__hint">Type the name above to confirm this permanent deletion.</span>
          </div>
        </div>
        <div className="aroles-modal__footer">
          <button className="aroles-modal__cancel" onClick={onClose}>Cancel</button>
          <button
            className="aroles-modal__save"
            style={{ background: '#ef4444' }}
            onClick={handleConfirm}
            disabled={loading || confirmText !== requiredText}
          >
            {loading ? <><span className="aroles-spinner" /> Deleting...</> : 'Delete Permanently'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Reactivate Modal (requires current admin's own password) ──────────────────
function ReactivateModal({ admin, onClose, onUpdated }) {
  const [password, setPassword] = useState('');
  const [showPw, setShowPw]     = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const displayName = [admin.firstName, admin.lastName].filter(Boolean).join(' ') || admin.email;

  const handleConfirm = async () => {
    setError('');
    if (!password) { setError('Please enter your password to confirm.'); return; }
    setLoading(true);
    try {
      const token = getToken();
      // First verify the current admin's own password, then reactivate
      const res = await fetch(`${API_URL}/admins/${admin._id}/status`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ accountStatus: 'active', confirmPassword: password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.message || 'Something went wrong.'); return; }
      onUpdated(data.admin);
      onClose();
    } catch {
      setError('Unable to connect to the server.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="aroles-overlay" onClick={onClose}>
      <div className="aroles-modal" onClick={e => e.stopPropagation()}>
        <div className="aroles-modal__header">
          <h2>Reactivate Account</h2>
          <CloseBtn onClick={onClose} />
        </div>
        <div className="aroles-confirm__body">
          <div className="aroles-confirm__icon aroles-confirm__icon--green">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="23 4 23 10 17 10"/>
              <path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/>
            </svg>
          </div>
          <p><strong>{displayName}</strong> will be able to log in again with their existing credentials and role.</p>
        </div>
        <div className="aroles-modal__body" style={{ paddingTop: 0 }}>
          <ModalError msg={error} />
          <div className="aroles-field">
            <label>Your Password <span style={{ color: '#ef4444', marginLeft: 2 }}>*</span></label>
            <div className="aroles-pw-wrap">
              <input
                type={showPw ? 'text' : 'password'}
                placeholder="Enter your own password to confirm"
                value={password} onChange={e => setPassword(e.target.value)}
              />
              <button type="button" className="aroles-pw-toggle" onClick={() => setShowPw(s => !s)}>
                <EyeIcon open={showPw} />
              </button>
            </div>
            <span className="aroles-field__hint">Confirm it's you before reactivating this account.</span>
          </div>
        </div>
        <div className="aroles-modal__footer">
          <button className="aroles-modal__cancel" onClick={onClose}>Cancel</button>
          <button
            className="aroles-modal__save"
            onClick={handleConfirm}
            disabled={loading}
          >
            {loading ? <><span className="aroles-spinner" /> Reactivating...</> : 'Reactivate Account'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Profile Detail Modal ──────────────────────────────────────────────────────
function ProfileDetailModal({ admin, currentId, onClose, onEdit, onResetPw, onDeactivate, onReactivate }) {
  const displayName = [admin.firstName, admin.lastName].filter(Boolean).join(' ') || '—';
  const isSelf      = admin._id === currentId;
  const status      = admin.accountStatus || 'active';

  return (
    <div className="aroles-overlay" onClick={onClose}>
      <div className="aroles-modal aroles-profile-modal" onClick={e => e.stopPropagation()}>
        <div className="aroles-modal__header">
          <h2>Admin Profile</h2>
          <CloseBtn onClick={onClose} />
        </div>

        <div className="aroles-profile__hero">
          <div className="aroles-profile__photo-wrap">
            <AdminAvatar admin={admin} size={88} />
          </div>
          <div className="aroles-profile__hero-info">
            <h3 className="aroles-profile__name">
              {displayName}
              {isSelf && <span className="aroles-card__self"> (You)</span>}
            </h3>
            <p className="aroles-profile__email">{admin.email}</p>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
              <span className={`aroles-role-badge arole--${admin.role}`}>
                {ROLE_LABELS[admin.role] || admin.role}
              </span>
              {status !== 'active' && <StatusBadge status={status} />}
            </div>
          </div>
        </div>

        <div className="aroles-profile__details">
          {[
            ['First Name',    admin.firstName || '—'],
            ['Last Name',     admin.lastName  || '—'],
            ['Email Address', admin.email],
            ['Mobile Number', admin.mobileNo  || '—'],
            ['Role',          ROLE_LABELS[admin.role] || admin.role],
            ['Account Status', ACCOUNT_STATUS_LABELS[status] || status],
            ['Account ID',    admin._id, true],
          ].map(([label, value, mono]) => (
            <div className="aroles-profile__detail-row" key={label}>
              <span className="aroles-profile__detail-label">{label}</span>
              <span className={`aroles-profile__detail-value${mono ? ' aroles-profile__detail-mono' : ''}`}>{value}</span>
            </div>
          ))}
        </div>

        <div className="aroles-profile__actions">
          <button className="aroles-profile__action-btn" onClick={() => { onClose(); onResetPw(admin); }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="15" height="15">
              <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/>
            </svg>
            Reset Password
          </button>
          <button className="aroles-profile__action-btn" onClick={() => { onClose(); onEdit(admin); }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="15" height="15">
              <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
            Edit
          </button>
          {!isSelf && status === 'active' && (
            <button className="aroles-profile__action-btn aroles-profile__action-btn--warning" onClick={() => { onClose(); onDeactivate(admin); }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="15" height="15">
                <circle cx="12" cy="12" r="10"/><line x1="10" y1="15" x2="10" y2="9"/><line x1="14" y1="15" x2="14" y2="9"/>
              </svg>
              Deactivate
            </button>
          )}
          {!isSelf && status !== 'active' && (
            <button className="aroles-profile__action-btn" onClick={() => { onClose(); onReactivate(admin); }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="15" height="15">
                <polyline points="23 4 23 10 17 10"/>
                <path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/>
              </svg>
              Reactivate
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Edit Drawer Panel ─────────────────────────────────────────────────────────
function EditDrawerPanel({ admin, currentId, onClose, onSaved }) {
  const [form, setForm] = useState({
    firstName:  admin?.firstName  || '',
    middleName: admin?.middleName || '',
    lastName:   admin?.lastName   || '',
    suffix:     admin?.suffix     || '',
    email:      admin?.email      || '',
    role:       admin?.role       || 'secretary',
    mobileNo:   admin?.mobileNo   || '',
    reason:     '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const displayName = [admin.firstName, admin.lastName].filter(Boolean).join(' ') || admin.email;
  const isSelf = admin._id === currentId;
  const roleChanged = form.role !== (admin?.role || '');

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSave = async () => {
    setError('');
    if (!form.email.trim()) { setError('Email is required.'); return; }
    if (roleChanged && !form.reason.trim()) { setError('Please provide a reason for the role change.'); return; }

    setLoading(true);
    try {
      const token = getToken();
      const res = await fetch(`${API_URL}/admins/${admin._id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ role: form.role, firstName: form.firstName, middleName: form.middleName, lastName: form.lastName, suffix: form.suffix, mobileNo: form.mobileNo, reason: form.reason }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.message || 'Something went wrong.'); return; }
      onSaved(data.admin);
      onClose();
    } catch {
      setError('Unable to connect to the server.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="aroles-drawer-overlay" onClick={onClose} />
      <div className="aroles-drawer-panel">
        <div className="aroles-drawer__header">
          <h2>Edit Admin Account</h2>
          <button className="aroles-drawer__close" onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <div className="aroles-drawer__body">
          <div className="aroles-drawer__info-section">
            <div className="aroles-drawer__avatar">
              <AdminAvatar admin={admin} size={64} />
            </div>
            <h3>{displayName}</h3>
            <p>{admin.email}</p>
          </div>

          {error && <ModalError msg={error} />}

          <div className="aroles-drawer__field-group">
            <div className="aroles-field">
              <label>First Name</label>
              <input placeholder="Juan" value={form.firstName} onChange={set('firstName')} />
            </div>
            <div className="aroles-field">
              <label>Middle Name <span style={{ color: '#9ca3af', fontWeight: 400 }}>(optional)</span></label>
              <input placeholder="Santos" value={form.middleName} onChange={set('middleName')} />
            </div>
          </div>

          <div className="aroles-drawer__field-group">
            <div className="aroles-field">
              <label>Last Name</label>
              <input placeholder="dela Cruz" value={form.lastName} onChange={set('lastName')} />
            </div>
            <div className="aroles-field">
              <label>Suffix <span style={{ color: '#9ca3af', fontWeight: 400 }}>(optional)</span></label>
              <select value={form.suffix} onChange={set('suffix')}>
                <option value="">None</option>
                <option value="Jr.">Jr.</option>
                <option value="Sr.">Sr.</option>
                <option value="II">II</option>
                <option value="III">III</option>
                <option value="IV">IV</option>
                <option value="V">V</option>
              </select>
            </div>
          </div>

          <div className="aroles-field">
            <label>Email Address</label>
            <input
              type="email" placeholder="admin@newcabalan.gov.ph"
              value={form.email} onChange={set('email')}
              disabled
              style={{ background: '#f9fafb', color: '#9ca3af' }}
            />
          </div>

          <div className="aroles-field">
            <label>Mobile Number <span style={{ color: '#9ca3af', fontWeight: 400 }}>(optional)</span></label>
            <input
              type="tel" placeholder="09XX XXX XXXX"
              value={form.mobileNo} onChange={set('mobileNo')}
            />
          </div>

          <div className="aroles-field">
            <label>Role</label>
            <select value={form.role} onChange={set('role')} disabled={isSelf}>
              {ROLES.map(r => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
            {isSelf && (
              <span style={{ fontSize: '12px', color: '#9ca3af', marginTop: '2px' }}>
                You cannot change your own role.
              </span>
            )}
          </div>

          {roleChanged && (
            <div className="aroles-field">
              <label>
                Reason for Role Change
                <span style={{ color: '#ef4444', marginLeft: 2 }}>*</span>
              </label>
              <input
                placeholder="Explain why this role is being changed"
                value={form.reason}
                onChange={set('reason')}
              />
              <span className="aroles-field__hint">
                This will be logged in the audit trail for accountability.
              </span>
            </div>
          )}
        </div>

        <div className="aroles-drawer__footer">
          <button className="aroles-drawer__cancel" onClick={onClose}>Cancel</button>
          <button className="aroles-drawer__save" onClick={handleSave} disabled={loading}>
            {loading ? <><span className="aroles-spinner" /> Saving...</> : 'Save Changes'}
          </button>
        </div>
      </div>
    </>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function AdminRoles() {
  const navigate    = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [search, setSearch]           = useState('');
  const [filterRole, setFilterRole]   = useState('All');
  const [filterStatus, setFilterStatus] = useState('active'); // 'all' | 'active' | 'inactive' | 'archived'
  const [admins, setAdmins]           = useState([]);
  const [loading, setLoading]         = useState(true);

  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState('');

  const token       = getToken();
  const decoded     = decodeToken(token);
  const currentId   = decoded?.id || '';
  const currentRole = decoded?.adminRole || '';

  // Guard — redirect if not captain or secretary
  useEffect(() => {
    if (!SUPER_ADMIN_ROLES.includes(currentRole)) {
      navigate('/admindashboard');
    }
  }, [currentRole, navigate]);

  useEffect(() => {
    const fetchAdmins = async () => {
      try {
        const res  = await fetch(`${API_URL}/admins`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (res.ok) setAdmins(data);
      } catch { /* silent */ }
      finally { setLoading(false); }
    };
    fetchAdmins();
  }, [token]);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  const handleSaved = (savedAdmin, mode) => {
    if (mode === 'create') {
      setAdmins(prev => [savedAdmin, ...prev]);
      showToast('Admin account created successfully.');
    } else {
      setAdmins(prev => prev.map(a => a._id === savedAdmin._id ? savedAdmin : a));
      showToast('Admin account updated.');
    }
  };

  const handleStatusUpdated = (updatedAdmin) => {
    setAdmins(prev => prev.map(a => a._id === updatedAdmin._id ? updatedAdmin : a));
    const statusLabel = ACCOUNT_STATUS_LABELS[updatedAdmin.accountStatus] || updatedAdmin.accountStatus;
    showToast(`Account ${statusLabel.toLowerCase()}.`);
  };

  const STATUS_TABS = [
    { value: 'active',   label: 'Active'      },
    { value: 'inactive', label: 'Deactivated' },
  ];

  const displayed = admins.filter(a => {
    const name        = `${a.firstName} ${a.lastName} ${a.email}`.toLowerCase();
    const matchSearch = name.includes(search.toLowerCase());
    const acctStatus  = a.accountStatus || 'active';
    // Match role — 'All' shows all roles
    const matchRole   = filterRole === 'All' || a.role === filterRole;
    // Match status — filter by selected tab
    const matchStatus = acctStatus === filterStatus;
    return matchSearch && matchRole && matchStatus;
  });

  // Count badges for status tabs
  const countByStatus = (s) => admins.filter(a => (a.accountStatus || 'active') === s).length;

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <AdminSidebar sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />

      <div style={{ flex: 1, height: '100vh', overflowY: 'auto' }}>
        <div className="aroles-page">

          <AdminTopbar
            placeholder="Search admin accounts..."
            search={search}
            onSearch={setSearch}
            sidebarOpen={sidebarOpen}
            setSidebarOpen={setSidebarOpen}
          />

          <div className="aroles-header">
            <div className="aroles-header__row">
              <div>
                <h1>Admin &amp; Roles</h1>
                <p>Manage admin accounts, roles, and permissions.</p>
              </div>
            </div>
          </div>

          <div className="aroles-body">

            <AdminFilterBar
              groups={[
                {
                  label: 'Status',
                  value: filterStatus,
                  onChange: setFilterStatus,
                  options: STATUS_TABS.map(t => ({
                    ...t,
                    count: t.value !== 'all' ? countByStatus(t.value) : undefined,
                  })),
                },
                {
                  label: 'Role',
                  value: filterRole,
                  onChange: setFilterRole,
                  options: [
                    { value: 'All', label: 'All' },
                    ...ROLES.map(r => ({ value: r.value, label: r.label })),
                  ],
                },
              ]}
              count={`Showing ${displayed.length} admins`}
              actions={(
              <button className="aroles-add-btn" onClick={() => setModal({ type: 'create' })}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
                Add Roles
              </button>
              )}
            />

            {/* Rows organized by role */}
            {loading ? (
              <div className="aroles-empty">Loading admin accounts...</div>
            ) : displayed.length === 0 ? (
              <div className="aroles-empty">No admin accounts found.</div>
            ) : (
              <div className="aroles-rows-container">
                {ROLES.map(roleObj => {
                  const adminsInRole = displayed.filter(a => a.role === roleObj.value);
                  if (adminsInRole.length === 0) return null;

                  return (
                    <div className="aroles-role-section" key={roleObj.value}>
                      <h3 className="aroles-role-section__title">
                        {roleObj.label}
                      </h3>
                      <div className="aroles-rows-list">
                        {adminsInRole.map(a => {
                          const displayName = [a.firstName, a.lastName].filter(Boolean).join(' ') || '—';
                          const isSelf      = a._id === currentId;
                          const acctStatus  = a.accountStatus || 'active';
                          const isInactive  = acctStatus !== 'active';

                          return (
                            <div className={`aroles-row${isInactive ? ' aroles-row--inactive' : ''}`} key={a._id}>
                              <div className="aroles-row__content">
                                <button
                                  className="aroles-row__avatar-btn"
                                  title="View Profile"
                                  onClick={() => setModal({ type: 'profile', admin: a })}
                                >
                                  <AdminAvatar admin={a} size={40} />
                                </button>
                                <div className="aroles-row__info">
                                  <p className="aroles-row__name">
                                    {displayName}
                                    {isSelf && <span className="aroles-row__self"> (You)</span>}
                                  </p>
                                  <p className="aroles-row__email">{a.email}</p>
                                </div>
                                {isInactive && <StatusBadge status={acctStatus} />}
                              </div>

                              <div className="aroles-row__menu">
                                <button
                                  className="aroles-row__menu-trigger"
                                  title="More actions"
                                  onClick={() => {
                                    const menuId = `menu-${a._id}`;
                                    const menu = document.getElementById(menuId);
                                    if (menu) {
                                      menu.classList.toggle('aroles-row__menu-open');
                                    }
                                  }}
                                >
                                  <svg viewBox="0 0 24 24" fill="currentColor">
                                    <circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/>
                                  </svg>
                                </button>
                                <div className="aroles-row__menu-dropdown" id={`menu-${a._id}`}>
                                  <button
                                    className="aroles-row__menu-item"
                                    onClick={() => {
                                      setModal({ type: 'draweredit', admin: a });
                                      document.getElementById(`menu-${a._id}`).classList.remove('aroles-row__menu-open');
                                    }}
                                  >
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                                      <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                                      <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                                    </svg>
                                    Edit
                                  </button>
                                  <button
                                    className="aroles-row__menu-item"
                                    onClick={() => {
                                      setModal({ type: 'resetpw', admin: a });
                                      document.getElementById(`menu-${a._id}`).classList.remove('aroles-row__menu-open');
                                    }}
                                  >
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                                      <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/>
                                    </svg>
                                    Reset Password
                                  </button>
                                  {!isSelf && acctStatus === 'active' && (
                                    <button
                                      className="aroles-row__menu-item aroles-row__menu-item--warning"
                                      onClick={() => {
                                        setModal({ type: 'deactivate', admin: a });
                                        document.getElementById(`menu-${a._id}`).classList.remove('aroles-row__menu-open');
                                      }}
                                    >
                                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                                        <circle cx="12" cy="12" r="10"/><line x1="10" y1="15" x2="10" y2="9"/><line x1="14" y1="15" x2="14" y2="9"/>
                                      </svg>
                                      Deactivate
                                    </button>
                                  )}
                                  {!isSelf && acctStatus !== 'active' && (
                                    <>
                                      <button
                                        className="aroles-row__menu-item"
                                        onClick={() => {
                                          setModal({ type: 'reactivate', admin: a });
                                          document.getElementById(`menu-${a._id}`).classList.remove('aroles-row__menu-open');
                                        }}
                                      >
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                                          <polyline points="23 4 23 10 17 10"/>
                                          <path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/>
                                        </svg>
                                        Reactivate
                                      </button>
                                      <button
                                        className="aroles-row__menu-item aroles-row__menu-item--danger"
                                        onClick={() => {
                                          setModal({ type: 'delete', admin: a });
                                          document.getElementById(`menu-${a._id}`).classList.remove('aroles-row__menu-open');
                                        }}
                                      >
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                                          <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/>
                                        </svg>
                                        Delete Permanently
                                      </button>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Modals ── */}
      {modal?.type === 'profile' && (
        <ProfileDetailModal
          admin={modal.admin}
          currentId={currentId}
          onClose={() => setModal(null)}
          onEdit={(a)        => setModal({ type: 'edit', admin: a })}
          onResetPw={(a)     => setModal({ type: 'resetpw', admin: a })}
          onDeactivate={(a)  => setModal({ type: 'deactivate', admin: a })}
          onReactivate={(a)  => setModal({ type: 'reactivate', admin: a })}
        />
      )}
      {modal?.type === 'draweredit' && (
        <EditDrawerPanel
          admin={modal.admin}
          currentId={currentId}
          onClose={() => setModal(null)}
          onSaved={handleSaved}
        />
      )}
      {modal?.type === 'create' && (
        <AdminFormModal mode="create" currentAdminId={currentId} onClose={() => setModal(null)} onSaved={handleSaved} />
      )}
      {modal?.type === 'edit' && (
        <AdminFormModal mode="edit" admin={modal.admin} currentAdminId={currentId} onClose={() => setModal(null)} onSaved={handleSaved} />
      )}
      {modal?.type === 'resetpw' && (
        <ResetPasswordModal admin={modal.admin} onClose={() => setModal(null)} onDone={() => showToast('Password reset successfully.')} />
      )}
      {modal?.type === 'deactivate' && (
        <DeactivateModal
          admin={modal.admin}
          onClose={() => setModal(null)}
          onUpdated={handleStatusUpdated}
        />
      )}
      {modal?.type === 'reactivate' && (
        <ReactivateModal
          admin={modal.admin}
          onClose={() => setModal(null)}
          onUpdated={handleStatusUpdated}
        />
      )}
      {modal?.type === 'delete' && (
        <DeleteAdminModal
          admin={modal.admin}
          onClose={() => setModal(null)}
          onDeleted={(adminId) => { setAdmins(prev => prev.filter(a => a._id !== adminId)); showToast('Admin account deleted permanently.'); }}
        />
      )}

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: '24px', left: '50%', transform: 'translateX(-50%)',
          background: '#111827', color: '#fff', padding: '10px 20px', borderRadius: '10px',
          fontSize: '13.5px', fontWeight: '500', zIndex: 200, boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
          animation: 'arFadeIn 0.2s ease',
        }}>
          {toast}
        </div>
      )}
    </div>
  );
}