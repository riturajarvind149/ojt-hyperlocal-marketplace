/**
 * aiService.js — Core AI test generation service
 * Uses Gemini API with retry logic, dynamic prompts, and strict JSON output
 */

const https = require("https");

// ─── Low-level Gemini REST call ───────────────────────────────────────────────
function callGemini(prompt, temperature = 0.9) {
  return new Promise((resolve, reject) => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === "your_gemini_api_key_here") {
      return reject(new Error("GEMINI_API_KEY not set in .env"));
    }

    const body = JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature,          // High temperature = more variety
        maxOutputTokens: 4096,
        topP: 0.95,
        topK: 40
      }
    });

    const options = {
      hostname: "generativelanguage.googleapis.com",
      path: `/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body)
      }
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) return reject(new Error(parsed.error.message));
          const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text || "";
          if (!text) return reject(new Error("Empty response from Gemini"));
          resolve(text);
        } catch (e) {
          reject(new Error("Failed to parse Gemini response: " + e.message));
        }
      });
    });

    req.on("error", reject);
    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error("Gemini request timed out"));
    });
    req.write(body);
    req.end();
  });
}

// ─── Parse and validate questions from AI text ────────────────────────────────
function parseQuestionsFromText(text, required) {
  // Strip markdown code fences if present
  const cleaned = text
    .replace(/```json\s*/gi, "")
    .replace(/```\s*/g, "")
    .trim();

  // Extract JSON array
  const jsonMatch = cleaned.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error("No JSON array found in AI response");

  let raw;
  try {
    raw = JSON.parse(jsonMatch[0]);
  } catch (e) {
    throw new Error("Invalid JSON in AI response: " + e.message);
  }

  if (!Array.isArray(raw)) throw new Error("AI response is not an array");

  const questions = raw
    .map((q) => ({
      question: String(q.question || q.prompt || q.text || "").trim(),
      options: Array.isArray(q.options)
        ? q.options.map((o) => String(o).trim()).filter(Boolean)
        : [],
      correctAnswer: String(
        q.correctAnswer || q.correct_answer || q.answer || q.correct || ""
      ).trim(),
      explanation: String(q.explanation || q.rationale || "").trim(),
      type: "mcq"
    }))
    .filter((q) => {
      if (!q.question || q.question.length < 5) return false;
      if (q.options.length < 2) return false;
      if (!q.correctAnswer) return false;
      // Ensure correctAnswer matches one of the options
      const match = q.options.find(
        (o) => o.toLowerCase() === q.correctAnswer.toLowerCase()
      );
      if (!match) return false;
      // Normalize correctAnswer to exact option text
      q.correctAnswer = match;
      return true;
    });

  console.log(`[aiService] Parsed ${questions.length}/${required} questions from AI`);
  return questions;
}

// ─── Build the generation prompt ──────────────────────────────────────────────
function buildPrompt(jobTitle, skills, difficulty, numberOfQuestions, attempt = 1) {
  const skillList = skills.length ? skills.join(", ") : jobTitle;
  const uniquenessHint = attempt > 1
    ? `IMPORTANT: This is attempt ${attempt}. Generate COMPLETELY DIFFERENT questions from any previous attempt. Use different scenarios, contexts, and concepts.`
    : "Generate UNIQUE questions that are not generic. Avoid common interview clichés.";

  return `You are an expert technical interviewer creating a skill assessment test.

Job Title: "${jobTitle}"
Required Skills: ${skillList}
Difficulty: ${difficulty}
Number of Questions: ${numberOfQuestions}

${uniquenessHint}

Generate EXACTLY ${numberOfQuestions} multiple-choice questions to assess candidates for this specific role.

STRICT REQUIREMENTS:
1. Questions MUST be specific to "${jobTitle}" and skills: ${skillList}
2. Each question must have EXACTLY 4 options
3. correctAnswer must EXACTLY match one of the options (copy-paste the option text)
4. Include a brief explanation for the correct answer
5. Questions must vary in topic — cover different aspects of the role
6. Difficulty level: ${difficulty} (${difficulty === "easy" ? "basic concepts" : difficulty === "medium" ? "practical application" : "advanced problem-solving"})
7. NO generic questions like "What is professionalism?" — make them role-specific

Return ONLY a valid JSON array. No markdown, no explanation, no code blocks. Just raw JSON.

Format:
[
  {
    "question": "Specific technical question about ${jobTitle}?",
    "options": ["Option A text", "Option B text", "Option C text", "Option D text"],
    "correctAnswer": "Option A text",
    "explanation": "Brief explanation of why this is correct"
  }
]

Generate ${numberOfQuestions} questions now:`;
}

// ─── Main export: generateTest with retry logic ───────────────────────────────
/**
 * @param {Object} params
 * @param {string} params.jobTitle
 * @param {string[]} params.skills
 * @param {string} params.difficulty - "easy" | "medium" | "hard"
 * @param {number} params.numberOfQuestions
 * @returns {Promise<Array>} Array of question objects
 */
async function generateTest({ jobTitle, skills, difficulty = "medium", numberOfQuestions = 5 }) {
  const n = Math.min(Math.max(Number(numberOfQuestions) || 5, 3), 20);
  const diff = ["easy", "medium", "hard"].includes(difficulty) ? difficulty : "medium";
  const normalizedSkills = Array.isArray(skills) ? skills.filter(Boolean) : [];

  console.log(`[aiService] Generating ${n} questions for "${jobTitle}" (${diff}) — skills: ${normalizedSkills.join(", ") || "none"}`);

  const MAX_ATTEMPTS = 3;
  let lastError = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      console.log(`[aiService] Attempt ${attempt}/${MAX_ATTEMPTS}`);

      // Increase temperature on retries for more variety
      const temperature = 0.8 + (attempt - 1) * 0.05;
      const prompt = buildPrompt(jobTitle, normalizedSkills, diff, n, attempt);

      const aiText = await callGemini(prompt, temperature);
      console.log(`[aiService] Raw AI response length: ${aiText.length} chars`);

      const questions = parseQuestionsFromText(aiText, n);

      if (questions.length < n) {
        console.warn(`[aiService] Got ${questions.length}/${n} questions on attempt ${attempt}`);
        if (attempt < MAX_ATTEMPTS) {
          lastError = new Error(`Only ${questions.length} valid questions returned, need ${n}`);
          continue;
        }
        // On last attempt, use what we have if we got at least half
        if (questions.length >= Math.ceil(n / 2)) {
          console.warn(`[aiService] Using ${questions.length} questions (partial)`);
          return questions;
        }
        throw new Error(`Insufficient questions: got ${questions.length}, need at least ${Math.ceil(n / 2)}`);
      }

      // Deduplicate by question text
      const seen = new Set();
      const unique = questions.filter((q) => {
        const key = q.question.toLowerCase().slice(0, 50);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      console.log(`[aiService] ✅ Generated ${unique.length} unique questions`);
      return unique.slice(0, n);

    } catch (err) {
      console.error(`[aiService] Attempt ${attempt} failed:`, err.message);
      lastError = err;
      if (attempt < MAX_ATTEMPTS) {
        // Wait before retry
        await new Promise((r) => setTimeout(r, 1000 * attempt));
      }
    }
  }

  throw lastError || new Error("Failed to generate questions after all attempts");
}

// ─── Fallback question generator (when Gemini is unavailable) ────────────────
function generateFallbackQuestions(jobTitle, skills, count) {
  const title = String(jobTitle).toLowerCase();
  const skillList = (skills || []).map((s) => s.toLowerCase());

  // Skill-specific banks
  const banks = {
    react: [
      { question: "In React, which hook is used to perform side effects like API calls?", options: ["useEffect", "useState", "useCallback", "useMemo"], correctAnswer: "useEffect", explanation: "useEffect runs after render and is used for side effects like data fetching." },
      { question: "What does the key prop do in a React list?", options: ["Helps React identify which items changed", "Styles list items", "Sorts the list", "Filters duplicates"], correctAnswer: "Helps React identify which items changed", explanation: "Keys help React efficiently update the DOM by tracking list item identity." },
      { question: "What is the correct way to update state in React?", options: ["Call setState or the setter from useState", "Directly mutate this.state", "Use document.getElementById", "Reload the page"], correctAnswer: "Call setState or the setter from useState", explanation: "State must be updated via setState or the hook setter to trigger re-renders." },
      { question: "What is React's virtual DOM?", options: ["A lightweight in-memory representation of the real DOM", "A database", "A CSS engine", "A server-side renderer"], correctAnswer: "A lightweight in-memory representation of the real DOM", explanation: "The virtual DOM allows React to batch and optimize DOM updates." },
      { question: "Which React hook prevents unnecessary re-renders of child components?", options: ["React.memo", "useEffect", "useState", "useRef"], correctAnswer: "React.memo", explanation: "React.memo memoizes a component and skips re-rendering if props haven't changed." }
    ],
    javascript: [
      { question: "What does the Array.prototype.map() method return?", options: ["A new array with transformed elements", "The original array modified", "A boolean", "undefined"], correctAnswer: "A new array with transformed elements", explanation: "map() creates a new array by applying a function to each element." },
      { question: "What is a closure in JavaScript?", options: ["A function that retains access to its outer scope", "A way to close the browser", "A CSS property", "A database connection"], correctAnswer: "A function that retains access to its outer scope", explanation: "Closures allow inner functions to access variables from their enclosing scope." },
      { question: "What does 'async/await' help with in JavaScript?", options: ["Writing asynchronous code in a synchronous style", "Styling components", "Managing databases", "Compiling TypeScript"], correctAnswer: "Writing asynchronous code in a synchronous style", explanation: "async/await makes Promise-based code easier to read and write." },
      { question: "What is the difference between == and === in JavaScript?", options: ["=== checks type and value, == only checks value", "They are identical", "== is faster", "=== only works with strings"], correctAnswer: "=== checks type and value, == only checks value", explanation: "Strict equality (===) prevents unexpected type coercion bugs." },
      { question: "What does the spread operator (...) do in JavaScript?", options: ["Expands an iterable into individual elements", "Multiplies numbers", "Creates a loop", "Declares a variable"], correctAnswer: "Expands an iterable into individual elements", explanation: "The spread operator is used to copy arrays/objects or pass array elements as arguments." }
    ],
    nodejs: [
      { question: "What is the purpose of package.json in a Node.js project?", options: ["Manages project metadata and dependencies", "Stores database credentials", "Defines CSS styles", "Configures the browser"], correctAnswer: "Manages project metadata and dependencies", explanation: "package.json tracks project info, scripts, and npm dependencies." },
      { question: "Which Node.js module is used to create an HTTP server?", options: ["http", "fs", "path", "os"], correctAnswer: "http", explanation: "The built-in 'http' module provides utilities to create HTTP servers." },
      { question: "What does middleware do in Express.js?", options: ["Processes requests before they reach route handlers", "Stores data in MongoDB", "Renders HTML templates", "Manages CSS"], correctAnswer: "Processes requests before they reach route handlers", explanation: "Middleware functions have access to req, res, and next() in the request cycle." },
      { question: "What is the event loop in Node.js?", options: ["A mechanism that handles asynchronous callbacks", "A for loop", "A database query", "A CSS animation"], correctAnswer: "A mechanism that handles asynchronous callbacks", explanation: "The event loop allows Node.js to perform non-blocking I/O operations." },
      { question: "How do you export a function from a Node.js module?", options: ["module.exports = function", "export default function", "window.function", "global.function"], correctAnswer: "module.exports = function", explanation: "In CommonJS (Node.js default), module.exports is used to expose module contents." }
    ],
    python: [
      { question: "What is a list comprehension in Python?", options: ["A concise way to create lists using a single line", "A type of loop", "A class method", "A database query"], correctAnswer: "A concise way to create lists using a single line", explanation: "List comprehensions provide a compact syntax: [expr for item in iterable]." },
      { question: "What does the 'self' parameter represent in a Python class method?", options: ["The instance of the class", "A global variable", "The parent class", "A static method"], correctAnswer: "The instance of the class", explanation: "self refers to the current object instance, allowing access to its attributes." },
      { question: "What is the difference between a list and a tuple in Python?", options: ["Lists are mutable, tuples are immutable", "Tuples are faster to iterate", "Lists can only hold strings", "They are identical"], correctAnswer: "Lists are mutable, tuples are immutable", explanation: "Tuples cannot be modified after creation, making them suitable for fixed data." },
      { question: "What does the 'with' statement do in Python?", options: ["Manages context and ensures cleanup (e.g., closing files)", "Creates a loop", "Defines a function", "Imports a module"], correctAnswer: "Manages context and ensures cleanup (e.g., closing files)", explanation: "The 'with' statement uses context managers to handle resource cleanup automatically." },
      { question: "What is a decorator in Python?", options: ["A function that wraps another function to extend its behavior", "A CSS class", "A database index", "A type annotation"], correctAnswer: "A function that wraps another function to extend its behavior", explanation: "Decorators use the @syntax to modify or enhance functions without changing their code." }
    ],
    design: [
      { question: "What is the primary purpose of whitespace in UI design?", options: ["Improve readability and visual hierarchy", "Fill empty space", "Reduce file size", "Add animations"], correctAnswer: "Improve readability and visual hierarchy", explanation: "Whitespace guides the eye and prevents cognitive overload." },
      { question: "What does 'responsive design' mean?", options: ["A layout that adapts to different screen sizes", "A fast-loading website", "A design with animations", "A dark mode interface"], correctAnswer: "A layout that adapts to different screen sizes", explanation: "Responsive design uses flexible grids and media queries to work on all devices." },
      { question: "What is the 60-30-10 rule in design?", options: ["A color distribution rule: 60% dominant, 30% secondary, 10% accent", "A typography scale", "A grid system", "A loading time benchmark"], correctAnswer: "A color distribution rule: 60% dominant, 30% secondary, 10% accent", explanation: "This rule creates visual balance and harmony in color schemes." },
      { question: "What is a wireframe in UX design?", options: ["A low-fidelity layout sketch showing structure", "A final design mockup", "A CSS framework", "A database schema"], correctAnswer: "A low-fidelity layout sketch showing structure", explanation: "Wireframes focus on layout and functionality before visual design." },
      { question: "What does 'affordance' mean in UX design?", options: ["A design cue that suggests how an element should be used", "The cost of a design tool", "A color palette", "A font size"], correctAnswer: "A design cue that suggests how an element should be used", explanation: "Good affordances make interfaces intuitive — e.g., a button looks clickable." }
    ],
    marketing: [
      { question: "What does CTR stand for in digital marketing?", options: ["Click-Through Rate", "Customer Transaction Record", "Content Transfer Rate", "Campaign Tracking Report"], correctAnswer: "Click-Through Rate", explanation: "CTR measures the percentage of people who click an ad after seeing it." },
      { question: "What is A/B testing in marketing?", options: ["Comparing two versions of content to see which performs better", "Testing two different products", "A/B refers to two marketing agencies", "Testing on Android and Blackberry devices"], correctAnswer: "Comparing two versions of content to see which performs better", explanation: "A/B testing helps optimize campaigns by measuring real user responses." },
      { question: "What is SEO?", options: ["Search Engine Optimization — improving organic search rankings", "Social Engagement Outreach", "Sales Enablement Operations", "Software Engineering Output"], correctAnswer: "Search Engine Optimization — improving organic search rankings", explanation: "SEO involves optimizing content and technical factors to rank higher in search results." },
      { question: "What is a conversion funnel?", options: ["The stages a customer goes through from awareness to purchase", "A sales pipeline tool", "A social media algorithm", "An email template"], correctAnswer: "The stages a customer goes through from awareness to purchase", explanation: "Understanding the funnel helps marketers optimize each stage of the customer journey." },
      { question: "What is the purpose of a buyer persona?", options: ["A fictional profile representing your ideal customer", "A legal document", "A product specification", "A financial report"], correctAnswer: "A fictional profile representing your ideal customer", explanation: "Buyer personas help teams create targeted content and campaigns." }
    ],
    default: [
      { question: `What is the most critical skill for a ${jobTitle} role?`, options: ["Domain expertise and continuous learning", "Working in isolation", "Avoiding feedback", "Memorizing procedures only"], correctAnswer: "Domain expertise and continuous learning", explanation: "Professionals who continuously learn adapt better to changing requirements." },
      { question: `How should a ${jobTitle} handle a missed deadline?`, options: ["Communicate proactively and propose a revised timeline", "Submit incomplete work silently", "Blame external factors", "Ignore the deadline"], correctAnswer: "Communicate proactively and propose a revised timeline", explanation: "Proactive communication builds trust and allows teams to adjust plans." },
      { question: `What approach best ensures quality in ${jobTitle} work?`, options: ["Review work before delivery and seek feedback", "Rush to finish first", "Skip testing to save time", "Avoid documentation"], correctAnswer: "Review work before delivery and seek feedback", explanation: "Quality assurance through review and feedback prevents costly errors." },
      { question: `What is the best way to handle conflicting priorities as a ${jobTitle}?`, options: ["Prioritize by impact and communicate with stakeholders", "Work on all tasks simultaneously", "Ignore low-priority tasks permanently", "Ask someone else to decide"], correctAnswer: "Prioritize by impact and communicate with stakeholders", explanation: "Effective prioritization ensures the most valuable work gets done first." },
      { question: `Which practice most improves collaboration in a ${jobTitle} team?`, options: ["Clear documentation and regular status updates", "Working independently without updates", "Keeping work private until complete", "Avoiding meetings entirely"], correctAnswer: "Clear documentation and regular status updates", explanation: "Transparency and documentation reduce misunderstandings and blockers." }
    ]
  };

  // Find best matching bank
  let selectedBank = banks.default;
  for (const skill of skillList) {
    for (const [key, bank] of Object.entries(banks)) {
      if (key !== "default" && skill.includes(key)) {
        selectedBank = bank;
        break;
      }
    }
    if (selectedBank !== banks.default) break;
  }

  // Check title keywords
  if (selectedBank === banks.default) {
    for (const [key, bank] of Object.entries(banks)) {
      if (key !== "default" && title.includes(key)) {
        selectedBank = bank;
        break;
      }
    }
  }

  return selectedBank.slice(0, count).map((q) => ({ ...q, type: "mcq" }));
}

module.exports = { generateTest, generateFallbackQuestions, callGemini };
