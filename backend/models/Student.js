const mongoose = require("mongoose");

const StudentSchema = new mongoose.Schema({
  name:     { type: String, required: true },
  email:    { type: String, required: true, unique: true },
  password: { type: String, required: true },
  phone:    { type: String },
  college:  { type: String },
  location: { type: String },
  bio:      { type: String },
  skills:   { type: [String], default: [] },
  // Job type preference: online | offline | both
  jobTypePreference: {
    type: String,
    enum: ["online", "offline", "both"],
    default: "both"
  },

  // ── Auth extensions (email verification + password reset) ──────
  isVerified:        { type: Boolean, default: false },
  verificationToken: { type: String },
  tokenExpiry:       { type: Date },

  // ── Account settings: OTP + pending email change ───────────────
  otp:               { type: String },
  otpExpiry:         { type: Date },
  pendingEmail:      { type: String },

  // ── Optional phone field (already existed, kept for OTP use) ───
  // phone is already defined above

  // ── Optional Google OAuth ──────────────────────────────────────
  googleId:          { type: String },

  // ── Auth provider: local | google | facebook ──────────────────
  provider:          { type: String, default: "local" }
}, { timestamps: true });

module.exports = mongoose.model("Student", StudentSchema);
