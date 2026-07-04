import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { io } from 'socket.io-client';
import { useLocation } from 'react-router-dom';
import { createPortal } from 'react-dom';
import QRCode from 'react-qr-code';
import UserSidebar from '../../components/usersidebar';
import UserTopbar  from '../../components/usertopbar';
import './userappointments.css';

const API_URL  = import.meta.env.VITE_BACKEND_URL;
const PAGE_SIZE = 10;
const PURPOSE = [
  'Barangay Clearance', 'Indigency Certificate',
];
// Purposes that expire after DOCUMENT_VALIDITY_MONTHS and require a reissue
// reason if the resident already has a valid one on file.
const REISSUABLE_PURPOSES = ['Barangay Clearance', 'Indigency Certificate'];
const REISSUE_REASONS = [
  'Lost Document',
  'Damaged Document',
  'Different Purpose',
  'Correction of Information',
  'Others',
];
const CLEARANCE_VALIDITY_MONTHS = 6; // shared validity window for both document types
const STATUS_CLS = {
  Scheduled: 'us--scheduled',
  'Pending Review': 'us--pending-review',
  Denied:    'us--denied',
  Closed:    'us--closed',
  Cancelled: 'us--cancelled',
  Released:  'us--released',
};

const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_KEYS  = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];

function getToken() {
  return (
    localStorage.getItem('token')     || sessionStorage.getItem('token') ||
    localStorage.getItem('userToken') || sessionStorage.getItem('userToken') || ''
  );
}

function fmt12(time24) {
  if (!time24) return '';
  const [h, m] = time24.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2,'0')} ${suffix}`;
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

function toMinutes(time = '') {
  const [h, m] = time.split(':').map(Number);
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

function getDayKeyFromJS(jsDay) {
  // js: 0=Sun,1=Mon,2=Tue,3=Wed,4=Thu,5=Fri,6=Sat
  return DAY_KEYS[jsDay === 0 ? 6 : jsDay - 1];
}

// Default fallback schedule if API not yet set up
const DEFAULT_SCHEDULE = {
  monday:    { enabled: true,  start: '08:00', end: '17:00', slotDuration: 30, maxPerSlot: 1 },
  tuesday:   { enabled: true,  start: '08:00', end: '17:00', slotDuration: 30, maxPerSlot: 1 },
  wednesday: { enabled: true,  start: '08:00', end: '17:00', slotDuration: 30, maxPerSlot: 1 },
  thursday:  { enabled: true,  start: '08:00', end: '17:00', slotDuration: 30, maxPerSlot: 1 },
  friday:    { enabled: true,  start: '08:00', end: '17:00', slotDuration: 30, maxPerSlot: 1 },
  saturday:  { enabled: false, start: '09:00', end: '12:00', slotDuration: 30, maxPerSlot: 1 },
  sunday:    { enabled: false, start: '09:00', end: '12:00', slotDuration: 30, maxPerSlot: 1 },
};

// Always lists "Barangay Clearance" first, then joins the rest with "and"
// (e.g. "Barangay Clearance and Indigency Certificate").
function formatPurposeList(list) {
  const ordered = [...list].sort((a, b) => {
    if (a === b) return 0;
    if (a === 'Barangay Clearance') return -1;
    if (b === 'Barangay Clearance') return 1;
    return 0;
  });
  return ordered.join(' and ');
}

function getAppointmentUniqueId(appt) {
  if (!appt) return '';
  if (appt.uniqueID) return String(appt.uniqueID);
  if (appt.uniqueId) return String(appt.uniqueId);
  if (appt.id) return String(appt.id);
  return `APT-${String(appt._id || '').slice(-8).toUpperCase()}`;
}

function getAppointmentQrValue(appt) {
  return JSON.stringify({
    type: 'appointment',
    uniqueID: getAppointmentUniqueId(appt),
    appointmentId: String(appt?._id || ''),
  });
}

export default function UserAppointments() {
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [search,      setSearch]      = useState('');
  const [filter,      setFilter]      = useState('All');
  const [page,        setPage]        = useState(1);
  const [openMenu,    setOpenMenu]    = useState(null);
  const menuRefs = useRef({});

  const [appointments, setAppointments] = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [fetchError,   setFetchError]   = useState('');

  // Book modal
  const [showModal,  setShowModal]  = useState(false);
  const [purpose,    setPurpose]    = useState(''); // kept for the legacy step wizard below (currently unused/disabled)
  const [purposes,   setPurposes]   = useState([]);  // multi-select: purposes checked by the resident
  const [note,       setNote]       = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError,  setFormError]  = useState('');

  // "Existing Appointment Found" conflict modal (shown when the resident
  // tries to book while already having an active appointment that day)
  const [existingApptConflict, setExistingApptConflict] = useState(null); // the conflicting appointment

  // Reissue soft-block (re-issuance reason required within 6 months) —
  // applies to both Barangay Clearance and Indigency Certificate. If a
  // resident books several purposes at once and more than one is due for
  // renewal, all conflicts are shown together in ONE modal with a single
  // shared reason, instead of walking through them one at a time.
  const [showReissueBlock, setShowReissueBlock] = useState(false);
  const [reissueBlockInfo, setReissueBlockInfo] = useState(null); // single-conflict case: { purpose, date, rawDate, status }
  const [reissueConflicts, setReissueConflicts] = useState([]);   // multi-conflict case: [{ purpose, recent }, ...]
  const [reissueReason,    setReissueReason]    = useState('');   // single-conflict case
  const [reissueOtherText, setReissueOtherText] = useState('');   // single-conflict case
  const [reissueReasonsByPurpose,    setReissueReasonsByPurpose]    = useState({}); // multi-conflict case: { [purpose]: reason }
  const [reissueOtherTextByPurpose,  setReissueOtherTextByPurpose]  = useState({}); // multi-conflict case: { [purpose]: otherText }
  const [reissueError,     setReissueError]     = useState('');
  // Tracks which flow opened the reissue soft-block modal, so its confirm
  // button knows whether to finish a booking or a reschedule.
  const [reissueSource,    setReissueSource]    = useState('booking'); // 'booking' | 'reschedule'

  // Availability
  const [schedule,      setSchedule]      = useState(DEFAULT_SCHEDULE);
  const [blockedDates,  setBlockedDates]  = useState([]);
  const [availLoaded,   setAvailLoaded]   = useState(false);
  const [slotUsageByDate, setSlotUsageByDate] = useState({});
  const [slotRefreshKey, setSlotRefreshKey] = useState(0);

  // Calendar state (inside booking modal)
  const [calMonth, setCalMonth] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTimePeriod, setSelectedTimePeriod] = useState('');
  const [selectedTime, setSelectedTime] = useState('');
  const [bookingStep, setBookingStep] = useState(1);

  // Cancel confirm
  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancelling,   setCancelling]   = useState(false);

  // Reschedule modal
  const [rescheduleTarget, setRescheduleTarget] = useState(null);
  const [rsCalMonth,       setRsCalMonth]       = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });
  const [rsDate,           setRsDate]           = useState('');
  const [rsTime,           setRsTime]           = useState('');
  const [rescheduling,     setRescheduling]      = useState(false);
  const [rescheduleError,  setRescheduleError]  = useState('');
  const [rsPurposes,       setRsPurposes]       = useState([]); // documents selected to keep/add in the reschedule modal

  const [toast, setToast] = useState('');
  const showToast = useCallback(msg => {
    setToast(msg);
    setTimeout(() => setToast(''), 3500);
  }, []);

  // QR modal
  const [qrAppt, setQrAppt] = useState(null);
  const qrRef = useRef(null);

  const downloadQr = useCallback(() => {
    if (!qrAppt || !qrRef.current) return;
    const svg = qrRef.current.querySelector('svg');
    if (!svg) return;
    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement('canvas');
    const size = 320;
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, size, size);
    const img = new Image();
    const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      ctx.drawImage(img, 0, 0, size, size);
      URL.revokeObjectURL(url);
      const link = document.createElement('a');
      link.download = `${getAppointmentUniqueId(qrAppt)}-qr.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    };
    img.src = url;
  }, [qrAppt]);

  // Open modal pre-filled from quick link
  useEffect(() => {
    if (location.state && location.state.quickPurpose) {
      setPurposes([location.state.quickPurpose]);
      setShowModal(true);
    }
  }, [location.state]);

  /* ── Fetch availability ── */
  const fetchAvailability = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/availability`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      if (data.schedule) setSchedule(data.schedule);
      if (data.blockedDates) setBlockedDates(data.blockedDates);
    } catch {
      // use defaults silently
    } finally {
      setAvailLoaded(true);
    }
  }, []);

  useEffect(() => { fetchAvailability(); }, [fetchAvailability]);

  /* ── Fetch appointments ── */
  const fetchAppointments = useCallback(async () => {
    setLoading(true); setFetchError('');
    try {
      const res = await fetch(`${API_URL}/appointments`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setAppointments(await res.json());
    } catch (err) {
      setFetchError('Failed to load appointments. Please try again.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAppointments(); }, [fetchAppointments]);

  /* ── Real-time socket: appointment updates for this user ── */
  useEffect(() => {
    const token = getToken();
    if (!token) return;
    const socket = io(
      import.meta.env.VITE_SOCKET_URL ||
      import.meta.env.VITE_BACKEND_URL?.replace('/api', '') || '',
      { auth: { token }, transports: ['websocket'], reconnection: true }
    );

    // Admin cancelled this user's appointment, or denied a reissue request
    socket.on('appointment_cancelled_by_admin', (appt) => {
      setAppointments(prev => prev.map(a => a._id === appt._id ? appt : a));
      setSlotRefreshKey(prev => prev + 1);
      showToast(
        appt.status === 'Denied'
          ? `Your repeat ${appt.purpose || 'document'} request was denied by the admin.`
          : 'Your appointment has been cancelled by the admin.'
      );
    });

    // Admin edited appointment details (date/time/assignedTo etc.)
    socket.on('appointment_updated_by_admin', (appt) => {
      setAppointments(prev => prev.map(a => a._id === appt._id ? appt : a));
      setSlotRefreshKey(prev => prev + 1);
      // If reschedule modal is open for this appt, close it — data has changed
      setRescheduleTarget(prev => prev?._id === appt._id ? null : prev);
    });

    // Appointment auto-closed (time passed)
    socket.on('appointment_closed', (appt) => {
      setAppointments(prev => prev.map(a => a._id === appt._id ? appt : a));
      setSlotRefreshKey(prev => prev + 1);
    });

    // Admin deleted this appointment
    socket.on('appointment_deleted', ({ _id }) => {
      setAppointments(prev => prev.filter(a => a._id !== _id));
      setCancelTarget(prev => prev?._id === _id ? null : prev);
      setRescheduleTarget(prev => prev?._id === _id ? null : prev);
      setSlotRefreshKey(prev => prev + 1);
    });

    socket.on('appointment:changed', () => {
      fetchAppointments();
      setSlotRefreshKey(prev => prev + 1);
    });

    socket.on('availability:changed', (data) => {
      if (data?.schedule) setSchedule(data.schedule);
      if (data?.blockedDates) setBlockedDates(data.blockedDates);
      if (!data?.schedule && !data?.blockedDates) fetchAvailability();
      setAvailLoaded(true);
      setSlotRefreshKey(prev => prev + 1);
    });

    return () => socket.disconnect();
  }, [fetchAppointments, fetchAvailability, showToast]);

  /* ── Close dropdown on outside click ── */
  useEffect(() => {
    const handler = () => setOpenMenu(null);
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, []);

  /* ── Calendar helpers ── */
  const buildCalendar = (cm) => {
    const { year, month } = cm;
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < firstDay; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    return cells;
  };

  const today = new Date();
  today.setHours(0,0,0,0);
  const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;

  // Track full dates
  const [fullDates, setFullDates] = useState({}); // { 'YYYY-MM-DD': true }
  const [rsFullDates, setRsFullDates] = useState({}); // same but for the reschedule calendar

  // Helper to check if a time slot is blocked
  const isTimeBlocked = (dateStr, timeStr) => {
    return blockedDates.some(blockEntry => {
      if (!blockEntry || typeof blockEntry === 'string') return false;
      if (blockEntry.date !== dateStr) return false;
      if (blockEntry.type === 'fullday') return true;
      if (blockEntry.type === 'times') {
        const [h, m] = timeStr.split(':').map(Number);
        const [bh, bm] = blockEntry.startTime.split(':').map(Number);
        const [eh, em] = blockEntry.endTime.split(':').map(Number);
        const timeInMins = h * 60 + m;
        const blockStartMins = bh * 60 + bm;
        const blockEndMins = eh * 60 + em;
        return timeInMins >= blockStartMins && timeInMins < blockEndMins;
      }
      return false;
    });
  };

  const getTimeBlocksForDate = (dateStr) => (
    blockedDates.filter(block => block && block.date === dateStr && block.type === 'times')
  );

  const getBlockForSlot = (dateStr, timeStr) => {
    return blockedDates.find(block => {
      if (!block || typeof block === 'string' || block.date !== dateStr) return false;
      if (block.type === 'fullday') return true;
      if (block.type !== 'times') return false;
      const timeInMins = toMinutes(timeStr);
      return timeInMins >= toMinutes(block.startTime) && timeInMins < toMinutes(block.endTime);
    });
  };

  // Check slot usage for visible month
  useEffect(() => {
    const checkFullDates = async () => {
      const { year, month } = calMonth;
      let newFull = {};
      for (let d = 1; d <= new Date(year, month + 1, 0).getDate(); d++) {
        const dateObj = new Date(year, month, d);
        dateObj.setHours(0,0,0,0);
        if (dateObj < today) continue;
        const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        const key = getDayKeyFromJS(dateObj.getDay());
        if (!schedule[key]?.enabled) continue;
        
        // Check if entire day is blocked
        const dayFullyBlocked = blockedDates.some(b => b && b.date === dateStr && b.type === 'fullday');
        if (dayFullyBlocked) continue;
        
        const slots = generateSlots(schedule[key].start, schedule[key].end, schedule[key].slotDuration);
        if (slots.length === 0) continue;
        let allFull = true;
        for (let s of slots) {
          // Skip if this specific time is blocked
          if (isTimeBlocked(dateStr, s)) continue;
          try {
            const res = await fetch(`${API_URL}/appointments/slot-usage?date=${dateStr}&time=${s}`);
            if (!res.ok) continue;
            const data = await res.json();
            if (data.count < schedule[key].maxPerSlot) {
              allFull = false;
              break;
            }
          } catch {
            /* ignore slot usage lookup failures for availability preview */
          }
        }
        if (allFull) newFull[dateStr] = true;
      }
      setFullDates(newFull);
    };
    checkFullDates();
    // eslint-disable-next-line
  }, [calMonth, schedule, blockedDates, slotRefreshKey]);

  // Same check but for the reschedule calendar month
  useEffect(() => {
    if (!rescheduleTarget) return; // only run when reschedule modal is open
    const checkRsFullDates = async () => {
      const { year, month } = rsCalMonth;
      let newFull = {};
      for (let d = 1; d <= new Date(year, month + 1, 0).getDate(); d++) {
        const dateObj = new Date(year, month, d);
        dateObj.setHours(0,0,0,0);
        if (dateObj < today) continue;
        const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        const key = getDayKeyFromJS(dateObj.getDay());
        if (!schedule[key]?.enabled) continue;
        const dayFullyBlocked = blockedDates.some(b => b && b.date === dateStr && b.type === 'fullday');
        if (dayFullyBlocked) continue;
        const slots = generateSlots(schedule[key].start, schedule[key].end, schedule[key].slotDuration);
        if (slots.length === 0) continue;
        let allFull = true;
        for (let s of slots) {
          if (isTimeBlocked(dateStr, s)) continue;
          try {
            const res = await fetch(`${API_URL}/appointments/slot-usage?date=${dateStr}&time=${s}`);
            if (!res.ok) continue;
            const data = await res.json();
            if (data.count < schedule[key].maxPerSlot) { allFull = false; break; }
          } catch {
            /* ignore slot usage lookup failures for availability preview */
          }
        }
        if (allFull) newFull[dateStr] = true;
      }
      setRsFullDates(newFull);
    };
    checkRsFullDates();
    // eslint-disable-next-line
  }, [rsCalMonth, schedule, blockedDates, rescheduleTarget, slotRefreshKey]);

  const getDateStatus = (day, cm, fullDatesMap = fullDates) => {
    if (!day) return 'empty';
    const { year, month } = cm;
    const dateObj = new Date(year, month, day);
    dateObj.setHours(0,0,0,0);
    if (dateObj < today) return 'past';
    const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    
    // Check if date has full-day block
    const hasFullBlock = blockedDates.some(b => b && b.date === dateStr && b.type === 'fullday');
    if (hasFullBlock) return 'blocked';
    
    const key = getDayKeyFromJS(dateObj.getDay());
    if (fullDatesMap[dateStr]) return 'full';
    if (schedule[key]?.enabled && getTimeBlocksForDate(dateStr).length > 0) return 'partial';
    if (schedule[key]?.enabled) return 'available';
    return 'closed';
  };

  const getSlots = useCallback((dateStr) => {
    if (!dateStr) return [];
    const d = new Date(dateStr + 'T00:00:00');
    const key = getDayKeyFromJS(d.getDay());
    const dayConf = schedule[key];
    if (!dayConf?.enabled) return [];
    return generateSlots(dayConf.start, dayConf.end, dayConf.slotDuration);
  }, [schedule]);

  const refreshSlotUsageForDate = useCallback(async (dateStr) => {
    if (!dateStr) return;
    const slots = getSlots(dateStr);
    if (slots.length === 0) {
      setSlotUsageByDate(prev => ({ ...prev, [dateStr]: {} }));
      return;
    }

    const entries = await Promise.all(slots.map(async slot => {
      try {
        const res = await fetch(`${API_URL}/appointments/slot-usage?date=${dateStr}&time=${slot}`);
        if (!res.ok) return [slot, 0];
        const data = await res.json();
        return [slot, Number(data.count) || 0];
      } catch {
        return [slot, 0];
      }
    }));

    setSlotUsageByDate(prev => ({ ...prev, [dateStr]: Object.fromEntries(entries) }));
  }, [getSlots]);

  useEffect(() => {
    if (selectedDate) refreshSlotUsageForDate(selectedDate);
  }, [selectedDate, refreshSlotUsageForDate, slotRefreshKey]);

  useEffect(() => {
    if (rsDate) refreshSlotUsageForDate(rsDate);
  }, [rsDate, refreshSlotUsageForDate, slotRefreshKey]);

  const getSlotMeta = (dateStr, timeStr) => {
    const d = new Date(dateStr + 'T00:00:00');
    const key = getDayKeyFromJS(d.getDay());
    const dayConf = schedule[key] || {};
    const max = dayConf.maxPerSlot || 1;
    const count = slotUsageByDate[dateStr]?.[timeStr];
    const block = getBlockForSlot(dateStr, timeStr);
    const blocked = Boolean(block);
    const full = !blocked && count !== undefined && count >= max;
    const remaining = count === undefined ? null : Math.max(0, max - count);

    return {
      block,
      blocked,
      full,
      count,
      max,
      remaining,
      canBook: !blocked && !full && count !== undefined,
    };
  };

  const getSlotsByPeriod = (dateStr, period) => {
    if (!dateStr || !period) return [];
    const allSlots = getSlots(dateStr);
    if (allSlots.length === 0) return [];

    const filtered = allSlots.filter(slot => {
      const [h] = slot.split(':').map(Number);
      if (period === 'morning') return h >= 8 && h < 12;
      if (period === 'afternoon') return h >= 13 && h <= 17;
      return true;
    });

    return filtered.map(slot => ({ time: slot, blocked: isTimeBlocked(dateStr, slot) }));
  };

  /* ── Book ── */
  // Books every checked purpose in a single request; the backend creates one
  // appointment document per purpose, all sharing the same date/time slot.
  const submitBooking = async (reissuePayloads = null) => {
    setFormError(''); setSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/appointments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({
          purposes, date: selectedDate, time: selectedTime, notes: note,
          ...(reissuePayloads && reissuePayloads.length ? { reissueRequests: reissuePayloads } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.code === 'EXISTING_APPOINTMENT' && data.existingAppointment) {
          setShowModal(false);
          setShowReissueBlock(false);
          setExistingApptConflict({
            ...data.existingAppointment,
            groupCount: data.existingAppointmentGroupCount || 1,
          });
          return;
        }
        return setFormError(data.message || 'Booking failed.');
      }
      const createdList = Array.isArray(data) ? data : [data];
      setAppointments(prev => [...createdList, ...prev]);
      setShowModal(false);
      setShowReissueBlock(false);
      setPurpose(''); setPurposes([]); setSelectedDate(''); setSelectedTime(''); setNote('');
      setSelectedTimePeriod(''); setBookingStep(1);
      setReissueBlockInfo(null); setReissueConflicts([]);
      setReissueReason(''); setReissueOtherText('');
      setReissueReasonsByPurpose({}); setReissueOtherTextByPurpose({});
      setReissueError('');
      setSlotRefreshKey(prev => prev + 1);
      showToast(
        reissuePayloads && reissuePayloads.length
          ? (createdList.length > 1
              ? `${createdList.length} appointments booked. Your repeat document request(s) are pending admin review.`
              : 'Request submitted! It is pending admin review since you already have a valid document on file.')
          : (createdList.length > 1
              ? `${createdList.length} appointments booked successfully!`
              : 'Appointment booked successfully!')
      );
    } catch {
      setFormError('Unable to connect to the server.');
    } finally {
      setSubmitting(false);
    }
  };

  // Finds the most recent, non-cancelled appointment for the given purpose
  // that falls within the last CLEARANCE_VALIDITY_MONTHS months and has been
  // Released (i.e. the admin confirmed the document was actually handed to
  // the resident). Used for both Barangay Clearance and Indigency
  // Certificate. Scheduled / Pending Review appointments haven't been
  // processed yet, so they never trigger the reissue soft-block — nor do
  // Denied/Cancelled/Closed, since those never resulted in an issued document.
  const findRecentIssuance = (purposeName) => {
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - CLEARANCE_VALIDITY_MONTHS);
    return appointments
      .filter(a => a.purpose === purposeName && a.status === 'Released' && !a.cancelled && a.rawDate)
      .filter(a => new Date(`${a.rawDate}T00:00:00`) >= cutoff)
      .sort((a, b) => new Date(b.rawDate) - new Date(a.rawDate))[0] || null;
  };

  const togglePurpose = (p) => {
    setPurposes(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]);
  };

  const handleSubmit = async () => {
    if (!purposes.length) return setFormError('Please select at least one purpose.');
    if (!selectedDate)    return setFormError('Please pick a date.');
    if (!selectedTime)    return setFormError('Please pick a time slot.');
    setFormError('');

    // Check every reissuable purpose the resident selected. If more than one
    // is due for renewal, they're all confirmed together in one combined modal.
    const conflicts = REISSUABLE_PURPOSES
      .filter(p => purposes.includes(p))
      .map(p => ({ purpose: p, recent: findRecentIssuance(p) }))
      .filter(c => c.recent);

    if (conflicts.length === 1) {
      const [only] = conflicts;
      setReissueSource('booking');
      setReissueConflicts([]);
      setReissueBlockInfo({ purpose: only.purpose, date: only.recent.date, rawDate: only.recent.rawDate, status: only.recent.status });
      setReissueReason('');
      setReissueOtherText('');
      setReissueError('');
      setShowReissueBlock(true);
      return;
    }

    if (conflicts.length > 1) {
      setReissueSource('booking');
      setReissueBlockInfo(null);
      setReissueConflicts(conflicts);
      setReissueReasonsByPurpose({});
      setReissueOtherTextByPurpose({});
      setReissueError('');
      setShowReissueBlock(true);
      return;
    }

    submitBooking();
  };

  const handleReissueSubmit = () => {
    const finish = reissueSource === 'reschedule' ? submitReschedule : submitBooking;

    // Multi-conflict case: each conflicting purpose picks its own reason.
    if (reissueConflicts.length) {
      for (const c of reissueConflicts) {
        const r = reissueReasonsByPurpose[c.purpose];
        if (!r) return setReissueError(`Please select a reason for ${c.purpose}.`);
        if (r === 'Others' && !(reissueOtherTextByPurpose[c.purpose] || '').trim()) {
          return setReissueError(`Please describe your reason for ${c.purpose}.`);
        }
      }
      setReissueError('');
      const payloads = reissueConflicts.map(c => ({
        purpose: c.purpose,
        previousClearanceDate: c.recent.rawDate || '',
        reason: reissueReasonsByPurpose[c.purpose],
        otherText: (reissueOtherTextByPurpose[c.purpose] || '').trim(),
      }));
      finish(payloads);
      return;
    }

    // Single-conflict case
    if (!reissueReason) return setReissueError('Please select a reason.');
    if (reissueReason === 'Others' && !reissueOtherText.trim()) {
      return setReissueError('Please describe your reason.');
    }
    setReissueError('');

    const entry = {
      purpose: reissueBlockInfo?.purpose,
      previousClearanceDate: reissueBlockInfo?.rawDate || '',
      reason: reissueReason,
      otherText: reissueOtherText.trim(),
    };
    finish([entry]);
  };


  // Mirrors the backend's single-active-appointment rule (see POST
  // /appointments) so we can catch it BEFORE opening the booking modal,
  // instead of letting the resident fill out the whole form and only then
  // finding out it will be rejected. "Upcoming" = not cancelled, not yet
  // closed/denied/released, and its date/time hasn't passed.
  const findExistingUpcomingAppointment = () => {
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const nowTimeStr = now.toTimeString().slice(0, 5);
    return appointments
      .filter(a =>
        !a.cancelled &&
        ['Scheduled', 'Pending Review'].includes(a.status) &&
        a.rawDate &&
        (a.rawDate > todayStr || (a.rawDate === todayStr && a.rawTime >= nowTimeStr))
      )
      .sort((a, b) => (a.rawDate + a.rawTime).localeCompare(b.rawDate + b.rawTime))[0] || null;
  };

  const openBookModal = () => {
    // If the resident already has an active upcoming appointment, don't
    // open the booking form at all — show it to them directly and let
    // them reschedule instead of trying (and failing) to book a new one.
    const existing = findExistingUpcomingAppointment();
    if (existing) {
      const groupCount = appointments.filter(a =>
        !a.cancelled &&
        a.rawDate === existing.rawDate &&
        a.rawTime === existing.rawTime
      ).length;
      setExistingApptConflict({ ...existing, groupCount });
      return;
    }

    const d = new Date();
    setCalMonth({ year: d.getFullYear(), month: d.getMonth() });
    setSelectedDate('');
    setSelectedTime('');
    setSelectedTimePeriod('');
    setBookingStep(1);
    setFormError('');
    setPurposes([]);
    setShowReissueBlock(false);
    setReissueBlockInfo(null);
    setReissueConflicts([]);
    setReissueReason('');
    setReissueOtherText('');
    setReissueReasonsByPurpose({});
    setReissueOtherTextByPurpose({});
    setReissueError('');
    setShowModal(true);
  };

  /* ── Cancel ── */
  const handleCancel = async () => {
    if (!cancelTarget) return;
    setCancelling(true);
    try {
      const res = await fetch(`${API_URL}/appointments/${cancelTarget._id}/cancel`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) return showToast(data.message || 'Cancel failed.');
      setAppointments(prev => prev.map(a => a._id === data._id ? data : a));
      setSlotRefreshKey(prev => prev + 1);
      showToast('Appointment cancelled.');
    } catch {
      showToast('Unable to connect to the server.');
    } finally {
      setCancelling(false);
      setCancelTarget(null);
    }
  };

  // Bridges the "Existing Appointment Found" conflict dialog into the
  // reschedule flow, so the resident can update their existing appointment
  // instead of trying to book a second one.
  const handleUpdateExistingAppointment = () => {
    const appt = existingApptConflict;
    setExistingApptConflict(null);
    if (appt) openReschedule(appt);
  };

  /* ── Reschedule ── */
  // When a resident booked several purposes/documents in one action, they
  // share the same date/time. Rescheduling one must move all of them, so we
  // compute the sibling group here purely for display purposes — the
  // backend independently finds and moves the real group.
  const [rescheduleGroup, setRescheduleGroup] = useState([]);

  const openReschedule = appt => {
    setRescheduleTarget(appt);
    const siblings = appointments.filter(a =>
      a.rawDate === appt.rawDate &&
      a.rawTime === appt.rawTime &&
      !a.cancelled &&
      a.status !== 'Closed' && a.status !== 'Cancelled'
    );
    const group = siblings.length ? siblings : [appt];
    setRescheduleGroup(group);
    setRsPurposes([...new Set(group.map(a => a.purpose))]);
    const d = new Date();
    setRsCalMonth({ year: d.getFullYear(), month: d.getMonth() });
    setRsDate('');
    setRsTime('');
    setRescheduleError('');
  };

  const toggleRsPurpose = (p) => {
    setRsPurposes(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]);
  };

  const handleReschedule = async () => {
    if (!rsDate) return setRescheduleError('Please pick a new date.');
    if (!rsTime) return setRescheduleError('Please pick a time slot.');
    if (!rsPurposes.length) return setRescheduleError('Please keep at least one document selected.');
    setRescheduleError('');

    // Only newly-added purposes can trigger the reissue soft-block — ones
    // already in the group were presumably already cleared when first booked.
    const originalPurposes = new Set(rescheduleGroup.map(a => a.purpose));
    const addedPurposes = rsPurposes.filter(p => !originalPurposes.has(p));

    const conflicts = REISSUABLE_PURPOSES
      .filter(p => addedPurposes.includes(p))
      .map(p => ({ purpose: p, recent: findRecentIssuance(p) }))
      .filter(c => c.recent);

    if (conflicts.length === 1) {
      const [only] = conflicts;
      setReissueSource('reschedule');
      setReissueConflicts([]);
      setReissueBlockInfo({ purpose: only.purpose, date: only.recent.date, rawDate: only.recent.rawDate, status: only.recent.status });
      setReissueReason('');
      setReissueOtherText('');
      setReissueError('');
      setShowReissueBlock(true);
      return;
    }

    if (conflicts.length > 1) {
      setReissueSource('reschedule');
      setReissueBlockInfo(null);
      setReissueConflicts(conflicts);
      setReissueReasonsByPurpose({});
      setReissueOtherTextByPurpose({});
      setReissueError('');
      setShowReissueBlock(true);
      return;
    }

    submitReschedule();
  };

  const submitReschedule = async (reissuePayloads = null) => {
    setRescheduling(true);
    try {
      const res = await fetch(`${API_URL}/appointments/${rescheduleTarget._id}/reschedule`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({
          date: rsDate, time: rsTime, purposes: rsPurposes,
          ...(reissuePayloads && reissuePayloads.length ? { reissueRequests: reissuePayloads } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) return setRescheduleError(data.message || 'Reschedule failed.');
      // Backend returns every document touched by the change — kept docs
      // moved to the new date/time, newly added docs, and any removed
      // (cancelled) docs — so update all of them in state.
      const updatedList = Array.isArray(data) ? data : [data];
      const updatedIds = new Set(updatedList.map(a => a._id));
      setAppointments(prev => [
        ...updatedList,
        ...prev.filter(a => !updatedIds.has(a._id)),
      ]);
      setSlotRefreshKey(prev => prev + 1);
      const activeCount = updatedList.filter(a => !a.cancelled).length;
      showToast(
        activeCount > 1
          ? `${activeCount} appointments rescheduled successfully!`
          : 'Appointment rescheduled successfully!'
      );
      setRescheduleTarget(null);
      setRescheduleGroup([]);
      setRsPurposes([]);
      setShowReissueBlock(false);
      setReissueBlockInfo(null); setReissueConflicts([]);
      setReissueReason(''); setReissueOtherText('');
      setReissueReasonsByPurpose({}); setReissueOtherTextByPurpose({});
      setReissueError('');
    } catch {
      setRescheduleError('Unable to connect to the server.');
      setReissueError('Unable to connect to the server.');
    } finally {
      setRescheduling(false);
    }
  };

  /* ── Filter & Pagination ── */
  const filters   = ['All', 'Scheduled', 'Released', 'Closed', 'Cancelled'];
  const displayed = appointments.filter(a => {
    const matchFilter = filter === 'All' || a.status === filter;
    const q = search.trim().toLowerCase();
    const matchSearch = !q ||
      a.purpose?.toLowerCase().includes(q) ||
      a.date?.toLowerCase().includes(q) ||
      a.time?.toLowerCase().includes(q) ||
      a.status?.toLowerCase().includes(q) ||
      a.id?.toLowerCase().includes(q) ||
      a._id?.toLowerCase().includes(q);
    return matchFilter && matchSearch;
  });

  useEffect(() => { setPage(1); }, [search, filter]);

  const totalPages = Math.max(1, Math.ceil(displayed.length / PAGE_SIZE));
  const safePage   = Math.min(page, totalPages);
  const paginated  = displayed.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const showLegacyBooking = false;

  const toggleMenu = (id) => setOpenMenu(openMenu === id ? null : id);

  /* ── Calendar nav ── */
  const prevMonth = (setter) => setter(prev => {
    let m = prev.month - 1, y = prev.year;
    if (m < 0) { m = 11; y--; }
    return { year: y, month: m };
  });
  const nextMonth = (setter) => setter(prev => {
    let m = prev.month + 1, y = prev.year;
    if (m > 11) { m = 0; y++; }
    return { year: y, month: m };
  });

  /* ── Mini Calendar + Slot Picker ── */
  const CalendarPicker = ({ cm, setCm, selDate, onDateSelect, selTime, onTimeSelect, fullDatesMap = fullDates }) => {
    const cells  = buildCalendar(cm);
    const slots  = getSlots(selDate);
    const timeBlocks = selDate ? getTimeBlocksForDate(selDate) : [];

    return (
      <div className="ucal">
        {/* Month nav */}
        <div className="ucal__nav">
          <button className="ucal__nav-btn" onClick={() => prevMonth(setCm)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="13" height="13">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
          </button>
          <span className="ucal__month-label">
            {new Date(cm.year, cm.month).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
          </span>
          <button className="ucal__nav-btn" onClick={() => nextMonth(setCm)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="13" height="13">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
          </button>
        </div>

        {/* Day-of-week headers */}
        <div className="ucal__grid">
          {DAY_SHORT.map(d => (
            <div key={d} className="ucal__dow">{d}</div>
          ))}
          {cells.map((day, idx) => {
            const status = getDateStatus(day, cm, fullDatesMap);
            const dateStr = day
              ? `${cm.year}-${String(cm.month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`
              : null;
            const isSelected = dateStr === selDate;
            const isToday    = dateStr === todayStr;
            const clickable  = status === 'available' || status === 'partial';

            return (
              <button
                key={idx}
                disabled={!clickable}
                onClick={() => { if (clickable) { onDateSelect(dateStr); onTimeSelect(''); } }}
                className={[
                  'ucal__cell',
                  !day         ? 'ucal__cell--empty'     : '',
                  status === 'past'      ? 'ucal__cell--past'      : '',
                  status === 'closed'    ? 'ucal__cell--closed'    : '',
                  status === 'blocked'   ? 'ucal__cell--blocked'   : '',
                  status === 'full'      ? 'ucal__cell--full'      : '',
                  status === 'partial'   ? 'ucal__cell--partial'   : '',
                  status === 'available' ? 'ucal__cell--available' : '',
                  isSelected   ? 'ucal__cell--selected'  : '',
                  isToday      ? 'ucal__cell--today'     : '',
                ].join(' ')}
              >
                {day}
              </button>
            );
          })}
        </div>

        {/* Legend */}
        <div className="ucal__legend">
          <span className="ucal__legend-item ucal__legend-item--available">Available</span>
          <span className="ucal__legend-item ucal__legend-item--partial">Time blocked</span>
          <span className="ucal__legend-item ucal__legend-item--full">Full</span>
          <span className="ucal__legend-item ucal__legend-item--closed">Closed</span>
          <span className="ucal__legend-item ucal__legend-item--blocked">Blocked</span>
        </div>

        {/* Time slots */}
        {selDate && (
          <div className="ucal__slots">
            <p className="ucal__slots-label">
              Times for{' '}
              <strong>
                {new Date(selDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
              </strong>
            </p>
            {timeBlocks.length > 0 && (
              <div className="ucal__blocked-list">
                {timeBlocks.map((block, idx) => (
                  <span key={`${block.startTime}-${block.endTime}-${idx}`} className="ucal__blocked-pill">
                    Blocked {fmt12(block.startTime)} - {fmt12(block.endTime)}
                    {block.reason ? ` - ${block.reason}` : ''}
                  </span>
                ))}
              </div>
            )}
            {slots.length === 0 ? (
              <p className="ucal__slots-empty">No slots available for this day.</p>
            ) : (
              <div className="ucal__slots-grid">
                {slots.map(s => {
                  const meta = getSlotMeta(selDate, s);
                  return (
                    <button
                      key={s}
                      disabled={!meta.canBook}
                      className={[
                        'ucal__slot',
                        selTime === s ? 'ucal__slot--selected' : '',
                        meta.blocked ? 'ucal__slot--blocked' : '',
                        meta.full ? 'ucal__slot--full' : '',
                        meta.count === undefined ? 'ucal__slot--checking' : '',
                      ].filter(Boolean).join(' ')}
                      onClick={() => meta.canBook && onTimeSelect(s)}
                    >
                      <span>{fmt12(s)}</span>
                      <small>
                        {meta.blocked
                          ? 'Blocked'
                          : meta.full
                            ? `Full ${meta.count}/${meta.max}`
                            : meta.count === undefined
                              ? 'Checking...'
                              : `${meta.remaining}/${meta.max} left`}
                      </small>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  /* ─── Render ──────────────────────────────────── */
  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <UserSidebar sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', height: '100vh' }}>
        <UserTopbar
          placeholder="Search appointments..."
          sidebarOpen={sidebarOpen}
          setSidebarOpen={setSidebarOpen}
          onHamburger={() => setSidebarOpen(v => !v)}
          search={search}
          onSearch={setSearch}
        />
        <div style={{ flex: 1, overflowY: 'auto' }}>
        <div className="uapt-page">
          <div className="uapt-header">
            <div>
              <h1>My Appointments</h1>
              <p>Track and manage your barangay appointments.</p>
            </div>
            <button className="uapt-new-btn" onClick={openBookModal}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="12" y1="5" x2="12" y2="19"/>
                <line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              Book Appointment
            </button>
          </div>

          <div className="uapt-body">
            <div className="uapt-filters">
              {filters.map(f => (
                <button key={f}
                  className={`uapt-filter-btn${filter === f ? ' uapt-filter-btn--active' : ''}`}
                  onClick={() => setFilter(f)}>{f}
                </button>
              ))}
            </div>

            {loading && (
              <div className="uapt-table-wrap">
                <p className="uapt-empty">Loading appointments…</p>
              </div>
            )}
            {!loading && fetchError && (
              <div className="uapt-table-wrap">
                <p className="uapt-empty" style={{ color: '#dc2626' }}>{fetchError}</p>
              </div>
            )}

            {!loading && !fetchError && (
              <div className="uapt-table-wrap">
                <table className="uapt-table uapt-table--desktop">
                  <thead>
                    <tr>
                      <th>Appointment ID</th><th>Purpose</th><th>Date &amp; Time</th>
                      <th>Assigned To</th><th>Status</th><th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginated.length === 0 && (
                      <tr><td colSpan="5" className="uapt-empty">No appointments found.</td></tr>
                    )}
                    {paginated.map(appt => (
                      <tr key={appt._id} className="uapt-row">
                        <td><span className="uapt-appt-id">{getAppointmentUniqueId(appt)}</span></td>
                        <td><span className="uapt-purpose">{appt.purpose}</span></td>
                        <td>
                          <p className="uapt-date">{appt.date}</p>
                          <p className="uapt-time">{appt.time}</p>
                        </td>
                        <td><span className="uapt-assigned">{appt.assignedTo || 'Unassigned'}</span></td>
                        <td>
                          <span className={`uapt-badge ${STATUS_CLS[appt.status] || 'us--scheduled'}`}>
                            {appt.status}
                          </span>
                          {appt.status === 'Cancelled' && appt.cancelReason && (
                            <div className="uapt-cancel-reason">
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="11" height="11">
                                <circle cx="12" cy="12" r="10"/>
                                <line x1="12" y1="8" x2="12" y2="12"/>
                                <line x1="12" y1="16" x2="12.01" y2="16"/>
                              </svg>
                              {appt.cancelReason}
                            </div>
                          )}
                          {appt.status === 'Denied' && appt.cancelReason && (
                            <div className="uapt-denial-reason">{appt.cancelReason}</div>
                          )}
                        </td>
                        <td className="uapt-menu-cell" onClick={e => e.stopPropagation()}>
                          <button
                            ref={el => menuRefs.current[appt._id] = el}
                            className="uapt-menu-btn"
                            onClick={() => toggleMenu(appt._id)}
                          >
                            <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                              <circle cx="12" cy="5"  r="1.5"/>
                              <circle cx="12" cy="12" r="1.5"/>
                              <circle cx="12" cy="19" r="1.5"/>
                            </svg>
                          </button>
                          {openMenu === appt._id && (
                            <UaptDropdownPortal anchorEl={menuRefs.current[appt._id]}>
                              <p className="uapt-dropdown__label">Options</p>
                              <button
                                className="uapt-dropdown__item uapt-dropdown__item--qr"
                                onClick={() => { setQrAppt(appt); setOpenMenu(null); }}
                              >
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                                  <rect x="3" y="3" width="7" height="7" rx="1"/>
                                  <rect x="14" y="3" width="7" height="7" rx="1"/>
                                  <rect x="3" y="14" width="7" height="7" rx="1"/>
                                  <path d="M14 14h3v3"/><path d="M21 14v7h-7"/><path d="M17 17h4"/>
                                </svg>
                                Show QR Code
                              </button>
                              {appt.status === 'Scheduled' && (
                                <>
                                  <div className="uapt-dropdown__divider" />
                                  <button
                                    className="uapt-dropdown__item uapt-dropdown__item--cancel"
                                    onClick={() => { setCancelTarget(appt); setOpenMenu(null); }}
                                  >
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                                      <circle cx="12" cy="12" r="10"/>
                                      <line x1="15" y1="9" x2="9" y2="15"/>
                                      <line x1="9" y1="9" x2="15" y2="15"/>
                                    </svg>
                                    Cancel
                                  </button>
                                </>
                              )}
                              {appt.status !== 'Scheduled' && (
                                <p className="uapt-dropdown__locked">
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="12" height="12">
                                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                                    <path d="M7 11V7a5 5 0 0110 0v4"/>
                                  </svg>
                                  No other actions available
                                </p>
                              )}
                            </UaptDropdownPortal>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* ── Mobile Cards ── */}
                <div className="uapt-card-list">
                  {paginated.length === 0 && (
                    <p className="uapt-empty">No appointments found.</p>
                  )}
                  {paginated.map(appt => (
                    <div key={appt._id} className="uapt-card">
                      <div className="uapt-card__top">
                        <div className="uapt-card__info">
                          <span className="uapt-appt-id">{getAppointmentUniqueId(appt)}</span>
                          <span className="uapt-card__purpose">{appt.purpose}</span>
                        </div>
                        <div className="uapt-card__actions" onClick={e => e.stopPropagation()}>
                          <span className={`uapt-badge ${STATUS_CLS[appt.status] || 'us--scheduled'}`}>
                            {appt.status}
                          </span>
                          <button
                            ref={el => menuRefs.current[`m-${appt._id}`] = el}
                            className="uapt-menu-btn"
                            onClick={() => toggleMenu(`m-${appt._id}`)}
                          >
                            <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                              <circle cx="12" cy="5"  r="1.5"/>
                              <circle cx="12" cy="12" r="1.5"/>
                              <circle cx="12" cy="19" r="1.5"/>
                            </svg>
                          </button>
                          {openMenu === `m-${appt._id}` && (
                            <UaptDropdownPortal anchorEl={menuRefs.current[`m-${appt._id}`]}>
                              <p className="uapt-dropdown__label">Options</p>
                              <button
                                className="uapt-dropdown__item uapt-dropdown__item--qr"
                                onClick={() => { setQrAppt(appt); setOpenMenu(null); }}
                              >
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                                  <rect x="3" y="3" width="7" height="7" rx="1"/>
                                  <rect x="14" y="3" width="7" height="7" rx="1"/>
                                  <rect x="3" y="14" width="7" height="7" rx="1"/>
                                  <path d="M14 14h3v3"/><path d="M21 14v7h-7"/><path d="M17 17h4"/>
                                </svg>
                                Show QR Code
                              </button>
                              {appt.status === 'Scheduled' && (
                                <>
                                  <div className="uapt-dropdown__divider" />
                                  <button className="uapt-dropdown__item uapt-dropdown__item--cancel"
                                    onClick={() => { setCancelTarget(appt); setOpenMenu(null); }}>
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                                      <circle cx="12" cy="12" r="10"/>
                                      <line x1="15" y1="9" x2="9" y2="15"/>
                                      <line x1="9" y1="9" x2="15" y2="15"/>
                                    </svg>
                                    Cancel
                                  </button>
                                </>
                              )}
                              {appt.status !== 'Scheduled' && (
                                <p className="uapt-dropdown__locked">
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="12" height="12">
                                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                                    <path d="M7 11V7a5 5 0 0110 0v4"/>
                                  </svg>
                                  No other actions available
                                </p>
                              )}
                            </UaptDropdownPortal>
                          )}
                        </div>
                      </div>
                      <div className="uapt-card__meta">
                        <span className="uapt-card__meta-item">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="13" height="13">
                            <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                          </svg>
                          {appt.date}
                        </span>
                        <span className="uapt-card__meta-item">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="13" height="13">
                            <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                          </svg>
                          {appt.time}
                        </span>
                      </div>
                      {appt.status === 'Cancelled' && appt.cancelReason && (
                        <div className="uapt-cancel-reason">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="11" height="11">
                            <circle cx="12" cy="12" r="10"/>
                            <line x1="12" y1="8" x2="12" y2="12"/>
                            <line x1="12" y1="16" x2="12.01" y2="16"/>
                          </svg>
                          {appt.cancelReason}
                        </div>
                      )}
                      {appt.status === 'Denied' && appt.cancelReason && (
                        <div className="uapt-denial-reason">{appt.cancelReason}</div>
                      )}
                    </div>
                  ))}
                </div>

                {displayed.length > PAGE_SIZE && (
                  <div className="uapt-pagination">
                    <p className="uapt-pagination__info">
                      Showing <strong>{(safePage-1)*PAGE_SIZE+1}–{Math.min(safePage*PAGE_SIZE, displayed.length)}</strong> of <strong>{displayed.length}</strong>
                    </p>
                    <div className="uapt-pagination__controls">
                      <button className="uapt-page-btn" disabled={safePage === 1 || displayed.length === 0} onClick={() => setPage(safePage - 1)}>Prev</button>
                      {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => i + 1).map(p => (
                        <button key={p}
                          className={`uapt-page-num${safePage === p ? ' uapt-page-num--active' : ''}`}
                          onClick={() => setPage(p)}
                        >{p}</button>
                      ))}
                      {totalPages > 5 && <span className="uapt-page-ellipsis">…</span>}
                      <button className="uapt-page-btn" disabled={safePage === totalPages || displayed.length === 0} onClick={() => setPage(safePage + 1)}>Next</button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        </div>{/* end scrollable */}

        {showModal && !showLegacyBooking && (
          <div className="uapt-overlay" onClick={() => setShowModal(false)}>
            <div className="uapt-modal uapt-modal--book uapt-modal--wide" onClick={e => e.stopPropagation()}>
              <div className="uapt-modal__header">
                <h2>Book Appointment</h2>
                <button className="uapt-modal__close" onClick={() => setShowModal(false)}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>

              <div className="uapt-modal__body uapt-book-one-panel">
                <div className="uapt-book-details">
                  <div className="uapt-form-group">
                    <label>Purpose <span>select one or more</span></label>
                    <div className="uapt-purpose-checks">
                      {PURPOSE.map(p => (
                        <label key={p} className="uapt-purpose-check">
                          <input
                            type="checkbox"
                            checked={purposes.includes(p)}
                            onChange={() => togglePurpose(p)}
                          />
                          <span>{p}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="uapt-form-group">
                    <label>Notes <span>optional</span></label>
                    <textarea
                      value={note}
                      onChange={e => setNote(e.target.value)}
                      placeholder="Any special requirements or notes..."
                      rows={3}
                    />
                  </div>

                  <div className="uapt-book-summary">
                    <p>Selected slot</p>
                    {selectedDate ? (
                      <strong>
                        {new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', {
                          weekday: 'short',
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                        {selectedTime ? ` at ${fmt12(selectedTime)}` : ''}
                      </strong>
                    ) : (
                      <span>Choose a date to see all available and blocked times.</span>
                    )}
                  </div>
                </div>

                <div className="uapt-book-calendar">
                  {!availLoaded ? (
                    <div className="ucal-loading">
                      <span className="ucal-loading__spinner" />
                      Loading available dates...
                    </div>
                  ) : (
                    <CalendarPicker
                      cm={calMonth}
                      setCm={setCalMonth}
                      selDate={selectedDate}
                      onDateSelect={setSelectedDate}
                      selTime={selectedTime}
                      onTimeSelect={setSelectedTime}
                    />
                  )}
                </div>
              </div>

              <div className="uapt-modal__footer">
                {formError && <p className="uapt-form-error">{formError}</p>}
                <button className="uapt-ghost-btn" onClick={() => setShowModal(false)}>Cancel</button>
                <button
                  className="uapt-submit-btn"
                  onClick={handleSubmit}
                  disabled={submitting || !purposes.length || !selectedDate || !selectedTime}
                >
                  {submitting ? 'Booking...' : 'Book Appointment'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ════════════════════════
            BARANGAY CLEARANCE RE-ISSUANCE SOFT-BLOCK
        ════════════════════════ */}
        {showReissueBlock && (
          <div className="uapt-overlay uapt-overlay--elevated" onClick={() => setShowReissueBlock(false)}>
            <div className="uapt-modal uapt-modal--book" onClick={e => e.stopPropagation()}>
              <div className="uapt-modal__header">
                <h2>
                  {reissueConflicts.length > 1
                    ? 'Documents Already Issued'
                    : `${reissueBlockInfo?.purpose} Already Issued`}
                </h2>
                <button className="uapt-modal__close" onClick={() => setShowReissueBlock(false)}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>

              <div className="uapt-modal__body">
                {reissueConflicts.length > 1 ? (
                  <>
                    <p className="uapt-reissue-notice">
                      Some of your selected documents have already been issued recently. Please provide a reason for requesting them again.
                    </p>

                    {reissueConflicts.map(c => (
                      <div className="uapt-reissue-purpose-block" key={c.purpose}>
                        <p className="uapt-reissue-purpose-label">
                          <strong>{c.purpose}</strong> — issued on {c.recent.date}
                        </p>

                        <div className="uapt-reissue-options">
                          {REISSUE_REASONS.map(r => (
                            <label key={r} className="uapt-reissue-option">
                              <input
                                type="radio"
                                name={`reissueReason-${c.purpose}`}
                                value={r}
                                checked={reissueReasonsByPurpose[c.purpose] === r}
                                onChange={() => setReissueReasonsByPurpose(prev => ({ ...prev, [c.purpose]: r }))}
                              />
                              <span>{r}</span>
                            </label>
                          ))}
                        </div>

                        <div className="uapt-form-group">
                          <label>
                            Additional Details {reissueReasonsByPurpose[c.purpose] === 'Others' ? '' : <span style={{ fontWeight: 400, color: '#9ca3af' }}>(optional)</span>}
                          </label>
                          <textarea
                            rows={2}
                            placeholder={
                              reissueReasonsByPurpose[c.purpose] === 'Others'
                                ? 'Please specify your reason...'
                                : 'Add any details that might help the admin review your request...'
                            }
                            value={reissueOtherTextByPurpose[c.purpose] || ''}
                            onChange={e => setReissueOtherTextByPurpose(prev => ({ ...prev, [c.purpose]: e.target.value }))}
                            autoFocus={reissueReasonsByPurpose[c.purpose] === 'Others'}
                          />
                        </div>
                      </div>
                    ))}
                  </>
                ) : (
                  <>
                    <p className="uapt-reissue-notice">
                      A {reissueBlockInfo?.purpose} was already issued on <strong>{reissueBlockInfo?.date}</strong>.
                      {' '}It falls within the six (6) month validity window.
                    </p>
                    <p className="uapt-reissue-subtext">
                      If you still need to book another {reissueBlockInfo?.purpose}, please provide a reason for your request.
                    </p>

                    <div className="uapt-reissue-options">
                      {REISSUE_REASONS.map(r => (
                        <label key={r} className="uapt-reissue-option">
                          <input
                            type="radio"
                            name="reissueReason"
                            value={r}
                            checked={reissueReason === r}
                            onChange={() => setReissueReason(r)}
                          />
                          <span>{r}</span>
                        </label>
                      ))}
                    </div>

                    <div className="uapt-form-group">
                      <label>
                        Additional Details {reissueReason === 'Others' ? '' : <span style={{ fontWeight: 400, color: '#9ca3af' }}>(optional)</span>}
                      </label>
                      <textarea
                        rows={2}
                        placeholder={
                          reissueReason === 'Others'
                            ? 'Please specify your reason...'
                            : 'Add any details that might help the admin review your request...'
                        }
                        value={reissueOtherText}
                        onChange={e => setReissueOtherText(e.target.value)}
                        autoFocus={reissueReason === 'Others'}
                      />
                    </div>
                  </>
                )}

              </div>

              <div className="uapt-modal__footer">
                {reissueError && <p className="uapt-form-error">{reissueError}</p>}
                <button className="uapt-ghost-btn" onClick={() => setShowReissueBlock(false)}>Cancel</button>
                <button
                  className="uapt-submit-btn"
                  onClick={handleReissueSubmit}
                  disabled={reissueSource === 'reschedule' ? rescheduling : submitting}
                >
                  {(reissueSource === 'reschedule' ? rescheduling : submitting) ? 'Submitting...' : 'Submit'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ════════════════════════
            BOOK MODAL (4-Step Wizard)
        ════════════════════════ */}
        {showLegacyBooking && showModal && (
          <div className="uapt-overlay" onClick={() => setShowModal(false)}>
            <div className="uapt-modal uapt-modal--book" onClick={e => e.stopPropagation()}>
              <div className="uapt-modal__header">
                <h2>
                  {bookingStep === 1 && 'Step 1: Select Purpose'}
                  {bookingStep === 2 && 'Step 2: Pick a Date'}
                  {bookingStep === 3 && 'Step 3: Pick a Time'}
                  {bookingStep === 4 && 'Step 4: Confirm Booking'}
                </h2>
                <button className="uapt-modal__close" onClick={() => setShowModal(false)}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>

              <div className="uapt-modal__body" style={{ minHeight: 300 }}>
                {/* STEP 1: PURPOSE */}
                {bookingStep === 1 && (
                  <div className="uapt-form-group">
                    <label style={{ marginBottom: 16 }}>What is the purpose of your appointment?</label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 8 }}>
                      {PURPOSE.map(p => (
                        <button
                          key={p}
                          onClick={() => { setPurpose(p); setBookingStep(2); }}
                          style={{
                            padding: 12,
                            border: purpose === p ? '2px solid #3b82f6' : '1px solid #e5e7eb',
                            background: purpose === p ? '#eff6ff' : '#fff',
                            borderRadius: 6,
                            cursor: 'pointer',
                            fontSize: 14,
                            fontWeight: 500,
                            textAlign: 'left',
                            transition: 'all 0.2s'
                          }}
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* STEP 2: DATE */}
                {bookingStep === 2 && (
                  <div className="uapt-form-group">
                    <label style={{ marginBottom: 12 }}>Pick a date</label>
                    {!availLoaded ? (
                      <div className="ucal-loading">
                        <span className="ucal-loading__spinner" />
                        Loading available dates…
                      </div>
                    ) : (
                      <>
                        <div className="ucal">
                          {/* Month nav */}
                          <div className="ucal__nav">
                            <button className="ucal__nav-btn" onClick={() => prevMonth(setCalMonth)}>
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="13" height="13">
                                <polyline points="15 18 9 12 15 6"/>
                              </svg>
                            </button>
                            <span className="ucal__month-label">
                              {new Date(calMonth.year, calMonth.month).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                            </span>
                            <button className="ucal__nav-btn" onClick={() => nextMonth(setCalMonth)}>
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="13" height="13">
                                <polyline points="9 18 15 12 9 6"/>
                              </svg>
                            </button>
                          </div>

                          {/* Calendar grid */}
                          <div className="ucal__grid">
                            {DAY_SHORT.map(d => (
                              <div key={d} className="ucal__dow">{d}</div>
                            ))}
                            {buildCalendar(calMonth).map((day, idx) => {
                              const status = getDateStatus(day, calMonth);
                              const dateStr = day
                                ? `${calMonth.year}-${String(calMonth.month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`
                                : null;
                              const isSelected = dateStr === selectedDate;
                              const isToday    = dateStr === todayStr;
                              const clickable  = status === 'available';

                              return (
                                <button
                                  key={idx}
                                  disabled={!clickable || status === 'full'}
                                  onClick={() => { if (clickable && status !== 'full') { setSelectedDate(dateStr); setBookingStep(3); setSelectedTimePeriod(''); } }}
                                  className={[
                                    'ucal__cell',
                                    !day         ? 'ucal__cell--empty'     : '',
                                    status === 'past'      ? 'ucal__cell--past'      : '',
                                    status === 'closed'    ? 'ucal__cell--closed'    : '',
                                    status === 'blocked'   ? 'ucal__cell--blocked'   : '',
                                    status === 'full'      ? 'ucal__cell--full'      : '',
                                    status === 'available' ? 'ucal__cell--available' : '',
                                    isSelected   ? 'ucal__cell--selected'  : '',
                                    isToday      ? 'ucal__cell--today'     : '',
                                  ].join(' ')}
                                  style={status === 'blocked' || status === 'full' ? { background: '#ef4444', color: '#fff', borderColor: '#ef4444' } : {}}
                                >
                                  {day}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                )}

                {/* STEP 3: TIME PERIOD + SLOTS */}
                {bookingStep === 3 && (
                  <div className="uapt-form-group">
                    <div style={{ marginBottom: 20 }}>
                      <p style={{ fontSize: 13, color: '#666', marginBottom: 12 }}>
                        <strong>Date:</strong> {selectedDate ? new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : ''}
                      </p>
                      <label style={{ marginBottom: 12, display: 'block' }}>Select a time period:</label>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                        <button
                          onClick={() => { setSelectedTimePeriod('morning'); setSelectedTime(''); }}
                          style={{
                            padding: 14,
                            border: selectedTimePeriod === 'morning' ? '2px solid #3b82f6' : '1px solid #e5e7eb',
                            background: selectedTimePeriod === 'morning' ? '#eff6ff' : '#fff',
                            borderRadius: 6,
                            cursor: 'pointer',
                            fontSize: 14,
                            fontWeight: 500,
                            transition: 'all 0.2s'
                          }}
                        >
                          Morning<br/>
                          <span style={{ fontSize: 12, fontWeight: 400, color: '#666' }}>8:00 AM – 12:00 PM</span>
                        </button>
                        <button
                          onClick={() => { setSelectedTimePeriod('afternoon'); setSelectedTime(''); }}
                          style={{
                            padding: 14,
                            border: selectedTimePeriod === 'afternoon' ? '2px solid #3b82f6' : '1px solid #e5e7eb',
                            background: selectedTimePeriod === 'afternoon' ? '#eff6ff' : '#fff',
                            borderRadius: 6,
                            cursor: 'pointer',
                            fontSize: 14,
                            fontWeight: 500,
                            transition: 'all 0.2s'
                          }}
                        >
                          Afternoon<br/>
                          <span style={{ fontSize: 12, fontWeight: 400, color: '#666' }}>1:00 PM – 5:00 PM</span>
                        </button>
                      </div>
                    </div>

                    {selectedTimePeriod && (
                      <div>
                        <label style={{ marginBottom: 12, display: 'block' }}>Select a time slot:</label>
                        {getSlotsByPeriod(selectedDate, selectedTimePeriod).length === 0 ? (
                          <p style={{ color: '#666', fontSize: 14 }}>No slots available for this period.</p>
                        ) : getSlotsByPeriod(selectedDate, selectedTimePeriod).every(s => s.blocked) ? (
                          <p style={{ color: '#dc2626', fontSize: 14 }}>All slots in this period are blocked.</p>
                        ) : null}
                        <div className="ucal__slots-grid">
                          {getSlotsByPeriod(selectedDate, selectedTimePeriod).map(({ time: s, blocked }) => (
                            <button
                              key={s}
                              disabled={blocked}
                              className={`ucal__slot${selectedTime === s ? ' ucal__slot--selected' : ''}${blocked ? ' ucal__slot--blocked' : ''}`}
                              onClick={() => !blocked && setSelectedTime(s)}
                              style={{
                                padding: 10,
                                borderRadius: 4,
                                fontSize: 13,
                                fontWeight: 500,
                                transition: 'all 0.2s',
                                ...(blocked ? {} : selectedTime === s
                                  ? { border: '2px solid #3b82f6', background: '#3b82f6', color: '#fff' }
                                  : { border: '1px solid #e5e7eb', background: '#fff', color: '#000', cursor: 'pointer' })
                              }}
                            >
                              {fmt12(s)}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* STEP 4: CONFIRM */}
                {bookingStep === 4 && (
                  <div className="uapt-form-group">
                    <div style={{ background: '#f3f4f6', padding: 16, borderRadius: 8, marginBottom: 16 }}>
                      <p style={{ fontSize: 13, margin: '8px 0', color: '#374151' }}>
                        <strong>Purpose:</strong> {purpose}
                      </p>
                      <p style={{ fontSize: 13, margin: '8px 0', color: '#374151' }}>
                        <strong>Date:</strong> {selectedDate ? new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) : ''}
                      </p>
                      <p style={{ fontSize: 13, margin: '8px 0', color: '#374151' }}>
                        <strong>Time:</strong> {fmt12(selectedTime)}
                      </p>
                    </div>

                    <label style={{ marginBottom: 12, display: 'block' }}>Additional notes (optional)</label>
                    <textarea
                      value={note}
                      onChange={e => setNote(e.target.value)}
                      placeholder="Any special requirements or notes..."
                      rows={2}
                      style={{
                        width: '100%',
                        padding: 10,
                        border: '1px solid #e5e7eb',
                        borderRadius: 6,
                        fontFamily: 'inherit',
                        fontSize: 14,
                        boxSizing: 'border-box'
                      }}
                    />

                  </div>
                )}
              </div>

              <div className="uapt-modal__footer">
                {formError && <p className="uapt-form-error">{formError}</p>}
                <button
                  className="uapt-ghost-btn"
                  onClick={() => {
                    if (bookingStep > 1) {
                      setBookingStep(bookingStep - 1);
                      setFormError('');
                    } else {
                      setShowModal(false);
                    }
                  }}
                >
                  {bookingStep === 1 ? 'Cancel' : 'Back'}
                </button>
                <button
                  className="uapt-submit-btn"
                  onClick={() => {
                    if (bookingStep === 1 && !purpose) {
                      setFormError('Please select a purpose.');
                      return;
                    }
                    if (bookingStep === 2 && !selectedDate) {
                      setFormError('Please select a date.');
                      return;
                    }
                    if (bookingStep === 3 && !selectedTime) {
                      setFormError('Please select a time slot.');
                      return;
                    }
                    setFormError('');
                    if (bookingStep < 4) {
                      setBookingStep(bookingStep + 1);
                    } else {
                      handleSubmit();
                    }
                  }}
                  disabled={submitting}
                >
                  {bookingStep === 4 ? (submitting ? 'Confirming…' : 'Confirm Appointment') : 'Next'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Existing Appointment Found Modal ── */}
        {existingApptConflict && (
          <div className="uapt-overlay" onClick={() => setExistingApptConflict(null)}>
            <div className="uapt-modal uapt-modal--sm" onClick={e => e.stopPropagation()}>
              <div className="uapt-confirm-icon uapt-confirm-icon--blue">
                <svg viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2.2" width="24" height="24">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="12" y1="8" x2="12" y2="13"/><circle cx="12" cy="16" r="0.5" fill="#2563eb"/>
                </svg>
              </div>
              <div className="uapt-modal__header" style={{ border: 'none', paddingTop: 0 }}>
                <h2>Existing Appointment Found</h2>
                <button className="uapt-modal__close" onClick={() => setExistingApptConflict(null)}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>
              <div className="uapt-modal__body" style={{ gap: 0, paddingTop: 0 }}>
                <p style={{ fontSize: 14, color: '#374151', margin: 0, lineHeight: 1.6 }}>
                  You already have an upcoming <strong>{existingApptConflict.purpose}</strong> appointment
                  on <strong>{existingApptConflict.date}</strong> at{' '}
                  <strong>{existingApptConflict.time}</strong>
                  {existingApptConflict.groupCount > 1
                    ? ` (covering ${existingApptConflict.groupCount} documents)`
                    : ''}
                  . You can only have one active appointment at a time — reschedule it if you'd like a different date or time.
                </p>
              </div>
              <div className="uapt-modal__footer">
                <button className="uapt-ghost-btn" onClick={() => setExistingApptConflict(null)}>Close</button>
                <button className="uapt-submit-btn" onClick={handleUpdateExistingAppointment}>
                  Reschedule
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Cancel Confirm Modal ── */}
        {cancelTarget && (
          <div className="uapt-overlay" onClick={() => setCancelTarget(null)}>
            <div className="uapt-modal uapt-modal--sm" onClick={e => e.stopPropagation()}>
              <div className="uapt-confirm-icon uapt-confirm-icon--danger">
                <svg viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.2" width="24" height="24">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
                </svg>
              </div>
              <div className="uapt-modal__header" style={{ border: 'none', paddingTop: 0 }}>
                <h2>Cancel Appointment?</h2>
                <button className="uapt-modal__close" onClick={() => setCancelTarget(null)}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>
              <div className="uapt-modal__body" style={{ gap: 0, paddingTop: 0 }}>
                <p style={{ fontSize: 14, color: '#374151', margin: 0, lineHeight: 1.6 }}>
                  Are you sure you want to cancel your <strong>{cancelTarget.purpose}</strong> appointment
                  on <strong>{cancelTarget.date}</strong> at <strong>{cancelTarget.time}</strong>?
                  This action cannot be undone.
                </p>
              </div>
              <div className="uapt-modal__footer">
                <button className="uapt-ghost-btn" onClick={() => setCancelTarget(null)}>Keep It</button>
                <button className="uapt-submit-btn" style={{ background: '#ef4444' }}
                  onClick={handleCancel} disabled={cancelling}>
                  {cancelling ? 'Cancelling…' : 'Yes, Cancel'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Reschedule Modal (Calendar) ── */}
        {rescheduleTarget && (
          <div className="uapt-overlay" onClick={() => setRescheduleTarget(null)}>
            <div className="uapt-modal uapt-modal--book" onClick={e => e.stopPropagation()}>
              <div className="uapt-modal__header">
                <h2>Reschedule Appointment</h2>
                <button className="uapt-modal__close" onClick={() => setRescheduleTarget(null)}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>
              <div className="uapt-modal__body">
                <p className="uapt-reschedule-desc">
                  {rescheduleGroup.length > 1 ? (
                    <>
                      Choose a new date and time for your{' '}
                      <strong>{formatPurposeList(rescheduleGroup.map(a => a.purpose))}</strong> appointments.
                      All {rescheduleGroup.length} documents booked for this slot will move together.
                    </>
                  ) : (
                    <>Choose a new date and time for your <strong>{rescheduleTarget.purpose}</strong> appointment.</>
                  )}
                </p>

                <div className="uapt-form-group">
                  <label>Documents <span>add or remove what you need</span></label>
                  <div className="uapt-purpose-checks">
                    {PURPOSE.map(p => (
                      <label key={p} className="uapt-purpose-check">
                        <input
                          type="checkbox"
                          checked={rsPurposes.includes(p)}
                          onChange={() => toggleRsPurpose(p)}
                        />
                        <span>{p}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="uapt-form-group">
                  <label>Pick a New Date &amp; Time</label>
                  <CalendarPicker
                    cm={rsCalMonth}
                    setCm={setRsCalMonth}
                    selDate={rsDate}
                    onDateSelect={setRsDate}
                    selTime={rsTime}
                    onTimeSelect={setRsTime}
                    fullDatesMap={rsFullDates}
                  />
                </div>

                {rsDate && rsTime && (
                  <div className="ucal__summary">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                    <strong>
                      {new Date(rsDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                    </strong>
                    {' at '}
                    <strong>{fmt12(rsTime)}</strong>
                  </div>
                )}

              </div>
              <div className="uapt-modal__footer">
                {rescheduleError && <p className="uapt-form-error">{rescheduleError}</p>}
                <button className="uapt-ghost-btn" onClick={() => setRescheduleTarget(null)}>Go Back</button>
                <button className="uapt-submit-btn" onClick={handleReschedule} disabled={rescheduling || !rsPurposes.length}>
                  {rescheduling ? 'Saving…' : 'Confirm Reschedule'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── QR Code Modal ── */}
        {qrAppt && (
          <div className="uapt-overlay" onClick={() => setQrAppt(null)}>
            <div className="uapt-modal uapt-modal--sm uapt-modal--qr" onClick={e => e.stopPropagation()}>
              <div className="uapt-modal__header">
                <div>
                  <h2>Appointment QR Code</h2>
                  <p className="uapt-qr-subtitle">{getAppointmentUniqueId(qrAppt)}</p>
                </div>
                <button className="uapt-modal__close" onClick={() => setQrAppt(null)}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>
              <div className="uapt-modal__body uapt-qr-body" ref={qrRef}>
                <div className="uapt-qr-code-wrap">
                  <QRCode
                    value={getAppointmentQrValue(qrAppt)}
                    size={220}
                  />
                </div>
                <div className="uapt-qr-info">
                  <div className="uapt-qr-row">
                    <span>Purpose</span>
                    <strong>{qrAppt.purpose}</strong>
                  </div>
                  <div className="uapt-qr-row">
                    <span>Date &amp; Time</span>
                    <strong>{qrAppt.date} at {qrAppt.time}</strong>
                  </div>
                  <div className="uapt-qr-row">
                    <span>Status</span>
                    <strong>
                      <span className={`uapt-badge ${STATUS_CLS[qrAppt.status] || 'us--scheduled'}`} style={{ fontSize: 11, padding: '2px 8px' }}>
                        {qrAppt.status}
                      </span>
                    </strong>
                  </div>
                </div>
                <p className="uapt-qr-hint">Present this QR code at the barangay hall for your appointment.</p>
              </div>
              <div className="uapt-modal__footer">
                <button className="uapt-ghost-btn" onClick={() => setQrAppt(null)}>Close</button>
                <button className="uapt-submit-btn uapt-download-btn" onClick={downloadQr}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="14" height="14">
                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                    <polyline points="7 10 12 15 17 10"/>
                    <line x1="12" y1="15" x2="12" y2="3"/>
                  </svg>
                  Download QR
                </button>
              </div>
            </div>
          </div>
        )}

        {toast && (
          <div className="uapt-toast">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="16" height="16">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            {toast}
          </div>
        )}
      </div>
    </div>
  );
}

function UaptDropdownPortal({ children, anchorEl }) {
  const style = useMemo(() => {
    if (anchorEl) {
      const rect = anchorEl.getBoundingClientRect();
      return { position: 'fixed', top: rect.bottom + 4, left: rect.right - 190, zIndex: 9999 };
    }
    return {};
  }, [anchorEl]);

  return createPortal(
    <div className="uapt-dropdown" style={style}>{children}</div>,
    document.body
  );
}