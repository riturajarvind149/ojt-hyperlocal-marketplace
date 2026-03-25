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

  businessId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Business"
  },

  status: {
    type: String,
    default: "open"
  }

}, { timestamps: true });

module.exports = mongoose.model("Job", jobSchema);