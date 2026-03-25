const express = require("express");
const router = express.Router();

const { registerStudent, registerBusiness, login } = require("../controllers/authController");
const { verifyToken } = require("../middleware/authMiddleware");

// routes
router.post("/register-student", registerStudent);
router.post("/register-business", registerBusiness);
router.post("/login", login);

router.get("/protected", verifyToken, (req, res) => {
  res.json({
    message: "Protected route accessed",
    user: req.user
  });
});

module.exports = router;