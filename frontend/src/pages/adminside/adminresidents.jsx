import { useState, useEffect, useCallback } from 'react';
import { io } from 'socket.io-client';
import Sidebar from '../../components/adminsidebar';
import AdminTopbar from '../../components/admintopbar';
import { AdminFilterBar } from '../../components/adminfilterbar';
import './adminresidents.css';

const API_URL = import.meta.env.VITE_BACKEND_URL;
const PAGE_SIZE = 10;

function getAdminToken() {
  return (
    localStorage.getItem('admin_token') ||
    sessionStorage.getItem('admin_token') ||
    localStorage.getItem('adminToken') ||
    sessionStorage.getItem('adminToken') ||
    ''
  );
}

// ── Status helpers ────────────────────────────────────────────────────────────
const STATUS_TABS = ['All', 'Pending', 'Approved', 'Denied'];

function statusClass(status) {
  if (status === 'approved') return 'res-status--verified';
  if (status === 'denied') return 'res-status--rejected';
  return 'res-status--pending';
}

function StatusIcon({ status }) {
  if (status === 'approved') return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10"/><path d="M9 12l2 2 4-4"/>
    </svg>
  );
  if (status === 'denied') return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10"/>
      <line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
    </svg>
  );
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
    </svg>
  );
}
// ── Map a DB user document to what the table needs ───────────────────────────
function mapUser(u) {
  const fullName = [u.firstName, u.middleName, u.lastName].filter(Boolean).join(' ') || u.email;
  return {
    _id:    u._id,
    name:   fullName,
    email:  u.email,
    // keep "phone" for table display, also expose "mobile" for modal
    phone:  u.contactNumber || u.mobile || '—',
    mobile: u.contactNumber || u.mobile || '',
    purok:  u.purok         || '—',
    status: u.status        || 'pending',
    // personal — use "dateOfBirth" to match usertopbar key
    firstName:   u.firstName   || '',
    middleName:  u.middleName  || '',
    lastName:    u.lastName    || '',
    dateOfBirth: u.birthdate   || u.dateOfBirth || '',
    sex:             u.sex             || '',
    civilStatus:     u.civilStatus     || '',
    nationality:     u.nationality     || '',
    // address — stored as single field from signup
    homeAddress:     u.homeAddress     || '',
    residencyStatus: u.residencyStatus || '',
    lengthOfStay:    u.lengthOfStay    || '',
    voterStatus:     u.voterStatus     || '',
    householdId:     u.householdId     || '',
    // gov
    idType:   u.idType   || '',
    idNumber: u.idNumber || '',
    // additional
    occupation:            u.occupation            || '',
    educationalAttainment: u.educationalAttainment || '',
    // verification documents
    validIdUrl:           u.validIdUrl           || '',
    proofOfResidencyUrl:  u.proofOfResidencyUrl  || '',
    createdAt: u.createdAt || '',
  };
}

// ── View Profile Modal ────────────────────────────────────────────────────────
// ── Sections definition (mirrors usertopbar SECTIONS exactly) ────────────────
const PROFILE_SECTIONS = [
  {
    label: 'Personal Information',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
      </svg>
    ),
    fields: [
      { key: 'firstName',   label: 'First Name'   },
      { key: 'middleName',  label: 'Middle Name'  },
      { key: 'lastName',    label: 'Last Name'    },
      { key: 'dateOfBirth', label: 'Date of Birth', format: 'date' },
      { key: 'sex',         label: 'Sex'          },
      { key: 'civilStatus', label: 'Civil Status' },
      { key: 'nationality', label: 'Nationality'  },
    ],
  },
  {
    label: 'Home & Residency',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
        <polyline points="9 22 9 12 15 12 15 22"/>
      </svg>
    ),
    fields: [
      { key: 'homeAddress',     label: 'Full Address',          fullWidth: true },
      { key: 'purok',           label: 'Purok / Sitio'          },
      { key: 'residencyStatus', label: 'Residency Status'       },
      { key: 'lengthOfStay',    label: 'Length of Stay'         },
      { key: 'householdId',     label: 'Household / Family ID'  },
    ],
  },
  {
    label: 'Contact Information',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81a19.79 19.79 0 01-3.07-8.67A2 2 0 012 .99h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 8.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/>
      </svg>
    ),
    fields: [
      { key: 'mobile', label: 'Mobile Number' },
      { key: 'email',  label: 'Email Address' },
    ],
  },
  {
    label: 'Additional Information',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="10"/>
        <line x1="12" y1="8" x2="12" y2="12"/>
        <line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
    ),
    fields: [
      { key: 'occupation',            label: 'Occupation'             },
      { key: 'voterStatus',           label: 'Voter Status'           },
      { key: 'educationalAttainment', label: 'Educational Attainment' },
    ],
  },
];

// ── Documents Modal ──────────────────────────────────────────────────────────
function DocumentsModal({ resident, onClose }) {
  const [fullScreenImage, setFullScreenImage] = useState(null);
  
  if (!resident) return null;

  const hasValidId = !!resident.validIdUrl;
  const hasProof = !!resident.proofOfResidencyUrl;
  const hasAny = hasValidId || hasProof;

  console.log("[DocumentsModal] Displaying documents for:", { 
    name: resident.name, 
    hasValidId, 
    hasProof,
    validIdUrl: resident.validIdUrl?.substring(0, 80),
    proofOfResidencyUrl: resident.proofOfResidencyUrl?.substring(0, 80)
  });

  const renderImage = (imageUrl, label, onExpand) => (
    <div style={{
      border: '1px solid #e5e7eb',
      borderRadius: 8,
      padding: 8,
      background: '#f9fafb',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      height: '200px',
      position: 'relative',
      cursor: 'pointer',
      transition: 'all 0.2s ease',
      width: '100%',
      overflow: 'hidden',
    }}
    onMouseEnter={(e) => e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)'}
    onMouseLeave={(e) => e.currentTarget.style.boxShadow = 'none'}
    onClick={onExpand}
    >
      <img
        src={imageUrl}
        alt={label}
        style={{
          maxWidth: '100%',
          maxHeight: '100%',
          borderRadius: 4,
          objectFit: 'contain',
        }}
        onError={(e) => {
          e.target.style.display = 'none';
          if (e.target.parentElement) {
            e.target.parentElement.innerHTML = '<p style="color: #999; font-size: 13px;">Image failed to load</p>';
          }
        }}
      />
      {/* Expand icon overlay */}
      <div style={{
        position: 'absolute',
        top: 12,
        right: 12,
        width: 32,
        height: 32,
        borderRadius: 6,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#fff',
        opacity: 0,
        transition: 'opacity 0.2s ease',
      }}
      onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
      onMouseLeave={(e) => e.currentTarget.style.opacity = '0'}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
          <path d="M8 3H5a2 2 0 00-2 2v3m18 0V5a2 2 0 00-2-2h-3m0 18h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3"/>
        </svg>
      </div>
    </div>
  );

  return (
    <>
      <div className="utb-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }} style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        zIndex: 1000,
        overflowY: 'auto',
      }}>
        <div className="utb-modal" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()} style={{ 
          maxWidth: '520px',
          width: '100%',
          maxHeight: '80vh',
          borderRadius: '12px',
          background: '#fff',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.15)',
          display: 'flex',
          flexDirection: 'column',
        }}>
          {/* ── Header ── */}
          <div className="utb-modal-header" style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '20px 24px',
            borderBottom: '1px solid #e5e7eb',
            flexShrink: 0,
          }}>
            <div className="utb-modal-header-left" style={{ display: 'flex', alignItems: 'center', gap: 16, minWidth: 0 }}>
              <div style={{
                width: 44, height: 44, borderRadius: '50%',
                background: 'linear-gradient(135deg,#1e3a5f,#2563eb)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', fontWeight: 700, fontSize: 16, flexShrink: 0,
              }}>
                {(resident.name || '?')[0].toUpperCase()}
              </div>
              <div style={{ minWidth: 0 }}>
                <div className="utb-modal-name" style={{ fontSize: 16, fontWeight: 600, color: '#1f2937' }}>Verification Documents</div>
                <div className="utb-modal-sub" style={{ fontSize: 13, color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis' }}>{resident.name}</div>
              </div>
            </div>
            <button className="utb-modal-close" onClick={onClose} aria-label="Close" style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#6b7280',
              flexShrink: 0,
            }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>

          {/* ── Body ── */}
          <div style={{ 
            padding: '20px 24px', 
            display: 'flex',
            flexDirection: 'column', 
            flex: 1, 
            overflowY: 'auto',
            gap: 20,
          }}>
            {!hasAny && (
              <div style={{
                textAlign: 'center',
                padding: '40px 20px',
                color: '#9ca3af',
                fontSize: 14,
              }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="48" height="48" style={{ margin: '0 auto 16px', opacity: 0.5, display: 'block' }}>
                  <path d="M9 12l2 2 4-4M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
                <p style={{ margin: 0 }}>No verification documents submitted yet.</p>
              </div>
            )}

            {hasAny && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {/* Valid ID */}
                <div>
                  <p style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Valid ID</p>
                  {hasValidId ? (
                    renderImage(resident.validIdUrl, 'Valid ID', () => setFullScreenImage({ url: resident.validIdUrl, title: 'Valid ID' }))
                  ) : (
                    <div style={{
                      padding: 16,
                      background: '#f9fafb',
                      border: '1px dashed #d1d5db',
                      borderRadius: 8,
                      textAlign: 'center',
                      color: '#9ca3af',
                      fontSize: 13,
                    }}>
                      Not submitted
                    </div>
                  )}
                </div>

                {/* Proof of Residency */}
                <div>
                  <p style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Proof of Residency</p>
                  {hasProof ? (
                    renderImage(resident.proofOfResidencyUrl, 'Proof of Residency', () => setFullScreenImage({ url: resident.proofOfResidencyUrl, title: 'Proof of Residency' }))
                  ) : (
                    <div style={{
                      padding: 16,
                      background: '#f9fafb',
                      border: '1px dashed #d1d5db',
                      borderRadius: 8,
                      textAlign: 'center',
                      color: '#9ca3af',
                      fontSize: 13,
                    }}>
                      Not submitted
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* ── Footer ── */}
          <div style={{ 
            borderTop: '1px solid #e5e7eb', 
            padding: '16px 24px', 
            display: 'flex', 
            justifyContent: 'flex-end',
            flexShrink: 0,
          }}>
            <button
              onClick={onClose}
              style={{
                padding: '8px 16px',
                borderRadius: 6,
                border: '1px solid #d1d5db',
                background: '#fff',
                color: '#374151',
                fontSize: 13,
                fontWeight: 500,
                cursor: 'pointer',
                fontFamily: 'DM Sans, sans-serif',
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = '#f3f4f6'}
              onMouseLeave={(e) => e.currentTarget.style.background = '#fff'}
            >
              Close
            </button>
          </div>
        </div>
      </div>

      {/* ── Full Screen Image Viewer ── */}
      {fullScreenImage && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.95)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            backdropFilter: 'blur(5px)',
            padding: '16px',
          }}
          onClick={() => setFullScreenImage(null)}
        >
          {/* Close button */}
          <button
            onClick={() => setFullScreenImage(null)}
            style={{
              position: 'absolute',
              top: '16px',
              right: '16px',
              width: 40,
              height: 40,
              borderRadius: '50%',
              border: 'none',
              background: 'rgba(255,255,255,0.2)',
              color: '#fff',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background 0.2s ease',
              zIndex: 10000,
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.3)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.2)'}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="24" height="24">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>

          {/* Title */}
          <div style={{
            position: 'absolute',
            top: '16px',
            left: '16px',
            color: '#fff',
            fontSize: '14px',
            fontWeight: 600,
            fontFamily: 'DM Sans, sans-serif',
            maxWidth: 'calc(100% - 80px)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {fullScreenImage.title}
          </div>

          {/* Image */}
          <img
            src={fullScreenImage.url}
            alt={fullScreenImage.title}
            style={{
              maxWidth: '95vw',
              maxHeight: '85vh',
              width: 'auto',
              height: 'auto',
              objectFit: 'contain',
              borderRadius: 8,
            }}
            onClick={(e) => e.stopPropagation()}
            onError={(e) => {
              e.target.style.display = 'none';
            }}
          />

          {/* Click hint */}
          <div style={{
            position: 'absolute',
            bottom: '16px',
            color: 'rgba(255,255,255,0.7)',
            fontSize: '12px',
            fontFamily: 'DM Sans, sans-serif',
            textAlign: 'center',
          }}>
            Click anywhere to close
          </div>
        </div>
      )}
    </>
  );
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  return d.toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });
}

// ── Tabbed Profile Modal ───────────────────────────────────────────────────────
function ProfileModal({ resident, onClose, onApprove, onReject, actionLoading }) {
  const [activeSection, setActiveSection] = useState(0);
  if (!resident) return null;

  const isLast = activeSection === PROFILE_SECTIONS.length - 1;

  return (
    <div className="utb-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="utb-modal" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}>

        {/* ── Header ── */}
        <div className="utb-modal-header">
          <div className="utb-modal-header-left">
            <div style={{
              width: 44, height: 44, borderRadius: '50%',
              background: 'linear-gradient(135deg,#1e3a5f,#2563eb)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontWeight: 700, fontSize: 16, flexShrink: 0,
            }}>
              {(resident.name || '?')[0].toUpperCase()}
            </div>
            <div>
              <div className="utb-modal-name">{resident.name}</div>
              <div className="utb-modal-sub" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {`Resident Profile${resident.householdId ? ` · ${resident.householdId}` : ''}`}
                &nbsp;·&nbsp;
                <span className={`res-status ${statusClass(resident.status)}`} style={{ fontSize: 11, padding: '2px 8px' }}>
                  <StatusIcon status={resident.status}/>
                  {resident.status.charAt(0).toUpperCase() + resident.status.slice(1)}
                </span>
              </div>
            </div>
          </div>
          <button className="utb-modal-close" onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* ── Body ── */}
        <div className="utb-modal-body">

          {/* Left nav */}
          <nav className="utb-modal-nav">
            {PROFILE_SECTIONS.map((sec, i) => (
              <button
                key={sec.label}
                className={`utb-modal-nav-item${activeSection === i ? ' utb-modal-nav-item--active' : ''}${i < activeSection ? ' utb-modal-nav-item--done' : ''}`}
                onClick={() => setActiveSection(i)}
              >
                <span className="utb-modal-nav-step">
                  {i < activeSection ? (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="11" height="11">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                  ) : (
                    <span>{i + 1}</span>
                  )}
                </span>
                <span className="utb-modal-nav-icon">{sec.icon}</span>
                <span className="utb-modal-nav-label">{sec.label}</span>
              </button>
            ))}
          </nav>

          {/* Right content */}
          <div className="utb-modal-content">
            <div className="utb-modal-section-title">
              <span className="utb-modal-section-name">{PROFILE_SECTIONS[activeSection].label}</span>
              <span className="utb-modal-section-counter">{activeSection + 1} / {PROFILE_SECTIONS.length}</span>
              <span className="utb-readonly-badge">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="10" height="10">
                  <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/>
                </svg>
                Admin view — read only
              </span>
            </div>

            <div className="utb-modal-fields">
              {PROFILE_SECTIONS[activeSection].fields.map(field => {
                // Special rendering for image fields
                if (field.type === 'image') {
                  const imageUrl = resident[field.key];
                  return (
                    <div className="utb-field" key={field.key} style={field.fullWidth ? { gridColumn: '1 / -1' } : { gridColumn: '1 / -1' }}>
                      <label className="utb-field-label">{field.label}</label>
                      {imageUrl ? (
                        <div style={{
                          border: '1px solid #e5e7eb',
                          borderRadius: 8,
                          padding: 12,
                          background: '#f9fafb',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          minHeight: 250,
                        }}>
                          <img
                            src={imageUrl}
                            alt={field.label}
                            style={{
                              maxWidth: '100%',
                              maxHeight: 300,
                              borderRadius: 4,
                              objectFit: 'contain',
                            }}
                            onError={(e) => {
                              e.target.style.display = 'none';
                              e.target.parentElement.innerHTML = '<p style="color: #999; font-size: 13px;">Image failed to load</p>';
                            }}
                          />
                        </div>
                      ) : (
                        <div className="utb-field-input utb-field-input--readonly" style={{ textAlign: 'center', color: '#999' }}>
                          No document submitted
                        </div>
                      )}
                    </div>
                  );
                }

                // Regular text field rendering
                return (
                  <div className="utb-field" key={field.key} style={field.fullWidth ? { gridColumn: '1 / -1' } : {}}>
                    <label className="utb-field-label">{field.label}</label>
                    <div className="utb-field-input utb-field-input--readonly">
                      {field.format === 'date'
                        ? formatDate(resident[field.key])
                        : (resident[field.key] || '—')}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Footer — nav + approve/reject on last tab */}
            <div className="utb-modal-footer">
              {activeSection > 0 && (
                <button className="utb-back-btn" onClick={() => setActiveSection(s => s - 1)}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                    <polyline points="15 18 9 12 15 6"/>
                  </svg>
                  Back
                </button>
              )}

              {!isLast && (
                <button className="utb-next-btn" onClick={() => setActiveSection(s => s + 1)}>
                  Next
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                    <polyline points="9 18 15 12 9 6"/>
                  </svg>
                </button>
              )}

              {/* Approve / Reject shown on last tab */}
              {isLast && resident.status === 'pending' && (
                <>
                  <button
                    onClick={() => onReject(resident._id)}
                    disabled={!!actionLoading}
                    style={{
                      display:'flex', alignItems:'center', gap:6,
                      padding:'9px 18px', borderRadius:9, border:'1.5px solid #fecaca',
                      background:'#fff', color:'#dc2626', fontSize:13, fontWeight:600,
                      fontFamily:'DM Sans,sans-serif', cursor:'pointer', marginLeft:'auto',
                    }}
                  >
                    {actionLoading === 'denied' ? 'Denying…' : 'Deny'}
                  </button>
                  <button
                    onClick={() => onApprove(resident._id)}
                    disabled={!!actionLoading}
                    style={{
                      display:'flex', alignItems:'center', gap:7,
                      padding:'9px 20px', borderRadius:9, border:'none',
                      background:'#16a34a', color:'#fff', fontSize:13, fontWeight:600,
                      fontFamily:'DM Sans,sans-serif', cursor:'pointer',
                    }}
                  >
                    {actionLoading === 'approved' ? 'Approving…' : (
                      <>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="14" height="14">
                          <polyline points="20 6 9 17 4 12"/>
                        </svg>
                        Approve
                      </>
                    )}
                  </button>
                </>
              )}

              {isLast && resident.status === 'approved' && (
                <button
                  onClick={() => onReject(resident._id)}
                  disabled={!!actionLoading}
                  style={{
                    display:'flex', alignItems:'center', gap:6,
                    padding:'9px 18px', borderRadius:9, border:'1.5px solid #fecaca',
                    background:'#fff', color:'#dc2626', fontSize:13, fontWeight:600,
                    fontFamily:'DM Sans,sans-serif', cursor:'pointer', marginLeft:'auto',
                  }}
                >
                  {actionLoading === 'denied' ? 'Updating…' : 'Revoke Approval'}
                </button>
              )}

              {isLast && resident.status === 'denied' && (
                <button
                  onClick={() => onApprove(resident._id)}
                  disabled={!!actionLoading}
                  style={{
                    display:'flex', alignItems:'center', gap:7,
                    padding:'9px 20px', borderRadius:9, border:'none',
                    background:'#16a34a', color:'#fff', fontSize:13, fontWeight:600,
                    fontFamily:'DM Sans,sans-serif', cursor:'pointer', marginLeft:'auto',
                  }}
                >
                  {actionLoading === 'approved' ? 'Approving…' : (
                    <>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="14" height="14">
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                      Re-Approve
                    </>
                  )}
                </button>
              )}

              {isLast && resident.status !== 'pending' && (
                <button className="utb-back-btn" onClick={onClose} style={{ marginLeft: resident.status === 'approved' ? 0 : 0 }}>
                  Close
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function AdminResidents({ initialTab = 'All' }) {
  const [sidebarOpen,  setSidebarOpen]  = useState(window.innerWidth >= 1024);
  const [residents,    setResidents]    = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [fetchError,   setFetchError]   = useState('');

  const [search,       setSearch]       = useState('');
  const [purokFilter,  setPurokFilter]  = useState('All');
  const [statusTab,    setStatusTab]    = useState(initialTab);
  const [page,         setPage]         = useState(1);

  const [openMenu,     setOpenMenu]     = useState(null);
  const [viewResident, setViewResident] = useState(null);
  const [viewDocumentsResident, setViewDocumentsResident] = useState(null);
  const [actionLoading, setActionLoading] = useState(null);
  const [toast,        setToast]        = useState('');

  // ── Fetch all users from the backend ────────────────────────────────────
  const fetchResidents = useCallback(async () => {
    setLoading(true);
    setFetchError('');
    try {
      const token = getAdminToken();
      const res = await fetch(`${API_URL}/users`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setResidents(data.map(mapUser));
    } catch (err) {
      console.error(err);
      setFetchError('Failed to load residents. Please refresh the page.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchResidents(); }, [fetchResidents]);

  useEffect(() => {
    const token = getAdminToken();
    if (!token) return;

    const socket = io(
      import.meta.env.VITE_SOCKET_URL ||
      import.meta.env.VITE_BACKEND_URL?.replace('/api', '') || '',
      { auth: { token }, transports: ['websocket'], reconnection: true }
    );

    console.log("[Socket.io] Attempting to connect...");

    socket.on('connect', () => {
      console.log("[Socket.io] ✓ Connected. Admin Residents page listening for updates.");
    });

    function upsertResident(user) {
      if (!user?._id) return;
      const mapped = mapUser(user);
      console.log("[Socket.io] Resident update received:", { id: mapped._id, name: mapped.name, hasValidId: !!mapped.validIdUrl, hasProof: !!mapped.proofOfResidencyUrl });
      
      setResidents(prev => {
        const exists = prev.some(resident => resident._id === mapped._id);
        if (exists) return prev.map(resident => resident._id === mapped._id ? mapped : resident);
        return [mapped, ...prev];
      });
      
      // Update profile modal if viewing this resident
      setViewResident(prev => prev?._id === mapped._id ? mapped : prev);
      
      // Update documents modal if viewing this resident
      setViewDocumentsResident(prev => prev?._id === mapped._id ? mapped : prev);
    }

    socket.on('resident_account_submitted', (user) => {
      console.log("[Socket.io] resident_account_submitted:", user?.email);
      upsertResident(user);
    });
    socket.on('resident_account_status_updated', ({ user }) => {
      console.log("[Socket.io] resident_account_status_updated:", user?.email);
      upsertResident(user);
    });
    socket.on('resident_profile_updated', ({ user }) => {
      console.log("[Socket.io] resident_profile_updated:", user?.email);
      upsertResident(user);
    });

    socket.on('disconnect', () => {
      console.log("[Socket.io] Disconnected from server");
    });

    socket.on('connect_error', (error) => {
      console.error("[Socket.io] Connection error:", error);
    });

    return () => socket.disconnect();
  }, []);

  useEffect(() => {
    setStatusTab(initialTab);
    setPage(1);
  }, [initialTab]);

  // ── Approve / Reject ─────────────────────────────────────────────────────
  async function updateStatus(id, newStatus) {
    setActionLoading(newStatus);
    try {
      const token = getAdminToken();
      const res = await fetch(`${API_URL}/users/${id}/status`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();

      // Update local state so UI reflects immediately without a full refetch
      setResidents(prev =>
        prev.map(r => r._id === id ? mapUser(data.user) : r)
      );
      // If the modal is open for this resident, update it too
      if (viewResident?._id === id) setViewResident(mapUser(data.user));

      const label = newStatus === 'approved' ? 'Resident approved!' : newStatus === 'denied' ? 'Resident denied.' : 'Status updated.';
      showToast(label);
    } catch {
      showToast('Action failed. Please try again.');
    } finally {
      setActionLoading(null);
    }
  }

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(''), 3500);
  }

  // ── Derive purok options from real data ──────────────────────────────────
  const puroks = ['All', ...Array.from(
    new Set(residents.map(r => r.purok).filter(p => p && p !== '—'))
  ).sort()];

  // ── Filtering ────────────────────────────────────────────────────────────
  const filtered = residents.filter(r => {
    const q = search.toLowerCase();
    const matchSearch = !q ||
      r.name.toLowerCase().includes(q) ||
      r.email.toLowerCase().includes(q) ||
      r.phone.includes(q) ||
      r.purok.toLowerCase().includes(q);
    const matchPurok  = purokFilter === 'All' || r.purok === purokFilter;
    const matchStatus = statusTab === 'All' || r.status === statusTab.toLowerCase();
    return matchSearch && matchPurok && matchStatus;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const handleSearch = v => { setSearch(v); setPage(1); };
  const handlePurok  = p => { setPurokFilter(p); setPage(1); };
  const handleTab    = t => { setStatusTab(t); setPage(1); };

  // ── Counts for tab badges ────────────────────────────────────────────────
  const counts = {
    All:      residents.length,
    Pending:  residents.filter(r => r.status === 'pending').length,
    Approved: residents.filter(r => r.status === 'approved').length,
    Denied:   residents.filter(r => r.status === 'denied').length,
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />
      <div
        style={{ flex: 1, height: '100vh', overflowY: 'auto' }}
        onClick={() => { setOpenMenu(null); }}
      >
        <div className="res-page">

          <AdminTopbar
            placeholder="Search residents..."
            search={search}
            onSearch={handleSearch}
            onHamburger={() => setSidebarOpen(v => !v)}
            sidebarOpen={sidebarOpen}
            setSidebarOpen={setSidebarOpen}
          />

          {/* Page Header */}
          <div className="res-header">
            <div>
              <h1>Resident Profiles</h1>
              <p>View and manage all registered residents of New Cabalan.</p>
            </div>
          </div>

          <AdminFilterBar
            groups={[{
              label: 'Status',
              value: statusTab,
              onChange: handleTab,
              options: STATUS_TABS.map(tab => ({ value: tab, label: tab, count: counts[tab] })),
            }]}
          />

          {/* Table Card */}
          <div className="res-card" onClick={e => e.stopPropagation()}>

            <AdminFilterBar
              selects={[{
                label: 'Purok',
                value: purokFilter,
                onChange: handlePurok,
                options: puroks,
              }]}
              count={`Showing ${filtered.length} residents`}
              actions={(
                <button className="res-export-btn" onClick={fetchResidents} disabled={loading}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="23 4 23 10 17 10"/>
                    <path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/>
                  </svg>
                  {loading ? 'Loadingâ€¦' : 'Refresh'}
                </button>
              )}
            />
                        {/* Loading / Error states */}
            {loading && (
              <div className="res-table__empty">
                <span style={{ display:'inline-flex', alignItems:'center', gap:8 }}>
                  <span className="res-spinner"/> Loading residents…
                </span>
              </div>
            )}

            {!loading && fetchError && (
              <div className="res-table__empty" style={{ color:'#dc2626' }}>{fetchError}</div>
            )}

            {/* Table */}
            {!loading && !fetchError && (
              <table className="res-table">
                <thead>
                  <tr>
                    <th>Full Name</th>
                    <th>Purok / Sitio</th>
                    <th>Contact Info</th>
                    <th>Registered</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginated.length === 0 && (
                    <tr>
                      <td colSpan="6" className="res-table__empty">No residents found.</td>
                    </tr>
                  )}
                  {paginated.map(r => (
                    <tr key={r._id} className="res-table__row">

                      {/* Name — card title, no label prefix */}
                      <td>
                        <p className="res-table__name">{r.name}</p>
                        <p className="res-table__id" style={{ fontSize: 11 }}>{r.email}</p>
                      </td>

                      {/* Purok */}
                      <td data-label="Purok">
                        <span className="res-zone-badge">{r.purok}</span>
                      </td>

                      {/* Contact */}
                      <td data-label="Contact">
                        <div className="res-contact">
                          <span className="res-contact__item">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M3 5a2 2 0 012-2h3l2 4-2 2a13 13 0 006 6l2-2 4 2v3a2 2 0 01-2 2C10.4 20 4 13.6 4 5.5"/>
                            </svg>
                            {r.phone}
                          </span>
                        </div>
                      </td>

                      {/* Date registered */}
                      <td data-label="Registered">
                        <span
                          style={{ fontSize: 12.5, color: '#6b7280', cursor: 'default' }}
                          title={r.createdAt ? new Date(r.createdAt).toLocaleString('en-PH', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }) : ''}
                        >
                          {r.createdAt ? new Date(r.createdAt).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' }) : '—'}
                        </span>
                      </td>

                      {/* Status */}
                      <td data-label="Status">
                        <span className={`res-status ${statusClass(r.status)}`}>
                          <StatusIcon status={r.status}/>
                          {r.status.charAt(0).toUpperCase() + r.status.slice(1)}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="res-table__actions-cell">
                        <div className="res-actions" onClick={e => e.stopPropagation()}>
                          <div className="res-menu-wrap">
                            <button
                              className="res-action-icon"
                              title="More"
                              onClick={() => setOpenMenu(openMenu === r._id ? null : r._id)}
                            >
                              <svg viewBox="0 0 24 24" fill="currentColor">
                                <circle cx="12" cy="5" r="1.5"/>
                                <circle cx="12" cy="12" r="1.5"/>
                                <circle cx="12" cy="19" r="1.5"/>
                              </svg>
                            </button>
                            {openMenu === r._id && (
                              <div className="res-dropdown">
                                <button
                                  className="res-dropdown__item"
                                  onClick={() => { setViewResident(r); setOpenMenu(null); }}
                                >
                                  View Full Profile
                                </button>
                                <button
                                  className="res-dropdown__item"
                                  onClick={() => { setViewDocumentsResident(r); setOpenMenu(null); }}
                                >
                                  View Submitted Documents
                                </button>
                                {r.status !== 'approved' && (
                                  <button
                                    className="res-dropdown__item"
                                    style={{ color: '#16a34a' }}
                                    onClick={() => { updateStatus(r._id, 'approved'); setOpenMenu(null); }}
                                  >
                                    Approve
                                  </button>
                                )}
                                {r.status !== 'denied' && (
                                  <button
                                    className="res-dropdown__item res-dropdown__item--danger"
                                    onClick={() => { updateStatus(r._id, 'denied'); setOpenMenu(null); }}
                                  >
                                    Deny
                                  </button>
                                )}
                                {r.status !== 'pending' && (
                                  <button
                                    className="res-dropdown__item"
                                    style={{ color: '#d97706' }}
                                    onClick={() => { updateStatus(r._id, 'pending'); setOpenMenu(null); }}
                                  >
                                    Reset to Pending
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {/* Pagination */}
            {!loading && !fetchError && (
              <div className="res-pagination">
                <p className="res-pagination__info">
                  Showing <strong>{filtered.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)}</strong> of <strong>{filtered.length}</strong> residents
                </p>
                <div className="res-pagination__controls">
                  <button className="res-page-btn" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</button>
                  {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => i + 1).map(p => (
                    <button
                      key={p}
                      className={`res-page-num${page === p ? ' res-page-num--active' : ''}`}
                      onClick={() => setPage(p)}
                    >
                      {p}
                    </button>
                  ))}
                  {totalPages > 5 && <span className="res-page-ellipsis">…</span>}
                  <button className="res-page-btn" disabled={page === totalPages || filtered.length === 0} onClick={() => setPage(page + 1)}>Next</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── View Profile Modal ── */}
      {viewResident && (
        <ProfileModal
          resident={viewResident}
          onClose={() => setViewResident(null)}
          onApprove={id => updateStatus(id, 'approved')}
          onReject={id  => updateStatus(id, 'denied')}
          actionLoading={actionLoading}
        />
      )}

      {/* ── View Documents Modal ── */}
      {viewDocumentsResident && (
        <DocumentsModal
          resident={viewDocumentsResident}
          onClose={() => setViewDocumentsResident(null)}
        />
      )}

      {/* ── Toast ── */}
      {toast && (
        <div className="res-toast">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="16" height="16">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
          {toast}
        </div>
      )}
    </div>
  );
}