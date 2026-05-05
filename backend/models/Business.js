const mongoose = require("mongoose");

const businessSchema = new mongoose.Schema({

  name:{
    type:String,
    required:true
  },

  email:{
    type:String,
    required:true,
    unique:true
  },

  password:{
    type:String,
    required:true
  },

  phone:{
    type:String
  },

  businessType:{
    type:String
  },

  location:{
    type:String
  },

  bio:{
    type:String
  },

  // ── Auth extensions (email verification + password reset) ──────
  isVerified:        { type: Boolean, default: false },
  verificationToken: { type: String },
  tokenExpiry:       { type: Date },

  // ── Account settings: OTP + pending email change ───────────────
  otp:               { type: String },
  otpExpiry:         { type: Date },
  pendingEmail:      { type: String },

  // ── Optional Google OAuth ──────────────────────────────────────
  googleId:          { type: String },

  // ── Auth provider: local | google | facebook ──────────────────
  provider:          { type: String, default: "local" }

},{timestamps:true});

module.exports = mongoose.model("Business",businessSchema);
