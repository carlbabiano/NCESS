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
  denialReason:  { type: String, default: '' }, // Reason for denial provided by admin
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
  fieldReviews:  { type: Object, default: {} },
  proofDocumentUrl: { type: String, default: '' },
  proofDocumentName: { type: String, default: '' },
  note:          { type: String, default: '' },
  status:        { type: String, enum: ['pending', 'approved', 'denied', 'rejected', 'partially_approved'], default: 'pending' },
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
      originalName: req.file.originalname || '',
    });
  } catch (error) {
    console.error("Document upload error:", error);
    res.status(500).json({ message: "Failed to upload document", error: error.message });
  }
});

// ── Check Email Availability (Step 1 — Account Setup) ────────────────────────
// Only checks whether the email is already taken. Does NOT create any account.
// A denied account's email is considered available (re-registration is allowed).
router.post("/usersignup/check-email", async (req, res) => {
  const { email } = req.body;

  if (!email || !String(email).trim())
    return res.status(400).json({ message: "Email is required." });

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(String(email).trim()))
    return res.status(400).json({ message: "Please enter a valid email address." });

  try {
    const existing = await User.findOne({ email: String(email).trim().toLowerCase() });

    // No account found — email is free to use
    if (!existing)
      return res.status(200).json({ available: true, message: "Email is available." });

    // Denied accounts may re-register with the same email
    if (existing.status === 'denied')
      return res.status(200).json({ available: true, message: "Email is available." });

    // Pending or approved — already taken
    return res.status(409).json({ message: "An account with this email already exists." });
  } catch (error) {
    console.error("Check-email error:", error);
    return res.status(500).json({ message: "Internal server error." });
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
  const validId = req.body.validId || req.body.validIdUrl || '';

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
        existingUser.denialReason  = ''; // Clear previous denial reason
        existingUser.firstName     = firstName     || '';
        existingUser.middleName    = middleName    || '';
        existingUser.lastName      = lastName      || '';
        existingUser.birthdate     = birthdate     || '';
        existingUser.sex           = sex           || '';
        existingUser.contactNumber = contactNumber || '';
        existingUser.homeAddress   = homeAddress   || '';
        existingUser.purok         = purok         || '';
        if (validId) {
          existingUser.validIdUrl = validId;
        }
        await existingUser.save();
        req.app.get('io')?.to('admin_room').emit('resident_account_submitted', safeUser(existingUser));
        return res.status(201).json({
          message: "Re-registration submitted. Awaiting barangay approval.",
          user: safeUser(existingUser),
        });
      }
      return res.status(409).json({ message: "An account with this email already exists." });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({
      email, password: hashedPassword, status: 'pending',
      firstName: firstName || '', middleName: middleName || '', lastName: lastName || '',
      birthdate: birthdate || '', sex: sex || '', contactNumber: contactNumber || '',
      homeAddress: homeAddress || '', purok: purok || '',
      validIdUrl: validId || '',
    });
    await user.save();
    req.app.get('io')?.to('admin_room').emit('resident_account_submitted', safeUser(user));
    res.status(201).json({
      message: "Registration submitted. Awaiting barangay approval.",
      user: safeUser(user),
    });
  } catch (error) {
    console.error("Signup error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// ── Save verification documents (called after signup during document upload) ──
router.post("/usersignup/documents/:email", async (req, res) => {
  try {
    const { email } = req.params;
    const validId = req.body.validId || req.body.validIdUrl || '';

    console.log("[Documents Storage] Received:", { email, hasValidId: !!validId });
    console.log("[Documents Storage] ValidID URL:", validId?.substring(0, 80) + '...');

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Update with Cloudinary URLs
    if (validId) {
      user.validIdUrl = validId;
      console.log("[Documents Storage] Updated validIdUrl");
    }

    await user.save();
    
    console.log("[Documents Storage] Saved to DB:", { 
      email: user.email, 
      validIdUrl: user.validIdUrl?.substring(0, 80) + '...',
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
    if (user.status === 'denied') {
      const denialMsg = user.denialReason 
        ? `Your registration was not approved. Reason: ${user.denialReason}`
        : 'Your registration was not approved. Please contact the barangay office or try signing up again.';
      return res.status(403).json({ 
        status: 'denied', 
        message: denialMsg,
        denialReason: user.denialReason
      });
    }

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
  const { status, denialReason } = req.body;
  if (!['approved', 'denied'].includes(status))
    return res.status(400).json({ message: "Invalid status value" });

  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (user.status !== 'pending')
      return res.status(409).json({ message: `Cannot change status of a ${user.status} account.` });

    const previousStatus = user.status;
    user.status = status;
    
    // Store denial reason when denying
    if (status === 'denied') {
      user.denialReason = denialReason || '';
    } else if (status === 'approved') {
      user.denialReason = ''; // Clear denial reason when approving
    }
    
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

// POST /admins/verify-password - confirm current admin before opening Admin & Roles
router.post("/admins/verify-password", requireAdmin, requireSuperAdmin, async (req, res) => {
  const { password } = req.body;
  if (!password) {
    return res.status(400).json({ message: "Password is required." });
  }

  try {
    const admin = await Admin.findById(req.admin.id);
    if (!admin) {
      return res.status(404).json({ message: "Admin account not found." });
    }

    const passwordOk = await bcrypt.compare(password, admin.password);
    if (!passwordOk) {
      return res.status(401).json({ message: "Incorrect password." });
    }

    res.status(200).json({ message: "Password verified." });
  } catch (error) {
    console.error("Verify admin password error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// POST /admins — create a new admin account
router.post("/admins", requireAdmin, requireSuperAdmin, async (req, res) => {
  const { email, password, role, firstName, lastName, mobileNo } = req.body;

  if (!email || !password || !role)
    return res.status(400).json({ message: "Email, password, and role are required." });

  const validRoles = ['barangaycaptain', 'secretary', 'admin'];
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

  const validRoles = ['barangaycaptain', 'secretary', 'admin'];
  if (role && !validRoles.includes(role))
    return res.status(400).json({ message: "Invalid role." });

  try {
    const admin = await Admin.findById(req.params.id);
    if (!admin) return res.status(404).json({ message: "Admin not found." });

    // Prevent self-role change only if role is actually different
    if (String(req.params.id) === String(req.admin.id) && role && role !== admin.role)
      return res.status(400).json({ message: "You cannot change your own role." });

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

// DELETE /admins/:id — permanently delete an admin account
router.delete("/admins/:id", requireAdmin, requireSuperAdmin, async (req, res) => {
  try {
    const admin = await Admin.findById(req.params.id);
    if (!admin)
      return res.status(404).json({ message: "Admin not found." });

    // Prevent deleting yourself
    if (String(req.params.id) === String(req.admin.id))
      return res.status(400).json({ message: "You cannot delete your own account." });

    const adminName = [admin.firstName, admin.lastName].filter(Boolean).join(' ') || admin.email;

    await Admin.findByIdAndDelete(req.params.id);

    await writeAuditLog({
      performer: req.admin,
      target:    admin,
      action:    'DELETE_ADMIN',
      details:   { deletedAdmin: adminName },
    });

    res.status(200).json({ message: `Admin account "${adminName}" has been permanently deleted.` });
  } catch (error) {
    console.error("Delete admin error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

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

const PROFILE_PROOF_REQUIRED_FIELDS = [
  'firstName', 'middleName', 'lastName', 'birthdate', 'sex', 'civilStatus', 'nationality',
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

function requiresProfileProof(requestedData = {}) {
  return PROFILE_PROOF_REQUIRED_FIELDS.some(key => requestedData[key] !== undefined);
}

function adminReviewInfo(admin = {}) {
  return {
    adminId: admin.id,
    email: admin.email,
    firstName: admin.firstName,
    lastName: admin.lastName,
    role: admin.adminRole,
  };
}

function normalizeProfileReviewStatus(status) {
  return status === 'rejected' ? 'denied' : status;
}

function getFinalProfileRequestStatus(fieldReviews = {}) {
  const statuses = Object.values(fieldReviews).map(review => review?.status).filter(Boolean);
  if (statuses.length === 0) return 'pending';
  if (statuses.every(status => status === 'approved')) return 'approved';
  if (statuses.every(status => status === 'denied')) return 'denied';
  return 'partially_approved';
}

async function validateAndApplyProfileFields({ user, fields }) {
  const profileFields = pickProfileFields(fields);

  if (profileFields.email !== undefined) {
    const requestedEmail = String(profileFields.email || '').trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(requestedEmail)) {
      const error = new Error('Requested email address is invalid.');
      error.statusCode = 400;
      throw error;
    }

    const emailOwner = await User.findOne({ email: requestedEmail, _id: { $ne: user._id } });
    if (emailOwner) {
      const error = new Error('Email address is already used by another resident.');
      error.statusCode = 409;
      throw error;
    }

    profileFields.email = requestedEmail;
  }

  Object.assign(user, profileFields);
  await user.save();
  return profileFields;
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

    const proofDocumentUrl = String(req.body.proofDocumentUrl || '').trim();
    const proofDocumentName = String(req.body.proofDocumentName || '').trim();
    if (requiresProfileProof(requestedData) && !proofDocumentUrl) {
      return res.status(400).json({ message: 'Please upload a valid ID or supporting document for identity detail changes.' });
    }

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
      proofDocumentUrl,
      proofDocumentName,
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
  const { field } = req.body;
  const status = normalizeProfileReviewStatus(req.body.status);
  if (!['approved', 'denied'].includes(status))
    return res.status(400).json({ message: 'Invalid request status.' });

  try {
    const request = await ProfileChangeRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ message: 'Request not found' });
    if (request.status !== 'pending')
      return res.status(409).json({ message: `Request already ${request.status}.` });

    const previousStatus = request.status;
    let user = null;
    let appliedFields = {};
    const reviewer = adminReviewInfo(req.admin);

    if (field) {
      const requestedData = { ...(request.requestedData || {}) };
      const currentData = { ...(request.currentData || {}) };

      if (!PROFILE_CHANGE_FIELDS.includes(field) || requestedData[field] === undefined) {
        return res.status(400).json({ message: 'Invalid or already reviewed profile field.' });
      }

      if (status === 'approved') {
        user = await User.findById(request.userId);
        if (!user) return res.status(404).json({ message: 'Resident not found' });
        appliedFields = await validateAndApplyProfileFields({
          user,
          fields: { [field]: requestedData[field] },
        });
        request.residentName = `${user.firstName} ${user.lastName}`.trim();
        if (appliedFields.email !== undefined) {
          request.residentEmail = appliedFields.email;
        }
      }

      request.fieldReviews = {
        ...(request.fieldReviews || {}),
        [field]: {
          status,
          currentValue: currentData[field] ?? '',
          requestedValue: status === 'approved' && appliedFields[field] !== undefined
            ? appliedFields[field]
            : requestedData[field],
          reviewedAt: new Date(),
          reviewedBy: reviewer,
        },
      };

      delete requestedData[field];
      delete currentData[field];
      request.requestedData = requestedData;
      request.currentData = currentData;
      request.markModified('fieldReviews');
      request.markModified('requestedData');
      request.markModified('currentData');

      if (Object.keys(requestedData).length === 0) {
        request.status = getFinalProfileRequestStatus(request.fieldReviews);
        request.reviewedAt = new Date();
        request.reviewedBy = reviewer;
      }
    } else {
      if (status === 'approved') {
        user = await User.findById(request.userId);
        if (!user) return res.status(404).json({ message: 'Resident not found' });
        appliedFields = await validateAndApplyProfileFields({
          user,
          fields: request.requestedData || {},
        });
        request.residentName = `${user.firstName} ${user.lastName}`.trim();
        if (appliedFields.email !== undefined) {
          request.residentEmail = appliedFields.email;
        }
      }

      const now = new Date();
      const existingReviews = { ...(request.fieldReviews || {}) };
      Object.keys(request.requestedData || {}).forEach(key => {
        existingReviews[key] = {
          status,
          currentValue: request.currentData?.[key] ?? '',
          requestedValue: status === 'approved' && appliedFields[key] !== undefined
            ? appliedFields[key]
            : request.requestedData[key],
          reviewedAt: now,
          reviewedBy: reviewer,
        };
      });

      request.fieldReviews = existingReviews;
      request.requestedData = {};
      request.currentData = {};
      request.status = status;
      request.reviewedAt = now;
      request.reviewedBy = reviewer;
      request.markModified('fieldReviews');
      request.markModified('requestedData');
      request.markModified('currentData');
    }

    await request.save();

    const serializedRequest = {
      ...request.toObject(),
      previousStatus,
      reviewedField: field || '',
      reviewedStatus: field ? status : '',
    };
    req.app.get('io')?.to('admin_room').emit('profile_change_request_updated', serializedRequest);
    req.app.get('io')?.to(`user_${request.userId}`).emit('profile_change_request_updated', {
      request: serializedRequest,
      user: user ? safeUser(user) : null,
    });
    if (user) {
      req.app.get('io')?.to('admin_room').emit('resident_profile_updated', {
        user: safeUser(user),
        request: serializedRequest,
      });
    }
    res.status(200).json({ message: field ? `Field ${status}.` : `Request ${status}.`, request, user: user ? safeUser(user) : null });
  } catch (err) {
    console.error('Review profile change request error:', err);
    res.status(err.statusCode || 500).json({ message: err.statusCode ? err.message : 'Internal server error' });
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

// ── QR Image Upload to Cloudinary (Admin) ───────────────────────────────────
const getQRImageUpload = () => {
  const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
      folder: 'ebrgy/qr_scans',
      allowed_formats: ['jpg', 'jpeg', 'png', 'gif'],
    },
  });
  return multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } }); // 10MB limit
};

router.post("/admin/upload-qr-image", requireAdmin, (req, res, next) => {
  getQRImageUpload().single("qrImage")(req, res, next);
}, (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No image provided" });
    }

    const imageUrl = req.file.secure_url || req.file.url || 
      `https://res.cloudinary.com/${process.env.CLOUDINARY_CLOUD_NAME}/image/upload/${req.file.filename}`;

    console.log("QR image uploaded:", { filename: req.file.filename, url: imageUrl });
    res.status(200).json({ 
      message: "QR image uploaded successfully",
      url: imageUrl,
      filename: req.file.filename,
    });
  } catch (error) {
    console.error("QR image upload error:", error);
    res.status(500).json({ message: "Failed to upload QR image", error: error.message });
  }
});

export default router;
