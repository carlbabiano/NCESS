import mongoose from "mongoose";

const adminSchema = new mongoose.Schema({
  email:    { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: {
    type: String,
    enum: ['barangaycaptain', 'secretary', 'admin'],
    default: 'secretary',
  },
  firstName:     { type: String, default: '' },
  lastName:      { type: String, default: '' },
  mobileNo:      { type: String, default: '' },
  accountStatus: {
    type:    String,
    enum:    ['active', 'inactive', 'archived'],
    default: 'active',
  },
}, { timestamps: true });

const Admin = mongoose.model("Admin", adminSchema);

export default Admin;