const mongoose = require("mongoose");

const applicationSchema = new mongoose.Schema({
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: "Student" },
  jobId:     { type: mongoose.Schema.Types.ObjectId, ref: "Job" },

  status: {
    type: String,
    enum: ["pending", "test_pending", "approved", "rejected", "in_progress", "completed"],
    default: "pending"
  },

  // Legacy simulated scores (kept)
  testScore:    { type: Number, default: 0 },
  timeTaken:    { type: Number, default: 0 },
  rankingScore: { type: Number, default: 0 },
  notes:        { type: String, default: "" },
  matchedSkills: { type: [String], default: [] },
  conversationId: { type: String, default: "" },
  testResult: {
    attemptedAt: Date,
    totalQuestions: { type: Number, default: 0 },
    correctAnswers: { type: Number, default: 0 },
    breakdown: [{ skill: String, score: Number }]
  },

  // NEW: Hybrid AI test scores
  skillMatchScore: { type: Number, default: 0 },  // overlapRatio * 100
  realTestScore:   { type: Number, default: 0 },  // (correct/total) * 100
  finalScore:      { type: Number, default: 0 },  // hybrid formula
  testSubmitted:   { type: Boolean, default: false },
  realTestResult: {
    submittedAt: Date,
    totalQuestions: { type: Number, default: 0 },
    correctAnswers: { type: Number, default: 0 },
    timeTakenMinutes: { type: Number, default: 0 },
    answers: [{ questionIndex: Number, selected: String, correct: Boolean }]
  },

  // Category-direct application (no job required)
  categoryMeta: {
    category:       { type: String, default: "" },
    availability:   { type: String, default: "flexible" },
    expectedSalary: { type: String, default: "" },
    note:           { type: String, default: "" }
  }

}, { timestamps: true });

module.exports = mongoose.model("Application", applicationSchema);
