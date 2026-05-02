import mongoose from 'mongoose';

const announcementSchema = new mongoose.Schema({
  category:      { type: String, required: true },
  categoryColor: { type: String },
  author:        { type: String, required: true },
  title:         { type: String, required: true },
  body:          { type: String, required: true },
  image:         { type: String },
  pinned:        { type: Boolean, default: false },
}, { timestamps: true });

export default mongoose.model('Announcement', announcementSchema);