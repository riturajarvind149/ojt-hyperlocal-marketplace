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

// =======================
// 📌 TOPIC: Update Application Status
// 📌 PURPOSE: Business application ko accept ya reject kar sakta hai
// =======================

exports.updateApplicationStatus = async (req, res) => {
  try {

    // 🔒 Sirf business access kare
    if (req.user.role !== "business") {
      return res.status(403).json({
        message: "Only businesses can update application status"
      });
    }

    const { applicationId, status } = req.body;

    // ❗ VALIDATION (VERY IMPORTANT)
    if (!applicationId || !status) {
      return res.status(400).json({
        message: "applicationId and status are required"
      });
    }

    // ❗ Status check
    if (!["accepted", "rejected"].includes(status)) {
      return res.status(400).json({
        message: "Status must be 'accepted' or 'rejected'"
      });
    }

    // 🔍 Find application
    const application = await Application.findById(applicationId);

    if (!application) {
      return res.status(404).json({
        message: "Application not found"
      });
    }

    // ✅ Status update
    application.status = status;

    await application.save();

    res.status(200).json({
      message: "Application status updated",
      application
    });

  } catch (error) {
    console.log(error); // 🔥 terminal me exact error dikhega
    res.status(500).json({
      message: "Server error"
    });
  }
};