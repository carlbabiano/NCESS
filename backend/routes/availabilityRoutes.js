import express from 'express';
import Availability from '../models/availability.js';
import jwt from 'jsonwebtoken';

const router = express.Router();

// Public route for user side to get availability
router.get('/availability', async (req, res) => {
  try {
    let doc = await Availability.findOne();
    if (!doc) {
      // Default schedule if not set
      doc = await Availability.create({
        schedule: {
          monday:    { enabled: true,  start: '08:00', end: '17:00', slotDuration: 30, maxPerSlot: 1 },
          tuesday:   { enabled: true,  start: '08:00', end: '17:00', slotDuration: 30, maxPerSlot: 1 },
          wednesday: { enabled: true,  start: '08:00', end: '17:00', slotDuration: 30, maxPerSlot: 1 },
          thursday:  { enabled: true,  start: '08:00', end: '17:00', slotDuration: 30, maxPerSlot: 1 },
          friday:    { enabled: true,  start: '08:00', end: '17:00', slotDuration: 30, maxPerSlot: 1 },
          saturday:  { enabled: false, start: '09:00', end: '12:00', slotDuration: 30, maxPerSlot: 1 },
          sunday:    { enabled: false, start: '09:00', end: '12:00', slotDuration: 30, maxPerSlot: 1 },
        },
        blockedDates: [],
      });
    }
    res.json({ schedule: doc.schedule, blockedDates: doc.blockedDates });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

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

// Get availability schedule
router.get('/admin/availability', verifyAdmin, async (req, res) => {
  try {
    let doc = await Availability.findOne();
    if (!doc) {
      // Default schedule if not set
      doc = await Availability.create({
        schedule: {
          monday:    { enabled: true,  start: '08:00', end: '17:00', slotDuration: 30, maxPerSlot: 1 },
          tuesday:   { enabled: true,  start: '08:00', end: '17:00', slotDuration: 30, maxPerSlot: 1 },
          wednesday: { enabled: true,  start: '08:00', end: '17:00', slotDuration: 30, maxPerSlot: 1 },
          thursday:  { enabled: true,  start: '08:00', end: '17:00', slotDuration: 30, maxPerSlot: 1 },
          friday:    { enabled: true,  start: '08:00', end: '17:00', slotDuration: 30, maxPerSlot: 1 },
          saturday:  { enabled: false, start: '09:00', end: '12:00', slotDuration: 30, maxPerSlot: 1 },
          sunday:    { enabled: false, start: '09:00', end: '12:00', slotDuration: 30, maxPerSlot: 1 },
        },
        blockedDates: [],
      });
    }
    res.json({ schedule: doc.schedule, blockedDates: doc.blockedDates });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Update availability schedule
// Validate blockedDates before saving
router.put('/admin/availability', verifyAdmin, async (req, res) => {
  try {
    let doc = await Availability.findOne();
    if (!doc) doc = new Availability();
    doc.schedule = req.body.schedule || doc.schedule;
    // Validate blockedDates
    let blockedDates = req.body.blockedDates || doc.blockedDates || [];
    if (!Array.isArray(blockedDates)) blockedDates = [];
    // Only keep valid blocks
    blockedDates = blockedDates.filter(b =>
      b && typeof b.date === 'string' && b.date.length >= 8 &&
      (b.type === 'fullday' || b.type === 'times' || !b.type)
    ).map(b => ({
      date: b.date,
      reason: b.reason || '',
      type: b.type || 'fullday',
      startTime: b.type === 'times' ? b.startTime : undefined,
      endTime: b.type === 'times' ? b.endTime : undefined,
    }));
    doc.blockedDates = blockedDates;
    await doc.save();
    const payload = { schedule: doc.schedule, blockedDates: doc.blockedDates };
    req.app.get('io')?.emit('availability:changed', payload);
    res.json(payload);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
