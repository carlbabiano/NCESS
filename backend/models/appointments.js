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
    status: { type: String, enum: ['Scheduled', 'Pending Review', 'Denied', 'Cancelled', 'Closed', 'Released'], default: 'Scheduled' },

    // Populated when a resident requests a repeat/re-issued Barangay Clearance
    // while a prior clearance is still within its validity window.
    reissueRequest: {
      isReissue:             { type: Boolean, default: false },
      previousClearanceDate: { type: String, default: '' }, // raw "YYYY-MM-DD" of the prior clearance
      reason:                { type: String, default: '' }, // e.g. "Lost Document"
      otherText:             { type: String, default: '' }, // additional details / "Others" description
      reviewStatus:          { type: String, enum: ['Pending', 'Approved', 'Denied'], default: 'Pending' },
      reviewNote:            { type: String, default: '' }, // admin's denial note, if any
      reviewedAt:            { type: Date, default: null },
    },
  },
  { timestamps: true }
);

export default mongoose.models.Appointment ||
  mongoose.model('Appointment', appointmentSchema);