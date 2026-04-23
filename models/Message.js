const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema({
  conversationId: {
    type: String,
    required: true,
    index: true
  },
  applicationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Application",
    required: true
  },
  jobId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Job",
    required: true
  },
  senderRole: {
    type: String,
    enum: ["student", "business", "system"],
    required: true
  },
  senderId: {
    type: mongoose.Schema.Types.ObjectId
  },
  senderName: {
    type: String,
    default: ""
  },
  text: {
    type: String,
    required: true
  }
}, { timestamps: true });

module.exports = mongoose.model("Message", messageSchema);

