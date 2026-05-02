import express from 'express';
import jwt from 'jsonwebtoken';
import Complaint from '../models/complaints.js';

const router = express.Router();

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

/* ── Serializer ───────────────────────────────────────────────────────────── */

function serialize(doc) {
  const o = doc.toObject ? doc.toObject() : { ...doc };
  return {
    _id:              o._id,
    id:               `CMP-${String(o._id).slice(-6).toUpperCase()}`,
    resident:         o.resident,
    residentEmail:    o.residentEmail || '',
    userId:           o.userId,
    category:         o.category,
    location:         o.location || '',
    description:      o.description,
    priority:         o.priority,
    status:           o.status,
    assignedOfficial: o.assignedOfficial,
    walkinFiled:      o.walkinFiled,
    resolutionNote:   o.resolutionNote || '',
    dateFiled: new Date(o.createdAt).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
    }),
    createdAt: o.createdAt,
  };
}

/* ══════════════════════════════════════════════════════════════════
   ADMIN ROUTES
══════════════════════════════════════════════════════════════════ */

// GET all complaints (with optional search & status filter)
router.get('/admin/complaints', verifyAdmin, async (req, res) => {
  try {
    const { search = '', status } = req.query;
    const query = {};
    if (status && status !== 'All') query.status = status;
    if (search) {
      query.$or = [
        { resident:  { $regex: search, $options: 'i' } },
        { category:  { $regex: search, $options: 'i' } },
        { location:  { $regex: search, $options: 'i' } },
      ];
    }
    const docs = await Complaint.find(query).sort({ createdAt: -1 });
    res.json(docs.map(serialize));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST — admin files a walk-in complaint
router.post('/admin/complaints', verifyAdmin, async (req, res) => {
  try {
    const {
      resident, category, location, description,
      priority, assignedOfficial, status,
    } = req.body;

    if (!resident || !category || !description)
      return res.status(400).json({ message: 'resident, category and description are required.' });

    const doc = await Complaint.create({
      resident:         resident.trim(),
      residentEmail:    '',
      userId:           null,
      category,
      location:         location || '',
      description:      description.trim(),
      priority:         priority         || 'Medium',
      assignedOfficial: assignedOfficial || 'Unassigned',
      status:           status           || 'Pending',
      walkinFiled:      true,
      resolutionNote:   '',
    });

    res.status(201).json(serialize(doc));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PATCH status — admin updates status (and optional resolution note)
router.patch('/admin/complaints/:id/status', verifyAdmin, async (req, res) => {
  try {
    const { status, resolutionNote } = req.body;
    const valid = ['Pending', 'In Progress', 'Resolved', 'Escalated'];
    if (!valid.includes(status))
      return res.status(400).json({ message: 'Invalid status.' });

    const doc = await Complaint.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: 'Not found.' });

    const prevStatus = doc.status;
    doc.status         = status;
    doc.resolutionNote = resolutionNote !== undefined ? resolutionNote : doc.resolutionNote;
    await doc.save();

    const serialized = serialize(doc);

    // Notify the user whose complaint status changed (skip walk-in complaints with no userId)
    if (doc.userId && prevStatus !== status) {
      req.app.get('io')?.to(`user_${doc.userId}`).emit('complaint_status_updated', {
        ...serialized,
        prevStatus,
      });
    }

    // Also notify all admin clients so other open admin tabs stay in sync
    req.app.get('io')?.to('admin_room').emit('complaint_updated', serialized);

    res.json(serialized);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PATCH fields — admin edits complaint details
router.patch('/admin/complaints/:id', verifyAdmin, async (req, res) => {
  try {
    const allowed = ['category', 'location', 'description', 'priority', 'assignedOfficial', 'resolutionNote'];
    const update = {};
    allowed.forEach(k => { if (req.body[k] !== undefined) update[k] = req.body[k]; });
    const doc = await Complaint.findByIdAndUpdate(req.params.id, update, { returnDocument: 'after' });
    if (!doc) return res.status(404).json({ message: 'Not found.' });
    const serialized = serialize(doc);

    // Keep all admin tabs in sync
    req.app.get('io')?.to('admin_room').emit('complaint_updated', serialized);

    res.json(serialized);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE
router.delete('/admin/complaints/:id', verifyAdmin, async (req, res) => {
  try {
    const doc = await Complaint.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ message: 'Not found.' });

    // Notify all admin clients so their lists update in real time
    req.app.get('io')?.to('admin_room').emit('complaint_deleted', { _id: doc._id.toString() });

    res.json({ message: 'Deleted.' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/* ══════════════════════════════════════════════════════════════════
   USER ROUTES
══════════════════════════════════════════════════════════════════ */

// GET own complaints
router.get('/complaints', verifyUser, async (req, res) => {
  try {
    const docs = await Complaint.find({ userId: req.user.id }).sort({ createdAt: -1 });
    res.json(docs.map(serialize));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST — user files a complaint
router.post('/complaints', verifyUser, async (req, res) => {
  try {
    const { category, location, description, priority } = req.body;
    if (!category || !description)
      return res.status(400).json({ message: 'category and description are required.' });

    const resident = req.user.fullName || req.user.email || 'Resident';
    const doc = await Complaint.create({
      resident,
      residentEmail:    req.user.email || '',
      userId:           req.user.id,
      category,
      location:         location    || '',
      description:      description.trim(),
      priority:         priority    || 'Medium',
      assignedOfficial: 'Unassigned',
      status:           'Pending',
      walkinFiled:      false,
      resolutionNote:   '',
    });

    const serialized = serialize(doc);

    // Notify admin room of the new complaint in real time
    req.app.get('io')?.to('admin_room').emit('complaint_created', serialized);

    res.status(201).json(serialized);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;