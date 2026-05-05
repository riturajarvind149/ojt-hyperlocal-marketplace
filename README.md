# LocalHire — AI-Powered Hyperlocal Talent & Services Platform

A production-ready full-stack MERN application that connects students and freelancers with local businesses. Features AI-generated skill assessments, real-time scoring, team-based hiring, local services marketplace, and secure account management.

**Live:** https://localhire-8pyb.onrender.com

---

## Features

### For Students
- Browse and apply to online and offline jobs
- Take AI-generated skill tests after applying
- View real-time test scores with per-question answer review
- Get job recommendations based on profile skills
- Message employers directly
- Edit profile, skills, and job preferences
- Change password and email securely from Account Settings

### For Businesses
- Post jobs with optional AI skill tests
- **Test Manager** — generate, preview, add, edit, and delete test questions
- AI Suggested Questions workflow — review before adding to test
- View ranked candidates with hybrid scoring
- See per-student answer analysis (which questions they got right/wrong)
- Team-based hiring with AI-suggested team combinations
- Manage applications: approve, reject, start work, complete
- Message applicants directly
- Change password and email securely from Account Settings

### Platform
- Dual-role marketplace (Student / Business)
- Local Services section — browse offline workers by category (maid, cook, electrician, etc.)
- Dark mode support
- Email OTP verification for registration and sensitive account changes
- Google OAuth login
- Anti-cheat test environment (tab-switch detection, right-click disabled)
- Deployed on Render (backend + frontend served as static build)

---

## Project Structure

```
localhire/
├── backend/
│   ├── controllers/
│   │   ├── authController.js       # Register, login, email verify, Google OAuth, OTP flows
│   │   ├── accountController.js    # Change password, change email (OTP-secured)
│   │   ├── jobController.js        # Jobs, applications, messages, rankings, team selection
│   │   ├── aiController.js         # Legacy AI test generation + hybrid rankings (backward compat)
│   │   └── testController.js       # Full test CRUD, AI generation, student fetch, scoring, submissions
│   ├── models/
│   │   ├── Student.js              # Student schema (skills, OTP, pendingEmail, Google OAuth)
│   │   ├── Business.js             # Business schema (OTP, pendingEmail, Google OAuth)
│   │   ├── Job.js                  # Job schema (aiTest, generatedTest, team fields)
│   │   ├── Application.js          # Application schema (real scores, submission tracking)
│   │   ├── Message.js              # Conversation messages
│   │   ├── Test.js                 # Per-job test collection (questions with correct answers)
│   │   └── Submission.js           # Per-user test submissions with detailed results
│   ├── routes/
│   │   ├── authRoutes.js           # /api/auth/* (all auth + account settings endpoints)
│   │   ├── jobRoutes.js            # /api/jobs/*
│   │   ├── aiRoutes.js             # /api/ai/* (legacy, kept for backward compat)
│   │   └── testRoutes.js           # /api/tests/* (new test management system)
│   ├── services/
│   │   ├── aiService.js            # Gemini API integration with retry logic
│   │   ├── emailService.js         # Nodemailer (Gmail SMTP) — OTP emails
│   │   └── simulatedHiring.js      # Skill-based assessment simulation + team suggestions
│   ├── middleware/
│   │   └── authMiddleware.js       # JWT verification
│   ├── server.js                   # Express app entry point
│   ├── package.json
│   └── .env.example
│
├── frontend/
│   ├── src/
│   │   ├── App.jsx                 # Entire SPA — all screens, routing, state management
│   │   ├── main.jsx                # React entry point + Google OAuth provider
│   │   └── styles.css              # Global styles (light + dark mode)
│   ├── index.html
│   ├── vite.config.js              # Vite config + /api proxy to backend
│   ├── package.json
│   └── .env.example
│
├── package.json                    # Root scripts: build (frontend) + start (backend)
└── .gitignore
```

---

## API Reference

### Auth — `/api/auth`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/register-student` | — | Register student with email OTP |
| POST | `/register-business` | — | Register business with email OTP |
| POST | `/login` | — | Email + password login |
| GET | `/me` | JWT | Get current user profile |
| PUT | `/me` | JWT | Update profile |
| POST | `/verify-email` | — | Verify email with OTP after registration |
| POST | `/resend-verification` | — | Resend registration OTP |
| POST | `/forgot-password` | — | Send password reset OTP (public flow) |
| POST | `/reset-password` | — | Reset password with OTP (public flow) |
| POST | `/google` | — | Google OAuth login / register |
| POST | `/send-otp` | — | Send pre-registration OTP |
| POST | `/verify-otp` | — | Verify pre-registration OTP, get emailToken |
| POST | `/change-password` | JWT | Change password using old password |
| POST | `/send-password-otp` | JWT | Send OTP to current email (forgot password in settings) |
| POST | `/verify-password-otp` | JWT | Verify OTP and set new password |
| POST | `/send-email-otp` | JWT | Send OTP to **new** email (email change step 1) |
| POST | `/verify-email-otp` | JWT | Verify OTP and commit email change |

### Jobs — `/api/jobs`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/` | Business | Create job |
| GET | `/` | — | List jobs (with filters: mode, category, search, skills) |
| GET | `/recommended` | Student | Jobs matching student skills |
| POST | `/apply` | Student | Apply to a job |
| POST | `/apply-category` | Student | Apply to a local service category |
| GET | `/applications` | Business | All applications for business's jobs |
| GET | `/my-applications` | Student | Student's own applications |
| PUT | `/application-status` | Business | Update application status |
| GET | `/messages/inbox` | JWT | Conversation list |
| GET | `/applications/:id/messages` | JWT | Get conversation messages |
| POST | `/applications/:id/messages` | JWT | Send message |
| GET | `/:jobId/rankings` | Business | Simulated candidate rankings |
| GET | `/:jobId/team-suggestions` | Business | AI team combinations |
| POST | `/:jobId/select-team` | Business | Hire a team |
| PUT | `/:jobId` | Business | Update job |
| DELETE | `/:jobId` | Business | Delete job + all applications |

### Tests — `/api/tests`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/generate` | Business | Generate AI test (replaces existing) |
| POST | `/generate-more` | Business | Generate AI questions for preview (not saved) |
| GET | `/:jobId` | Business | Fetch full test with correct answers |
| POST | `/:jobId/questions` | Business | Add a question manually |
| PUT | `/:jobId/questions/:qId` | Business | Edit a question |
| DELETE | `/:jobId/questions/:qId` | Business | Delete a question |
| GET | `/:jobId/student` | Student | Fetch test (correct answers stripped) |
| POST | `/:jobId/submit` | Student | Submit answers — real scoring |
| GET | `/:jobId/submissions` | Business | All submissions for a job |
| GET | `/:jobId/submissions/:userId` | Business | One student's detailed submission |
| GET | `/:jobId/rankings` | Business | Ranked submissions |

### AI (Legacy) — `/api/ai`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/generate-test` | Business | Generate AI test (legacy, syncs to Test collection) |
| GET | `/test/:jobId` | Student | Fetch test (legacy endpoint) |
| POST | `/test/submit` | Student | Submit test (legacy endpoint) |
| GET | `/rankings/:jobId` | Business | Hybrid AI rankings |

---

## Scoring Formula

```
Final Score = (Test Score × 0.7) + (Skill Match × 0.2) + (Profile Score × 0.1)

Test Score    = (correct answers / total questions) × 100
Skill Match   = (matched skills / required skills) × 100
Profile Score = completeness score (bio, skills, college, phone) — max 100
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Vite 5, @react-oauth/google |
| Backend | Node.js 18+, Express 5, JWT, bcrypt |
| Database | MongoDB, Mongoose 9 |
| AI | Google Gemini 1.5 Flash (REST, no SDK) |
| Email | Nodemailer — Gmail SMTP |
| Auth | JWT (7d expiry) + Google OAuth + Email OTP |
| Deployment | Render (single service, backend serves frontend build) |

---

## Environment Variables

### Backend — `backend/.env`

```env
MONGO_URI=mongodb+srv://<user>:<pass>@cluster.mongodb.net/localhire
JWT_SECRET=your_jwt_secret_here
GEMINI_API_KEY=your_gemini_api_key_here
EMAIL_USER=your_gmail@gmail.com
EMAIL_PASS=your_gmail_app_password
GOOGLE_CLIENT_ID=your_google_oauth_client_id
NODE_ENV=development
PORT=5000
```

### Frontend — `frontend/.env`

```env
VITE_API_URL=http://localhost:5000/api
VITE_GOOGLE_CLIENT_ID=your_google_oauth_client_id
```

> **Gmail setup:** Use an [App Password](https://support.google.com/accounts/answer/185833), not your regular Gmail password. Enable 2FA first.

---

## Local Development

### 1. Clone and install

```bash
git clone https://github.com/riturajarvind149/ojt-hyperlocal-marketplace.git
cd ojt-hyperlocal-marketplace

# Install backend dependencies
npm install --prefix backend

# Install frontend dependencies
npm install --prefix frontend
```

### 2. Configure environment

```bash
cp backend/.env.example backend/.env
# Fill in MONGO_URI, JWT_SECRET, GEMINI_API_KEY, EMAIL_USER, EMAIL_PASS, GOOGLE_CLIENT_ID

cp frontend/.env.example frontend/.env
# Fill in VITE_API_URL and VITE_GOOGLE_CLIENT_ID
```

### 3. Run in development

```bash
# Terminal 1 — Backend (http://localhost:5000)
cd backend
npm run dev

# Terminal 2 — Frontend (http://localhost:5173)
cd frontend
npm run dev
```

The Vite dev server proxies `/api` requests to `localhost:5000` automatically.

### 4. Build for production

```bash
# From repo root — installs all deps and builds React
npm run build

# Start the backend (serves frontend build from frontend/dist/)
npm start
```

---

## Deployment on Render

This project is configured for a **single Render web service** that serves both the API and the React frontend.

| Setting | Value |
|---------|-------|
| **Root Directory** | *(blank — repo root)* |
| **Build Command** | `npm run build` |
| **Start Command** | `npm start` |

Add all environment variables from the Backend section above in Render → Settings → Environment.

The build script (`npm run build`) installs backend and frontend dependencies, then builds the React app into `frontend/dist/`. The backend serves those static files in production.

---

## Key Design Decisions

**Test isolation** — Tests are stored in a dedicated `Test` collection (not embedded in Job), so questions can be managed independently. Submissions are stored in a `Submission` collection per user, preventing duplicate submissions and enabling detailed analytics.

**Email change security** — The OTP for email changes is sent to the *new* email address, not the old one. `user.email` is only updated after successful OTP verification. The old email is stored unchanged in `pendingEmail` until then.

**AI generation with retry** — The Gemini prompt includes the job title and required skills to generate role-specific questions. If fewer questions than requested are returned, the service retries up to 3 times with increasing temperature before falling back to a curated question bank.

**Backward compatibility** — The legacy `/api/ai/*` endpoints are kept intact. New test functionality lives at `/api/tests/*`. Both sync to the same `Job.aiTest` field so existing student-facing code continues to work.
