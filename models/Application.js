const mongoose = require("mongoose");

const applicationSchema = new mongoose.Schema({
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Student"
  },
  jobId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Job"
  },
  status: {
    type: String,
    enum: ["pending", "approved", "rejected", "in_progress", "completed"],
    default: "pending"
  },
  testScore: {
    type: Number,
    default: 0
  },
  timeTaken: {
    type: Number,
    default: 0
  },
  rankingScore: {
    type: Number,
    default: 0
  },
  notes: {
    type: String,
    default: ""
  },
  matchedSkills: {
    type: [String],
    default: []
  },
  conversationId: {
    type: String,
    default: ""
  },
  testResult: {
    attemptedAt: Date,
    totalQuestions: {
      type: Number,
      default: 0
    },
    correctAnswers: {
      type: Number,
      default: 0
    },
    breakdown: [
      {
        skill: String,
        score: Number
      }
    ]
  }
}, { timestamps: true });

module.exports = mongoose.model("Application", applicationSchema);

