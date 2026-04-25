const Job = require("../models/Job");
const Application = require("../models/Application");
const Message = require("../models/Message");
const Student = require("../models/Student");
const Business = require("../models/Business");
const {
  buildTeamSuggestions,
  generateSkillTest,
  simulateCandidateAssessment,
  uniqueSkills
} = require("../utils/simulatedHiring");

async function findJobForBusiness(jobId, businessId) {
  return Job.findOne({ _id: jobId, businessId });
}

async function findApplicationForUser(applicationId, user) {
  let application;
  try {
    application = await Application.findById(applicationId)
      .populate("studentId", "name email skills")
      .populate({
        path: "jobId",
        populate: {
          path: "businessId",
          select: "name email location businessType"
        }
      });
  } catch {
    return null;
  }

  if (!application || !application.jobId) return null;

  const studentOwnerId = String(application.studentId?._id || application.studentId || "");
  const businessOwnerId = String(application.jobId?.businessId?._id || application.jobId?.businessId || "");
  const requesterId = String(user.id || "");

  const isStudentOwner = user.role === "student" && studentOwnerId === requesterId;
  const isBusinessOwner = user.role === "business" && businessOwnerId === requesterId;

  if (!isStudentOwner && !isBusinessOwner) return null;
  return application;
}

function formatApplication(application) {
  const job = application.jobId || {};
  const student = application.studentId || {};

  return {
    _id: application._id,
    status: application.status,
    testScore: application.testScore || 0,
    timeTaken: application.timeTaken || 0,
    rankingScore: application.rankingScore || 0,
    notes: application.notes || "",
    matchedSkills: application.matchedSkills || [],
    conversationId: application.conversationId || "",
    testResult: application.testResult || null,
    createdAt: application.createdAt,
    updatedAt: application.updatedAt,
    studentId: student && student._id ? {
      _id: student._id,
      name: student.name,
      email: student.email,
      skills: student.skills || []
    } : application.studentId,
    jobId: job && job._id ? {
      _id: job._id,
      title: job.title,
      budget: job.budget,
      location: job.location,
      skills: job.skills || [],
      status: job.status,
      teamBased: job.teamBased,
      mode: job.mode || "online",
      isOffline: job.isOffline || false,
      category: job.category || "",
      businessId: job.businessId
    } : application.jobId
  };
}

exports.createJob = async (req, res) => {
  try {
    if (req.user.role !== "business") {
      return res.status(403).json({ message: "Only businesses can create jobs" });
    }

    const { title, description, budget, location, skills, teamBased, isOffline, mode, category } = req.body;

    if (!title || !String(title).trim()) {
      return res.status(400).json({ message: "Job title is required" });
    }
    if (!description || !String(description).trim()) {
      return res.status(400).json({ message: "Job description is required" });
    }
    const parsedBudget = Number(budget);
    if (!budget || isNaN(parsedBudget) || parsedBudget <= 0) {
      return res.status(400).json({ message: "A valid budget is required" });
    }

    const normalizedSkills = uniqueSkills(Array.isArray(skills) ? skills : []);
    const isTeamBased = Boolean(teamBased);
    const generatedTest = generateSkillTest(normalizedSkills);

    // Resolve mode — support both old isOffline flag and new mode field
    const resolvedMode = ["online", "offline", "both"].includes(mode) ? mode : (Boolean(isOffline) ? "offline" : "online");

    const job = new Job({
      title: String(title).trim(),
      description: String(description).trim(),
      budget: parsedBudget,
      location: location ? String(location).trim() : "",
      skills: normalizedSkills,
      teamBased: isTeamBased,
      hiringMode: isTeamBased ? "team" : "individual",
      mode: resolvedMode,
      isOffline: resolvedMode === "offline" || resolvedMode === "both",
      category: category ? String(category).trim().toLowerCase() : "",
      businessId: req.user.id,
      generatedTest
    });

    await job.save();

    const populatedJob = await Job.findById(job._id).populate("businessId", "name location businessType");

    res.status(201).json({
      message: "Job created successfully",
      job: populatedJob
    });
  } catch (error) {
    console.error("createJob error:", error.message);
    if (error.name === "ValidationError") {
      const messages = Object.values(error.errors).map((e) => e.message).join(", ");
      return res.status(400).json({ message: messages });
    }
    res.status(500).json({ message: "Server error: " + error.message });
  }
};

exports.getJobs = async (req, res) => {
  try {
    const filter = {};
    // ?mode=online | offline | both
    if (req.query.mode && ["online", "offline", "both"].includes(req.query.mode)) {
      if (req.query.mode === "offline") {
        filter.$or = [{ mode: "offline" }, { mode: "both" }, { isOffline: true }];
      } else if (req.query.mode === "online") {
        filter.$or = [{ mode: "online" }, { mode: "both" }, { isOffline: { $ne: true } }];
      }
    }
    // ?category=maid | cook | etc.
    if (req.query.category) {
      filter.category = { $regex: new RegExp(req.query.category, "i") };
    }
    // ?search=keyword
    if (req.query.search) {
      const re = new RegExp(req.query.search, "i");
      filter.$and = filter.$and || [];
      filter.$and.push({ $or: [{ title: re }, { description: re }, { skills: re }, { category: re }, { location: re }] });
    }

    const jobs = await Job.find(filter)
      .populate("businessId", "name email location businessType")
      .sort({ createdAt: -1 });

    res.status(200).json(jobs);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

exports.applyJob = async (req, res) => {
  try {
    if (req.user.role !== "student") {
      return res.status(403).json({ message: "Only students can apply for jobs" });
    }

    const { jobId } = req.body;
    if (!jobId) {
      return res.status(400).json({ message: "jobId is required" });
    }

    const job = await Job.findById(jobId);
    const student = await Student.findById(req.user.id);

    if (!job) {
      return res.status(404).json({ message: "Job not found" });
    }

    if (!student) {
      return res.status(404).json({ message: "Student not found" });
    }

    if (job.status !== "open") {
      return res.status(400).json({ message: "This job is no longer accepting applications" });
    }

    const existingApplication = await Application.findOne({ studentId: req.user.id, jobId });
    if (existingApplication) {
      return res.status(400).json({ message: "You have already applied to this job" });
    }

    const assessment = simulateCandidateAssessment({
      studentSkills: student.skills || [],
      jobSkills: job.skills || [],
      jobId: String(job._id),
      studentId: String(student._id)
    });

    const conversationId = `job-${job._id}-student-${student._id}`;
    const application = new Application({
      studentId: req.user.id,
      jobId,
      conversationId,
      testScore: assessment.testScore,
      timeTaken: assessment.timeTaken,
      rankingScore: assessment.rankingScore,
      matchedSkills: assessment.matchedSkills,
      skillMatchScore: Math.round((assessment.matchedSkills.length / Math.max(job.skills.length, 1)) * 100),
      status: job.aiTest?.generated ? "test_pending" : "pending",
      notes: assessment.matchedSkills.length
        ? `Matched skills: ${assessment.matchedSkills.join(", ")}`
        : "Strong interest shown. Assessment score generated from foundational skills.",
      testResult: {
        attemptedAt: new Date(),
        totalQuestions: assessment.totalQuestions,
        correctAnswers: assessment.correctAnswers,
        breakdown: assessment.breakdown
      }
    });

    await application.save();

    const business = await Business.findById(job.businessId);
    const hasAiTest = job.aiTest?.generated && job.aiTest.questions?.length > 0;
    await Message.create([
      {
        conversationId,
        applicationId: application._id,
        jobId: job._id,
        senderRole: "system",
        senderName: "LocalHire AI",
        text: hasAiTest
          ? `Application received. Please complete the skill test to be ranked. Go to My Applications → Take Test.`
          : `Application received. Simulated skill test completed with score ${assessment.testScore}.`
      },
      {
        conversationId,
        applicationId: application._id,
        jobId: job._id,
        senderRole: "business",
        senderId: job.businessId,
        senderName: business?.name || "Business",
        text: `Thanks for applying to ${job.title}. ${hasAiTest ? "Please complete the skill test to be considered." : "We'll review your assessment and get back to you soon."}`
      }
    ]);

    const populatedApplication = await Application.findById(application._id)
      .populate("studentId", "name email skills")
      .populate({
        path: "jobId",
        populate: {
          path: "businessId",
          select: "name email location businessType"
        }
      });

    res.status(201).json({
      message: "Applied successfully",
      hasAiTest: !!(job.aiTest?.generated && job.aiTest.questions?.length),
      application: formatApplication(populatedApplication)
    });
  } catch (error) {
    console.error("applyJob error:", error.message);
    res.status(500).json({ message: "Server error: " + error.message });
  }
};

exports.getApplications = async (req, res) => {
  try {
    if (req.user.role !== "business") {
      return res.status(403).json({ message: "Only businesses can view applications" });
    }

    // First get all job IDs belonging to this business
    const businessJobs = await Job.find({ businessId: req.user.id }).select("_id");
    const jobIds = businessJobs.map((job) => job._id);

    const applications = await Application.find({ jobId: { $in: jobIds } })
      .populate("studentId", "name email skills")
      .populate({
        path: "jobId",
        populate: {
          path: "businessId",
          select: "name location businessType"
        }
      })
      .sort({ rankingScore: -1, createdAt: -1 });

    res.status(200).json(applications.map(formatApplication));
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

exports.updateApplicationStatus = async (req, res) => {
  try {
    if (req.user.role !== "business") {
      return res.status(403).json({ message: "Only businesses can update application status" });
    }

    const { applicationId, status } = req.body;
    if (!applicationId || !status) {
      return res.status(400).json({ message: "applicationId and status are required" });
    }

    if (!["approved", "rejected", "in_progress", "completed"].includes(status)) {
      return res.status(400).json({ message: "Invalid status transition" });
    }

    const application = await Application.findById(applicationId).populate("jobId");
    if (!application) {
      return res.status(404).json({ message: "Application not found" });
    }

    if (!application.jobId || String(application.jobId.businessId) !== String(req.user.id)) {
      return res.status(403).json({ message: "You cannot update this application" });
    }

    application.status = status;
    await application.save();

    const job = await Job.findById(application.jobId._id);
    if (status === "in_progress") {
      job.status = "in_progress";
      job.selectedApplicationIds = [application._id];
      job.selectedStudentIds = [application.studentId];
      await job.save();
    }

    if (status === "completed") {
      job.status = "completed";
      await job.save();
    }

    res.status(200).json({
      message: "Application status updated",
      application
    });
  } catch (error) {
    console.error("updateApplicationStatus error:", error.message);
    res.status(500).json({ message: "Server error: " + error.message });
  }
};

exports.getStudentApplications = async (req, res) => {
  try {
    if (req.user.role !== "student") {
      return res.status(403).json({ message: "Only students can view their applications" });
    }

    const applications = await Application.find({ studentId: req.user.id })
      .populate({
        path: "jobId",
        select: "_id title budget location skills status teamBased businessId isOffline",
        populate: {
          path: "businessId",
          select: "name location businessType"
        }
      })
      .sort({ createdAt: -1 });

    // Filter out applications where the job was deleted (jobId is null after populate)
    const valid = applications.filter((app) => app.jobId && app.jobId._id);

    res.status(200).json(valid.map(formatApplication));
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

exports.getRankedCandidates = async (req, res) => {
  try {
    if (req.user.role !== "business") {
      return res.status(403).json({ message: "Only businesses can view rankings" });
    }

    const job = await findJobForBusiness(req.params.jobId, req.user.id);
    if (!job) {
      return res.status(404).json({ message: "Job not found" });
    }

    const applications = await Application.find({ jobId: job._id })
      .populate("studentId", "name email skills")
      .sort({ rankingScore: -1, testScore: -1, timeTaken: 1 });

    const candidates = applications.map((application, index) => ({
      rank: index + 1,
      ...formatApplication(application)
    }));

    res.status(200).json({
      job,
      topPerformers: candidates.slice(0, 3),
      candidates
    });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

exports.getTeamSuggestions = async (req, res) => {
  try {
    if (req.user.role !== "business") {
      return res.status(403).json({ message: "Only businesses can view team suggestions" });
    }

    const job = await findJobForBusiness(req.params.jobId, req.user.id);
    if (!job) {
      return res.status(404).json({ message: "Job not found" });
    }

    const applications = await Application.find({ jobId: job._id, status: { $ne: "rejected" } })
      .populate("studentId", "name email skills")
      .sort({ rankingScore: -1, testScore: -1 });

    res.status(200).json({
      job,
      suggestions: buildTeamSuggestions(applications, job.skills || [])
    });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

exports.selectTeam = async (req, res) => {
  try {
    if (req.user.role !== "business") {
      return res.status(403).json({ message: "Only businesses can hire candidates" });
    }

    const job = await findJobForBusiness(req.params.jobId, req.user.id);
    if (!job) {
      return res.status(404).json({ message: "Job not found" });
    }

    const applicationIds = Array.isArray(req.body.applicationIds) ? req.body.applicationIds : [];
    if (!applicationIds.length) {
      return res.status(400).json({ message: "applicationIds are required" });
    }

    const applications = await Application.find({ _id: { $in: applicationIds }, jobId: job._id });
    if (!applications.length) {
      return res.status(404).json({ message: "No matching applications found" });
    }

    await Application.updateMany(
      { _id: { $in: applications.map((application) => application._id) } },
      { $set: { status: "in_progress" } }
    );

    job.status = "in_progress";
    job.selectedApplicationIds = applications.map((application) => application._id);
    job.selectedStudentIds = applications.map((application) => application.studentId);
    await job.save();

    res.status(200).json({
      message: "Team selected successfully",
      selectedApplicationIds: job.selectedApplicationIds,
      selectedStudentIds: job.selectedStudentIds,
      jobStatus: job.status
    });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

exports.deleteJob = async (req, res) => {
  try {
    if (!req.user || req.user.role !== "business") {
      return res.status(403).json({ message: "Only businesses can delete jobs. Role received: " + (req.user?.role || "none") });
    }

    const job = await findJobForBusiness(req.params.jobId, req.user.id);
    if (!job) return res.status(404).json({ message: "Job not found or does not belong to you" });

    await Application.deleteMany({ jobId: job._id });
    await Message.deleteMany({ jobId: job._id });
    await Job.findByIdAndDelete(job._id);

    res.status(200).json({ message: "Job deleted successfully" });
  } catch (error) {
    console.error("deleteJob error:", error.message);
    res.status(500).json({ message: "Server error: " + error.message });
  }
};

exports.updateJob = async (req, res) => {
  try {
    if (req.user.role !== "business") {
      return res.status(403).json({ message: "Only businesses can edit jobs" });
    }

    const job = await findJobForBusiness(req.params.jobId, req.user.id);
    if (!job) return res.status(404).json({ message: "Job not found" });

    if (job.status !== "open") {
      return res.status(400).json({ message: "Cannot edit a job that is in progress or completed" });
    }

    const { title, description, budget, location, skills, teamBased } = req.body;
    if (title) job.title = title;
    if (description) job.description = description;
    if (budget) job.budget = Number(budget);
    if (location !== undefined) job.location = location;
    if (Array.isArray(skills)) {
      const normalizedSkills = uniqueSkills(skills);
      job.skills = normalizedSkills;
      job.generatedTest = generateSkillTest(normalizedSkills);
    }
    if (teamBased !== undefined) {
      job.teamBased = Boolean(teamBased);
      job.hiringMode = Boolean(teamBased) ? "team" : "individual";
    }

    await job.save();
    res.status(200).json({ message: "Job updated successfully", job });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

exports.getInbox = async (req, res) => {
  try {
    let applications = [];

    if (req.user.role === "student") {
      applications = await Application.find({ studentId: req.user.id })
        .populate({
          path: "jobId",
          populate: { path: "businessId", select: "name location businessType" }
        })
        .sort({ updatedAt: -1 });
    } else {
      const businessJobs = await Job.find({ businessId: req.user.id }).select("_id");
      const jobIds = businessJobs.map((job) => job._id);
      applications = await Application.find({ jobId: { $in: jobIds } })
        .populate("studentId", "name email skills")
        .populate({
          path: "jobId",
          populate: { path: "businessId", select: "name location businessType" }
        })
        .sort({ updatedAt: -1 });
    }

    const inbox = await Promise.all(applications.map(async (application) => {
      let latestMessage = null;
      try {
        if (application.conversationId) {
          latestMessage = await Message.findOne({ conversationId: application.conversationId }).sort({ createdAt: -1 });
        }
      } catch {
        // ignore message fetch errors per conversation
      }
      return {
        applicationId: application._id,
        conversationId: application.conversationId || "",
        jobId: application.jobId?._id,
        jobTitle: application.jobId?.title || "Job",
        status: application.status,
        counterpart: req.user.role === "student"
          ? application.jobId?.businessId?.name || "Business"
          : application.studentId?.name || "Student",
        preview: latestMessage?.text || "No messages yet.",
        updatedAt: latestMessage?.createdAt || application.updatedAt,
        unreadCount: 0
      };
    }));

    res.status(200).json(inbox);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

exports.getConversationMessages = async (req, res) => {
  try {
    const application = await findApplicationForUser(req.params.applicationId, req.user);
    if (!application) {
      return res.status(404).json({ message: "Conversation not found" });
    }

    const messages = await Message.find({ conversationId: application.conversationId }).sort({ createdAt: 1 });
    res.status(200).json({
      conversationId: application.conversationId,
      application: formatApplication(application),
      messages
    });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

exports.sendConversationMessage = async (req, res) => {
  try {
    const application = await findApplicationForUser(req.params.applicationId, req.user);
    if (!application) {
      return res.status(404).json({ message: "Conversation not found or access denied" });
    }

    const text = String(req.body.text || "").trim();
    if (!text) {
      return res.status(400).json({ message: "Message text is required" });
    }

    const sender = req.user.role === "business"
      ? await Business.findById(req.user.id)
      : await Student.findById(req.user.id);

    const jobId = application.jobId?._id || application.jobId;

    const message = await Message.create({
      conversationId: application.conversationId,
      applicationId: application._id,
      jobId,
      senderRole: req.user.role,
      senderId: req.user.id,
      senderName: sender?.name || "User",
      text
    });

    res.status(201).json({
      message: "Message sent",
      data: message
    });
  } catch (error) {
    console.error("sendConversationMessage error:", error.message);
    res.status(500).json({ message: "Server error: " + error.message });
  }
};

