import mongoose from "mongoose";

// ── Message Schema ────────────────────────────────────────────────────────────
const messageSchema = new mongoose.Schema({
  conversationId: { type: mongoose.Schema.Types.ObjectId, ref: "Conversation", required: true },
  sender:         { type: String, enum: ["user", "admin", "ai"], required: true },
  senderId:       { type: mongoose.Schema.Types.ObjectId, required: function () { return this.sender !== "ai"; } },
  senderName:     { type: String, required: true },
  text:           { type: String, required: true, trim: true },
  readByAdmin:    { type: Boolean, default: false },
  readByUser:     { type: Boolean, default: false },
}, { timestamps: true });


// ── Conversation Schema (Simplified) ──────────────────────────────────────────
const conversationSchema = new mongoose.Schema({
  userId:       { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  userName:     { type: String, required: true },
  userEmail:    { type: String, required: true },
  lastMessage:  { type: String, default: "" },
  lastMessageAt:{ type: Date, default: Date.now },
  unreadAdmin:  { type: Number, default: 0 },
  unreadUser:   { type: Number, default: 0 },
  // "ai": the AI assistant auto-replies to the resident.
  // "human": an admin has taken over — AI stays silent until handed back.
  mode:         { type: String, enum: ["ai", "human"], default: "ai" },
  takenOverBy:  { type: String, default: "" }, // admin's name, once claimed
  takenOverAt:  { type: Date, default: null },
}, { timestamps: true });

export const Message      = mongoose.model("Message",      messageSchema);
export const Conversation = mongoose.model("Conversation", conversationSchema);