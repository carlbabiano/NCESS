import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import QRCode from 'react-qr-code';
import './usertopbar.css';

const STORAGE_KEY = 'utb_notifications';
const BELL_DOT_SEEN_KEY = 'utb_bell_dot_seen';
const CHAT_UNREAD_SEEN_KEY = 'utb_chat_unread_seen';
const CHAT_NOTICE_UID = 'chat-barangay-support';

const SEX_OPTIONS = ['Male', 'Female'];
const PUROK_OPTIONS = ['Purok 1', 'Purok 2', 'Purok 3', 'Purok 4', 'Purok 5', 'Purok 6', 'Purok 7', 'Iram'];
const CIVIL_STATUS_OPTIONS = ['Single', 'Married', 'Widowed', 'Separated'];
const RESIDENCY_STATUS_OPTIONS = ['Permanent Resident', 'Temporary Resident', 'Renter', 'Boarder'];
const VOTER_STATUS_OPTIONS = ['Registered Voter', 'Not Registered', 'Transferred', 'Inactive'];
const EDUCATIONAL_ATTAINMENT_OPTIONS = [
  'No Formal Education',
  'Elementary Undergraduate',
  'Elementary Graduate',
  'High School Undergraduate',
  'High School Graduate',
  'Senior High School Graduate',
  'Vocational Graduate',
  'College Undergraduate',
  'College Graduate',
  'Postgraduate',
];

const PROFILE_CHANGE_LABELS = {
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

const PROFILE_PROOF_REQUIRED_FIELDS = [
  'firstName', 'middleName', 'lastName', 'birthdate', 'sex', 'civilStatus', 'nationality',
];

function loadNotifs() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
  catch { return []; }
}
function saveNotifs(list) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); } catch { /* ignore storage failures */ }
}
function loadBellDotSeen() {
  try { return localStorage.getItem(BELL_DOT_SEEN_KEY) === '1'; }
  catch { return false; }
}
function saveBellDotSeen() {
  try { localStorage.setItem(BELL_DOT_SEEN_KEY, '1'); } catch { /* ignore storage failures */ }
}
function loadChatUnreadSeen() {
  try { return Number(localStorage.getItem(CHAT_UNREAD_SEEN_KEY) || 0) || 0; }
  catch { return 0; }
}
function saveChatUnreadSeen(count) {
  try { localStorage.setItem(CHAT_UNREAD_SEEN_KEY, String(Math.max(0, Number(count) || 0))); } catch { /* ignore storage failures */ }
}

const CAT_COLOR = {
  Health:      '#16a34a',
  Environment: '#15803d',
  Events:      '#7c3aed',
  Safety:      '#dc2626',
  Services:    '#2563eb',
};

// ── Appointment & Complaint notification configs ──────────────────────────────
const STORAGE_REMINDED_KEY = 'utb_appt_reminded';

function loadReminded() {
  try { return JSON.parse(localStorage.getItem(STORAGE_REMINDED_KEY) || '{}'); }
  catch { return {}; }
}
function saveReminded(obj) {
  try { localStorage.setItem(STORAGE_REMINDED_KEY, JSON.stringify(obj)); } catch { /* ignore storage failures */ }
}

const APPT_NOTIF = {
  reminder_24h:                   { color: '#2563eb', label: '24h Reminder' },
  reminder_1h:                    { color: '#f59e0b', label: '1h Reminder' },
  appointment_closed:             { color: '#6b7280', label: 'Appointment Closed' },
  appointment_cancelled_by_admin: { color: '#ef4444', label: 'Cancelled by Admin' },
};

const COMPLAINT_STATUS_NOTIF = {
  'Pending':     { color: '#f59e0b', label: 'Complaint Pending' },
  'In Progress': { color: '#2563eb', label: 'Complaint In Progress' },
  'Resolved':    { color: '#16a34a', label: 'Complaint Resolved' },
  'Escalated':   { color: '#dc2626', label: 'Complaint Escalated' },
};

function apptNotifId(apptId, type) { return `appt-${apptId}-${type}`; }

function pushNotif(setNotifs, uid, payload) {
  setNotifs(prev => {
    if (prev.some(n => n.uid === uid)) return prev;
    const next = [{ uid, ...payload, ts: new Date().toISOString(), read: false }, ...prev].slice(0, 60);
    saveNotifs(next);
    return next;
  });
}

function upsertChatNotif(setNotifs, unreadMessages, markUnread = true) {
  const count = Math.max(0, Number(unreadMessages) || 0);
  if (count <= 0) return;

  setNotifs(prev => {
    const now = new Date().toISOString();
    const existing = prev.find(n => n.uid === CHAT_NOTICE_UID);
    const chatNotif = {
      uid: CHAT_NOTICE_UID,
      kind: 'chat',
      title: 'Barangay Support',
      body: `You have ${count} unread message${count > 1 ? 's' : ''} from the barangay.`,
      unreadMessages: count,
      ts: now,
      read: markUnread ? false : existing?.read ?? true,
    };
    const withoutChat = prev.filter(n => n.uid !== CHAT_NOTICE_UID);
    const next = [
      existing ? { ...existing, ...chatNotif } : chatNotif,
      ...withoutChat,
    ].slice(0, 60);
    saveNotifs(next);
    return next;
  });
}

function fmtRelative(iso) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return 'Just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function NotificationIcon({ kind, type }) {
  const iconProps = {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: '2',
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': 'true',
  };

  if (kind === 'chat') {
    return (
      <svg {...iconProps}>
        <path d="M21 15a4 4 0 01-4 4H8l-5 3V7a4 4 0 014-4h10a4 4 0 014 4z"/>
      </svg>
    );
  }

  if (kind === 'appointment') {
    if (type === 'reminder_1h') {
      return (
        <svg {...iconProps}>
          <circle cx="12" cy="12" r="9"/>
          <path d="M12 7v5l3 2"/>
        </svg>
      );
    }

    if (type === 'appointment_closed') {
      return (
        <svg {...iconProps}>
          <rect x="5" y="11" width="14" height="10" rx="2"/>
          <path d="M8 11V7a4 4 0 018 0v4"/>
        </svg>
      );
    }

    if (type === 'appointment_cancelled_by_admin') {
      return (
        <svg {...iconProps}>
          <circle cx="12" cy="12" r="9"/>
          <path d="M15 9l-6 6"/>
          <path d="M9 9l6 6"/>
        </svg>
      );
    }

    return (
      <svg {...iconProps}>
        <rect x="3" y="4" width="18" height="18" rx="2"/>
        <path d="M16 2v4"/>
        <path d="M8 2v4"/>
        <path d="M3 10h18"/>
      </svg>
    );
  }

  if (kind === 'complaint') {
    if (type === 'In Progress') {
      return (
        <svg {...iconProps}>
          <path d="M21 12a9 9 0 01-15.5 6.2L3 16"/>
          <path d="M3 16h5"/>
          <path d="M3 16v5"/>
          <path d="M3 12a9 9 0 0115.5-6.2L21 8"/>
          <path d="M21 8h-5"/>
          <path d="M21 8V3"/>
        </svg>
      );
    }

    if (type === 'Resolved') {
      return (
        <svg {...iconProps}>
          <circle cx="12" cy="12" r="9"/>
          <path d="M8 12l3 3 5-6"/>
        </svg>
      );
    }

    if (type === 'Escalated') {
      return (
        <svg {...iconProps}>
          <path d="M12 3l10 18H2L12 3z"/>
          <path d="M12 9v5"/>
          <path d="M12 17h.01"/>
        </svg>
      );
    }

    return (
      <svg {...iconProps}>
        <path d="M9 3h6l1 2h3v16H5V5h3z"/>
        <path d="M9 9h6"/>
        <path d="M9 13h6"/>
        <path d="M9 17h4"/>
      </svg>
    );
  }

  if (kind === 'profile_change') {
    if (type === 'approved') {
      return (
        <svg {...iconProps}>
          <circle cx="12" cy="12" r="9"/>
          <path d="M8 12l3 3 5-6"/>
        </svg>
      );
    }

    return (
      <svg {...iconProps}>
        <circle cx="12" cy="12" r="9"/>
        <path d="M15 9l-6 6"/>
        <path d="M9 9l6 6"/>
      </svg>
    );
  }

  return (
    <svg {...iconProps}>
      <path d="M6 3h9l3 3v15H6z"/>
      <path d="M14 3v4h4"/>
      <path d="M9 12h6"/>
      <path d="M9 16h6"/>
    </svg>
  );
}

// ── Read stored user and map signup field names → topbar field names ─────────
// userlogin.jsx saves the full user object returned by /userlogin as JSON
// under the key "user" in localStorage (remember-me) or sessionStorage.
function normalizeUserProfile(u = {}) {
  const addressParts = (u.homeAddress || '').split(',').map(s => s.trim());
  const houseNo = addressParts[0] || '';
  const street  = addressParts.slice(1).join(', ') || u.homeAddress || '';

  return {
    firstName:   u.firstName   || '',
    middleName:  u.middleName  || '',
    lastName:    u.lastName    || '',
    // topbar uses "dateOfBirth"; signup stores "birthdate"
    dateOfBirth: u.birthdate   || u.dateOfBirth || '',
    sex:         u.sex         || '',
    civilStatus: u.civilStatus || '',
    nationality: u.nationality || '',
    // topbar uses "mobile"; signup stores "contactNumber"
    mobile:      u.contactNumber || u.mobile || '',
    email:       u.email         || '',
    houseNo,
    street,
    purok:           u.purok           || '',
    residencyStatus: u.residencyStatus || '',
    lengthOfStay:    u.lengthOfStay    || '',
    voterStatus:     u.voterStatus     || '',
    householdId:     u.householdId     || '',
    idType:          u.idType          || '',
    idNumber:        u.idNumber        || '',
    emergencyContactName:   u.emergencyContactName   || '',
    emergencyContactNumber: u.emergencyContactNumber || '',
    occupation:             u.occupation             || '',
    educationalAttainment:  u.educationalAttainment  || '',
  };
}

function getStoredUser() {
  try {
    const raw =
      localStorage.getItem('user') || sessionStorage.getItem('user');
    if (!raw) return null;
    return normalizeUserProfile(JSON.parse(raw));
  } catch {
    return null;
  }
}

function saveStoredUser(user) {
  try {
    const storage = localStorage.getItem('user') ? localStorage : sessionStorage;
    const existing = JSON.parse(storage.getItem('user') || '{}');
    storage.setItem('user', JSON.stringify({ ...existing, ...user }));
  } catch {
    /* ignore storage failures */
  }
}

// Fallback used only in dev / Storybook when no auth session exists
const EMPTY_USER = {
  firstName: '', middleName: '', lastName: '',
  dateOfBirth: '', sex: '', civilStatus: '', nationality: '',
  houseNo: '', street: '', purok: '',
  residencyStatus: '', lengthOfStay: '', voterStatus: '',
  householdId: '', mobile: '', email: '',
  idType: '', idNumber: '',
  emergencyContactName: '', emergencyContactNumber: '',
  occupation: '', educationalAttainment: '',
};

const SECTIONS = [
  {
    label: 'Personal Information',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="8" r="4"/>
        <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
      </svg>
    ),
    fields: [
      { key: 'firstName',   label: 'First Name',    editable: false },
      { key: 'middleName',  label: 'Middle Name',   editable: false },
      { key: 'lastName',    label: 'Last Name',     editable: false },
      { key: 'dateOfBirth', label: 'Date of Birth', editable: false },
      { key: 'sex',         label: 'Sex',           editable: false, options: SEX_OPTIONS },
      { key: 'civilStatus', label: 'Civil Status',  editable: false, options: CIVIL_STATUS_OPTIONS },
      { key: 'nationality', label: 'Nationality',   editable: false },
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
      { key: 'houseNo',         label: 'House No.',             editable: false },
      { key: 'street',          label: 'Street',                editable: false },
      { key: 'purok',           label: 'Purok',         editable: false, options: PUROK_OPTIONS },
      { key: 'residencyStatus', label: 'Residency Status',      editable: false, options: RESIDENCY_STATUS_OPTIONS },
      { key: 'lengthOfStay',    label: 'Length of Stay',        editable: false },
      { key: 'householdId',     label: 'Household / Family ID', editable: false },
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
      { key: 'mobile', label: 'Mobile Number', editable: true, type: 'tel' },
      { key: 'email',  label: 'Email Address', editable: true, type: 'email' },
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
      { key: 'occupation',            label: 'Occupation',             editable: true },
      { key: 'voterStatus',           label: 'Voter Status',           editable: false, options: VOTER_STATUS_OPTIONS },
      { key: 'educationalAttainment', label: 'Educational Attainment', editable: true, options: EDUCATIONAL_ATTAINMENT_OPTIONS },
    ],
  },
];

function toRequestPayload(data) {
  const fullAddress = [data.houseNo, data.street].filter(Boolean).join(', ');
  return {
    firstName: data.firstName || '',
    middleName: data.middleName || '',
    lastName: data.lastName || '',
    birthdate: data.dateOfBirth || '',
    sex: data.sex || '',
    civilStatus: data.civilStatus || '',
    nationality: data.nationality || '',
    contactNumber: data.mobile || '',
    email: data.email || '',
    homeAddress: fullAddress || data.street || data.houseNo || '',
    purok: data.purok || '',
    residencyStatus: data.residencyStatus || '',
    lengthOfStay: data.lengthOfStay || '',
    voterStatus: data.voterStatus || '',
    householdId: data.householdId || '',
    emergencyContactName: data.emergencyContactName || '',
    emergencyContactNumber: data.emergencyContactNumber || '',
    occupation: data.occupation || '',
    educationalAttainment: data.educationalAttainment || '',
  };
}

function normalizeProfileValue(value) {
  return String(value ?? '').trim();
}

function getChangedProfileData(originalData, updatedData) {
  const original = toRequestPayload(originalData);
  const updated = toRequestPayload(updatedData);

  return Object.keys(updated).reduce((changes, key) => {
    if (normalizeProfileValue(updated[key]) !== normalizeProfileValue(original[key])) {
      changes[key] = updated[key];
    }
    return changes;
  }, {});
}

function getProofRequiredFields(changedData = {}) {
  return PROFILE_PROOF_REQUIRED_FIELDS.filter(key => changedData[key] !== undefined);
}

async function uploadProfileProof(apiBase, file) {
  const formData = new FormData();
  formData.append('file', file);

  const res = await fetch(`${apiBase}/usersignup/upload-document`, {
    method: 'POST',
    body: formData,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || 'Failed to upload proof document.');
  return {
    url: data.url || '',
    filename: file.name || data.originalName || 'Proof document',
  };
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  return d.toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });
}

function toIsoDate(date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function getAdultBirthdateMax() {
  const date = new Date();
  date.setFullYear(date.getFullYear() - 18);
  return toIsoDate(date);
}

function formatBirthdateDigits(rawValue) {
  const raw = rawValue.replace(/\D/g, '').slice(0, 8);
  if (raw.length <= 2) return raw;
  if (raw.length <= 4) return raw.slice(0, 2) + '/' + raw.slice(2);
  return raw.slice(0, 2) + '/' + raw.slice(2, 4) + '/' + raw.slice(4);
}

function birthdateDisplayFromIso(value) {
  if (!value) return '';
  const [yyyy, mm, dd] = value.split('-');
  if (!yyyy || !mm || !dd) return '';
  return `${mm}/${dd}/${yyyy}`;
}

function isoFromBirthdateDigits(rawValue) {
  const raw = rawValue.replace(/\D/g, '').slice(0, 8);
  if (raw.length !== 8) return '';
  return `${raw.slice(4)}-${raw.slice(0, 2)}-${raw.slice(2, 4)}`;
}

function isValidIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return false;
  const [yyyy, mm, dd] = value.split('-').map(Number);
  const date = new Date(yyyy, mm - 1, dd);
  return (
    date.getFullYear() === yyyy &&
    date.getMonth() === mm - 1 &&
    date.getDate() === dd
  );
}

function ageFromBirthdate(value) {
  const [yyyy, mm, dd] = value.split('-').map(Number);
  const today = new Date();
  return today.getFullYear() - yyyy -
    (today < new Date(today.getFullYear(), mm - 1, dd) ? 1 : 0);
}

function validateRequestBirthdate(value, displayValue) {
  if (displayValue && !value) return 'Please enter a complete date of birth.';
  if (!value) return '';
  if (!isValidIsoDate(value)) return 'Please enter a valid date of birth.';
  if (value > toIsoDate(new Date())) return 'Date of birth cannot be a future date.';
  if (ageFromBirthdate(value) < 18) return 'Resident must be at least 18 years old.';
  return '';
}

const LockIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="10" height="10">
    <rect x="3" y="11" width="18" height="11" rx="2"/>
    <path d="M7 11V7a5 5 0 0110 0v4"/>
  </svg>
);

function FieldControl({ field, value, onChange, className }) {
  if (field.options) {
    return (
      <select
        className={className}
        value={value || ''}
        onChange={e => onChange(e.target.value)}
      >
        <option value="">Select...</option>
        {field.options.map(option => (
          <option key={option} value={option}>{option}</option>
        ))}
      </select>
    );
  }

  return (
    <input
      className={className}
      type={field.type || 'text'}
      value={value || ''}
      onChange={e => onChange(e.target.value)}
    />
  );
}

export default function UserTopbar({
  placeholder = 'Search...',
  search = '',
  onSearch,
  setSearch,
  avatarSrc = '',
  showBellDot = false,
  onHamburger,
  sidebarOpen,
  setSidebarOpen,
  // `user` prop can still be passed in (e.g. from a parent that fetches
  // the profile via API). If omitted, we fall back to storage → EMPTY_USER.
  user,
}) {
  const navigate = useNavigate();

  // Initialise formData from: prop > storage > empty fallback
  const [profileBaseline, setProfileBaseline] = useState(() => {
    const stored = getStoredUser();
    return { ...EMPTY_USER, ...(stored || {}), ...(user || {}) };
  });
  const [formData, setFormData] = useState(() => {
    const stored = getStoredUser();
    return { ...EMPTY_USER, ...(stored || {}), ...(user || {}) };
  });

  const [panelOpen,     setPanelOpen]     = useState(false);
  const [modalOpen,     setModalOpen]     = useState(false);
  const [requestOpen,   setRequestOpen]   = useState(false);
  const [requestData,   setRequestData]   = useState(() => ({ ...formData }));
  const [requestBirthdateDisplay, setRequestBirthdateDisplay] = useState(() => birthdateDisplayFromIso(formData.dateOfBirth));
  const [requestNote,   setRequestNote]   = useState('');
  const [requestProofFile, setRequestProofFile] = useState(null);
  const [requestStatus, setRequestStatus] = useState({ type: '', message: '' });
  const [requestErrors, setRequestErrors] = useState({});
  const [requestSaving, setRequestSaving] = useState(false);
  const [requestSent,   setRequestSent]   = useState(false);
  const [activeSection, setActiveSection] = useState(0);
  const [saved,         setSaved]         = useState(false);
  const [bellOpen,      setBellOpen]      = useState(false);
  const [notifs,        setNotifs]        = useState(() => loadNotifs());
  const [chatUnreadTotal, setChatUnreadTotal] = useState(0);
  const [chatUnreadLoaded, setChatUnreadLoaded] = useState(false);
  const [chatUnreadSeen, setChatUnreadSeen] = useState(() => loadChatUnreadSeen());
  const [bellDotSeen,   setBellDotSeen]   = useState(() => loadBellDotSeen());
  const prevBellOpen    = useRef(false);
  // QR code state
  const [qrToken,       setQrToken]       = useState('');
  const [qrLoading,     setQrLoading]     = useState(false);
  const [qrError,       setQrError]       = useState('');
  const [qrPanelOpen,   setQrPanelOpen]   = useState(false);
  const qrRef = useRef(null);
  const panelRef = useRef(null);
  const bellRef  = useRef(null);
  const isLast   = activeSection === SECTIONS.length - 1;
  const profileOverlayOpen = modalOpen || requestOpen;

  const unreadNotifCount = notifs.filter(n => !n.read && n.kind !== 'chat').length;
  const chatUnread = Math.max(0, chatUnreadTotal - chatUnreadSeen);
  const unreadCount = unreadNotifCount + chatUnread;
  const showNotificationDot = showBellDot && unreadCount === 0 && !bellDotSeen;

  const markBellDotSeen = useCallback(() => {
    setBellDotSeen(true);
    saveBellDotSeen();
  }, []);

  const markChatUnreadSeen = useCallback((count) => {
    const safeCount = Math.max(0, Number(count) || 0);
    setChatUnreadSeen(safeCount);
    saveChatUnreadSeen(safeCount);
  }, []);

  const markChatUnreadOnBackend = useCallback(async () => {
    const token = localStorage.getItem('token') || sessionStorage.getItem('token') || '';
    const apiBase = import.meta.env.VITE_BACKEND_URL || '';
    if (!token || !apiBase) return;

    try {
      const res = await fetch(`${apiBase}/chat/my-conversation/read`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      setChatUnreadTotal(0);
      markChatUnreadSeen(0);
    } catch {
      /* local seen state still prevents a stale badge in this tab */
    }
  }, [markChatUnreadSeen]);

  // Mark all read the moment the bell opens (false → true edge only).
  // Using refs for chatUnreadTotal/Seen so we don't add them to the dep
  // array — that was the loop that caused notifications to vanish.
  const chatUnreadTotalRef = useRef(chatUnreadTotal);
  const chatUnreadSeenRef  = useRef(chatUnreadSeen);
  useEffect(() => { chatUnreadTotalRef.current = chatUnreadTotal; }, [chatUnreadTotal]);
  useEffect(() => { chatUnreadSeenRef.current  = chatUnreadSeen;  }, [chatUnreadSeen]);

  useEffect(() => {
    const justOpened = bellOpen && !prevBellOpen.current;
    prevBellOpen.current = bellOpen;
    if (!justOpened) return;

    // Mark every notification as read and persist immediately
    setNotifs(prev => {
      const hasUnread = prev.some(n => !n.read);
      if (!hasUnread) return prev;
      const updated = prev.map(n => ({ ...n, read: true }));
      saveNotifs(updated);
      return updated;
    });

    const total   = chatUnreadTotalRef.current;
    const seen    = chatUnreadSeenRef.current;
    const pending = Math.max(0, total - seen);
    markBellDotSeen();
    markChatUnreadSeen(total);
    if (pending > 0) markChatUnreadOnBackend();
  }, [bellOpen, markBellDotSeen, markChatUnreadSeen, markChatUnreadOnBackend]);

  useEffect(() => {
    if (chatUnreadLoaded && chatUnreadTotal < chatUnreadSeen) {
      markChatUnreadSeen(chatUnreadTotal);
    }
  }, [chatUnreadLoaded, chatUnreadTotal, chatUnreadSeen, markChatUnreadSeen]);

  // Socket listener — pick up new / updated / deleted announcements
  useEffect(() => {
    const token =
      localStorage.getItem('token') ||
      sessionStorage.getItem('token') || '';
    const socket = io(
      import.meta.env.VITE_SOCKET_URL ||
      import.meta.env.VITE_BACKEND_URL?.replace('/api', '') || '',
      { auth: { token }, transports: ['websocket'] }
    );

    socket.on('announcement_created', (ann) => {
      setNotifs(prev => {
        if (prev.some(n => n._id === ann._id)) return prev;
        const next = [{
          _id:      ann._id,
          title:    ann.title,
          category: ann.category,
          author:   ann.author,
          body:     ann.body,
          ts:       ann.createdAt || new Date().toISOString(),
          read:     false,
          type:     'new',
        }, ...prev].slice(0, 50);
        saveNotifs(next);
        return next;
      });
    });

    socket.on('announcement_updated', (ann) => {
      setNotifs(prev => {
        // If it already exists as a notif, patch title/body; add an "updated" notif otherwise
        const exists = prev.some(n => n._id === ann._id && n.type === 'updated');
        if (exists) {
          const next = prev.map(n =>
            n._id === ann._id && n.type === 'updated'
              ? { ...n, title: ann.title, body: ann.body, ts: ann.updatedAt || new Date().toISOString(), read: false }
              : n
          );
          saveNotifs(next);
          return next;
        }
        const next = [{
          _id:      ann._id,
          title:    ann.title,
          category: ann.category,
          author:   ann.author,
          body:     ann.body,
          ts:       ann.updatedAt || new Date().toISOString(),
          read:     false,
          type:     'updated',
        }, ...prev].slice(0, 50);
        saveNotifs(next);
        return next;
      });
    });


    // ── Chat: admin replied → bump unread badge on bell (user side) ──────────
    // User's conversation room is joined by userbarangaysupport; here we just
    // track the unreadUser count from the conversation REST endpoint on mount.
    // Real-time bump: listen for 'new_message' emitted to conv room.
    // Since this socket isn't in the conv room, we poll via the REST endpoint
    // when a 'conversation_updated' is NOT available to users. Instead, we add
    // a lightweight second listener on the user's personal room — the server
    // already sends targeted events to user_${id}, so we listen for a custom
    // 'chat_unread_update' event we'll emit from the route when admin replies.
    // For now, load initial unread count from REST on mount.
    const loadChatUnread = async () => {
      const tok = localStorage.getItem('token') || sessionStorage.getItem('token') || '';
      const apiBase = import.meta.env.VITE_BACKEND_URL || '';
      if (!tok || !apiBase) {
        setChatUnreadLoaded(true);
        return;
      }
      try {
        const r = await fetch(`${apiBase}/chat/my-conversation`, {
          headers: { Authorization: `Bearer ${tok}` },
        });
        if (!r.ok) return;
        const conv = await r.json();
        const unreadUser = conv.unreadUser || 0;
        setChatUnreadTotal(unreadUser);
        if (unreadUser > 0) {
          upsertChatNotif(setNotifs, unreadUser, unreadUser > loadChatUnreadSeen());
        }
      } catch {
        /* ignore chat unread fetch failures */
      } finally {
        setChatUnreadLoaded(true);
      }
    };
    loadChatUnread();

    // Real-time: server.js emits new_message to conv room; we can't join that
    // room from here. So listen for the 'chat_unread_update' event sent to user room.
    socket.on('chat_unread_update', ({ unreadUser }) => {
      const count = unreadUser || 0;
      setChatUnreadLoaded(true);
      setChatUnreadTotal(count);
      if (count > 0) upsertChatNotif(setNotifs, count, count > loadChatUnreadSeen());
    });

    socket.on('profile_change_request_updated', (payload) => {
      const request = payload?.request || payload;
      const updatedUser = payload?.user;
      const reviewedField = request?.reviewedField;
      const reviewedStatus = request?.reviewedStatus || request?.fieldReviews?.[reviewedField]?.status || '';

      if (reviewedField && reviewedStatus) {
        const approved = reviewedStatus === 'approved';
        const label = PROFILE_CHANGE_LABELS[reviewedField] || reviewedField;
        pushNotif(setNotifs, `profile-${request._id}-${reviewedField}-${reviewedStatus}-${request.updatedAt || Date.now()}`, {
          kind: 'profile_change',
          type: reviewedStatus,
          color: approved ? '#16a34a' : '#dc2626',
          label: approved ? 'Profile Update Approved' : 'Profile Update Denied',
          title: label,
          body: approved
            ? `${label} was approved and applied to your profile.`
            : `${label} change was denied by the barangay admin.`,
        });
      }

      if (!updatedUser) return;

      saveStoredUser(updatedUser);
      const normalized = normalizeUserProfile(updatedUser);
      setProfileBaseline(prev => ({ ...prev, ...normalized }));
      setFormData(prev => ({ ...prev, ...normalized }));
      setRequestData(prev => ({ ...prev, ...normalized }));
    });

    return () => socket.disconnect();
  }, []);

  // ── Appointment & Complaint socket events (targeted to this user's room) ──
  useEffect(() => {
    const token = localStorage.getItem('token') || sessionStorage.getItem('token') || '';
    if (!token) return;
    const s = io(
      import.meta.env.VITE_SOCKET_URL ||
      import.meta.env.VITE_BACKEND_URL?.replace('/api', '') || '',
      { auth: { token }, transports: ['websocket'] }
    );

    // Appointment: cancelled by admin
    s.on('appointment_cancelled_by_admin', (appt) => {
      const cfg = APPT_NOTIF['appointment_cancelled_by_admin'];
      pushNotif(setNotifs, apptNotifId(appt._id, 'appointment_cancelled_by_admin'), {
        kind: 'appointment', type: 'appointment_cancelled_by_admin',
        appointmentId: appt._id,
        color: cfg.color, label: cfg.label,
        title: appt.purpose, date: appt.date, time: appt.time,
        extra: appt.cancelReason || '',
      });
    });

    // Appointment: closed (time passed)
    s.on('appointment_closed', (appt) => {
      const cfg = APPT_NOTIF['appointment_closed'];
      pushNotif(setNotifs, apptNotifId(appt._id, 'appointment_closed'), {
        kind: 'appointment', type: 'appointment_closed',
        appointmentId: appt._id,
        color: cfg.color, label: cfg.label,
        title: appt.purpose, date: appt.date, time: appt.time, extra: '',
      });
    });

    // Complaint: status changed by admin
    s.on('complaint_status_updated', (cmp) => {
      const cfg = COMPLAINT_STATUS_NOTIF[cmp.status] || { color: '#6b7280', label: cmp.status };
      const uid = `cmp-${cmp._id}-${cmp.status}-${Date.now()}`;
      pushNotif(setNotifs, uid, {
        kind:     'complaint',
        type:     cmp.status,
        color:    cfg.color,
        label:    cfg.label,
        title:    cmp.category,
        complaintId: cmp._id,
        cmpId:    cmp.id,
        prevStatus: cmp.prevStatus || '',
        newStatus:  cmp.status,
        resolutionNote: cmp.resolutionNote || '',
        extra:    '',
      });
    });

    return () => s.disconnect();
  }, []);

  // ── 24h & 1h client-side appointment reminder scheduler ──
  useEffect(() => {
    const API_URL = import.meta.env.VITE_BACKEND_URL;
    const token = localStorage.getItem('token') || sessionStorage.getItem('token') || '';
    if (!token || !API_URL) return;
    const timers = [];

    const scheduleReminders = async () => {
      try {
        const res = await fetch(`${API_URL}/appointments`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const appointments = await res.json();
        const reminded = loadReminded();
        const now = Date.now();

        for (const appt of appointments) {
          if (appt.status !== 'Scheduled') continue;
          if (!appt.rawDate || !appt.rawTime) continue;
          const [y, mo, d] = appt.rawDate.split('-').map(Number);
          const [h, mi] = appt.rawTime.split(':').map(Number);
          const apptMs = new Date(y, mo - 1, d, h, mi, 0).getTime();
          const ms24 = apptMs - 24 * 60 * 60 * 1000;
          const ms1  = apptMs - 60 * 60 * 1000;
          const k24  = apptNotifId(appt._id, 'reminder_24h');
          const k1   = apptNotifId(appt._id, 'reminder_1h');

          if (!reminded[k24]) {
            if (ms24 > now) {
              timers.push(setTimeout(() => {
                const cfg = APPT_NOTIF['reminder_24h'];
                pushNotif(setNotifs, k24, { kind:'appointment', type:'reminder_24h', appointmentId:appt._id, color:cfg.color, label:cfg.label, title:appt.purpose, date:appt.date, time:appt.time, extra:'' });
                reminded[k24] = true; saveReminded(reminded);
              }, ms24 - now));
            } else if (apptMs > now) {
              const cfg = APPT_NOTIF['reminder_24h'];
              pushNotif(setNotifs, k24, { kind:'appointment', type:'reminder_24h', appointmentId:appt._id, color:cfg.color, label:cfg.label, title:appt.purpose, date:appt.date, time:appt.time, extra:'' });
              reminded[k24] = true;
            }
          }

          if (!reminded[k1]) {
            if (ms1 > now) {
              timers.push(setTimeout(() => {
                const cfg = APPT_NOTIF['reminder_1h'];
                pushNotif(setNotifs, k1, { kind:'appointment', type:'reminder_1h', appointmentId:appt._id, color:cfg.color, label:cfg.label, title:appt.purpose, date:appt.date, time:appt.time, extra:'' });
                reminded[k1] = true; saveReminded(reminded);
              }, ms1 - now));
            } else if (apptMs > now) {
              const cfg = APPT_NOTIF['reminder_1h'];
              pushNotif(setNotifs, k1, { kind:'appointment', type:'reminder_1h', appointmentId:appt._id, color:cfg.color, label:cfg.label, title:appt.purpose, date:appt.date, time:appt.time, extra:'' });
              reminded[k1] = true;
            }
          }

          // Fire closed notif at exact appointment time
          if (apptMs > now) {
            timers.push(setTimeout(() => {
              const cfg = APPT_NOTIF['appointment_closed'];
              pushNotif(setNotifs, apptNotifId(appt._id, 'appointment_closed'), { kind:'appointment', type:'appointment_closed', appointmentId:appt._id, color:cfg.color, label:cfg.label, title:appt.purpose, date:appt.date, time:appt.time, extra:'' });
            }, apptMs - now));
          }
        }
        saveReminded(reminded);
      } catch { /* silent */ }
    };

    scheduleReminders();
    return () => timers.forEach(clearTimeout);
  }, []);

  // Sync badge state from localStorage when another tab/page updates it
  useEffect(() => {
    function onStorage(e) {
      if (e.key === STORAGE_KEY)        setNotifs(loadNotifs());
      if (e.key === BELL_DOT_SEEN_KEY)  setBellDotSeen(loadBellDotSeen());
      if (e.key === CHAT_UNREAD_SEEN_KEY) setChatUnreadSeen(loadChatUnreadSeen());
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // Close bell panel on outside click
  useEffect(() => {
    function handleClick(e) {
      if (
        bellOpen &&
        bellRef.current &&
        !bellRef.current.contains(e.target) &&
        !e.target.closest('.user-topbar__bell')
      ) setBellOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [bellOpen, unreadCount]);

  // Close sidebar on outside click (mobile)
  useEffect(() => {
    if (!sidebarOpen) return;
    function handler(e) {
      if (e.target.closest('.user-topbar__hamburger')) return;
      if (e.target.closest('.usb-sidebar')) return;
      setSidebarOpen?.(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [sidebarOpen, setSidebarOpen]);

  // If the parent passes a refreshed `user` prop later, merge it in
  useEffect(() => {
    if (user) {
      setProfileBaseline(prev => ({ ...prev, ...user }));
      setFormData(prev => ({ ...prev, ...user }));
    }
  }, [user]);

  // Close side panel on outside click
  useEffect(() => {
    function handleClick(e) {
      if (
        panelOpen &&
        panelRef.current &&
        !panelRef.current.contains(e.target) &&
        !e.target.closest('.user-topbar__avatar-btn')
      ) setPanelOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [panelOpen]);

  // Lock body scroll while modal is open
  useEffect(() => {
    document.body.style.overflow = profileOverlayOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [profileOverlayOpen]);

  // ── QR token fetch + countdown ───────────────────────────────────────────────
  const fetchQrToken = useCallback(async () => {
    setQrLoading(true);
    setQrError('');
    setQrToken('');
    try {
      const token = localStorage.getItem('token') || sessionStorage.getItem('token') || '';
      const apiBase = import.meta.env.VITE_BACKEND_URL || '';

      if (!token) {
        setQrError('You are not logged in. Please sign in again.');
        return;
      }
      if (!apiBase) {
        setQrError('Server configuration missing. Contact support.');
        return;
      }

      const res = await fetch(`${apiBase}/user/generate-qr-token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });

      let data;
      try { data = await res.json(); } catch { data = {}; }

      if (res.ok && data.qrToken) {
        setQrToken(data.qrToken);
      } else if (res.status === 401) {
        setQrError('Session expired. Please sign in again.');
      } else if (res.status === 403) {
        setQrError(data.message || 'Your account is not yet approved.');
      } else if (res.status === 404) {
        setQrError('Account not found. Contact the barangay office.');
      } else {
        setQrError(data.message || `Server error (${res.status}). Please try again.`);
      }
    } catch {
      setQrError('Unable to connect to the server. Check your connection and try again.');
    } finally {
      setQrLoading(false);
    }
  }, []);

  function openQrPanel() {
    setQrPanelOpen(true);
    fetchQrToken();
  }

  function closeQrPanel() {
    setQrPanelOpen(false);
    setQrToken('');
    setQrError('');
  }

  function downloadQr() {
    const svgEl = qrRef.current?.querySelector('svg');
    if (!svgEl) return;

    const svgData = new XMLSerializer().serializeToString(svgEl);
    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    const img = new Image();
    img.onload = () => {
      const padding = 24;
      const size = img.width + padding * 2;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, size, size);
      ctx.drawImage(img, padding, padding, img.width, img.height);
      URL.revokeObjectURL(url);
      const link = document.createElement('a');
      const safeName = fullName.replace(/\s+/g, '_') || 'resident';
      link.download = `QR_${safeName}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    };
    img.src = url;
  }

  function toggleBellPanel() {
    const nextOpen = !bellOpen;
    setBellOpen(nextOpen);
    setPanelOpen(false);
  }

  function openModal() {
    setActiveSection(0);
    setSaved(false);
    setModalOpen(true);
    setPanelOpen(false);
  }

  function handleSave() {
    // Persist editable changes back to storage so they survive a page refresh
    try {
      const key = localStorage.getItem('user') ? 'localStorage' : 'sessionStorage';
      const raw = (key === 'localStorage' ? localStorage : sessionStorage).getItem('user');
      if (raw) {
        const stored = JSON.parse(raw);
        // Map topbar keys back to the DB keys where they differ
        const updated = {
          ...stored,
          contactNumber: formData.mobile,
          email:         formData.email,
          occupation:    formData.occupation,
          educationalAttainment: formData.educationalAttainment,
        };
        (key === 'localStorage' ? localStorage : sessionStorage)
          .setItem('user', JSON.stringify(updated));
      }
    } catch { /* non-critical */ }

    setSaved(true);
    setTimeout(() => {
      setSaved(false);
      setModalOpen(false);
      setActiveSection(0);
    }, 1400);
  }

  function handleFieldChange(key, value) {
    setFormData(prev => ({ ...prev, [key]: value }));
  }

  function openRequestPanel() {
    setRequestData({ ...formData });
    setRequestBirthdateDisplay(birthdateDisplayFromIso(formData.dateOfBirth));
    setRequestNote('');
    setRequestProofFile(null);
    setRequestStatus({ type: '', message: '' });
    setRequestErrors({});
    setRequestSent(false);
    setRequestOpen(true);
  }

  function closeRequestPanel() {
    setRequestOpen(false);
    setRequestSent(false);
    setRequestProofFile(null);
    setRequestStatus({ type: '', message: '' });
    setRequestErrors({});
  }

  function closeRequestSuccess() {
    setRequestOpen(false);
    setRequestSent(false);
    setRequestProofFile(null);
    setRequestStatus({ type: '', message: '' });
    setRequestErrors({});
    setModalOpen(false);
  }

  function handleRequestFieldChange(key, value) {
    setRequestData(prev => ({ ...prev, [key]: value }));
    setRequestErrors(prev => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
    if (requestStatus.type === 'error') setRequestStatus({ type: '', message: '' });
  }

  function handleRequestBirthdateTextChange(e) {
    const raw = e.target.value.replace(/\D/g, '').slice(0, 8);
    setRequestBirthdateDisplay(formatBirthdateDigits(raw));
    handleRequestFieldChange('dateOfBirth', raw.length === 8 ? isoFromBirthdateDigits(raw) : '');
  }

  function handleRequestBirthdateKeyDown(e) {
    if (e.key !== 'Backspace') return;
    e.preventDefault();
    const raw = requestBirthdateDisplay.replace(/\D/g, '').slice(0, -1);
    setRequestBirthdateDisplay(formatBirthdateDigits(raw));
    handleRequestFieldChange('dateOfBirth', raw.length === 8 ? isoFromBirthdateDigits(raw) : '');
  }

  function handleRequestBirthdatePick(value) {
    setRequestBirthdateDisplay(birthdateDisplayFromIso(value));
    handleRequestFieldChange('dateOfBirth', value);
  }

  async function submitInformationRequest() {
    const birthdateError = validateRequestBirthdate(requestData.dateOfBirth, requestBirthdateDisplay);
    if (birthdateError) {
      setRequestErrors({ dateOfBirth: birthdateError });
      setRequestStatus({ type: 'error', message: birthdateError });
      return;
    }

    const changedData = getChangedProfileData(profileBaseline, requestData);
    if (Object.keys(changedData).length === 0) {
      setRequestStatus({ type: 'error', message: 'Please change something before sending a request.' });
      return;
    }

    const proofRequiredFields = getProofRequiredFields(changedData);
    if (proofRequiredFields.length > 0 && !requestProofFile) {
      setRequestStatus({
        type: 'error',
        message: `Please upload a valid ID or supporting document for ${proofRequiredFields.map(key => PROFILE_CHANGE_LABELS[key] || key).join(', ')}.`,
      });
      return;
    }

    const token = localStorage.getItem('token') || sessionStorage.getItem('token') || '';
    const apiBase = import.meta.env.VITE_BACKEND_URL || '';
    if (!token || !apiBase) {
      setRequestStatus({ type: 'error', message: 'Please log in again before sending a request.' });
      return;
    }

    setRequestSaving(true);
    setRequestStatus({ type: '', message: '' });
    try {
      let proofDocument = { url: '', filename: '' };
      if (proofRequiredFields.length > 0 && requestProofFile) {
        proofDocument = await uploadProfileProof(apiBase, requestProofFile);
      }

      const res = await fetch(`${apiBase}/profile-change-requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          requestedData: changedData,
          note: requestNote,
          proofDocumentUrl: proofDocument.url,
          proofDocumentName: proofDocument.filename,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Failed to submit request.');
      setRequestStatus({ type: '', message: '' });
      setRequestSent(true);
    } catch (err) {
      setRequestStatus({ type: 'error', message: err.message || 'Failed to submit request.' });
    } finally {
      setRequestSaving(false);
    }
  }

  function openNotificationPath(path, state = {}) {
    markBellDotSeen();
    markChatUnreadSeen(chatUnreadTotal);
    setBellOpen(false);
    setPanelOpen(false);
    navigate(path, Object.keys(state).length ? { state } : undefined);
  }

  function openNotification(n) {
    if (n.kind === 'chat') {
      openNotificationPath('/userbarangaysupport');
      return;
    }

    if (n.kind === 'appointment') {
      openNotificationPath('/userappointments', { appointmentId: n.appointmentId || n._id || '' });
      return;
    }

    if (n.kind === 'complaint') {
      openNotificationPath('/usercomplaints', { complaintId: n.complaintId || n.cmpId || n._id || '' });
      return;
    }

    if (n.kind === 'profile_change') {
      markBellDotSeen();
      markChatUnreadSeen(chatUnreadTotal);
      setBellOpen(false);
      setPanelOpen(false);
      openModal();
      return;
    }

    openNotificationPath('/userannouncements', { announcementId: n._id || '' });
  }

  const fullName     = [formData.firstName, formData.middleName, formData.lastName].filter(Boolean).join(' ') || 'Resident';
  const shortAddress = [formData.purok, formData.street].filter(Boolean).join(', ') || 'New Cabalan';
  const requestPreviewChanges = getChangedProfileData(profileBaseline, requestData);
  const requestProofFields = getProofRequiredFields(requestPreviewChanges);
  const requestNeedsProof = requestProofFields.length > 0;

  // Age calc
  const age = (() => {
    if (!formData.dateOfBirth) return '—';
    const d   = new Date(formData.dateOfBirth);
    const now = new Date();
    const a   = now.getFullYear() - d.getFullYear();
    return isNaN(a) ? '—' : `${a} years old`;
  })();

  return (
    <>
      {/* ─── Topbar ─── */}
      <header className="user-topbar">
        {/* Hamburger — mobile only */}
        {onHamburger && (
          <button className="user-topbar__hamburger" onClick={onHamburger} aria-label="Open menu">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="22" height="22">
              <line x1="3" y1="6"  x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
        )}
        <div className="user-topbar__search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8"/>
            <line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            type="text"
            placeholder={placeholder}
            value={search}
            onChange={(e) => (onSearch || setSearch)?.(e.target.value)}
          />
        </div>

        <div className="user-topbar__actions">
          <button
            className={`user-topbar__bell${bellOpen ? ' user-topbar__bell--active' : ''}`}
            aria-label="Notifications"
            onClick={toggleBellPanel}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/>
              <path d="M13.73 21a2 2 0 01-3.46 0"/>
            </svg>
            {unreadCount > 0 && (
              <span className="user-topbar__bell-badge">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
            {showNotificationDot && <span className="user-topbar__bell-dot" />}
          </button>

          <button
            className="user-topbar__avatar-btn"
            onClick={() => setPanelOpen(v => !v)}
            aria-label="Open profile"
          >
            {avatarSrc ? (
              <img src={avatarSrc} alt="My profile" className="user-topbar__avatar"/>
            ) : (
              <svg
                className="user-topbar__avatar user-topbar__avatar--blank"
                width="36" height="36" viewBox="0 0 36 36" fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <circle cx="18" cy="18" r="18" fill="#e5e7eb"/>
                <circle cx="18" cy="14" r="6" fill="#b0b3b8"/>
                <ellipse cx="18" cy="26" rx="9" ry="6" fill="#b0b3b8"/>
              </svg>
            )}
          </button>
        </div>
      </header>

      {/* ─── Bell Notification Panel ─── */}
      <div
        className={`utb-notif-panel${bellOpen ? ' utb-notif-panel--open' : ''}`}
        ref={bellRef}
        inert={!bellOpen ? true : undefined}
      >
        {/* Panel header */}
        <div className="utb-notif-header">
          <div className="utb-notif-header-left">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
              <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/>
              <path d="M13.73 21a2 2 0 01-3.46 0"/>
            </svg>
            <span>Notifications</span>
            {notifs.length > 0 && (
              <span className="utb-notif-count">{notifs.length}</span>
            )}
          </div>
          <div className="utb-notif-header-right">
            {notifs.length > 0 && (
              <button
                className="utb-notif-clear"
                onClick={() => {
                  setNotifs([]);
                  saveNotifs([]);
                  markBellDotSeen();
                  markChatUnreadSeen(chatUnreadTotal);
                }}
                title="Clear all"
              >
                Clear all
              </button>
            )}
            <button className="utb-panel-close" onClick={() => setBellOpen(false)} aria-label="Close">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
        </div>

        <div className="utb-notif-divider"/>

        {/* Notification list */}
        <div className="utb-notif-list">
          {notifs.length === 0 ? (
            <div className="utb-notif-empty">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="32" height="32">
                <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                <path d="M13.73 21a2 2 0 01-3.46 0"/>
              </svg>
              <span>No notifications yet</span>
              <p>New announcements and updates from the barangay will appear here.</p>
            </div>
          ) : (
            notifs.map(n => {
              if (n.kind === 'chat') {
                const count = Math.max(0, Number(n.unreadMessages) || 0);
                return (
                  <button
                    key={n.uid}
                    type="button"
                    className={`utb-notif-item utb-notif-item--icon${n.read ? '' : ' utb-notif-item--unread'}`}
                    onClick={() => openNotification(n)}
                  >
                    <div className="utb-notif-icon-wrap" style={{ background: '#2563eb18', color: '#2563eb' }}>
                      <NotificationIcon kind="chat" />
                    </div>
                    <div className="utb-notif-body">
                      <div className="utb-notif-top">
                        <span className="utb-notif-cat" style={{ background: '#2563eb18', color: '#2563eb' }}>Barangay Support</span>
                        <span className="utb-notif-time">{fmtRelative(n.ts)}</span>
                      </div>
                      <p className="utb-notif-title">{n.body || `You have ${count || 1} unread message${count === 1 ? '' : 's'} from the barangay.`}</p>
                      <p className="utb-notif-sub">Open Barangay Support to view.</p>
                    </div>
                  </button>
                );
              }

              // ── Appointment notification ──
              if (n.kind === 'appointment') {
                const cfg = APPT_NOTIF[n.type] || { color: '#6b7280', label: n.type };
                return (
                  <button
                    key={n.uid || `${n._id}-${n.type}`}
                    type="button"
                    className={`utb-notif-item utb-notif-item--icon${n.read ? '' : ' utb-notif-item--unread'}`}
                    onClick={() => openNotification(n)}
                  >
                    <div className="utb-notif-icon-wrap" style={{ background: cfg.color + '18', color: cfg.color }}>
                      <NotificationIcon kind="appointment" type={n.type} />
                    </div>
                    <div className="utb-notif-body">
                      <div className="utb-notif-top">
                        <span className="utb-notif-cat" style={{ background: cfg.color + '18', color: cfg.color }}>{cfg.label}</span>
                        <span className="utb-notif-time">{fmtRelative(n.ts)}</span>
                      </div>
                      <p className="utb-notif-title">{n.title}</p>
                      <p className="utb-notif-sub">
                        {n.type === 'reminder_24h'                   && `Tomorrow · ${n.date} at ${n.time}`}
                        {n.type === 'reminder_1h'                    && `Starting in ~1 hour · ${n.date} at ${n.time}`}
                        {n.type === 'appointment_closed'             && `Your appointment on ${n.date} at ${n.time} has been closed.`}
                        {n.type === 'appointment_cancelled_by_admin' && `Cancelled · ${n.date} at ${n.time}${n.extra ? ` — "${n.extra}"` : ''}`}
                      </p>
                    </div>
                  </button>
                );
              }

              // ── Complaint status notification ──
              if (n.kind === 'complaint') {
                const cfg = COMPLAINT_STATUS_NOTIF[n.newStatus] || { color: '#6b7280', label: n.newStatus };
                return (
                  <button
                    key={n.uid}
                    type="button"
                    className={`utb-notif-item utb-notif-item--icon${n.read ? '' : ' utb-notif-item--unread'}`}
                    onClick={() => openNotification(n)}
                  >
                    <div className="utb-notif-icon-wrap" style={{ background: cfg.color + '18', color: cfg.color }}>
                      <NotificationIcon kind="complaint" type={n.newStatus} />
                    </div>
                    <div className="utb-notif-body">
                      <div className="utb-notif-top">
                        <span className="utb-notif-cat" style={{ background: cfg.color + '18', color: cfg.color }}>{cfg.label}</span>
                        <span className="utb-notif-time">{fmtRelative(n.ts)}</span>
                      </div>
                      <p className="utb-notif-title">{n.title}</p>
                      <p className="utb-notif-sub">
                        Your complaint
                        {n.prevStatus ? ` has moved from ${n.prevStatus} →` : ' is now'}
                        {' '}<strong>{n.newStatus}</strong>
                        {n.cmpId ? ` · ${n.cmpId}` : ''}
                      </p>
                      {n.resolutionNote && (
                        <p className="utb-notif-note">"{n.resolutionNote}"</p>
                      )}
                    </div>
                  </button>
                );
              }

              if (n.kind === 'profile_change') {
                return (
                  <button
                    key={n.uid}
                    type="button"
                    className={`utb-notif-item utb-notif-item--icon${n.read ? '' : ' utb-notif-item--unread'}`}
                    onClick={() => openNotification(n)}
                  >
                    <div className="utb-notif-icon-wrap" style={{ background: n.color + '18', color: n.color }}>
                      <NotificationIcon kind="profile_change" type={n.type} />
                    </div>
                    <div className="utb-notif-body">
                      <div className="utb-notif-top">
                        <span className="utb-notif-cat" style={{ background: n.color + '18', color: n.color }}>{n.label}</span>
                        <span className="utb-notif-time">{fmtRelative(n.ts)}</span>
                      </div>
                      <p className="utb-notif-title">{n.title}</p>
                      <p className="utb-notif-sub">{n.body}</p>
                    </div>
                  </button>
                );
              }

              // ── Announcement notification (default) ──
              return (
                <button
                  key={`${n._id}-${n.type}`}
                  type="button"
                  className={`utb-notif-item${n.read ? '' : ' utb-notif-item--unread'}`}
                  onClick={() => openNotification(n)}
                >
                  <div className="utb-notif-dot" style={{ background: CAT_COLOR[n.category] || '#6b7280' }} />
                  <div className="utb-notif-body">
                    <div className="utb-notif-top">
                      <span className="utb-notif-cat" style={{ background: (CAT_COLOR[n.category] || '#6b7280') + '18', color: CAT_COLOR[n.category] || '#6b7280' }}>
                        {n.category}
                      </span>
                      {n.type === 'updated' && <span className="utb-notif-updated-tag">Updated</span>}
                      <span className="utb-notif-time">{fmtRelative(n.ts)}</span>
                    </div>
                    <p className="utb-notif-title">{n.title}</p>
                    <p className="utb-notif-sub">{n.body}</p>
                    <p className="utb-notif-author">by {n.author}</p>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* ─── Side Profile Panel ─── */}
      <div
        className={`utb-profile-panel${panelOpen ? ' utb-profile-panel--open' : ''}`}
        ref={panelRef}
        inert={!panelOpen ? true : undefined}
      >
        <button className="utb-panel-close" onClick={() => setPanelOpen(false)} aria-label="Close panel">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>

        <div className="utb-panel-header">
          {avatarSrc ? (
            <img src={avatarSrc} alt="avatar" className="utb-panel-avatar"/>
          ) : (
            <svg
              className="utb-panel-avatar utb-panel-avatar--blank"
              width="64" height="64" viewBox="0 0 36 36" fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <circle cx="18" cy="18" r="18" fill="#e5e7eb"/>
              <circle cx="18" cy="14" r="6" fill="#b0b3b8"/>
              <ellipse cx="18" cy="26" rx="9" ry="6" fill="#b0b3b8"/>
            </svg>
          )}
          <div className="utb-panel-header-info">
            <div className="utb-panel-name">{fullName}</div>
            <div className="utb-panel-sub">{shortAddress}</div>
          </div>
        </div>

        <div className="utb-panel-divider"/>

        <div className="utb-panel-rows">
          {[
            { label: 'Age',          value: age },
            { label: 'Date of Birth',value: formatDate(formData.dateOfBirth) },
            { label: 'Sex',          value: formData.sex          || '—' },
            { label: 'Civil Status', value: formData.civilStatus  || '—' },
            { label: 'Nationality',  value: formData.nationality  || '—' },
            { label: 'Contact',      value: formData.mobile       || '—' },
            { label: 'Email',        value: formData.email        || '—', truncate: true },
          ].map(row => (
            <div className="utb-panel-row" key={row.label}>
              <span className="utb-panel-row-label">{row.label}</span>
              <span className={`utb-panel-row-val${row.truncate ? ' utb-panel-row-val--truncate' : ''}`}>
                {row.value}
              </span>
            </div>
          ))}
        </div>

        <div className="utb-panel-divider"/>

        <div className="utb-panel-actions">
          <button className="utb-manage-btn" onClick={openModal}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="15" height="15">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
            </svg>
            Manage Account
          </button>
          <button
            className="utb-qr-panel-btn"
            onClick={() => { openQrPanel(); setPanelOpen(false); }}
            aria-label="Show my QR code"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="15" height="15">
              <rect x="3" y="3" width="7" height="7" rx="1"/>
              <rect x="14" y="3" width="7" height="7" rx="1"/>
              <rect x="3" y="14" width="7" height="7" rx="1"/>
              <rect x="5" y="5" width="3" height="3" fill="currentColor" stroke="none"/>
              <rect x="16" y="5" width="3" height="3" fill="currentColor" stroke="none"/>
              <rect x="5" y="16" width="3" height="3" fill="currentColor" stroke="none"/>
            </svg>
            My QR Code
          </button>
        </div>
      </div>

      {/* ─── Manage Account Modal ─── */}
      {modalOpen && (
        <div
          className="utb-modal-overlay"
          onClick={(e) => { if (e.target === e.currentTarget) setModalOpen(false); }}
        >
          <div className="utb-modal" role="dialog" aria-modal="true">

            {/* Modal Header */}
            <div className="utb-modal-header">
              <div className="utb-modal-header-left">
                {avatarSrc ? (
                  <img src={avatarSrc} alt="avatar" className="utb-modal-avatar"/>
                ) : (
                  <svg
                    className="utb-modal-avatar utb-modal-avatar--blank"
                    width="64" height="64" viewBox="0 0 36 36" fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <circle cx="18" cy="18" r="18" fill="#e5e7eb"/>
                    <circle cx="18" cy="14" r="6" fill="#b0b3b8"/>
                    <ellipse cx="18" cy="26" rx="9" ry="6" fill="#b0b3b8"/>
                  </svg>
                )}
                <div>
                  <div className="utb-modal-name">{fullName}</div>
                  <div className="utb-modal-sub">
                    Resident Profile{formData.householdId ? ` · ${formData.householdId}` : ''}
                  </div>
                </div>

              </div>
              <button className="utb-modal-close" onClick={() => setModalOpen(false)} aria-label="Close">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>

            {/* Modal Body */}
            <div className="utb-modal-body">

              {/* Left nav */}
              <nav className="utb-modal-nav">
                {SECTIONS.map((sec, i) => (
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

              {/* Right content — scrollable */}
              <div className="utb-modal-content">
                <div className="utb-modal-section-title">
                  <span className="utb-modal-section-name">{SECTIONS[activeSection].label}</span>
                  <span className="utb-modal-section-counter">
                    {activeSection + 1} / {SECTIONS.length}
                  </span>
                  {SECTIONS[activeSection].fields.some(f => !f.editable) && (
                    <span className="utb-readonly-badge">
                      <LockIcon/>
                      Some fields are admin-controlled
                    </span>
                  )}
                </div>

                <div className="utb-modal-fields">
                  {SECTIONS[activeSection].fields.map(field => (
                    <div className="utb-field" key={field.key}>
                      <label className="utb-field-label">
                        {field.label}
                        {!field.editable && (
                          <span className="utb-field-lock">
                            <LockIcon/> Read-only
                          </span>
                        )}
                      </label>
                      {field.editable ? (
                        <FieldControl
                          field={field}
                          className="utb-field-input utb-field-input--editable"
                          value={formData[field.key] || ''}
                          onChange={value => handleFieldChange(field.key, value)}
                        />
                      ) : (
                        <div className="utb-field-input utb-field-input--readonly">
                          {field.key === 'dateOfBirth'
                            ? formatDate(formData[field.key])
                            : (formData[field.key] || '—')}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Footer */}
                <div className="utb-modal-footer">
                  <button className="utb-request-btn" type="button" onClick={openRequestPanel}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                      <path d="M12 20h9"/>
                      <path d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4 12.5-12.5z"/>
                    </svg>
                    Request Information Change
                  </button>

                  {activeSection > 0 && (
                    <button className="utb-back-btn" onClick={() => setActiveSection(s => s - 1)}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                        <polyline points="15 18 9 12 15 6"/>
                      </svg>
                      Back
                    </button>
                  )}

                  {!isLast ? (
                    <button className="utb-next-btn" onClick={() => setActiveSection(s => s + 1)}>
                      Next
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                        <polyline points="9 18 15 12 9 6"/>
                      </svg>
                    </button>
                  ) : (
                    <button
                      className={`utb-save-btn${saved ? ' utb-save-btn--saved' : ''}`}
                      onClick={handleSave}
                      disabled={saved}
                    >
                      {saved ? (
                        <>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="15" height="15">
                            <polyline points="20 6 9 17 4 12"/>
                          </svg>
                          Saved! Closing…
                        </>
                      ) : (
                        <>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="15" height="15">
                            <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/>
                            <polyline points="17 21 17 13 7 13 7 21"/>
                            <polyline points="7 3 7 8 15 8"/>
                          </svg>
                          Save All Changes
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      {requestOpen && (
        <div
          className="utb-request-overlay"
          onClick={(e) => { if (e.target === e.currentTarget) (requestSent ? closeRequestSuccess() : closeRequestPanel()); }}
        >
          {requestSent ? (
            <div className="utb-request-success-panel" role="dialog" aria-modal="true" aria-label="Request Sent">
              <button className="utb-modal-close" onClick={closeRequestSuccess} aria-label="Close success panel">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
              <div className="utb-request-success-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="28" height="28">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              </div>
              <h2>Request Sent</h2>
              <p>Your profile update request was sent to the admin for review.</p>
              <button className="utb-save-btn" type="button" onClick={closeRequestSuccess}>Close</button>
            </div>
          ) : (
          <div className="utb-request-panel" role="dialog" aria-modal="true" aria-label="Request Information Change">
            <div className="utb-request-header">
              <div>
                <h2>Request Information Change</h2>
                <p>These edits will be reviewed by the barangay admin before your profile is updated.</p>
              </div>
              <button className="utb-modal-close" onClick={closeRequestPanel} aria-label="Close request panel">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>

            <div className="utb-request-body">
              {SECTIONS.map(section => (
                <section className="utb-request-section" key={section.label}>
                  <h3>{section.label}</h3>
                  <div className="utb-request-grid">
                    {section.fields.map(field => (
                      <label className="utb-request-field" key={field.key}>
                        <span>{field.label}</span>
                        {field.key === 'dateOfBirth' ? (
                          <>
                            <div className="utb-date-input-wrap">
                              <input
                                type="text"
                                placeholder="MM/DD/YYYY"
                                maxLength={10}
                                value={requestBirthdateDisplay}
                                onChange={handleRequestBirthdateTextChange}
                                onKeyDown={handleRequestBirthdateKeyDown}
                                className={`utb-request-date-input${requestErrors.dateOfBirth ? ' utb-input--error' : ''}`}
                              />
                              <input
                                type="date"
                                max={getAdultBirthdateMax()}
                                value={requestData.dateOfBirth || ''}
                                onChange={e => handleRequestBirthdatePick(e.target.value)}
                                className="utb-date-picker-input"
                                tabIndex={-1}
                                aria-label="Pick date of birth"
                              />
                              <span className="utb-date-icon">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/>
                                  <line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                                </svg>
                              </span>
                            </div>
                            {requestErrors.dateOfBirth && (
                              <p className="utb-request-field-error">{requestErrors.dateOfBirth}</p>
                            )}
                          </>
                        ) : (
                          <FieldControl
                            field={{ ...field, type: field.type || 'text' }}
                            value={requestData[field.key] || ''}
                            onChange={value => handleRequestFieldChange(field.key, value)}
                          />
                        )}
                      </label>
                    ))}
                  </div>
                </section>
              ))}

              <label className="utb-request-field utb-request-field--note">
                <span>Reason or note for admin</span>
                <textarea
                  value={requestNote}
                  onChange={e => setRequestNote(e.target.value)}
                  placeholder="Optional"
                  rows={3}
                />
              </label>

              {requestNeedsProof && (
                <div className="utb-proof-box">
                  <div className="utb-proof-box__copy">
                    <span>Valid ID / Proof Required</span>
                    <p>
                      Upload a valid ID or supporting document for {requestProofFields.map(key => PROFILE_CHANGE_LABELS[key] || key).join(', ')}.
                    </p>
                  </div>
                  <label className="utb-proof-upload">
                    <input
                      type="file"
                      accept="image/*,.pdf"
                      onChange={e => setRequestProofFile(e.target.files?.[0] || null)}
                    />
                    <span>{requestProofFile ? requestProofFile.name : 'Choose document'}</span>
                  </label>
                </div>
              )}

            </div>

            <div className="utb-request-footer">
              {requestStatus.message && (
                <div className={`utb-request-message utb-request-message--${requestStatus.type}`}>
                  {requestStatus.message}
                </div>
              )}
              <div className="utb-request-actions">
                <button className="utb-back-btn" type="button" onClick={closeRequestPanel}>Cancel</button>
                <button className="utb-save-btn" type="button" onClick={submitInformationRequest} disabled={requestSaving}>
                  {requestSaving ? 'Sending...' : 'Send Request'}
                </button>
              </div>
            </div>
          </div>
          )}
        </div>
      )}
      {/* ─── QR Code Full-Screen Panel ─── */}
      {qrPanelOpen && (
        <div
          className="utb-qr-overlay"
          onClick={(e) => { if (e.target === e.currentTarget) closeQrPanel(); }}
        >
          <div className="utb-qr-panel" role="dialog" aria-modal="true" aria-label="Resident QR Code">

            {/* Header */}
            <div className="utb-qr-panel-header">
              <div className="utb-qr-panel-header-left">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
                  <rect x="3" y="3" width="7" height="7" rx="1"/>
                  <rect x="14" y="3" width="7" height="7" rx="1"/>
                  <rect x="3" y="14" width="7" height="7" rx="1"/>
                  <rect x="5" y="5" width="3" height="3" fill="currentColor" stroke="none"/>
                  <rect x="16" y="5" width="3" height="3" fill="currentColor" stroke="none"/>
                  <rect x="5" y="16" width="3" height="3" fill="currentColor" stroke="none"/>
                </svg>
                <span>Resident Identity QR</span>
              </div>
              <button className="utb-modal-close" onClick={closeQrPanel} aria-label="Close QR panel">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>

            {/* QR Body */}
            <div className="utb-qr-panel-body">
              <div className="utb-qr-identity-info">
                <div className="utb-qr-name">{fullName}</div>
                <div className="utb-qr-sub">Barangay New Cabalan Resident</div>
              </div>

              <div className="utb-qr-code-wrap" ref={qrRef}>
                {qrLoading ? (
                  <div className="utb-qr-spinner-wrap">
                    <span className="utb-qr-spinner"/>
                    <p>Generating QR…</p>
                  </div>
                ) : qrToken ? (
                  <QRCode
                    value={qrToken}
                    size={220}
                    bgColor="#ffffff"
                    fgColor="#111827"
                    level="M"
                  />
                ) : (
                  <div className="utb-qr-error">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="32" height="32">
                      <circle cx="12" cy="12" r="10"/>
                      <line x1="12" y1="8" x2="12" y2="12"/>
                      <circle cx="12" cy="16" r=".5" fill="currentColor"/>
                    </svg>
                    <p>Failed to generate QR</p>
                    {qrError && <p className="utb-qr-error-detail">{qrError}</p>}
                    <button className="utb-qr-retry-btn" onClick={fetchQrToken}>Try again</button>
                  </div>
                )}
              </div>

              {qrToken && !qrLoading && (
                <button className="utb-qr-download-btn" onClick={downloadQr} type="button">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="15" height="15">
                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                    <polyline points="7 10 12 15 17 10"/>
                    <line x1="12" y1="15" x2="12" y2="3"/>
                  </svg>
                  Download QR Code
                </button>
              )}

              <p className="utb-qr-hint">
                Show this QR code to the barangay admin for identity verification.
                This is your permanent resident QR code.
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
