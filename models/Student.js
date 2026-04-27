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
  }
}, { timestamps: true });

module.exports = mongoose.model("Student", StudentSchema);
