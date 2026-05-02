import express from 'express';
import jwt from 'jsonwebtoken';
import Appointment from '../models/appointments.js';

const router = express.Router();

// --- Slot usage endpoint for UI ---
// GET /api/appointments/slot-usage?date=YYYY-MM-DD&time=HH:MM
router.get('/appointments/slot-usage', async (req, res) => {
  try {
    const { date, time } = req.query;
    if (!date || !time) return res.status(400).json({ message: 'date and time required' });
    const count = await Appointment.countDocuments({ date, time, cancelled: { $ne: true } });
    res.json({ date, time, count });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/* ── Auth helpers ─────────────────────────────────────────────────────────── */

function verifyAdmin(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ message: 'No token.' });
  try {
    const decoded = jwt.verify(auth.split(' ')[1], process.env.JWT_SECRET || 'your_secret_key');
    if (decoded.role !== 'admin') return res.status(403).json({ message: 'Admin only.' });
    req.admin = decoded;
    next();
  } catch {
    res.status(401).json({ message: 'Invalid token.' });
  }
}

function verifyUser(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ message: 'No token.' });
  try {
    const decoded = jwt.verify(auth.split(' ')[1], process.env.JWT_SECRET || 'your_secret_key');
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ message: 'Invalid token.' });
  }
}

/* ── Display helpers ──────────────────────────────────────────────────────── */

function formatDateDisplay(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return new Date(Number(y), Number(m) - 1, Number(d))
    .toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatTimeDisplay(t) {
  if (!t) return '';
  const [h, min] = t.split(':').map(Number);
  return `${h % 12 || 12}:${String(min).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

function serialize(doc) {
  const o = doc.toObject ? doc.toObject() : { ...doc };
  return {
    _id:           o._id,
    id:            `APT-${String(o._id).slice(-6).toUpperCase()}`,
    resident:      o.resident,
    residentEmail: o.residentEmail || '',
    userId:        o.userId,
    purpose:       o.purpose,
    date:          formatDateDisplay(o.date),
    rawDate:       o.date,
    time:          formatTimeDisplay(o.time),
    rawTime:       o.time,
    assignedTo:    o.assignedTo,
    cancelled:     o.cancelled || false,
    cancelReason:  o.cancelReason || '',
    notes:         o.notes,
    status:        o.status || 'Scheduled',
    createdAt:     o.createdAt,
  };
}

/* ══════════════════════════════════════════════════════════════════
   ADMIN ROUTES
══════════════════════════════════════════════════════════════════ */

// Auto-close past appointments
router.get('/admin/appointments', verifyAdmin, async (req, res) => {
  try {
    const { search = '', status } = req.query;
    const query = {};
    if (status && status !== 'All') query.status = status;
    if (search) {
      query.$or = [
        { resident: { $regex: search, $options: 'i' } },
        { purpose:  { $regex: search, $options: 'i' } },
      ];
    }
    // Auto-close logic
    const now = new Date();
    const todayStr = now.toISOString().slice(0,10);
    const timeStr = now.toTimeString().slice(0,5);
    const toClose = await Appointment.find({
      cancelled: { $ne: true },
      status: { $ne: 'Closed' },
      $or: [
        { date: { $lt: todayStr } },
        { date: todayStr, time: { $lt: timeStr } },
      ]
    });
    for (const appt of toClose) {
      appt.status = 'Closed';
      await appt.save();
      // Notify the user whose appointment just closed
      if (appt.userId) {
        req.app.get('io')?.to(`user_${appt.userId}`).emit('appointment_closed', serialize(appt));
      }
    }
    const docs = await Appointment.find(query).sort({ createdAt: -1 });
    res.json(docs.map(serialize));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

import Availability from '../models/availability.js';

const DAY_KEYS_BY_JS = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];

function toMinutes(time = '') {
  const [h, m] = time.split(':').map(Number);
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

function slotIsBlocked(avail, date, time) {
  return (avail.blockedDates || []).some(block => {
    if (!block || block.date !== date) return false;
    const type = block.type || 'fullday';
    if (type === 'fullday') return true;
    if (type !== 'times') return false;
    const slotMins = toMinutes(time);
    return slotMins >= toMinutes(block.startTime) && slotMins < toMinutes(block.endTime);
  });
}

async function validateAppointmentSlot(date, time, excludeId = null) {
  const avail = await Availability.findOne();
  if (!avail) return { ok: false, status: 500, message: 'Availability schedule not set.' };

  const jsDay = new Date(`${date}T00:00:00`).getDay();
  const dayKey = DAY_KEYS_BY_JS[jsDay];
  const sched = avail.schedule?.[dayKey];
  if (!sched?.enabled) {
    return { ok: false, status: 400, message: 'Selected day is not available for appointments.' };
  }

  if (slotIsBlocked(avail, date, time)) {
    return { ok: false, status: 400, message: 'Selected date or time is blocked by the admin.' };
  }

  const query = { date, time, cancelled: { $ne: true } };
  if (excludeId) query._id = { $ne: excludeId };
  const maxPerSlot = sched.maxPerSlot || 1;
  const slotCount = await Appointment.countDocuments(query);
  if (slotCount >= maxPerSlot) {
    return { ok: false, status: 400, message: `This slot is already full (${slotCount}/${maxPerSlot}).` };
  }

  return { ok: true };
}

router.post('/admin/appointments', verifyAdmin, async (req, res) => {
  try {
    const { resident, residentEmail, userId, purpose, date, time, assignedTo, notes } = req.body;
    if (!resident || !purpose || !date || !time)
      return res.status(400).json({ message: 'resident, purpose, date and time are required.' });

    const slotValidation = await validateAppointmentSlot(date, time);
    if (!slotValidation.ok) {
      return res.status(slotValidation.status).json({ message: slotValidation.message });
    }

    const doc = await Appointment.create({
      resident,
      residentEmail: residentEmail || '',
      userId: userId || null,
      purpose,
      date,
      time,
      assignedTo:    assignedTo || 'Unassigned',
      status:        'Scheduled',
      notes:         notes || '',
    });
    const serialized = serialize(doc);
    req.app.get('io')?.to('admin_room').emit('appointment_created', serialized);
    req.app.get('io')?.emit('appointment:changed');
    res.status(201).json(serialized);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Admin cancel appointment
router.patch('/admin/appointments/:id/cancel', verifyAdmin, async (req, res) => {
  try {
    const cancelReason = String(req.body?.cancelReason || '').trim();
    if (!cancelReason) {
      return res.status(400).json({ message: 'Cancellation reason is required.' });
    }

    const doc = await Appointment.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: 'Not found.' });
    doc.cancelled = true;
    doc.cancelReason = cancelReason;
    doc.status = 'Cancelled';
    await doc.save();
    const serialized = serialize(doc);
    // Notify the specific user whose appointment was cancelled
    if (doc.userId) {
      req.app.get('io')?.to(`user_${doc.userId}`).emit('appointment_cancelled_by_admin', serialized);
    }
    // Notify all admin tabs for real-time sync
    req.app.get('io')?.to('admin_room').emit('appointment_updated', serialized);
    req.app.get('io')?.emit('appointment:changed');
    res.json(serialized);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.patch('/admin/appointments/:id', verifyAdmin, async (req, res) => {
  try {
    const allowed = ['resident', 'purpose', 'date', 'time', 'assignedTo', 'notes'];
    const update = {};
    allowed.forEach(k => { if (req.body[k] !== undefined) update[k] = req.body[k]; });
    const doc = await Appointment.findByIdAndUpdate(req.params.id, update, { returnDocument: 'after' });
    if (!doc) return res.status(404).json({ message: 'Not found.' });
    const serialized = serialize(doc);
    req.app.get('io')?.to('admin_room').emit('appointment_updated', serialized);
    req.app.get('io')?.emit('appointment:changed');
    // Also notify the resident if they have an account
    if (doc.userId) {
      req.app.get('io')?.to(`user_${doc.userId}`).emit('appointment_updated_by_admin', serialized);
    }
    res.json(serialized);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.delete('/admin/appointments/:id', verifyAdmin, async (req, res) => {
  try {
    const doc = await Appointment.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ message: 'Not found.' });
    req.app.get('io')?.to('admin_room').emit('appointment_deleted', { _id: doc._id.toString() });
    req.app.get('io')?.emit('appointment:changed');
    // Notify user too so their list clears without refresh
    if (doc.userId) {
      req.app.get('io')?.to(`user_${doc.userId}`).emit('appointment_deleted', { _id: doc._id.toString() });
    }
    res.json({ message: 'Deleted.' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/* ══════════════════════════════════════════════════════════════════
   USER ROUTES
══════════════════════════════════════════════════════════════════ */

// Auto-close past appointments for user
router.get('/appointments', verifyUser, async (req, res) => {
  try {
    const now = new Date();
    const todayStr = now.toISOString().slice(0,10);
    const timeStr = now.toTimeString().slice(0,5);
    const toClose = await Appointment.find({
      userId: req.user.id,
      cancelled: { $ne: true },
      status: { $ne: 'Closed' },
      $or: [
        { date: { $lt: todayStr } },
        { date: todayStr, time: { $lt: timeStr } },
      ]
    });
    for (const appt of toClose) {
      appt.status = 'Closed';
      await appt.save();
      req.app.get('io')?.to(`user_${req.user.id}`).emit('appointment_closed', serialize(appt));
    }
    const docs = await Appointment.find({ userId: req.user.id }).sort({ createdAt: -1 });
    res.json(docs.map(serialize));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// --- User appointment creation with spam protection ---
router.post('/appointments', verifyUser, async (req, res) => {
  try {
    const { purpose, date, time, notes } = req.body;
    if (!purpose || !date || !time)
      return res.status(400).json({ message: 'purpose, date and time are required.' });
    const resident = req.user.fullName || req.user.email || 'Resident';

    const slotValidation = await validateAppointmentSlot(date, time);
    if (!slotValidation.ok) {
      return res.status(slotValidation.status).json({ message: slotValidation.message });
    }

    // --- Anti-spam: limit user to 1 active appointment per day ---
    const userDayCount = await Appointment.countDocuments({ userId: req.user.id, date, cancelled: { $ne: true } });
    if (userDayCount >= 1) {
      return res.status(400).json({ message: 'You already have an active appointment for this day.' });
    }

    const doc = await Appointment.create({
      resident,
      residentEmail: req.user.email || '',
      userId:        req.user.id,
      purpose,
      date,
      time,
      assignedTo:    'Unassigned',
      status:        'Scheduled',
      notes:         notes || '',
    });
    const serialized = serialize(doc);
    // Notify admin room so new bookings appear without refresh
    req.app.get('io')?.to('admin_room').emit('appointment_created', serialized);
    req.app.get('io')?.emit('appointment:changed');
    res.status(201).json(serialized);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// User cancel appointment — no cancelReason needed, users just cancel directly
router.patch('/appointments/:id/cancel', verifyUser, async (req, res) => {
  try {
    // req.body may be undefined if the client sends no Content-Type / body
    const doc = await Appointment.findOne({ _id: req.params.id, userId: req.user.id });
    if (!doc) return res.status(404).json({ message: 'Not found.' });
    doc.cancelled = true;
    doc.cancelReason = '';
    doc.status = 'Cancelled';
    await doc.save();
    const serialized = serialize(doc);
    // Notify admin room so their list updates in real time
    req.app.get('io')?.to('admin_room').emit('appointment_updated', serialized);
    req.app.get('io')?.emit('appointment:changed');
    res.json(serialized);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// User reschedule appointment (only if not cancelled)
router.patch('/appointments/:id/reschedule', verifyUser, async (req, res) => {
  try {
    const { date, time } = req.body;
    if (!date || !time)
      return res.status(400).json({ message: 'date and time are required.' });
    const doc = await Appointment.findOne({ _id: req.params.id, userId: req.user.id });
    if (!doc) return res.status(404).json({ message: 'Not found.' });
    if (doc.cancelled)
      return res.status(400).json({ message: 'Cancelled appointments cannot be rescheduled.' });

    const slotValidation = await validateAppointmentSlot(date, time, doc._id);
    if (!slotValidation.ok) {
      return res.status(slotValidation.status).json({ message: slotValidation.message });
    }

    doc.date = date;
    doc.time = time;
    await doc.save();
    const serialized = serialize(doc);
    // Notify admin room of the reschedule
    req.app.get('io')?.to('admin_room').emit('appointment_updated', serialized);
    req.app.get('io')?.emit('appointment:changed');
    res.json(serialized);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
