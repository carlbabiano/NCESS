import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type: { type: String, required: true }, // e.g., 'appointment', 'complaint', etc.
  title: { type: String, required: true },
  message: { type: String, required: true },
  data: { type: Object, default: {} }, // extra payload
  read: { type: Boolean, default: false },
}, { timestamps: true });

export default mongoose.model('Notification', notificationSchema);
