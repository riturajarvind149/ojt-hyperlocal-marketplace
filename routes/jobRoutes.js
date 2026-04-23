const express = require("express");
const router = express.Router();

const { verifyToken } = require("../middleware/authMiddleware");
const {
  createJob,
  getJobs,
  applyJob,
  getApplications,
  getStudentApplications,
  updateApplicationStatus,
  getRankedCandidates,
  getTeamSuggestions,
  selectTeam,
  getInbox,
  getConversationMessages,
  sendConversationMessage,
  deleteJob,
  updateJob
} = require("../controllers/jobcontroller");

router.post("/", verifyToken, createJob);
router.get("/", getJobs);
router.post("/apply", verifyToken, applyJob);
router.get("/applications", verifyToken, getApplications);
router.get("/my-applications", verifyToken, getStudentApplications);
router.put("/application-status", verifyToken, updateApplicationStatus);
router.get("/messages/inbox", verifyToken, getInbox);
router.get("/applications/:applicationId/messages", verifyToken, getConversationMessages);
router.post("/applications/:applicationId/messages", verifyToken, sendConversationMessage);
router.get("/:jobId/rankings", verifyToken, getRankedCandidates);
router.get("/:jobId/team-suggestions", verifyToken, getTeamSuggestions);
router.post("/:jobId/select-team", verifyToken, selectTeam);
router.put("/:jobId", verifyToken, updateJob);
router.delete("/:jobId", verifyToken, deleteJob);

module.exports = router;

