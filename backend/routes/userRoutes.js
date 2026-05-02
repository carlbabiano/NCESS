import express    from "express";
import mongoose   from "mongoose";
import bcrypt      from "bcrypt";
import jwt         from "jsonwebtoken";
import multer      from "multer";
import { v2 as cloudinary } from "cloudinary";
import { CloudinaryStorage } from "multer-storage-cloudinary";
import Admin       from "../models/Admin.js";
import Appointment from "../models/appointments.js";
import Complaint   from "../models/complaints.js";
import { sendPasswordResetEmail } from "../services/emailService.js";

const router = express.Router();

// ── User Schema ──────────────────────────────────────────────────────────────
const userSchema = new mongoose.Schema({
  email:         { type: String, required: true, unique: true },
  password:      { type: String, required: true },
  status:        { type: String, enum: ['pending', 'approved', 'denied'], default: 'pending' },
  firstName:     { type: String, default: '' },
  middleName:    { type: String, default: '' },
  lastName:      { type: String, default: '' },
  birthdate:     { type: String, default: '' },
  sex:           { type: String, default: '' },
  civilStatus:   { type: String, default: '' },
  nationality:   { type: String, default: '' },
  contactNumber: { type: String, default: '' },
  homeAddress:   { type: String, default: '' },
  purok:         { type: String, default: '' },
  residencyStatus: { type: String, default: '' },
  lengthOfStay:    { type: String, default: '' },
  voterStatus:     { type: String, default: '' },
  householdId:     { type: String, default: '' },
  emergencyContactName:   { type: String, default: '' },
  emergencyContactNumber: { type: String, default: '' },
  occupation:             { type: String, default: '' },
  educationalAttainment:  { type: String, default: '' },
  // Verification documents from signup (Cloudinary URLs)
  validIdUrl:           { type: String, default: '' },
  proofOfResidencyUrl:  { type: String, default: '' },
  // Password reset
  resetCode:            { type: String, default: '' },
  resetCodeExpiry:      { type: Date, default: null },
}, { timestamps: true });

const User = mongoose.model("User", userSchema);

const profileChangeRequestSchema = new mongoose.Schema({
  userId:        { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  residentName:  { type: String, default: '' },
  residentEmail: { type: String, default: '' },
  currentData:   { type: Object, default: {} },
  requestedData: { type: Object, required: true },
  note:          { type: String, default: '' },
  status:        { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  reviewedBy:    { type: Object, default: null },
  reviewedAt:    { type: Date, default: null },
}, { timestamps: true });

const ProfileChangeRequest = mongoose.model('ProfileChangeRequest', profileChangeRequestSchema);

// ── Audit Log Schema ─────────────────────────────────────────────────────────
// Records every privileged action taken on admin accounts for accountability.
const auditLogSchema = new mongoose.Schema({
  performedBy: {
    adminId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
    email:     String,
    firstName: String,
    lastName:  String,
    role:      String,
  },
  targetAdmin: {
    adminId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
    email:     String,
    firstName: String,
    lastName:  String,
  },
  action:  {
    type: String,
    enum: [
      'CREATE_ADMIN',
      'UPDATE_ROLE',
      'UPDATE_NAME',
      'RESET_PASSWORD',
      'DEACTIVATE_ADMIN',
      'REACTIVATE_ADMIN',
      'DELETE_ADMIN',
    ],
    required: true,
  },
  details: { type: Object, default: {} }, // e.g. { fromRole: 'clerk', toRole: 'secretary', reason: '...' }
  reason:  { type: String, default: '' },
}, { timestamps: true });

const AuditLog = mongoose.model('AuditLog', auditLogSchema);

// ── Middleware — verify admin JWT ────────────────────────────────────────────
function requireAdmin(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer '))
    return res.status(401).json({ message: 'No token provided' });
  try {
    const decoded = jwt.verify(auth.slice(7), process.env.JWT_SECRET || 'your_secret_key');
    if (decoded.role !== 'admin') return res.status(403).json({ message: 'Admin access required' });
    req.admin = decoded;
    next();
  } catch {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
}

// ── Middleware — only barangay captain or secretary can manage admin accounts ─
function requireSuperAdmin(req, res, next) {
  const adminRole = req.admin?.adminRole;
  if (!['barangaycaptain', 'secretary'].includes(adminRole))
    return res.status(403).json({ message: 'Only the Barangay Captain or Secretary can manage admin accounts.' });
  next();
}

// ── Helper ───────────────────────────────────────────────────────────────────
function safeUser(doc) {
  const obj = doc.toObject ? doc.toObject() : { ...doc };
  delete obj.password;
  return obj;
}

// Writes a structured audit log entry.
async function writeAuditLog({ performer, target, action, details = {}, reason = '' }) {
  try {
    await AuditLog.create({
      performedBy: {
        adminId:   performer.id,
        email:     performer.email,
        firstName: performer.firstName,
        lastName:  performer.lastName,
        role:      performer.adminRole,
      },
      targetAdmin: target ? {
        adminId:   target._id,
        email:     target.email,
        firstName: target.firstName,
        lastName:  target.lastName,
      } : undefined,
      action,
      details,
      reason,
    });
  } catch (err) {
    // Audit log failures are non-fatal — just warn.
    console.warn('Audit log write failed:', err.message);
  }
}

// ── Document Upload to Cloudinary for Signup ─────────────────────────────────
const getDocumentUpload = () => {
  const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
      folder: 'ebrgy/signup_documents',
      allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'pdf'],
    },
  });
  return multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } }); // 50MB limit
};

router.post("/usersignup/upload-document", (req, res, next) => {
  getDocumentUpload().single("file")(req, res, next);
}, (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No file provided" });
    }

    const imageUrl = req.file.secure_url || req.file.url || 
      `https://res.cloudinary.com/${process.env.CLOUDINARY_CLOUD_NAME}/image/upload/${req.file.filename}`;

    console.log("Document uploaded:", { filename: req.file.filename, url: imageUrl });
    res.status(200).json({ 
      message: "Document uploaded successfully",
      url: imageUrl,
      filename: req.file.filename,
    });
  } catch (error) {
    console.error("Document upload error:", error);
    res.status(500).json({ message: "Failed to upload document", error: error.message });
  }
});

// ── Signup ───────────────────────────────────────────────────────────────────
router.post("/usersignup", async (req, res) => {
  const {
    email, password,
    firstName, middleName, lastName,
    birthdate, sex, contactNumber,
    homeAddress, purok,
  } = req.body;

  if (!email || !password)
    return res.status(400).json({ message: "Email and password are required" });

  if (birthdate) {
    const today = new Date(); const birth = new Date(birthdate);
    const age = today.getFullYear() - birth.getFullYear() -
      (today < new Date(today.getFullYear(), birth.getMonth(), birth.getDate()) ? 1 : 0);
    if (age < 18)
      return res.status(400).json({ message: "You must be at least 18 years old to register." });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email))
    return res.status(400).json({ message: "Please enter a valid email address" });

  try {
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      if (existingUser.status === 'denied') {
        const hashedPassword = await bcrypt.hash(password, 10);
        existingUser.password      = hashedPassword;
        existingUser.status        = 'pending';
        existingUser.firstName     = firstName     || '';
        existingUser.middleName    = middleName    || '';
        existingUser.lastName      = lastName      || '';
        existingUser.birthdate     = birthdate     || '';
        existingUser.sex           = sex           || '';
        existingUser.contactNumber = contactNumber || '';
        existingUser.homeAddress   = homeAddress   || '';
        existingUser.purok         = purok         || '';
        await existingUser.save();
        req.app.get('io')?.to('admin_room').emit('resident_account_submitted', safeUser(existingUser));
        return res.status(201).json({ message: "Re-registration submitted. Awaiting barangay approval." });
      }
      return res.status(409).json({ message: "An account with this email already exists." });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({
      email, password: hashedPassword, status: 'pending',
      firstName: firstName || '', middleName: middleName || '', lastName: lastName || '',
      birthdate: birthdate || '', sex: sex || '', contactNumber: contactNumber || '',
      homeAddress: homeAddress || '', purok: purok || '',
    });
    await user.save();
    req.app.get('io')?.to('admin_room').emit('resident_account_submitted', safeUser(user));
    res.status(201).json({ message: "Registration submitted. Awaiting barangay approval." });
  } catch (error) {
    console.error("Signup error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// ── Save verification documents (called after signup during document upload) ──
router.post("/usersignup/documents/:email", async (req, res) => {
  try {
    const { email } = req.params;
    const { validId, proofOfResidency } = req.body;

    console.log("[Documents Storage] Received:", { email, hasValidId: !!validId, hasProof: !!proofOfResidency });
    console.log("[Documents Storage] ValidID URL:", validId?.substring(0, 80) + '...');
    console.log("[Documents Storage] ProofOfResidency URL:", proofOfResidency?.substring(0, 80) + '...');

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Update with Cloudinary URLs
    if (validId) {
      user.validIdUrl = validId;
      console.log("[Documents Storage] Updated validIdUrl");
    }
    if (proofOfResidency) {
      user.proofOfResidencyUrl = proofOfResidency;
      console.log("[Documents Storage] Updated proofOfResidencyUrl");
    }

    await user.save();
    
    console.log("[Documents Storage] Saved to DB:", { 
      email: user.email, 
      validIdUrl: user.validIdUrl?.substring(0, 80) + '...',
      proofOfResidencyUrl: user.proofOfResidencyUrl?.substring(0, 80) + '...'
    });
    
    // Broadcast update to all admins for real-time viewing
    const io = req.app.get('io');
    if (io) {
      console.log("[Socket.io] Broadcasting resident_profile_updated for documents", { userId: user._id, email: user.email });
      io.to('admin_room').emit('resident_profile_updated', {
        user: safeUser(user),
      });
    }
    
    res.status(200).json({ message: "Documents saved successfully", user: safeUser(user) });
  } catch (error) {
    console.error("Document save error:", error);
    res.status(500).json({ message: "Failed to save documents" });
  }
});

// ── User Login ───────────────────────────────────────────────────────────────
router.post("/userlogin", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ message: "Email and password are required" });

  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ message: "Invalid email or password" });

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) return res.status(401).json({ message: "Invalid email or password" });

    if (user.status === 'pending')
      return res.status(403).json({ status: 'pending', message: 'Your account is still awaiting approval by the barangay office.' });
    if (user.status === 'denied')
      return res.status(403).json({ status: 'denied', message: 'Your registration was not approved. Please contact the barangay office.' });

    const token = jwt.sign(
      { id: user._id, email: user.email, fullName: `${user.firstName} ${user.lastName}`.trim() },
      process.env.JWT_SECRET || "your_secret_key",
      { expiresIn: "8h" }
    );
    res.status(200).json({ message: "Login successful", token, user: safeUser(user) });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// ── Forgot Password (Send Code) ──────────────────────────────────────────────
router.post("/user/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || !email.trim()) {
      return res.status(400).json({ message: "Email is required" });
    }

    console.log("[Password Reset] Forgot password request for:", email.trim().toLowerCase());
    const user = await User.findOne({ email: email.trim().toLowerCase() });
    if (!user) {
      // For security, don't reveal if email exists
      console.log("[Password Reset] User not found for:", email.trim().toLowerCase());
      return res.status(200).json({ 
        message: "If an account exists with this email, you will receive a password reset code." 
      });
    }

    console.log("[Password Reset] User found:", user.email, "ID:", user._id);

    // Generate a 6-digit reset code
    const resetCode = Math.floor(100000 + Math.random() * 900000).toString();
    const resetCodeExpiry = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes from now

    user.resetCode = resetCode;
    user.resetCodeExpiry = resetCodeExpiry;
    const savedUser = await user.save();

    console.log("[Password Reset] Code saved for:", email);
    console.log("[Password Reset] Reset code:", resetCode);
    console.log("[Password Reset] Reset code expiry:", resetCodeExpiry);
    console.log("[Password Reset] Saved user resetCode:", savedUser.resetCode);
    console.log("[Password Reset] Saved user resetCodeExpiry:", savedUser.resetCodeExpiry);

    // Send password reset email
    const emailSent = await sendPasswordResetEmail(user.email, resetCode);

    if (!emailSent) {
      console.warn("[Password Reset] Email service unavailable, but code generated successfully");
    }

    res.status(200).json({ 
      message: "If an account exists with this email, a password reset code will be sent." 
    });
  } catch (error) {
    console.error("Forgot password error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// ── Verify Reset Code ────────────────────────────────────────────────────────
router.post("/user/verify-reset-code", async (req, res) => {
  try {
    const { email, code } = req.body;
    
    if (!email || !code) {
      return res.status(400).json({ message: "Email and code are required" });
    }

    console.log("[Verify Code] Verifying code for:", email.trim().toLowerCase(), "Code:", code);
    const user = await User.findOne({ email: email.trim().toLowerCase() });
    if (!user) {
      console.log("[Verify Code] User not found:", email.trim().toLowerCase());
      return res.status(404).json({ message: "User not found" });
    }

    console.log("[Verify Code] User found:", user.email);
    console.log("[Verify Code] Stored resetCode:", user.resetCode);
    console.log("[Verify Code] Stored resetCodeExpiry:", user.resetCodeExpiry);

    // Check if code exists and hasn't expired
    if (!user.resetCode || !user.resetCodeExpiry) {
      console.log("[Verify Code] No code found in database");
      return res.status(400).json({ message: "No password reset request found. Please request a new code." });
    }

    if (new Date() > user.resetCodeExpiry) {
      user.resetCode = '';
      user.resetCodeExpiry = null;
      await user.save();
      return res.status(400).json({ message: "Reset code has expired. Please request a new code." });
    }

    // Verify code matches
    if (user.resetCode !== code.trim()) {
      return res.status(400).json({ message: "Invalid reset code" });
    }

    res.status(200).json({ 
      message: "Code verified. You can now reset your password.",
      verified: true
    });
  } catch (error) {
    console.error("Verify code error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});


// ── Reset Password with Code ────────────────────────────────────────────────
router.post("/user/reset-password", async (req, res) => {
  try {
    const { email, code, newPassword, confirmPassword } = req.body;

    if (!email || !code || !newPassword || !confirmPassword) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ message: "Passwords do not match" });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ message: "Password must be at least 8 characters" });
    }

    const user = await User.findOne({ email: email.trim().toLowerCase() });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Check if code exists and hasn't expired
    if (!user.resetCode || !user.resetCodeExpiry) {
      return res.status(400).json({ message: "No password reset request found. Please request a new code." });
    }

    if (new Date() > user.resetCodeExpiry) {
      user.resetCode = '';
      user.resetCodeExpiry = null;
      await user.save();
      return res.status(400).json({ message: "Reset code has expired. Please request a new code." });
    }

    // Verify code matches
    if (user.resetCode !== code.trim()) {
      return res.status(400).json({ message: "Invalid reset code" });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;
    user.resetCode = '';
    user.resetCodeExpiry = null;
    await user.save();

    console.log("[Password Reset] Password reset successful for:", user.email);

    res.status(200).json({ message: "Password has been reset successfully. You can now login with your new password." });
  } catch (error) {
    console.error("Reset password error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});


// ── Admin Login ──────────────────────────────────────────────────────────────
router.post("/adminlogin", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ message: "Email and password are required" });

  try {
    const admin = await Admin.findOne({ email });
    if (!admin) return res.status(401).json({ message: "Invalid admin credentials" });

    const isPasswordValid = await bcrypt.compare(password, admin.password);
    if (!isPasswordValid) return res.status(401).json({ message: "Invalid admin credentials" });

    // Block deactivated or archived accounts from logging in.
    if (admin.accountStatus && admin.accountStatus !== 'active')
      return res.status(403).json({
        message: `This account has been ${admin.accountStatus}. Please contact the Barangay Captain or Secretary.`,
      });

    const token = jwt.sign(
      {
        id:        admin._id,
        role:      'admin',
        adminRole: admin.role,
        email:     admin.email,
        firstName: admin.firstName,
        lastName:  admin.lastName,
      },
      process.env.JWT_SECRET || "your_secret_key",
      { expiresIn: "8h" }
    );

    res.status(200).json({
      message: "Admin login successful",
      token,
      admin: {
        _id:           admin._id,
        email:         admin.email,
        adminRole:     admin.role,
        role:          admin.role,
        firstName:     admin.firstName,
        lastName:      admin.lastName,
        mobileNo:      admin.mobileNo,
        accountStatus: admin.accountStatus || 'active',
        createdAt:     admin.createdAt,
      },
    });
  } catch (error) {
    console.error("Admin login error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// ── GET /users — all residents (admin only) ──────────────────────────────────
router.get("/users", requireAdmin, async (req, res) => {
  try {
    const users = await User.find({}, { password: 0 }).sort({ createdAt: -1 });
    res.status(200).json(users);
  } catch (error) {
    console.error("Get users error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// ── PATCH /users/:id/status ──────────────────────────────────────────────────
router.get("/admin/me", requireAdmin, async (req, res) => {
  try {
    const admin = await Admin.findById(req.admin.id, { password: 0 });
    if (!admin) return res.status(404).json({ message: "Admin not found." });
    res.status(200).json(admin);
  } catch (error) {
    console.error("Get admin profile error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.patch("/users/:id/status", requireAdmin, async (req, res) => {
  const { status } = req.body;
  if (!['approved', 'denied'].includes(status))
    return res.status(400).json({ message: "Invalid status value" });

  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (user.status !== 'pending')
      return res.status(409).json({ message: `Cannot change status of a ${user.status} account.` });

    const previousStatus = user.status;
    user.status = status;
    await user.save();

    const safeObj = user.toObject();
    delete safeObj.password;
    req.app.get('io')?.to('admin_room').emit('resident_account_status_updated', {
      user: safeObj,
      status,
      previousStatus,
    });
    res.status(200).json({ message: `User ${status}`, user: safeObj });
  } catch (error) {
    console.error("Update status error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// ADMIN ACCOUNT MANAGEMENT — Captain & Secretary only
// ════════════════════════════════════════════════════════════════════════════

// GET /admins — list all admin accounts (include inactive/archived)
router.get("/admins", requireAdmin, requireSuperAdmin, async (req, res) => {
  try {
    const admins = await Admin.find({}, { password: 0 }).sort({ createdAt: -1 });
    res.status(200).json(admins);
  } catch (error) {
    console.error("Get admins error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// POST /admins — create a new admin account
router.post("/admins", requireAdmin, requireSuperAdmin, async (req, res) => {
  const { email, password, role, firstName, lastName, mobileNo } = req.body;

  if (!email || !password || !role)
    return res.status(400).json({ message: "Email, password, and role are required." });

  const validRoles = ['barangaycaptain', 'secretary', 'treasurer', 'barangaytanod', 'clerk'];
  if (!validRoles.includes(role))
    return res.status(400).json({ message: "Invalid role." });

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email))
    return res.status(400).json({ message: "Please enter a valid email address." });

  if (password.length < 6)
    return res.status(400).json({ message: "Password must be at least 6 characters." });

  try {
    const existing = await Admin.findOne({ email });
    if (existing)
      return res.status(409).json({ message: "An admin with this email already exists." });

    const hashed = await bcrypt.hash(password, 10);
    const admin  = await Admin.create({
      email,
      password: hashed,
      role,
      firstName:     firstName || '',
      lastName:      lastName  || '',
      mobileNo:      mobileNo  || '',
      accountStatus: 'active',
    });

    await writeAuditLog({
      performer: req.admin,
      target:    admin,
      action:    'CREATE_ADMIN',
      details:   { role },
    });

    const obj = admin.toObject();
    delete obj.password;
    res.status(201).json({ message: "Admin account created.", admin: obj });
  } catch (error) {
    console.error("Create admin error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// PATCH /admins/:id — update role and/or name
router.patch("/admins/:id", requireAdmin, requireSuperAdmin, async (req, res) => {
  const { role, firstName, lastName, mobileNo, reason } = req.body;

  // Prevent self-role change
  if (String(req.params.id) === String(req.admin.id) && role)
    return res.status(400).json({ message: "You cannot change your own role." });

  const validRoles = ['barangaycaptain', 'secretary', 'treasurer', 'barangaytanod', 'clerk'];
  if (role && !validRoles.includes(role))
    return res.status(400).json({ message: "Invalid role." });

  try {
    const admin = await Admin.findById(req.params.id);
    if (!admin) return res.status(404).json({ message: "Admin not found." });

    const prevRole      = admin.role;
    const prevFirstName = admin.firstName;
    const prevLastName  = admin.lastName;
    const details       = {};

    if (role && role !== prevRole) {
      admin.role       = role;
      details.fromRole = prevRole;
      details.toRole   = role;
    }
    if (firstName !== undefined) admin.firstName = firstName;
    if (lastName  !== undefined) admin.lastName  = lastName;
    if (mobileNo  !== undefined) admin.mobileNo  = mobileNo;
    await admin.save();

    // Determine which action to log
    const action = role && role !== prevRole ? 'UPDATE_ROLE' : 'UPDATE_NAME';
    if (firstName !== undefined) details.fromFirstName = prevFirstName;
    if (lastName  !== undefined) details.fromLastName  = prevLastName;

    await writeAuditLog({ performer: req.admin, target: admin, action, details, reason: reason || '' });

    const obj = admin.toObject();
    delete obj.password;
    res.status(200).json({ message: "Admin updated.", admin: obj });
  } catch (error) {
    console.error("Update admin error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// PATCH /admins/:id/password — reset password
router.patch("/admins/:id/password", requireAdmin, requireSuperAdmin, async (req, res) => {
  const { password, reason } = req.body;
  if (!password || password.length < 6)
    return res.status(400).json({ message: "Password must be at least 6 characters." });

  try {
    const admin = await Admin.findById(req.params.id);
    if (!admin) return res.status(404).json({ message: "Admin not found." });

    admin.password = await bcrypt.hash(password, 10);
    await admin.save();

    await writeAuditLog({ performer: req.admin, target: admin, action: 'RESET_PASSWORD', reason: reason || '' });

    res.status(200).json({ message: "Password updated." });
  } catch (error) {
    console.error("Reset password error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// ── PATCH /admins/:id/status — deactivate or reactivate an admin ─────────────
// accountStatus: 'active' | 'inactive'
// Reactivation requires the performing admin to supply their own password.
router.patch("/admins/:id/status", requireAdmin, requireSuperAdmin, async (req, res) => {
  const { accountStatus, reason, confirmPassword } = req.body;
  const validStatuses = ['active', 'inactive'];

  if (!validStatuses.includes(accountStatus))
    return res.status(400).json({ message: "Invalid account status. Must be active or inactive." });

  if (String(req.params.id) === String(req.admin.id))
    return res.status(400).json({ message: "You cannot change your own account status." });

  try {
    // Reactivation requires the current admin to confirm their own password.
    if (accountStatus === 'active') {
      if (!confirmPassword)
        return res.status(400).json({ message: "Your password is required to reactivate an account." });
      const performer = await Admin.findById(req.admin.id);
      if (!performer) return res.status(404).json({ message: "Performing admin not found." });
      const passwordOk = await bcrypt.compare(confirmPassword, performer.password);
      if (!passwordOk)
        return res.status(401).json({ message: "Incorrect password. Reactivation not authorised." });
    }

    const admin = await Admin.findById(req.params.id);
    if (!admin) return res.status(404).json({ message: "Admin not found." });

    const prevStatus   = admin.accountStatus || 'active';
    admin.accountStatus = accountStatus;
    await admin.save();

    const action = accountStatus === 'active' ? 'REACTIVATE_ADMIN' : 'DEACTIVATE_ADMIN';

    await writeAuditLog({
      performer: req.admin,
      target:    admin,
      action,
      details:   { fromStatus: prevStatus, toStatus: accountStatus },
      reason:    reason || '',
    });

    const obj = admin.toObject();
    delete obj.password;
    res.status(200).json({ message: `Admin account ${accountStatus === 'active' ? 'reactivated' : 'deactivated'}.`, admin: obj });
  } catch (error) {
    console.error("Update admin status error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// NOTE: Hard-delete has been removed. Use PATCH /admins/:id/status with accountStatus='inactive'
// to deactivate an account, which moves it to the deactivated area and can be reactivated.


// ── GET /audit-logs — view admin action history ──────────────────────────────
router.get("/audit-logs", requireAdmin, requireSuperAdmin, async (req, res) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 30);
    const skip  = (page - 1) * limit;

    const [logs, total] = await Promise.all([
      AuditLog.find({})
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      AuditLog.countDocuments({}),
    ]);

    res.status(200).json({ logs, total, page, pages: Math.ceil(total / limit) });
  } catch (error) {
    console.error("Audit log fetch error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// ── Middleware — verify user JWT ─────────────────────────────────────────────
function requireUser(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer '))
    return res.status(401).json({ message: 'No token provided' });
  try {
    const decoded = jwt.verify(auth.slice(7), process.env.JWT_SECRET || 'your_secret_key');
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
}

const PROFILE_CHANGE_FIELDS = [
  'firstName', 'middleName', 'lastName', 'birthdate', 'sex', 'civilStatus', 'nationality',
  'contactNumber', 'email', 'homeAddress', 'purok', 'residencyStatus', 'lengthOfStay', 'voterStatus',
  'householdId', 'emergencyContactName', 'emergencyContactNumber', 'occupation',
  'educationalAttainment',
];

function pickProfileFields(source = {}) {
  return PROFILE_CHANGE_FIELDS.reduce((acc, key) => {
    if (source[key] !== undefined) acc[key] = source[key];
    return acc;
  }, {});
}

function normalizeProfileValue(value) {
  return String(value ?? '').trim();
}

function pickChangedProfileFields(currentData = {}, requestedData = {}) {
  return Object.keys(requestedData).reduce((acc, key) => {
    if (normalizeProfileValue(requestedData[key]) !== normalizeProfileValue(currentData[key])) {
      acc[key] = requestedData[key];
    }
    return acc;
  }, {});
}

router.post("/profile-change-requests", requireUser, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found' });

    const currentProfileData = pickProfileFields(user.toObject());
    const submittedData = pickProfileFields(req.body.requestedData || {});
    const requestedData = pickChangedProfileFields(currentProfileData, submittedData);
    if (Object.keys(requestedData).length === 0)
      return res.status(400).json({ message: 'Please change something before sending a request.' });

    if (requestedData.email !== undefined) {
      const requestedEmail = String(requestedData.email || '').trim();
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(requestedEmail))
        return res.status(400).json({ message: 'Please enter a valid email address.' });

      const emailOwner = await User.findOne({ email: requestedEmail, _id: { $ne: user._id } });
      if (emailOwner)
        return res.status(409).json({ message: 'Email address is already used by another resident.' });

      requestedData.email = requestedEmail;
    }

    const existing = await ProfileChangeRequest.findOne({ userId: user._id, status: 'pending' });
    if (existing)
      return res.status(409).json({ message: 'You already have a pending information change request.' });

    const currentData = Object.keys(requestedData).reduce((acc, key) => {
      acc[key] = currentProfileData[key] ?? '';
      return acc;
    }, {});

    const request = await ProfileChangeRequest.create({
      userId: user._id,
      residentName: `${user.firstName} ${user.lastName}`.trim(),
      residentEmail: user.email,
      currentData,
      requestedData,
      note: req.body.note || '',
    });

    req.app.get('io')?.to('admin_room').emit('profile_change_request_created', request.toObject());
    res.status(201).json({ message: 'Information change request submitted.', request });
  } catch (err) {
    console.error('Profile change request error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.get("/profile-change-requests", requireAdmin, async (req, res) => {
  try {
    const status = req.query.status || 'pending';
    const filter = status === 'all' ? {} : { status };
    const requests = await ProfileChangeRequest.find(filter).sort({ createdAt: -1 }).lean();
    res.status(200).json(requests);
  } catch (err) {
    console.error('Get profile change requests error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.patch("/profile-change-requests/:id", requireAdmin, async (req, res) => {
  const { status } = req.body;
  if (!['approved', 'rejected'].includes(status))
    return res.status(400).json({ message: 'Invalid request status.' });

  try {
    const request = await ProfileChangeRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ message: 'Request not found' });
    if (request.status !== 'pending')
      return res.status(409).json({ message: `Request already ${request.status}.` });

    const previousStatus = request.status;
    let user = null;
    if (status === 'approved') {
      user = await User.findById(request.userId);
      if (!user) return res.status(404).json({ message: 'Resident not found' });

      if (request.requestedData.email !== undefined) {
        const requestedEmail = String(request.requestedData.email || '').trim();
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(requestedEmail))
          return res.status(400).json({ message: 'Requested email address is invalid.' });

        const emailOwner = await User.findOne({ email: requestedEmail, _id: { $ne: user._id } });
        if (emailOwner)
          return res.status(409).json({ message: 'Email address is already used by another resident.' });

        request.requestedData.email = requestedEmail;
      }

      Object.assign(user, pickProfileFields(request.requestedData));
      await user.save();
    }

    request.status = status;
    request.reviewedAt = new Date();
    request.reviewedBy = {
      adminId: req.admin.id,
      email: req.admin.email,
      firstName: req.admin.firstName,
      lastName: req.admin.lastName,
      role: req.admin.adminRole,
    };
    await request.save();

    const serializedRequest = { ...request.toObject(), previousStatus };
    req.app.get('io')?.to('admin_room').emit('profile_change_request_updated', serializedRequest);
    req.app.get('io')?.to(`user_${request.userId}`).emit('profile_change_request_updated', serializedRequest);
    if (user) {
      req.app.get('io')?.to('admin_room').emit('resident_profile_updated', {
        user: safeUser(user),
        request: serializedRequest,
      });
    }
    res.status(200).json({ message: `Request ${status}.`, request, user: user ? safeUser(user) : null });
  } catch (err) {
    console.error('Review profile change request error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ── POST /user/generate-qr-token — return the resident's permanent QR value ──
// The QR code on the frontend encodes this permanent user id directly.
// The admin scanner hits GET /user/verify-qr/:token to resolve it.
router.post("/user/generate-qr-token", requireUser, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.status !== 'approved')
      return res.status(403).json({ message: 'Account is not approved' });

    res.status(200).json({ qrToken: String(user._id) });
  } catch (err) {
    console.error('Generate QR token error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ── GET /user/verify-qr/:token — admin scans; returns resident info ──────────
router.get("/user/verify-qr/:token", requireAdmin, async (req, res) => {
  try {
    let userId = req.params.token;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      const decoded = jwt.verify(
        req.params.token,
        process.env.JWT_SECRET || 'your_secret_key'
      );
      if (decoded.type !== 'qr_identity')
        return res.status(400).json({ message: 'Invalid QR token type' });
      userId = decoded.userId;
    }

    const user = await User.findById(userId).select('-password');
    if (!user) return res.status(404).json({ message: 'Resident not found' });

    const ownerQuery = {
      $or: [
        { userId: user._id },
        ...(user.email ? [{ residentEmail: user.email }] : []),
      ],
    };
    const [appointments, complaints] = await Promise.all([
      Appointment.find(ownerQuery)
        .sort({ date: -1, time: -1, createdAt: -1 })
        .limit(20)
        .lean(),
      Complaint.find(ownerQuery)
        .sort({ createdAt: -1 })
        .limit(20)
        .lean(),
    ]);

    res.status(200).json({
      verified: true,
      user: {
        _id:         String(user._id),
        fullName:    `${user.firstName} ${user.lastName}`.trim(),
        email:       user.email,
        purok:       user.purok,
        homeAddress: user.homeAddress,
        sex:         user.sex,
        birthdate:   user.birthdate,
        status:      user.status,
      },
      appointments: appointments.map((appointment) => ({
        _id:          String(appointment._id),
        purpose:      appointment.purpose,
        date:         appointment.date,
        time:         appointment.time,
        assignedTo:   appointment.assignedTo,
        status:       appointment.status,
        cancelReason: appointment.cancelReason,
        notes:        appointment.notes,
        createdAt:    appointment.createdAt,
      })),
      complaints: complaints.map((complaint) => ({
        _id:              String(complaint._id),
        category:         complaint.category,
        location:         complaint.location,
        description:      complaint.description,
        priority:         complaint.priority,
        status:           complaint.status,
        assignedOfficial: complaint.assignedOfficial,
        resolutionNote:   complaint.resolutionNote,
        createdAt:        complaint.createdAt,
      })),
    });
  } catch (err) {
    if (err.name === 'JsonWebTokenError')
      return res.status(400).json({ message: 'Invalid QR code.' });
    console.error('Verify QR error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;
