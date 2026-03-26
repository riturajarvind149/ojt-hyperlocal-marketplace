// 📌 TOPIC: Application Model
// 📌 PURPOSE: Ye model store karta hai jab koi student kisi job ke liye apply karta hai

const mongoose = require("mongoose");

const applicationSchema = new mongoose.Schema({

  // Student ka ID (kisne apply kiya)
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Student"
  },

  // Job ka ID (kis job pe apply kiya)
  jobId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Job"
  },

  // Application status (default: pending)
  status: {
    type: String,
    default: "pending"
  }

}, { timestamps: true });

module.exports = mongoose.model("Application", applicationSchema);