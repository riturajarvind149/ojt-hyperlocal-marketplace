# LocalHire — Student-Business Hyperlocal Marketplace

A full-stack web platform that connects local businesses in Bangalore with college students for digital freelance work. Businesses post jobs, students apply, and the system automatically generates skill-based tests, ranks candidates, suggests teams, and enables pre-hiring chat — all in one place.

---

## The Problem

Small local businesses struggle to find skilled digital talent affordably. College students have the skills but lack real-world freelance opportunities. LocalHire bridges this gap with a structured, AI-simulated hiring workflow.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite 5 |
| Backend | Node.js, Express 5 |
| Database | MongoDB, Mongoose 9 |
| Auth | JWT (jsonwebtoken), bcrypt |
| Styling | Plain CSS (no framework) |

---

## Features

- **Student & Business Registration** — separate accounts with role-based access
- **JWT Authentication** — secure login, token expiry handling, protected routes
- **Job Posting** — businesses post jobs with required skills, budget, location
- **AI-Simulated Skill Tests** — questions auto-generated from a skill question bank when a job is posted
- **Smart Candidate Ranking** — students are scored and ranked automatically on application based on skill overlap, test score, and time taken
- **Team Suggestions** — AI-style team combinations suggested based on complementary skills
- **Pre-Hiring Messaging** — conversation threads between student and business per application
- **Application Status Workflow** — pending → approved → in progress → completed
- **Job Management** — businesses can delete open jobs
- **Profile Editing** — both roles can update their profile and skills

---

## Project Structure

```
├── server.js                  # Express app entry point
├── .env                       # Environment variables (not committed)
├── routes/
│   ├── authRoutes.js          # /api/auth endpoints
│   └── jobRoutes.js           # /api/jobs endpoints
├── controllers/
│   ├── authController.js      # Register, login, profile
│   └── jobcontroller.js       # Jobs, applications, messages, rankings
├── middleware/
│   └── authMiddleware.js      # JWT verification
├── models/
│   ├── Student.js
│   ├── Business.js
│   ├── Job.js                 # Includes embedded generatedTest
│   ├── Application.js         # Includes testScore, rankingScore, breakdown
│   └── Message.js
├── utils/
│   └── simulatedHiring.js     # Question bank, scoring, team suggestion logic
└── client/                    # React frontend (Vite)
    └── src/
        ├── App.jsx            # Entire SPA — all components in one file
        ├── main.jsx
        └── styles.css
```

---

## How the Scoring System Works

When a student applies to a job, the system runs `simulateCandidateAssessment()` automatically:

1. **Skill Match** — compares student's skills against job's required skills
2. **Overlap Ratio** — `matchedSkills / jobSkills` (e.g. 1 out of 3 = 33%)
3. **Test Score** — `overlapRatio × 70 + 20 + variance` → clamped between 48 and 98
4. **Time Taken** — simulated based on a deterministic seed (unique per student-job pair)
5. **Ranking Score** — `(testScore × 0.68) + (matchedSkills × 10) - (timeTaken × 0.22)`

Candidates are sorted by ranking score descending. Top 3 appear on the podium leaderboard.

---

## Getting Started

### Prerequisites

- Node.js v18+
- MongoDB running locally (or a MongoDB Atlas URI)

### 1. Clone the repo

```bash
git clone https://github.com/riturajarvind149/ojt-hyperlocal-marketplace.git
cd ojt-hyperlocal-marketplace
```

### 2. Install backend dependencies

```bash
npm install
```

### 3. Install frontend dependencies

```bash
cd client
npm install
cd ..
```

### 4. Create your `.env` file in the root

```
MONGO_URI=mongodb://127.0.0.1:27017/OjtMarketplace
JWT_SECRET=your_secret_key_here
PORT=5000
```

### 5. Run the backend

```bash
npm run dev
```

Backend runs on `http://localhost:5000`

### 6. Run the frontend (in a separate terminal)

```bash
cd client
npm run dev
```

Frontend runs on `http://127.0.0.1:5173`

---

## API Endpoints

### Auth — `/api/auth`

| Method | Endpoint | Description | Auth |
|---|---|---|---|
| POST | `/register-student` | Register a student account | No |
| POST | `/register-business` | Register a business account | No |
| POST | `/login` | Login (returns JWT token) | No |
| GET | `/me` | Get current user profile | Yes |
| PUT | `/me` | Update profile | Yes |

### Jobs — `/api/jobs`

| Method | Endpoint | Description | Auth |
|---|---|---|---|
| GET | `/` | List all jobs | No |
| POST | `/` | Create a job (business only) | Yes |
| POST | `/apply` | Apply to a job (student only) | Yes |
| GET | `/applications` | Business sees all applicants | Yes |
| GET | `/my-applications` | Student sees their applications | Yes |
| PUT | `/application-status` | Update application status | Yes |
| GET | `/messages/inbox` | Get conversation list | Yes |
| GET | `/applications/:id/messages` | Get full conversation | Yes |
| POST | `/applications/:id/messages` | Send a message | Yes |
| GET | `/:jobId/rankings` | Ranked candidates for a job | Yes |
| GET | `/:jobId/team-suggestions` | AI team combinations | Yes |
| POST | `/:jobId/select-team` | Hire a team | Yes |
| DELETE | `/:jobId` | Delete a job | Yes |

---

## Environment Variables

| Variable | Description |
|---|---|
| `MONGO_URI` | MongoDB connection string |
| `JWT_SECRET` | Secret key for signing JWT tokens |
| `PORT` | Port for the backend server (default: 5000) |

> **Never commit your `.env` file.** It is listed in `.gitignore`.

---

## Authors

- **Raj Vardhan**
- **Ritu Raj Arvind**

First Year — OJT Project
