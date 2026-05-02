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
  purok: 'Purok / Sitio',
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

function RequestModal({ request, onClose, onReview, actionLoading, canEdit }) {
  if (!request) return null;
  const rows = Object.keys(request.requestedData || {});

  return (
    <div className="apr-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="apr-modal" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}>
        <div className="apr-modal__header">
          <div>
            <h2>Profile Update Request</h2>
            <p>{request.residentName || request.residentEmail} - {formatDate(request.createdAt)}</p>
          </div>
          <button className="apr-icon-btn" type="button" onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <div className="apr-modal__body">
          {request.note && <p className="apr-note">{request.note}</p>}
          <div className="apr-change-list">
            {rows.map(key => (
              <div className="apr-change-row" key={key}>
                <span className="apr-change-row__label">{CHANGE_LABELS[key] || key}</span>
                <div className="apr-change-row__values">
                  <p className="apr-change-row__old">{valueText(request.currentData?.[key])}</p>
                  <p className="apr-change-row__new">{valueText(request.requestedData?.[key])}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="apr-modal__footer">
          <button className="apr-btn apr-btn--ghost" type="button" onClick={onClose}>Close</button>
          {canEdit && (
            <>
              <button
                className="apr-btn apr-btn--danger"
                type="button"
                onClick={() => onReview(request._id, 'rejected')}
                disabled={!!actionLoading}
              >
                {actionLoading === 'rejected' ? 'Rejecting...' : 'Reject'}
              </button>
              <button
                className="apr-btn apr-btn--primary"
                type="button"
                onClick={() => onReview(request._id, 'approved')}
                disabled={!!actionLoading}
              >
                {actionLoading === 'approved' ? 'Approving...' : 'Approve & Apply'}
              </button>
            </>
          )}
        </div>
      </div>
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
      setSelected(prev => prev?._id === request._id && request.status !== 'pending' ? null : prev);
    });

    return () => socket.disconnect();
  }, []);

  function showToast(message) {
    setToast(message);
    setTimeout(() => setToast(''), 3500);
  }

  async function reviewRequest(requestId, status) {
    setActionLoading(status);
    try {
      const res = await fetch(`${API_URL}/profile-change-requests/${requestId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getAdminToken()}` },
        body: JSON.stringify({ status }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Action failed.');
      setSelected(null);
      showToast(status === 'approved' ? 'Profile update approved and applied.' : 'Profile update request rejected.');
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
            <button className="apr-refresh-btn" type="button" onClick={fetchRequests} disabled={loading}>
              {loading ? 'Loading...' : 'Refresh'}
            </button>
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
