const mongoose = require("mongoose");

const questionSchema = new mongoose.Schema({
  question:      { type: String, required: true },
  options:       { type: [String], required: true },
  correctAnswer: { type: String, required: true },
  explanation:   { type: String, default: "" },
  type:          { type: String, enum: ["mcq", "text", "code"], default: "mcq" }
}, { _id: true });

const testSchema = new mongoose.Schema({
  jobId:       { type: mongoose.Schema.Types.ObjectId, ref: "Job", required: true, unique: true },
  createdBy:   { type: mongoose.Schema.Types.ObjectId, ref: "Business", required: true },
  topic:       { type: String, default: "" },
  difficulty:  { type: String, enum: ["easy", "medium", "hard"], default: "medium" },
  timeLimit:   { type: Number, default: 15 }, // minutes
  questions:   { type: [questionSchema], default: [] },
  isActive:    { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model("Test", testSchema);
