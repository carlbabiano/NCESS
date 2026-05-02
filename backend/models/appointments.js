import mongoose from 'mongoose';

const appointmentSchema = new mongoose.Schema(
  {
    resident:   { type: String, required: true, trim: true },
    userId:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    residentEmail: { type: String, default: '' },
    purpose:    { type: String, required: true, trim: true },
    date:       { type: String, required: true },   // stored as "YYYY-MM-DD"
    time:       { type: String, required: true },   // stored as "HH:MM"
    assignedTo: { type: String, default: 'Unassigned' },
    cancelled: { type: Boolean, default: false },
    cancelReason: { type: String, default: '' },
    notes:         { type: String, default: '' }, // general notes
    status: { type: String, enum: ['Scheduled', 'Cancelled', 'Closed'], default: 'Scheduled' },
  },
  { timestamps: true }
);

export default mongoose.models.Appointment ||
  mongoose.model('Appointment', appointmentSchema);