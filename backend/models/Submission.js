const mongoose = require("mongoose");

const detailedResultSchema = new mongoose.Schema({
  questionId:     { type: mongoose.Schema.Types.ObjectId },
  questionIndex:  { type: Number },
  questionText:   { type: String, default: "" },
  selectedAnswer: { type: String, default: "" },
  correctAnswer:  { type: String, default: "" },
  isCorrect:      { type: Boolean, default: false },
  explanation:    { type: String, default: "" }
}, { _id: false });

const submissionSchema = new mongoose.Schema({
  userId:          { type: mongoose.Schema.Types.ObjectId, ref: "Student", required: true },
  jobId:           { type: mongoose.Schema.Types.ObjectId, ref: "Job", required: true },
  testId:          { type: mongoose.Schema.Types.ObjectId, ref: "Test" },
  applicationId:   { type: mongoose.Schema.Types.ObjectId, ref: "Application" },

  // Raw answers submitted
  answers: [{
    questionIndex:  { type: Number },
    questionId:     { type: mongoose.Schema.Types.ObjectId },
    selectedAnswer: { type: String, default: "" }
  }],

  // Scoring
  score:           { type: Number, default: 0 },  // correct answer count
  totalQuestions:  { type: Number, default: 0 },
  percentage:      { type: Number, default: 0 },  // (score/total)*100
  timeTakenMinutes:{ type: Number, default: 0 },

  // Detailed per-question results
  detailedResults: { type: [detailedResultSchema], default: [] },

  submittedAt:     { type: Date, default: Date.now }
}, { timestamps: true });

// Prevent duplicate submissions
submissionSchema.index({ userId: 1, jobId: 1 }, { unique: true });

module.exports = mongoose.model("Submission", submissionSchema);
