const mongoose = require("mongoose");

const jobSchema = new mongoose.Schema({
  title:       { type: String, required: true },
  description: { type: String, required: true },
  budget:      { type: Number, required: true },
  location:    { type: String, default: "" },
  skills:      { type: [String], default: [] },
  teamBased:   { type: Boolean, default: false },
  hiringMode:  { type: String, enum: ["individual", "team"], default: "individual" },

  // Unified mode: online | offline | both
  mode:        { type: String, enum: ["online", "offline", "both"], default: "online" },
  // Keep isOffline for backward compat — synced with mode
  isOffline:   { type: Boolean, default: false },
  // Category for local services grouping
  category:    { type: String, default: "" },

  businessId: { type: mongoose.Schema.Types.ObjectId, ref: "Business" },
  status:     { type: String, enum: ["open", "in_progress", "completed"], default: "open" },
  selectedApplicationIds: { type: [mongoose.Schema.Types.ObjectId], ref: "Application", default: [] },
  selectedStudentIds:     { type: [mongoose.Schema.Types.ObjectId], ref: "Student",      default: [] },

  // Legacy simulated test
  generatedTest: {
    summary:   { type: String, default: "" },
    skills:    { type: [String], default: [] },
    questions: [{ skill: String, prompt: String, options: [String], answer: String }]
  },

  // Real AI-generated test
  aiTest: {
    generated:  { type: Boolean, default: false },
    topic:      { type: String, default: "" },
    difficulty: { type: String, enum: ["easy", "medium", "hard"], default: "medium" },
    timeLimit:  { type: Number, default: 15 },
    questions:  [{
      question:      { type: String, required: true },
      options:       { type: [String], required: true },
      correctAnswer: { type: String, required: true },
      type:          { type: String, default: "MCQ" }
    }]
  }
}, { timestamps: true });

module.exports = mongoose.model("Job", jobSchema);
