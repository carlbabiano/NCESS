import mongoose from 'mongoose';

const complaintSchema = new mongoose.Schema(
  {
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

export default mongoose.models.Complaint ||
  mongoose.model('Complaint', complaintSchema);
