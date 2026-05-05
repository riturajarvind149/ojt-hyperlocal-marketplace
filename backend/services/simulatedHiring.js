const QUESTION_BANK = {
  react: [
    {
      prompt: "Which hook is best for handling local component state in React?",
      options: ["useState", "useServer", "useStatic", "useStore"],
      answer: "useState"
    },
    {
      prompt: "What makes JSX useful in React projects?",
      options: ["It mixes markup with component logic", "It replaces JavaScript", "It only works with CSS", "It stores data in MongoDB"],
      answer: "It mixes markup with component logic"
    }
  ],
  typescript: [
    {
      prompt: "What is the main benefit of TypeScript in frontend apps?",
      options: ["Static type checking", "Automatic hosting", "Database scaling", "Image compression"],
      answer: "Static type checking"
    },
    {
      prompt: "Which keyword defines a custom object shape in TypeScript?",
      options: ["interface", "shape", "model", "design"],
      answer: "interface"
    }
  ],
  javascript: [
    {
      prompt: "Which array method creates a new array without mutating the original?",
      options: ["map", "push", "splice", "sort"],
      answer: "map"
    },
    {
      prompt: "What does async/await help manage?",
      options: ["Asynchronous code", "CSS modules", "Mongo indexes", "Static hosting"],
      answer: "Asynchronous code"
    }
  ],
  figma: [
    {
      prompt: "What is Auto Layout primarily used for in Figma?",
      options: ["Responsive spacing and alignment", "Server deployment", "Database seeding", "API security"],
      answer: "Responsive spacing and alignment"
    },
    {
      prompt: "What is the purpose of reusable components in Figma?",
      options: ["Keep designs consistent", "Generate backend routes", "Store user passwords", "Run animations on a server"],
      answer: "Keep designs consistent"
    }
  ],
  design: [
    {
      prompt: "Which principle improves readability in UI design?",
      options: ["Visual hierarchy", "Random sizing", "Low contrast", "Dense paragraphs"],
      answer: "Visual hierarchy"
    },
    {
      prompt: "Why is whitespace useful in interfaces?",
      options: ["It improves scanning and focus", "It reduces security", "It changes database schema", "It replaces navigation"],
      answer: "It improves scanning and focus"
    }
  ],
  nodejs: [
    {
      prompt: "Why is Express commonly used with Node.js?",
      options: ["It simplifies routing and middleware", "It replaces MongoDB", "It compiles CSS", "It creates Figma files"],
      answer: "It simplifies routing and middleware"
    },
    {
      prompt: "What is a common Node.js use case in this project?",
      options: ["Building APIs", "Designing logos", "Editing PDFs", "Rendering videos"],
      answer: "Building APIs"
    }
  ],
  api: [
    {
      prompt: "What is the purpose of a REST API in an app like LocalHire?",
      options: ["Exchange data between frontend and backend", "Store fonts", "Generate colors", "Animate buttons"],
      answer: "Exchange data between frontend and backend"
    },
    {
      prompt: "Which status code usually means a request succeeded?",
      options: ["200", "404", "500", "401"],
      answer: "200"
    }
  ],
  marketing: [
    {
      prompt: "What metric is often used to measure ad performance?",
      options: ["Click-through rate", "Border radius", "Response headers", "Stack depth"],
      answer: "Click-through rate"
    },
    {
      prompt: "Why are audience segments useful in digital marketing?",
      options: ["They help target the right users", "They compile JavaScript", "They generate APIs", "They encrypt passwords"],
      answer: "They help target the right users"
    }
  ],
  content: [
    {
      prompt: "What makes content writing effective for businesses?",
      options: ["Clear, audience-focused communication", "Long unstructured paragraphs", "Only technical jargon", "Random keywords"],
      answer: "Clear, audience-focused communication"
    },
    {
      prompt: "Why are headings useful in online writing?",
      options: ["They improve scanning and structure", "They replace research", "They reduce SEO", "They hide content"],
      answer: "They improve scanning and structure"
    }
  ],
  default: [
    {
      prompt: "What matters most in a freelance project delivery?",
      options: ["Clear communication and reliable execution", "Ignoring requirements", "Skipping deadlines", "Avoiding feedback"],
      answer: "Clear communication and reliable execution"
    },
    {
      prompt: "Which habit improves candidate selection quality?",
      options: ["Using structured evaluation", "Random picking", "Ignoring skills", "Skipping review"],
      answer: "Using structured evaluation"
    }
  ]
};

function normalizeSkill(skill = "") {
  return String(skill).trim().toLowerCase();
}

function uniqueSkills(skills = []) {
  return [...new Set(skills.map(normalizeSkill).filter(Boolean))];
}

function getSkillQuestions(skill) {
  return QUESTION_BANK[normalizeSkill(skill)] || QUESTION_BANK.default;
}

function buildSeed(...parts) {
  const text = parts.filter(Boolean).join("|");
  return text.split("").reduce((sum, char, index) => sum + char.charCodeAt(0) * (index + 1), 0);
}

function generateSkillTest(skills = []) {
  const normalizedSkills = uniqueSkills(skills);
  const sourceSkills = normalizedSkills.length ? normalizedSkills : ["default"];
  const questions = sourceSkills.flatMap((skill) =>
    getSkillQuestions(skill).slice(0, 2).map((question) => ({
      skill,
      prompt: question.prompt,
      options: question.options,
      answer: question.answer
    }))
  );

  return {
    summary: `Simulated AI test generated for ${sourceSkills.join(", ")}`,
    skills: sourceSkills,
    questions
  };
}

function simulateCandidateAssessment({ studentSkills = [], jobSkills = [], jobId = "", studentId = "" }) {
  const normalizedStudentSkills = uniqueSkills(studentSkills);
  const normalizedJobSkills = uniqueSkills(jobSkills);
  const matchedSkills = normalizedJobSkills.filter((skill) => normalizedStudentSkills.includes(skill));
  const overlapRatio = normalizedJobSkills.length
    ? matchedSkills.length / normalizedJobSkills.length
    : normalizedStudentSkills.length
      ? 0.5
      : 0.25;

  const seed = buildSeed(jobId, studentId, normalizedStudentSkills.join(","), normalizedJobSkills.join(","));
  const totalQuestions = Math.max(4, normalizedJobSkills.length * 2 || 4);
  const variance = seed % 16;
  const correctAnswers = Math.min(totalQuestions, Math.max(1, Math.round(overlapRatio * totalQuestions) + Math.floor(variance / 5)));
  // testScore is based on actual skill overlap — no hardcoded floor
  const testScore = Math.min(98, Math.round(overlapRatio * 70 + 15 + variance));
  const timeTaken = 12 + (seed % 18) + (normalizedJobSkills.length * 2);
  // simScore = (testScore * 0.7) + (skillMatch * 0.2) + (profileScore * 0.1)
  // For simulated assessment, profileScore defaults to 50 (unknown)
  const skillMatchScore = Math.round(overlapRatio * 100);
  const rankingScore = Math.max(0, Math.min(100, Math.round(
    (testScore * 0.7) + (skillMatchScore * 0.2) + (50 * 0.1)
  )));

  return {
    matchedSkills,
    testScore,
    timeTaken,
    rankingScore,
    skillMatchScore,
    totalQuestions,
    correctAnswers,
    breakdown: normalizedJobSkills.map((skill) => ({
      skill,
      score: matchedSkills.includes(skill) ? Math.min(100, testScore) : Math.max(20, testScore - 25)
    }))
  };
}

function buildTeamSuggestions(applications = [], requiredSkills = []) {
  const ranked = [...applications].sort((a, b) => (b.rankingScore || 0) - (a.rankingScore || 0));
  const combos = [];
  const teamSizes = [2, 3];
  const targetSkills = uniqueSkills(requiredSkills);

  for (const teamSize of teamSizes) {
    if (ranked.length < teamSize) continue;

    for (let i = 0; i <= ranked.length - teamSize; i += 1) {
      const members = ranked.slice(i, i + teamSize);
      const coveredSkills = uniqueSkills(members.flatMap((application) => application.matchedSkills || []));
      const coverageRatio = targetSkills.length ? coveredSkills.length / targetSkills.length : 1;
      const averageScore = Math.round(members.reduce((sum, app) => sum + (app.rankingScore || 0), 0) / members.length);
      const complementarity = Math.round((coverageRatio * 60) + (coveredSkills.length * 6));

      combos.push({
        applicationIds: members.map((member) => String(member._id)),
        overallScore: averageScore,
        complementarity,
        coveredSkills,
        members: members.map((member, index) => ({
          applicationId: String(member._id),
          studentId: String(member.studentId?._id || member.studentId),
          name: member.studentId?.name || "Student",
          roleLabel: index === 0 ? "Lead" : index === 1 ? "Support" : "Specialist",
          matchedSkills: member.matchedSkills || [],
          testScore: member.testScore || 0
        })),
        rationale: coverageRatio >= 1
          ? "Covers all required skills with strong candidate scores."
          : "Balances top-ranked applicants with complementary strengths."
      });
    }
  }

  return combos
    .sort((a, b) => (b.complementarity + b.overallScore) - (a.complementarity + a.overallScore))
    .slice(0, 3);
}

module.exports = {
  buildTeamSuggestions,
  generateSkillTest,
  simulateCandidateAssessment,
  uniqueSkills
};

