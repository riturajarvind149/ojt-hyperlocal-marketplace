const mongoose = require("mongoose");

const jobSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true
  },
  description: {
    type: String,
    required: true
  },
  budget: {
    type: Number,
    required: true
  },
  location: {
    type: String,
    default: ""
  },
  skills: {
    type: [String],
    default: []
  },
  teamBased: {
    type: Boolean,
    default: false
  },
  hiringMode: {
    type: String,
    enum: ["individual", "team"],
    default: "individual"
  },
  businessId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Business"
  },
  status: {
    type: String,
    enum: ["open", "in_progress", "completed"],
    default: "open"
  },
  selectedApplicationIds: {
    type: [mongoose.Schema.Types.ObjectId],
    ref: "Application",
    default: []
  },
  selectedStudentIds: {
    type: [mongoose.Schema.Types.ObjectId],
    ref: "Student",
    default: []
  },
  generatedTest: {
    summary: {
      type: String,
      default: ""
    },
    skills: {
      type: [String],
      default: []
    },
    questions: [
      {
        skill: String,
        prompt: String,
        options: [String],
        answer: String
      }
    ]
  }
}, { timestamps: true });

module.exports = mongoose.model("Job", jobSchema);
