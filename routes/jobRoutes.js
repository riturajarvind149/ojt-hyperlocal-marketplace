const express = require("express");
const router = express.Router();

const { verifyToken } = require("../middleware/authMiddleware");
const { createJob, getJobs, applyJob, getApplications } = require("../controllers/jobController");

// Create Job (Business)
router.post("/", verifyToken, createJob);

// Get All Jobs
router.get("/", getJobs);

// Apply job
router.post("/apply", verifyToken, applyJob);

// Get applications for a job (Business)
router.get("/applications", verifyToken, getApplications);

module.exports = router;