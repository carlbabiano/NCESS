import React, { useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';

import Sidebar from '../../components/adminsidebar';
import AdminTopbar from '../../components/admintopbar';
import { AdminFilterBar } from '../../components/adminfilterbar';
import './adminappointments.css';

const API_URL = import.meta.env.VITE_BACKEND_URL;
const PAGE_SIZE = 10;

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const STATUS_META = {
  Scheduled: { className: 'status--scheduled', label: 'Scheduled' },
  Closed:    { className: 'status--closed',    label: 'Closed' },
  Cancelled: { className: 'status--cancelled', label: 'Cancelled' },
};

const STAFF_OPTIONS   = ['Unassigned', 'Admin Rose', 'Capt. Garcia', 'Nurse Anna'];
const PURPOSE_OPTIONS = [
  'Barangay Clearance', 'Business Permit', 'Cedula Issuance',
  'Financial Assistance', 'Health Certificate', 'Indigency Certificate',
  'Barangay ID', 'Complaint Filing', 'Senior ID Renewal',
  'Senior Citizen ID', 'PWD ID', 'Other',
];

const EMPTY_FORM = {
  resident: '', residentEmail: '', purpose: '', customPurpose: '',
  date: '', time: '', assignedTo: 'Unassigned',
};

// Default availability schedule
const DEFAULT_SCHEDULE = {
  monday:    { enabled: true,  start: '08:00', end: '17:00', slotDuration: 30, maxPerSlot: 1 },
  tuesday:   { enabled: true,  start: '08:00', end: '17:00', slotDuration: 30, maxPerSlot: 1 },
  wednesday: { enabled: true,  start: '08:00', end: '17:00', slotDuration: 30, maxPerSlot: 1 },
  thursday:  { enabled: true,  start: '08:00', end: '17:00', slotDuration: 30, maxPerSlot: 1 },
  friday:    { enabled: true,  start: '08:00', end: '17:00', slotDuration: 30, maxPerSlot: 1 },
  saturday:  { enabled: false, start: '09:00', end: '12:00', slotDuration: 30, maxPerSlot: 1 },
  sunday:    { enabled: false, start: '09:00', end: '12:00', slotDuration: 30, maxPerSlot: 1 },
};

const DAY_KEYS = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
const DAY_CHIPS = [
  { key: 'monday', short: 'M', label: 'Monday' },
  { key: 'tuesday', short: 'T', label: 'Tuesday' },
  { key: 'wednesday', short: 'W', label: 'Wednesday' },
  { key: 'thursday', short: 'TH', label: 'Thursday' },
  { key: 'friday', short: 'F', label: 'Friday' },
  { key: 'saturday', short: 'S', label: 'Saturday' },
  { key: 'sunday', short: 'SN', label: 'Sunday' },
];
const WEEKDAY_KEYS = ['monday','tuesday','wednesday','thursday','friday'];

function getToken() {
  return (
    localStorage.getItem('admin_token') ||
    sessionStorage.getItem('admin_token') ||
    localStorage.getItem('adminToken') ||
    sessionStorage.getItem('adminToken')
  );
}

// Safely parse a YYYY-MM-DD string (or ISO string) into a local Date, avoiding timezone shifts
function parseLocalDate(str) {
  if (!str) return null;
  // If it's already an ISO with time component, extract just the date part
  const datePart = str.slice(0, 10);
  const [y, m, d] = datePart.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function fmtDate(str, options = { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) {
  const d = parseLocalDate(str);
  if (!d || isNaN(d)) return str || '';
  return d.toLocaleDateString('en-US', options);
}

function fmt12(time24) {
  if (!time24 || typeof time24 !== 'string') return '';
  const parts = time24.split(':');
  let h = Number(parts[0]);
  let m = parts.length > 1 ? Number(parts[1]) : 0;
  if (isNaN(h) || isNaN(m)) return time24; // fallback to raw value
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, '0')} ${suffix}`;
}

function generateSlots(start, end, duration) {
  const slots = [];
  let [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  const endMins = eh * 60 + em;
  while (sh * 60 + sm < endMins) {
    slots.push(`${String(sh).padStart(2,'0')}:${String(sm).padStart(2,'0')}`);
    sm += duration;
    if (sm >= 60) { sh += Math.floor(sm / 60); sm = sm % 60; }
  }
  return slots;
}

export default function AdminAppointments() {

  // ── Sidebar state ──
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // ── Appointments state ──
  const [activeTab,    setActiveTab]    = useState('appointments');
  const [appointments, setAppointments] = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [fetchError,   setFetchError]   = useState('');
  const [search,       setSearch]       = useState('');
  const [filter,       setFilter]       = useState('All');
  const [openMenu,     setOpenMenu]     = useState(null);
  const [page,         setPage]         = useState(1);
  const [showModal,    setShowModal]    = useState(false);
  const [form,         setForm]         = useState({ resident: '', residentEmail: '', purpose: '', customPurpose: '', date: '', time: '', assignedTo: 'Unassigned' });
  const [formError,    setFormError]    = useState('');
  const [submitting,   setSubmitting]   = useState(false);
  const [confirmAction,         setConfirmAction]         = useState(null);
  const [confirmNote,           setConfirmNote]           = useState('');
  const [confirming,            setConfirming]            = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting,     setDeleting]     = useState(false);
  const [toast,        setToast]        = useState('');

  const [expandedResidents, setExpandedResidents] = useState(new Set());

  const toggleResidentExpand = (key) => {
    setExpandedResidents(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  // Resident search
  const [residentSearch,       setResidentSearch]       = useState('');
  const [residentResults,      setResidentResults]      = useState([]);
  const [residentSearching,    setResidentSearching]    = useState(false);
  const [showResidentDropdown, setShowResidentDropdown] = useState(false);
  const [selectedResident,     setSelectedResident]     = useState(null);
  const residentDropdownRef = useRef(null);
  const residentSearchTimer = useRef(null);

  // ── Availability state ──
  const [schedule, setSchedule] = useState(DEFAULT_SCHEDULE);
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [scheduleLoaded, setScheduleLoaded] = useState(false);
  const [blockedDates,   setBlockedDates]   = useState([]);
  const [newBlockedDate, setNewBlockedDate] = useState('');
  const [blockReason,    setBlockReason]    = useState('');
  const [savingBlock,    setSavingBlock]    = useState(false);
  const [blockType,      setBlockType]      = useState('fullday'); // 'fullday' or 'specific-times'
  const [blockStartTime, setBlockStartTime] = useState('08:00');
  const [blockEndTime,   setBlockEndTime]   = useState('17:00');
  const [showBlockModal, setShowBlockModal] = useState(false);
  const [bulkDays,       setBulkDays]       = useState(() => new Set(WEEKDAY_KEYS));
  const [bulkTemplate,   setBulkTemplate]   = useState({
    enabled: true,
    start: '08:00',
    end: '17:00',
    slotDuration: 30,
    maxPerSlot: 1,
  });
  const [calMonth,       setCalMonth]       = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });

  const showToast = msg => { setToast(msg); setTimeout(() => setToast(''), 3500); };

  // ── Create modal calendar state ──
  const [formCalMonth, setFormCalMonth] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });

  const formCalPrev = () => setFormCalMonth(prev => {
    let m = prev.month - 1, y = prev.year;
    if (m < 0) { m = 11; y--; }
    return { year: y, month: m };
  });
  const formCalNext = () => setFormCalMonth(prev => {
    let m = prev.month + 1, y = prev.year;
    if (m > 11) { m = 0; y++; }
    return { year: y, month: m };
  });

  const buildFormCalendar = () => {
    const { year, month } = formCalMonth;
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < firstDay; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    return cells;
  };

  const getFormCellStatus = (day) => {
    if (!day) return 'empty';
    const { year, month } = formCalMonth;
    const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    const cellDate = new Date(year, month, day);
    const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    if (cellDate < todayMidnight) return 'past';
    const isBlocked = blockedDates.some(b => (b.date || b) === dateStr && (b.type === 'fullday' || !b.type));
    if (isBlocked) return 'blocked';
    const jsDay = new Date(year, month, day).getDay();
    const key = getDayKeyFromJS(jsDay);
    if (schedule[key]?.enabled) return 'available';
    return 'unavailable';
  };

  const getTimeSlotsForDate = (dateStr) => {
    if (!dateStr) return [];
    const d = parseLocalDate(dateStr);
    if (!d || isNaN(d)) return [];
    const key = getDayKeyFromJS(d.getDay());
    const daySchedule = schedule[key];
    if (!daySchedule?.enabled) return [];
    const allSlots = generateSlots(daySchedule.start, daySchedule.end, daySchedule.slotDuration);
    // filter out time-specific blocks
    const timeBlocks = blockedDates.filter(b => (b.date || b) === dateStr && b.type === 'times');
    return allSlots.filter(slot => {
      const [sh, sm] = slot.split(':').map(Number);
      const slotMins = sh * 60 + sm;
      return !timeBlocks.some(b => {
        const [bsh, bsm] = b.startTime.split(':').map(Number);
        const [beh, bem] = b.endTime.split(':').map(Number);
        return slotMins >= bsh * 60 + bsm && slotMins < beh * 60 + bem;
      });
    });
  };

  // SlotPreviewChips: shows slot time and slots taken/max
  function SlotPreviewChips({ dateKey, slots, calMonth, maxPerSlot }) {
    const [slotCounts, setSlotCounts] = useState({});
    useEffect(() => {
      let isMounted = true;
      async function fetchCounts() {
        const year = calMonth.year;
        const month = calMonth.month + 1;
        // Use next available weekday for preview
        const dayIdx = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'].indexOf(dateKey);
        let today = new Date();
        let d = new Date(year, month - 1, today.getDate());
        // Find next matching weekday in this month
        for (let i = 0; i < 7; i++) {
          if (d.getDay() === (dayIdx === 6 ? 0 : dayIdx + 1)) break;
          d.setDate(d.getDate() + 1);
        }
        const dateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
        const promises = slots.slice(0, 6).map(async (slot) => {
          try {
            const res = await fetch(`${API_URL}/appointments/slot-usage?date=${dateStr}&time=${slot}`);
            if (!res.ok) return [slot, 0];
            const data = await res.json();
            return [slot, data.count];
          } catch { return [slot, 0]; }
        });
        const results = await Promise.all(promises);
        if (isMounted) {
          const counts = Object.fromEntries(results);
          setSlotCounts(counts);
        }
      }
      fetchCounts();
      return () => { isMounted = false; };
    }, [dateKey, slots, calMonth]);
    return (
      <div className="avail-slot-preview">
        <span className="avail-slot-preview__label">{slots.length} slot{slots.length !== 1 ? 's' : ''}</span>
        <div className="avail-slot-preview__chips">
          {slots.slice(0, 6).map(s => (
            <span key={s} className="avail-slot-chip">
              {fmt12(s)}
              <span style={{ fontSize: 11, color: '#888', marginLeft: 4 }}>
                {slotCounts[s] !== undefined ? `${slotCounts[s]}/${maxPerSlot}` : '…'}
              </span>
            </span>
          ))}
          {slots.length > 6 && (
            <span className="avail-slot-chip avail-slot-chip--more">+{slots.length - 6} more</span>
          )}
        </div>
      </div>
    );
  }
  const searchResidents = async (q) => {
    if (!q.trim()) { setResidentResults([]); setResidentSearching(false); return; }
    setResidentSearching(true);
    try {
      const token = getToken();
      const res = await fetch(`${API_URL}/users?search=${encodeURIComponent(q)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      const words = q.trim().toLowerCase().split(/\s+/);
      const mapped = data
        .map(u => ({
          _id: u._id,
          name: [u.firstName, u.middleName, u.lastName].filter(Boolean).join(' ') || u.email,
          email: u.email,
        }))
        .filter(u => words.every(w =>
          u.name.toLowerCase().includes(w) || u.email.toLowerCase().includes(w)
        ))
        .slice(0, 8);
      setResidentResults(mapped);
    } catch {
      setResidentResults([]);
    } finally {
      setResidentSearching(false);
    }
  };

  const handleResidentInput = (val) => {
    setResidentSearch(val);
    setSelectedResident(null);
    handleChange('resident', val);
    setShowResidentDropdown(true);
    clearTimeout(residentSearchTimer.current);
    residentSearchTimer.current = setTimeout(() => searchResidents(val), 300);
  };

  const selectResident = (r) => {
    setSelectedResident(r);
    setResidentSearch(r.name);
    handleChange('resident', r.name);
    handleChange('residentEmail', r.email);
    setShowResidentDropdown(false);
    setResidentResults([]);
  };

  useEffect(() => {
    const handler = (e) => {
      if (residentDropdownRef.current && !residentDropdownRef.current.contains(e.target))
        setShowResidentDropdown(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    const handler = () => setOpenMenu(null);
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, []);

  /* ── Fetch appointments ── */
  const fetchAppointments = useCallback(async () => {
    setLoading(true); setFetchError('');
    try {
      const token = getToken();
      if (!token) throw new Error('No admin token');
      const res = await fetch(`${API_URL}/admin/appointments`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setAppointments(await res.json());
    } catch (err) {
      setFetchError('Failed to load appointments.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAppointments(); }, [fetchAppointments]);

  /* ── Real-time socket: admin room appointment events ── */
  useEffect(() => {
    const token = getToken();
    if (!token) return;
    const socket = io(
      import.meta.env.VITE_SOCKET_URL ||
      import.meta.env.VITE_BACKEND_URL?.replace('/api', '') || '',
      { auth: { token }, transports: ['websocket'], reconnection: true }
    );

    // New appointment booked by a resident (or another admin tab)
    socket.on('appointment_created', (appt) => {
      setAppointments(prev => {
        if (prev.some(a => a._id === appt._id)) return prev;
        return [appt, ...prev];
      });
    });

    // Appointment updated (cancel, reschedule, field edit) from any source
    socket.on('appointment_updated', (appt) => {
      setAppointments(prev => prev.map(a => a._id === appt._id ? appt : a));
      // Patch the confirm-action modal if it's open for this appt
      setConfirmAction(prev =>
        prev && prev.appt._id === appt._id ? { ...prev, appt } : prev
      );
    });

    // Appointment deleted from another admin tab
    socket.on('appointment_deleted', ({ _id }) => {
      setAppointments(prev => prev.filter(a => a._id !== _id));
      setDeleteTarget(prev => prev?._id === _id ? null : prev);
      setConfirmAction(prev => prev?.appt._id === _id ? null : prev);
    });

    // Auto-close events (triggered when admin fetches — forward to state)
    socket.on('appointment_closed', (appt) => {
      setAppointments(prev => prev.map(a => a._id === appt._id ? appt : a));
    });

    socket.on('availability:changed', (data) => {
      if (data?.schedule) setSchedule(data.schedule);
      if (data?.blockedDates) setBlockedDates(data.blockedDates);
      setScheduleLoaded(true);
    });

    return () => socket.disconnect();
  }, []);

  /* ── Fetch schedule ── */
  const fetchSchedule = useCallback(async () => {
    try {
      const token = getToken();
      const res = await fetch(`${API_URL}/admin/availability`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      if (data.schedule) setSchedule(data.schedule);
      if (data.blockedDates) setBlockedDates(data.blockedDates);
    } catch {
      // use defaults
    } finally {
      setScheduleLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'availability' && !scheduleLoaded) fetchSchedule();
  }, [activeTab, scheduleLoaded, fetchSchedule]);

  /* ── Save schedule ── */
  const saveSchedule = async () => {
    setSavingSchedule(true);
    try {
      const token = getToken();
      const res = await fetch(`${API_URL}/admin/availability`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ schedule, blockedDates }),
      });
      if (!res.ok) throw new Error();
      showToast('Availability schedule saved!');
    } catch {
      showToast('Failed to save schedule.');
    } finally {
      setSavingSchedule(false);
    }
  };

  /* ── Add blocked date ── */
  const addBlockedDate = async () => {
    if (!newBlockedDate) return;
    if (blockType === 'specific-times' && blockStartTime >= blockEndTime) {
      showToast('End time must be later than start time.');
      return;
    }
    
    // Always set type explicitly, default to 'fullday'
    const blockEntry = blockType === 'fullday'
      ? { date: newBlockedDate, type: 'fullday', reason: blockReason }
      : { date: newBlockedDate, type: 'times', startTime: blockStartTime, endTime: blockEndTime, reason: blockReason };
    
    // Check if date already has a full-day block
    if (blockedDates.some(b => (b.date || b) === newBlockedDate && (b.type === 'fullday' || !b.type))) {
      showToast('That date is already blocked for the entire day.');
      return;
    }
    
    // If adding time-specific block, remove any existing time blocks for same time range
    if (blockType === 'times') {
      const existing = blockedDates.filter(b => (b.date || b) === newBlockedDate && b.type === 'times');
      if (existing.some(b => b.startTime === blockStartTime && b.endTime === blockEndTime)) {
        showToast('That time slot is already blocked.');
        return;
      }
    }
    
    setSavingBlock(true);
    const baseBlocks = blockType === 'fullday'
      ? blockedDates.filter(b => (b.date || b) !== newBlockedDate)
      : blockedDates;
    const updated = sortBlocks([...baseBlocks, blockEntry]);
    setBlockedDates(updated);
    setNewBlockedDate('');
    setBlockReason('');
    setBlockStartTime('08:00');
    setBlockEndTime('17:00');
    setBlockType('fullday');
    setSavingBlock(false);
    showToast('Block added — remember to save!');
  };

  const removeBlockedDate = (date, blockEntry) => {
    const targetType = blockEntry.type || 'fullday';
    setBlockedDates(prev => prev.filter(block => {
      const blockDate = block.date || block;
      const type = block.type || 'fullday';
      if (blockDate !== date) return true;
      if (targetType === 'fullday') return type !== 'fullday';
      return !(type === 'times' && block.startTime === blockEntry.startTime && block.endTime === blockEntry.endTime);
    }));
  };

  /* ── Schedule helpers ── */
  const updateDay = (dayKey, field, value) => {
    setSchedule(prev => ({
      ...prev,
      [dayKey]: { ...prev[dayKey], [field]: value },
    }));
  };

  /* ── Appointment filters ── */
  const updateBulkTemplate = (field, value) => {
    setBulkTemplate(prev => ({ ...prev, [field]: value }));
  };

  const toggleBulkDay = (dayKey) => {
    setBulkDays(prev => {
      const next = new Set(prev);
      next.has(dayKey) ? next.delete(dayKey) : next.add(dayKey);
      return next;
    });
  };

  const setBulkDayPreset = (keys) => {
    setBulkDays(new Set(keys));
  };

  const applyBulkSchedule = () => {
    if (bulkDays.size === 0) {
      showToast('Select at least one day.');
      return;
    }
    if (bulkTemplate.enabled && bulkTemplate.start >= bulkTemplate.end) {
      showToast('End time must be later than start time.');
      return;
    }

    setSchedule(prev => {
      const next = { ...prev };
      bulkDays.forEach(dayKey => {
        next[dayKey] = {
          ...prev[dayKey],
          ...bulkTemplate,
        };
      });
      return next;
    });
    showToast('Schedule applied - remember to save!');
  };

  const sortBlocks = (blocks) => [...blocks].sort((a, b) => {
    const dateA = typeof a === 'string' ? a : (a.date || '');
    const dateB = typeof b === 'string' ? b : (b.date || '');
    return dateA.localeCompare(dateB);
  });

  const toggleCalendarBlock = (dateStr) => {
    if (!dateStr) return;
    const clickedDate = parseLocalDate(dateStr);
    const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    if (!clickedDate || clickedDate < todayMidnight) return;
    if (blockType === 'specific-times' && blockStartTime >= blockEndTime) {
      showToast('End time must be later than start time.');
      return;
    }

    const nextBlock = blockType === 'fullday'
      ? { date: dateStr, type: 'fullday', reason: blockReason }
      : { date: dateStr, type: 'times', startTime: blockStartTime, endTime: blockEndTime, reason: blockReason };

    setBlockedDates(prev => {
      const matching = prev.some(block => {
        const blockDate = block.date || block;
        const type = block.type || 'fullday';
        if (blockDate !== dateStr) return false;
        if (blockType === 'fullday') return type === 'fullday';
        return type === 'times' && block.startTime === blockStartTime && block.endTime === blockEndTime;
      });

      if (matching) {
        return prev.filter(block => {
          const blockDate = block.date || block;
          const type = block.type || 'fullday';
          if (blockDate !== dateStr) return true;
          if (blockType === 'fullday') return type !== 'fullday';
          return !(type === 'times' && block.startTime === blockStartTime && block.endTime === blockEndTime);
        });
      }

      const withoutConflicts = blockType === 'fullday'
        ? prev.filter(block => (block.date || block) !== dateStr)
        : prev.filter(block => !((block.date || block) === dateStr && (block.type || 'fullday') === 'fullday'));
      return sortBlocks([...withoutConflicts, nextBlock]);
    });

    showToast('Block updated - remember to save!');
  };

  const filters = ['All', 'Scheduled', 'Closed', 'Cancelled'];
  const filtered = appointments.filter(a => {
    const matchFilter = filter === 'All' || a.status === filter;
    const q = search.toLowerCase();
    const matchSearch = !q ||
      a.resident?.toLowerCase().includes(q) ||
      a.purpose?.toLowerCase().includes(q)  ||
      a.id?.toLowerCase().includes(q);
    return matchFilter && matchSearch;
  });

  useEffect(() => { setPage(1); }, [search, filter]);

  // Status sort order: Scheduled first, then Closed, then Cancelled
  const STATUS_ORDER = { Scheduled: 0, Closed: 1, Cancelled: 2 };

  // Sort a single appointment's date+time into a numeric value for comparison
  const apptSortKey = (appt) => {
    const datePart = (appt.date || '').slice(0, 10);
    const timePart = appt.time || '00:00';
    return new Date(`${datePart}T${timePart}`).getTime() || 0;
  };

  // Sort appointments: Scheduled (future-first / newest at top) → Closed → Cancelled
  // Within Scheduled: soonest upcoming first (ascending), then newest created last
  // Within Closed/Cancelled: most recent date first (descending)
  const sortedAppointments = [...filtered].sort((a, b) => {
    const sa = STATUS_ORDER[a.status] ?? 3;
    const sb = STATUS_ORDER[b.status] ?? 3;
    if (sa !== sb) return sa - sb;
    const ta = apptSortKey(a);
    const tb = apptSortKey(b);
    if (a.status === 'Scheduled') {
      // upcoming/newest scheduled at top: ascending by date so soonest is first
      return ta - tb;
    }
    // Closed/Cancelled: most recent first
    return tb - ta;
  });

  // Group by resident name, preserving sorted order
  const groupedResidents = (() => {
    const map = new Map();
    for (const appt of sortedAppointments) {
      const key = appt.resident?.toLowerCase().trim() || appt._id;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(appt);
    }
    // Sort each resident's appointments the same way (status → date)
    for (const [, appts] of map) {
      appts.sort((a, b) => {
        const sa = STATUS_ORDER[a.status] ?? 3;
        const sb = STATUS_ORDER[b.status] ?? 3;
        if (sa !== sb) return sa - sb;
        const ta = apptSortKey(a);
        const tb = apptSortKey(b);
        return a.status === 'Scheduled' ? ta - tb : tb - ta;
      });
    }
    return Array.from(map.entries()); // [key, appts[]]
  })();

  const totalPages = Math.max(1, Math.ceil(groupedResidents.length / PAGE_SIZE));
  const safePage   = Math.min(page, totalPages);
  const paginatedGroups = groupedResidents.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  /* ── Action confirm ── */
  const requestAction = (appt, action) => {
    setOpenMenu(null);
    setConfirmNote('');
    setConfirmAction({ appt, action });
  };

  const handleConfirmAction = async () => {
    if (!confirmAction) return;
    const { appt, action } = confirmAction;
    setConfirming(true);
    try {
      const token = getToken();
      let res, data;
      if (action === 'Cancelled') {
        res = await fetch(`${API_URL}/admin/appointments/${appt._id}/cancel`, {
          method:  'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ cancelReason: confirmNote }),
        });
        data = await res.json();
      } else {
        return showToast('Unknown action.');
      }
      if (!res.ok) return showToast(data.message || 'Update failed.');
      setAppointments(prev => prev.map(a => a._id === appt._id ? data : a));
      showToast(`Appointment marked as ${action}.`);
      setConfirmAction(null);
    } catch {
      showToast('Unable to connect to server.');
    } finally {
      setConfirming(false);
    }
  };

  /* ── Delete ── */
  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`${API_URL}/admin/appointments/${deleteTarget._id}`, {
        method: 'DELETE', headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) { const d = await res.json(); return showToast(d.message || 'Delete failed.'); }
      setAppointments(prev => prev.filter(a => a._id !== deleteTarget._id));
      showToast('Appointment deleted.');
    } catch {
      showToast('Unable to connect to server.');
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  /* ── Modal helpers ── */
  const openModal  = () => {
    setForm(EMPTY_FORM); setFormError('');
    setResidentSearch(''); setSelectedResident(null);
    setResidentResults([]); setShowResidentDropdown(false);
    const d = new Date();
    setFormCalMonth({ year: d.getFullYear(), month: d.getMonth() });
    setShowModal(true);
  };
  const closeModal = () => {
    setShowModal(false); setFormError('');
    setResidentSearch(''); setSelectedResident(null);
    setResidentResults([]); setShowResidentDropdown(false);
  };
  const handleChange = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }));
    if (formError) setFormError('');
  };

  /* ── Create appointment ── */
  const handleSubmit = async () => {
    if (!form.resident.trim()) return setFormError('Resident name is required.');
    const purposeVal = form.purpose === 'Other' ? form.customPurpose.trim() : form.purpose;
    if (!purposeVal) return setFormError('Purpose is required.');
    if (!form.date)  return setFormError('Date is required.');
    if (!form.time)  return setFormError('Time is required.');
    setSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/admin/appointments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({
          resident:      form.resident.trim(),
          residentEmail: selectedResident?.email || '',
          userId:        selectedResident?._id || null,
          purpose:       purposeVal,
          date:          form.date,
          time:          form.time,
          assignedTo:    form.assignedTo,
        }),
      });
      const data = await res.json();
      if (!res.ok) return setFormError(data.message || 'Creation failed.');
      setAppointments(prev => [data, ...prev]);
      closeModal();
      showToast('Appointment created successfully!');
    } catch {
      setFormError('Unable to connect to the server.');
    } finally {
      setSubmitting(false);
    }
  };

  const toggleMenu = id => setOpenMenu(prev => (prev === id ? null : id));

  /* ── Calendar helpers ── */
  const prevMonth = () => setCalMonth(prev => {
    let m = prev.month - 1, y = prev.year;
    if (m < 0) { m = 11; y--; }
    return { year: y, month: m };
  });
  const nextMonth = () => setCalMonth(prev => {
    let m = prev.month + 1, y = prev.year;
    if (m > 11) { m = 0; y++; }
    return { year: y, month: m };
  });

  const buildCalendar = () => {
    const { year, month } = calMonth;
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < firstDay; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    return cells;
  };

  const getDayKeyFromJS = (jsDay) => {
    // js: 0=Sun,1=Mon,2=Tue,3=Wed,4=Thu,5=Fri,6=Sat
    return DAY_KEYS[jsDay === 0 ? 6 : jsDay - 1];
  };

  const getCellStatus = (day) => {
    if (!day) return 'empty';
    const { year, month } = calMonth;
    const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    const cellDate = new Date(year, month, day);
    const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    if (cellDate < todayMidnight) return 'past';
    const isBlocked = blockedDates.some(b => (b.date || b) === dateStr && (b.type === 'fullday' || !b.type));
    const isPartiallyBlocked = blockedDates.some(b => (b.date || b) === dateStr && b.type === 'times');
    if (isBlocked) return 'blocked';
    const jsDay = new Date(year, month, day).getDay();
    const key = getDayKeyFromJS(jsDay);
    if (isPartiallyBlocked && schedule[key]?.enabled) return 'partial';
    if (schedule[key]?.enabled) return 'available';
    return 'unavailable';
  };

  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
  const showLegacyAvailability = false;

  /* ─── Render ──────────────────────────────────── */
  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />
      <div style={{ flex: 1, minWidth: 0, height: '100vh', overflowY: 'auto' }}>
        <div className="appt-page">

          {toast && (
            <div className="appt-toast">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="16" height="16">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
              {toast}
            </div>
          )}

          <AdminTopbar
            placeholder="Search appointments..."
            search={search}
            onSearch={setSearch}
            onHamburger={() => setSidebarOpen(o => !o)}
            sidebarOpen={sidebarOpen}
            setSidebarOpen={setSidebarOpen}
          />

          <div className="appt-header">
            <div>
              <h1>Appointments</h1>
              <p>Manage resident appointments and configure your availability schedule.</p>
            </div>
            {activeTab === 'appointments' && (
              <button className="appt-header__btn" onClick={openModal}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="12" y1="5" x2="12" y2="19"/>
                  <line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
                Create Appointment
              </button>
            )}
          </div>

          {/* ── Tab Bar ── */}
          <div className="appt-tab-bar">
            <button
              className={`appt-tab${activeTab === 'appointments' ? ' appt-tab--active' : ''}`}
              onClick={() => setActiveTab('appointments')}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="15" height="15">
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="16" y1="13" x2="8" y2="13"/>
                <line x1="16" y1="17" x2="8" y2="17"/>
                <polyline points="10 9 9 9 8 9"/>
              </svg>
              Appointments
            </button>
            <button
              className={`appt-tab${activeTab === 'availability' ? ' appt-tab--active' : ''}`}
              onClick={() => setActiveTab('availability')}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="15" height="15">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                <line x1="16" y1="2" x2="16" y2="6"/>
                <line x1="8" y1="2" x2="8" y2="6"/>
                <line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
              Availability Schedule
            </button>
          </div>

          {/* ════════════════════════════════════════
              TAB: APPOINTMENTS
          ════════════════════════════════════════ */}
          {activeTab === 'appointments' && (
            <>
              <AdminFilterBar
                groups={[{
                  label: 'Status',
                  value: filter,
                  onChange: setFilter,
                  options: filters,
                }]}
                count={`Showing ${filtered.length} appointments`}
              />

              {loading && (
                <div className="appt-table-wrap" style={{ margin: '0 32px' }}>
                  <p className="appt-table__empty">Loading appointments…</p>
                </div>
              )}
              {!loading && fetchError && (
                <div className="appt-table-wrap" style={{ margin: '0 32px' }}>
                  <p className="appt-table__empty" style={{ color: '#dc2626' }}>{fetchError}</p>
                </div>
              )}

              {!loading && !fetchError && (
                <div className="appt-table-wrap" onClick={() => setOpenMenu(null)}>

                  {/* ── Desktop Table ── */}
                  <table className="appt-table appt-table--desktop">
                    <thead>
                      <tr>
                        <th>Resident</th><th>Date &amp; Time</th>
                        <th>Purpose</th><th>Status</th><th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedGroups.length === 0 && (
                        <tr><td colSpan="5" className="appt-table__empty">No appointments found.</td></tr>
                      )}
                      {paginatedGroups.map(([residentKey, appts]) => {
                        const primary = appts[0];
                        const extras  = appts.slice(1);
                        const isExpanded = expandedResidents.has(residentKey);
                        return (
                          <React.Fragment key={residentKey}>
                            <tr className="appt-table__row">
                              <td className="appt-table__resident">
                                <p className="appt-table__resident-name">{primary.resident}</p>
                                {primary.residentEmail && (
                                  <p className="appt-table__resident-email">{primary.residentEmail}</p>
                                )}
                              </td>
                              <td>
                                <div className="appt-table__datetime">
                                  <span className="appt-table__date">{fmtDate(primary.date)}</span>
                                  <span className="appt-table__time">{fmt12(primary.time)}</span>
                                </div>
                              </td>
                              <td className="appt-table__purpose">
                                <div className="appt-table__purpose-row">
                                  <span>{primary.purpose}</span>
                                  {extras.length > 0 && (
                                    <button className="appt-more-pill"
                                      onClick={e => { e.stopPropagation(); toggleResidentExpand(residentKey); }}
                                      aria-expanded={isExpanded}>
                                      {isExpanded ? (
                                        <><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="11" height="11"><polyline points="18 15 12 9 6 15"/></svg>Collapse</>
                                      ) : (
                                        <><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="11" height="11"><polyline points="6 9 12 15 18 9"/></svg>+{extras.length} more</>
                                      )}
                                    </button>
                                  )}
                                </div>
                              </td>
                              <td className="appt-table__menu-cell" onClick={e => e.stopPropagation()}>
                                <span className={`appt-status-badge ${STATUS_META[primary.status]?.className || 'status--scheduled'}`}>
                                  {STATUS_META[primary.status]?.label || primary.status}
                                </span>
                              </td>
                              <td className="appt-table__menu-cell" onClick={e => e.stopPropagation()}>
                                {primary.status === 'Scheduled' && (
                                  <div style={{ position: 'relative', display: 'inline-block' }}>
                                    <button className="appt-table__dots-btn"
                                      onClick={e => { e.stopPropagation(); toggleMenu(primary._id); }}>
                                      <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                                        <circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/>
                                      </svg>
                                    </button>
                                    {openMenu === primary._id && (
                                      <DropdownPortal>
                                        <button className="appt-dropdown__item appt-dropdown__item--cancel-action"
                                          onClick={() => { setOpenMenu(null); requestAction(primary, 'Cancelled'); }}>
                                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" width="14" height="14">
                                            <circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
                                          </svg>
                                          Cancel Appointment
                                        </button>
                                      </DropdownPortal>
                                    )}
                                  </div>
                                )}
                              </td>
                            </tr>
                            {isExpanded && extras.map((appt, idx) => (
                              <tr key={`${residentKey}-extra-${appt._id}`} className="appt-table__row appt-table__row--extra">
                                <td className="appt-table__resident appt-table__resident--extra">
                                  <span className="appt-extra-connector" aria-hidden="true">
                                    {idx === extras.length - 1 ? '└' : '├'}
                                  </span>
                                </td>
                                <td>
                                  <div className="appt-table__datetime">
                                    <span className="appt-table__date">{fmtDate(appt.date)}</span>
                                    <span className="appt-table__time">{fmt12(appt.time)}</span>
                                  </div>
                                </td>
                                <td className="appt-table__purpose">{appt.purpose}</td>
                                <td className="appt-table__menu-cell" onClick={e => e.stopPropagation()}>
                                  <span className={`appt-status-badge ${STATUS_META[appt.status]?.className || 'status--scheduled'}`}>
                                    {STATUS_META[appt.status]?.label || appt.status}
                                  </span>
                                </td>
                                <td className="appt-table__menu-cell" onClick={e => e.stopPropagation()}>
                                  {appt.status === 'Scheduled' && (
                                    <div style={{ position: 'relative', display: 'inline-block' }}>
                                      <button className="appt-table__dots-btn"
                                        onClick={e => { e.stopPropagation(); toggleMenu(appt._id); }}>
                                        <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                                          <circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/>
                                        </svg>
                                      </button>
                                      {openMenu === appt._id && (
                                        <DropdownPortal>
                                          <button className="appt-dropdown__item appt-dropdown__item--cancel-action"
                                            onClick={() => { setOpenMenu(null); requestAction(appt, 'Cancelled'); }}>
                                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" width="14" height="14">
                                              <circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
                                            </svg>
                                            Cancel Appointment
                                          </button>
                                        </DropdownPortal>
                                      )}
                                    </div>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>

                  {/* ── Mobile Cards ── */}
                  <div className="appt-card-list">
                    {paginatedGroups.length === 0 && (
                      <p className="appt-table__empty">No appointments found.</p>
                    )}
                    {paginatedGroups.map(([residentKey, appts]) => {
                      const primary    = appts[0];
                      const extras     = appts.slice(1);
                      const isExpanded = expandedResidents.has(residentKey);
                      const renderCard = (appt, isExtra = false) => (
                        <div key={appt._id} className={`appt-card${isExtra ? ' appt-card--extra' : ''}`}>
                          <div className="appt-card__top">
                            <div className="appt-card__resident">
                              <span className="appt-card__name">{appt.resident}</span>
                              {appt.residentEmail && (
                                <span className="appt-card__email">{appt.residentEmail}</span>
                              )}
                            </div>
                            <div className="appt-card__actions" onClick={e => e.stopPropagation()}>
                              <span className={`appt-status-badge ${STATUS_META[appt.status]?.className || 'status--scheduled'}`}>
                                {STATUS_META[appt.status]?.label || appt.status}
                              </span>
                              {appt.status === 'Scheduled' && (
                                <div style={{ position: 'relative', display: 'inline-block' }}>
                                  <button className="appt-table__dots-btn"
                                    onClick={e => { e.stopPropagation(); toggleMenu(appt._id); }}>
                                    <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                                      <circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/>
                                    </svg>
                                  </button>
                                  {openMenu === appt._id && (
                                    <DropdownPortal>
                                      <button className="appt-dropdown__item appt-dropdown__item--cancel-action"
                                        onClick={() => { setOpenMenu(null); requestAction(appt, 'Cancelled'); }}>
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" width="14" height="14">
                                          <circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
                                        </svg>
                                        Cancel Appointment
                                      </button>
                                    </DropdownPortal>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="appt-card__meta">
                            <span className="appt-card__meta-item">
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="13" height="13">
                                <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                              </svg>
                              {fmtDate(appt.date)}
                            </span>
                            <span className="appt-card__meta-item">
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="13" height="13">
                                <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                              </svg>
                              {fmt12(appt.time)}
                            </span>
                          </div>
                          <div className="appt-card__purpose">{appt.purpose}</div>
                        </div>
                      );
                      return (
                        <div key={residentKey} className="appt-card-group">
                          {renderCard(primary)}
                          {extras.length > 0 && (
                            <button className="appt-more-pill appt-more-pill--card"
                              onClick={e => { e.stopPropagation(); toggleResidentExpand(residentKey); }}
                              aria-expanded={isExpanded}>
                              {isExpanded ? (
                                <><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="11" height="11"><polyline points="18 15 12 9 6 15"/></svg>Collapse</>
                              ) : (
                                <><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="11" height="11"><polyline points="6 9 12 15 18 9"/></svg>+{extras.length} more appointment{extras.length > 1 ? 's' : ''}</>
                              )}
                            </button>
                          )}
                          {isExpanded && extras.map(appt => renderCard(appt, true))}
                        </div>
                      );
                    })}
                  </div>


                  {/* Pagination */}
                  {groupedResidents.length > PAGE_SIZE && (
                    <div className="appt-pagination">
                      <p className="appt-pagination__info">
                        Showing <strong>{(safePage-1)*PAGE_SIZE+1}–{Math.min(safePage*PAGE_SIZE, groupedResidents.length)}</strong> of <strong>{groupedResidents.length}</strong> residents
                      </p>
                      <div className="appt-pagination__controls">
                        <button className="appt-page-btn" disabled={safePage === 1} onClick={() => setPage(safePage - 1)}>Prev</button>
                        {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => i + 1).map(p => (
                          <button key={p}
                            className={`appt-page-num${safePage === p ? ' appt-page-num--active' : ''}`}
                            onClick={() => setPage(p)}>{p}</button>
                        ))}
                        {totalPages > 5 && <span className="appt-page-ellipsis">…</span>}
                        <button className="appt-page-btn" disabled={safePage === totalPages} onClick={() => setPage(safePage + 1)}>Next</button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* ���═══════════════════════════════════════
              TAB: AVAILABILITY
          ════════════════════════════════════════ */}
          {activeTab === 'availability' && (
            <div className="avail-body">

              {/* ── Info Banner ── */}
              <div className="avail-info-banner">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="12" y1="8" x2="12" y2="12"/>
                  <line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                Set the common schedule once, choose M T W TH F S SN, then click Save Schedule.
              </div>

              <div className="avail-simple-layout">
                <div className="avail-panel">
                  <div className="avail-panel__header">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                      <circle cx="12" cy="12" r="10"/>
                      <polyline points="12 6 12 12 16 14"/>
                    </svg>
                    <h3>Apply Schedule</h3>
                  </div>
                  <p className="avail-panel__sub">Select days, set the schedule once, then apply.</p>

                  <div className="avail-quick-days" aria-label="Apply schedule to days">
                    {DAY_CHIPS.map(({ key, short, label }) => {
                      const day = schedule[key];
                      const selected = bulkDays.has(key);
                      return (
                        <button
                          key={key}
                          type="button"
                          className={[
                            'avail-day-chip',
                            selected ? 'avail-day-chip--selected' : '',
                            day.enabled ? 'avail-day-chip--open' : 'avail-day-chip--closed',
                          ].filter(Boolean).join(' ')}
                          onClick={() => toggleBulkDay(key)}
                          title={label}
                        >
                          <span className="avail-day-chip__short">{short}</span>
                          <span className="avail-day-chip__status">
                            {day.enabled ? `${fmt12(day.start)} - ${fmt12(day.end)}` : 'Closed'}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  <div className="avail-preset-row">
                    <button type="button" onClick={() => setBulkDayPreset(WEEKDAY_KEYS)}>Weekdays</button>
                    <button type="button" onClick={() => setBulkDayPreset(DAY_KEYS)}>Every day</button>
                    <button type="button" onClick={() => setBulkDayPreset([])}>Clear</button>
                  </div>

                  <div className="avail-template-card">
                    <div className="avail-mode-toggle">
                      <button
                        type="button"
                        className={bulkTemplate.enabled ? 'avail-mode-toggle__btn avail-mode-toggle__btn--active' : 'avail-mode-toggle__btn'}
                        onClick={() => updateBulkTemplate('enabled', true)}
                      >
                        Open
                      </button>
                      <button
                        type="button"
                        className={!bulkTemplate.enabled ? 'avail-mode-toggle__btn avail-mode-toggle__btn--active' : 'avail-mode-toggle__btn'}
                        onClick={() => updateBulkTemplate('enabled', false)}
                      >
                        Closed
                      </button>
                    </div>

                    {bulkTemplate.enabled && (
                      <div className="avail-template-fields">
                        <div className="avail-time-group">
                          <label>From</label>
                          <input type="time" value={bulkTemplate.start}
                            onChange={e => updateBulkTemplate('start', e.target.value)} />
                        </div>
                        <div className="avail-time-group">
                          <label>Until</label>
                          <input type="time" value={bulkTemplate.end}
                            onChange={e => updateBulkTemplate('end', e.target.value)} />
                        </div>
                        <div className="avail-time-group">
                          <label>Slot</label>
                          <select value={bulkTemplate.slotDuration}
                            onChange={e => updateBulkTemplate('slotDuration', Number(e.target.value))}>
                            <option value={15}>15 min</option>
                            <option value={20}>20 min</option>
                            <option value={30}>30 min</option>
                            <option value={45}>45 min</option>
                            <option value={60}>60 min</option>
                          </select>
                        </div>
                        <div className="avail-time-group">
                          <label>Max / slot</label>
                          <select value={bulkTemplate.maxPerSlot}
                            onChange={e => updateBulkTemplate('maxPerSlot', Number(e.target.value))}>
                            {[1,2,3,4,5].map(n => <option key={n} value={n}>{n}</option>)}
                          </select>
                        </div>
                      </div>
                    )}

                    <div className="avail-template-actions">
                      <span>
                        {bulkTemplate.enabled
                          ? `${generateSlots(bulkTemplate.start, bulkTemplate.end, bulkTemplate.slotDuration).length} slots per selected day`
                          : 'Selected days will be closed'}
                      </span>
                      <button type="button" className="appt-header__btn" onClick={applyBulkSchedule}>
                        Apply to Selected Days
                      </button>
                    </div>
                  </div>
                </div>

                <div className="avail-panel avail-block-panel">
                  <div className="avail-panel__header">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                      <line x1="16" y1="2" x2="16" y2="6"/>
                      <line x1="8" y1="2" x2="8" y2="6"/>
                      <line x1="3" y1="10" x2="21" y2="10"/>
                    </svg>
                    <h3>Blocking Calendar</h3>
                  </div>
                  <p className="avail-panel__sub">Choose a block type, then click dates to add or remove blocks.</p>

                  <div className="avail-block-controls">
                    <div className="avail-mode-toggle">
                      <button
                        type="button"
                        className={blockType === 'fullday' ? 'avail-mode-toggle__btn avail-mode-toggle__btn--active' : 'avail-mode-toggle__btn'}
                        onClick={() => setBlockType('fullday')}
                      >
                        Full Day
                      </button>
                      <button
                        type="button"
                        className={blockType === 'specific-times' ? 'avail-mode-toggle__btn avail-mode-toggle__btn--active' : 'avail-mode-toggle__btn'}
                        onClick={() => setBlockType('specific-times')}
                      >
                        Time Range
                      </button>
                    </div>

                    {blockType === 'specific-times' && (
                      <div className="avail-template-fields avail-template-fields--compact">
                        <div className="avail-time-group">
                          <label>From</label>
                          <input type="time" value={blockStartTime} onChange={e => setBlockStartTime(e.target.value)} />
                        </div>
                        <div className="avail-time-group">
                          <label>To</label>
                          <input type="time" value={blockEndTime} onChange={e => setBlockEndTime(e.target.value)} />
                        </div>
                      </div>
                    )}

                    <div className="avail-block-inline">
                      <input
                        className="appt-form-input"
                        type="date"
                        value={newBlockedDate}
                        min={todayStr}
                        onChange={e => setNewBlockedDate(e.target.value)}
                      />
                      <button className="avail-block-btn" onClick={addBlockedDate} disabled={savingBlock || !newBlockedDate}>
                        {savingBlock ? 'Blocking...' : 'Block Date'}
                      </button>
                    </div>

                    <input
                      className="appt-form-input"
                      type="text"
                      placeholder="Reason (optional)"
                      value={blockReason}
                      onChange={e => setBlockReason(e.target.value)}
                    />
                  </div>

                  <div className="avail-cal">
                    <div className="avail-cal__nav">
                      <button className="avail-cal__nav-btn" onClick={prevMonth}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="14" height="14">
                          <polyline points="15 18 9 12 15 6"/>
                        </svg>
                      </button>
                      <span className="avail-cal__month">
                        {new Date(calMonth.year, calMonth.month).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                      </span>
                      <button className="avail-cal__nav-btn" onClick={nextMonth}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="14" height="14">
                          <polyline points="9 18 15 12 9 6"/>
                        </svg>
                      </button>
                    </div>

                    <div className="avail-cal__grid">
                      {DAY_SHORT.map(d => (
                        <div key={d} className="avail-cal__dow">{d}</div>
                      ))}
                      {buildCalendar().map((day, idx) => {
                        const status = getCellStatus(day);
                        const dateStr = day
                          ? `${calMonth.year}-${String(calMonth.month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`
                          : null;
                        const isClickable = day && status !== 'past';
                        return (
                          <button
                            key={idx}
                            type="button"
                            disabled={!isClickable}
                            onClick={() => toggleCalendarBlock(dateStr)}
                            className={[
                              'avail-cal__cell',
                              !day ? 'avail-cal__cell--empty' : '',
                              isClickable ? 'avail-cal__cell--clickable' : '',
                              status === 'past' ? 'avail-cal__cell--past' : '',
                              status === 'available' ? 'avail-cal__cell--available' : '',
                              status === 'unavailable' ? 'avail-cal__cell--unavailable' : '',
                              status === 'blocked' ? 'avail-cal__cell--blocked' : '',
                              status === 'partial' ? 'avail-cal__cell--partial' : '',
                              dateStr === todayStr ? 'avail-cal__cell--today' : '',
                            ].filter(Boolean).join(' ')}
                          >
                            {day}
                          </button>
                        );
                      })}
                    </div>

                    <div className="avail-cal__legend">
                      <span className="avail-legend-item avail-legend-item--available">Available</span>
                      <span className="avail-legend-item avail-legend-item--unavailable">Closed</span>
                      <span className="avail-legend-item avail-legend-item--blocked">Blocked</span>
                      <span className="avail-legend-item avail-legend-item--partial">Time blocked</span>
                    </div>
                  </div>

                  {blockedDates.length === 0 ? (
                    <p className="avail-block-empty">No dates blocked yet.</p>
                  ) : (
                    <div className="avail-blocked-list">
                      {blockedDates.map((blockEntry, idx) => {
                        const dateKey = blockEntry.date || blockEntry;
                        const entryType = blockEntry.type || 'fullday';
                        return (
                          <div key={`${dateKey}-${entryType}-${blockEntry.startTime || 'day'}-${idx}`} className="avail-blocked-item">
                            <div className="avail-blocked-copy">
                              <span className="avail-blocked-date">{fmtDate(dateKey)}</span>
                              <span className="avail-blocked-meta">
                                {entryType === 'fullday'
                                  ? 'Full day'
                                  : `${fmt12(blockEntry.startTime)} - ${fmt12(blockEntry.endTime)}`}
                                {blockEntry.reason ? ` - ${blockEntry.reason}` : ''}
                              </span>
                            </div>
                            <button className="avail-blocked-remove" onClick={() => removeBlockedDate(dateKey, blockEntry)}>
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="13" height="13">
                                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                              </svg>
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {showLegacyAvailability && (
              <div className="avail-layout avail-layout--legacy">

                {/* ── Left: Weekly Schedule ── */}
                <div className="avail-panel">
                  <div className="avail-panel__header">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                      <circle cx="12" cy="12" r="10"/>
                      <polyline points="12 6 12 12 16 14"/>
                    </svg>
                    <h3>Weekly Schedule</h3>
                  </div>
                  <p className="avail-panel__sub">Configure available days and hours for each day of the week.</p>

                  <div className="avail-days">
                    {DAY_KEYS.map((key) => {
                      const day = schedule[key];
                      const label = key.charAt(0).toUpperCase() + key.slice(1);
                      const slots = day.enabled ? generateSlots(day.start, day.end, day.slotDuration) : [];
                      return (
                        <div key={key} className={`avail-day-row${day.enabled ? ' avail-day-row--enabled' : ''}`}>
                          <div className="avail-day-toggle">
                            <label className="avail-toggle">
                              <input
                                type="checkbox"
                                checked={day.enabled}
                                onChange={e => updateDay(key, 'enabled', e.target.checked)}
                              />
                              <span className="avail-toggle__slider" />
                            </label>
                            <span className="avail-day-label">{label}</span>
                          </div>

                          {day.enabled ? (
                            <div className="avail-day-config">
                              <div className="avail-day-times">
                                <div className="avail-time-group">
                                  <label>From</label>
                                  <input type="time" value={day.start}
                                    onChange={e => updateDay(key, 'start', e.target.value)} />
                                </div>
                                <span className="avail-time-sep">to</span>
                                <div className="avail-time-group">
                                  <label>Until</label>
                                  <input type="time" value={day.end}
                                    onChange={e => updateDay(key, 'end', e.target.value)} />
                                </div>
                                <div className="avail-time-group">
                                  <label>Slot (min)</label>
                                  <select value={day.slotDuration}
                                    onChange={e => updateDay(key, 'slotDuration', Number(e.target.value))}>
                                    <option value={15}>15</option>
                                    <option value={20}>20</option>
                                    <option value={30}>30</option>
                                    <option value={45}>45</option>
                                    <option value={60}>60</option>
                                  </select>
                                </div>
                                <div className="avail-time-group">
                                  <label>Max / slot</label>
                                  <select value={day.maxPerSlot}
                                    onChange={e => updateDay(key, 'maxPerSlot', Number(e.target.value))}>
                                    {[1,2,3,4,5].map(n => <option key={n} value={n}>{n}</option>)}
                                  </select>
                                </div>
                              </div>
                              <SlotPreviewChips
                                dateKey={key}
                                slots={slots}
                                calMonth={calMonth}
                                maxPerSlot={day.maxPerSlot}
                              />
                            </div>
                          ) : (
                            <span className="avail-day-off">Day off</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* ── Right: Calendar Preview + Blocked Dates ── */}
                <div className="avail-right">

                  {/* Calendar Preview */}
                  <div className="avail-panel">
                    <div className="avail-panel__header">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                        <line x1="16" y1="2" x2="16" y2="6"/>
                        <line x1="8" y1="2" x2="8" y2="6"/>
                        <line x1="3" y1="10" x2="21" y2="10"/>
                      </svg>
                      <h3>Calendar Preview</h3>
                    </div>
                    <p className="avail-panel__sub">This is what residents will see when choosing a date.</p>

                    <div className="avail-cal">
                      <div className="avail-cal__nav">
                        <button className="avail-cal__nav-btn" onClick={prevMonth}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="14" height="14">
                            <polyline points="15 18 9 12 15 6"/>
                          </svg>
                        </button>
                        <span className="avail-cal__month">
                          {new Date(calMonth.year, calMonth.month).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                        </span>
                        <button className="avail-cal__nav-btn" onClick={nextMonth}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="14" height="14">
                            <polyline points="9 18 15 12 9 6"/>
                          </svg>
                        </button>
                      </div>

                      <div className="avail-cal__grid">
                        {DAY_SHORT.map(d => (
                          <div key={d} className="avail-cal__dow">{d}</div>
                        ))}
                        {buildCalendar().map((day, idx) => {
                          const status = getCellStatus(day);
                          const dateStr = day
                            ? `${calMonth.year}-${String(calMonth.month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`
                            : null;
                          return (
                            <div
                              key={idx}
                              className={[
                                'avail-cal__cell',
                                !day ? 'avail-cal__cell--empty' : '',
                                status === 'past' ? 'avail-cal__cell--past' : '',
                                status === 'available' ? 'avail-cal__cell--available' : '',
                                status === 'unavailable' ? 'avail-cal__cell--unavailable' : '',
                                status === 'blocked' ? 'avail-cal__cell--blocked' : '',
                                dateStr === todayStr ? 'avail-cal__cell--today' : '',
                              ].join(' ')}
                            >
                              {day}
                            </div>
                          );
                        })}
                      </div>

                      <div className="avail-cal__legend">
                        <span className="avail-legend-item avail-legend-item--available">Available</span>
                        <span className="avail-legend-item avail-legend-item--unavailable">Closed</span>
                        <span className="avail-legend-item avail-legend-item--blocked">Blocked</span>
                      </div>
                    </div>
                  </div>

                  {/* Blocked Dates */}
                  <div className="avail-panel">
                    <div className="avail-panel__header">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                        <circle cx="12" cy="12" r="10"/>
                        <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
                      </svg>
                      <h3>Blocked Dates & Times</h3>
                    </div>
                    <p className="avail-panel__sub">Block entire days or specific time slots to prevent bookings.</p>

                    <div className="avail-block-add">
                      <button
                        className="avail-block-btn avail-block-btn--trigger"
                        onClick={() => { setNewBlockedDate(''); setBlockType('fullday'); setBlockReason(''); setBlockStartTime('08:00'); setBlockEndTime('17:00'); setShowBlockModal(true); }}
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="14" height="14">
                          <line x1="12" y1="5" x2="12" y2="19"/>
                          <line x1="5" y1="12" x2="19" y2="12"/>
                        </svg>
                        Block a Date
                      </button>
                    </div>

                    {blockedDates.length === 0 ? (
                      <p className="avail-block-empty">No dates blocked yet.</p>
                    ) : (
                      <div className="avail-blocked-list">
                        {blockedDates.map((blockEntry, idx) => {
                          const dateKey = blockEntry.date || blockEntry;
                          const blockType = blockEntry.type || 'fullday';
                          return (
                            <div key={idx} className="avail-blocked-item">
                              <div style={{ flex: 1 }}>
                                <span className="avail-blocked-date">
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="13" height="13">
                                    <circle cx="12" cy="12" r="10"/>
                                    <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
                                  </svg>
                                  {fmtDate(dateKey)}
                                </span>
                                {blockType === 'fullday' ? (
                                  <span style={{ fontSize: 12, color: '#666', marginLeft: 8 }}>Full day</span>
                                ) : (
                                  <span style={{ fontSize: 12, color: '#666', marginLeft: 8 }}>{fmt12(blockEntry.startTime)} – {fmt12(blockEntry.endTime)}</span>
                                )}
                              </div>
                              <button className="avail-blocked-remove" onClick={() => removeBlockedDate(dateKey, blockEntry)}>
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="13" height="13">
                                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                                </svg>
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                </div>
              </div>
              )}

              <div className="avail-save-bar">
                <p className="avail-save-hint">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                  </svg>
                  Changes are applied immediately after saving. Residents will see updated availability right away.
                </p>
                <button className="appt-header__btn" onClick={saveSchedule} disabled={savingSchedule}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="15" height="15">
                    <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/>
                    <polyline points="17 21 17 13 7 13 7 21"/>
                    <polyline points="7 3 7 8 15 8"/>
                  </svg>
                  {savingSchedule ? 'Saving…' : 'Save Schedule'}
                </button>
              </div>

            </div>
          )}

        </div>

        {/* ── Block Modal ── */}
        {showBlockModal && (
          <div className="appt-modal-overlay" onClick={() => setShowBlockModal(false)}>
            <div className="appt-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 450 }}>
              <div className="appt-modal__header">
                <div>
                  <h2 className="appt-modal__title">Block a Date</h2>
                  <p className="appt-modal__subtitle">Choose a date and configure what to block.</p>
                </div>
                <button className="appt-modal__close" onClick={() => setShowBlockModal(false)}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>
              <div className="appt-modal__body">
                <div className="appt-form-group">
                  <label className="appt-form-label">Date <span className="appt-form-required">*</span></label>
                  <input
                    className="appt-form-input"
                    type="date"
                    value={newBlockedDate}
                    min={todayStr}
                    onChange={e => setNewBlockedDate(e.target.value)}
                  />
                </div>
                <div className="appt-form-group">
                  <label className="appt-form-label">Block Type</label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <button
                      onClick={() => setBlockType('fullday')}
                      style={{
                        padding: 14,
                        border: blockType === 'fullday' ? '2px solid #2563eb' : '1px solid #e5e7eb',
                        background: blockType === 'fullday' ? '#eff6ff' : '#fff',
                        borderRadius: 6,
                        cursor: 'pointer',
                        fontSize: 14,
                        fontWeight: 500,
                        transition: 'all 0.2s',
                        textAlign: 'center'
                      }}
                    >
                      📅<br/>Full Day
                    </button>
                    <button
                      onClick={() => setBlockType('specific-times')}
                      style={{
                        padding: 14,
                        border: blockType === 'specific-times' ? '2px solid #2563eb' : '1px solid #e5e7eb',
                        background: blockType === 'specific-times' ? '#eff6ff' : '#fff',
                        borderRadius: 6,
                        cursor: 'pointer',
                        fontSize: 14,
                        fontWeight: 500,
                        transition: 'all 0.2s',
                        textAlign: 'center'
                      }}
                    >
                      ⏰<br/>Specific Times
                    </button>
                  </div>
                </div>

                {blockType === 'specific-times' && (
                  <div className="appt-form-row">
                    <div className="appt-form-group">
                      <label className="appt-form-label">From</label>
                      <input
                        className="appt-form-input"
                        type="time"
                        value={blockStartTime}
                        onChange={e => setBlockStartTime(e.target.value)}
                      />
                    </div>
                    <div className="appt-form-group">
                      <label className="appt-form-label">To</label>
                      <input
                        className="appt-form-input"
                        type="time"
                        value={blockEndTime}
                        onChange={e => setBlockEndTime(e.target.value)}
                      />
                    </div>
                  </div>
                )}

                <div className="appt-form-group">
                  <label className="appt-form-label">Reason (optional)</label>
                  <input
                    className="appt-form-input"
                    type="text"
                    placeholder="e.g., Holiday, Staff meeting, Maintenance"
                    value={blockReason}
                    onChange={e => setBlockReason(e.target.value)}
                  />
                </div>
              </div>
              <div className="appt-modal__footer">
                <button className="appt-modal__cancel" onClick={() => setShowBlockModal(false)}>Cancel</button>
                <button className="appt-modal__submit" onClick={addBlockedDate} disabled={savingBlock || !newBlockedDate}>
                  {savingBlock ? 'Blocking…' : 'Confirm Block'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Create Appointment Modal ── */}
        {showModal && (
          <div className="appt-modal-overlay" onClick={closeModal}>
            <div className="appt-modal" onClick={e => e.stopPropagation()}>
              <div className="appt-modal__header">
                <div>
                  <h2 className="appt-modal__title">Create Appointment</h2>
                  <p className="appt-modal__subtitle">Manually schedule an appointment for a resident.</p>
                </div>
                <button className="appt-modal__close" onClick={closeModal}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>
              <div className="appt-modal__body">
                {/* Resident search */}
                <div className="appt-form-group" ref={residentDropdownRef}>
                  <label className="appt-form-label">Resident <span className="appt-form-required">*</span></label>
                  <div className="appt-resident-search-wrap">
                    <input className="appt-form-input"
                      type="text"
                      placeholder="Search by name or email…"
                      value={residentSearch}
                      onChange={e => handleResidentInput(e.target.value)}
                      onFocus={() => { if (residentSearch) setShowResidentDropdown(true); }}
                      autoComplete="off"
                    />
                    {residentSearching && <span className="appt-resident-search-spinner" />}
                    {selectedResident && !residentSearching && (
                      <span className="appt-resident-search-check">
                        <svg viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5" width="14" height="14">
                          <polyline points="20 6 9 17 4 12"/>
                        </svg>
                      </span>
                    )}
                  </div>
                  {showResidentDropdown && (
                    <div className="appt-resident-dropdown">
                      {residentSearching && <p className="appt-resident-dropdown__searching">Searching…</p>}
                      {!residentSearching && residentResults.length === 0 && residentSearch.trim() && (
                        <p className="appt-resident-dropdown__empty">No residents found.</p>
                      )}
                      {residentResults.map(r => (
                        <button key={r._id} className="appt-resident-dropdown__item"
                          onMouseDown={() => selectResident(r)}>
                          <span className="appt-resident-dropdown__name">{r.name}</span>
                          <span className="appt-resident-dropdown__email">{r.email}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {selectedResident && (
                    <p className="appt-resident-selected-email">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="12" height="12">
                        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                        <polyline points="22,6 12,13 2,6"/>
                      </svg>
                      {selectedResident.email}
                    </p>
                  )}
                </div>
                <div className="appt-form-row">
                  <div className="appt-form-group">
                    <label className="appt-form-label">Date <span className="appt-form-required">*</span></label>
                    <div className="appt-cal-wrap">
                      <div className="appt-cal__nav">
                        <button type="button" className="appt-cal__nav-btn" onClick={formCalPrev}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="13" height="13"><polyline points="15 18 9 12 15 6"/></svg>
                        </button>
                        <span className="appt-cal__month">
                          {new Date(formCalMonth.year, formCalMonth.month).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                        </span>
                        <button type="button" className="appt-cal__nav-btn" onClick={formCalNext}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="13" height="13"><polyline points="9 18 15 12 9 6"/></svg>
                        </button>
                      </div>
                      <div className="appt-cal__grid">
                        {DAY_SHORT.map(d => <div key={d} className="appt-cal__dow">{d}</div>)}
                        {buildFormCalendar().map((day, idx) => {
                          const status = getFormCellStatus(day);
                          const dateStr = day
                            ? `${formCalMonth.year}-${String(formCalMonth.month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`
                            : null;
                          const isSelected = dateStr === form.date;
                          const isClickable = status === 'available';
                          return (
                            <div
                              key={idx}
                              onClick={() => {
                                if (!isClickable) return;
                                handleChange('date', dateStr);
                                handleChange('time', '');
                              }}
                              className={[
                                'appt-cal__cell',
                                !day ? 'appt-cal__cell--empty' : '',
                                status === 'past' ? 'appt-cal__cell--past' : '',
                                status === 'available' ? 'appt-cal__cell--available' : '',
                                status === 'unavailable' ? 'appt-cal__cell--unavailable' : '',
                                status === 'blocked' ? 'appt-cal__cell--blocked' : '',
                                dateStr === todayStr ? 'appt-cal__cell--today' : '',
                                isSelected ? 'appt-cal__cell--selected' : '',
                              ].filter(Boolean).join(' ')}
                            >
                              {day}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  <div className="appt-form-group">
                    <label className="appt-form-label">Time <span className="appt-form-required">*</span></label>
                    {!form.date ? (
                      <div className="appt-time-empty">Select a date first</div>
                    ) : (() => {
                      const slots = getTimeSlotsForDate(form.date);
                      if (slots.length === 0) return <div className="appt-time-empty">No slots available for this date</div>;
                      return (
                        <div className="appt-time-grid">
                          {slots.map(slot => (
                            <button
                              key={slot}
                              type="button"
                              className={`appt-time-slot${form.time === slot ? ' appt-time-slot--selected' : ''}`}
                              onClick={() => handleChange('time', slot)}
                            >
                              {fmt12(slot)}
                            </button>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                </div>
                <div className="appt-form-row">
                  <div className="appt-form-group" style={{ flex: 2 }}>
                    <label className="appt-form-label">Purpose <span className="appt-form-required">*</span></label>
                    <select className="appt-form-input appt-form-select"
                      value={form.purpose} onChange={e => handleChange('purpose', e.target.value)}>
                      <option value="">Select a purpose...</option>
                      {PURPOSE_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                    {form.purpose === 'Other' && (
                      <input className="appt-form-input" style={{ marginTop: 8 }}
                        type="text" placeholder="Describe the purpose..."
                        value={form.customPurpose} onChange={e => handleChange('customPurpose', e.target.value)} />
                    )}
                  </div>
                  <div className="appt-form-group" style={{ flex: 1 }}>
                    <label className="appt-form-label">Assigned To</label>
                    <select className="appt-form-input appt-form-select"
                      value={form.assignedTo} onChange={e => handleChange('assignedTo', e.target.value)}>
                      {STAFF_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                </div>
                {formError && (
                  <div className="appt-form-error">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                      <circle cx="12" cy="12" r="10"/>
                      <line x1="12" y1="8" x2="12" y2="12"/>
                      <line x1="12" y1="16" x2="12.01" y2="16"/>
                    </svg>
                    {formError}
                  </div>
                )}
              </div>
              <div className="appt-modal__footer">
                <button className="appt-modal__cancel" onClick={closeModal} disabled={submitting}>Cancel</button>
                <button className="appt-modal__submit" onClick={handleSubmit} disabled={submitting}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="15" height="15">
                    <line x1="12" y1="5" x2="12" y2="19"/>
                    <line x1="5" y1="12" x2="19" y2="12"/>
                  </svg>
                  {submitting ? 'Creating…' : 'Create Appointment'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Cancel Confirm Modal ── */}
        {confirmAction && confirmAction.action === 'Cancelled' && (() => {
          const { appt } = confirmAction;
          return (
            <div className="appt-modal-overlay" onClick={() => { setConfirmAction(null); setConfirmNote(''); }}>
              <div className="appt-confirm-modal appt-confirm-modal--cancel" onClick={e => e.stopPropagation()}>
                <div className="appt-confirm-modal__icon appt-confirm-modal__icon--cancel">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
                  </svg>
                </div>
                <h3 className="appt-confirm-modal__title">Cancel Appointment?</h3>
                <p className="appt-confirm-modal__desc">
                  You are about to cancel the appointment for <strong>{appt.resident}</strong>.
                  Please provide a reason so the resident can be informed.
                </p>
                <div className="appt-cancel-note-wrap">
                  <label className="appt-cancel-note-label">
                    Cancellation Reason <span className="appt-form-required">*</span>
                  </label>
                  <textarea
                    className="appt-cancel-note-textarea"
                    placeholder="e.g. Staff unavailable, office closed, scheduling conflict…"
                    value={confirmNote}
                    onChange={e => setConfirmNote(e.target.value)}
                    rows={3}
                    disabled={confirming}
                  />
                  <p className="appt-cancel-note-hint">This note will be visible to the resident.</p>
                </div>
                <div className="appt-confirm-modal__actions">
                  <button
                    className="appt-modal__cancel"
                    onClick={() => { setConfirmAction(null); setConfirmNote(''); }}
                    disabled={confirming}
                  >
                    Go Back
                  </button>
                  <button
                    className="appt-confirm-modal__delete"
                    onClick={handleConfirmAction}
                    disabled={confirming || !confirmNote.trim()}
                  >
                    {confirming ? 'Cancelling…' : 'Yes, Cancel Appointment'}
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

        {/* ── Delete Confirm Modal ── */}
        {deleteTarget && (
          <div className="appt-modal-overlay" onClick={() => setDeleteTarget(null)}>
            <div className="appt-confirm-modal" onClick={e => e.stopPropagation()}>
              <div className="appt-confirm-modal__icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="3 6 5 6 21 6"/>
                  <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
                  <path d="M10 11v6M14 11v6"/>
                  <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
                </svg>
              </div>
              <h3 className="appt-confirm-modal__title">Delete Appointment?</h3>
              <p className="appt-confirm-modal__desc">
                Appointment <strong>{deleteTarget.id}</strong> for <strong>{deleteTarget.resident}</strong> will be permanently removed.
              </p>
              <div className="appt-confirm-modal__actions">
                <button className="appt-modal__cancel" onClick={() => setDeleteTarget(null)} disabled={deleting}>
                  Cancel
                </button>
                <button className="appt-confirm-modal__delete" onClick={handleDelete} disabled={deleting}>
                  {deleting ? 'Deleting…' : 'Yes, Delete'}
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

function DropdownPortal({ children }) {
  return (
    <div
      className="appt-dropdown"
      style={{ position: 'absolute', top: '100%', right: 0, marginTop: 4, zIndex: 11000 }}
      onClick={e => e.stopPropagation()}
    >
      {children}
    </div>
  );
}
