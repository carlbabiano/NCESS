import { useCallback, useEffect, useMemo, useState } from 'react';
import { io } from 'socket.io-client';
import Sidebar from '../../components/adminsidebar';
import AdminTopbar from '../../components/admintopbar';
import './adminprofilerequest.css';

const API_URL = import.meta.env.VITE_BACKEND_URL;

const CHANGE_LABELS = {
  firstName: 'First Name',
  middleName: 'Middle Name',
  lastName: 'Last Name',
  suffix: 'Suffix',
  birthdate: 'Date of Birth',
  sex: 'Sex',
  civilStatus: 'Civil Status',
  nationality: 'Nationality',
  contactNumber: 'Mobile Number',
  email: 'Email Address',
  homeAddress: 'Home Address',
  purok: 'Purok',
  residencyStatus: 'Residency Type',
  residentType: 'Resident Type',
  addressBarangay: 'Present Barangay',
  addressCity: 'Present City / Municipality',
  addressProvince: 'Present Province',
  addressRegion: 'Present Region',
  permanentAddress: 'Permanent Address',
  permanentStreet: 'Permanent House No./Street',
  permanentBarangay: 'Permanent Barangay',
  permanentCity: 'Permanent City / Municipality',
  permanentProvince: 'Permanent Province',
  permanentRegion: 'Permanent Region',
  lengthOfStay: 'Length of Stay',
  voterStatus: 'Voter Status',
  householdId: 'Household / Family ID',
  emergencyContactName: 'Emergency Contact Name',
  emergencyContactNumber: 'Emergency Contact Number',
  occupation: 'Occupation',
  educationalAttainment: 'Educational Attainment',
};

function getAdminToken() {
  return (
    localStorage.getItem('admin_token') ||
    sessionStorage.getItem('admin_token') ||
    localStorage.getItem('adminToken') ||
    sessionStorage.getItem('adminToken') ||
    ''
  );
}

function decodeAdminToken(token) {
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(base64));
  } catch { return null; }
}

const ADMIN_EDIT_ROLES = ['barangaycaptain', 'secretary'];

function formatDate(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
}

function valueText(value) {
  return value === undefined || value === null || value === '' ? '-' : String(value);
}

function proofDocumentLabel(request) {
  const name = String(request?.proofDocumentName || '').trim();
  if (!name || name.includes('/') || name.startsWith('ebrgy_')) return 'Submitted valid ID / proof document';
  return name;
}

function isImageProofDocument(request) {
  const source = `${request?.proofDocumentName || ''} ${request?.proofDocumentUrl || ''}`.toLowerCase();
  return /\.(png|jpe?g|gif|webp|bmp|svg)(?:$|[?#\s])/.test(source);
}

function loadingKey(requestId, field, status) {
  return `${requestId}:${field}:${status}`;
}

const DENY_REASONS = [
  'Information does not match the uploaded ID.',
  'Invalid or incomplete supporting document.',
  'Please review and correct the submitted information.',
  'Proof of residency could not be verified.',
  'Other...',
];

// ── Sections mirroring the resident's "Request Information Change" form ────
const PROFILE_SECTIONS = [
  {
    label: 'Personal Information',
    fields: [
      { key: 'firstName',   label: 'First Name' },
      { key: 'middleName',  label: 'Middle Name' },
      { key: 'lastName',    label: 'Last Name' },
      { key: 'suffix',      label: 'Suffix' },
      { key: 'birthdate',   label: 'Date of Birth', isDate: true },
      { key: 'sex',         label: 'Sex' },
      { key: 'civilStatus', label: 'Civil Status' },
      { key: 'nationality', label: 'Nationality' },
    ],
  },
  {
    label: 'Home & Residency',
    fields: [
      { key: 'residencyStatus',   label: 'Residency Type', full: true },
      { key: 'homeAddress',       label: 'House No./Street/Building No.', full: true },
      { key: 'purok',             label: 'Purok' },
      { key: 'householdId',       label: 'Household / Family ID' },
      { key: 'lengthOfStay',      label: 'Length of Stay' },
      { key: 'permanentRegion',   label: 'Permanent Region' },
      { key: 'permanentProvince', label: 'Permanent Province' },
      { key: 'permanentCity',     label: 'Permanent City / Municipality' },
      { key: 'permanentBarangay', label: 'Permanent Barangay' },
      { key: 'permanentStreet',   label: 'Permanent House No./Street', full: true },
    ],
  },
  {
    label: 'Contact Information',
    fields: [
      { key: 'contactNumber', label: 'Mobile Number' },
      { key: 'email',         label: 'Email Address' },
    ],
  },
  {
    label: 'Additional Information',
    fields: [
      { key: 'occupation',              label: 'Occupation' },
      { key: 'voterStatus',             label: 'Voter Status' },
      { key: 'educationalAttainment',   label: 'Educational Attainment' },
      { key: 'emergencyContactName',    label: 'Emergency Contact Name' },
      { key: 'emergencyContactNumber',  label: 'Emergency Contact Number' },
    ],
  },
];

function ProfileFormField({ field, currentData, requestedData, mode, selected, selectable, onToggle }) {
  const currentRaw = currentData?.[field.key];
  const requestedRaw = requestedData?.[field.key];
  const isChanged = requestedRaw !== undefined;

  const currentVal = valueText(currentRaw);
  const displayCurrent = field.isDate ? formatDate(currentRaw) : currentVal;
  const displayRequested = field.isDate ? formatDate(requestedRaw) : valueText(requestedRaw);
  const hadPreviousValue = isChanged && currentVal !== '-';

  let boxClass = 'apr-ff__box apr-ff__box--readonly';
  if (isChanged && !selected) boxClass += ' apr-ff__box--flagged';
  if (isChanged && selectable) boxClass += ' apr-ff__box--selectable';
  if (isChanged && selected) {
    boxClass += mode === 'deny' ? ' apr-ff__box--deny-selected' : ' apr-ff__box--approve-selected';
  }

  return (
    <div className={`apr-ff${field.full ? ' apr-ff--full' : ''}`}>
      <span className="apr-ff__label">
        {field.label}
        {isChanged && (
          <span className="apr-ff__changed-tag">
            {selected ? (mode === 'deny' ? 'Marked deny' : 'Marked approve') : 'Requested change'}
          </span>
        )}
      </span>
      <div
        className={boxClass}
        role={isChanged && selectable ? 'button' : undefined}
        tabIndex={isChanged && selectable ? 0 : undefined}
        onClick={isChanged && selectable ? () => onToggle(field.key) : undefined}
        onKeyDown={isChanged && selectable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(field.key); } } : undefined}
      >
        {isChanged ? (
          <span className="apr-ff__box-content">
            {hadPreviousValue && <span className="apr-ff__box-old">{displayCurrent}</span>}
            <span className="apr-ff__box-new">{displayRequested}</span>
          </span>
        ) : displayCurrent}
      </div>
    </div>
  );
}



function RequestModal({ request, onClose, onBulkReview, actionLoading, canEdit }) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const [mode, setMode] = useState(null); // null | 'approve' | 'deny'
  const [selectedKeys, setSelectedKeys] = useState([]);
  const [denyPanelOpen, setDenyPanelOpen] = useState(false);
  const [denyReason, setDenyReason] = useState('');
  const [denyOtherText, setDenyOtherText] = useState('');

  useEffect(() => {
    setPreviewOpen(false);
    setMode(null);
    setSelectedKeys([]);
    setDenyPanelOpen(false);
    setDenyReason('');
    setDenyOtherText('');
  }, [request?._id]);

  if (!request) return null;
  const proofLabel = proofDocumentLabel(request);
  const proofIsImage = isImageProofDocument(request);
  const changedKeys = Object.keys(request.requestedData || {});
  const isBusy = !!actionLoading;
  const hasSelection = selectedKeys.length > 0;

  function closeModal() {
    setPreviewOpen(false);
    onClose();
  }

  function resetWorkflow() {
    setMode(null);
    setSelectedKeys([]);
    setDenyPanelOpen(false);
    setDenyReason('');
    setDenyOtherText('');
  }

  function selectMode(nextMode) {
    if (mode === nextMode) {
      resetWorkflow();
      return;
    }
    setMode(nextMode);
    setSelectedKeys([]);
    setDenyPanelOpen(false);
    setDenyReason('');
    setDenyOtherText('');
  }

  function toggleKey(key) {
    setSelectedKeys(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
  }

  function handleDone() {
    if (!hasSelection) return;
    if (mode === 'approve') {
      onBulkReview(request._id, selectedKeys, 'approved');
      resetWorkflow();
    } else if (mode === 'deny') {
      setDenyPanelOpen(true);
    }
  }

  function cancelDenyPanel() {
    setDenyPanelOpen(false);
    setDenyReason('');
    setDenyOtherText('');
  }

  function confirmDenySelected() {
    if (!hasSelection || !denyReason) return;
    const note = denyReason === 'Other...' ? denyOtherText.trim() : denyReason;
    if (denyReason === 'Other...' && !note) return;
    onBulkReview(request._id, selectedKeys, 'rejected', note);
    resetWorkflow();
  }

  const actionMessage = !mode
    ? 'Choose an action: Approve or Deny.'
    : mode === 'approve'
      ? 'Select one or more requested changes to approve.'
      : 'Select one or more requested changes to deny.';

  return (
    <div className="apr-overlay" onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}>
      <div className="apr-modal" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}>
        <div className="apr-modal__header">
          <div>
            <h2>Profile Update Request</h2>
            <p>{request.residentName || request.residentEmail} - {formatDate(request.createdAt)}</p>
          </div>
          <button className="apr-icon-btn" type="button" onClick={closeModal} aria-label="Close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {canEdit && changedKeys.length > 0 && denyPanelOpen && (
          <div className="apr-toolbar">
              <div className="apr-deny-panel">
                <label className="apr-deny-panel__label">
                  Reason for denial ({selectedKeys.length} field{selectedKeys.length === 1 ? '' : 's'})
                </label>
                <select
                  className="apr-deny-panel__select"
                  value={denyReason}
                  onChange={e => setDenyReason(e.target.value)}
                >
                  <option value="">Please select...</option>
                  {DENY_REASONS.map(reason => (
                    <option key={reason} value={reason}>{reason}</option>
                  ))}
                </select>

                {denyReason === 'Other...' && (
                  <textarea
                    className="apr-deny-panel__textarea"
                    value={denyOtherText}
                    onChange={e => setDenyOtherText(e.target.value)}
                    placeholder="Describe the reason for denial"
                    rows={3}
                  />
                )}

                <div className="apr-deny-panel__actions">
                  <button
                    className="apr-btn apr-btn--ghost apr-btn--compact"
                    type="button"
                    onClick={cancelDenyPanel}
                  >
                    Back
                  </button>
                  <button
                    className="apr-btn apr-btn--danger apr-btn--compact"
                    type="button"
                    onClick={confirmDenySelected}
                    disabled={isBusy || !denyReason || (denyReason === 'Other...' && !denyOtherText.trim())}
                  >
                    {isBusy ? 'Denying...' : 'Confirm Deny'}
                  </button>
                </div>
              </div>
          </div>
        )}

        <div className="apr-modal__body apr-modal__body--form">
          {request.note && (
            <div className="apr-ff-note">
              <span>Note from resident</span>
              <p>{request.note}</p>
            </div>
          )}

          {PROFILE_SECTIONS.map(section => (
            <section className="apr-ff-section" key={section.label}>
              <div className="apr-ff-section__title">
                <h3>{section.label}</h3>
              </div>
              <div className="apr-ff-grid">
                {section.fields.map(field => (
                  <ProfileFormField
                    key={field.key}
                    field={field}
                    currentData={request.currentData}
                    requestedData={request.requestedData}
                    mode={mode}
                    selected={selectedKeys.includes(field.key)}
                    selectable={canEdit && !!mode && !denyPanelOpen}
                    onToggle={toggleKey}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>

        <div className="apr-modal__footer">
          {request.proofDocumentUrl ? (
            <button className="apr-proof-link-btn" type="button" onClick={() => setPreviewOpen(true)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
              </svg>
              Valid ID / Proof Document
            </button>
          ) : <span />}

          <div className="apr-modal__footer-right">
            {canEdit && changedKeys.length > 0 && !denyPanelOpen && (
              <div className="apr-footer-actions">
                <p className="apr-footer-actions__message">
                  {actionMessage}
                  {hasSelection && (
                    <button
                      className="apr-unselect-all-btn"
                      type="button"
                      onClick={() => setSelectedKeys([])}
                      disabled={isBusy}
                    >
                      Unselect All
                    </button>
                  )}
                </p>
                <div className="apr-footer-actions__buttons">
                  <button
                    className={`apr-btn apr-btn--success${mode === 'approve' ? ' is-active' : ''}`}
                    type="button"
                    onClick={() => {
                      if (mode === 'approve' && hasSelection) handleDone();
                      else selectMode('approve');
                    }}
                    disabled={isBusy}
                  >
                    {isBusy && mode === 'approve' ? 'Applying...' : mode === 'approve' && hasSelection ? `Finish (${selectedKeys.length})` : 'Approve'}
                  </button>
                  <button
                    className={`apr-btn apr-btn--danger${mode === 'deny' ? ' is-active' : ''}`}
                    type="button"
                    onClick={() => {
                      if (mode === 'deny' && hasSelection) handleDone();
                      else selectMode('deny');
                    }}
                    disabled={isBusy}
                  >
                    {mode === 'deny' && hasSelection ? `Finish (${selectedKeys.length})` : 'Deny'}
                  </button>
                </div>
              </div>
            )}
            <button className="apr-btn apr-btn--ghost" type="button" onClick={closeModal}>Close</button>
          </div>
        </div>
      </div>

      {previewOpen && request.proofDocumentUrl && (
        <div className="apr-doc-overlay" onClick={() => setPreviewOpen(false)}>
          <div className="apr-doc-modal" role="dialog" aria-modal="true" aria-label="Proof document preview" onClick={e => e.stopPropagation()}>
            <div className="apr-doc-modal__header">
              <div>
                <h3>Proof Document</h3>
                <p>{proofLabel}</p>
              </div>
              <button className="apr-icon-btn" type="button" onClick={() => setPreviewOpen(false)} aria-label="Close document preview">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
            <div className="apr-doc-modal__body">
              {proofIsImage ? (
                <img src={request.proofDocumentUrl} alt={proofLabel} />
              ) : (
                <iframe src={request.proofDocumentUrl} title={proofLabel} />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdminProfileRequest() {
  const [sidebarOpen, setSidebarOpen] = useState(window.innerWidth >= 1024);
  const [search, setSearch] = useState('');
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState('');
  const [selected, setSelected] = useState(null);
  const [actionLoading, setActionLoading] = useState('');
  const [toast, setToast] = useState('');
  const [adminRole, setAdminRole] = useState(null);

  // Get current admin's role
  useEffect(() => {
    const token = getAdminToken();
    const decoded = decodeAdminToken(token);
    setAdminRole(decoded?.adminRole || null);
  }, []);

  const canEdit = ADMIN_EDIT_ROLES.includes(adminRole);

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    setFetchError('');
    try {
      const res = await fetch(`${API_URL}/profile-change-requests?status=pending`, {
        headers: { Authorization: `Bearer ${getAdminToken()}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setRequests(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
      setFetchError('Failed to load profile update requests. Please refresh the page.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchRequests(); }, [fetchRequests]);

  useEffect(() => {
    const token = getAdminToken();
    if (!token) return;

    const socket = io(
      import.meta.env.VITE_SOCKET_URL ||
      import.meta.env.VITE_BACKEND_URL?.replace('/api', '') || '',
      { auth: { token }, transports: ['websocket'], reconnection: true }
    );

    socket.on('profile_change_request_created', (request) => {
      if (!request?._id || request.status !== 'pending') return;
      setRequests(prev => [request, ...prev.filter(item => item._id !== request._id)]);
    });

    socket.on('profile_change_request_updated', (request) => {
      if (!request?._id) return;
      setRequests(prev => {
        if (request.status === 'pending') {
          const exists = prev.some(item => item._id === request._id);
          return exists
            ? prev.map(item => item._id === request._id ? request : item)
            : [request, ...prev];
        }
        return prev.filter(item => item._id !== request._id);
      });
      setSelected(prev => {
        if (prev?._id !== request._id) return prev;
        return request.status === 'pending' ? request : null;
      });
    });

    return () => socket.disconnect();
  }, []);

  function showToast(message) {
    setToast(message);
    setTimeout(() => setToast(''), 3500);
  }

  async function bulkReviewRequest(requestId, fields, status, note) {
    if (!fields || fields.length === 0) return;
    setActionLoading(loadingKey(requestId, fields.join(','), status));
    try {
      for (const field of fields) {
        const res = await fetch(`${API_URL}/profile-change-requests/${requestId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getAdminToken()}` },
          body: JSON.stringify({ status, field, ...(note ? { reviewNote: note } : {}) }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.message || `Failed to update ${CHANGE_LABELS[field] || field}.`);
        setSelected(data.request?.status === 'pending' ? data.request : null);
      }
      const count = fields.length;
      const fieldWord = count === 1 ? 'field' : 'fields';
      showToast(
        status === 'approved'
          ? `${count} ${fieldWord} approved and applied.`
          : `${count} ${fieldWord} denied.`
      );
      await fetchRequests();
    } catch (err) {
      showToast(err.message || 'Action failed. Please try again.');
    } finally {
      setActionLoading('');
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return requests;
    return requests.filter(req =>
      [req.residentName, req.residentEmail, req.note]
        .some(value => String(value || '').toLowerCase().includes(q))
    );
  }, [requests, search]);

  return (
    <div className="apr-layout">
      <Sidebar sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />
      <div className="apr-shell">
        <AdminTopbar
          placeholder="Search profile requests..."
          search={search}
          onSearch={setSearch}
          onHamburger={() => setSidebarOpen(v => !v)}
          sidebarOpen={sidebarOpen}
          setSidebarOpen={setSidebarOpen}
        />

        <main className="apr-page">
          <div className="apr-header">
            <div>
              <h1>Profile Update Requests</h1>
              <p>Review resident-submitted information changes before they are applied.</p>
            </div>
          </div>

          <section className="apr-card">
            {loading && <div className="apr-empty">Loading profile update requests...</div>}
            {!loading && fetchError && <div className="apr-empty apr-empty--error">{fetchError}</div>}
            {!loading && !fetchError && filtered.length === 0 && (
              <div className="apr-empty">
                {search ? `No profile update requests found for "${search}".` : 'No pending profile update requests.'}
              </div>
            )}

            {!loading && !fetchError && filtered.length > 0 && (
              <table className="apr-table">
                <thead>
                  <tr>
                    <th>Resident</th>
                    <th>Submitted</th>
                    <th>Changed Fields</th>
                    <th>Note</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(request => {
                    const changedFields = Object.keys(request.requestedData || {});
                    return (
                      <tr key={request._id}>
                        <td>
                          <p className="apr-resident-name">{request.residentName || 'Resident'}</p>
                          <p className="apr-resident-email">{request.residentEmail || '-'}</p>
                        </td>
                        <td>{formatDate(request.createdAt)}</td>
                        <td>
                          <div className="apr-field-tags">
                            {changedFields.slice(0, 3).map(key => (
                              <span key={key}>{CHANGE_LABELS[key] || key}</span>
                            ))}
                            {changedFields.length > 3 && <span>+{changedFields.length - 3} more</span>}
                          </div>
                        </td>
                        <td className="apr-note-cell">{request.note || '-'}</td>
                        <td>
                          <button className="apr-review-btn" type="button" onClick={() => setSelected(request)}>
                            Review
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </section>
        </main>
      </div>

      <RequestModal
        request={selected}
        onClose={() => setSelected(null)}
        onBulkReview={bulkReviewRequest}
        actionLoading={actionLoading}
        canEdit={canEdit}
      />

      {toast && <div className="apr-toast">{toast}</div>}
    </div>
  );
}