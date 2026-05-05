const express = require("express");
const router = express.Router();
const { verifyToken } = require("../middleware/authMiddleware");
const {
  generateAiTest,
  generateMoreQuestions,
  getTest,
  addQuestion,
  updateQuestion,
  deleteQuestion,
  getTestForStudent,
  submitTest,
  getSubmissions,
  getStudentSubmission,
  getRankings
} = require("../controllers/testController");

// ── Business: generate AI test (replaces existing) ─────────────────────────
router.post("/generate",      verifyToken, generateAiTest);

// ── Business: generate suggestions only (does NOT save) ────────────────────
router.post("/generate-more", verifyToken, generateMoreQuestions);

// ── Business: full test management ─────────────────────────────────────────
router.get("/:jobId",                              verifyToken, getTest);
router.post("/:jobId/questions",                   verifyToken, addQuestion);
router.put("/:jobId/questions/:questionId",        verifyToken, updateQuestion);
router.delete("/:jobId/questions/:questionId",     verifyToken, deleteQuestion);

// ── Student: fetch test (no correct answers) ────────────────────────────────
router.get("/:jobId/student",                      verifyToken, getTestForStudent);

// ── Student: submit answers ─────────────────────────────────────────────────
router.post("/:jobId/submit",                      verifyToken, submitTest);

// ── Business: view submissions & rankings ──────────────────────────────────
router.get("/:jobId/submissions",                  verifyToken, getSubmissions);
router.get("/:jobId/submissions/:userId",          verifyToken, getStudentSubmission);
router.get("/:jobId/rankings",                     verifyToken, getRankings);

module.exports = router;
