import express from "express";
import multer from "multer";
import { v2 as cloudinary } from "cloudinary";
import { CloudinaryStorage } from "multer-storage-cloudinary";
import Announcement from '../models/announcements.js';

const router = express.Router();

// Create upload middleware lazily to ensure Cloudinary is configured
const getUpload = () => {
  const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
      folder: 'ebrgy/announcements',
      allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
    },
  });
  return multer({ storage });
};

// ── GET all announcements (users & admin both use this) ──
router.get('/announcements', async (req, res) => {
  try {
    // pinned first, then newest first
    const announcements = await Announcement.find()
      .sort({ pinned: -1, createdAt: -1 });
    res.status(200).json(announcements);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch announcements' });
  }
});

// ── POST /api/announcements ──
router.post("/announcements", (req, res, next) => {
  getUpload().single("image")(req, res, next);
}, async (req, res) => {
  const { category, categoryColor, author, title, body, pinned } = req.body;
  if (!category || !author || !title || !body)
    return res.status(400).json({ message: "Missing required fields" });

  console.log("DEBUG - POST /announcements");
  console.log("req.file full object:", req.file);
  console.log("req.file keys:", req.file ? Object.keys(req.file) : null);

  // If a file was uploaded to Cloudinary, use the secure URL
  // Check different possible property names from Cloudinary
  const image = req.file
    ? (req.file.secure_url || req.file.url || `https://res.cloudinary.com/${process.env.CLOUDINARY_CLOUD_NAME}/image/upload/${req.file.filename}`)
    : req.body.image;

  console.log("image URL being saved:", image);

  try {
    const ann = new Announcement({ category, categoryColor, author, title, body, image, pinned });
    await ann.save();
    console.log("Announcement saved:", { _id: ann._id, image: ann.image });
    // Broadcast to all connected clients
    const io = req.app.get('io');
    if (io) {
      console.log("[Socket.io] Broadcasting announcement_created to all clients", ann._id);
      io.emit('announcement_created', ann);
    } else {
      console.error("[Socket.io] ERROR: io not found on app");
    }
    res.status(201).json(ann);
  } catch (error) {
    console.error("Failed to create announcement:", error);
    res.status(500).json({ message: "Failed to create announcement", error: error.message });
  }
});

// ── PUT update an announcement (admin only) ──
router.put("/announcements/:id", (req, res, next) => {
  getUpload().single("image")(req, res, next);
}, async (req, res) => {
  try {
    const image = req.file
      ? (req.file.secure_url || req.file.url || `https://res.cloudinary.com/${process.env.CLOUDINARY_CLOUD_NAME}/image/upload/${req.file.filename}`)
      : req.body.image;

    const updated = await Announcement.findByIdAndUpdate(
      req.params.id,
      { ...req.body, image },
      { returnDocument: 'after' }
    );
    if (!updated) return res.status(404).json({ message: "Announcement not found" });
    // Broadcast to all connected clients
    const io = req.app.get('io');
    if (io) {
      console.log("[Socket.io] Broadcasting announcement_updated to all clients", updated._id);
      io.emit('announcement_updated', updated);
    } else {
      console.error("[Socket.io] ERROR: io not found on app");
    }
    res.status(200).json(updated);
  } catch (error) {
    console.error("Failed to update announcement:", error);
    res.status(500).json({ message: "Failed to update announcement", error: error.message });
  }
});

// ── DELETE an announcement (admin only) ──
router.delete("/announcements/:id", async (req, res) => {
  try {
    const deleted = await Announcement.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ message: "Announcement not found" });
    // Broadcast to all connected clients
    const io = req.app.get('io');
    if (io) {
      console.log("[Socket.io] Broadcasting announcement_deleted to all clients", req.params.id);
      io.emit('announcement_deleted', { _id: req.params.id });
    } else {
      console.error("[Socket.io] ERROR: io not found on app");
    }
    res.status(200).json({ message: "Announcement deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: "Failed to delete announcement" });
  }
});

export default router;