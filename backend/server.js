const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
require("dotenv").config({ path: path.join(__dirname, ".env") });

// Guard: fail fast if critical env vars are missing
if (!process.env.MONGO_URI) {
  console.error("FATAL: MONGO_URI is not set in .env");
  process.exit(1);
}
if (!process.env.JWT_SECRET) {
  console.error("FATAL: JWT_SECRET is not set in .env");
  process.exit(1);
}

const authRoutes = require("./routes/authRoutes");
const jobRoutes  = require("./routes/jobRoutes");
const aiRoutes   = require("./routes/aiRoutes");

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// API Routes
app.use("/api/auth", authRoutes);
app.use("/api/jobs", jobRoutes);
app.use("/api/ai",   aiRoutes);

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", db: mongoose.connection.readyState === 1 ? "connected" : "disconnected" });
});

// ── Serve React frontend only if build exists (production) ──────
const clientBuild = path.join(__dirname, "../frontend/dist");
const indexHtml   = path.join(clientBuild, "index.html");

if (fs.existsSync(indexHtml)) {
  app.use(express.static(clientBuild));
  app.get("/{*splat}", (req, res) => {
    res.sendFile(indexHtml);
  });
} else {
  app.get("/", (req, res) => {
    res.send("LocalHire API is running. Start the React dev server with: cd frontend && npm run dev");
  });
}

// MongoDB Connection
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB Connected Successfully"))
  .catch((error) => {
    console.error("MongoDB Connection Failed:", error.message);
    process.exit(1);
  });

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`API available at http://localhost:${PORT}/api/health`);
});
