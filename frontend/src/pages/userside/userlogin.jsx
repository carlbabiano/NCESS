import { useState } from 'react';
import './userlogin.css';
import newcablogo          from '../../assets/newcab.png';
import bagongpilipinaslogo from '../../assets/bagongpilipinas.png';
import olongapologo        from '../../assets/lungsodngolongapo.png';

const API_URL = import.meta.env.VITE_BACKEND_URL;

// Sidebar-style SVG icons — same lucide paths used in usersidebar.jsx
const FEATURES = [
  {
    label: 'Book Appointments',
    svg: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/>
        <line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
      </svg>
    ),
  },
  {
    label: 'Read Announcements',
    svg: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 11l19-9-9 19-2-8-8-2z"/>
      </svg>
    ),
  },
  {
    label: 'File Complaints',
    svg: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/>
        <line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
    ),
  },
  {
    label: 'Request Documents',
    svg: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
        <polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/>
        <line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
      </svg>
    ),
  },
  {
    label: 'Emergency Hotline',
    svg: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 5a2 2 0 012-2h3l2 4-2.5 1.5a11 11 0 005 5L14 11l4 2v3a2 2 0 01-2 2A16 16 0 013 5z"/>
      </svg>
    ),
  },
  {
    label: 'Manage Profile',
    svg: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/>
        <circle cx="12" cy="7" r="4"/>
      </svg>
    ),
  },
];

export default function UserLogin() {
  const [email,        setEmail]        = useState('');
  const [password,     setPassword]     = useState('');
  const [showPw,       setShowPw]       = useState(false);
  const [remember,     setRemember]     = useState(false);
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState('');
  const [statusBanner, setStatusBanner] = useState(null);
  const [showForgotPw, setShowForgotPw] = useState(false);
  const [forgotEmail,  setForgotEmail]  = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotMessage, setForgotMessage] = useState('');
  const [forgotError,  setForgotError]  = useState('');
  const [showCodeEntry, setShowCodeEntry] = useState(false);
  const [resetCode,    setResetCode]    = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setStatusBanner(null);

    if (!email.trim() || !password.trim()) {
      setError('Please fill in all fields.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/userlogin`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email: email.trim(), password }),
      });

      const data = await res.json();

      if (res.ok) {
        const store = remember ? localStorage : sessionStorage;
        store.setItem('token', data.token);
        store.setItem('user',  JSON.stringify(data.user));
        window.location.href = '/userdashboard';
        return;
      }

      if (res.status === 403) {
        setStatusBanner({ type: data.status, message: data.message });
        return;
      }

      setError(data.message || 'Invalid email or password.');
    } catch {
      setError('Unable to connect to the server. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const ForgotPasswordCodeEntry = ({ email, onSuccess, onBack }) => {
    const [code, setCode] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showNewPw, setShowNewPw] = useState(false);
    const [showConfirmPw, setShowConfirmPw] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [step, setStep] = useState('code'); // 'code', 'password', or 'success'

    const handleVerifyCode = async (e) => {
      e.preventDefault();
      setError('');

      if (!code.trim()) {
        setError('Please enter the reset code.');
        return;
      }

      setLoading(true);
      try {
        const res = await fetch(`${API_URL}/user/verify-reset-code`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, code: code.trim() }),
        });

        const data = await res.json();

        if (res.ok) {
          setStep('password');
          return;
        }

        setError(data.message || 'Invalid or expired code.');
      } catch {
        setError('Unable to connect to the server. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    const handleResetPassword = async (e) => {
      e.preventDefault();
      setError('');

      if (!newPassword.trim() || !confirmPassword.trim()) {
        setError('Please fill in all fields.');
        return;
      }

      if (newPassword.length < 8) {
        setError('Password must be at least 8 characters long.');
        return;
      }

      if (newPassword !== confirmPassword) {
        setError('Passwords do not match.');
        return;
      }

      setLoading(true);
      try {
        const res = await fetch(`${API_URL}/user/reset-password`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, code: code.trim(), newPassword, confirmPassword }),
        });

        const data = await res.json();

        if (res.ok) {
          setError('');
          setStep('success');
          return;
        }

        setError(data.message || 'Failed to reset password.');
      } catch {
        setError('Unable to connect to the server. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    return (
      <>
        {step === 'code' && (
          <>
            <h2 style={{ fontSize: '20px', fontWeight: 600, marginBottom: '8px', color: '#1f2937' }}>
              Enter Reset Code
            </h2>
            <p style={{ fontSize: '14px', color: '#6b7280', marginBottom: '24px' }}>
              Check your email for a 6-digit code and enter it below.
            </p>

            {error && (
              <div style={{
                padding: '12px',
                background: '#fee2e2',
                border: '1px solid #fecaca',
                borderRadius: '6px',
                color: '#dc2626',
                fontSize: '13px',
                marginBottom: '16px',
              }}>
                {error}
              </div>
            )}

            <form onSubmit={handleVerifyCode} noValidate>
              <div style={{ marginBottom: '20px' }}>
                <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '8px' }}>
                  Reset Code
                </label>
                <input
                  type="text"
                  placeholder="000000"
                  maxLength="6"
                  value={code}
                  onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    fontSize: '16px',
                    fontWeight: 'bold',
                    letterSpacing: '4px',
                    textAlign: 'center',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontFamily: 'monospace',
                    boxSizing: 'border-box',
                  }}
                />
                <p style={{ fontSize: '12px', color: '#9ca3af', marginTop: '8px' }}>Code expires in 15 minutes</p>
              </div>

              <button
                type="submit"
                disabled={loading}
                style={{
                  width: '100%',
                  padding: '10px',
                  background: loading ? '#d1d5db' : '#2563eb',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: loading ? 'not-allowed' : 'pointer',
                  fontFamily: 'DM Sans, sans-serif',
                  marginBottom: '12px',
                }}
                onMouseEnter={(e) => !loading && (e.target.style.background = '#1d4ed8')}
                onMouseLeave={(e) => !loading && (e.target.style.background = '#2563eb')}
              >
                {loading ? 'Verifying...' : 'Verify Code'}
              </button>

              <button
                type="button"
                onClick={onBack}
                style={{
                  width: '100%',
                  padding: '10px',
                  background: '#f3f4f6',
                  color: '#374151',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '14px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  fontFamily: 'DM Sans, sans-serif',
                }}
                onMouseEnter={(e) => e.target.style.background = '#e5e7eb'}
                onMouseLeave={(e) => e.target.style.background = '#f3f4f6'}
              >
                Back
              </button>
            </form>
          </>
        )}

        {step === 'password' && (
          <>
            <h2 style={{ fontSize: '20px', fontWeight: 600, marginBottom: '8px', color: '#1f2937' }}>
              Set New Password
            </h2>
            <p style={{ fontSize: '14px', color: '#6b7280', marginBottom: '24px' }}>
              Enter your new password below.
            </p>

            {error && (
              <div style={{
                padding: '12px',
                background: '#fee2e2',
                border: '1px solid #fecaca',
                borderRadius: '6px',
                color: '#dc2626',
                fontSize: '13px',
                marginBottom: '16px',
              }}>
                {error}
              </div>
            )}

            <form onSubmit={handleResetPassword} noValidate>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '8px' }}>
                  New Password
                </label>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <span style={{ position: 'absolute', left: '12px', color: '#9ca3af' }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="11" width="18" height="11" rx="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                  </span>
                  <input
                    type={showNewPw ? 'text' : 'password'}
                    placeholder="At least 8 characters"
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 12px 10px 40px',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '14px',
                      fontFamily: 'DM Sans, sans-serif',
                      boxSizing: 'border-box',
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPw(!showNewPw)}
                    style={{ position: 'absolute', right: '12px', background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: 0 }}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      {showNewPw ? (
                        <>
                          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                          <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                          <line x1="1" y1="1" x2="23" y2="23" />
                        </>
                      ) : (
                        <>
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                          <circle cx="12" cy="12" r="3" />
                        </>
                      )}
                    </svg>
                  </button>
                </div>
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '8px' }}>
                  Confirm Password
                </label>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <span style={{ position: 'absolute', left: '12px', color: '#9ca3af' }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="11" width="18" height="11" rx="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                  </span>
                  <input
                    type={showConfirmPw ? 'text' : 'password'}
                    placeholder="Re-enter your password"
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 12px 10px 40px',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '14px',
                      fontFamily: 'DM Sans, sans-serif',
                      boxSizing: 'border-box',
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPw(!showConfirmPw)}
                    style={{ position: 'absolute', right: '12px', background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: 0 }}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      {showConfirmPw ? (
                        <>
                          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                          <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                          <line x1="1" y1="1" x2="23" y2="23" />
                        </>
                      ) : (
                        <>
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                          <circle cx="12" cy="12" r="3" />
                        </>
                      )}
                    </svg>
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                style={{
                  width: '100%',
                  padding: '10px',
                  background: loading ? '#d1d5db' : '#2563eb',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: loading ? 'not-allowed' : 'pointer',
                  fontFamily: 'DM Sans, sans-serif',
                  marginBottom: '12px',
                }}
                onMouseEnter={(e) => !loading && (e.target.style.background = '#1d4ed8')}
                onMouseLeave={(e) => !loading && (e.target.style.background = '#2563eb')}
              >
                {loading ? 'Resetting...' : 'Reset Password'}
              </button>

              <button
                type="button"
                onClick={() => setStep('code')}
                style={{
                  width: '100%',
                  padding: '10px',
                  background: '#f3f4f6',
                  color: '#374151',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '14px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  fontFamily: 'DM Sans, sans-serif',
                }}
                onMouseEnter={(e) => e.target.style.background = '#e5e7eb'}
                onMouseLeave={(e) => e.target.style.background = '#f3f4f6'}
              >
                Back
              </button>
            </form>
          </>
        )}

        {step === 'success' && (
          <>
            <div style={{ textAlign: 'center', paddingTop: '20px' }}>
              <div style={{
                width: '60px',
                height: '60px',
                background: '#dcfce7',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 20px',
              }}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
              </div>
              <h2 style={{ fontSize: '20px', fontWeight: 600, marginBottom: '12px', color: '#1f2937' }}>
                Password Reset Successfully!
              </h2>
              <p style={{ fontSize: '14px', color: '#6b7280', marginBottom: '32px' }}>
                Your password has been changed. You can now log in with your new password.
              </p>

              <button
                type="button"
                onClick={onSuccess}
                style={{
                  width: '100%',
                  padding: '12px',
                  background: '#2563eb',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: 'DM Sans, sans-serif',
                  marginBottom: '12px',
                }}
                onMouseEnter={(e) => e.target.style.background = '#1d4ed8'}
                onMouseLeave={(e) => e.target.style.background = '#2563eb'}
              >
                Proceed to Sign In
              </button>

              <button
                type="button"
                onClick={onSuccess}
                style={{
                  width: '100%',
                  padding: '12px',
                  background: '#f3f4f6',
                  color: '#374151',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '14px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  fontFamily: 'DM Sans, sans-serif',
                }}
                onMouseEnter={(e) => e.target.style.background = '#e5e7eb'}
                onMouseLeave={(e) => e.target.style.background = '#f3f4f6'}
              >
                Close
              </button>
            </div>
          </>
        )}
      </>
    );
  };

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    setForgotError('');
    setForgotMessage('');

    if (!forgotEmail.trim()) {
      setForgotError('Please enter your email address.');
      return;
    }

    setForgotLoading(true);
    try {
      const res = await fetch(`${API_URL}/user/forgot-password`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email: forgotEmail.trim() }),
      });


      const data = await res.json();

      if (res.ok) {
          setForgotError('');
        setShowCodeEntry(true);
        return;
      }

      setForgotError(data.message || 'Unable to process forgot password request.');
    } catch {
      setForgotError('Unable to connect to the server. Please try again.');
    } finally {
      setForgotLoading(false);
    }
  };

  return (
    <div className="ulog-root">

      {/* ── Left — Decorative Panel ── */}
      <div className="ulog-left">
        <div className="ulog-left__bg" />
        <div className="ulog-left__content">

          {/* Seal trio */}
          <div className="ulog-seals">
            <div className="ulog-seal-item">
              <img src={olongapologo} alt="Olongapo" />
              <p>Lungsod ng Olongapo</p>
            </div>
            <div className="ulog-seal-item ulog-seal-item--center">
              <img src={newcablogo} alt="New Cabalan" />
              <p>Barangay New Cabalan</p>
            </div>
            <div className="ulog-seal-item">
              <img src={bagongpilipinaslogo} alt="Bagong Pilipinas" />
              <p>Bagong Pilipinas</p>
            </div>
          </div>

          {/* Heading */}
          <div className="ulog-left__text">
            <p className="ulog-left__eyebrow">NCESS · Resident Login</p>
            <div className="ulog-left__title-block">
              <h2 className="ulog-left__title">NCESS</h2>
              <p className="ulog-left__subtitle">New Cabalan E-Service System</p>
            </div>
            <p className="ulog-left__desc">Sign in to access barangay services, track complaints, and stay connected with your local government.</p>
          </div>

          {/* Feature pills with sidebar SVG icons */}
          <ul className="ulog-features">
            {FEATURES.map(f => (
              <li key={f.label} className="ulog-feature">
                <span className="ulog-feature__icon">{f.svg}</span>
                <span className="ulog-feature__label">{f.label}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* ── Right — Form ── */}
      <div className="ulog-right">
        <div className="ulog-form-wrap">

          {/* Brand */}
          <div className="ulog-brand">
            <img src={newcablogo} alt="New Cabalan seal" className="ulog-brand__seal" />
            <div className="ulog-brand__text">
              <p className="ulog-brand__name">NCESS</p>
              <p className="ulog-brand__sub">New Cabalan E-Service System</p>
            </div>
          </div>

          <div className="ulog-head">
            <h1>Resident Portal</h1>
            <p>Sign in to your resident account to access barangay services.</p>
          </div>

          {/* Generic error */}
          {error && (
            <div className="ulog-error">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="8" x2="12" y2="12"/>
                <circle cx="12" cy="16" r=".5" fill="currentColor"/>
              </svg>
              {error}
            </div>
          )}

          {/* Pending banner */}
          {statusBanner?.type === 'pending' && (
            <div className="ulog-status-banner ulog-status-banner--pending">
              <div className="ulog-status-banner__icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/>
                  <polyline points="12 6 12 12 16 14"/>
                </svg>
              </div>
              <div className="ulog-status-banner__body">
                <p className="ulog-status-banner__title">Account Pending Approval</p>
                <p className="ulog-status-banner__desc">{statusBanner.message}</p>
              </div>
            </div>
          )}

          {/* Rejected banner */}
          {statusBanner?.type === 'denied' && (
            <div className="ulog-status-banner ulog-status-banner--rejected">              <div className="ulog-status-banner__icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="15" y1="9" x2="9" y2="15"/>
                  <line x1="9" y1="9" x2="15" y2="15"/>
                </svg>
              </div>
              <div className="ulog-status-banner__body">
                <p className="ulog-status-banner__title">Registration Denied</p>
                <p className="ulog-status-banner__desc">{statusBanner.message}</p>
                <a href="/signup" className="ulog-status-banner__link">Register again →</a>
              </div>
            </div>
          )}

          <form className="ulog-form" onSubmit={handleSubmit} noValidate>
            <div className="ulog-field">
              <label htmlFor="email">Email Address</label>
              <div className="ulog-input-wrap">
                <span className="ulog-input-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                    <polyline points="22 6 12 13 2 6"/>
                  </svg>
                </span>
                <input id="email" type="email" placeholder="your@email.com"
                  value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" />
              </div>
            </div>

            <div className="ulog-field">
              <div className="ulog-field__label-row">
                <label htmlFor="password">Password</label>
                <button type="button" className="ulog-forgot" onClick={(e) => { e.preventDefault(); setShowForgotPw(true); }}>Forgot password?</button>
              </div>
              <div className="ulog-input-wrap">
                <span className="ulog-input-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="11" width="18" height="11" rx="2"/>
                    <path d="M7 11V7a5 5 0 0110 0v4"/>
                  </svg>
                </span>
                <input id="password" type={showPw ? 'text' : 'password'} placeholder="••••••••"
                  value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" />
                <button type="button" className="ulog-pw-toggle" onClick={() => setShowPw(!showPw)}>
                  {showPw ? (
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
                  )}
                </button>
              </div>
            </div>

            <div className="ulog-remember">
              <button type="button"
                className={`ulog-checkbox${remember ? ' ulog-checkbox--checked' : ''}`}
                onClick={() => setRemember(!remember)} role="checkbox">
                {remember && <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M20 6L9 17l-5-5"/></svg>}
              </button>
              <span>Keep me signed in</span>
            </div>

            <button type="submit"
              className={`ulog-submit${loading ? ' ulog-submit--loading' : ''}`}
              disabled={loading}>
              {loading ? (
                <><span className="ulog-spinner"/>Signing in...</>
              ) : (
                <>Sign In <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
                </svg></>
              )}
            </button>
          </form>

          <div className="ulog-divider"><span>Don't have an account?</span></div>

          <a href="/usersignup" className="ulog-signup-link">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
              <circle cx="8.5" cy="7" r="4"/>
              <line x1="20" y1="8" x2="20" y2="14"/>
              <line x1="23" y1="11" x2="17" y2="11"/>
            </svg>
            Create an Account
          </a>

          <p className="ulog-footer">© 2026 New Cabalan E-Service System (NCESS)</p>
        </div>
      </div>

      {/* ── Forgot Password Modal ── */}
      {showForgotPw && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
        }} onClick={() => { setShowForgotPw(false); setShowCodeEntry(false); setResetCode(''); }}>
          <div style={{
            background: '#fff',
            borderRadius: '12px',
            padding: '32px',
            maxWidth: '420px',
            width: '90%',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
          }} onClick={e => e.stopPropagation()}>
            {!showCodeEntry ? (
              <>
                <h2 style={{ fontSize: '20px', fontWeight: 600, marginBottom: '8px', color: '#1f2937' }}>
                  Reset Your Password
                </h2>
                <p style={{ fontSize: '14px', color: '#6b7280', marginBottom: '24px' }}>
                  Enter your email address and we'll send you a reset code.
                </p>

                {forgotError && (
                  <div style={{
                    padding: '12px',
                    background: '#fee2e2',
                    border: '1px solid #fecaca',
                    borderRadius: '6px',
                    color: '#dc2626',
                    fontSize: '13px',
                    marginBottom: '16px',
                  }}>
                    {forgotError}
                  </div>
                )}

                <form onSubmit={handleForgotPassword} noValidate>
                  <div style={{ marginBottom: '20px' }}>
                    <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '8px' }}>
                      Email Address
                    </label>
                    <input
                      type="email"
                      placeholder="your@email.com"
                      value={forgotEmail}
                      onChange={e => setForgotEmail(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        border: '1px solid #d1d5db',
                        borderRadius: '6px',
                        fontSize: '14px',
                        fontFamily: 'DM Sans, sans-serif',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={forgotLoading}
                    style={{
                      width: '100%',
                      padding: '10px',
                      background: forgotLoading ? '#d1d5db' : '#2563eb',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '6px',
                      fontSize: '14px',
                      fontWeight: 600,
                      cursor: forgotLoading ? 'not-allowed' : 'pointer',
                      fontFamily: 'DM Sans, sans-serif',
                      transition: 'background 0.2s ease',
                      marginBottom: '12px',
                    }}
                    onMouseEnter={(e) => !forgotLoading && (e.target.style.background = '#1d4ed8')}
                    onMouseLeave={(e) => !forgotLoading && (e.target.style.background = '#2563eb')}
                  >
                    {forgotLoading ? 'Sending...' : 'Send Reset Code'}
                  </button>

                  <button
                    type="button"
                    onClick={() => { setShowForgotPw(false); setForgotEmail(''); setForgotError(''); setForgotMessage(''); }}
                    style={{
                      width: '100%',
                      padding: '10px',
                      background: '#f3f4f6',
                      color: '#374151',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '14px',
                      fontWeight: 500,
                      cursor: 'pointer',
                      fontFamily: 'DM Sans, sans-serif',
                    }}
                    onMouseEnter={(e) => e.target.style.background = '#e5e7eb'}
                    onMouseLeave={(e) => e.target.style.background = '#f3f4f6'}
                  >
                    Cancel
                  </button>
                </form>
              </>
            ) : (
              <ForgotPasswordCodeEntry 
                email={forgotEmail}
                onSuccess={() => { setShowForgotPw(false); setShowCodeEntry(false); setResetCode(''); setForgotEmail(''); }}
                onBack={() => { setShowCodeEntry(false); setResetCode(''); setForgotError(''); setForgotMessage(''); }}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}