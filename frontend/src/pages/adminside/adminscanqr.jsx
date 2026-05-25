import { useState, useRef, useEffect } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import jsQR from 'jsqr';
import Sidebar from '../../components/adminsidebar';
import AdminTopbar from '../../components/admintopbar';
import './adminscanqr.css';

const API_URL = import.meta.env.VITE_BACKEND_URL;

function getAdminToken() {
  return (
    localStorage.getItem('admin_token') ||
    sessionStorage.getItem('admin_token') ||
    localStorage.getItem('adminToken') ||
    sessionStorage.getItem('adminToken') ||
    ''
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  return d.toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });
}

function calcAge(birthdate) {
  if (!birthdate) return '—';
  const birth = new Date(birthdate);
  const now   = new Date();
  const age   = now.getFullYear() - birth.getFullYear() -
    (now < new Date(now.getFullYear(), birth.getMonth(), birth.getDate()) ? 1 : 0);
  return isNaN(age) ? '—' : `${age} years old`;
}

function formatDateTime(dateStr, timeStr) {
  const date = formatDate(dateStr);
  if (!timeStr) return date;
  return `${date} • ${timeStr}`;
}

// ── Scan States ───────────────────────────────────────────────────────────────
const STATE = {
  IDLE:       'idle',
  REQUESTING: 'requesting',
  DENIED:     'denied',
  SCANNING:   'scanning',
  LOADING:    'loading',
  SUCCESS:    'success',
  ERROR:      'error',
};

const SCANNER_ELEMENT_ID = 'asqr-html5-qrcode-region';
const UPLOAD_SCANNER_ELEMENT_ID = 'asqr-upload-qrcode-region';

export default function AdminScanQR() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [scanState,   setScanState]   = useState(STATE.IDLE);
  const [resident,    setResident]    = useState(null);
  const [appointments, setAppointments] = useState([]);
  const [complaints,  setComplaints]  = useState([]);
  const [errorMsg,    setErrorMsg]    = useState('');

  const html5QrRef    = useRef(null);
  const fileInputRef  = useRef(null);
  const cooldownRef   = useRef(false);
  const shouldScanRef = useRef(false);

  // ── Stop camera cleanly ────────────────────────────────────────────────────
  const stopCamera = async () => {
    if (html5QrRef.current) {
      try {
        const s = html5QrRef.current.getState();
        if (s === 2 || s === 3) await html5QrRef.current.stop();
      } catch { /* already stopped */ }
      try { html5QrRef.current.clear(); } catch { /* ignore */ }
      html5QrRef.current = null;
    }
  };

  useEffect(() => () => { stopCamera(); }, []);

  // ── Boot html5-qrcode once DOM is ready ────────────────────────────────────
  useEffect(() => {
    if (scanState !== STATE.SCANNING) return;
    if (!shouldScanRef.current) return;
    shouldScanRef.current = false;

    const timer = setTimeout(async () => {
      const el = document.getElementById(SCANNER_ELEMENT_ID);
      if (!el) {
        setErrorMsg('Scanner element not found. Please try again.');
        setScanState(STATE.ERROR);
        setTimeout(() => setScanState(STATE.IDLE), 5000);
        return;
      }

      try {
        const scanner = new Html5Qrcode(SCANNER_ELEMENT_ID, { verbose: false });
        html5QrRef.current = scanner;

        // Try with specific constraints first
        try {
          await scanner.start(
            {
              facingMode: 'environment',
              width: { min: 320, ideal: 640, max: 1280 },
              height: { min: 240, ideal: 480, max: 960 },
            },
            {
              fps: 15,
              qrbox: { width: 280, height: 280 },
              aspectRatio: 1.0,
              disableFlip: false,
              experimentalFeatures: { useBarCodeDetectorIfSupported: true },
            },
            handleDecode,
            () => {}
          );
        } catch (constraintErr) {
          console.warn('Camera start with strict constraints failed, trying with relaxed constraints:', constraintErr);
          
          // Cleanup before retry to avoid state transition conflicts
          try {
            await scanner.stop();
          } catch { /* ignore */ }
          try {
            await scanner.clear();
          } catch { /* ignore */ }
          
          // Small delay before retrying
          await new Promise(resolve => setTimeout(resolve, 300));
          
          // Create a fresh scanner instance for the retry
          const retryScanner = new Html5Qrcode(SCANNER_ELEMENT_ID, { verbose: false });
          html5QrRef.current = retryScanner;
          
          // Retry with minimal constraints
          await retryScanner.start(
            { facingMode: 'environment' },
            {
              fps: 15,
              qrbox: { width: 280, height: 280 },
              aspectRatio: 1.0,
              disableFlip: false,
            },
            handleDecode,
            () => {}
          );
        }
      } catch (err) {
        const msg = typeof err === 'string' ? err : (err?.message || '');
        console.error('Camera start error:', err);
        if (
          err?.name === 'NotAllowedError' ||
          err?.name === 'PermissionDeniedError' ||
          msg.includes('Permission') ||
          msg.includes('permission')
        ) {
          setScanState(STATE.DENIED);
        } else {
          setErrorMsg('Could not start camera. Please try again.');
          setScanState(STATE.ERROR);
          setTimeout(() => setScanState(STATE.IDLE), 5000);
        }
      }
    }, 150);

    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanState]);

  // ── Handle decoded QR ──────────────────────────────────────────────────────
  const handleDecode = async (decodedText) => {
    if (cooldownRef.current) return;
    if (!decodedText) return;

    let qrToken = '';
    try {
      const url = new URL(decodedText);
      qrToken = url.searchParams.get('token') || '';
    } catch {
      qrToken = decodedText;
    }
    if (!qrToken) return;

    cooldownRef.current = true;
    await stopCamera();
    setScanState(STATE.LOADING);
    setErrorMsg('');

    try {
      const adminToken = getAdminToken();

      if (!adminToken) {
        setErrorMsg('Admin session not found. Please log in again.');
        setScanState(STATE.ERROR);
        setTimeout(() => { cooldownRef.current = false; startScanner(); }, 3000);
        return;
      }

      const res = await fetch(`${API_URL}/user/verify-qr/${encodeURIComponent(qrToken)}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const data = await res.json();

      if (res.ok && data.verified) {
        setResident(data.user);
        setAppointments(Array.isArray(data.appointments) ? data.appointments : []);
        setComplaints(Array.isArray(data.complaints) ? data.complaints : []);
        setScanState(STATE.SUCCESS);
      } else {
        setErrorMsg(data.message || 'Verification failed. Please try again.');
        setScanState(STATE.ERROR);
        setTimeout(() => { cooldownRef.current = false; startScanner(); }, 3000);
      }
    } catch {
      setErrorMsg('Unable to connect to the server. Please try again.');
      setScanState(STATE.ERROR);
      setTimeout(() => { cooldownRef.current = false; startScanner(); }, 3000);
    }
  };

  const handleUploadQr = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    await stopCamera();
    setScanState(STATE.LOADING);
    setErrorMsg('');

    try {
      const decodedText = await new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onerror = () => reject(new Error('Failed to read file'));

        reader.onload = (e) => {
          const img = new Image();
          img.onerror = () => reject(new Error('Failed to load image'));

          img.onload = () => {
            // Draw onto a canvas so we can extract raw pixel data for jsQR
            const canvas = document.createElement('canvas');
            canvas.width  = img.naturalWidth  || img.width;
            canvas.height = img.naturalHeight || img.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const result = jsQR(imageData.data, imageData.width, imageData.height, {
              inversionAttempts: 'attemptBoth', // handles light-on-dark and dark-on-light QRs
            });

            if (result?.data) {
              resolve(result.data);
            } else {
              reject(new Error('No QR code found in image'));
            }
          };

          img.src = e.target.result;
        };

        reader.readAsDataURL(file);
      });

      cooldownRef.current = false;

      // Non-critical: upload image to Cloudinary for record-keeping
      try {
        const formData = new FormData();
        formData.append('qrImage', file);
        const adminToken = getAdminToken();
        const uploadRes = await fetch(`${API_URL}/admin/upload-qr-image`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${adminToken}` },
          body: formData,
        });
        if (!uploadRes.ok) console.warn('Image upload to Cloudinary failed, but QR scan succeeded');
      } catch (uploadErr) {
        console.warn('Image upload error (non-critical):', uploadErr);
      }

      await handleDecode(decodedText);
    } catch (err) {
      cooldownRef.current = false;
      console.error('Upload QR error:', err);
      setErrorMsg('Could not read a QR code from that image. Try a clearer screenshot or photo.');
      setScanState(STATE.ERROR);
      setTimeout(() => setScanState(STATE.IDLE), 5000);
    }
  };

  const requestCameraPermission = async () => {
    setScanState(STATE.REQUESTING);
    try {
      // Try with specific constraints first
      try {
        const constraints = {
          video: {
            facingMode: 'environment',
            width: { min: 320, ideal: 640, max: 1280 },
            height: { min: 240, ideal: 480, max: 960 },
          },
        };
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        stream.getTracks().forEach(t => t.stop());
      } catch (constraintErr) {
        console.warn('getUserMedia with strict constraints failed, trying without:', constraintErr);
        // Fallback: try with minimal constraints
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
        });
        stream.getTracks().forEach(t => t.stop());
      }
      startScanner();
    } catch (err) {
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setScanState(STATE.DENIED);
      } else {
        setErrorMsg('Could not access camera. Please check your device settings.');
        setScanState(STATE.ERROR);
        setTimeout(() => setScanState(STATE.IDLE), 5000);
      }
    }
  };

  const startScanner = () => {
    setResident(null);
    setAppointments([]);
    setComplaints([]);
    setErrorMsg('');
    cooldownRef.current = false;
    shouldScanRef.current = true;
    setScanState(STATE.SCANNING);
  };

  const cancel = async () => {
    await stopCamera();
    cooldownRef.current = false;
    setScanState(STATE.IDLE);
  };

  const reset = async () => {
    await stopCamera();
    cooldownRef.current = false;
    setResident(null);
    setAppointments([]);
    setComplaints([]);
    setErrorMsg('');
    setScanState(STATE.IDLE);
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#f8fafc' }}>
      {/* ── Sidebar ── */}
      <Sidebar sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />

      {/* ── Main area ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* ── Topbar ── */}
        <AdminTopbar
          placeholder="Search residents…"
          onHamburger={() => setSidebarOpen(prev => !prev)}
          sidebarOpen={sidebarOpen}
          setSidebarOpen={setSidebarOpen}
        />

        {/* ── Page content ── */}
        <main style={{ flex: 1, overflowY: 'auto', padding: '32px 16px' }}>
          <div className="asqr-root">

            {/* Page header */}
            <div className="asqr-page-header">
              <div className="asqr-page-header-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="24" height="24">
                  <rect x="3" y="3" width="7" height="7" rx="1"/>
                  <rect x="14" y="3" width="7" height="7" rx="1"/>
                  <rect x="3" y="14" width="7" height="7" rx="1"/>
                  <rect x="5" y="5" width="3" height="3" fill="currentColor" stroke="none"/>
                  <rect x="16" y="5" width="3" height="3" fill="currentColor" stroke="none"/>
                  <rect x="5" y="16" width="3" height="3" fill="currentColor" stroke="none"/>
                  <line x1="14" y1="14" x2="21" y2="14"/>
                  <line x1="14" y1="17" x2="17" y2="17"/>
                  <line x1="17" y1="14" x2="17" y2="21"/>
                  <line x1="20" y1="17" x2="21" y2="17"/>
                  <line x1="14" y1="20" x2="14" y2="21"/>
                  <line x1="20" y1="20" x2="21" y2="20"/>
                  <line x1="21" y1="17" x2="21" y2="21"/>
                </svg>
              </div>
              <div>
                <h1 className="asqr-page-title">Scan QR Code</h1>
                <p className="asqr-page-sub">Verify resident identity via QR</p>
              </div>
            </div>

            {/* Scanner card */}
            <div className="asqr-card">
              <div id={UPLOAD_SCANNER_ELEMENT_ID} className="asqr-upload-region" />

              {/* ── IDLE ── */}
              {scanState === STATE.IDLE && (
                <div className="asqr-idle">
                  <div className="asqr-idle-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="52" height="52">
                      <rect x="3" y="3" width="7" height="7" rx="1"/>
                      <rect x="14" y="3" width="7" height="7" rx="1"/>
                      <rect x="3" y="14" width="7" height="7" rx="1"/>
                      <rect x="5" y="5" width="3" height="3" fill="currentColor" stroke="none"/>
                      <rect x="16" y="5" width="3" height="3" fill="currentColor" stroke="none"/>
                      <rect x="5" y="16" width="3" height="3" fill="currentColor" stroke="none"/>
                      <line x1="14" y1="14" x2="21" y2="14"/>
                      <line x1="14" y1="17" x2="17" y2="17"/>
                      <line x1="17" y1="14" x2="17" y2="21"/>
                      <line x1="20" y1="17" x2="21" y2="17"/>
                      <line x1="14" y1="20" x2="14" y2="21"/>
                      <line x1="20" y1="20" x2="21" y2="20"/>
                      <line x1="21" y1="17" x2="21" y2="21"/>
                    </svg>
                  </div>
                  <h2 className="asqr-idle-title">Resident Identity Scanner</h2>
                  <p className="asqr-idle-desc">
                    Ask the resident to open their NCESS account and tap <strong>My QR</strong> in their profile.
                    Then press the button below to activate the camera scanner.
                  </p>
                  <button className="asqr-start-btn" onClick={requestCameraPermission}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                      <path d="M23 7l-7 5 7 5V7z"/>
                      <rect x="1" y="5" width="15" height="14" rx="2"/>
                    </svg>
                    Start Scanning
                  </button>
                  <input
                    ref={fileInputRef}
                    className="asqr-file-input"
                    type="file"
                    accept="image/*"
                    onChange={handleUploadQr}
                  />
                  <button className="asqr-upload-btn" onClick={() => fileInputRef.current?.click()}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                      <polyline points="17 8 12 3 7 8"/>
                      <line x1="12" y1="3" x2="12" y2="15"/>
                    </svg>
                    Upload QR Image
                  </button>
                </div>
              )}

              {/* ── REQUESTING PERMISSION ── */}
              {scanState === STATE.REQUESTING && (
                <div className="asqr-loading">
                  <div className="asqr-permission-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="38" height="38">
                      <path d="M15 10l4.553-2.069A1 1 0 0121 8.87V19a2 2 0 01-2 2H5a2 2 0 01-2-2V8.87a1 1 0 011.447-.899L9 10"/>
                      <rect x="9" y="2" width="6" height="9" rx="2"/>
                    </svg>
                  </div>
                  <p className="asqr-loading-text">Requesting camera access…</p>
                  <p className="asqr-permission-hint">A permission prompt should appear on your device</p>
                </div>
              )}

              {/* ── PERMISSION DENIED ── */}
              {scanState === STATE.DENIED && (
                <div className="asqr-error-state">
                  <div className="asqr-error-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="32" height="32">
                      <path d="M15 10l4.553-2.069A1 1 0 0121 8.87V19a2 2 0 01-2 2H5a2 2 0 01-2-2V8.87a1 1 0 011.447-.899L9 10"/>
                      <rect x="9" y="2" width="6" height="9" rx="2"/>
                      <line x1="2" y1="2" x2="22" y2="22"/>
                    </svg>
                  </div>
                  <h3 className="asqr-error-title">Camera Access Denied</h3>
                  <p className="asqr-error-msg">Permission was blocked by your browser or device.</p>
                  <div className="asqr-denied-steps">
                    <p className="asqr-denied-steps-title">To enable camera access:</p>
                    <ol className="asqr-denied-list">
                      <li>Open your browser's <strong>Site Settings</strong> or <strong>Privacy Settings</strong></li>
                      <li>Find <strong>Camera</strong> permissions for this site</li>
                      <li>Change it to <strong>Allow</strong></li>
                      <li>Reload the page and try again</li>
                    </ol>
                  </div>
                  <button className="asqr-start-btn" style={{ marginTop: 4 }} onClick={() => setScanState(STATE.IDLE)}>
                    Go Back
                  </button>
                </div>
              )}

              {/* ── SCANNING ── */}
              {scanState === STATE.SCANNING && (
                <div className="asqr-scanner-wrap">
                  <div className="asqr-scanner-label">
                    <span className="asqr-live-dot"/>
                    Camera active — point at resident's QR code
                  </div>
                  <div className="asqr-scanner-viewport">
                    <div id={SCANNER_ELEMENT_ID} className="asqr-h5qr-region" />
                    <div className="asqr-corner asqr-corner--tl"/>
                    <div className="asqr-corner asqr-corner--tr"/>
                    <div className="asqr-corner asqr-corner--bl"/>
                    <div className="asqr-corner asqr-corner--br"/>
                    <div className="asqr-scan-line"/>
                  </div>
                  <button className="asqr-cancel-btn" onClick={cancel}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                    Cancel
                  </button>
                </div>
              )}

              {/* ── LOADING ── */}
              {scanState === STATE.LOADING && (
                <div className="asqr-loading">
                  <div className="asqr-loading-spinner"/>
                  <p className="asqr-loading-text">Verifying resident…</p>
                </div>
              )}

              {/* ── ERROR ── */}
              {scanState === STATE.ERROR && (
                <div className="asqr-error-state">
                  <div className="asqr-error-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="32" height="32">
                      <circle cx="12" cy="12" r="10"/>
                      <line x1="15" y1="9" x2="9" y2="15"/>
                      <line x1="9" y1="9" x2="15" y2="15"/>
                    </svg>
                  </div>
                  <h3 className="asqr-error-title">Scan Failed</h3>
                  <p className="asqr-error-msg">{errorMsg}</p>
                  <p className="asqr-error-sub">Returning to scanner…</p>
                </div>
              )}

              {/* ── SUCCESS ── */}
              {scanState === STATE.SUCCESS && resident && (
                <div className="asqr-success-state">
                  <div className="asqr-success-banner">
                    <span className="asqr-success-check">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" width="20" height="20">
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                    </span>
                    <div>
                      <p className="asqr-success-banner-title">Identity Verified</p>
                      <p className="asqr-success-banner-sub">QR scan successful — resident confirmed</p>
                    </div>
                  </div>

                  <div className="asqr-resident-card">
                    <div className="asqr-resident-avatar">
                      {resident.fullName?.charAt(0)?.toUpperCase() || '?'}
                    </div>
                    <div className="asqr-resident-name">{resident.fullName || '—'}</div>
                    <div className="asqr-resident-status-badge">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="11" height="11">
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                      {resident.status || 'approved'}
                    </div>

                    <div className="asqr-resident-divider"/>

                    <div className="asqr-resident-fields">
                      {[
                        { label: 'Email',     value: resident.email       || '—' },
                        { label: 'Purok',     value: resident.purok       || '—' },
                        { label: 'Address',   value: resident.homeAddress || '—' },
                        { label: 'Sex',       value: resident.sex         || '—' },
                        { label: 'Birthdate', value: formatDate(resident.birthdate) },
                        { label: 'Age',       value: calcAge(resident.birthdate) },
                      ].map(row => (
                        <div className="asqr-field-row" key={row.label}>
                          <span className="asqr-field-label">{row.label}</span>
                          <span className="asqr-field-value">{row.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="asqr-record-grid">
                    <section className="asqr-record-panel">
                      <div className="asqr-record-panel__header">
                        <h3>Bookings / Requests</h3>
                        <span>{appointments.length}</span>
                      </div>
                      {appointments.length ? (
                        <div className="asqr-record-list">
                          {appointments.map((item) => (
                            <article className="asqr-record-item" key={item._id}>
                              <div className="asqr-record-item__top">
                                <strong>{item.purpose || 'Appointment'}</strong>
                                <span className={`asqr-status asqr-status--${String(item.status || '').toLowerCase()}`}>
                                  {item.status || '—'}
                                </span>
                              </div>
                              <p>{formatDateTime(item.date, item.time)}</p>
                              <p>Assigned to: {item.assignedTo || 'Unassigned'}</p>
                              {item.cancelReason && <p>Reason: {item.cancelReason}</p>}
                            </article>
                          ))}
                        </div>
                      ) : (
                        <p className="asqr-empty-record">No bookings or requests found for this resident.</p>
                      )}
                    </section>

                    <section className="asqr-record-panel">
                      <div className="asqr-record-panel__header">
                        <h3>Complaints</h3>
                        <span>{complaints.length}</span>
                      </div>
                      {complaints.length ? (
                        <div className="asqr-record-list">
                          {complaints.map((item) => (
                            <article className="asqr-record-item" key={item._id}>
                              <div className="asqr-record-item__top">
                                <strong>{item.category || 'Complaint'}</strong>
                                <span className={`asqr-status asqr-status--${String(item.status || '').toLowerCase().replace(/\s+/g, '-')}`}>
                                  {item.status || '—'}
                                </span>
                              </div>
                              <p>{formatDate(item.createdAt)}</p>
                              <p>{item.location || 'No location provided'}</p>
                              {item.description && <p>{item.description}</p>}
                            </article>
                          ))}
                        </div>
                      ) : (
                        <p className="asqr-empty-record">No complaints found for this resident.</p>
                      )}
                    </section>
                  </div>

                  <div className="asqr-action-row">
                    <button className="asqr-scan-again-btn" onClick={startScanner}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                        <polyline points="23 4 23 10 17 10"/>
                        <path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/>
                      </svg>
                      Scan Another
                    </button>
                    <button className="asqr-done-btn" onClick={reset}>
                      Done
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}