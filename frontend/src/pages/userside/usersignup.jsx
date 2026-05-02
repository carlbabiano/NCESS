import { useState } from 'react';
import './usersignup.css';

import newcablogo          from '../../assets/newcab.png';
import bagongpilipinaslogo from '../../assets/bagongpilipinas.png';
import olongapologo        from '../../assets/lungsodngolongapo.png';

const API_URL = import.meta.env.VITE_BACKEND_URL;

const SEX          = ['Male', 'Female'];
const PUROKS       = ['Purok 1', 'Purok 2', 'Purok 3', 'Purok 4', 'Purok 5', 'Purok 6', 'Purok 7', 'Iram'];

const STEPS = ['Personal Info', 'Account Setup', 'Information Verification'];

// ── SVG helpers ──────────────────────────────────────────────────────────────
const ChevronR = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
  </svg>
);
const ChevronL = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
  </svg>
);
const CheckIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
    <path d="M20 6L9 17l-5-5"/>
  </svg>
);

export default function UserSignup() {
  const [step,    setStep]    = useState(0);
  const [loading, setLoading] = useState(false);
  const [done,    setDone]    = useState(false);

  // ── Step 0 — Personal Info ────────────────────────────────────────────────
  const [firstName,   setFirstName]   = useState('');
  const [middleName,  setMiddleName]  = useState('');
  const [lastName,    setLastName]    = useState('');
  const [bday,        setBday]        = useState('');
  const [bdayDisplay, setBdayDisplay] = useState('');

  const handleBdayChange = (e) => {
    const raw = e.target.value.replace(/\D/g, '').slice(0, 8);
    let formatted = '';
    if (raw.length <= 2)      formatted = raw;
    else if (raw.length <= 4) formatted = raw.slice(0,2) + '/' + raw.slice(2);
    else                      formatted = raw.slice(0,2) + '/' + raw.slice(2,4) + '/' + raw.slice(4);
    setBdayDisplay(formatted);
    if (raw.length === 8) {
      const mm = raw.slice(0,2), dd = raw.slice(2,4), yyyy = raw.slice(4);
      setBday(`${yyyy}-${mm}-${dd}`);
    } else {
      setBday('');
    }
  };

  const handleBdayKeyDown = (e) => {
    if (e.key === 'Backspace') {
      e.preventDefault();
      const raw = bdayDisplay.replace(/\D/g, '').slice(0, -1);
      let formatted = '';
      if (raw.length <= 2)      formatted = raw;
      else if (raw.length <= 4) formatted = raw.slice(0,2) + '/' + raw.slice(2);
      else                      formatted = raw.slice(0,2) + '/' + raw.slice(2,4) + '/' + raw.slice(4);
      setBdayDisplay(formatted);
      setBday('');
    }
  };

  const [sex,         setSex]         = useState('');
  const [contact,     setContact]     = useState('');
  const [homeAddress, setHomeAddress] = useState('');
  const [purok,       setPurok]       = useState('');

  // ── Step 1 — Account Setup ────────────────────────────────────────────────
  const [email,     setEmail]     = useState('');
  const [password,  setPassword]  = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [showPw,    setShowPw]    = useState(false);
  const [showCPw,   setShowCPw]   = useState(false);
  const [agree,     setAgree]     = useState(false);

  // ── Step 2 — Information Verification ─────────────────────────────────────
  const [validIdFile, setValidIdFile] = useState(null);
  const [validIdPreview, setValidIdPreview] = useState('');
  const [proofOfResidencyFile, setProofOfResidencyFile] = useState(null);
  const [proofOfResidencyPreview, setProofOfResidencyPreview] = useState('');

  const [errors, setErrors] = useState({});

  const pwStrength = password.length === 0 ? 0 : password.length < 6 ? 1 : password.length < 10 ? 2 : 3;
  const pwLabel    = ['', 'Weak', 'Fair', 'Strong'];
  const pwClass    = ['', 'su-pw--weak', 'su-pw--fair', 'su-pw--strong'];

  const validate = () => {
    const e = {};
    if (step === 0) {
      if (!firstName.trim())   e.firstName   = 'First name is required.';
      if (!lastName.trim())    e.lastName    = 'Last name is required.';
      if (!bday)               e.bday = 'Date of birth is required.';
      else if (bday > new Date().toISOString().slice(0, 10)) e.bday = 'Date of birth cannot be a future date.';
      else {
        const today = new Date(); const birth = new Date(bday);
        const age = today.getFullYear() - birth.getFullYear() -
          (today < new Date(today.getFullYear(), birth.getMonth(), birth.getDate()) ? 1 : 0);
        if (age < 18) e.bday = 'You must be at least 18 years old to register.';
      }
      if (!sex)                e.sex         = 'Sex is required.';
      if (!contact.trim()) {
        e.contact = 'Contact number is required.';
      } else if (!/^\d{11}$/.test(contact)) {
        e.contact = 'Contact number must be exactly 11 digits (numbers only).';
      }
      if (!homeAddress.trim()) e.homeAddress = 'Home address is required.';
      if (!purok)              e.purok       = 'Please select your Purok.';
    }
    if (step === 1) {
      if (!email.trim())          e.email     = 'Email address is required.';
      if (password.length < 8)    e.password  = 'Password must be at least 8 characters.';
      if (password !== confirmPw) e.confirmPw = 'Passwords do not match.';
      if (!agree)                 e.agree     = 'You must agree to the terms.';
    }
    if (step === 2) {
      if (!validIdFile) e.validIdFile = 'Valid ID is required.';
      if (!proofOfResidencyFile) e.proofOfResidencyFile = 'Proof of Residency is required.';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const next = () => { if (validate()) setStep(s => s + 1); };
  const back = () => { setErrors({}); setStep(s => s - 1); };

  // ── Step 1 Continue — validate + submit registration, then advance to verification ──
  const handleStep1Continue = async () => {
    if (!validate()) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/usersignup`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          firstName,
          middleName,
          lastName,
          birthdate:     bday,
          sex,
          contactNumber: contact,
          homeAddress,
          purok,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        // Registration succeeded — advance to information verification step
        setErrors({});
        setStep(2);
      } else {
        // Show the server error (e.g. "An account with this email already exists.") inline on step 1
        setErrors({ submit: data.message || 'Registration failed. Please try again.' });
      }
    } catch {
      setErrors({ submit: 'Unable to connect to the server. Please try again.' });
    } finally {
      setLoading(false);
    }
  };

  // ── Form submission ────────────────────────────────────────────────────────
  const handleSubmit = (e) => {
    if (step === 2) {
      handleStep2Submit(e);
    } else {
      e.preventDefault();
    }
  };

  // ── Step 2 Submit — upload documents through backend to Cloudinary ────────
  const handleStep2Submit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    setLoading(true);
    try {
      console.log("[Signup Step 2] Starting document upload", { hasValidIdFile: !!validIdFile, hasProofFile: !!proofOfResidencyFile });
      
      // Upload Valid ID through backend
      const validIdFormData = new FormData();
      validIdFormData.append('file', validIdFile);

      const validIdRes = await fetch(`${API_URL}/usersignup/upload-document`, {
        method: 'POST',
        body: validIdFormData,
      });
      const validIdData = await validIdRes.json();
      console.log("[Signup Step 2] Valid ID upload response:", { ok: validIdRes.ok, url: validIdData.url?.substring(0, 80) });
      if (!validIdRes.ok) throw new Error('Valid ID upload failed');

      // Upload Proof of Residency through backend
      const proofFormData = new FormData();
      proofFormData.append('file', proofOfResidencyFile);

      const proofRes = await fetch(`${API_URL}/usersignup/upload-document`, {
        method: 'POST',
        body: proofFormData,
      });
      const proofData = await proofRes.json();
      console.log("[Signup Step 2] Proof of Residency upload response:", { ok: proofRes.ok, url: proofData.url?.substring(0, 80) });
      if (!proofRes.ok) throw new Error('Proof of Residency upload failed');

      // Store document URLs with user account
      console.log("[Signup Step 2] Saving documents to user account", { email, hasValidId: !!validIdData.url, hasProof: !!proofData.url });
      const docsRes = await fetch(`${API_URL}/usersignup/documents/${email}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          validId: validIdData.url,
          proofOfResidency: proofData.url,
        }),
      });
      const docsData = await docsRes.json();
      console.log("[Signup Step 2] Documents saved response:", { ok: docsRes.ok, user: docsData.user });

      // Mark registration as complete
      setDone(true);
    } catch (err) {
      console.error('Document upload error:', err);
      setErrors({ submit: 'Failed to upload documents. Please try again.' });
    } finally {
      setLoading(false);
    }
  };

  // ── File handlers ──────────────────────────────────────────────────────────
  const handleValidIdChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setValidIdFile(file);
      const reader = new FileReader();
      reader.onload = (event) => setValidIdPreview(event.target?.result || '');
      reader.readAsDataURL(file);
      setErrors(prev => ({ ...prev, validIdFile: '' }));
    }
  };

  const handleProofOfResidencyChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setProofOfResidencyFile(file);
      const reader = new FileReader();
      reader.onload = (event) => setProofOfResidencyPreview(event.target?.result || '');
      reader.readAsDataURL(file);
      setErrors(prev => ({ ...prev, proofOfResidencyFile: '' }));
    }
  };

  // ── Done screen ───────────────────────────────────────────────────────────
  if (done) return (
    <div className="su-root su-root--done">
      <div className="su-done">
        <div className="su-done__icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <circle cx="12" cy="12" r="10"/><path d="M9 12l2 2 4-4"/>
          </svg>
        </div>
        <img src={newcablogo} alt="seal" className="su-done__seal"/>
        <h2>Registration Submitted!</h2>
        <p>Your account is pending verification by the barangay office. You will receive an email once your account has been approved.</p>
        <a href="/userlogin" className="su-done__btn">Proceed to Sign In</a>
      </div>
    </div>
  );

  // ── Eye toggle ────────────────────────────────────────────────────────────
  const EyeOpen = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  );
  const EyeOff = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/>
      <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/>
      <line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
  );

  return (
    <div className="su-root">

      {/* ── Left — Decorative ── */}
      <div className="su-left">
        <div className="su-left__bg"/>
        <div className="su-left__content">
          <div className="su-seals">
            <div className="su-seal-item">
              <img src={olongapologo} alt="Lungsod ng Olongapo"/>
              <p>Lungsod ng Olongapo</p>
            </div>
            <div className="su-seal-item su-seal-item--center">
              <img src={newcablogo} alt="Barangay New Cabalan"/>
              <p>Barangay New Cabalan</p>
            </div>
            <div className="su-seal-item">
              <img src={bagongpilipinaslogo} alt="Bagong Pilipinas"/>
              <p>Bagong Pilipinas</p>
            </div>
          </div>

          <div className="su-left__text">
            <p className="su-left__eyebrow">NCESS · Resident Registration</p>
            <div className="su-left__title-block">
              <h2 className="su-left__title">NCESS</h2>
              <p className="su-left__subtitle">New Cabalan E-Service System</p>
            </div>
            <p className="su-left__desc">Register to access all barangay services online — fast, easy, and paperless.</p>
          </div>

          <ul className="su-features">
            {[
              {
                label: 'Book Appointments',
                svg: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
              },
              {
                label: 'Read Announcements',
                svg: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 11l19-9-9 19-2-8-8-2z"/></svg>,
              },
              {
                label: 'File Complaints',
                svg: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>,
              },
              {
                label: 'Request Documents',
                svg: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>,
              },
              {
                label: 'Emergency Hotline',
                svg: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 5a2 2 0 012-2h3l2 4-2.5 1.5a11 11 0 005 5L14 11l4 2v3a2 2 0 01-2 2A16 16 0 013 5z"/></svg>,
              },
              {
                label: 'Manage Profile',
                svg: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
              },
            ].map(f => (
              <li key={f.label} className="su-feature">
                <span className="su-feature__icon">{f.svg}</span>
                <span className="su-feature__label">{f.label}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* ── Right — Form ── */}
      <div className="su-right">
        <div className="su-form-wrap">

          {/* Mobile brand */}
          <div className="su-mobile-brand">
            <img src={newcablogo} alt="seal" className="su-mobile-seal"/>
            <div>
              <p className="su-mobile-title">NCESS</p>
              <p className="su-mobile-sub">New Cabalan E-Service System</p>
            </div>
          </div>

          <div className="su-form-head">
            <h1>Create Account</h1>
            <p>Fill in the form to register as a resident.</p>
          </div>

          {/* Step indicators */}
          <div className="su-steps">
            {STEPS.map((label, i) => (
              <div key={label} className={`su-step${i === step ? ' su-step--active' : i < step ? ' su-step--done' : ''}`}>
                <div className="su-step__circle">
                  {i < step ? <CheckIcon/> : <span>{i + 1}</span>}
                </div>
                <span className="su-step__label">{label}</span>
                {i < STEPS.length - 1 && (
                  <div className={`su-step__line${i < step ? ' su-step__line--done' : ''}`}/>
                )}
              </div>
            ))}
          </div>

          <form className="su-form" onSubmit={handleSubmit} noValidate>

            {/* ══════════════════════════════════════
                Step 0 — Personal Info
            ══════════════════════════════════════ */}
            {step === 0 && (
              <div className="su-fields">

                {/* Row: First / Middle */}
                <div className="su-row-2 su-row-align">
                  <div className="su-field">
                    <label>First Name</label>
                    <input type="text" placeholder="Maria" value={firstName} onChange={e => setFirstName(e.target.value)} className={errors.firstName ? 'su-input--error' : ''}/>
                    {errors.firstName && <p className="su-field-error">{errors.firstName}</p>}
                  </div>
                  <div className="su-field su-field-middle">
                    <label>Middle Name <span className="su-optional">(optional)</span></label>
                    <input type="text" placeholder="Santos" value={middleName} onChange={e => setMiddleName(e.target.value)}/>
                  </div>
                </div>
                {/* Row: Last Name left-aligned below */}
                <div className="su-row-left">
                  <div className="su-field">
                    <label>Last Name</label>
                    <input type="text" placeholder="Dela Cruz" value={lastName} onChange={e => setLastName(e.target.value)} className={errors.lastName ? 'su-input--error' : ''}/>
                    {errors.lastName && <p className="su-field-error">{errors.lastName}</p>}
                  </div>
                </div>

                {/* Row: Date of Birth / Sex */}
                <div className="su-row-2">
                  <div className="su-field">
                    <label>Date of Birth</label>
                    <div className="su-input-wrap">
                      <input
                        type="text"
                        placeholder="MM/DD/YYYY"
                        maxLength={10}
                        value={bdayDisplay}
                        onChange={handleBdayChange}
                        onKeyDown={handleBdayKeyDown}
                        className={`su-bday-input${errors.bday ? ' su-input--error' : ''}`}
                      />
                      <input
                        type="date"
                        max={new Date().toISOString().slice(0, 10)}
                        value={bday}
                        onChange={e => {
                          const v = e.target.value; // YYYY-MM-DD
                          setBday(v);
                          if (v) {
                            const [yyyy, mm, dd] = v.split('-');
                            setBdayDisplay(`${mm}/${dd}/${yyyy}`);
                          }
                        }}
                        style={{ position:'absolute', right:8, width:24, height:24, opacity:0, cursor:'pointer' }}
                        tabIndex={-1}
                      />
                      <span className="su-pw-toggle" style={{ pointerEvents:'none', right:8 }}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/>
                          <line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                        </svg>
                      </span>
                    </div>
                    {errors.bday && <p className="su-field-error">{errors.bday}</p>}
                  </div>
                  <div className="su-field">
                    <label>Sex</label>
                    <select value={sex} onChange={e => setSex(e.target.value)} className={errors.sex ? 'su-input--error' : ''}>
                      <option value="">Select...</option>
                      {SEX.map(s => <option key={s}>{s}</option>)}
                    </select>
                    {errors.sex && <p className="su-field-error">{errors.sex}</p>}
                  </div>
                </div>

                {/* Contact number */}
                <div className="su-field">
                  <label>Contact Number</label>
                  <div className="su-input-wrap">
                    <span className="su-input-icon">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M3 5a2 2 0 012-2h3l2 4-2 2a13 13 0 006 6l2-2 4 2v3a2 2 0 01-2 2C10.4 20 4 13.6 4 5.5"/>
                      </svg>
                    </span>
                    <input type="tel" placeholder="09XX XXX XXXX" value={contact} onChange={e => setContact(e.target.value)} className={errors.contact ? 'su-input--error' : ''}/>
                  </div>
                  {errors.contact && <p className="su-field-error">{errors.contact}</p>}
                </div>

                {/* Home Address */}
                <div className="su-field">
                  <label>Home Address</label>
                  <input type="text" placeholder="e.g. 12 Rizal Street" value={homeAddress} onChange={e => setHomeAddress(e.target.value)} className={errors.homeAddress ? 'su-input--error' : ''}/>
                  {errors.homeAddress && <p className="su-field-error">{errors.homeAddress}</p>}
                </div>

                {/* Purok */}
                <div className="su-field">
                  <label>Purok</label>
                  <select value={purok} onChange={e => setPurok(e.target.value)} className={errors.purok ? 'su-input--error' : ''}>
                    <option value="">Select Purok...</option>
                    {PUROKS.map(p => <option key={p}>{p}</option>)}
                  </select>
                  {errors.purok && <p className="su-field-error">{errors.purok}</p>}
                </div>

              </div>
            )}

            {/* ══════════════════════════════════════
                Step 1 — Account Setup
            ══════════════════════════════════════ */}
            {step === 1 && (
              <div className="su-fields">
                <div className="su-field">
                  <label>Email Address</label>
                  <div className="su-input-wrap">
                    <span className="su-input-icon">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                        <polyline points="22 6 12 13 2 6"/>
                      </svg>
                    </span>
                    <input type="email" placeholder="your@email.com" value={email} onChange={e => setEmail(e.target.value)} className={errors.email ? 'su-input--error' : ''}/>
                  </div>
                  {errors.email && <p className="su-field-error">{errors.email}</p>}
                </div>

                <div className="su-field">
                  <label>Password</label>
                  <div className="su-input-wrap">
                    <span className="su-input-icon">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/>
                      </svg>
                    </span>
                    <input type={showPw ? 'text' : 'password'} placeholder="Min. 8 characters" value={password} onChange={e => setPassword(e.target.value)} className={errors.password ? 'su-input--error' : ''}/>
                    <button type="button" className="su-pw-toggle" onClick={() => setShowPw(!showPw)}>
                      {showPw ? <EyeOff/> : <EyeOpen/>}
                    </button>
                  </div>
                  {password.length > 0 && (
                    <div className="su-pw-strength">
                      <div className="su-pw-bars">
                        {[1,2,3].map(l => (
                          <span key={l} className={`su-pw-bar${pwStrength >= l ? ' ' + pwClass[pwStrength] : ''}`}/>
                        ))}
                      </div>
                      <span className={`su-pw-label ${pwClass[pwStrength]}`}>{pwLabel[pwStrength]}</span>
                    </div>
                  )}
                  {errors.password && <p className="su-field-error">{errors.password}</p>}
                </div>

                <div className="su-field">
                  <label>Confirm Password</label>
                  <div className="su-input-wrap">
                    <span className="su-input-icon">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/>
                      </svg>
                    </span>
                    <input type={showCPw ? 'text' : 'password'} placeholder="Re-enter password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} className={errors.confirmPw ? 'su-input--error' : ''}/>
                    <button type="button" className="su-pw-toggle" onClick={() => setShowCPw(!showCPw)}>
                      {showCPw ? <EyeOff/> : <EyeOpen/>}
                    </button>
                  </div>
                  {errors.confirmPw && <p className="su-field-error">{errors.confirmPw}</p>}
                </div>

                <div className="su-agree">
                  <button
                    type="button"
                    className={`su-checkbox${agree ? ' su-checkbox--checked' : ''}`}
                    onClick={() => setAgree(!agree)}
                    role="checkbox"
                    aria-checked={agree}
                  >
                    {agree && <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M20 6L9 17l-5-5"/></svg>}
                  </button>
                  <span>I agree to the <a href="#">Terms of Service</a> and <a href="#">Privacy Policy</a> of the NCESS — New Cabalan E-Service System.</span>
                </div>
                {errors.agree && <p className="su-field-error">{errors.agree}</p>}
              </div>
            )}

            {/* ══════════════════════════════════════
                Step 2 — Information Verification
            ══════════════════════════════════════ */}
            {step === 2 && (
              <div className="su-fields">
                <p style={{ fontSize: 13, color: '#666', marginBottom: 16, textAlign: 'center' }}>
                  Please upload the required documents for verification. Our team will review and approve your account within 1–3 business days.
                </p>

                {/* Valid ID Upload */}
                <div className="su-field">
                  <label>Valid ID <span style={{ color: '#dc2626' }}>*</span></label>
                  <p style={{ fontSize: 12, color: '#666', margin: '4px 0 8px' }}>
                    Upload a clear photo/scan of a valid government-issued ID or school ID
                  </p>
                  <div className="su-file-upload">
                    <input
                      type="file"
                      id="validId"
                      accept="image/*,.pdf"
                      onChange={handleValidIdChange}
                      style={{ display: 'none' }}
                      disabled={loading}
                    />
                    {!validIdPreview ? (
                      <label htmlFor="validId" className="su-file-label" style={{ cursor: loading ? 'not-allowed' : 'pointer' }}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 32, height: 32, marginBottom: 8 }}>
                          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                        </svg>
                        <p style={{ margin: 0, fontWeight: 600, color: '#2563eb' }}>Click to upload</p>
                        <p style={{ margin: 0, fontSize: 12, color: '#666' }}>or drag and drop</p>
                        <p style={{ margin: 0, fontSize: 11, color: '#999', marginTop: 4 }}>PNG, JPG, GIF or PDF (Max. 5MB)</p>
                      </label>
                    ) : (
                      <div className="su-file-preview">
                        {validIdFile?.type.startsWith('image/') ? (
                          <img src={validIdPreview} alt="Valid ID" style={{ maxWidth: '100%', maxHeight: 200, borderRadius: 8 }}/>
                        ) : (
                          <div style={{ padding: 16, textAlign: 'center' }}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2" style={{ width: 32, height: 32, margin: '0 auto 8px' }}>
                              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/>
                            </svg>
                            <p style={{ margin: 0, fontSize: 12, color: '#2563eb', fontWeight: 600 }}>{validIdFile?.name}</p>
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            setValidIdFile(null);
                            setValidIdPreview('');
                          }}
                          style={{ marginTop: 8, padding: '4px 12px', fontSize: 12, cursor: 'pointer', background: '#fee2e2', color: '#991b1b', border: 'none', borderRadius: 4 }}
                        >
                          Remove
                        </button>
                      </div>
                    )}
                  </div>
                  {errors.validIdFile && <p className="su-field-error">{errors.validIdFile}</p>}
                </div>

                {/* Proof of Residency Upload */}
                <div className="su-field">
                  <label>Proof of Residency <span style={{ color: '#dc2626' }}>*</span></label>
                  <p style={{ fontSize: 12, color: '#666', margin: '4px 0 8px' }}>
                    Upload a clear photo/scan of utility bill, ID with address, or barangay certificate
                  </p>
                  <div className="su-file-upload">
                    <input
                      type="file"
                      id="proofOfResidency"
                      accept="image/*,.pdf"
                      onChange={handleProofOfResidencyChange}
                      style={{ display: 'none' }}
                      disabled={loading}
                    />
                    {!proofOfResidencyPreview ? (
                      <label htmlFor="proofOfResidency" className="su-file-label" style={{ cursor: loading ? 'not-allowed' : 'pointer' }}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 32, height: 32, marginBottom: 8 }}>
                          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                        </svg>
                        <p style={{ margin: 0, fontWeight: 600, color: '#2563eb' }}>Click to upload</p>
                        <p style={{ margin: 0, fontSize: 12, color: '#666' }}>or drag and drop</p>
                        <p style={{ margin: 0, fontSize: 11, color: '#999', marginTop: 4 }}>PNG, JPG, GIF or PDF (Max. 5MB)</p>
                      </label>
                    ) : (
                      <div className="su-file-preview">
                        {proofOfResidencyFile?.type.startsWith('image/') ? (
                          <img src={proofOfResidencyPreview} alt="Proof of Residency" style={{ maxWidth: '100%', maxHeight: 200, borderRadius: 8 }}/>
                        ) : (
                          <div style={{ padding: 16, textAlign: 'center' }}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2" style={{ width: 32, height: 32, margin: '0 auto 8px' }}>
                              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/>
                            </svg>
                            <p style={{ margin: 0, fontSize: 12, color: '#2563eb', fontWeight: 600 }}>{proofOfResidencyFile?.name}</p>
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            setProofOfResidencyFile(null);
                            setProofOfResidencyPreview('');
                          }}
                          style={{ marginTop: 8, padding: '4px 12px', fontSize: 12, cursor: 'pointer', background: '#fee2e2', color: '#991b1b', border: 'none', borderRadius: 4 }}
                        >
                          Remove
                        </button>
                      </div>
                    )}
                  </div>
                  {errors.proofOfResidencyFile && <p className="su-field-error">{errors.proofOfResidencyFile}</p>}
                </div>

                <div className="su-info-box" style={{ flexDirection: 'column', gap: 12, marginTop: 16 }}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2" style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }}>
                      <circle cx="12" cy="12" r="10"/><path d="M9 12l2 2 4-4"/>
                    </svg>
                    <p style={{ fontWeight: 700, color: '#047857', margin: 0, fontSize: 13 }}>What Happens Next</p>
                  </div>
                  <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <li style={{ fontSize: 12.5, color: '#047857', fontWeight: 600 }}>
                      Documents submitted for verification
                      <p style={{ fontWeight: 400, color: '#059669', margin: '2px 0 0', fontSize: 12 }}>Our team will review your documents within 1–3 business days.</p>
                    </li>
                    <li style={{ fontSize: 12.5, color: '#047857', fontWeight: 600 }}>
                      Account approval notification
                      <p style={{ fontWeight: 400, color: '#059669', margin: '2px 0 0', fontSize: 12 }}>You'll receive an email confirmation once your account is approved.</p>
                    </li>
                    <li style={{ fontSize: 12.5, color: '#047857', fontWeight: 600 }}>
                      Full access to services
                      <p style={{ fontWeight: 400, color: '#059669', margin: '2px 0 0', fontSize: 12 }}>Sign in and start using NCESS services immediately after approval.</p>
                    </li>
                  </ul>
                </div>
              </div>
            )}

            {/* Server/submit error */}
            {errors.submit && (
              <div className="su-submit-error">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="12" y1="8" x2="12" y2="12"/>
                  <circle cx="12" cy="16" r=".5" fill="currentColor"/>
                </svg>
                {errors.submit}
              </div>
            )}

            {/* Navigation */}
            <div className="su-nav">
              {step > 0 && step < 2 && (
                <button type="button" className="su-back-btn" onClick={back} disabled={loading}>
                  <ChevronL/> Back
                </button>
              )}
              {step === 2 && (
                <button type="button" className="su-back-btn" onClick={back} disabled={loading}>
                  <ChevronL/> Back
                </button>
              )}
              {step === 0 && (
                <button type="button" className="su-next-btn" onClick={next}>
                  Continue <ChevronR/>
                </button>
              )}
              {step === 1 && (
                <button
                  type="button"
                  className={`su-next-btn${loading ? ' su-next-btn--loading' : ''}`}
                  disabled={loading}
                  onClick={handleStep1Continue}
                >
                  {loading
                    ? <><span className="su-spinner"/>Checking…</>
                    : <>Continue <ChevronR/></>
                  }
                </button>
              )}
              {step === 2 && (
                <button
                  type="submit"
                  className={`su-next-btn${loading ? ' su-next-btn--loading' : ''}`}
                  disabled={loading}
                >
                  {loading
                    ? <><span className="su-spinner"/>Uploading…</>
                    : <>Submit Documents <ChevronR/></>
                  }
                </button>
              )}
            </div>
          </form>

          <p className="su-login-link">
            Already have an account? <a href="/userlogin">Sign in →</a>
          </p>

        </div>
      </div>
    </div>
  );
}