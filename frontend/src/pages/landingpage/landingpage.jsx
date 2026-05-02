import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './landingpage.css';

import newcablogo          from '../../assets/newcab.png';
import bagongpilipinaslogo from '../../assets/bagongpilipinas.png';
import olongapologo        from '../../assets/lungsodngolongapo.png';

/* ─── Legal Content ─────────────────────────────────────── */
const PRIVACY_POLICY = {
  title: 'Privacy Policy',
  intro: 'This Privacy Policy explains how the system collects, uses, and protects user information in compliance with the Data Privacy Act of 2012.',
  sections: [
    {
      heading: '1. Information We Collect',
      body: 'We may collect personal information such as your name, contact details, and any data submitted through complaints, appointments, and other system features.',
    },
    {
      heading: '2. Purpose of Data Collection',
      body: 'Your information is collected to:',
      list: ['Process complaints and requests', 'Manage appointments', 'Send announcements and notifications', 'Improve barangay services'],
    },
    {
      heading: '3. Data Protection',
      body: 'We implement appropriate security measures to protect your personal data from unauthorized access, disclosure, or misuse. Access is limited to authorized barangay officials only.',
    },
    {
      heading: '4. Data Sharing',
      body: 'Your personal information will not be shared with third parties unless required by law or necessary for official barangay transactions.',
    },
    {
      heading: '5. User Rights',
      body: 'You have the right to:',
      list: ['Access your personal data', 'Request corrections to inaccurate information', 'Request deletion of your data, subject to legal limitations'],
    },
    {
      heading: '6. Data Retention',
      body: 'Personal data will be stored only for as long as necessary to fulfill its purpose or as required by law.',
    },
    {
      heading: '7. Updates to This Policy',
      body: 'This policy may be updated from time to time. Users will be notified of significant changes through the system.',
    },
  ],
};

const TERMS_OF_USE = {
  title: 'Terms of Use',
  intro: 'By using this system, you agree to the following terms and conditions:',
  sections: [
    {
      heading: '1. Proper Use',
      body: 'Users must provide accurate and truthful information when using the system. Any misuse, including false complaints or misleading data, is strictly prohibited.',
    },
    {
      heading: '2. User Responsibility',
      body: 'You are responsible for maintaining the confidentiality of your account and any activities conducted under it.',
    },
    {
      heading: '3. System Access',
      body: 'The system is intended for official barangay-related transactions only. Unauthorized access or attempts to disrupt the system are prohibited.',
    },
    {
      heading: '4. Complaint Submission',
      body: 'All complaints must be submitted in good faith. The barangay reserves the right to review, validate, and act upon each report.',
    },
    {
      heading: '5. Appointment Scheduling',
      body: 'Users must follow scheduled appointments. Repeated no-shows may result in restrictions.',
    },
    {
      heading: '6. Limitation of Liability',
      body: 'The barangay is not liable for delays or issues caused by system downtime, technical errors, or incorrect information provided by users.',
    },
    {
      heading: '7. Changes to Terms',
      body: 'These terms may be updated at any time. Continued use of the system means you accept any changes.',
    },
  ],
};

/* ─── Data ──────────────────────────────────────────────── */
const PROBLEMS = [
  'Delayed information dissemination via manual posting and word-of-mouth',
  'Unorganized complaint tracking with no accountability trail',
  'Difficulty managing schedules and activity coordination',
  'No centralized emergency reporting — slow response times',
  'Residents must visit the barangay hall for every document request',
];

const SOLUTIONS = [
  'Real-time push notifications for announcements, reaching residents instantly',
  'Digital complaint portal with live status tracking and admin response system',
  'Integrated appointment scheduler with automated confirmations via QR code',
  'One-tap emergency alerts dispatched directly to barangay officials',
  'Online document requests with cloud-based processing and QR verification',
];

const FEATURES = [
  {
    highlight: true,
    title: 'Real-Time Announcements',
    desc: 'Barangay officials publish updates instantly. Residents receive push notifications the moment something goes live — no more missed memos.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 11l19-9-9 19-2-8-8-2z"/>
      </svg>
    ),
  },
  {
    title: 'QR Code Integration',
    desc: 'QR codes are used for secure identity verification and faster transactions within the system, improving efficiency and reducing manual processes.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
        <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
      </svg>
    ),
  },
  {
    title: 'Community News Feed',
    desc: 'Stay updated with a centralized feed of announcements, events, and important notices.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
    ),
  },
  {
    title: 'Appointment Booking',
    desc: 'Schedule visits to the barangay hall in advance to avoid long queues and ensure a smoother, more organized process.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2"/>
        <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>
        <line x1="3" y1="10" x2="21" y2="10"/>
      </svg>
    ),
  },
  {
    title: 'Complaint Filing',
    desc: 'Submit and track complaints online with full status visibility. Each case is logged, assigned, and resolved with a transparent audit trail.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
      </svg>
    ),
  },
];

const STEPS = [
  { num: '01', title: 'Register Your Account', desc: 'Create a resident account using your verified personal information and barangay ID.' },
  { num: '02', title: 'Access the Portal',      desc: 'Log in from any device — desktop, tablet, or mobile — 24/7 from anywhere.' },
  { num: '03', title: 'Submit Your Request',    desc: 'Book appointments, file complaints, request documents, or contact the barangay in seconds.' },
  { num: '04', title: 'Get Real-Time Updates',  desc: 'Receive instant notifications as officials respond, process your request, and received new announcements.' },
];

const NOTIFICATIONS = [
  { dot: 'blue',  title: ' New Announcement Posted',   desc: 'Community clean-up drive this Saturday, 7AM at Purok 4. All residents are encouraged to participate.', time: 'Just now' },
  { dot: 'green', title: ' Complaint Resolved',         desc: 'Your complaint ID #6 regarding street lighting has been marked as resolved.',                   time: '3 min ago' },
  { dot: 'amber', title: ' Appointment Confirmed',      desc: 'Your barangay clearance appointment is confirmed for April 8 at 9:00 AM. Your QR code is ready.',     time: '12 min ago' },
  { dot: 'red',   title: ' New Chat from Barangay Support', desc: 'You have received a new message from Barangay Support. Please check your inbox for details.', time: '1 hr ago' },
];

const NOTIF_FEATURES = [
  {
    color: 'rgba(37,99,235,0.12)', borderColor: 'rgba(37,99,235,0.2)',
    iconColor: '#3b82f6',
    icon: <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0"/></svg>,
    title: 'Push Notifications',
    desc: 'Announcements and status updates reach your device the moment they\'re published — no polling required.',
  },
  {
    color: 'rgba(74,222,128,0.1)', borderColor: 'rgba(74,222,128,0.2)',
    iconColor: '#4ade80',
    icon: <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>,
    title: 'Live Status Tracking',
    desc: 'Watch your complaint or document request move through each stage of the process in real time.',
  },
  {
    color: 'rgba(251,191,36,0.1)', borderColor: 'rgba(251,191,36,0.2)',
    iconColor: '#fbbf24',
    icon: <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
    title: 'Cloud-Backed & Secure',
    desc: 'All data is encrypted and stored securely in the cloud, with QR verification for document authenticity.',
  },
];

/* ─── Icons for Problem/Solution bullets ─── */
const XIcon = () => (
  <svg viewBox="0 0 24 24" strokeWidth="2.5" strokeLinecap="round" fill="none">
    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
);
const CheckIcon = () => (
  <svg viewBox="0 0 24 24" strokeWidth="2.5" strokeLinecap="round" fill="none">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
);

/* ─── Component ─────────────────────────────────────────── */
export default function LandingPage() {
  const navigate = useNavigate();
  const revealRefs = useRef([]);
  const [modal, setModal] = useState(null); // null | PRIVACY_POLICY | TERMS_OF_USE

  /* Lock body scroll when modal is open */
  useEffect(() => {
    document.body.style.overflow = modal ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [modal]);

  /* Intersection Observer for scroll reveals */
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('lp-visible'); }),
      { threshold: 0.12 }
    );
    revealRefs.current.forEach(el => { if (el) observer.observe(el); });
    return () => observer.disconnect();
  }, []);

  const addReveal = (delay = '') => ({
    ref: (el) => { if (el && !revealRefs.current.includes(el)) revealRefs.current.push(el); },
    className: `lp-reveal${delay ? ` lp-reveal--${delay}` : ''}`,
  });

  /* Smooth scroll */
  const scrollTo = (id) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });

  return (
    <div className="lp-root">
      <div className="lp-noise" aria-hidden />

      {/* ── Nav ── */}
      <nav className="lp-nav">
        <div className="lp-nav__brand" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
          <img src={newcablogo} alt="New Cabalan Logo" className="lp-nav__logo" />
          <div>
            <div className="lp-nav__name">NCESS</div>
            <div className="lp-nav__sub">New Cabalan E-Service System</div>
          </div>
        </div>

        <div className="lp-nav__links">
          {[['features','Features'],['how','How It Works'],['notifications','Notifications']].map(([id,label]) => (
            <button key={id} className="lp-nav__link" onClick={() => scrollTo(id)}>{label}</button>
          ))}
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="lp-hero">
        <div className="lp-hero__bg">
          <div className="lp-hero__ring lp-hero__ring--1" />
          <div className="lp-hero__ring lp-hero__ring--2" />
          <div className="lp-hero__ring lp-hero__ring--3" />
        </div>

        <div className="lp-hero__inner">
          {/* Left */}
          <div className="lp-hero__content">
            <div className="lp-badge">
              <div className="lp-badge__dot" />
              <span>Live System — Olongapo City, Philippines</span>
            </div>

            <div>
              <p className="lp-hero__eyebrow">Republic of the Philippines</p>
              <h1 className="lp-hero__title">
                NCESS<br />
                <span className="lp-hero__title-accent">E-Governance</span><br />
                Portal
              </h1>
              <p className="lp-hero__subtitle" style={{ marginTop: 10 }}>New Cabalan E-Service System</p>
            </div>

            <p className="lp-hero__desc">
              A web-based barangay portal with real-time notifications, cloud computing, and QR-code integration —
              centralizing announcements, complaint tracking, scheduling, and emergency reporting for Barangay New Cabalan.
            </p>

            <div className="lp-hero__actions">
              <button className="lp-btn-main" onClick={() => navigate('/usersignup')}>
                Get Started as Resident
                <svg viewBox="0 0 24 24" fill="none" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
                </svg>
              </button>
              <button className="lp-btn-outline" onClick={() => scrollTo('how')}>
                <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8"/>
                </svg>
                See How It Works
              </button>
            </div>

            <div className="lp-hero__stats">
              {[['12,482','Registered Residents'],['98%','Resolution Rate'],['24/7','System Uptime']].map(([v,l]) => (
                <div key={l}>
                  <div className="lp-hero__stat-value">{v}</div>
                  <div className="lp-hero__stat-label">{l}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Right — Seals */}
          <div className="lp-hero__seals">
            <div className="lp-seals-row">
              <div className="lp-seal-card">
                <img src={olongapologo} alt="Lungsod ng Olongapo" className="lp-seal-img" />
                <p className="lp-seal-label">Lungsod ng Olongapo</p>
              </div>
              <div className="lp-seal-card lp-seal-card--center">
                <img src={newcablogo} alt="Barangay New Cabalan" className="lp-seal-img" />
                <p className="lp-seal-label">Barangay New Cabalan</p>
              </div>
              <div className="lp-seal-card">
                <img src={bagongpilipinaslogo} alt="Bagong Pilipinas" className="lp-seal-img" />
                <p className="lp-seal-label">Bagong Pilipinas</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      

      {/* ── Features ── */}
      <section className="lp-section" id="features">
        <div className="lp-section-inner">
          <div className="lp-features-header">
            <div>
              <span className="lp-section-label">Core Features</span>
              <h2 className="lp-section-title">Everything Your Barangay Needs</h2>
            </div>
          </div>

          <div className="lp-features-grid">
            {FEATURES.map((f, i) => (
              <div
                key={f.title}
                className={`lp-feature-card${f.highlight ? ' lp-feature-card--highlight' : ''} lp-reveal lp-reveal--d${i % 5}`}
                ref={(el) => { if (el && !revealRefs.current.includes(el)) revealRefs.current.push(el); }}
              >
                <div className="lp-feature-icon">{f.icon}</div>
                <h3>{f.title}</h3>
                <p>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How It Works ── */}
      <section className="lp-section lp-how" id="how">
        <div className="lp-section-inner">
          <div style={{ textAlign: 'center' }}>
            <span className="lp-section-label">Process</span>
            <h2 className="lp-section-title">How It Works</h2>
            <p className="lp-section-desc" style={{ margin: '0 auto' }}>From registration to resolution — four simple steps.</p>
          </div>

          <div className="lp-steps">
            {STEPS.map((s, i) => (
              <div
                key={s.num}
                className={`lp-step lp-reveal lp-reveal--d${i}`}
                ref={(el) => { if (el && !revealRefs.current.includes(el)) revealRefs.current.push(el); }}
              >
                <div className="lp-step__num">{s.num}</div>
                <h4>{s.title}</h4>
                <p>{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Notifications ── */}
      <section className="lp-section" id="notifications">
        <div className="lp-notif-inner">
          {/* Notification demo */}
          <div>
            <div className="lp-notif-demo">
              {NOTIFICATIONS.map((n, i) => (
                <div key={i} className="lp-notif-card lp-notif-card--animated">
                  <div className={`lp-notif-dot lp-notif-dot--${n.dot}`} />
                  <div>
                    <div className="lp-notif-title">{n.title}</div>
                    <div className="lp-notif-desc">{n.desc}</div>
                    <div className="lp-notif-time">{n.time}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right content */}
          <div>
            <div className="lp-realtime-badge">
              <div className="lp-realtime-pulse" />
              <span>Real-Time Notification System</span>
            </div>
            <h2 className="lp-section-title">Always in the Loop</h2>
            <p className="lp-section-desc" style={{ marginBottom: 28 }}>
              No more checking social media pages or traveling to the barangay hall just to find out if your complaint was addressed.
              NCESS delivers updates directly to you — instantly and reliably.
            </p>
            <div>
              {NOTIF_FEATURES.map((f) => (
                <div key={f.title} className="lp-notif-feature">
                  <div
                    className="lp-notif-feature__icon"
                    style={{ background: f.color, border: `1px solid ${f.borderColor}` }}
                  >
                    <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" stroke={f.iconColor}>
                      {f.icon.props.children}
                    </svg>
                  </div>
                  <div>
                    <div className="lp-notif-feature__title">{f.title}</div>
                    <div className="lp-notif-feature__desc">{f.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="lp-cta">
        <div className="lp-cta__bg" />
        <div className="lp-cta__inner">
          <span className="lp-section-label" style={{ alignSelf: 'center' }}>Get Started Today</span>
          <h2 className="lp-cta__title">Your Barangay, Now Digital</h2>
          <p className="lp-cta__desc">
            Join thousands of residents in Barangay New Cabalan already using NCESS to access government services faster,
            smarter, and from the comfort of home.
          </p>
          <div className="lp-cta__actions">
            <button className="lp-btn-main" onClick={() => navigate('/usersignup')}>
              Register as Resident
              <svg viewBox="0 0 24 24" fill="none" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
                <circle cx="8.5" cy="7" r="4"/>
                <line x1="20" y1="8" x2="20" y2="14"/>
                <line x1="23" y1="11" x2="17" y2="11"/>
              </svg>
            </button>
            <button className="lp-btn-outline" onClick={() => navigate('/userlogin')}>
              Sign In to Your Account
            </button>
          </div>
          {/*
          <p className="lp-cta__admin-note">
            Are you a barangay official?{' '}
            <span className="lp-cta__admin-link" onClick={() => navigate('/adminlogin')}>
              Access the Admin Portal →
            </span>
          </p>
          */}
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="lp-footer">
        <div className="lp-footer__brand">
          <p>NCESS — New Cabalan E-Service System</p>
          <span>Barangay New Cabalan, Olongapo City, Zambales</span>
        </div>
        <p className="lp-footer__note">
          © 2026 New Cabalan E-Service System. All rights reserved.<br />
          Unauthorized access is strictly prohibited.
        </p>
        <div className="lp-footer__links">
          <button className="lp-footer__link" onClick={() => setModal(PRIVACY_POLICY)}>Privacy Policy</button>
          <button className="lp-footer__link" onClick={() => setModal(TERMS_OF_USE)}>Terms of Use</button>
        </div>
      </footer>

      {/* ── Legal Modal ── */}
      {modal && (
        <div className="lp-modal-overlay" onClick={() => setModal(null)} role="dialog" aria-modal="true">
          <div className="lp-modal" onClick={e => e.stopPropagation()}>
            <div className="lp-modal__header">
              <h2 className="lp-modal__title">{modal.title}</h2>
              <button className="lp-modal__close" onClick={() => setModal(null)} aria-label="Close">
                <svg viewBox="0 0 24 24" fill="none" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
            <div className="lp-modal__body">
              <p className="lp-modal__intro">{modal.intro}</p>
              {modal.sections.map((s) => (
                <div key={s.heading} className="lp-modal__section">
                  <h3 className="lp-modal__section-title">{s.heading}</h3>
                  <p className="lp-modal__text">{s.body}</p>
                  {s.list && (
                    <ul className="lp-modal__list">
                      {s.list.map((item) => <li key={item}>{item}</li>)}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}