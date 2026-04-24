const express = require("express");
const router = express.Router();
const { verifyToken } = require("../middleware/authMiddleware");
const {
  generateTest,
  getTest,
  submitTest,
  getHybridRankings
} = require("../controllers/aiController");

// Business: generate AI test for a job
router.post("/generate-test", verifyToken, generateTest);

// Student: get test questions for a job they applied to
router.get("/test/:jobId", verifyToken, getTest);

// Student: submit test answers
router.post("/test/submit", verifyToken, submitTest);

// Business: get hybrid rankings for a job
router.get("/rankings/:jobId", verifyToken, getHybridRankings);

module.exports = router;
