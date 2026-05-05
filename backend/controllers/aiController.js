/**
 * aiController.js — Legacy AI routes (kept for backward compatibility)
 * New test management is in testController.js + /api/tests routes
 */

const Job = require("../models/Job");
const Application = require("../models/Application");
const Student = require("../models/Student");
const Test = require("../models/Test");
const Submission = require("../models/Submission");
const { generateTest: aiGenerateTest, generateFallbackQuestions } = require("../services/aiService");
const { uniqueSkills } = require("../services/simulatedHiring");

// ─── POST /api/ai/generate-test ───────────────────────────────────────────────
// Business generates AI test — delegates to aiService
exports.generateTest = async (req, res) => {
  try {
    if (req.user.role !== "business") {
      return res.status(403).json({ message: "Only businesses can generate tests" });
    }

    const { jobId, topic, difficulty = "medium", numberOfQuestions = 5 } = req.body;

    if (!jobId) return res.status(400).json({ message: "jobId is required" });

    const job = await Job.findOne({ _id: jobId, businessId: req.user.id });
    if (!job) return res.status(404).json({ message: "Job not found or access denied" });

    const n = Math.min(Math.max(Number(numberOfQuestions) || 5, 3), 20);
    const diff = ["easy", "medium", "hard"].includes(difficulty) ? difficulty : "medium";
    const testTopic = String(topic || job.title || "General").trim();

    console.log(`[aiController] Generating ${n} questions for "${job.title}" (${diff})`);

    let questions;
    try {
      questions = await aiGenerateTest({
        jobTitle: job.title,
        skills: job.skills || [],
        difficulty: diff,
        numberOfQuestions: n
      });
      console.log(`[aiController] AI generated ${questions.length} questions`);
    } catch (aiError) {
      console.error("[aiController] AI failed, using fallback:", aiError.message);
      questions = generateFallbackQuestions(job.title, job.skills || [], n);
    }

    if (!questions || questions.length === 0) {
      return res.status(500).json({ message: "Failed to generate questions" });
    }

    // Upsert Test document
    const test = await Test.findOneAndUpdate(
      { jobId },
      {
        jobId,
        createdBy: req.user.id,
        topic: testTopic,
        difficulty: diff,
        timeLimit: Math.max(n * 2, 10),
        questions,
        isActive: true
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    // Sync to Job.aiTest for backward compat
    job.aiTest = {
      generated: true,
      topic: testTopic,
      difficulty: diff,
      timeLimit: test.timeLimit,
      questions
    };
    await job.save();

    res.status(200).json({
      message: `AI test generated with ${test.questions.length} questions`,
      aiTest: {
        topic: test.topic,
        difficulty: test.difficulty,
        timeLimit: test.timeLimit,
        questionCount: test.questions.length
      }
    });
  } catch (error) {
    console.error("[aiController] generateTest error:", error.message);
    res.status(500).json({ message: "Server error: " + error.message });
  }
};

// ─── GET /api/ai/test/:jobId  (student fetches test) ─────────────────────────
exports.getTest = async (req, res) => {
  try {
    if (req.user.role !== "student") {
      return res.status(403).json({ message: "Only students can fetch tests" });
    }

    const job = await Job.findById(req.params.jobId).select("title aiTest generatedTest skills status");
    if (!job) return res.status(404).json({ message: "Job not found" });
    if (job.status !== "open") {
      return res.status(400).json({ message: "This job is no longer accepting applications" });
    }

    const application = await Application.findOne({ studentId: req.user.id, jobId: req.params.jobId });
    if (!application) {
      return res.status(403).json({ message: "You must apply to this job before taking the test" });
    }
    if (application.testSubmitted) {
      return res.status(400).json({ message: "You have already submitted this test" });
    }

    // Check Submission collection too
    const existingSubmission = await Submission.findOne({
      userId: req.user.id,
      jobId: req.params.jobId
    });
    if (existingSubmission) {
      return res.status(400).json({ message: "You have already submitted this test" });
    }

    let questions = [];
    let timeLimit = 15;
    let testId = null;
    let source = "simulated";

    // Prefer Test collection
    const test = await Test.findOne({ jobId: req.params.jobId, isActive: true });
    if (test && test.questions.length > 0) {
      questions = test.questions.map((q, i) => ({
        _id: q._id,
        index: i,
        question: q.question,
        options: q.options,
        type: q.type
      }));
      timeLimit = test.timeLimit;
      testId = test._id;
      source = "ai";
    } else if (job.aiTest?.generated && job.aiTest.questions?.length) {
      questions = job.aiTest.questions.map((q, i) => ({
        index: i,
        question: q.question,
        options: q.options,
        type: q.type || "mcq"
      }));
      timeLimit = job.aiTest.timeLimit || questions.length * 2;
      source = "ai";
    } else if (job.generatedTest?.questions?.length) {
      questions = job.generatedTest.questions.map((q, i) => ({
        index: i,
        question: q.prompt,
        options: q.options,
        type: "mcq"
      }));
      timeLimit = Math.max(10, questions.length * 2);
      source = "simulated";
    }

    if (!questions.length) {
      return res.status(404).json({ message: "No test available for this job yet" });
    }

    console.log(`[aiController] Serving ${questions.length} questions to student for job ${req.params.jobId}`);

    res.status(200).json({
      jobId: job._id,
      jobTitle: job.title,
      applicationId: application._id,
      testId,
      source,
      timeLimit,
      totalQuestions: questions.length,
      questions
    });
  } catch (error) {
    console.error("[aiController] getTest error:", error.message);
    res.status(500).json({ message: "Server error: " + error.message });
  }
};

// ─── POST /api/ai/test/submit ─────────────────────────────────────────────────
exports.submitTest = async (req, res) => {
  try {
    if (req.user.role !== "student") {
      return res.status(403).json({ message: "Only students can submit tests" });
    }

    const { jobId, answers, timeTakenMinutes } = req.body;
    if (!jobId) return res.status(400).json({ message: "jobId is required" });
    if (!Array.isArray(answers)) return res.status(400).json({ message: "answers must be an array" });

    // Prevent duplicate submission
    const existingSubmission = await Submission.findOne({ userId: req.user.id, jobId });
    if (existingSubmission) {
      return res.status(400).json({ message: "You have already submitted this test" });
    }

    const job = await Job.findById(jobId);
    if (!job) return res.status(404).json({ message: "Job not found" });

    const application = await Application.findOne({ studentId: req.user.id, jobId });
    if (!application) return res.status(404).json({ message: "Application not found" });
    if (application.testSubmitted) return res.status(400).json({ message: "Test already submitted" });

    const student = await Student.findById(req.user.id);

    // ── Get authoritative questions ──────────────────────────────────────────
    let questions = [];
    let testId = null;

    const test = await Test.findOne({ jobId, isActive: true });
    if (test && test.questions.length > 0) {
      questions = test.questions;
      testId = test._id;
    } else if (job.aiTest?.generated && job.aiTest.questions?.length) {
      questions = job.aiTest.questions;
    } else if (job.generatedTest?.questions?.length) {
      questions = job.generatedTest.questions.map((q) => ({
        question: q.prompt,
        options: q.options,
        correctAnswer: q.answer,
        explanation: ""
      }));
    }

    const totalQuestions = questions.length;
    if (totalQuestions === 0) {
      return res.status(400).json({ message: "No questions found for this test" });
    }

    // ── Grade ────────────────────────────────────────────────────────────────
    let correctCount = 0;
    const detailedResults = [];

    answers.forEach((ans) => {
      const idx = Number(ans.questionIndex);
      const q = questions[idx];
      if (!q) return;

      const selected = String(ans.selected || ans.selectedAnswer || "").trim();
      const correct = String(q.correctAnswer || "").trim();
      const isCorrect = selected.toLowerCase() === correct.toLowerCase();

      if (isCorrect) correctCount++;

      detailedResults.push({
        questionId: q._id || null,
        questionIndex: idx,
        questionText: q.question,
        selectedAnswer: selected,
        correctAnswer: correct,
        isCorrect,
        explanation: q.explanation || ""
      });
    });

    const percentage = Math.round((correctCount / totalQuestions) * 100);
    const timeTaken = Math.min(Number(timeTakenMinutes) || 0, 120);

    console.log(`[aiController] Score: ${correctCount}/${totalQuestions} (${percentage}%) in ${timeTaken}min`);

    // ── Hybrid scoring ───────────────────────────────────────────────────────
    const jobSkills = uniqueSkills(job.skills || []);
    const studentSkills = uniqueSkills(student?.skills || []);
    const matchedSkills = jobSkills.filter((s) => studentSkills.includes(s));
    const overlapRatio = jobSkills.length ? matchedSkills.length / jobSkills.length : 0.25;

    const skillMatchScore = Math.round(overlapRatio * 100);
    const realTestScore = percentage;

    const profileScore = Math.min(
      ((student?.bio ? 30 : 0) +
       (student?.skills?.length > 0 ? 40 : 0) +
       (student?.college ? 20 : 0) +
       (student?.phone ? 10 : 0)),
      100
    );

    // simScore = (testScore * 0.7) + (skillMatch * 0.2) + (profileScore * 0.1)
    const finalScore = Math.max(0, Math.min(100, Math.round(
      (realTestScore * 0.7) +
      (skillMatchScore * 0.2) +
      (profileScore * 0.1)
    )));

    console.log(`[aiController] finalScore=${finalScore} (test=${realTestScore}, skills=${skillMatchScore}, profile=${profileScore})`);

    // ── Save Submission ──────────────────────────────────────────────────────
    const submission = new Submission({
      userId: req.user.id,
      jobId,
      testId,
      applicationId: application._id,
      answers: answers.map((a) => ({
        questionIndex: Number(a.questionIndex),
        questionId: questions[Number(a.questionIndex)]?._id || null,
        selectedAnswer: String(a.selected || a.selectedAnswer || "").trim()
      })),
      score: correctCount,
      totalQuestions,
      percentage,
      timeTakenMinutes: timeTaken,
      detailedResults,
      submittedAt: new Date()
    });
    await submission.save();

    // ── Update Application ───────────────────────────────────────────────────
    application.testSubmitted = true;
    application.skillMatchScore = skillMatchScore;
    application.realTestScore = realTestScore;
    application.finalScore = finalScore;
    application.matchedSkills = matchedSkills;
    application.status = "pending";
    application.realTestResult = {
      submittedAt: new Date(),
      totalQuestions,
      correctAnswers: correctCount,
      timeTakenMinutes: timeTaken,
      answers: detailedResults.map((r) => ({
        questionIndex: r.questionIndex,
        selected: r.selectedAnswer,
        correct: r.isCorrect
      }))
    };
    application.testScore = realTestScore;
    application.timeTaken = timeTaken;
    application.rankingScore = finalScore;

    await application.save();

    res.status(200).json({
      message: "Test submitted successfully",
      result: {
        submissionId: submission._id,
        totalQuestions,
        correctAnswers: correctCount,
        score: correctCount,
        percentage,
        realTestScore,
        skillMatchScore,
        profileScore,
        timeTakenMinutes: timeTaken,
        finalScore,
        detailedResults
      }
    });
  } catch (error) {
    console.error("[aiController] submitTest error:", error.message);
    res.status(500).json({ message: "Server error: " + error.message });
  }
};

// ─── GET /api/ai/rankings/:jobId ─────────────────────────────────────────────
exports.getHybridRankings = async (req, res) => {
  try {
    if (req.user.role !== "business") {
      return res.status(403).json({ message: "Only businesses can view rankings" });
    }

    const job = await Job.findOne({ _id: req.params.jobId, businessId: req.user.id });
    if (!job) return res.status(404).json({ message: "Job not found" });

    // Try Submission collection first (new system)
    const submissions = await Submission.find({ jobId: job._id })
      .populate("userId", "name email skills")
      .sort({ percentage: -1, timeTakenMinutes: 1 });

    if (submissions.length > 0) {
      const medals = ["🥇", "🥈", "🥉"];
      const ranked = submissions.map((s, i) => ({
        rank: i + 1,
        applicationId: s.applicationId,
        student: {
          id: s.userId?._id,
          name: s.userId?.name || "Student",
          email: s.userId?.email,
          skills: s.userId?.skills || []
        },
        scores: {
          finalScore: s.percentage,
          realTestScore: s.percentage,
          skillMatchScore: 0,
          timeTaken: s.timeTakenMinutes,
          correctAnswers: s.score,
          totalQuestions: s.totalQuestions
        },
        matchedSkills: [],
        status: "pending"
      }));

      return res.status(200).json({
        job: { _id: job._id, title: job.title, skills: job.skills },
        totalSubmissions: ranked.length,
        topPerformers: ranked.slice(0, 3),
        rankings: ranked
      });
    }

    // Fall back to Application collection (legacy)
    const applications = await Application.find({ jobId: job._id, testSubmitted: true })
      .populate("studentId", "name email skills")
      .sort({ finalScore: -1, realTestScore: -1, "realTestResult.timeTakenMinutes": 1 });

    const ranked = applications.map((app, i) => ({
      rank: i + 1,
      applicationId: app._id,
      student: {
        id: app.studentId?._id,
        name: app.studentId?.name || "Student",
        email: app.studentId?.email,
        skills: app.studentId?.skills || []
      },
      scores: {
        finalScore: app.finalScore || 0,
        realTestScore: app.realTestScore || 0,
        skillMatchScore: app.skillMatchScore || 0,
        timeTaken: app.realTestResult?.timeTakenMinutes || 0,
        correctAnswers: app.realTestResult?.correctAnswers || 0,
        totalQuestions: app.realTestResult?.totalQuestions || 0
      },
      matchedSkills: app.matchedSkills || [],
      status: app.status
    }));

    res.status(200).json({
      job: { _id: job._id, title: job.title, skills: job.skills },
      totalSubmissions: ranked.length,
      topPerformers: ranked.slice(0, 3),
      rankings: ranked
    });
  } catch (error) {
    console.error("[aiController] getHybridRankings error:", error.message);
    res.status(500).json({ message: "Server error: " + error.message });
  }
};
