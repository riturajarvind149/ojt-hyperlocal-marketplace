const https = require("https");
const Job = require("../models/Job");
const Application = require("../models/Application");
const Student = require("../models/Student");
const { uniqueSkills } = require("../services/simulatedHiring");

// ─── Gemini REST call (no SDK needed) ────────────────────────────────────────
function callGemini(prompt) {
  return new Promise((resolve, reject) => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === "your_gemini_api_key_here") {
      return reject(new Error("GEMINI_API_KEY not set in .env"));
    }

    const body = JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.7, maxOutputTokens: 2048 }
    });

    const options = {
      hostname: "generativelanguage.googleapis.com",
      path: `/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) }
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) return reject(new Error(parsed.error.message));
          const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text || "";
          resolve(text);
        } catch (e) {
          reject(new Error("Failed to parse Gemini response"));
        }
      });
    });

    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

// ─── Parse Gemini JSON output safely ─────────────────────────────────────────
function parseQuestionsFromText(text) {
  // Try to extract JSON array from the response
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error("No JSON array found in AI response");
  const raw = JSON.parse(jsonMatch[0]);

  return raw.map((q) => ({
    question: String(q.question || q.prompt || "").trim(),
    options: Array.isArray(q.options) ? q.options.map(String) : [],
    correctAnswer: String(q.correctAnswer || q.answer || q.correct_answer || "").trim(),
    type: "MCQ"
  })).filter((q) => q.question && q.options.length >= 2 && q.correctAnswer);
}

// ─── POST /api/ai/generate-test ───────────────────────────────────────────────
exports.generateTest = async (req, res) => {
  try {
    if (req.user.role !== "business") {
      return res.status(403).json({ message: "Only businesses can generate tests" });
    }

    const { jobId, topic, difficulty = "medium", numberOfQuestions = 5 } = req.body;

    if (!jobId) return res.status(400).json({ message: "jobId is required" });
    if (!topic || !String(topic).trim()) return res.status(400).json({ message: "topic is required" });

    const job = await Job.findOne({ _id: jobId, businessId: req.user.id });
    if (!job) return res.status(404).json({ message: "Job not found or access denied" });

    const n = Math.min(Math.max(Number(numberOfQuestions) || 5, 3), 10);
    const diff = ["easy", "medium", "hard"].includes(difficulty) ? difficulty : "medium";

    const prompt = `Generate exactly ${n} multiple choice questions about "${topic}" at ${diff} difficulty level.

Return ONLY a valid JSON array. No explanation, no markdown, no code blocks. Just the raw JSON array.

Format:
[
  {
    "question": "Question text here?",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correctAnswer": "Option A"
  }
]

Rules:
- Each question must have exactly 4 options
- correctAnswer must exactly match one of the options
- Questions should be practical and relevant to ${topic}
- Difficulty: ${diff}`;

    let questions;
    try {
      const aiText = await callGemini(prompt);
      questions = parseQuestionsFromText(aiText);
    } catch (aiError) {
      console.error("Gemini error:", aiError.message);
      // Fallback: generate from existing question bank
      questions = generateFallbackQuestions(topic, n);
    }

    if (!questions.length) {
      questions = generateFallbackQuestions(topic, n);
    }

    // Save to job
    job.aiTest = {
      generated: true,
      topic: String(topic).trim(),
      difficulty: diff,
      timeLimit: n * 2, // 2 min per question
      questions
    };
    await job.save();

    res.status(200).json({
      message: `AI test generated with ${questions.length} questions`,
      aiTest: {
        topic: job.aiTest.topic,
        difficulty: job.aiTest.difficulty,
        timeLimit: job.aiTest.timeLimit,
        questionCount: questions.length
      }
    });
  } catch (error) {
    console.error("generateTest error:", error.message);
    res.status(500).json({ message: "Server error: " + error.message });
  }
};

// ─── GET /api/ai/test/:jobId  (student fetches test to attempt) ───────────────
exports.getTest = async (req, res) => {
  try {
    if (req.user.role !== "student") {
      return res.status(403).json({ message: "Only students can fetch tests" });
    }

    const job = await Job.findById(req.params.jobId).select("title aiTest generatedTest skills status");
    if (!job) return res.status(404).json({ message: "Job not found" });
    if (job.status !== "open") return res.status(400).json({ message: "This job is no longer accepting applications" });

    // Check student has applied
    const application = await Application.findOne({ studentId: req.user.id, jobId: req.params.jobId });
    if (!application) return res.status(403).json({ message: "You must apply to this job before taking the test" });
    if (application.testSubmitted) return res.status(400).json({ message: "You have already submitted this test" });

    // Prefer AI test, fall back to simulated
    let questions = [];
    let timeLimit = 15;
    let source = "simulated";

    if (job.aiTest?.generated && job.aiTest.questions?.length) {
      // Strip correct answers before sending to student
      questions = job.aiTest.questions.map((q, i) => ({
        index: i,
        question: q.question,
        options: q.options,
        type: q.type
      }));
      timeLimit = job.aiTest.timeLimit;
      source = "ai";
    } else if (job.generatedTest?.questions?.length) {
      questions = job.generatedTest.questions.map((q, i) => ({
        index: i,
        question: q.prompt,
        options: q.options,
        type: "MCQ"
      }));
      timeLimit = Math.max(10, questions.length * 2);
      source = "simulated";
    }

    if (!questions.length) {
      return res.status(404).json({ message: "No test available for this job yet" });
    }

    res.status(200).json({
      jobId: job._id,
      jobTitle: job.title,
      applicationId: application._id,
      source,
      timeLimit,
      totalQuestions: questions.length,
      questions
    });
  } catch (error) {
    console.error("getTest error:", error.message);
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

    const job = await Job.findById(jobId);
    if (!job) return res.status(404).json({ message: "Job not found" });

    const application = await Application.findOne({ studentId: req.user.id, jobId });
    if (!application) return res.status(404).json({ message: "Application not found" });
    if (application.testSubmitted) return res.status(400).json({ message: "Test already submitted" });

    const student = await Student.findById(req.user.id);

    // ── Grade the test ──────────────────────────────────────────────
    let questions = [];
    if (job.aiTest?.generated && job.aiTest.questions?.length) {
      questions = job.aiTest.questions;
    } else if (job.generatedTest?.questions?.length) {
      questions = job.generatedTest.questions.map((q) => ({
        question: q.prompt,
        options: q.options,
        correctAnswer: q.answer
      }));
    }

    const totalQuestions = questions.length;
    let correctAnswers = 0;
    const answerDetails = [];

    answers.forEach((ans) => {
      const q = questions[ans.questionIndex];
      if (!q) return;
      const isCorrect = String(ans.selected || "").trim() === String(q.correctAnswer || "").trim();
      if (isCorrect) correctAnswers++;
      answerDetails.push({ questionIndex: ans.questionIndex, selected: ans.selected, correct: isCorrect });
    });

    // ── Hybrid scoring formula ──────────────────────────────────────
    const jobSkills = uniqueSkills(job.skills || []);
    const studentSkills = uniqueSkills(student?.skills || []);
    const matchedSkills = jobSkills.filter((s) => studentSkills.includes(s));
    const overlapRatio = jobSkills.length ? matchedSkills.length / jobSkills.length : 0.25;

    const skillMatchScore = Math.round(overlapRatio * 100);
    const realTestScore = totalQuestions > 0 ? Math.round((correctAnswers / totalQuestions) * 100) : 0;
    const timePenalty = Math.min(Number(timeTakenMinutes) || 0, 60);

    // finalScore = (testScore * 0.6) + (skillMatch * 0.3) - (time * 0.1)
    const finalScore = Math.max(0, Math.round(
      (realTestScore * 0.6) +
      (skillMatchScore * 0.3) -
      (timePenalty * 0.1)
    ));

    // ── Update application ──────────────────────────────────────────
    application.testSubmitted = true;
    application.skillMatchScore = skillMatchScore;
    application.realTestScore = realTestScore;
    application.finalScore = finalScore;
    application.matchedSkills = matchedSkills;
    application.status = "pending"; // business still needs to review
    application.realTestResult = {
      submittedAt: new Date(),
      totalQuestions,
      correctAnswers,
      timeTakenMinutes: timePenalty,
      answers: answerDetails
    };

    // Also update legacy fields for backward compat
    application.testScore = realTestScore;
    application.timeTaken = timePenalty;
    application.rankingScore = finalScore;

    await application.save();

    res.status(200).json({
      message: "Test submitted successfully",
      result: {
        totalQuestions,
        correctAnswers,
        realTestScore,
        skillMatchScore,
        timeTakenMinutes: timePenalty,
        finalScore,
        rank: null // will be populated after ranking
      }
    });
  } catch (error) {
    console.error("submitTest error:", error.message);
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
    console.error("getHybridRankings error:", error.message);
    res.status(500).json({ message: "Server error: " + error.message });
  }
};

// ─── Fallback question generator (when Gemini is unavailable) ────────────────
function generateFallbackQuestions(topic, count) {
  const t = String(topic).toLowerCase();
  const bank = {
    math: [
      { question: "What is 15% of 200?", options: ["25", "30", "35", "40"], correctAnswer: "30" },
      { question: "If a product costs ₹450 and is discounted by 20%, what is the final price?", options: ["₹360", "₹380", "₹400", "₹420"], correctAnswer: "₹360" },
      { question: "What is the profit if cost price is ₹500 and selling price is ₹650?", options: ["₹100", "₹150", "₹200", "₹250"], correctAnswer: "₹150" },
      { question: "A shopkeeper sells 3 items for ₹120 each. What is the total revenue?", options: ["₹300", "₹360", "₹400", "₹420"], correctAnswer: "₹360" },
      { question: "What is 25% of 480?", options: ["100", "110", "120", "130"], correctAnswer: "120" }
    ],
    react: [
      { question: "Which hook manages local component state in React?", options: ["useState", "useEffect", "useContext", "useRef"], correctAnswer: "useState" },
      { question: "What does useEffect do in React?", options: ["Handles side effects", "Manages state", "Creates components", "Styles elements"], correctAnswer: "Handles side effects" },
      { question: "What is JSX?", options: ["JavaScript XML syntax", "A database", "A CSS framework", "A testing tool"], correctAnswer: "JavaScript XML syntax" },
      { question: "How do you pass data to a child component?", options: ["Via props", "Via state", "Via context only", "Via refs"], correctAnswer: "Via props" },
      { question: "What is the virtual DOM?", options: ["A lightweight copy of the real DOM", "A database", "A CSS engine", "A server"], correctAnswer: "A lightweight copy of the real DOM" }
    ],
    default: [
      { question: "What is the most important quality in a professional?", options: ["Reliability", "Speed only", "Avoiding communication", "Working alone always"], correctAnswer: "Reliability" },
      { question: "How should you handle a deadline you cannot meet?", options: ["Communicate early", "Ignore it", "Submit incomplete work silently", "Blame others"], correctAnswer: "Communicate early" },
      { question: "What does client satisfaction depend on most?", options: ["Understanding requirements clearly", "Working fast only", "Using expensive tools", "Avoiding feedback"], correctAnswer: "Understanding requirements clearly" },
      { question: "What is a key skill for remote work?", options: ["Self-discipline", "Avoiding meetings", "Working without goals", "Ignoring deadlines"], correctAnswer: "Self-discipline" },
      { question: "What should you do when you receive critical feedback?", options: ["Use it to improve", "Ignore it", "Argue back", "Quit the project"], correctAnswer: "Use it to improve" }
    ]
  };

  const questions = bank[t] || bank.default;
  return questions.slice(0, count).map((q) => ({ ...q, type: "MCQ" }));
}
