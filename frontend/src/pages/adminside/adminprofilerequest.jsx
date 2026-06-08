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
  birthdate: 'Date of Birth',
  sex: 'Sex',
  civilStatus: 'Civil Status',
  nationality: 'Nationality',
  contactNumber: 'Mobile Number',
  email: 'Email Address',
  homeAddress: 'Home Address',
  purok: 'Purok',
  residencyStatus: 'Residency Status',
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

function RequestModal({ request, onClose, onReview, actionLoading, canEdit }) {
  const [previewOpen, setPreviewOpen] = useState(false);

  useEffect(() => {
    setPreviewOpen(false);
  }, [request?._id]);

  if (!request) return null;
  const rows = Object.keys(request.requestedData || {});
  const proofLabel = proofDocumentLabel(request);
  const proofIsImage = isImageProofDocument(request);

  function closeModal() {
    setPreviewOpen(false);
    onClose();
  }

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

        <div className="apr-modal__body">
          {request.note && <p className="apr-note">{request.note}</p>}
          {request.proofDocumentUrl && (
            <div className="apr-proof">
              <div>
                <span>Valid ID / Proof Document</span>
                <p>{proofLabel}</p>
              </div>
              <button type="button" onClick={() => setPreviewOpen(true)}>
                View Document
              </button>
            </div>
          )}
          <div className="apr-change-list">
            <div className="apr-change-list__head">
              <span>Information</span>
              <span>Previous Information</span>
              <span>Requested Change</span>
              {canEdit && <span>Decision</span>}
            </div>
            {rows.map(key => (
              <div className="apr-change-row" key={key}>
                <span className="apr-change-row__label">{CHANGE_LABELS[key] || key}</span>
                <div className="apr-change-row__value apr-change-row__value--old">
                  <p>{valueText(request.currentData?.[key])}</p>
                </div>
                <div className="apr-change-row__value apr-change-row__value--new">
                  <p>{valueText(request.requestedData?.[key])}</p>
                </div>
                {canEdit && (
                  <div className="apr-change-row__actions">
                    <button
                      className="apr-btn apr-btn--danger apr-btn--compact"
                      type="button"
                      onClick={() => onReview(request._id, key, 'rejected')}
                      disabled={!!actionLoading}
                    >
                      {actionLoading === loadingKey(request._id, key, 'rejected') ? 'Denying...' : 'Deny'}
                    </button>
                    <button
                      className="apr-btn apr-btn--primary apr-btn--compact"
                      type="button"
                      onClick={() => onReview(request._id, key, 'approved')}
                      disabled={!!actionLoading}
                    >
                      {actionLoading === loadingKey(request._id, key, 'approved') ? 'Applying...' : 'Approve & Apply'}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="apr-modal__footer">
          <button className="apr-btn apr-btn--ghost" type="button" onClick={closeModal}>Close</button>
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

  async function reviewRequest(requestId, field, status) {
    setActionLoading(loadingKey(requestId, field, status));
    try {
      const res = await fetch(`${API_URL}/profile-change-requests/${requestId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getAdminToken()}` },
        body: JSON.stringify({ status, field }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Action failed.');
      setSelected(data.request?.status === 'pending' ? data.request : null);
      const label = CHANGE_LABELS[field] || field;
      showToast(status === 'approved' ? `${label} approved and applied.` : `${label} denied.`);
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
        onReview={reviewRequest}
        actionLoading={actionLoading}
        canEdit={canEdit}
      />

      {toast && <div className="apr-toast">{toast}</div>}
    </div>
  );
}
