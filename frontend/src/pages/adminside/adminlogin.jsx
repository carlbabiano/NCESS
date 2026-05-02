import { useState } from 'react';
const API_URL = import.meta.env.VITE_BACKEND_URL;
import './adminlogin.css';

import newcablogo from '../../assets/newcab.png';
import bagongpilipinaslogo from '../../assets/bagongpilipinas.png';
import olongapologo from '../../assets/lungsodngolongapo.png';

export default function AdminLogin() {
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [showPw,   setShowPw]   = useState(false);
  const [remember, setRemember] = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!email || !password) { setError('Please enter your email and password.'); return; }
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/adminlogin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const data = await res.json();
      if (res.ok) {
        const store = remember ? localStorage : sessionStorage;
        store.setItem('admin_token', data.token);
        store.setItem('admin', JSON.stringify(data.admin || { email }));
        window.location.href = '/admindashboard';
        return;
      }
      setError(data.message || 'Invalid credentials. Please try again.');
    } catch {
      setError('Unable to connect to the server. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="alog-root">

      {/* ── Left Panel ── */}
      <div className="alog-left">

        {/* Background decorative rings */}
        <div className="alog-bg-ring alog-bg-ring--1" />
        <div className="alog-bg-ring alog-bg-ring--2" />
        <div className="alog-bg-ring alog-bg-ring--3" />

        <div className="alog-left__inner">

          {/* Three Seals */}
          <div className="alog-seals">
            {/* Left seal — Lungsod ng Olongapo */}
            <div className="alog-seal alog-seal--side">
              <img src={olongapologo} alt="Lungsod ng Olongapo seal" />
              <p>Lungsod ng Olongapo</p>
            </div>

            {/* Center seal — Barangay New Cabalan (hero) */}
            <div className="alog-seal alog-seal--center">
              <div className="alog-seal__glow" />
              <img src={newcablogo} alt="Barangay New Cabalan seal" />
              <p>Barangay New Cabalan</p>
            </div>

            {/* Right seal — Bagong Pilipinas */}
            <div className="alog-seal alog-seal--side">
              <img src={bagongpilipinaslogo} alt="Bagong Pilipinas seal" />
              <p>Bagong Pilipinas</p>
            </div>
          </div>

          {/* Heading block */}
          <div className="alog-left__text">
            <p className="alog-left__eyebrow">Republic of the Philippines</p>
            <div className="alog-left__title-block">
              <h1 className="alog-left__title">NCESS</h1>
              <p className="alog-left__location">New Cabalan E-Service System</p>
            </div>
            <p className="alog-left__desc">
              Serving our community through transparent governance,
              efficient public service, and digital innovation.
            </p>
          </div>

          {/* Divider line */}
          <div className="alog-left__divider" />

          {/* Stats */}
          <div className="alog-stats">
            {[
              { value:'12,482', label:'Registered Residents' },
              { value:'98%',    label:'Complaint Resolution' },
              { value:'24/7',   label:'System Uptime'        },
            ].map(s => (
              <div className="alog-stat" key={s.label}>
                <p className="alog-stat__value">{s.value}</p>
                <p className="alog-stat__label">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Right Panel — Form ── */}
      <div className="alog-right">
        <div className="alog-form-wrap">

          {/* Mobile header */}
          <div className="alog-mobile-head">
            <img src={newcablogo} alt="seal" className="alog-mobile-seal" />
            <div>
              <p className="alog-mobile-title">NCESS</p>
              <p className="alog-mobile-sub">New Cabalan E-Service System</p>
            </div>
          </div>

          {/* Brand — mirrors ulog-brand */}
          <div className="alog-brand">
            <img src={newcablogo} alt="New Cabalan seal" className="alog-brand__seal" />
            <div className="alog-brand__text">
              <p className="alog-brand__name">NCESS</p>
              <p className="alog-brand__sub">New Cabalan E-Service System</p>
            </div>
          </div>

          {/* Head — mirrors ulog-head */}
          <div className="alog-head">
            <h2>Admin Portal</h2>
            <p>Sign in to your admin account to access the dashboard.</p>
          </div>

          {error && (
            <div className="alog-error">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/>
                <circle cx="12" cy="16" r=".5" fill="currentColor"/>
              </svg>
              {error}
            </div>
          )}

          <form className="alog-form" onSubmit={handleSubmit} noValidate>

            <div className="alog-field">
              <label htmlFor="email">Email Address</label>
              <div className="alog-input-wrap">
                <span className="alog-input-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                    <polyline points="22 6 12 13 2 6"/>
                  </svg>
                </span>
                <input
                  id="email" type="email"
                  placeholder="admin@newcabalan.gov.ph"
                  value={email} onChange={e => setEmail(e.target.value)}
                  autoComplete="email"
                />
              </div>
            </div>

            <div className="alog-field">
              <div className="alog-field__label-row">
                <label htmlFor="password">Password</label>
              </div>
              <div className="alog-input-wrap">
                <span className="alog-input-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                    <path d="M7 11V7a5 5 0 0110 0v4"/>
                  </svg>
                </span>
                <input
                  id="password" type={showPw ? 'text' : 'password'}
                  placeholder="••••••••••"
                  value={password} onChange={e => setPassword(e.target.value)}
                  autoComplete="current-password"
                />
                <button type="button" className="alog-pw-toggle" onClick={() => setShowPw(!showPw)}>
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

            <div className="alog-remember">
              <button
                type="button"
                className={`alog-checkbox${remember ? ' alog-checkbox--checked' : ''}`}
                onClick={() => setRemember(!remember)} role="checkbox" aria-checked={remember}
              >
                {remember && <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M20 6L9 17l-5-5"/></svg>}
              </button>
              <span className="alog-remember__label">Keep me signed in</span>
            </div>

            <button type="submit" className={`alog-submit${loading ? ' alog-submit--loading' : ''}`} disabled={loading}>
              {loading ? (
                <><span className="alog-spinner" />Signing in...</>
              ) : (
                <>
                  Sign In to Dashboard
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
                  </svg>
                </>
              )}
            </button>
          </form>

          <div className="alog-divider"><span>or</span></div>

          <a href="/userlogin" className="alog-resident-link">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
            </svg>
            Sign in as a Resident instead
          </a>

          <p className="alog-footer-note">
            © 2026 New Cabalan E-Service System (NCESS).<br/>
            Unauthorized access is strictly prohibited.
          </p>
        </div>
      </div>
    </div>
  );
}