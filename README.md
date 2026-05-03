# LocalHire — Hyperlocal Talent & Services Platform

A full-stack MERN application connecting students with local businesses for jobs and services.

## Project Structure

```
localhire/
├── backend/                  # Node.js + Express + MongoDB API
│   ├── controllers/          # Route handler logic
│   │   ├── authController.js
│   │   ├── jobController.js
│   │   └── aiController.js
│   ├── models/               # Mongoose schemas
│   │   ├── Student.js
│   │   ├── Business.js
│   │   ├── Job.js
│   │   ├── Application.js
│   │   └── Message.js
│   ├── routes/               # Express route definitions
│   │   ├── authRoutes.js
│   │   ├── jobRoutes.js
│   │   └── aiRoutes.js
│   ├── middleware/
│   │   └── authMiddleware.js # JWT verification
│   ├── utils/
│   │   ├── emailService.js   # Nodemailer email sending
│   │   └── simulatedHiring.js
│   ├── server.js             # Express app entry point
│   ├── package.json
│   └── .env.example          # Environment variable template
│
├── frontend/                 # React + Vite SPA
│   ├── src/
│   │   ├── App.jsx           # Main app component + all screens
│   │   ├── main.jsx          # React entry point + Google OAuth provider
│   │   └── styles.css        # Global styles
│   ├── index.html
│   ├── vite.config.js        # Vite config + API proxy
│   ├── package.json
│   └── .env.example          # Frontend environment variable template
│
├── .env                      # Backend secrets (not committed)
├── .gitignore
└── package.json              # Root scripts to run both
```

## Setup

### 1. Clone and install dependencies

```bash
git clone <repo-url>
cd localhire

# Install backend dependencies
cd backend && npm install && cd ..

# Install frontend dependencies
cd frontend && npm install && cd ..
```

### 2. Configure environment variables

```bash
# Backend
cp backend/.env.example .env
# Edit .env and fill in MONGO_URI, JWT_SECRET, EMAIL_USER, etc.

# Frontend
cp frontend/.env.example frontend/.env
# Edit frontend/.env and fill in VITE_GOOGLE_CLIENT_ID
```

### 3. Run in development

Open two terminals:

```bash
# Terminal 1 — Backend (runs on http://localhost:5000)
cd backend
npm run dev

# Terminal 2 — Frontend (runs on http://localhost:5173)
cd frontend
npm run dev
```

### 4. Build for production

```bash
cd frontend && npm run build
cd ../backend && npm start
```

The backend serves the built frontend from `frontend/dist/` in production.

## Tech Stack

| Layer    | Technology                          |
|----------|-------------------------------------|
| Frontend | React 18, Vite, @react-oauth/google |
| Backend  | Node.js, Express 5, JWT, bcrypt     |
| Database | MongoDB, Mongoose                   |
| Email    | Nodemailer (Gmail / Ethereal)       |
| AI       | Google Gemini API                   |
