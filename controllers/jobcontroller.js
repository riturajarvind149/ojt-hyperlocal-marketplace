// 📌 TOPIC: Job & Application Controller
// 📌 PURPOSE: Ye file handle karti hai job creation, job listing,
// student job apply aur business applications viewing

const Job = require("../models/Job");
const Application = require("../models/Application"); // ✅ ONLY ONCE

// =======================
// 📌 CREATE JOB
// 📌 PURPOSE: Business job create karega
// =======================
exports.createJob = async (req, res) => {
  try {

    const { title, description, budget } = req.body;

    const job = new Job({
      title,
      description,
      budget,
      businessId: req.user.id
    });

    await job.save();

    res.status(201).json({
      message: "Job created successfully",
      job
    });

  } catch (error) {
    console.log(error);
    res.status(500).json({
      message: "Server error"
    });
  }
};

// =======================
// 📌 GET ALL JOBS
// 📌 PURPOSE: Sab users jobs dekh sakte hain
// =======================
exports.getJobs = async (req, res) => {
  try {

    const jobs = await Job.find().populate("businessId", "name email");

    res.status(200).json(jobs);

  } catch (error) {
    console.log(error);
    res.status(500).json({
      message: "Server error"
    });
  }
};

// =======================
// 📌 APPLY JOB
// 📌 PURPOSE: Student job apply karega
// =======================
exports.applyJob = async (req, res) => {
  try {

    // 🔒 Sirf student apply kare
    if (req.user.role !== "student") {
      return res.status(403).json({
        message: "Only students can apply for jobs"
      });
    }

    const { jobId } = req.body;

    // 🔍 Already applied check
    const existingApplication = await Application.findOne({
      studentId: req.user.id,
      jobId
    });

    if (existingApplication) {
      return res.status(400).json({
        message: "Already applied to this job"
      });
    }

    // 🆕 Create application
    const application = new Application({
      studentId: req.user.id,
      jobId
    });

    await application.save();

    res.status(201).json({
      message: "Applied successfully",
      application
    });

  } catch (error) {
    console.log(error);
    res.status(500).json({
      message: "Server error"
    });
  }
};

// =======================
// 📌 GET APPLICATIONS (BUSINESS)
// 📌 PURPOSE: Business apne jobs ke applications dekhe
// =======================
exports.getApplications = async (req, res) => {
  try {

    // 🔒 Sirf business access
    if (req.user.role !== "business") {
      return res.status(403).json({
        message: "Only businesses can view applications"
      });
    }

    const applications = await Application.find()
      .populate("studentId", "name email")
      .populate({
        path: "jobId",
        match: { businessId: req.user.id },
        select: "title"
      });

    // ❗ Sirf valid jobs filter
    const filtered = applications.filter(app => app.jobId !== null);

    res.status(200).json(filtered);

  } catch (error) {
    console.log(error);
    res.status(500).json({
      message: "Server error"
    });
  }
};