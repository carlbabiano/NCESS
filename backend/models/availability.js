import mongoose from 'mongoose';

const availabilitySchema = new mongoose.Schema({
  schedule: {
    monday:    { enabled: Boolean, start: String, end: String, slotDuration: Number, maxPerSlot: Number },
    tuesday:   { enabled: Boolean, start: String, end: String, slotDuration: Number, maxPerSlot: Number },
    wednesday: { enabled: Boolean, start: String, end: String, slotDuration: Number, maxPerSlot: Number },
    thursday:  { enabled: Boolean, start: String, end: String, slotDuration: Number, maxPerSlot: Number },
    friday:    { enabled: Boolean, start: String, end: String, slotDuration: Number, maxPerSlot: Number },
    saturday:  { enabled: Boolean, start: String, end: String, slotDuration: Number, maxPerSlot: Number },
    sunday:    { enabled: Boolean, start: String, end: String, slotDuration: Number, maxPerSlot: Number },
  },
  blockedDates: [{
    date: { type: String, required: true },
    reason: { type: String, default: '' },
    type: { type: String, enum: ['fullday', 'times'], default: 'fullday' },
    startTime: { type: String }, // for time-specific blocks
    endTime: { type: String },   // for time-specific blocks
  }],
}, { timestamps: true });

export default mongoose.models.Availability || mongoose.model('Availability', availabilitySchema);
