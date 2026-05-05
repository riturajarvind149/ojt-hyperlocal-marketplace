/**
 * accountController.js
 * Handles: Change Password (with old password OR OTP), Change Email (OTP to new email)
 * All routes require verifyToken middleware — user must be logged in.
 */

const bcrypt = require("bcrypt");
const Student  = require("../models/Student");
const Business = require("../models/Business");
const { sendVerificationEmail, sendPasswordResetEmail } = require("../services/emailService");

// ─── Helpers ──────────────────────────────────────────────────────

function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/** 5-minute OTP expiry for account settings (shorter than registration) */
function shortOtpExpiry() {
  return new Date(Date.now() + 5 * 60 * 1000);
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").toLowerCase());
}

function isStrongPassword(password) {
  return typeof password === "string" &&
    password.length >= 8 &&
    /[a-zA-Z]/.test(password) &&
    /\d/.test(password);
}

/** Fetch the logged-in user from DB based on JWT payload */
async function getUser(req) {
  if (!req.user?.id || !req.user?.role) return null;
  if (req.user.role === "business") return Business.findById(req.user.id);
  return Student.findById(req.user.id);
}

// ─── POST /api/auth/change-password ──────────────────────────────
// Change password using the current (old) password.
// Body: { oldPassword, newPassword, confirmPassword }
exports.changePassword = async (req, res) => {
  try {
    const { oldPassword, newPassword, confirmPassword } = req.body;

    if (!oldPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({ message: "All fields are required" });
    }
    if (newPassword !== confirmPassword) {
      return res.status(400).json({ message: "New passwords do not match" });
    }
    if (!isStrongPassword(newPassword)) {
      return res.status(400).json({ message: "Password must be at least 8 characters with letters and numbers" });
    }

    const user = await getUser(req);
    if (!user) return res.status(404).json({ message: "User not found" });

    // Google-only accounts have no password
    if (user.provider === "google" && !user.password) {
      return res.status(400).json({ message: "Google accounts cannot use password change. Use OTP flow." });
    }

    const isMatch = await bcrypt.compare(oldPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Old password is incorrect" });
    }

    // Prevent reusing the same password
    const isSame = await bcrypt.compare(newPassword, user.password);
    if (isSame) {
      return res.status(400).json({ message: "New password must be different from the current password" });
    }

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();

    console.log(`[Account] Password changed for user ${user.email}`);
    res.status(200).json({ message: "Password updated successfully" });
  } catch (error) {
    console.error("[changePassword]", error.message);
    res.status(500).json({ message: "Server error" });
  }
};

// ─── POST /api/auth/send-password-otp ────────────────────────────
// Send OTP to the user's CURRENT email for password reset (forgot old password).
// No body required — uses JWT to identify the user.
exports.sendPasswordOtp = async (req, res) => {
  try {
    const user = await getUser(req);
    if (!user) return res.status(404).json({ message: "User not found" });

    const otp = generateOTP();
    user.otp = otp;
    user.otpExpiry = shortOtpExpiry();
    await user.save();

    console.log(`\n[OTP] Password reset OTP for ${user.email}: ${otp}\n`);

    try {
      await sendPasswordResetEmail(user.email, otp, user.name);
    } catch (emailErr) {
      console.error("[sendPasswordOtp] Email failed:", emailErr.message);
    }

    res.status(200).json({
      message: `OTP sent to ${user.email}. It expires in 5 minutes.`
    });
  } catch (error) {
    console.error("[sendPasswordOtp]", error.message);
    res.status(500).json({ message: "Server error" });
  }
};

// ─── POST /api/auth/verify-password-otp ──────────────────────────
// Verify OTP and set new password (forgot-password flow inside settings).
// Body: { otp, newPassword, confirmPassword }
exports.verifyPasswordOtp = async (req, res) => {
  try {
    const { otp, newPassword, confirmPassword } = req.body;

    if (!otp || !newPassword || !confirmPassword) {
      return res.status(400).json({ message: "OTP and new password fields are required" });
    }
    if (newPassword !== confirmPassword) {
      return res.status(400).json({ message: "Passwords do not match" });
    }
    if (!isStrongPassword(newPassword)) {
      return res.status(400).json({ message: "Password must be at least 8 characters with letters and numbers" });
    }

    const user = await getUser(req);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (!user.otp || user.otp !== String(otp).trim()) {
      return res.status(400).json({ message: "Invalid OTP" });
    }
    if (!user.otpExpiry || user.otpExpiry < new Date()) {
      user.otp = undefined;
      user.otpExpiry = undefined;
      await user.save();
      return res.status(400).json({ message: "OTP has expired. Please request a new one." });
    }

    user.password = await bcrypt.hash(newPassword, 10);
    user.otp = undefined;
    user.otpExpiry = undefined;
    await user.save();

    console.log(`[Account] Password reset via OTP for ${user.email}`);
    res.status(200).json({ message: "Password updated successfully" });
  } catch (error) {
    console.error("[verifyPasswordOtp]", error.message);
    res.status(500).json({ message: "Server error" });
  }
};

// ─── POST /api/auth/send-email-otp ───────────────────────────────
// Send OTP to the NEW email address the user wants to switch to.
// Body: { newEmail }
// CRITICAL: OTP goes to the NEW email, old email is NOT changed yet.
exports.sendEmailOtp = async (req, res) => {
  try {
    const { newEmail } = req.body;

    if (!newEmail || !isValidEmail(newEmail)) {
      return res.status(400).json({ message: "A valid new email address is required" });
    }

    const user = await getUser(req);
    if (!user) return res.status(404).json({ message: "User not found" });

    const normalizedNew = newEmail.toLowerCase().trim();

    // Cannot change to the same email
    if (normalizedNew === user.email.toLowerCase()) {
      return res.status(400).json({ message: "New email must be different from your current email" });
    }

    // Check if new email is already taken by another account
    const existingStudent  = await Student.findOne({ email: normalizedNew });
    const existingBusiness = await Business.findOne({ email: normalizedNew });
    if (existingStudent || existingBusiness) {
      return res.status(409).json({ message: "This email is already registered to another account" });
    }

    const otp = generateOTP();
    // Store OTP and the pending new email — do NOT update user.email yet
    user.otp = otp;
    user.otpExpiry = shortOtpExpiry();
    user.pendingEmail = normalizedNew;
    await user.save();

    console.log(`\n[OTP] Email change OTP for ${normalizedNew}: ${otp}\n`);

    // Send OTP to the NEW email (not the old one)
    try {
      await sendVerificationEmail(normalizedNew, otp, user.name);
    } catch (emailErr) {
      console.error("[sendEmailOtp] Email failed:", emailErr.message);
    }

    res.status(200).json({
      message: `OTP sent to ${normalizedNew}. Verify to complete the email change.`
    });
  } catch (error) {
    console.error("[sendEmailOtp]", error.message);
    res.status(500).json({ message: "Server error" });
  }
};

// ─── POST /api/auth/verify-email-otp ─────────────────────────────
// Verify OTP and commit the email change.
// Body: { otp }
// Only updates user.email if OTP is correct and not expired.
exports.verifyEmailOtp = async (req, res) => {
  try {
    const { otp } = req.body;

    if (!otp) return res.status(400).json({ message: "OTP is required" });

    const user = await getUser(req);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (!user.pendingEmail) {
      return res.status(400).json({ message: "No pending email change found. Please start the process again." });
    }
    if (!user.otp || user.otp !== String(otp).trim()) {
      return res.status(400).json({ message: "Invalid OTP" });
    }
    if (!user.otpExpiry || user.otpExpiry < new Date()) {
      user.otp = undefined;
      user.otpExpiry = undefined;
      user.pendingEmail = undefined;
      await user.save();
      return res.status(400).json({ message: "OTP has expired. Please start the process again." });
    }

    const newEmail = user.pendingEmail;

    // Final check: ensure new email is still not taken (race condition guard)
    const existingStudent  = await Student.findOne({ email: newEmail, _id: { $ne: user._id } });
    const existingBusiness = await Business.findOne({ email: newEmail, _id: { $ne: user._id } });
    if (existingStudent || existingBusiness) {
      user.otp = undefined;
      user.otpExpiry = undefined;
      user.pendingEmail = undefined;
      await user.save();
      return res.status(409).json({ message: "This email was just registered by another account. Please choose a different email." });
    }

    // Commit the email change
    const oldEmail = user.email;
    user.email = newEmail;
    user.pendingEmail = undefined;
    user.otp = undefined;
    user.otpExpiry = undefined;
    await user.save();

    console.log(`[Account] Email changed: ${oldEmail} → ${newEmail}`);

    res.status(200).json({
      message: "Email updated successfully",
      newEmail
    });
  } catch (error) {
    console.error("[verifyEmailOtp]", error.message);
    res.status(500).json({ message: "Server error" });
  }
};
