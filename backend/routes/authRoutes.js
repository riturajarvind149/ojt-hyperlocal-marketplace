const express = require("express");
const router = express.Router();

const {
  registerStudent,
  registerBusiness,
  login,
  getMe,
  updateMe,
  // ── New auth endpoints ──────────────────────────────────────────
  verifyEmail,
  resendVerification,
  forgotPassword,
  resetPassword,
  googleAuth,
  sendOtp,
  verifyOtp
} = require("../controllers/authController");

const {
  changePassword,
  sendPasswordOtp,
  verifyPasswordOtp,
  sendEmailOtp,
  verifyEmailOtp
} = require("../controllers/accountController");

const { verifyToken } = require("../middleware/authMiddleware");

// ── Existing routes (unchanged) ────────────────────────────────────
router.post("/register-student", registerStudent);
router.post("/register-business", registerBusiness);
router.post("/login", login);
router.get("/me", verifyToken, getMe);
router.put("/me", verifyToken, updateMe);

router.get("/protected", verifyToken, (req, res) => {
  res.json({
    message: "Protected route accessed",
    user: req.user
  });
});

// ── New auth routes ────────────────────────────────────────────────
router.post("/verify-email",        verifyEmail);
router.post("/resend-verification", resendVerification);
router.post("/forgot-password",     forgotPassword);
router.post("/reset-password",      resetPassword);
router.post("/google",              googleAuth);
router.post("/send-otp",            sendOtp);
router.post("/verify-otp",          verifyOtp);

// ── Account Settings routes (all require login) ────────────────────
router.post("/change-password",     verifyToken, changePassword);
router.post("/send-password-otp",   verifyToken, sendPasswordOtp);
router.post("/verify-password-otp", verifyToken, verifyPasswordOtp);
router.post("/send-email-otp",      verifyToken, sendEmailOtp);
router.post("/verify-email-otp",    verifyToken, verifyEmailOtp);

module.exports = router;
