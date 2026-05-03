const Student = require("../models/Student");
const Business = require("../models/Business");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { sendVerificationEmail, sendPasswordResetEmail } = require("../services/emailService");

// ─── Helpers ──────────────────────────────────────────────────────

/** Generate a 6-digit numeric OTP */
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/** OTP expiry: 15 minutes from now */
function otpExpiry() {
  return new Date(Date.now() + 15 * 60 * 1000);
}

/** Basic email format check */
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).toLowerCase());
}

/** Password strength: min 8 chars, at least one letter and one number */
function isStrongPassword(password) {
  return typeof password === "string" && password.length >= 8 && /[a-zA-Z]/.test(password) && /\d/.test(password);
}

function sanitizeUser(user, role) {
  if (!user) return null;
  return {
    id: user._id,
    name: user.name,
    email: user.email,
    role,
    phone: user.phone || "",
    college: user.college || "",
    location: user.location || "",
    bio: user.bio || "",
    skills: user.skills || [],
    businessType: user.businessType || "",
    jobTypePreference: user.jobTypePreference || "both"
  };
}

async function getUserFromTokenPayload(payload) {
  if (!payload?.id || !payload?.role) return null;
  if (payload.role === "business") return Business.findById(payload.id);
  return Student.findById(payload.id);
}

exports.registerStudent = async (req, res) => {
  try {
    const { name, email, password, skills, phone, college, location, bio, jobTypePreference } = req.body;

    // ── Validation improvements (non-breaking additions) ──────────
    if (!isValidEmail(email)) {
      return res.status(400).json({ message: "Invalid email format" });
    }
    if (!isStrongPassword(password)) {
      return res.status(400).json({ message: "Password must be at least 8 characters and contain letters and numbers" });
    }

    const existingStudent = await Student.findOne({ email });

    if (existingStudent) {
      return res.status(400).json({ message: "Student already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    // Generate verification OTP
    const otp = generateOTP();
    const expiry = otpExpiry();

    const newStudent = new Student({
      name,
      email,
      password: hashedPassword,
      skills: Array.isArray(skills) ? skills : [],
      phone,
      college,
      location,
      bio,
      jobTypePreference: ["online", "offline", "both"].includes(jobTypePreference) ? jobTypePreference : "both",
      isVerified: false,
      verificationToken: otp,
      tokenExpiry: expiry
    });

    await newStudent.save();

    // Send verification email (non-blocking — don't fail registration if email fails)
    try {
      await sendVerificationEmail(email, otp, name);
    } catch (emailErr) {
      console.error("[Auth] Failed to send verification email:", emailErr.message);
    }

    res.status(201).json({
      message: "Student registered successfully. Please check your email to verify your account.",
      user: sanitizeUser(newStudent, "student"),
      requiresVerification: true
    });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

exports.registerBusiness = async (req, res) => {
  try {
    const { name, email, password, phone, businessType, location, bio } = req.body;

    // ── Validation improvements ────────────────────────────────────
    if (!isValidEmail(email)) {
      return res.status(400).json({ message: "Invalid email format" });
    }
    if (!isStrongPassword(password)) {
      return res.status(400).json({ message: "Password must be at least 8 characters and contain letters and numbers" });
    }

    const existingBusiness = await Business.findOne({ email });

    if (existingBusiness) {
      return res.status(400).json({ message: "Business already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    // Generate verification OTP
    const otp = generateOTP();
    const expiry = otpExpiry();

    const newBusiness = new Business({
      name,
      email,
      password: hashedPassword,
      phone,
      businessType,
      location,
      bio,
      isVerified: false,
      verificationToken: otp,
      tokenExpiry: expiry
    });

    await newBusiness.save();

    // Send verification email (non-blocking)
    try {
      await sendVerificationEmail(email, otp, name);
    } catch (emailErr) {
      console.error("[Auth] Failed to send verification email:", emailErr.message);
    }

    res.status(201).json({
      message: "Business registered successfully. Please check your email to verify your account.",
      user: sanitizeUser(newBusiness, "business"),
      requiresVerification: true
    });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    let user = await Student.findOne({ email });
    let role = "student";

    if (!user) {
      user = await Business.findOne({ email });
      role = "business";
    }

    if (!user) {
      return res.status(400).json({ message: "User not found" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid password" });
    }

    // Block login if email not verified
    if (user.isVerified === false) {
      return res.status(403).json({
        message: "Please verify your email before logging in.",
        requiresVerification: true,
        email: user.email
      });
    }

    const token = jwt.sign(
      { id: user._id, role },
      process.env.JWT_SECRET || (() => { throw new Error("JWT_SECRET is not set in .env"); })(),
      { expiresIn: "7d" }
    );

    res.status(200).json({
      message: "Login successful",
      token,
      role,
      user: sanitizeUser(user, role)
    });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

exports.getMe = async (req, res) => {
  try {
    const user = await getUserFromTokenPayload(req.user);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json(sanitizeUser(user, req.user.role));
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

exports.updateMe = async (req, res) => {
  try {
    const user = await getUserFromTokenPayload(req.user);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const baseFields = {
      name: req.body.name,
      phone: req.body.phone,
      location: req.body.location,
      bio: req.body.bio
    };

    Object.entries(baseFields).forEach(([key, value]) => {
      if (typeof value === "string") user[key] = value.trim();
    });

    if (req.user.role === "student") {
      if (typeof req.body.college === "string") user.college = req.body.college.trim();
      if (Array.isArray(req.body.skills)) user.skills = req.body.skills;
      if (["online", "offline", "both"].includes(req.body.jobTypePreference)) {
        user.jobTypePreference = req.body.jobTypePreference;
      }
    }

    if (req.user.role === "business") {
      if (typeof req.body.businessType === "string") user.businessType = req.body.businessType.trim();
    }

    await user.save();

    res.status(200).json({
      message: "Profile updated",
      user: sanitizeUser(user, req.user.role)
    });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};


// ─── NEW: Verify Email ─────────────────────────────────────────────
// POST /api/auth/verify-email
// Body: { email, otp }
exports.verifyEmail = async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) {
      return res.status(400).json({ message: "Email and OTP are required" });
    }

    // Check both collections
    let user = await Student.findOne({ email });
    let role = "student";
    if (!user) {
      user = await Business.findOne({ email });
      role = "business";
    }
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    if (user.isVerified) {
      return res.status(400).json({ message: "Email is already verified" });
    }
    if (!user.verificationToken || user.verificationToken !== otp) {
      return res.status(400).json({ message: "Invalid OTP" });
    }
    if (!user.tokenExpiry || user.tokenExpiry < new Date()) {
      return res.status(400).json({ message: "OTP has expired. Please request a new one." });
    }

    user.isVerified = true;
    user.verificationToken = undefined;
    user.tokenExpiry = undefined;
    await user.save();

    res.status(200).json({ message: "Email verified successfully. You can now log in." });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

// ─── NEW: Resend Verification OTP ─────────────────────────────────
// POST /api/auth/resend-verification
// Body: { email }
exports.resendVerification = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: "Email is required" });

    let user = await Student.findOne({ email });
    let name = user?.name;
    if (!user) {
      user = await Business.findOne({ email });
      name = user?.name;
    }
    if (!user) return res.status(404).json({ message: "User not found" });
    if (user.isVerified) return res.status(400).json({ message: "Email is already verified" });

    const otp = generateOTP();
    user.verificationToken = otp;
    user.tokenExpiry = otpExpiry();
    await user.save();

    try {
      await sendVerificationEmail(email, otp, name);
    } catch (emailErr) {
      console.error("[Auth] Failed to resend verification email:", emailErr.message);
    }

    res.status(200).json({ message: "Verification OTP resent. Please check your email." });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

// ─── NEW: Forgot Password ──────────────────────────────────────────
// POST /api/auth/forgot-password
// Body: { email }
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: "Email is required" });

    let user = await Student.findOne({ email });
    let name = user?.name;
    if (!user) {
      user = await Business.findOne({ email });
      name = user?.name;
    }

    // Always respond with success to prevent email enumeration
    if (!user) {
      return res.status(200).json({ message: "If that email exists, a reset OTP has been sent." });
    }

    const otp = generateOTP();
    user.verificationToken = otp;
    user.tokenExpiry = otpExpiry();
    await user.save();

    try {
      await sendPasswordResetEmail(email, otp, name);
    } catch (emailErr) {
      console.error("[Auth] Failed to send password reset email:", emailErr.message);
    }

    res.status(200).json({ message: "If that email exists, a reset OTP has been sent." });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

// ─── NEW: Reset Password ───────────────────────────────────────────
// POST /api/auth/reset-password
// Body: { email, otp, newPassword }
exports.resetPassword = async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;
    if (!email || !otp || !newPassword) {
      return res.status(400).json({ message: "Email, OTP, and new password are required" });
    }
    if (!isStrongPassword(newPassword)) {
      return res.status(400).json({ message: "Password must be at least 8 characters and contain letters and numbers" });
    }

    let user = await Student.findOne({ email });
    if (!user) user = await Business.findOne({ email });
    if (!user) return res.status(404).json({ message: "User not found" });

    if (!user.verificationToken || user.verificationToken !== otp) {
      return res.status(400).json({ message: "Invalid OTP" });
    }
    if (!user.tokenExpiry || user.tokenExpiry < new Date()) {
      return res.status(400).json({ message: "OTP has expired. Please request a new one." });
    }

    user.password = await bcrypt.hash(newPassword, 10);
    user.verificationToken = undefined;
    user.tokenExpiry = undefined;
    await user.save();

    res.status(200).json({ message: "Password reset successfully. You can now log in." });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

// ─── NEW: Google OAuth Login/Register ─────────────────────────────
// POST /api/auth/google
// Body: { credential, role }   — credential is the Google ID token from frontend
// role: "student" | "business"
exports.googleAuth = async (req, res) => {
  try {
    const { credential, role, name: legacyName, email: legacyEmail, googleId: legacyGoogleId } = req.body;

    let googleId, email, name;

    if (credential) {
      // ── ID token flow (preferred) — verify server-side ──────────
      const { OAuth2Client } = require("google-auth-library");
      const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

      let payload;
      try {
        const ticket = await client.verifyIdToken({
          idToken: credential,
          audience: process.env.GOOGLE_CLIENT_ID
        });
        payload = ticket.getPayload();
      } catch {
        return res.status(401).json({ message: "Invalid Google credential" });
      }
      googleId = payload.sub;
      email    = payload.email;
      name     = payload.name;
    } else if (legacyEmail && legacyGoogleId) {
      // ── Access-token flow (userinfo already fetched on frontend) ─
      googleId = legacyGoogleId;
      email    = legacyEmail;
      name     = legacyName;
    } else {
      return res.status(400).json({ message: "Google credential or user info is required" });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({ message: "Invalid email from Google" });
    }

    const userRole = role === "business" ? "business" : "student";
    const Model = userRole === "business" ? Business : Student;

    // Check both collections for existing user (email or googleId)
    let user = await Model.findOne({ $or: [{ email }, { googleId }] });
    let isNewUser = false;

    if (user) {
      // Link googleId if not already linked
      if (!user.googleId) {
        user.googleId = googleId;
        user.provider = "google";
        user.isVerified = true;
        await user.save();
      }
    } else {
      // Check the other collection — user might exist as different role
      const OtherModel = userRole === "business" ? Student : Business;
      const otherUser = await OtherModel.findOne({ email });
      if (otherUser) {
        // User exists in other role — log them in with their existing role
        const existingRole = userRole === "business" ? "student" : "business";
        const token = jwt.sign(
          { id: otherUser._id, role: existingRole },
          process.env.JWT_SECRET,
          { expiresIn: "7d" }
        );
        return res.status(200).json({
          message: "Google login successful",
          token,
          role: existingRole,
          user: sanitizeUser(otherUser, existingRole),
          isNewUser: false
        });
      }

      // Brand new user — create account
      isNewUser = true;
      const randomPassword = await bcrypt.hash(Math.random().toString(36) + Date.now(), 10);
      user = new Model({
        name: name || email.split("@")[0],
        email,
        password: randomPassword,
        googleId,
        provider: "google",
        isVerified: true   // Google accounts are pre-verified
      });
      await user.save();
    }

    const token = jwt.sign(
      { id: user._id, role: userRole },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.status(200).json({
      message: isNewUser ? "Account created with Google" : "Google login successful",
      token,
      role: userRole,
      user: sanitizeUser(user, userRole),
      isNewUser
    });
  } catch (error) {
    console.error("[Auth] Google auth error:", error.message);
    res.status(500).json({ message: "Server error" });
  }
};

// ─── NEW: Send Pre-Registration OTP ───────────────────────────────
// POST /api/auth/send-otp
// Body: { email }
// Sends a 6-digit OTP to verify email BEFORE the user fills the register form.
// Uses a lightweight in-memory store (Map) — no DB write needed at this stage.
// The OTP is stored server-side keyed by email with a 15-min expiry.
const preRegOtpStore = new Map(); // { email → { otp, expiry } }

exports.sendOtp = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: "Email is required" });
    if (!isValidEmail(email)) return res.status(400).json({ message: "Invalid email format" });

    // Check if email is already registered
    const existingStudent  = await Student.findOne({ email });
    const existingBusiness = await Business.findOne({ email });
    if (existingStudent || existingBusiness) {
      return res.status(409).json({ message: "An account with this email already exists. Please sign in." });
    }

    const otp    = generateOTP();
    const expiry = otpExpiry();
    preRegOtpStore.set(email.toLowerCase(), { otp, expiry });

    // Auto-clean after expiry to avoid memory leak
    setTimeout(() => preRegOtpStore.delete(email.toLowerCase()), 15 * 60 * 1000);

    // Always log OTP to server console (useful when email is not configured)
    console.log(`\n[OTP] ──────────────────────────────────`);
    console.log(`[OTP] Email : ${email}`);
    console.log(`[OTP] Code  : ${otp}`);
    console.log(`[OTP] ──────────────────────────────────\n`);

    // Try to send email — non-blocking, never fails the request
    const { sendVerificationEmail: sendOtpEmail } = require("../services/emailService");
    let emailSent = false;
    try {
      await sendOtpEmail(email, otp, "there");
      emailSent = true;
    } catch (emailErr) {
      console.error("[Auth] Email send failed:", emailErr.message);
    }

    // In development (no real email configured): return OTP in response
    // so the frontend can display it directly on screen.
    const isDevMode = process.env.NODE_ENV !== "production";
    const hasRealEmail = process.env.EMAIL_USER &&
      !process.env.EMAIL_USER.includes("your_email");

    res.status(200).json({
      message: emailSent
        ? "OTP sent to your email. It expires in 15 minutes."
        : "OTP generated. Check your server console for the code.",
      // Only expose OTP in response when email is not configured (dev only)
      ...(isDevMode && !hasRealEmail ? { devOtp: otp } : {})
    });
  } catch (error) {
    console.error("[sendOtp] Error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// ─── NEW: Verify Pre-Registration OTP ─────────────────────────────
// POST /api/auth/verify-otp
// Body: { email, otp }
// Returns a short-lived signed token that the register form uses to prove
// the email was verified — prevents direct access to /register/details.
exports.verifyOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) return res.status(400).json({ message: "Email and OTP are required" });

    const record = preRegOtpStore.get(email.toLowerCase());
    if (!record) {
      return res.status(400).json({ message: "OTP not found or already used. Please request a new one." });
    }
    if (record.otp !== otp) {
      return res.status(400).json({ message: "Invalid OTP. Please check and try again." });
    }
    if (record.expiry < new Date()) {
      preRegOtpStore.delete(email.toLowerCase());
      return res.status(400).json({ message: "OTP has expired. Please request a new one." });
    }

    // OTP is valid — remove it (single-use)
    preRegOtpStore.delete(email.toLowerCase());

    // Issue a short-lived "email verified" token so the frontend can prove
    // the email was checked without storing anything in the DB yet.
    const emailToken = jwt.sign(
      { email: email.toLowerCase(), purpose: "pre-register" },
      process.env.JWT_SECRET,
      { expiresIn: "30m" }
    );

    res.status(200).json({
      message: "Email verified. You can now complete your registration.",
      emailToken
    });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};
