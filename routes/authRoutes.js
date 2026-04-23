const express = require("express");
const router = express.Router();

const {
  registerStudent,
  registerBusiness,
  login,
  getMe,
  updateMe
} = require("../controllers/authController");
const { verifyToken } = require("../middleware/authMiddleware");

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

module.exports = router;

