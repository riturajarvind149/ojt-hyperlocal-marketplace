/**
 * testController.js — Full test management: generate, CRUD questions, submit, score
 */

const Job = require("../models/Job");
const Test = require("../models/Test");
const Submission = require("../models/Submission");
const Application = require("../models/Application");
const Student = require("../models/Student");
const { generateTest: aiGenerateTest, generateFallbackQuestions } = require("../services/aiService");
const { uniqueSkills } = require("../services/simulatedHiring");

// ─── Helper: verify business owns the job ────────────────────────────────────
async function getOwnedJob(jobId, businessId) {
  return Job.findOne({ _id: jobId, businessId });
}

// ─── POST /api/tests/generate ─────────────────────────────────────────────────
// Business generates AI test for a job
exports.generateAiTest = async (req, res) => {
  try {
    if (req.user.role !== "business") {
      return res.status(403).json({ message: "Only businesses can generate tests" });
    }

    const { jobId, topic, difficulty = "medium", numberOfQuestions = 5 } = req.body;

    if (!jobId) return res.status(400).json({ message: "jobId is required" });

    const job = await getOwnedJob(jobId, req.user.id);
    if (!job) return res.status(404).json({ message: "Job not found or access denied" });

    const n = Math.min(Math.max(Number(numberOfQuestions) || 5, 3), 20);
    const diff = ["easy", "medium", "hard"].includes(difficulty) ? difficulty : "medium";
    const testTopic = String(topic || job.title || "General").trim();

    console.log(`[testController] Generating ${n} questions for job "${job.title}" (${diff})`);

    let questions;
    try {
      questions = await aiGenerateTest({
        jobTitle: job.title,
        skills: job.skills || [],
        difficulty: diff,
        numberOfQuestions: n
      });
      console.log(`[testController] AI generated ${questions.length} questions`);
    } catch (aiError) {
      console.error("[testController] AI generation failed, using fallback:", aiError.message);
      questions = generateFallbackQuestions(job.title, job.skills || [], n);
      console.log(`[testController] Fallback generated ${questions.length} questions`);
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

    // Also update Job.aiTest for backward compatibility
    job.aiTest = {
      generated: true,
      topic: testTopic,
      difficulty: diff,
      timeLimit: test.timeLimit,
      questions
    };
    await job.save();

    console.log(`[testController] Test saved with ${test.questions.length} questions`);

    res.status(200).json({
      message: `AI test generated with ${test.questions.length} questions`,
      test: {
        _id: test._id,
        topic: test.topic,
        difficulty: test.difficulty,
        timeLimit: test.timeLimit,
        questionCount: test.questions.length,
        questions: test.questions // return full questions to business
      }
    });
  } catch (error) {
    console.error("[testController] generateAiTest error:", error.message);
    res.status(500).json({ message: "Server error: " + error.message });
  }
};

// ─── GET /api/tests/:jobId ────────────────────────────────────────────────────
// Business fetches full test with all questions (including correct answers)
exports.getTest = async (req, res) => {
  try {
    if (req.user.role !== "business") {
      return res.status(403).json({ message: "Only businesses can view full test details" });
    }

    const job = await getOwnedJob(req.params.jobId, req.user.id);
    if (!job) return res.status(404).json({ message: "Job not found or access denied" });

    const test = await Test.findOne({ jobId: req.params.jobId });
    if (!test) {
      return res.status(404).json({ message: "No test found for this job. Generate one first." });
    }

    res.status(200).json({
      test: {
        _id: test._id,
        jobId: test.jobId,
        topic: test.topic,
        difficulty: test.difficulty,
        timeLimit: test.timeLimit,
        isActive: test.isActive,
        questionCount: test.questions.length,
        questions: test.questions,
        createdAt: test.createdAt,
        updatedAt: test.updatedAt
      }
    });
  } catch (error) {
    console.error("[testController] getTest error:", error.message);
    res.status(500).json({ message: "Server error: " + error.message });
  }
};

// ─── POST /api/tests/:jobId/questions ────────────────────────────────────────
// Business adds a question manually
exports.addQuestion = async (req, res) => {
  try {
    if (req.user.role !== "business") {
      return res.status(403).json({ message: "Only businesses can add questions" });
    }

    const job = await getOwnedJob(req.params.jobId, req.user.id);
    if (!job) return res.status(404).json({ message: "Job not found or access denied" });

    const { question, options, correctAnswer, explanation, type } = req.body;

    if (!question || !String(question).trim()) {
      return res.status(400).json({ message: "question text is required" });
    }
    if (!Array.isArray(options) || options.length < 2) {
      return res.status(400).json({ message: "At least 2 options are required" });
    }
    if (!correctAnswer || !options.includes(correctAnswer)) {
      return res.status(400).json({ message: "correctAnswer must match one of the options" });
    }

    let test = await Test.findOne({ jobId: req.params.jobId });
    if (!test) {
      test = new Test({
        jobId: req.params.jobId,
        createdBy: req.user.id,
        topic: job.title,
        difficulty: "medium",
        timeLimit: 15,
        questions: []
      });
    }

    const newQuestion = {
      question: String(question).trim(),
      options: options.map((o) => String(o).trim()),
      correctAnswer: String(correctAnswer).trim(),
      explanation: String(explanation || "").trim(),
      type: ["mcq", "text", "code"].includes(type) ? type : "mcq"
    };

    test.questions.push(newQuestion);
    test.timeLimit = Math.max(test.questions.length * 2, 10);
    await test.save();

    // Sync to Job.aiTest
    await syncTestToJob(job, test);

    res.status(201).json({
      message: "Question added successfully",
      question: test.questions[test.questions.length - 1],
      totalQuestions: test.questions.length
    });
  } catch (error) {
    console.error("[testController] addQuestion error:", error.message);
    res.status(500).json({ message: "Server error: " + error.message });
  }
};

// ─── PUT /api/tests/:jobId/questions/:questionId ──────────────────────────────
// Business edits a question
exports.updateQuestion = async (req, res) => {
  try {
    if (req.user.role !== "business") {
      return res.status(403).json({ message: "Only businesses can edit questions" });
    }

    const job = await getOwnedJob(req.params.jobId, req.user.id);
    if (!job) return res.status(404).json({ message: "Job not found or access denied" });

    const test = await Test.findOne({ jobId: req.params.jobId });
    if (!test) return res.status(404).json({ message: "Test not found" });

    const qIndex = test.questions.findIndex(
      (q) => String(q._id) === String(req.params.questionId)
    );
    if (qIndex === -1) return res.status(404).json({ message: "Question not found" });

    const { question, options, correctAnswer, explanation, type } = req.body;

    if (question) test.questions[qIndex].question = String(question).trim();
    if (Array.isArray(options) && options.length >= 2) {
      test.questions[qIndex].options = options.map((o) => String(o).trim());
    }
    if (correctAnswer) {
      if (!test.questions[qIndex].options.includes(correctAnswer)) {
        return res.status(400).json({ message: "correctAnswer must match one of the options" });
      }
      test.questions[qIndex].correctAnswer = String(correctAnswer).trim();
    }
    if (explanation !== undefined) test.questions[qIndex].explanation = String(explanation).trim();
    if (type && ["mcq", "text", "code"].includes(type)) test.questions[qIndex].type = type;

    await test.save();
    await syncTestToJob(job, test);

    res.status(200).json({
      message: "Question updated successfully",
      question: test.questions[qIndex]
    });
  } catch (error) {
    console.error("[testController] updateQuestion error:", error.message);
    res.status(500).json({ message: "Server error: " + error.message });
  }
};

// ─── DELETE /api/tests/:jobId/questions/:questionId ───────────────────────────
// Business deletes a question
exports.deleteQuestion = async (req, res) => {
  try {
    if (req.user.role !== "business") {
      return res.status(403).json({ message: "Only businesses can delete questions" });
    }

    const job = await getOwnedJob(req.params.jobId, req.user.id);
    if (!job) return res.status(404).json({ message: "Job not found or access denied" });

    const test = await Test.findOne({ jobId: req.params.jobId });
    if (!test) return res.status(404).json({ message: "Test not found" });

    const before = test.questions.length;
    test.questions = test.questions.filter(
      (q) => String(q._id) !== String(req.params.questionId)
    );

    if (test.questions.length === before) {
      return res.status(404).json({ message: "Question not found" });
    }

    test.timeLimit = Math.max(test.questions.length * 2, 10);
    await test.save();
    await syncTestToJob(job, test);

    res.status(200).json({
      message: "Question deleted successfully",
      totalQuestions: test.questions.length
    });
  } catch (error) {
    console.error("[testController] deleteQuestion error:", error.message);
    res.status(500).json({ message: "Server error: " + error.message });
  }
};

// ─── GET /api/tests/:jobId/student ────────────────────────────────────────────
// Student fetches test (correct answers stripped)
exports.getTestForStudent = async (req, res) => {
  try {
    if (req.user.role !== "student") {
      return res.status(403).json({ message: "Only students can fetch tests" });
    }

    const job = await Job.findById(req.params.jobId).select("title skills status aiTest generatedTest");
    if (!job) return res.status(404).json({ message: "Job not found" });
    if (job.status !== "open") {
      return res.status(400).json({ message: "This job is no longer accepting applications" });
    }

    // Check student has applied
    const application = await Application.findOne({
      studentId: req.user.id,
      jobId: req.params.jobId
    });
    if (!application) {
      return res.status(403).json({ message: "You must apply to this job before taking the test" });
    }
    if (application.testSubmitted) {
      return res.status(400).json({ message: "You have already submitted this test" });
    }

    // Check for existing submission
    const existingSubmission = await Submission.findOne({
      userId: req.user.id,
      jobId: req.params.jobId
    });
    if (existingSubmission) {
      return res.status(400).json({ message: "You have already submitted this test" });
    }

    // Try Test collection first, then fall back to Job.aiTest
    let questions = [];
    let timeLimit = 15;
    let testId = null;
    let source = "simulated";

    const test = await Test.findOne({ jobId: req.params.jobId, isActive: true });

    if (test && test.questions.length > 0) {
      // Strip correct answers before sending to student
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
      return res.status(404).json({ message: "No test available for this job yet. Ask the employer to generate one." });
    }

    console.log(`[testController] Serving ${questions.length} questions to student ${req.user.id} for job ${req.params.jobId}`);

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
    console.error("[testController] getTestForStudent error:", error.message);
    res.status(500).json({ message: "Server error: " + error.message });
  }
};

// ─── POST /api/tests/:jobId/submit ────────────────────────────────────────────
// Student submits answers — real scoring
exports.submitTest = async (req, res) => {
  try {
    if (req.user.role !== "student") {
      return res.status(403).json({ message: "Only students can submit tests" });
    }

    const { jobId } = req.params;
    const { answers, timeTakenMinutes } = req.body;

    if (!Array.isArray(answers)) {
      return res.status(400).json({ message: "answers must be an array" });
    }

    // Check for duplicate submission
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

    // ── Get the authoritative questions (with correct answers) ──────────────
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

    // ── Grade answers ────────────────────────────────────────────────────────
    let correctCount = 0;
    const detailedResults = [];

    answers.forEach((ans) => {
      const idx = Number(ans.questionIndex);
      const q = questions[idx];
      if (!q) return;

      const selected = String(ans.selectedAnswer || ans.selected || "").trim();
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

    const percentage = totalQuestions > 0
      ? Math.round((correctCount / totalQuestions) * 100)
      : 0;

    const timeTaken = Math.min(Number(timeTakenMinutes) || 0, 120);

    console.log(`[testController] Submission: ${correctCount}/${totalQuestions} correct (${percentage}%) in ${timeTaken}min`);

    // ── Hybrid scoring formula ───────────────────────────────────────────────
    const jobSkills = uniqueSkills(job.skills || []);
    const studentSkills = uniqueSkills(student?.skills || []);
    const matchedSkills = jobSkills.filter((s) => studentSkills.includes(s));
    const overlapRatio = jobSkills.length ? matchedSkills.length / jobSkills.length : 0.25;

    const skillMatchScore = Math.round(overlapRatio * 100);
    const realTestScore = percentage;
    const timePenalty = Math.min(timeTaken, 60);

    // simScore = (testScore * 0.7) + (skillMatch * 0.2) + (profileScore * 0.1)
    // profileScore: based on bio/skills completeness
    const profileScore = Math.min(
      ((student?.bio ? 30 : 0) +
       (student?.skills?.length > 0 ? 40 : 0) +
       (student?.college ? 20 : 0) +
       (student?.phone ? 10 : 0)),
      100
    );

    const finalScore = Math.max(0, Math.min(100, Math.round(
      (realTestScore * 0.7) +
      (skillMatchScore * 0.2) +
      (profileScore * 0.1)
    )));

    console.log(`[testController] Scores — test: ${realTestScore}%, skills: ${skillMatchScore}%, profile: ${profileScore}%, final: ${finalScore}`);

    // ── Save Submission ──────────────────────────────────────────────────────
    const submission = new Submission({
      userId: req.user.id,
      jobId,
      testId,
      applicationId: application._id,
      answers: answers.map((a) => ({
        questionIndex: Number(a.questionIndex),
        questionId: questions[Number(a.questionIndex)]?._id || null,
        selectedAnswer: String(a.selectedAnswer || a.selected || "").trim()
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
    // Backward compat
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
    console.error("[testController] submitTest error:", error.message);
    res.status(500).json({ message: "Server error: " + error.message });
  }
};

// ─── GET /api/tests/:jobId/submissions ────────────────────────────────────────
// Business views all submissions for a job
exports.getSubmissions = async (req, res) => {
  try {
    if (req.user.role !== "business") {
      return res.status(403).json({ message: "Only businesses can view submissions" });
    }

    const job = await getOwnedJob(req.params.jobId, req.user.id);
    if (!job) return res.status(404).json({ message: "Job not found or access denied" });

    const submissions = await Submission.find({ jobId: req.params.jobId })
      .populate("userId", "name email skills college bio phone")
      .sort({ percentage: -1, timeTakenMinutes: 1 });

    res.status(200).json({
      jobId: req.params.jobId,
      jobTitle: job.title,
      totalSubmissions: submissions.length,
      submissions: submissions.map((s, i) => ({
        rank: i + 1,
        submissionId: s._id,
        student: {
          _id: s.userId?._id,
          name: s.userId?.name || "Student",
          email: s.userId?.email,
          skills: s.userId?.skills || []
        },
        score: s.score,
        totalQuestions: s.totalQuestions,
        percentage: s.percentage,
        timeTakenMinutes: s.timeTakenMinutes,
        submittedAt: s.submittedAt,
        detailedResults: s.detailedResults
      }))
    });
  } catch (error) {
    console.error("[testController] getSubmissions error:", error.message);
    res.status(500).json({ message: "Server error: " + error.message });
  }
};

// ─── GET /api/tests/:jobId/submissions/:userId ────────────────────────────────
// Business views one student's detailed submission
exports.getStudentSubmission = async (req, res) => {
  try {
    if (req.user.role !== "business") {
      return res.status(403).json({ message: "Only businesses can view submissions" });
    }

    const job = await getOwnedJob(req.params.jobId, req.user.id);
    if (!job) return res.status(404).json({ message: "Job not found or access denied" });

    const submission = await Submission.findOne({
      jobId: req.params.jobId,
      userId: req.params.userId
    }).populate("userId", "name email skills college bio phone location");

    if (!submission) {
      return res.status(404).json({ message: "No submission found for this student" });
    }

    res.status(200).json({
      submission: {
        _id: submission._id,
        student: submission.userId,
        score: submission.score,
        totalQuestions: submission.totalQuestions,
        percentage: submission.percentage,
        timeTakenMinutes: submission.timeTakenMinutes,
        submittedAt: submission.submittedAt,
        detailedResults: submission.detailedResults
      }
    });
  } catch (error) {
    console.error("[testController] getStudentSubmission error:", error.message);
    res.status(500).json({ message: "Server error: " + error.message });
  }
};

// ─── GET /api/tests/:jobId/rankings ──────────────────────────────────────────
// Business views ranked submissions
exports.getRankings = async (req, res) => {
  try {
    if (req.user.role !== "business") {
      return res.status(403).json({ message: "Only businesses can view rankings" });
    }

    const job = await getOwnedJob(req.params.jobId, req.user.id);
    if (!job) return res.status(404).json({ message: "Job not found or access denied" });

    const submissions = await Submission.find({ jobId: req.params.jobId })
      .populate("userId", "name email skills")
      .sort({ percentage: -1, timeTakenMinutes: 1 });

    const medals = ["🥇", "🥈", "🥉"];

    const ranked = submissions.map((s, i) => ({
      rank: i + 1,
      medal: medals[i] || null,
      submissionId: s._id,
      student: {
        _id: s.userId?._id,
        name: s.userId?.name || "Student",
        email: s.userId?.email,
        skills: s.userId?.skills || []
      },
      score: s.score,
      totalQuestions: s.totalQuestions,
      percentage: s.percentage,
      timeTakenMinutes: s.timeTakenMinutes,
      submittedAt: s.submittedAt
    }));

    res.status(200).json({
      job: { _id: job._id, title: job.title, skills: job.skills },
      totalSubmissions: ranked.length,
      topPerformers: ranked.slice(0, 3),
      rankings: ranked
    });
  } catch (error) {
    console.error("[testController] getRankings error:", error.message);
    res.status(500).json({ message: "Server error: " + error.message });
  }
};

// ─── Helper: sync Test questions back to Job.aiTest ──────────────────────────
async function syncTestToJob(job, test) {
  try {
    job.aiTest = {
      generated: true,
      topic: test.topic,
      difficulty: test.difficulty,
      timeLimit: test.timeLimit,
      questions: test.questions.map((q) => ({
        question: q.question,
        options: q.options,
        correctAnswer: q.correctAnswer,
        type: q.type
      }))
    };
    await job.save();
  } catch (err) {
    console.error("[testController] syncTestToJob error:", err.message);
  }
}
