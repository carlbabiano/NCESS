import express from "express";
import jwt     from "jsonwebtoken";
import { Message, Conversation } from "../models/hotline.js";

const router = express.Router();

// ── Auth Middleware ───────────────────────────────────────────────────────────
function requireUser(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer "))
    return res.status(401).json({ message: "No token provided" });
  try {
    req.user = jwt.verify(auth.slice(7), process.env.JWT_SECRET || "your_secret_key");
    next();
  } catch {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
}

function requireAdmin(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer "))
    return res.status(401).json({ message: "No token provided" });
  try {
    const decoded = jwt.verify(auth.slice(7), process.env.JWT_SECRET || "your_secret_key");
    if (decoded.role !== "admin") return res.status(403).json({ message: "Admin access required" });
    req.admin = decoded;
    next();
  } catch {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// USER ROUTES
// ══════════════════════════════════════════════════════════════════════════════

// GET  /api/chat/my-conversation  — get or create user's conversation
router.get("/chat/my-conversation", requireUser, async (req, res) => {
  try {
    let conv = await Conversation.findOne({ userId: req.user.id })
      .sort({ createdAt: -1 });

    if (!conv) {
      conv = await Conversation.create({
        userId:    req.user.id,
        userName:  req.user.fullName || req.user.email,
        userEmail: req.user.email,
      });
    }
    res.json(conv);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// PATCH /api/chat/my-conversation/read — mark support replies as read from the user bell
router.patch("/chat/my-conversation/read", requireUser, async (req, res) => {
  try {
    const conv = await Conversation.findOne({ userId: req.user.id })
      .sort({ createdAt: -1 });

    if (!conv) {
      return res.json({ success: true, unreadUser: 0 });
    }

    await Message.updateMany(
      { conversationId: conv._id, sender: "admin", readByUser: false },
      { readByUser: true }
    );

    const updatedConv = await Conversation.findByIdAndUpdate(
      conv._id,
      { unreadUser: 0 },
      { returnDocument: "after" }
    );

    req.app.get("io")?.to(`user_${req.user.id}`).emit("chat_unread_update", {
      unreadUser: 0,
      conversationId: conv._id,
    });

    res.json({ success: true, conversation: updatedConv, unreadUser: 0 });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// GET  /api/chat/conversations/:id/messages
router.get("/chat/conversations/:id/messages", requireUser, async (req, res) => {
  try {
    const conv = await Conversation.findById(req.params.id);
    if (!conv || String(conv.userId) !== String(req.user.id))
      return res.status(403).json({ message: "Forbidden" });

    // Mark all admin messages as read by user
    await Message.updateMany(
      { conversationId: req.params.id, sender: "admin", readByUser: false },
      { readByUser: true }
    );
    await Conversation.findByIdAndUpdate(req.params.id, { unreadUser: 0 });
    req.app.get("io")?.to(`user_${req.user.id}`).emit("chat_unread_update", {
      unreadUser: 0,
      conversationId: req.params.id,
    });

    const messages = await Message.find({ conversationId: req.params.id }).sort({ createdAt: 1 });
    res.json(messages);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// POST /api/chat/conversations/:id/messages  — user sends a message
router.post("/chat/conversations/:id/messages", requireUser, async (req, res) => {
  const { text } = req.body;
  if (!text?.trim()) return res.status(400).json({ message: "Message text required" });

  try {
    const conv = await Conversation.findById(req.params.id);
    if (!conv || String(conv.userId) !== String(req.user.id))
      return res.status(403).json({ message: "Forbidden" });

    const msg = await Message.create({
      conversationId: req.params.id,
      sender:         "user",
      senderId:       req.user.id,
      senderName:     req.user.fullName || req.user.email,
      text:           text.trim(),
      readByAdmin:    false,
      readByUser:     true,
    });

    await Conversation.findByIdAndUpdate(req.params.id, {
      lastMessage:   text.trim(),
      lastMessageAt: new Date(),
      $inc: { unreadAdmin: 1 },
    });

    res.status(201).json(msg);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});


// (Removed category patch route — no longer needed)

// ══════════════════════════════════════════════════════════════════════════════
// ADMIN ROUTES
// ══════════════════════════════════════════════════════════════════════════════

// GET  /api/chat/admin/conversations  — all conversations
router.get("/chat/admin/conversations", requireAdmin, async (req, res) => {
  try {
    const convs = await Conversation.find().sort({ lastMessageAt: -1 });
    res.json(convs);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// GET  /api/chat/admin/conversations/:id/messages
router.get("/chat/admin/conversations/:id/messages", requireAdmin, async (req, res) => {
  try {
    // Mark all user messages as read by admin
    await Message.updateMany(
      { conversationId: req.params.id, sender: "user", readByAdmin: false },
      { readByAdmin: true }
    );
    await Conversation.findByIdAndUpdate(req.params.id, { unreadAdmin: 0 });

    const messages = await Message.find({ conversationId: req.params.id }).sort({ createdAt: 1 });
    res.json(messages);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// POST /api/chat/admin/conversations/:id/messages  — admin replies
router.post("/chat/admin/conversations/:id/messages", requireAdmin, async (req, res) => {
  const { text } = req.body;
  if (!text?.trim()) return res.status(400).json({ message: "Message text required" });

  try {
    const msg = await Message.create({
      conversationId: req.params.id,
      sender:         "admin",
      senderId:       req.admin.id,
      senderName:     "Barangay Admin",
      text:           text.trim(),
      readByAdmin:    true,
      readByUser:     false,
    });

    const updatedConv = await Conversation.findByIdAndUpdate(
      req.params.id,
      {
        lastMessage:   text.trim(),
        lastMessageAt: new Date(),
        $inc: { unreadUser: 1 },
      },
      { returnDocument: "after" }
    );

    if (updatedConv?.userId) {
      req.app.get("io")?.to(`user_${updatedConv.userId}`).emit("chat_unread_update", {
        unreadUser: updatedConv.unreadUser,
        conversationId: req.params.id,
      });
    }

    res.status(201).json(msg);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});


// (Removed status patch route — no longer needed)


// PATCH /api/chat/admin/conversations/:id/read
router.patch("/chat/admin/conversations/:id/read", requireAdmin, async (req, res) => {
  try {
    // Mark all user messages as read by admin
    await Message.updateMany(
      { conversationId: req.params.id, sender: "user", readByAdmin: false },
      { readByAdmin: true }
    );
    await Conversation.findByIdAndUpdate(req.params.id, { unreadAdmin: 0 });
    res.json({ message: "All user messages marked as read by admin." });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// GET /api/chat/admin/message-stats — get total and today's message counts
router.get("/chat/admin/message-stats", requireAdmin, async (req, res) => {
  try {
    const totalMessages = await Message.countDocuments();
    // Calculate today's date range (midnight to now)
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date();
    const messagesToday = await Message.countDocuments({
      createdAt: { $gte: startOfDay, $lte: endOfDay }
    });
    res.json({ totalMessages, messagesToday });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

export default router;
