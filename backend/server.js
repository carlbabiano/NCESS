import express          from "express";
import { createServer } from "http";
import { Server }       from "socket.io";
import mongoose         from "mongoose";
import bcrypt           from "bcrypt";
import dotenv           from "dotenv";
import cors             from "cors";
import path             from "path";
import jwt              from "jsonwebtoken";
import { v2 as cloudinary } from "cloudinary";
import { fileURLToPath } from "url";
import { initializeEmailService, verifyEmailService } from "./services/emailService.js";

dotenv.config();

// Log environment variables (for debugging)
console.log("Environment Variables Loaded:");
console.log("CLOUDINARY_CLOUD_NAME:", process.env.CLOUDINARY_CLOUD_NAME);
console.log("CLOUDINARY_API_KEY:", process.env.CLOUDINARY_API_KEY ? "✓ Set" : "✗ Missing");
console.log("CLOUDINARY_API_SECRET:", process.env.CLOUDINARY_API_SECRET ? "✓ Set" : "✗ Missing");

// Configure Cloudinary after environment variables are loaded
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

import userRoutes         from "./routes/userRoutes.js";
import announcementsRoutes from "./routes/announcementsRoutes.js";
import appointmentsRoutes  from "./routes/appointmentsRoutes.js";
import complaintsRoutes    from "./routes/complaintsRoutes.js";
import hotlineRoutes       from "./routes/hotlineRoutes.js";
import availabilityRoutes  from "./routes/availabilityRoutes.js";
import notificationRoutes from "./routes/notificationRoutes.js";
import { Message, Conversation } from "./models/hotline.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const app        = express();
const httpServer = createServer(app);

// ── Socket.io ────────────────────────────────────────────────────────────────
const io = new Server(httpServer, {
  cors: {
    origin: [
      "http://localhost:5173",
      "http://192.168.100.12:5173",
      "https://ncess.vercel.app"
    ],
    credentials: true
  },
});

// Auth middleware for Socket.io
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error("Authentication error"));
  try {
    socket.user = jwt.verify(token, process.env.JWT_SECRET || "your_secret_key");
    next();
  } catch {
    next(new Error("Authentication error"));
  }
});

io.on("connection", (socket) => {
  const user = socket.user;
  const isAdmin = user.role === "admin";

  // Join a conversation room
  socket.on("join_conversation", (conversationId) => {
    socket.join(`conv_${conversationId}`);
  });

  // Leave a conversation room
  socket.on("leave_conversation", (conversationId) => {
    socket.leave(`conv_${conversationId}`);
  });

  // Admin joins the global admin room to receive new conversation notifications
  if (isAdmin) {
    socket.join("admin_room");
  } else {
    // Each user joins their own room so targeted events (appointment notifs) can be delivered
    socket.join(`user_${user.id}`);
  }

  // Send message
  socket.on("send_message", async ({ conversationId, text }) => {
    if (!text?.trim() || !conversationId) return;

    try {
      const conv = await Conversation.findById(conversationId);
      if (!conv) return;

      // Authorization check
      if (!isAdmin && String(conv.userId) !== String(user.id)) return;

      const senderRole = isAdmin ? "admin" : "user";
      const senderName = isAdmin ? "Barangay Admin" : (user.fullName || user.email);

      const msg = await Message.create({
        conversationId,
        sender:      senderRole,
        senderId:    user.id,
        senderName,
        text:        text.trim(),
        readByAdmin: isAdmin,
        readByUser:  !isAdmin,
      });

      const updateData = {
        lastMessage:   text.trim(),
        lastMessageAt: new Date(),
      };
      if (isAdmin) updateData.$inc = { unreadUser: 1 };
      else         updateData.$inc = { unreadAdmin: 1 };

      const updatedConv = await Conversation.findByIdAndUpdate(
        conversationId,
        updateData,
        { returnDocument: 'after' }
      );

      // Emit message to everyone in the conversation room
      io.to(`conv_${conversationId}`).emit("new_message", msg);

      // Notify admin room of conversation update (for sidebar refresh)
      io.to("admin_room").emit("conversation_updated", updatedConv);

      // If admin sent the message, notify the user's topbar bell with their new unread count
      if (isAdmin && updatedConv.userId) {
        io.to(`user_${updatedConv.userId}`).emit("chat_unread_update", {
          unreadUser: updatedConv.unreadUser,
          conversationId,
        });
      }

    } catch (err) {
      console.error("Socket send_message error:", err);
    }
  });

  // Typing indicators
  socket.on("typing_start", ({ conversationId }) => {
    socket.to(`conv_${conversationId}`).emit("user_typing", {
      conversationId,
      name: isAdmin ? "Barangay Admin" : (user.fullName || user.email),
      isAdmin,
    });
  });

  socket.on("typing_stop", ({ conversationId }) => {
    socket.to(`conv_${conversationId}`).emit("user_stopped_typing", { conversationId });
  });

  socket.on("disconnect", () => {
    // nothing to clean up — rooms auto-cleanup
  });
});

// ── Express Middleware ────────────────────────────────────────────────────────
app.use(cors({
  origin: [
    "http://localhost:5173",
    "http://192.168.100.12:5173",
    "https://ncess.vercel.app"
  ],
  credentials: true
}));
app.use(express.json());
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Make io accessible in route handlers via req.app.get('io')
app.set('io', io);

// ── Routes ────────────────────────────────────────────────────────────────────
app.use("/api", userRoutes);
app.use("/api", announcementsRoutes);
app.use("/api", appointmentsRoutes);
app.use("/api", complaintsRoutes);
app.use("/api", hotlineRoutes);
app.use("/api", availabilityRoutes);
app.use("/api/notifications", notificationRoutes);

// ── MongoDB + Startup ─────────────────────────────────────────────────────────
mongoose.connect(process.env.MONGO_URI)
  .then(async () => {
    console.log("MongoDB connected");

    try {
      const adminSchema = new mongoose.Schema({ email: String, password: String });
      const Admin = mongoose.models.Admin || mongoose.model("Admin", adminSchema);

      const adminEmail    = process.env.ADMIN_EMAIL    || "admin@gmail.com";
      const adminPassword = process.env.ADMIN_PASSWORD || "admin123";
      const existing      = await Admin.findOne({ email: adminEmail });

      if (!existing) {
        const hashed = await bcrypt.hash(adminPassword, 10);
        await Admin.create({ email: adminEmail, password: hashed });
        console.log("Admin seeded: " + adminEmail);
      } else {
        const match = await bcrypt.compare(adminPassword, existing.password);
        if (!match) {
          existing.password = await bcrypt.hash(adminPassword, 10);
          await existing.save();
          console.log("Admin password synced from .env");
        } else {
          console.log("Admin account OK");
        }
      }
    } catch (err) {
      console.error("Admin seed error:", err);
    }

    // Initialize email service for password reset functionality
    initializeEmailService();
    await verifyEmailService();
  })
  .catch(err => console.log(err));

// ── Use httpServer (not app) so Socket.io shares the port ────────────────────
httpServer.listen(process.env.PORT, () => {
  console.log("Server running on port " + process.env.PORT);
});