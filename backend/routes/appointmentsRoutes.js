import express from 'express';
import jwt from 'jsonwebtoken';
import Appointment from '../models/appointments.js';

const router = express.Router();

// Purposes with a 6-month validity window (Barangay Clearance, Indigency
// Certificate). Requesting one while a prior copy is still valid goes to
// "Pending Review" instead of being auto-scheduled, so an admin can vet it.
// Shared by the booking route and the reschedule route (when a resident
// adds one of these purposes to an existing appointment).
const REISSUABLE_PURPOSES = ['Barangay Clearance', 'Indigency Certificate'];

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
    reissueRequest: o.reissueRequest && o.reissueRequest.isReissue ? {
      isReissue:             true,
      previousClearanceDate: o.reissueRequest.previousClearanceDate || '',
      reason:                o.reissueRequest.reason || '',
      otherText:             o.reissueRequest.otherText || '',
      reviewStatus:          o.reissueRequest.reviewStatus || 'Pending',
      reviewNote:            o.reissueRequest.reviewNote || '',
      reviewedAt:            o.reissueRequest.reviewedAt || null,
    } : null,
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
      status: { $nin: ['Closed', 'Released'] },
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

async function validateAppointmentSlot(date, time, excludeId = null, neededCount = 1) {
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
  const excludeIds = Array.isArray(excludeId) ? excludeId : (excludeId ? [excludeId] : []);
  if (excludeIds.length) query._id = { $nin: excludeIds };
  const maxPerSlot = sched.maxPerSlot || 1;

  // Slot capacity is per PERSON, not per appointment document. A resident
  // booking several purposes in one action creates multiple docs for the
  // same date/time, but that's still just one person occupying one seat
  // in the slot — so we count distinct residents (by userId), not raw docs.
  // Docs without a userId (e.g. admin-created walk-ins) each count as their
  // own seat since there's no account to de-duplicate against.
  const docs = await Appointment.find(query).select('userId');
  const tokenSet = new Set(docs.map(d => (d.userId ? String(d.userId) : String(d._id))));
  const slotCount = tokenSet.size;

  if (slotCount + neededCount > maxPerSlot) {
    return {
      ok: false,
      status: 400,
      message: `This slot is already full (${slotCount}/${maxPerSlot}).`,
    };
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

// Admin marks a document as physically released/issued to the resident.
// Only valid from Scheduled — this is what starts the 6-month validity
// window used by the reissue soft-block on the resident side.
router.patch('/admin/appointments/:id/release', verifyAdmin, async (req, res) => {
  try {
    const doc = await Appointment.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: 'Not found.' });
    if (doc.status !== 'Scheduled') {
      return res.status(400).json({ message: 'Only scheduled appointments can be marked as released.' });
    }
    doc.status = 'Released';
    // Record which admin account performed the release so it shows up
    // as "Assigned To" on both the admin and resident sides.
    doc.assignedTo = [req.admin.firstName, req.admin.lastName].filter(Boolean).join(' ') || 'Admin';
    await doc.save();
    const serialized = serialize(doc);
    if (doc.userId) {
      req.app.get('io')?.to(`user_${doc.userId}`).emit('appointment_released', serialized);
    }
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

// Admin approve/deny a re-issuance (repeat Barangay Clearance) request
router.patch('/admin/appointments/:id/review-reissue', verifyAdmin, async (req, res) => {
  try {
    const decision = req.body?.decision;
    const reviewNote = String(req.body?.reviewNote || '').trim();
    if (!['Approved', 'Denied'].includes(decision)) {
      return res.status(400).json({ message: 'decision must be "Approved" or "Denied".' });
    }

    const doc = await Appointment.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: 'Not found.' });
    if (!doc.reissueRequest?.isReissue) {
      return res.status(400).json({ message: 'This appointment has no re-issuance request to review.' });
    }
    if (decision === 'Denied' && !reviewNote) {
      return res.status(400).json({ message: 'A reason is required to deny this request.' });
    }

    doc.reissueRequest.reviewStatus = decision;
    doc.reissueRequest.reviewNote   = reviewNote;
    doc.reissueRequest.reviewedAt   = new Date();

    if (decision === 'Approved') {
      doc.status = 'Scheduled';
    } else {
      doc.status = 'Denied';
      // Internally flagged so it no longer occupies the slot / counts toward
      // the resident's daily appointment cap, without being labeled "Cancelled".
      doc.cancelled = true;
      doc.cancelReason = reviewNote;
    }

    await doc.save();
    const serialized = serialize(doc);
    req.app.get('io')?.to('admin_room').emit('appointment_updated', serialized);
    req.app.get('io')?.emit('appointment:changed');
    if (doc.userId) {
      req.app.get('io')?.to(`user_${doc.userId}`).emit(
        decision === 'Approved' ? 'appointment_updated_by_admin' : 'appointment_cancelled_by_admin',
        serialized
      );
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
      status: { $nin: ['Closed', 'Released'] },
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
// Accepts either a single `purpose` (string, back-compat) or `purposes`
// (array of strings) so a resident can check off several purposes at once
// and book one appointment document per purpose, all for the same slot.
router.post('/appointments', verifyUser, async (req, res) => {
  try {
    const { purpose, purposes, date, time, notes, reissueRequests, reissueRequest } = req.body;

    const purposeList = Array.isArray(purposes) && purposes.length
      ? [...new Set(purposes.filter(Boolean))]
      : (purpose ? [purpose] : []);

    if (!purposeList.length || !date || !time)
      return res.status(400).json({ message: 'At least one purpose, plus date and time, are required.' });

    const resident = req.user.fullName || req.user.email || 'Resident';

    const slotValidation = await validateAppointmentSlot(date, time);
    if (!slotValidation.ok) {
      return res.status(slotValidation.status).json({ message: slotValidation.message });
    }

    // --- Anti-spam / single-active-appointment rule: a resident can only
    // have ONE upcoming, active appointment at a time (regardless of which
    // date they're now trying to book). "Upcoming" = not cancelled, not yet
    // closed/denied, and its date/time hasn't passed.
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const nowTimeStr = now.toTimeString().slice(0, 5);
    const existingUpcoming = await Appointment.findOne({
      userId: req.user.id,
      cancelled: { $ne: true },
      status: { $in: ['Scheduled', 'Pending Review'] },
      $or: [
        { date: { $gt: todayStr } },
        { date: todayStr, time: { $gte: nowTimeStr } },
      ],
    }).sort({ date: 1, time: 1 });

    if (existingUpcoming) {
      // Count sibling documents booked in the same action (same date/time)
      // so the frontend can tell the resident how many documents will move
      // together if they choose to update/reschedule instead.
      const groupCount = await Appointment.countDocuments({
        userId: req.user.id,
        date: existingUpcoming.date,
        time: existingUpcoming.time,
        cancelled: { $ne: true },
      });
      return res.status(409).json({
        message: 'You already have an upcoming appointment.',
        code: 'EXISTING_APPOINTMENT',
        existingAppointment: serialize(existingUpcoming),
        existingAppointmentGroupCount: groupCount,
      });
    }

    // Purposes with a 6-month validity window (Barangay Clearance, Indigency
    // Certificate). Requesting one while a prior copy is still valid goes to
    // "Pending Review" instead of being auto-scheduled, so an admin can vet it.

    // Back-compat: older clients may still send a single `reissueRequest`
    // object (implicitly for Barangay Clearance) instead of the
    // per-purpose `reissueRequests` array.
    const reissueByPurpose = new Map();
    if (Array.isArray(reissueRequests)) {
      for (const r of reissueRequests) {
        if (r?.purpose && r?.reason) reissueByPurpose.set(r.purpose, r);
      }
    } else if (reissueRequest?.reason) {
      reissueByPurpose.set('Barangay Clearance', reissueRequest);
    }

    const created = [];
    for (const p of purposeList) {
      const match = REISSUABLE_PURPOSES.includes(p) ? reissueByPurpose.get(p) : null;
      const isReissue = Boolean(match);
      const doc = await Appointment.create({
        resident,
        residentEmail: req.user.email || '',
        userId:        req.user.id,
        purpose:       p,
        date,
        time,
        assignedTo:    'Unassigned',
        status:        isReissue ? 'Pending Review' : 'Scheduled',
        notes:         notes || '',
        reissueRequest: isReissue ? {
          isReissue:             true,
          previousClearanceDate: match.previousClearanceDate || '',
          reason:                match.reason,
          otherText:             match.otherText || '',
          reviewStatus:          'Pending',
        } : undefined,
      });
      created.push(doc);
    }

    const serializedAll = created.map(serialize);
    // Notify admin room so new bookings appear without refresh
    serializedAll.forEach(s => req.app.get('io')?.to('admin_room').emit('appointment_created', s));
    req.app.get('io')?.emit('appointment:changed');
    // Single purpose: keep the old single-object response shape for back-compat.
    // Multiple purposes: return the array of created appointments.
    res.status(201).json(serializedAll.length === 1 ? serializedAll[0] : serializedAll);
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
// A resident may have booked several purposes/documents in one action —
// those share the same date/time and must all move together when the
// resident reschedules, so this finds and updates the whole sibling group.
// It also accepts an optional `purposes` array so the resident can add or
// remove documents from the group at the same time (not just change the
// date/time): purposes no longer in the list are cancelled, purposes newly
// added are created as fresh appointment documents at the new date/time.
router.patch('/appointments/:id/reschedule', verifyUser, async (req, res) => {
  try {
    const { date, time, purposes, reissueRequests } = req.body;
    if (!date || !time)
      return res.status(400).json({ message: 'date and time are required.' });
    const doc = await Appointment.findOne({ _id: req.params.id, userId: req.user.id });
    if (!doc) return res.status(404).json({ message: 'Not found.' });
    if (doc.cancelled)
      return res.status(400).json({ message: 'Cancelled appointments cannot be rescheduled.' });

    // Find every non-cancelled sibling document booked in the same action
    // (same resident, same original date/time) so they all move together.
    const group = await Appointment.find({
      userId: doc.userId,
      date: doc.date,
      time: doc.time,
      cancelled: { $ne: true },
    });
    const groupIds = group.map(d => d._id);

    // Slot capacity is per resident, not per document (see
    // validateAppointmentSlot), so adding/removing documents for the same
    // resident never changes how many seats they occupy — always 1.
    const slotValidation = await validateAppointmentSlot(date, time, groupIds, 1);
    if (!slotValidation.ok) {
      return res.status(slotValidation.status).json({ message: slotValidation.message });
    }

    // Target document list. Older clients that don't send `purposes` keep
    // the original behavior: move the whole group, no additions/removals.
    const purposeList = Array.isArray(purposes) && purposes.length
      ? [...new Set(purposes.filter(Boolean))]
      : group.map(d => d.purpose);

    if (!purposeList.length)
      return res.status(400).json({ message: 'At least one document must be selected.' });

    const groupPurposes  = new Set(group.map(d => d.purpose));
    const toKeep          = group.filter(d => purposeList.includes(d.purpose));
    const toRemove         = group.filter(d => !purposeList.includes(d.purpose));
    const toAddPurposes   = purposeList.filter(p => !groupPurposes.has(p));

    // Same per-purpose reissue matching as the booking route, for any newly
    // added purpose that requires a reason (still within its validity window).
    const reissueByPurpose = new Map();
    if (Array.isArray(reissueRequests)) {
      for (const r of reissueRequests) {
        if (r?.purpose && r?.reason) reissueByPurpose.set(r.purpose, r);
      }
    }

    const touched = [];

    // Move the documents that remain selected to the new date/time.
    for (const d of toKeep) {
      d.date = date;
      d.time = time;
      await d.save();
      touched.push(serialize(d));
    }

    // Cancel documents for purposes the resident unchecked.
    for (const d of toRemove) {
      d.cancelled = true;
      d.status = 'Cancelled';
      d.cancelReason = 'Removed during reschedule';
      await d.save();
      touched.push(serialize(d));
    }

    // Create fresh documents for newly checked purposes at the new date/time.
    for (const p of toAddPurposes) {
      const match = REISSUABLE_PURPOSES.includes(p) ? reissueByPurpose.get(p) : null;
      const isReissue = Boolean(match);
      const created = await Appointment.create({
        resident:      doc.resident,
        residentEmail: doc.residentEmail || '',
        userId:        doc.userId,
        purpose:       p,
        date,
        time,
        assignedTo:    'Unassigned',
        status:        isReissue ? 'Pending Review' : 'Scheduled',
        notes:         doc.notes || '',
        reissueRequest: isReissue ? {
          isReissue:             true,
          previousClearanceDate: match.previousClearanceDate || '',
          reason:                match.reason,
          otherText:             match.otherText || '',
          reviewStatus:          'Pending',
        } : undefined,
      });
      touched.push(serialize(created));
    }

    // Notify admin room of the change
    req.app.get('io')?.to('admin_room').emit('appointments_updated', touched);
    req.app.get('io')?.emit('appointment:changed');
    res.json(touched);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;