import mongoose from 'mongoose';

const complaintSchema = new mongoose.Schema(
  {
    uniqueID: {
      type:   String,
      unique: true,
      index:  true,
    },
    resident:      { type: String, required: true, trim: true },
    residentEmail: { type: String, default: '' },
    userId:        { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    category:      { type: String, required: true, trim: true },
    location:      { type: String, default: '' },
    description:   { type: String, required: true, trim: true },
    priority: {
      type:    String,
      enum:    ['Normal', 'Medium', 'High'],
      default: 'Normal',
    },
    status: {
      type:    String,
      enum:    ['Pending', 'In Progress', 'Resolved', 'Escalated'],
      default: 'Pending',
    },
    assignedOfficial: { type: String, default: 'Unassigned' },
    walkinFiled:      { type: Boolean, default: false },
    // Admin note shown to the resident (e.g. resolution summary)
    resolutionNote:   { type: String, default: '' },
  },
  { timestamps: true }
);

// Auto-generate uniqueID before first save if not already set.
// Format: CMP-YYYYMMDD-XXXXXX  (date + last 6 chars of _id, uppercased)
// This runs on every new document; existing docs keep their uniqueID unchanged.
complaintSchema.pre('save', function (next) {
  if (!this.uniqueID) {
    const date = new Date(this.createdAt || Date.now());
    const datePart = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
    const idPart   = String(this._id).slice(-6).toUpperCase();
    this.uniqueID  = `CMP-${datePart}-${idPart}`;
  }
  next();
});

export default mongoose.models.Complaint ||
  mongoose.model('Complaint', complaintSchema);