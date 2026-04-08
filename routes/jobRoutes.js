const express = require("express");
const router = express.Router();

const { verifyToken } = require("../middleware/authMiddleware");

const { 
  createJob, 
  getJobs, 
  applyJob, 
  getApplications,
  getStudentApplications   // 👈 added
} = require("../controllers/jobController");

const { updateApplicationStatus } = require("../controllers/jobController");

// Create Job (Business)
router.post("/", verifyToken, createJob);

// Get All Jobs
router.get("/", getJobs);

// Apply job
router.post("/apply", verifyToken, applyJob);

// Get applications for a job (Business)
router.get("/applications", verifyToken, getApplications);

// ✅ NEW: Get student applications
router.get("/my-applications", verifyToken, getStudentApplications);

// Update application status (Business)
router.put("/application-status", verifyToken, updateApplicationStatus);

module.exports = router;